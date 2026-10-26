import { isRoutineScheduled } from './routineSchedule';
import type { Goal, GoalPriority, GoalRoutine, PlannerItem } from './types';

/** Version 3 distinguishes the new formula from already persisted legacy v2 scores. */
export const DAY_PLAN_SCORE_VERSION = 3;
export const PLAN_PRIORITY_WEIGHTS: Readonly<Record<GoalPriority, number>> = Object.freeze({ main: 3, important: 2, supporting: 1 });
export type PlanMetric = 'binary' | 'count' | 'minutes' | 'subtasks';
export type PlanCategory = 'goal' | 'planner';
export type PlanSource = Readonly<{
  kind: 'action' | 'routine' | 'planner';
  id: string;
  goalId?: string;
  plannerId?: string;
}>;
export type DayPlanItem = Readonly<{
  sourceKey: string;
  /** Identity of the original work; duplicate representations share this budget. */
  budgetKey: string;
  title: string;
  category: PlanCategory;
  goalId?: string;
  goalTitle?: string;
  priority?: GoalPriority;
  metric: PlanMetric;
  targetValue: number;
  /** Required when representing a split: quantity of the original root work. */
  rootTargetValue?: number;
  estimatedMinutes: number;
  source: PlanSource;
  /** Frozen identities, not the mutable number of remaining subtasks. */
  subtaskIds?: readonly string[];
  dueDate?: string;
  explanation?: string;
}>;
export type DayMinimum = Readonly<{ sourceKey: string; targetValue: number; label: string }>;
export type DayPlanProposal = Readonly<{
  date: string;
  items: readonly DayPlanItem[];
  minimum: DayMinimum | null;
  availableMinutes: number;
  reserveRatio: number;
}>;
export type DayPlanVersion = Readonly<{
  id: string;
  parentVersionId: string | null;
  revision: number;
  acceptedAt: string;
  reason: string;
  /** Causal acknowledgement of observed leaves, not a blanket dismissal of future forks. */
  resolvesVersionIds?: readonly string[];
  items: readonly (DayPlanItem & { readonly weight: number })[];
  minimum: DayMinimum | null;
  availableMinutes: number;
  plannedMinutes: number;
  reserveRatio: number;
  categoryWeights: Readonly<{ goals: number; planner: number }>;
}>;
export type PlanProgressEvent = Readonly<{
  id: string;
  versionId: string;
  sourceKey: string;
  budgetKey: string;
  value: number;
  at: string;
  /** All previously observed facts for this work. Concurrent values never sum. */
  supersedes: readonly string[];
}>;
export type DayPlanState = Readonly<{
  schemaVersion: 1;
  scoreVersion: 3;
  date: string;
  ownerId: string | null;
  versions: readonly DayPlanVersion[];
  originalVersionId: string;
  currentVersionId: string;
  progress: readonly PlanProgressEvent[];
}>;
export type PlanOperationOptions = { versionId?: string; at?: string; ownerId?: string | null };
export type SuggestDayPlanOptions = {
  availableMinutes?: number;
  reserveRatio?: number;
  maxItems?: number;
  maxActionsPerGoal?: number;
  defaultTaskMinutes?: number;
  /** Upper bound for a suggested timed session; compatibility previews can explicitly raise it. */
  maxRoutineMinutes?: number;
  ownerId?: string | null;
};
export type PlanItemScore = DayPlanVersion['items'][number] & { currentValue: number; completionRatio: number; points: number };
export type PlanScoreResult = {
  scoreVersion: 3;
  /** Headline stays anchored to the original commitment; explicit versionId selects another snapshot. */
  totalScore: number | null;
  originalScore: number | null;
  currentScore: number | null;
  goalScore: number | null;
  plannerScore: number;
  items: PlanItemScore[];
  minimumCompleted: boolean;
  revisionCount: number;
  hasConflicts: boolean;
  conflictingVersionIds: string[];
  originalVersionId: string | null;
  currentVersionId: string | null;
  plannedMinutes: number;
  completedCount: number;
  totalCount: number;
};

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, finite(value)));

export function goalActionSourceKey(goalId: string, actionId: string) { return `goal:${goalId}:action:${actionId}`; }
export function goalRoutineSourceKey(goalId: string, routineId: string, date: string) { return `goal:${goalId}:routine:${routineId}:${date}`; }
export function plannerSourceKey(item: PlannerItem) {
  if (item.goalId && item.goalActionId) return goalActionSourceKey(item.goalId, item.goalActionId);
  if (item.sourceType === 'project' && item.sourceId) return `project:${item.sourceId}`;
  if (item.sourceType === 'recurring' && item.sourceId) return `recurring:${item.sourceId}:${item.date}`;
  return `planner:${item.id}`;
}

/** Weekly means one anchored weekday; monthly clamps a late start day to month's end. */
export function isPlanRoutineDue(routine: GoalRoutine, date: string): boolean {
  return isRoutineScheduled(routine, date);
}

export function suggestDayPlan(goals: readonly Goal[], plannerItems: readonly PlannerItem[], date: string, options: SuggestDayPlanOptions = {}): DayPlanProposal {
  assertDate(date);
  const availableMinutes = Math.max(0, finite(options.availableMinutes ?? 120, 120));
  const reserveRatio = clamp(options.reserveRatio ?? 0.2, 0.1, 0.8);
  const capacity = availableMinutes * (1 - reserveRatio);
  const maxRoutineMinutes = Math.max(0, finite(options.maxRoutineMinutes ?? 45, 45));
  const defaultMinutes = Math.max(1, finite(options.defaultTaskMinutes ?? 20, 20));
  const maxItems = Math.max(0, Math.floor(finite(options.maxItems ?? 6, 6)));
  const maxPerGoal = Math.max(1, Math.floor(finite(options.maxActionsPerGoal ?? 2, 2)));
  const candidates: DayPlanItem[] = [];
  const activeGoals = goals.filter(goal => goal.status === 'active');
  for (const goal of activeGoals) {
    for (const action of goal.actions) {
      if (action.status !== 'pending' || !isActionAvailable(goal, action.id, date) || (action.dueDate && action.dueDate > date)) continue;
      const sourceKey = goalActionSourceKey(goal.id, action.id);
      candidates.push({ sourceKey, budgetKey: sourceKey, category: 'goal', goalId: goal.id, goalTitle: goal.title,
        priority: goal.priority, title: action.title, metric: 'binary', targetValue: 1,
        estimatedMinutes: Math.max(1, finite(action.estimatedMinutes ?? defaultMinutes, defaultMinutes)),
        dueDate: action.dueDate || goal.deadline, source: { kind: 'action', id: action.id, goalId: goal.id },
        explanation: action.dueDate && action.dueDate <= date ? 'Подошёл срок действия' : 'Следующий шаг выбранной цели' });
    }
    for (const routine of goal.routines) {
      if (!isPlanRoutineDue(routine, date) || isArchivedMatrixWork(goal, routine.id, 'routineIds')) continue;
      const sourceKey = goalRoutineSourceKey(goal.id, routine.id, date);
      const configuredTarget = routine.metricType === 'boolean' ? 1 : Math.max(1, finite(routine.targetValue, 1));
      const targetValue = routine.metricType === 'minutes'
        ? Math.min(configuredTarget, maxRoutineMinutes, Math.floor(capacity * 0.5)) : configuredTarget;
      if (targetValue < 1) continue;
      candidates.push({ sourceKey, budgetKey: sourceKey, category: 'goal', goalId: goal.id, goalTitle: goal.title,
        priority: goal.priority, title: routine.title, metric: routine.metricType === 'boolean' ? 'binary' : routine.metricType,
        targetValue, estimatedMinutes: routine.metricType === 'minutes' ? targetValue : defaultMinutes,
        dueDate: date, source: { kind: 'routine', id: routine.id, goalId: goal.id },
        explanation: targetValue < configuredTarget ? `Посильная часть регулярного действия: ${targetValue} из ${configuredTarget} мин` : 'Регулярное действие на сегодня' });
    }
  }
  for (const item of plannerItems) {
    if (item.date !== date || item.deletedAt) continue;
    const sourceKey = plannerSourceKey(item);
    if (candidates.some(candidate => candidate.sourceKey === sourceKey)) continue;
    const linkedGoal = item.goalId ? activeGoals.find(goal => goal.id === item.goalId) : undefined;
    // A linked action has one work identity even if its planner representation is duplicated.
    if (item.goalActionId && !linkedGoal) continue;
    const linkedAction = linkedGoal?.actions.find(action => action.id === item.goalActionId);
    if (linkedGoal && item.goalActionId && !isActionAvailable(linkedGoal, item.goalActionId, date)) continue;
    if (linkedAction?.dueDate && linkedAction.dueDate > date) continue;
    if (linkedAction?.status === 'completed' && completionLocalDate(linkedAction.completedAt) !== date) continue;
    const subtaskIds = [...new Set((item.subtasks ?? []).map(task => task.id))].sort(compareText);
    candidates.push({ sourceKey, budgetKey: sourceKey, category: linkedGoal ? 'goal' : 'planner',
      ...(linkedGoal ? { goalId: linkedGoal.id, goalTitle: linkedGoal.title, priority: linkedGoal.priority } : {}),
      title: item.title, metric: subtaskIds.length ? 'subtasks' : 'binary', targetValue: subtaskIds.length || 1,
      subtaskIds, estimatedMinutes: defaultMinutes, dueDate: item.date,
      source: { kind: 'planner', id: item.id, plannerId: item.id, ...(linkedGoal ? { goalId: linkedGoal.id } : {}) },
      explanation: 'Дело запланировано на сегодня' });
  }
  const sorted = canonicalItems(candidates).sort((a, b) =>
    compareText(a.dueDate || '9999', b.dueDate || '9999') ||
    ((b.priority ? PLAN_PRIORITY_WEIGHTS[b.priority] : 0) - (a.priority ? PLAN_PRIORITY_WEIGHTS[a.priority] : 0)) || compareText(a.sourceKey, b.sourceKey));
  const selected: DayPlanItem[] = [];
  const goalCounts = new Map<string, number>();
  let used = 0;
  const add = (item: DayPlanItem) => {
    if (selected.length >= maxItems || used + item.estimatedMinutes > capacity || selected.some(existing => existing.budgetKey === item.budgetKey)) return;
    if (item.goalId && (goalCounts.get(item.goalId) ?? 0) >= maxPerGoal) return;
    selected.push(item);
    used += item.estimatedMinutes;
    if (item.goalId) goalCounts.set(item.goalId, (goalCounts.get(item.goalId) ?? 0) + 1);
  };
  // Make room for both real commitments and an important goal, then fill spare capacity.
  const goalCandidate = sorted.filter(item => item.category === 'goal')
    .sort((a,b) => PLAN_PRIORITY_WEIGHTS[b.priority ?? 'important'] - PLAN_PRIORITY_WEIGHTS[a.priority ?? 'important'] || compareText(a.dueDate || '9999', b.dueDate || '9999') || compareText(a.sourceKey,b.sourceKey))
    .find(item => item.estimatedMinutes <= capacity);
  const plannerCandidate = sorted.find(item => item.category === 'planner' && item.estimatedMinutes <= capacity);
  if (goalCandidate) add(goalCandidate);
  if (plannerCandidate) add(plannerCandidate);
  for (const item of sorted) add(item);
  const minimumItem = selected.find(item => item.category === 'goal') ?? selected[0];
  const minimum = minimumItem ? {
    sourceKey: minimumItem.sourceKey,
    targetValue: minimumItem.metric === 'minutes' ? Math.min(10, minimumItem.targetValue) : minimumItem.metric === 'binary' ? 1 : Math.min(1, minimumItem.targetValue),
    label: minimumItem.title,
  } : null;
  return { date, items: selected, minimum, availableMinutes, reserveRatio };
}

function isArchivedMatrixWork(goal: Goal, id: string, key: 'actionIds' | 'routineIds'): boolean {
  const directions = goal.openWindow?.directions.filter(direction => direction[key].includes(id)) ?? [];
  return directions.length > 0 && directions.every(direction => Boolean(direction.archivedAt));
}
function isActionAvailable(goal: Goal, actionId: string, date: string): boolean {
  const action = goal.actions.find(candidate => candidate.id === actionId);
  return Boolean(action && !action.archivedAt && (!action.deferredUntil || action.deferredUntil <= date) &&
    !isArchivedMatrixWork(goal, actionId, 'actionIds') &&
    (action.dependsOn ?? []).every(id => goal.actions.some(dependency => dependency.id === id && dependency.status === 'completed')));
}

export function acceptDayPlan(proposal: DayPlanProposal, options: PlanOperationOptions = {}): DayPlanState {
  assertDate(proposal.date);
  const version = makeVersion(proposal, null, '', options);
  return freezePlan({ schemaVersion: 1, scoreVersion: DAY_PLAN_SCORE_VERSION, date: proposal.date, ownerId: options.ownerId ?? null,
    versions: [version], originalVersionId: version.id, currentVersionId: version.id, progress: [] });
}

export function reviseDayPlan(state: DayPlanState, proposal: DayPlanProposal, reason: string, options: PlanOperationOptions = {}): DayPlanState {
  if (proposal.date !== state.date) throw new Error('A revision must belong to the same day');
  if (!reason.trim()) throw new Error('A revision needs a reason');
  if (options.ownerId !== undefined && options.ownerId !== state.ownerId) throw new Error('Plan account mismatch');
  if (options.versionId && state.versions.some(version => version.id === options.versionId)) return state;
  const version = makeVersion(proposal, getCurrentPlanVersion(state), reason.trim(), options);
  // Work cannot change its physical unit across versions: otherwise old facts could change meaning.
  for (const item of version.items) {
    const old = state.versions.flatMap(previous => previous.items).find(previous => previous.budgetKey === item.budgetKey);
    if (old && (old.metric !== item.metric || old.category !== item.category || old.goalId !== item.goalId)) throw new Error('A work identity cannot change metric or category');
  }
  return freezePlan({ ...state, versions: [...state.versions, version], currentVersionId: version.id });
}

export function getCurrentPlanVersion(state: DayPlanState): DayPlanVersion {
  const version = state.versions.find(item => item.id === state.currentVersionId);
  if (!version) throw new Error('Current plan version is missing');
  return version;
}

/** Resolve only the leaves visible to this device. Both the decision and all old versions persist. */
export function resolveDayPlanConflict(state: DayPlanState, selectedVersionId: string, options: PlanOperationOptions = {}): DayPlanState {
  if (options.ownerId !== undefined && options.ownerId !== state.ownerId) throw new Error('Plan account mismatch');
  const selected = state.versions.find(version => version.id === selectedVersionId);
  if (!selected) throw new Error('Selected plan version is missing');
  const duplicate = options.versionId ? state.versions.find(version => version.id === options.versionId) : undefined;
  if (duplicate) {
    if (duplicate.parentVersionId !== selectedVersionId || !duplicate.resolvesVersionIds?.length) throw new Error('Resolution identifier was reused');
    return state;
  }
  const leaves = planVersionLeaves(state.versions);
  if (leaves.length <= 1 && (state.currentVersionId === selectedVersionId ||
    (getCurrentPlanVersion(state).parentVersionId === selectedVersionId && getCurrentPlanVersion(state).resolvesVersionIds?.length))) return state;
  const resolution: DayPlanVersion = { ...selected, id: options.versionId ?? newId(), parentVersionId: selected.id,
    revision: Math.max(selected.revision, ...leaves.map(version => version.revision)) + 1,
    acceptedAt: timestamp(options.at), reason: 'Выбран план при разрешении конфликта',
    resolvesVersionIds: leaves.map(version => version.id).sort(compareText) };
  return freezePlan({ ...state, versions: [...state.versions, resolution].sort(compareVersions), currentVersionId: resolution.id });
}

export function recordPlanProgress(state: DayPlanState, sourceKey: string, value: number, eventId: string,
  options: { versionId?: string; at?: string } = {}): DayPlanState {
  if (!eventId.trim()) throw new Error('A progress event needs a stable id');
  if (!Number.isFinite(value) || value < 0) throw new Error('Progress must be a finite non-negative absolute value');
  const duplicate = state.progress.find(event => event.id === eventId);
  if (duplicate) {
    if (duplicate.sourceKey !== sourceKey || duplicate.value !== value) throw new Error('Progress event id was reused with another fact');
    return state;
  }
  const version = state.versions.find(item => item.id === (options.versionId ?? state.currentVersionId));
  const item = version?.items.find(entry => entry.sourceKey === sourceKey || entry.budgetKey === sourceKey);
  if (!version || !item) throw new Error('Progress must refer to work in the named accepted version');
  const event: PlanProgressEvent = { id: eventId, versionId: version.id, sourceKey, budgetKey: item.budgetKey,
    value, at: timestamp(options.at), supersedes: state.progress.filter(event => event.budgetKey === item.budgetKey).map(event => event.id).sort(compareText) };
  return freezePlan({ ...state, progress: [...state.progress, event].sort((a, b) => compareText(a.id, b.id)) });
}

export function planProgressValue(state: DayPlanState, budgetKey: string): number {
  const events = state.progress.filter(event => event.budgetKey === budgetKey);
  const superseded = new Set(events.flatMap(event => [...event.supersedes]));
  // Concurrent absolute observations are the same work, never independent increments.
  return Math.max(0, ...events.filter(event => !superseded.has(event.id)).map(event => event.value));
}

export function calculatePlanScore(state: DayPlanState | null | undefined, versionId?: string): PlanScoreResult {
  const empty: PlanScoreResult = { scoreVersion: DAY_PLAN_SCORE_VERSION, totalScore: null, originalScore: null, currentScore: null,
    goalScore: null, plannerScore: 0, items: [], minimumCompleted: false, revisionCount: 0, hasConflicts: false,
    conflictingVersionIds: [], originalVersionId: null, currentVersionId: null, plannedMinutes: 0, completedCount: 0, totalCount: 0 };
  if (!state) return empty;
  const original = state.versions.find(version => version.id === state.originalVersionId);
  const current = getCurrentPlanVersion(state);
  const selected = versionId ? state.versions.find(version => version.id === versionId) : original;
  if (!original || !selected) throw new Error('Requested plan version is missing');
  const evaluate = (version: DayPlanVersion) => {
    const items = version.items.map(item => {
      const currentValue = planProgressValue(state, item.budgetKey);
      const completionRatio = item.metric === 'binary' ? (currentValue >= item.targetValue ? 1 : 0) : clamp(currentValue / item.targetValue, 0, 1);
      return { ...item, currentValue, completionRatio, points: item.weight * completionRatio };
    });
    return { items, score: items.length ? clamp(items.reduce((sum, item) => sum + item.points, 0), 0, 100) : null };
  };
  const result = evaluate(selected);
  const leaves = planVersionLeaves(state.versions);
  const minimumItem = current.items.find(item => item.sourceKey === current.minimum?.sourceKey);
  return { ...empty, totalScore: result.score, originalScore: evaluate(original).score, currentScore: evaluate(current).score,
    goalScore: selected.items.some(item => item.category === 'goal') ? result.items.filter(item => item.category === 'goal').reduce((sum, item) => sum + item.points, 0) : null,
    plannerScore: result.items.filter(item => item.category === 'planner').reduce((sum, item) => sum + item.points, 0),
    items: result.items, minimumCompleted: Boolean(current.minimum && minimumItem && planProgressValue(state, minimumItem.budgetKey) >= current.minimum.targetValue),
    revisionCount: state.versions.filter(version => version.parentVersionId !== null).length,
    hasConflicts: leaves.length > 1, conflictingVersionIds: leaves.length > 1 ? leaves.map(version => version.id) : [],
    originalVersionId: original.id, currentVersionId: current.id, plannedMinutes: selected.plannedMinutes,
    completedCount: result.items.filter(item => item.completionRatio >= 1).length, totalCount: result.items.length };
}

export function planVersionLeaves(versions: readonly DayPlanVersion[]) {
  const parents = new Set(versions.map(version => version.parentVersionId));
  const resolved = new Set(versions.flatMap(version => [...(version.resolvesVersionIds ?? [])]));
  return versions.filter(version => !parents.has(version.id) && !resolved.has(version.id)).sort(compareVersions);
}

export function compareVersions(a: DayPlanVersion, b: DayPlanVersion) {
  return a.revision - b.revision || compareText(a.acceptedAt, b.acceptedAt) || compareText(a.id, b.id);
}

function makeVersion(proposal: DayPlanProposal, parent: DayPlanVersion | null, reason: string, options: PlanOperationOptions): DayPlanVersion {
  const items = canonicalItems(proposal.items);
  const goalItems = items.filter(item => item.category === 'goal');
  const plannerItems = items.filter(item => item.category === 'planner');
  const goalsWeight = goalItems.length ? (plannerItems.length ? 75 : 100) : 0;
  const plannerWeight = plannerItems.length ? (goalItems.length ? 25 : 100) : 0;
  const goalPriorities = new Map<string, number>();
  for (const item of goalItems) goalPriorities.set(item.goalId!, Math.max(goalPriorities.get(item.goalId!) ?? 0, PLAN_PRIORITY_WEIGHTS[item.priority ?? 'important']));
  const prioritySum = [...goalPriorities.values()].reduce((sum, value) => sum + value, 0);
  const weighted = items.map(item => ({ ...item, weight: item.category === 'planner' ? plannerWeight / plannerItems.length
    : goalsWeight * goalPriorities.get(item.goalId!)! / prioritySum / goalItems.filter(other => other.goalId === item.goalId).length }));
  const minimumItem = items.find(item => item.sourceKey === proposal.minimum?.sourceKey);
  const minimum = minimumItem && proposal.minimum ? { ...proposal.minimum, targetValue: clamp(proposal.minimum.targetValue, minimumItem.metric === 'binary' ? 1 : Number.EPSILON, minimumItem.targetValue) } : null;
  return { id: options.versionId ?? newId(), parentVersionId: parent?.id ?? null, revision: parent ? parent.revision + 1 : 0,
    acceptedAt: timestamp(options.at), reason, items: weighted, minimum,
    availableMinutes: Math.max(0, finite(proposal.availableMinutes)), reserveRatio: clamp(proposal.reserveRatio, 0, 1),
    plannedMinutes: items.reduce((sum, item) => sum + item.estimatedMinutes, 0), categoryWeights: { goals: goalsWeight, planner: plannerWeight } };
}

/** Deduplicate both the stable source identity and root budget, never by mutable titles. */
function canonicalItems(input: readonly DayPlanItem[]): DayPlanItem[] {
  const sources = new Set<string>();
  const budgets = new Set<string>();
  const output: DayPlanItem[] = [];
  const sorted = [...input].sort((a, b) => compareText(a.budgetKey, b.budgetKey) || b.targetValue - a.targetValue || compareText(a.sourceKey, b.sourceKey) || compareText(a.title, b.title));
  for (const item of sorted) {
    if (!item.sourceKey || !item.budgetKey || !Number.isFinite(item.targetValue) || item.targetValue <= 0) throw new Error('Plan work requires stable identities and positive target');
    if (item.sourceKey !== item.budgetKey && (!item.rootTargetValue || !Number.isFinite(item.rootTargetValue))) throw new Error('Split work must preserve its root target');
    if (item.category === 'goal' && !item.goalId) throw new Error('Goal work requires a goal identity');
    if (sources.has(item.sourceKey) || budgets.has(item.budgetKey)) continue;
    sources.add(item.sourceKey); budgets.add(item.budgetKey);
    output.push({ ...item, ...(item.category === 'goal' ? { priority: item.priority ?? 'important' } : {}), sourceKey: item.budgetKey, source: { ...item.source }, targetValue: item.metric === 'binary' ? 1 : item.rootTargetValue ?? item.targetValue,
      estimatedMinutes: Math.max(0, finite(item.estimatedMinutes)), ...(item.subtaskIds ? { subtaskIds: [...new Set(item.subtaskIds)].sort(compareText) } : {}) });
  }
  return output;
}

/** Display decomposition only: record absolute progress against the returned shared budgetKey. */
export function splitPlanItem(item: DayPlanItem, titles: readonly string[]): DayPlanItem[] {
  if (!titles.length) return [item];
  return titles.map((title, index) => ({ ...item, title, sourceKey: `${item.budgetKey}:part:${index}`,
    budgetKey: item.budgetKey, rootTargetValue: item.rootTargetValue ?? item.targetValue }));
}

function assertDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) throw new Error('Invalid plan date');
}
/** Source timestamps are instants; plan dates are device-local calendar days. */
export function completionLocalDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const instant = new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  return `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
}
function timestamp(value?: string) {
  const date = value === undefined ? new Date() : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Invalid event timestamp');
  return date.toISOString();
}
function newId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `plan-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
/** Also call after parsing persisted JSON: all snapshots and facts stay immutable. */
export function freezePlan<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezePlan(child);
    Object.freeze(value);
  }
  return value;
}
