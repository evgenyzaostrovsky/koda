import { compareVersions, completionLocalDate, freezePlan, getCurrentPlanVersion, plannerSourceKey, planProgressValue,
  planVersionLeaves, recordPlanProgress, type DayPlanState, type DayPlanVersion, type PlanProgressEvent } from './dayPlan';
import type { Goal, PlannerItem } from './types';

/** Union immutable histories. Throws on corrupt identifier reuse instead of silently losing a fact. */
export function mergeDayPlans(local: DayPlanState, remote: DayPlanState): DayPlanState {
  if (local.date !== remote.date || local.ownerId !== remote.ownerId) throw new Error('Cannot merge plans from different days or accounts');
  const versions = unionById(local.versions, remote.versions).sort(compareVersions);
  const progress = unionById(local.progress, remote.progress).sort((a, b) => compareText(a.id, b.id));
  const roots = versions.filter(version => version.parentVersionId === null)
    .sort((a, b) => compareText(a.acceptedAt, b.acceptedAt) || compareText(a.id, b.id));
  const leaves = planVersionLeaves(versions);
  if (!roots.length || !leaves.length) throw new Error('Plan history is incomplete');
  return freezePlan({ ...local, versions, progress, originalVersionId: roots[0].id, currentVersionId: leaves[leaves.length - 1].id });
}

/**
 * Import only positive new evidence. Missing/deleted/moved source records never erase facts.
 * Corrections/undo must be explicit recordPlanProgress events; loading a stale cache is not an undo.
 * Caller must scope sources to state.ownerId. PlannerItem.ownerId identifies its project, not an account.
 */
export function syncDayPlanProgress(state: DayPlanState, goals: readonly Goal[], plannerItems: readonly PlannerItem[],
  options: { at?: string } = {}): DayPlanState {
  let next = state;
  const knownWork = new Set<string>();
  // Current snapshot first; older removed work can still receive factual completion.
  const versions = [getCurrentPlanVersion(state), ...state.versions];
  for (const version of versions) {
    for (const item of version.items) {
      if (knownWork.has(item.budgetKey)) continue;
      knownWork.add(item.budgetKey);
      const linkedPlanner = plannerItems.filter(candidate => !candidate.deletedAt &&
        (plannerSourceKey(candidate) === item.budgetKey || candidate.id === item.source.plannerId));
      let observed = 0;
      if (item.source.kind === 'routine') {
        const goal = goals.find(goal => goal.id === item.source.goalId);
        // Same-day logs only. Multiple copies represent the same absolute count, never a sum.
        observed = Math.max(0, ...(goal?.routineLogs.filter(log => log.routineId === item.source.id && log.date === state.date).map(log => log.value) ?? []));
      } else if (item.source.kind === 'action') {
        const goal = goals.find(goal => goal.id === item.source.goalId);
        const action = goal?.actions.find(action => action.id === item.source.id);
        const completedOnDay = action?.status === 'completed' && (!action.completedAt || completionLocalDate(action.completedAt) === state.date);
        observed = completedOnDay ? item.targetValue : 0;
      }
      for (const planner of linkedPlanner) {
        // A move does not create work for the old day. Existing facts remain stored independently.
        if (planner.date !== state.date || planner.failed) continue;
        if (item.metric === 'subtasks') {
          const completedIds = new Set((planner.subtasks ?? []).filter(subtask => subtask.done).map(subtask => subtask.id));
          // A parent's done flag cannot pretend its frozen/deleted subtasks were performed.
          observed = Math.max(observed, (item.subtaskIds ?? []).filter(id => completedIds.has(id)).length);
        } else if (planner.done) observed = Math.max(observed, item.targetValue);
      }
      if (!Number.isFinite(observed) || observed <= planProgressValue(next, item.budgetKey)) continue;
      // Previously observed values cannot revive an explicit correction when a stale source reloads.
      if (next.progress.some(event => event.budgetKey === item.budgetKey && event.value === observed)) continue;
      const unique = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      const eventId = `source:${unique}`;
      next = recordPlanProgress(next, item.sourceKey, observed, eventId, { versionId: version.id, at: options.at });
    }
  }
  return next;
}

/** Compatibility alias for integration code that names the source-observation operation explicitly. */
export const updateDayPlanProgressFromSources = syncDayPlanProgress;
export const reconcileDayPlanProgress = syncDayPlanProgress;

/**
 * Call exclusively from a user-edit handler with its actual before/after source states.
 * Background cache/network reads must use reconcileDayPlanProgress instead. The shapes alone
 * cannot distinguish a deliberate edit from loading an older cache.
 */
export function syncExplicitSourceChanges(state: DayPlanState, previousGoals: readonly Goal[], nextGoals: readonly Goal[],
  previousPlanner: readonly PlannerItem[], nextPlanner: readonly PlannerItem[], options: { at?: string } = {}): DayPlanState {
  let next = state;
  const knownWork = new Set<string>();
  for (const version of [getCurrentPlanVersion(state), ...state.versions]) {
    for (const item of version.items) {
      if (knownWork.has(item.budgetKey)) continue;
      knownWork.add(item.budgetKey);
      const observations: number[] = [];
      const previousGoal = previousGoals.find(goal => goal.id === item.source.goalId);
      const nextGoal = nextGoals.find(goal => goal.id === item.source.goalId);
      if (item.source.kind === 'action' && previousGoal && nextGoal) {
        const before = previousGoal.actions.find(action => action.id === item.source.id);
        const after = nextGoal.actions.find(action => action.id === item.source.id);
        if (before && after && !before.archivedAt && !after.archivedAt && before.dueDate === after.dueDate &&
          before.deferredUntil === after.deferredUntil && before.status !== after.status) {
          const completionDate = completionLocalDate(after.status === 'completed' ? after.completedAt : before.completedAt);
          if (!completionDate || completionDate === state.date) observations.push(after.status === 'completed' ? item.targetValue : 0);
        }
      }
      if (item.source.kind === 'routine' && previousGoal && nextGoal &&
        previousGoal.routines.some(routine => routine.id === item.source.id) && nextGoal.routines.some(routine => routine.id === item.source.id)) {
        for (const after of nextGoal.routineLogs.filter(log => log.routineId === item.source.id && log.date === state.date)) {
          const before = previousGoal.routineLogs.find(log => log.id === after.id);
          if (before && before.date === after.date && before.routineId === after.routineId && before.value !== after.value) observations.push(after.value);
          // Creating the first log is an edit of an existing routine, not disappearance of a log.
          else if (!before && !previousGoal.routineLogs.some(log => log.routineId === after.routineId && log.date === after.date)) observations.push(after.value);
        }
      }
      for (const after of nextPlanner) {
        if (after.deletedAt || after.date !== state.date || (plannerSourceKey(after) !== item.budgetKey && after.id !== item.source.plannerId)) continue;
        const before = previousPlanner.find(candidate => candidate.id === after.id);
        if (!before || before.deletedAt || before.date !== after.date || plannerSourceKey(before) !== plannerSourceKey(after)) continue;
        if (item.metric === 'subtasks') {
          const ids = item.subtaskIds ?? [];
          const changed = ids.some(id => {
            const oldStep = before.subtasks?.find(step => step.id === id);
            const newStep = after.subtasks?.find(step => step.id === id);
            return oldStep && newStep && oldStep.done !== newStep.done;
          });
          // Missing steps cannot be inferred from an aggregate historical count. Preserve the fact
          // until a complete source or an explicit root-level correction is available.
          const known = ids.every(id => before.subtasks?.some(step => step.id === id) || after.subtasks?.some(step => step.id === id));
          if (changed && known) observations.push(ids.filter(id =>
            (after.subtasks?.find(step => step.id === id) ?? before.subtasks?.find(step => step.id === id))?.done).length);
        } else if (before.done !== after.done) observations.push(after.done ? item.targetValue : 0);
      }
      const values = [...new Set(observations.filter(value => Number.isFinite(value) && value >= 0))];
      // Conflicting simultaneous edits of two representations need an explicit root correction.
      if (values.length !== 1 || planProgressValue(next, item.budgetKey) === values[0]) continue;
      const unique = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      next = recordPlanProgress(next, item.sourceKey, values[0], `explicit:${unique}`, { versionId: version.id, at: options.at });
    }
  }
  return next;
}

export function mergeDayPlanLists(local: readonly DayPlanState[], remote: readonly DayPlanState[]): DayPlanState[] {
  const byDay = new Map<string, DayPlanState>();
  for (const plan of [...local, ...remote]) {
    const key = JSON.stringify([plan.ownerId, plan.date]);
    const previous = byDay.get(key);
    byDay.set(key, previous ? mergeDayPlans(previous, plan) : plan);
  }
  return [...byDay.values()].sort((a, b) => compareText(b.date, a.date) || compareText(a.ownerId ?? '', b.ownerId ?? ''));
}

/** Strict boundary for JSON stored inside the existing KodaDay calculationSnapshot. */
export function parseDayPlanState(value: unknown): DayPlanState | null {
  try {
    const raw: unknown = typeof value === 'string' ? JSON.parse(value) : value;
    if (!record(raw) || raw.schemaVersion !== 1 || raw.scoreVersion !== 3 || !dateKey(raw.date) ||
      !(raw.ownerId === null || typeof raw.ownerId === 'string') || !Array.isArray(raw.versions) || !raw.versions.length ||
      !raw.versions.every(validVersion) || !Array.isArray(raw.progress) || !raw.progress.every(validEvent) ||
      typeof raw.originalVersionId !== 'string' || typeof raw.currentVersionId !== 'string') return null;
    const versions = raw.versions as DayPlanVersion[];
    const progress = raw.progress as PlanProgressEvent[];
    if (new Set(versions.map(version => version.id)).size !== versions.length || new Set(progress.map(event => event.id)).size !== progress.length) return null;
    const original = versions.find(version => version.id === raw.originalVersionId);
    if (!original || original.parentVersionId !== null || !versions.some(version => version.id === raw.currentVersionId)) return null;
    for (const version of versions) {
      if (version.parentVersionId !== null) {
        const parent = versions.find(candidate => candidate.id === version.parentVersionId);
        if (!parent) return null;
        const resolved = (version.resolvesVersionIds ?? []).map(id => versions.find(candidate => candidate.id === id));
        if (resolved.some(candidate => !candidate || candidate.id === version.id || candidate.revision >= version.revision)) return null;
        if (version.revision !== Math.max(parent.revision, ...resolved.map(candidate => candidate!.revision)) + 1) return null;
      } else if (version.revision !== 0 || version.resolvesVersionIds !== undefined) return null;
    }
    for (const event of progress) {
      const version = versions.find(candidate => candidate.id === event.versionId);
      if (!version?.items.some(item => item.budgetKey === event.budgetKey && (item.sourceKey === event.sourceKey || item.budgetKey === event.sourceKey))) return null;
      for (const id of event.supersedes) {
        const previous = progress.find(candidate => candidate.id === id);
        if (!previous || id === event.id || previous.budgetKey !== event.budgetKey) return null;
      }
    }
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const acyclic = (event: PlanProgressEvent): boolean => {
      if (visiting.has(event.id)) return false;
      if (visited.has(event.id)) return true;
      visiting.add(event.id);
      if (!event.supersedes.every(id => acyclic(progress.find(candidate => candidate.id === id)!))) return false;
      visiting.delete(event.id); visited.add(event.id); return true;
    };
    if (!progress.every(acyclic)) return null;
    const state = { schemaVersion: 1 as const, scoreVersion: 3 as const, date: raw.date as string, ownerId: raw.ownerId as string | null,
      versions, progress, originalVersionId: raw.originalVersionId, currentVersionId: raw.currentVersionId };
    // Detach external objects before freezing, and deterministically repair stale selection pointers.
    const detached = JSON.parse(JSON.stringify(state)) as DayPlanState;
    return mergeDayPlans(detached, detached);
  } catch { return null; }
}
export const normalizeDayPlan = parseDayPlanState;

function validVersion(value: unknown): value is DayPlanVersion {
  if (!record(value) || !nonempty(value.id) || !(value.parentVersionId === null || nonempty(value.parentVersionId)) ||
    !Number.isInteger(value.revision) || Number(value.revision) < 0 || !isoTime(value.acceptedAt) || typeof value.reason !== 'string' ||
    !nonnegative(value.availableMinutes) || !nonnegative(value.plannedMinutes) || !nonnegative(value.reserveRatio) || Number(value.reserveRatio) > 1 ||
    !record(value.categoryWeights) || !nonnegative(value.categoryWeights.goals) || !nonnegative(value.categoryWeights.planner) ||
    !Array.isArray(value.items) || (value.resolvesVersionIds !== undefined && (!Array.isArray(value.resolvesVersionIds) ||
      !value.resolvesVersionIds.length || !value.resolvesVersionIds.every(nonempty) || new Set(value.resolvesVersionIds).size !== value.resolvesVersionIds.length))) return false;
  const keys = new Set<string>();
  for (const item of value.items) {
    if (!record(item) || !nonempty(item.sourceKey) || !nonempty(item.budgetKey) || keys.has(item.budgetKey) ||
      typeof item.title !== 'string' || !['goal', 'planner'].includes(String(item.category)) ||
      !['binary', 'count', 'minutes', 'subtasks'].includes(String(item.metric)) || !positive(item.targetValue) ||
      !nonnegative(item.estimatedMinutes) || !nonnegative(item.weight) || !record(item.source) || !nonempty(item.source.id) ||
      !['action', 'routine', 'planner'].includes(String(item.source.kind)) ||
      (item.category === 'goal' && (!nonempty(item.goalId) || !['main', 'important', 'supporting'].includes(String(item.priority)))) ||
      (item.subtaskIds !== undefined && (!Array.isArray(item.subtaskIds) || !item.subtaskIds.every(nonempty)))) return false;
    keys.add(item.budgetKey);
  }
  const items = value.items as DayPlanVersion['items'];
  const weight = items.reduce((sum, item) => sum + item.weight, 0);
  if (Math.abs(weight - (items.length ? 100 : 0)) > 1e-7) return false;
  if (value.minimum !== null) {
    if (!record(value.minimum) || !nonempty(value.minimum.sourceKey) || !positive(value.minimum.targetValue) || typeof value.minimum.label !== 'string') return false;
    const minimum = value.minimum;
    const item = items.find(item => item.sourceKey === minimum.sourceKey);
    if (!item || Number(minimum.targetValue) > item.targetValue) return false;
  }
  return true;
}
function validEvent(value: unknown): value is PlanProgressEvent {
  return record(value) && nonempty(value.id) && nonempty(value.versionId) && nonempty(value.sourceKey) && nonempty(value.budgetKey) &&
    nonnegative(value.value) && isoTime(value.at) && Array.isArray(value.supersedes) && value.supersedes.every(nonempty);
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positive = (value: unknown): value is number => nonnegative(value) && value > 0;
const isoTime = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const dateKey = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

function unionById<T extends { readonly id: string }>(local: readonly T[], remote: readonly T[]): T[] {
  const byId = new Map<string, T>();
  for (const value of [...local, ...remote]) {
    const previous = byId.get(value.id);
    if (previous && stableJson(previous) !== stableJson(value)) throw new Error(`Immutable plan identifier collision: ${value.id}`);
    byId.set(value.id, value);
  }
  return [...byId.values()];
}
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).filter(key => value[key] !== undefined).sort(compareText).map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
