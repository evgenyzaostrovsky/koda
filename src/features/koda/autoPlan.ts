import type { Goal, GoalAction, PlannerItem } from './types';

export type AutoPlanSettings = { enabled: boolean; dailyMinutes: number; timezone: string; updatedAt: string; id: string };
export type AutoPlanAssignment = {
  id: string; goalId: string; actionId: string; title: string; estimatedMinutes: number;
  createdDate: string; createdAt: string; predecessorIds: string[];
};
export type AutoPlanCompletion = { id: string; assignmentId: string; done: boolean; date: string; at: string };
export type AutoPlanMove = { id: string; assignmentId: string; date: string; at: string };
export type AutoPlanBlock = { goalId: string; actionId: string; status: 'blocked'; reason: 'exceeds_daily_limit' | 'remaining_budget' | 'missing_estimate'; estimatedMinutes: number | null };
export type AutoPlanDay = { date: string; at: string; id: string; dailyMinutes: number; assignmentIds: string[]; blocked: AutoPlanBlock[] };
export type AutoPlanState = {
  version: 1; ownerId: string; settings: AutoPlanSettings; assignments: AutoPlanAssignment[];
  completions: AutoPlanCompletion[]; moves: AutoPlanMove[]; days: AutoPlanDay[];
};

const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const timestamp = (value: unknown): value is string => text(value) && Number.isFinite(Date.parse(value));
function validDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
function validTimezone(value: unknown): value is string {
  if (!text(value)) return false;
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(0); return true; } catch { return false; }
}
const validMinutes = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 1440;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(text);
const unique = (values: string[]) => [...new Set(values)].sort(compare);
function order(a: { at: string; id: string }, b: { at: string; id: string }) {
  return Date.parse(a.at) - Date.parse(b.at) || compare(a.id, b.id) || compare(JSON.stringify(a), JSON.stringify(b));
}
function union<T>(a: T[], b: T[], key: (item: T) => string, winner: (a: T, b: T) => T): T[] {
  const map = new Map<string, T>();
  for (const item of [...a, ...b]) { const old = map.get(key(item)); map.set(key(item), old ? winner(old, item) : item); }
  return [...map.values()].sort((a, b) => compare(key(a), key(b)));
}
const last = <T extends { at: string; id: string }>(a: T, b: T) => order(a, b) >= 0 ? a : b;
const first = <T extends { at: string; id: string }>(a: T, b: T) => order(a, b) <= 0 ? a : b;
function dayWinner(a: AutoPlanDay, b: AutoPlanDay) {
  // An empty proposal is not a committed work batch. It can be filled after
  // goals/settings arrive; once there is work, the first batch is sealed.
  if (!a.assignmentIds.length) return b.assignmentIds.length ? b : last(a, b);
  if (!b.assignmentIds.length) return a;
  return first(a, b);
}

export function autoPlanAssignmentId(ownerId: string, goalId: string, actionId: string) {
  return `autoplan:${[ownerId, goalId, actionId].map(encodeURIComponent).join(':')}`;
}

/** Reject foreign/malformed envelopes rather than silently importing partial history. */
export function parseAutoPlanState(value: unknown, ownerId?: string): AutoPlanState | undefined {
  if (!object(value) || value.version !== 1 || !text(value.ownerId) || (ownerId !== undefined && value.ownerId !== ownerId)) return undefined;
  const s = value.settings;
  if (!object(s) || typeof s.enabled !== 'boolean' || !validMinutes(s.dailyMinutes) || !validTimezone(s.timezone) || !timestamp(s.updatedAt) || !text(s.id)) return undefined;
  if (!Array.isArray(value.assignments) || !Array.isArray(value.days) || !Array.isArray(value.completions) || !Array.isArray(value.moves)) return undefined;
  if (!value.assignments.every(a => object(a) && text(a.goalId) && text(a.actionId) && a.id === autoPlanAssignmentId(value.ownerId as string, a.goalId, a.actionId)
    && typeof a.title === 'string' && validMinutes(a.estimatedMinutes) && validDate(a.createdDate) && timestamp(a.createdAt) && strings(a.predecessorIds))) return undefined;
  const ids = new Set(value.assignments.map(a => a.id));
  if (!value.completions.every(c => object(c) && text(c.id) && ids.has(c.assignmentId) && typeof c.done === 'boolean' && validDate(c.date) && timestamp(c.at))) return undefined;
  if (!value.moves.every(m => object(m) && text(m.id) && ids.has(m.assignmentId) && validDate(m.date) && timestamp(m.at))) return undefined;
  if (!value.days.every(d => object(d) && validDate(d.date) && text(d.id) && timestamp(d.at) && validMinutes(d.dailyMinutes) && strings(d.assignmentIds) && d.assignmentIds.every(id => ids.has(id))
    && Array.isArray(d.blocked) && d.blocked.every(b => object(b) && text(b.goalId) && text(b.actionId) && b.status === 'blocked'
      && ['exceeds_daily_limit', 'remaining_budget', 'missing_estimate'].includes(String(b.reason)) && (b.estimatedMinutes === null || (typeof b.estimatedMinutes === 'number' && Number.isFinite(b.estimatedMinutes) && b.estimatedMinutes > 0))))) return undefined;
  return canonical(value as unknown as AutoPlanState);
}

function canonical(state: AutoPlanState): AutoPlanState {
  return {
    version: 1, ownerId: state.ownerId, settings: { ...state.settings },
    assignments: union([], state.assignments.map(a => ({ ...a, predecessorIds: unique(a.predecessorIds) })), a => a.id, assignmentFirst),
    completions: union([], state.completions, c => c.id, last), moves: union([], state.moves, m => m.id, last),
    days: union([], state.days.map(d => ({ ...d, assignmentIds: unique(d.assignmentIds), blocked: [...d.blocked].sort((a, b) => compare(a.goalId, b.goalId) || compare(a.actionId, b.actionId)) })), d => d.date, dayWinner),
  };
}
function assignmentFirst(a: AutoPlanAssignment, b: AutoPlanAssignment) {
  return order({ at: a.createdAt, id: JSON.stringify(a) }, { at: b.createdAt, id: JSON.stringify(b) }) <= 0 ? a : b;
}

/** Operations merge separately from scheduling; a late carry-forward never undoes a checkmark. */
export function mergeAutoPlans(a?: AutoPlanState | null, b?: AutoPlanState | null): AutoPlanState | undefined {
  if (!a) return b ? canonical(b) : undefined;
  if (!b) return canonical(a);
  if (a.ownerId !== b.ownerId) throw new Error('Auto plan belongs to another account');
  const settings = order({ at: a.settings.updatedAt, id: a.settings.id }, { at: b.settings.updatedAt, id: b.settings.id }) || compare(JSON.stringify(a.settings), JSON.stringify(b.settings));
  return canonical({ version: 1, ownerId: a.ownerId, settings: settings >= 0 ? a.settings : b.settings,
    assignments: union(a.assignments, b.assignments, x => x.id, assignmentFirst),
    completions: union(a.completions, b.completions, x => x.id, last), moves: union(a.moves, b.moves, x => x.id, last),
    // A civil day is a single immutable batch. Concurrent proposals converge on
    // one batch; unselected proposal assignments remain inert, preserving history.
    days: union(a.days, b.days, x => x.date, dayWinner),
  });
}

export function configureAutoPlan(state: AutoPlanState | null | undefined, ownerId: string, settings: Partial<Pick<AutoPlanSettings, 'enabled' | 'dailyMinutes' | 'timezone'>>, at: string, operationId: string): AutoPlanState {
  if (!ownerId || (state && state.ownerId !== ownerId)) throw new Error('Auto plan belongs to another account');
  const next = { enabled: false, dailyMinutes: 120, timezone: 'UTC', ...state?.settings, ...settings, updatedAt: at, id: operationId };
  if (!validMinutes(next.dailyMinutes) || !validTimezone(next.timezone) || !timestamp(at) || !text(operationId) || typeof next.enabled !== 'boolean') throw new Error('Invalid auto plan settings');
  const base: AutoPlanState = state ?? { version: 1, ownerId, settings: next, assignments: [], completions: [], moves: [], days: [] };
  return mergeAutoPlans(base, { ...base, settings: next })!;
}

export function autoPlanCompletion(state: AutoPlanState, assignmentId: string): AutoPlanCompletion | undefined {
  return state.completions.filter(c => c.assignmentId === assignmentId).reduce<AutoPlanCompletion | undefined>((a, b) => a ? last(a, b) : b, undefined);
}
function admission(state: AutoPlanState, assignmentId: string) {
  return state.days.filter(d => d.assignmentIds.includes(assignmentId)).map(d => d.date).sort(compare)[0];
}
function latestMove(state: AutoPlanState, assignmentId: string) {
  return state.moves.filter(m => m.assignmentId === assignmentId).reduce<AutoPlanMove | undefined>((a, b) => a ? last(a, b) : b, undefined);
}
function visibleActions(goal: Goal) {
  const archived = new Set(goal.openWindow?.directions.filter(d => d.archivedAt).flatMap(d => d.actionIds) ?? []);
  const active = new Set(goal.openWindow?.directions.filter(d => !d.archivedAt).flatMap(d => d.actionIds) ?? []);
  return goal.actions.filter(a => !a.archivedAt && (!archived.has(a.id) || active.has(a.id))).sort((a, b) => a.position - b.position || compare(a.id, b.id));
}
function liveGoal(goal: Goal) { return goal.status === 'active' && goal.priority === 'main' && !goal.archivedAt; }
function assigned(state: AutoPlanState, goalId: string, actionId: string) {
  return state.assignments.find(a => a.goalId === goalId && a.actionId === actionId && admission(state, a.id));
}
function actionComplete(state: AutoPlanState, goal: Goal, actionId: string) {
  const assignment = assigned(state, goal.id, actionId);
  return assignment ? Boolean(autoPlanCompletion(state, assignment.id)?.done) : goal.actions.some(a => a.id === actionId && a.status === 'completed');
}
function predecessorsReady(state: AutoPlanState, goals: Goal[], assignment: AutoPlanAssignment, date: string) {
  const goal = goals.find(g => g.id === assignment.goalId);
  if (!goal) return false;
  const dependencies = goal.actions.find(a => a.id === assignment.actionId)?.dependsOn ?? [];
  return unique([...assignment.predecessorIds, ...dependencies]).every(id => {
    const previous = assigned(state, goal.id, id);
    if (!previous) return goal.actions.some(a => a.id === id && a.status === 'completed');
    const completion = autoPlanCompletion(state, previous.id);
    return completion?.done && completion.date < date;
  });
}
function plannedDate(state: AutoPlanState, assignment: AutoPlanAssignment, date: string) {
  return [admission(state, assignment.id) ?? assignment.createdDate, latestMove(state, assignment.id)?.date ?? '', date].sort(compare).at(-1)!;
}
function availableDate(action: GoalAction | undefined, date: string) {
  return [date, validDate(action?.dueDate) ? action.dueDate : '', validDate(action?.deferredUntil) ? action.deferredUntil : ''].sort(compare).at(-1)!;
}

export function recordAutoPlanCompletion(state: AutoPlanState, assignmentId: string, done: boolean, date: string, at: string, operationId: string): AutoPlanState {
  if (!state.assignments.some(a => a.id === assignmentId) || !admission(state, assignmentId)) throw new Error('Unknown auto plan assignment');
  if (!validDate(date) || !timestamp(at) || !text(operationId) || typeof done !== 'boolean') throw new Error('Invalid auto plan completion');
  if (state.completions.some(c => c.id === operationId)) return state;
  return canonical({ ...state, completions: [...state.completions, { id: operationId, assignmentId, done, date, at }] });
}
export function moveAutoPlanAssignment(state: AutoPlanState, assignmentId: string, date: string, at: string, operationId: string): AutoPlanState {
  if (!state.assignments.some(a => a.id === assignmentId) || !admission(state, assignmentId)) throw new Error('Unknown auto plan assignment');
  if (!validDate(date) || !timestamp(at) || !text(operationId)) throw new Error('Invalid auto plan date');
  if (state.moves.some(m => m.id === operationId)) return state;
  return canonical({ ...state, moves: [...state.moves, { id: operationId, assignmentId, date, at }] });
}

/** One sealed batch per local day. Reopening/retrying never replenishes its budget. */
export function advanceAutoPlan(state: AutoPlanState, goals: Goal[], plannerItems: PlannerItem[], date: string, at: string): AutoPlanState {
  if (!validDate(date) || !timestamp(at)) throw new Error('Invalid auto plan day');
  const existingDay = state.days.find(d => d.date === date);
  if (!state.settings.enabled || existingDay?.assignmentIds.length || state.days.some(d => d.date > date)) return state;
  let remaining = state.settings.dailyMinutes;
  let hasDueCarry = false;
  const ids: string[] = [], blocked: AutoPlanBlock[] = [], additions: AutoPlanAssignment[] = [];
  const eligibleGoals = goals.filter(liveGoal).sort((a, b) => compare(a.createdAt, b.createdAt) || compare(a.id, b.id));
  // Carry work reserves the budget before new work from any other goal.
  for (const goal of eligibleGoals) {
    const actions = visibleActions(goal);
    const pending = actions.map(action => assigned(state, goal.id, action.id)).find(a => a && !autoPlanCompletion(state, a.id)?.done);
    if (pending && predecessorsReady(state, goals, pending, date) && availableDate(actions.find(a => a.id === pending.actionId), plannedDate(state, pending, date)) === date) {
      hasDueCarry = true;
      if (pending.estimatedMinutes <= remaining) {
        ids.push(pending.id); remaining -= pending.estimatedMinutes;
      } else {
        blocked.push({ goalId: pending.goalId, actionId: pending.actionId, status: 'blocked',
          reason: pending.estimatedMinutes > state.settings.dailyMinutes ? 'exceeds_daily_limit' : 'remaining_budget', estimatedMinutes: pending.estimatedMinutes });
      }
    }
  }
  for (const goal of hasDueCarry ? [] : eligibleGoals) {
    const actions = visibleActions(goal);
    const action = actions.find(a => !actionComplete(state, goal, a.id));
    if (!action || assigned(state, goal.id, action.id)) continue;
    const preceding = actions.slice(0, actions.indexOf(action));
    const predecessorIds = unique([...preceding.map(a => a.id), ...(action.dependsOn ?? [])]);
    if (predecessorIds.some(id => !actionComplete(state, goal, id))) continue;
    if (state.assignments.some(a => a.goalId === goal.id && admission(state, a.id) && autoPlanCompletion(state, a.id)?.date === date)) continue;
    if (predecessorIds.some(id => { const a = assigned(state, goal.id, id); const c = a && autoPlanCompletion(state, a.id); return c && (!c.done || c.date >= date); })) continue;
    if ((validDate(action.dueDate) && action.dueDate > date) || (validDate(action.deferredUntil) && action.deferredUntil > date)) continue;
    if (plannerItems.some(p => !p.deletedAt && p.date === date && p.goalId === goal.id && (p.goalActionId === action.id || (p.sourceType === 'goal' && p.sourceId === action.id)))) continue;
    // Match the existing day-plan estimate for actions without a duration.
    const minutes = typeof action.estimatedMinutes === 'number' && Number.isFinite(action.estimatedMinutes) && action.estimatedMinutes > 0 ? Math.ceil(action.estimatedMinutes) : 20;
    if (minutes > remaining) {
      blocked.push({ goalId: goal.id, actionId: action.id, status: 'blocked', reason: minutes > state.settings.dailyMinutes ? 'exceeds_daily_limit' : 'remaining_budget', estimatedMinutes: minutes }); continue;
    }
    const id = autoPlanAssignmentId(state.ownerId, goal.id, action.id);
    additions.push({ id, goalId: goal.id, actionId: action.id, title: action.shortTitle || action.title, estimatedMinutes: minutes, createdDate: date, createdAt: at, predecessorIds });
    ids.push(id); remaining -= minutes;
  }
  if (existingDay && !ids.length && existingDay.dailyMinutes === state.settings.dailyMinutes && JSON.stringify(existingDay.blocked) === JSON.stringify(blocked)) return state;
  return canonical({ ...state, assignments: union(state.assignments, additions, a => a.id, assignmentFirst), days: [...state.days.filter(d => d.date !== date), {
    date, at, id: `autoplan-day:${encodeURIComponent(state.ownerId)}:${date}:${state.settings.id}`, dailyMinutes: state.settings.dailyMinutes, assignmentIds: ids, blocked,
  }] });
}

/** Calendar uses these projections directly; never persist them as planner_events. */
export function buildAutoPlanItems(state: AutoPlanState | null | undefined, goals: Goal[], date: string): PlannerItem[] {
  if (!state || !validDate(date)) return [];
  const projected = state.assignments.flatMap(assignment => {
    const admitted = admission(state, assignment.id);
    if (!admitted || admitted > date) return [];
    const completion = autoPlanCompletion(state, assignment.id);
    const goal = goals.find(g => g.id === assignment.goalId);
    const action = goal?.actions.find(a => a.id === assignment.actionId);
    const done = Boolean(completion?.done);
    if (!done && (!goal || !liveGoal(goal) || !visibleActions(goal).some(a => a.id === assignment.actionId) || !predecessorsReady(state, goals, assignment, date))) return [];
    return [{ id: assignment.id, date: done ? completion!.date : availableDate(action, plannedDate(state, assignment, date)), time: '',
      title: action?.title || assignment.title, description: action?.description, goalTitle: goal?.title, done, sourceType: 'goal' as const, goalId: assignment.goalId,
      goalActionId: assignment.actionId, milestoneId: action?.milestoneId, ownerId: state.ownerId, sourceId: assignment.id,
      updatedAt: completion?.at ?? latestMove(state, assignment.id)?.at ?? assignment.createdAt }];
  });
  // Loading an account may render before its next-day write finishes. Compute
  // the same capped selection without persisting or exposing new assignments.
  const day = state.days.find(d => d.date === date)
    ?? advanceAutoPlan(state, goals, [], date, `${date}T00:00:00.000Z`).days.find(d => d.date === date);
  const selectedToday = new Set<string>();
  let reserved = 0;
  for (const id of day?.assignmentIds ?? []) {
    const assignment = state.assignments.find(a => a.id === id);
    if (assignment && reserved + assignment.estimatedMinutes <= day!.dailyMinutes) {
      selectedToday.add(id); reserved += assignment.estimatedMinutes;
    }
  }
  // A sealed batch keeps its original budget for that day, including work
  // finished or moved after scheduling. All other work waits until tomorrow.
  // Future dates are a queue projection, packed within the current limit;
  // only advanceAutoPlan commits the actual batch when that day arrives.
  const futureMinutes = new Map<string, number>();
  for (const item of projected.sort((a, b) => compare(a.date, b.date) || compare(a.id, b.id))) {
    if (item.done || (item.date === date && selectedToday.has(item.id))) continue;
    const assignment = state.assignments.find(a => a.id === item.id)!;
    if (assignment.estimatedMinutes > state.settings.dailyMinutes) { item.date = ''; continue; }
    let next = item.date > date ? item.date : nextDate(date);
    while ((futureMinutes.get(next) ?? 0) + assignment.estimatedMinutes > state.settings.dailyMinutes) next = nextDate(next);
    futureMinutes.set(next, (futureMinutes.get(next) ?? 0) + assignment.estimatedMinutes);
    item.date = next;
  }
  return projected.sort((a, b) => compare(a.date, b.date) || compare(a.id, b.id));
}

function nextDate(date: string) {
  const next = new Date(`${date}T12:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

/** Goal metadata/status alone cannot complete an assigned action. */
export function applyAutoPlanProgress(state: AutoPlanState | null | undefined, goals: Goal[]): Goal[] {
  if (!state) return goals;
  return goals.map(goal => {
    let changed = false;
    const actions = goal.actions.map((action): GoalAction => {
      const assignment = assigned(state, goal.id, action.id);
      if (!assignment) return action;
      const completion = autoPlanCompletion(state, assignment.id);
      const status = completion?.done ? 'completed' : 'pending';
      const completedAt = completion?.done ? completion.at : null;
      if (action.status === status && action.completedAt === completedAt) return action;
      changed = true; return { ...action, status, completedAt };
    });
    return changed ? { ...goal, actions } : goal;
  });
}
