import type { Goal } from './types';

type Context = { goalId: string; title: string; desiredResult: string; planningContext: string };
type Stamp = { id: string; clock: number; at: string };
export type RoadmapClarificationEdit = Stamp & {
  questionId: string;
  context: Context;
  question: string;
  answer: string;
  deleted?: boolean;
};
export type RoadmapClarifications = {
  version: 1;
  edits: RoadmapClarificationEdit[];
  clears: (Stamp & { contextKey: string })[];
};
export type ActiveRoadmapClarification = {
  id: string; question: string; answer: string;
  /** Earlier/concurrent values remain in storage; expose them for recovery. */
  previousAnswers: string[];
};

const contextOf = (goal: Goal): Context => ({ goalId: goal.id, title: goal.title.trim(), desiredResult: goal.desiredResult.trim(), planningContext: goal.planningContext ?? '' });
// Supplementing planning context or changing planning mode/time does not invalidate facts.
const contextKey = (context: Context) => JSON.stringify([context.goalId, context.title, context.desiredResult]);
const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const compare = (a: Stamp, b: Stamp) => a.clock - b.clock || lexical(a.at, b.at) || lexical(a.id, b.id);
const empty = (): RoadmapClarifications => ({ version: 1, edits: [], clears: [] });
const maximum = <T>(items: T[], value: (item: T) => number) => items.reduce((max, item) => Math.max(max, value(item)), 0);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const isStamp = (value: Record<string, unknown>) => typeof value.id === 'string' && Boolean(value.id) && Number.isSafeInteger(value.clock) && Number(value.clock) > 0 && typeof value.at === 'string' && Number.isFinite(Date.parse(value.at));
function unique<T extends Stamp>(items: T[]): T[] {
  const result = new Map<string, T>();
  for (const item of items) {
    const prior = result.get(item.id);
    if (!prior || JSON.stringify(item) > JSON.stringify(prior)) result.set(item.id, item);
  }
  return [...result.values()].sort(compare);
}

/** Keep a small recovery window, plus durable deletion watermarks. Old snapshots
 * cannot restore versions below these retained watermarks. */
function compact(state: RoadmapClarifications): RoadmapClarifications {
  const clears = new Map<string, RoadmapClarifications['clears'][number]>();
  for (const clear of unique(state.clears)) clears.set(clear.contextKey, clear);
  const groups = new Map<string, RoadmapClarificationEdit[]>();
  for (const edit of unique(state.edits)) {
    if (edit.clock <= (clears.get(contextKey(edit.context))?.clock ?? 0)) continue;
    const key = JSON.stringify([contextKey(edit.context), edit.questionId]);
    groups.set(key, [...(groups.get(key) ?? []), edit]);
  }
  const edits = [...groups.values()].flatMap(items => {
    const deleted = items.filter(item => item.deleted).at(-1);
    const live = items.filter(item => !item.deleted && item.clock > (deleted?.clock ?? 0)).slice(-8);
    return deleted ? [deleted, ...live] : live;
  });
  return { version: 1, edits: edits.sort(compare), clears: [...clears.values()].sort(compare) };
}

export function normalizeRoadmapClarifications(value: unknown): RoadmapClarifications | undefined {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.edits) || !Array.isArray(value.clears)) return undefined;
  const edits: RoadmapClarificationEdit[] = [];
  for (const item of value.edits) {
    if (!isRecord(item) || !isStamp(item) || typeof item.questionId !== 'string' || !item.questionId || typeof item.question !== 'string' || !item.question.trim() || typeof item.answer !== 'string') continue;
    const c = item.context;
    if (!isRecord(c) || !['goalId', 'title', 'desiredResult', 'planningContext'].every(key => typeof c[key] === 'string')) continue;
    edits.push({ id: item.id as string, clock: item.clock as number, at: item.at as string, questionId: item.questionId,
      context: { goalId: c.goalId as string, title: c.title as string, desiredResult: c.desiredResult as string, planningContext: c.planningContext as string },
      question: item.question.slice(0, 180), answer: item.answer.slice(0, 400), ...(item.deleted === true ? { deleted: true } : {}) });
  }
  const clears = value.clears.filter((item): item is RoadmapClarifications['clears'][number] => isRecord(item) && isStamp(item) && typeof item.contextKey === 'string')
    .map(({ id, clock, at, contextKey }) => ({ id, clock, at, contextKey }));
  return compact({ version: 1, edits, clears });
}

export function mergeRoadmapClarifications(a: unknown, b: unknown): RoadmapClarifications | undefined {
  const first = normalizeRoadmapClarifications(a), second = normalizeRoadmapClarifications(b);
  if (!first) return second;
  if (!second) return first;
  return compact({ version: 1, edits: [...first.edits, ...second.edits], clears: [...first.clears, ...second.clears] });
}

export function getActiveRoadmapClarifications(goal: Goal): ActiveRoadmapClarification[] {
  const state = normalizeRoadmapClarifications(goal.roadmapClarifications) ?? empty();
  const key = contextKey(contextOf(goal));
  const clearClock = maximum(state.clears.filter(clear => clear.contextKey === key), clear => clear.clock);
  const groups = new Map<string, RoadmapClarificationEdit[]>();
  for (const edit of state.edits) {
    if (contextKey(edit.context) !== key || edit.clock <= clearClock) continue;
    groups.set(edit.questionId, [...(groups.get(edit.questionId) ?? []), edit]);
  }
  // Concurrent batches can exceed the local limit. Keep every pair in storage,
  // and consistently expose the eight most recently edited pairs to the model/UI.
  return [...groups].filter(([, edits]) => edits.some(edit => !edit.deleted && edit.clock > maximum(edits.filter(item => item.deleted), item => item.clock)))
    .sort(([a, aa], [b, bb]) => compare(bb.at(-1)!, aa.at(-1)!) || lexical(a, b)).slice(0, 8)
    .sort(([a], [b]) => lexical(a, b)).flatMap(([id, edits]) => {
    // A concurrent delete wins a tie; a subsequent intentional edit uses a higher clock.
    const deleteClock = maximum(edits.filter(edit => edit.deleted), edit => edit.clock);
    const live = edits.filter(edit => !edit.deleted && edit.clock > deleteClock).sort(compare);
    const latest = live.at(-1);
    return latest ? [{ id, question: latest.question, answer: latest.answer,
      previousAnswers: [...new Set(live.slice(0, -1).map(edit => edit.answer).filter(answer => answer !== latest.answer))] }] : [];
  });
}

function stamp(state: RoadmapClarifications, now: string, operation: unknown): Stamp {
  const clock = Math.max(maximum(state.edits, edit => edit.clock), maximum(state.clears, clear => clear.clock)) + 1;
  // Stable content identity makes functional React updaters replayable. Distinct
  // concurrent values still produce distinct operations even at equal timestamps.
  const source = JSON.stringify([clock, now, operation]);
  const hash = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  for (let index = 0; index < source.length; index++) for (let part = 0; part < hash.length; part++) hash[part] = Math.imul(hash[part] ^ source.charCodeAt(index), 0x01000193 + part * 2);
  const id = hash.map(value => (value >>> 0).toString(16).padStart(8, '0')).join('');
  return { id, clock, at: now };
}
function withState(goal: Goal, state: RoadmapClarifications, now: string): Goal {
  return { ...goal, roadmapClarifications: compact(state), updatedAt: now };
}

/** Stores empty raw answers, never the request-only fallback “не знаю”. */
export function upsertRoadmapQuestions(goal: Goal, questions: string[], now = new Date().toISOString()): Goal {
  let result = goal;
  for (const rawQuestion of questions) {
    const question = rawQuestion.trim().slice(0, 180);
    if (!question) continue;
    const context = contextOf(goal);
    const questionId = JSON.stringify([contextKey(context), question]);
    if (getActiveRoadmapClarifications(result).some(item => item.id === questionId)) continue;
    if (getActiveRoadmapClarifications(result).length >= 8) break;
    const state = normalizeRoadmapClarifications(result.roadmapClarifications) ?? empty();
    result = withState(result, { ...state, edits: [...state.edits, { ...stamp(state, now, ['question', questionId]), questionId, context, question, answer: '' }] }, now);
  }
  return result;
}

export function updateRoadmapAnswer(goal: Goal, id: string, answer: string, now = new Date().toISOString()): Goal {
  answer = answer.slice(0, 400);
  const item = getActiveRoadmapClarifications(goal).find(item => item.id === id);
  if (!item || item.answer === answer) return goal;
  const state = normalizeRoadmapClarifications(goal.roadmapClarifications) ?? empty();
  return withState(goal, { ...state, edits: [...state.edits, { ...stamp(state, now, ['answer', id, answer]), questionId: id, context: contextOf(goal), question: item.question, answer }] }, now);
}

export function removeRoadmapClarification(goal: Goal, id: string, now = new Date().toISOString()): Goal {
  const item = getActiveRoadmapClarifications(goal).find(item => item.id === id);
  if (!item) return goal;
  const state = normalizeRoadmapClarifications(goal.roadmapClarifications) ?? empty();
  return withState(goal, { ...state, edits: [...state.edits, { ...stamp(state, now, ['delete', id]), questionId: id, context: contextOf(goal), question: item.question, answer: '', deleted: true }] }, now);
}

export function clearRoadmapClarifications(goal: Goal, now = new Date().toISOString()): Goal {
  const state = normalizeRoadmapClarifications(goal.roadmapClarifications) ?? empty();
  return withState(goal, { ...state, clears: [...state.clears, { ...stamp(state, now, ['clear', contextKey(contextOf(goal))]), contextKey: contextKey(contextOf(goal)) }] }, now);
}

export function getRoadmapRequestClarifications(goal: Goal): { question: string; answer: string }[] {
  return getActiveRoadmapClarifications(goal).map(({ question, answer }) => ({ question, answer: answer.trim() || 'не знаю' }));
}
