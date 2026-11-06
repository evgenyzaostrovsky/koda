import type { EntitySync, Goal, Project, ProfileState, PomodoroSettings } from './types';
import { recordGoalListChanges } from './goalDeletion';

type Synced = { syncMeta?: EntitySync };
type Stamp = EntitySync['fields'][string];
const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item) ?? '';
const compare = (a: Stamp, b: Stamp) => Date.parse(a.at) - Date.parse(b.at) || a.id.localeCompare(b.id);
const operation = (): string => globalThis.crypto?.randomUUID?.() ?? `edit-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/** Stored inside the account snapshot; no device-global state or clock is used. */
export function normalizeEntitySync(value: unknown): EntitySync | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as EntitySync;
  const fields: EntitySync['fields'] = {};
  for (const [key, stamp] of Object.entries(raw.fields ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (stamp && typeof stamp.at === 'string' && Number.isFinite(Date.parse(stamp.at)) && typeof stamp.id === 'string' && stamp.id)
      Object.defineProperty(fields, key, { value: { at: new Date(stamp.at).toISOString(), id: stamp.id }, enumerable: true, configurable: true, writable: true });
  }
  const removed = Object.fromEntries(Object.entries(raw.removed ?? {}).filter(([, ids]) => Array.isArray(ids))
    .map(([key, ids]) => [key, [...new Set(ids.filter(id => typeof id === 'string'))].sort()]));
  return Object.keys(fields).length || Object.keys(removed).length ? { fields, ...(Object.keys(removed).length ? { removed } : {}) } : undefined;
}

function mergeMeta(a?: EntitySync, b?: EntitySync): EntitySync {
  const first = normalizeEntitySync(a), second = normalizeEntitySync(b);
  const fields = { ...first?.fields };
  for (const [key, stamp] of Object.entries(second?.fields ?? {})) if (!fields[key] || compare(stamp, fields[key]) > 0) fields[key] = stamp;
  const removed = Object.fromEntries([...new Set([...Object.keys(first?.removed ?? {}), ...Object.keys(second?.removed ?? {})])].sort()
    .map(key => [key, [...new Set([...(first?.removed?.[key] ?? []), ...(second?.removed?.[key] ?? [])])].sort()]));
  return normalizeEntitySync({ fields, removed }) ?? { fields: {} };
}

/** Modal drafts must compare with their opening snapshot, not newly hydrated fields. */
export function changedDraftFields<T extends object>(original: T, draft: Partial<T>): Partial<T> {
  return Object.fromEntries(Object.entries(draft).filter(([key, value]) => stable(value) !== stable((original as Record<string, unknown>)[key]))) as Partial<T>;
}

/** Call only at an explicit edit boundary, with the actual before/after values.
 * Unchanged fields retain their versions; replays reuse at/id and never acquire a newer clock.
 */
export function recordEntityFields<T extends Synced>(before: T | undefined, after: T, keys: readonly string[], at: string, id: string): T {
  if (!Number.isFinite(Date.parse(at)) || !id.trim()) throw new Error('Entity edit requires a valid timestamp and operation id');
  const syncMeta = mergeMeta(before?.syncMeta, after.syncMeta);
  const stamp = { at: new Date(at).toISOString(), id };
  const output = { ...after } as Record<string, unknown>;
  for (const key of keys) {
    if (before && stable((before as Record<string, unknown>)[key]) === stable(output[key])) continue;
    const previous = syncMeta.fields[key];
    if (!previous || compare(stamp, previous) >= 0) syncMeta.fields[key] = stamp;
    else if (before) output[key] = (before as Record<string, unknown>)[key];
  }
  return { ...output, ...(normalizeEntitySync(syncMeta) ? { syncMeta: normalizeEntitySync(syncMeta) } : {}) } as T;
}

/** Legacy fields follow the supplied fallback; versioned edits beat unversioned snapshots. */
export function mergeEntityFields<T extends Synced>(a: T, b: T, fallback: T, keys: readonly string[]): T {
  const first = normalizeEntitySync(a.syncMeta), second = normalizeEntitySync(b.syncMeta);
  const output = { ...fallback } as Record<string, unknown>;
  for (const key of keys) {
    const av = first?.fields[key], bv = second?.fields[key];
    if (!av && !bv) continue;
    const order = av && bv ? compare(av, bv) : av ? 1 : -1;
    const winner = order > 0 ? a : order < 0 ? b : stable((a as Record<string, unknown>)[key]) >= stable((b as Record<string, unknown>)[key]) ? a : b;
    if (Object.hasOwn(winner, key)) output[key] = (winner as Record<string, unknown>)[key]; else delete output[key];
  }
  const syncMeta = normalizeEntitySync(mergeMeta(first, second));
  return { ...output, ...(syncMeta ? { syncMeta } : {}) } as T;
}

const goalFields = ['title', 'desiredResult', 'planningContext', 'deadline', 'priority', 'status', 'completedAt', 'archivedAt'];
const projectFields = ['title', 'description', 'status', 'completedAt'];
const profileFields = ['themeId', 'version', 'daysLeft', 'level', 'streak', 'xp', 'values', 'futureSelf', 'focus', 'milestone'];
const pomodoroFields = ['workMinutes', 'breakMinutes', 'longBreakMinutes', 'sessionsBeforeLongBreak', 'soundId'];
const childKeys = (a: object, b?: object) => [...new Set([...Object.keys(a), ...Object.keys(b ?? {})])].filter(k => !['id', 'syncMeta', 'createdAt', 'updatedAt', 'deletedAt'].includes(k));
type Child = Synced & { id: string; updatedAt?: string; deletedAt?: string | null };
function newest<T extends { updatedAt?: string }>(a: T, b: T): T {
  return (a.updatedAt ?? '').localeCompare(b.updatedAt ?? '') > 0 ? a : (a.updatedAt ?? '') === (b.updatedAt ?? '') && stable(a) > stable(b) ? a : b;
}

export function mergeEntityList<T extends Child>(a: T[], b: T[], removed: string[] = []): T[] {
  const map = new Map(a.map(item => [item.id, item]));
  for (const item of b) {
    const previous = map.get(item.id);
    if (!previous) { map.set(item.id, item); continue; }
    // Physical deletion is permanent, even when a stale device has a newer clock.
    const deleted = previous.deletedAt || item.deletedAt;
    map.set(item.id, { ...mergeEntityFields(previous, item, previous.updatedAt || item.updatedAt ? newest(previous, item) : item, childKeys(previous, item)),
      ...(deleted ? { deletedAt: [previous.deletedAt, item.deletedAt].filter(Boolean).sort().at(-1) } : {}) });
  }
  const removedIds = new Set(removed);
  return [...map.values()].filter(item => !removedIds.has(item.id)).sort((a, b) => a.id.localeCompare(b.id));
}

function recordList<T extends Child>(before: T[], after: T[], at: string, id: string): T[] {
  return after.map(item => {
    const previous = before.find(old => old.id === item.id);
    if (previous?.deletedAt) return previous;
    return recordEntityFields(previous, item, childKeys(item, previous), at, id);
  });
}
const goalCollections = ['actions', 'milestones', 'routines', 'routineLogs'] as const;
export function recordGoalEdits(previous: Goal[], next: Goal[], at = new Date().toISOString(), id = operation()): Goal[] {
  return recordGoalListChanges(previous, next, at).map(goal => {
    const before = previous.find(old => old.id === goal.id);
    if (goal.deletedAt) return goal;
    const result = recordEntityFields(before, goal, goalFields, at, id);
    const meta = mergeMeta(before?.syncMeta, result.syncMeta);
    for (const key of goalCollections) {
      const removed = [...new Set([...(meta.removed?.[key] ?? []), ...(before?.[key] ?? []).filter(item => !goal[key].some(next => next.id === item.id)).map(item => item.id)])].sort();
      if (removed.length) meta.removed = { ...meta.removed, [key]: removed };
      // The keys share a collection algorithm but have different concrete row types.
      (result as unknown as Record<string, Child[]>)[key] = recordList<Child>(before?.[key] ?? [], goal[key], at, id).filter(item => !removed.includes(item.id));
    }
    result.syncMeta = normalizeEntitySync(meta);
    if (goal.openWindow) result.openWindow = { ...goal.openWindow,
      directions: recordList(before?.openWindow?.directions ?? [], goal.openWindow.directions, at, id),
      resolvedConflictIds: [...new Set([...(before?.openWindow?.resolvedConflictIds ?? []), ...(goal.openWindow.resolvedConflictIds ?? [])])].sort() };
    return result;
  });
}

export function mergeGoalEntities(a: Goal, b: Goal): Goal {
  const newer = newest(a, b), older = newer === a ? b : a;
  const result = mergeEntityFields(a, b, newer, goalFields);
  for (const key of goalCollections) {
    const removed = result.syncMeta?.removed?.[key];
    const versioned = removed?.length || [...older[key], ...newer[key]].some(item => normalizeEntitySync(item.syncMeta));
    // Preserve whole-snapshot behavior for legacy collections: absence had no durable
    // meaning before edit metadata, so do not newly union an older removed action.
    (result as unknown as Record<string, Child[]>)[key] = versioned ? mergeEntityList<Child>(older[key], newer[key], removed) : [...newer[key]];
  }
  result.actions.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  result.milestones.sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
  const removedRoutines = new Set(result.syncMeta?.removed?.routines ?? []);
  result.routineLogs = result.routineLogs.filter(log => !removedRoutines.has(log.routineId));
  return result;
}

export function recordProjectEdits(previous: Project[], next: Project[], at = new Date().toISOString(), id = operation()): Project[] {
  return next.map(project => {
    const before = previous.find(old => old.id === project.id);
    const result = recordEntityFields(before, project, projectFields, at, id);
    result.tasks = recordList(before?.tasks ?? [], project.tasks, at, id);
    for (const old of before?.tasks ?? []) if (!result.tasks.some(task => task.id === old.id)) result.tasks.push({ ...old, deletedAt: old.deletedAt ?? at, updatedAt: at });
    return result;
  });
}
export function mergeProjectEntities(a: Project, b: Project): Project {
  return { ...mergeEntityFields(a, b, newest(a, b), projectFields), tasks: mergeEntityList(a.tasks, b.tasks) };
}
export const recordProfileEdits = (before: ProfileState, after: ProfileState, at = new Date().toISOString(), id = operation()) => recordEntityFields(before, after, profileFields, at, id);
export const recordPomodoroEdits = (before: PomodoroSettings, after: PomodoroSettings, at = new Date().toISOString(), id = operation()) => recordEntityFields(before, after, pomodoroFields, at, id);
// A cached legacy profile has no evidence of a newer edit. Prefer the server for unversioned fields.
export const mergeProfiles = (remote: ProfileState, local: ProfileState) => mergeEntityFields(remote, local, remote, profileFields);
export const mergePomodoro = (remote: PomodoroSettings, local: PomodoroSettings) => mergeEntityFields(remote, local, remote, pomodoroFields);
