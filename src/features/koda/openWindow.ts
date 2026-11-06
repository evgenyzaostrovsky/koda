import { mergeGoalEntities, mergeEntityList, normalizeEntitySync } from './entitySync';
import type { Goal, OpenWindow, OpenWindowChange, OpenWindowDirection } from './types';
import { uid } from './utils';

export const WINDOW_POSITIONS = [0, 1, 2, 3, 5, 6, 7, 8] as const;
const directionsKey = (items: OpenWindowDirection[]) => JSON.stringify(items.map(({ syncMeta: _sync, ...item }) => item), (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
  ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) : value);
const copyDirections = (items: OpenWindowDirection[]) => items.map(d => ({ ...d, actionIds: [...d.actionIds], routineIds: [...d.routineIds] }));

export function createOpenWindow(goalId: string): OpenWindow {
  return { version: 1, directions: WINDOW_POSITIONS.map((_, position) => ({ id: `${goalId}:direction:${position}`, title: '', position, actionIds: [], routineIds: [], archivedAt: null })), history: [] };
}

export function normalizeOpenWindow(value: unknown, goalId: string): OpenWindow | undefined {
  if (!value || typeof value !== 'object' || !Array.isArray((value as OpenWindow).directions)) return undefined;
  const raw = value as OpenWindow;
  const base = createOpenWindow(goalId);
  const ids = (v: unknown) => Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string'))].slice(0, 8) : [];
  const seen = new Set<string>();
  base.directions = base.directions.map((fallback, i) => {
    const item = raw.directions.find(d => d?.position === i) ?? raw.directions[i];
    if (!item || typeof item !== 'object') return fallback;
    const id = typeof item.id === 'string' && !seen.has(item.id) ? item.id : fallback.id;
    seen.add(id);
    return { ...(normalizeEntitySync(item.syncMeta) ? { syncMeta: normalizeEntitySync(item.syncMeta) } : {}), id, position: i, title: typeof item.title === 'string' ? item.title.slice(0, 300) : '', actionIds: ids(item.actionIds), routineIds: ids(item.routineIds), archivedAt: typeof item.archivedAt === 'string' ? item.archivedAt : null };
  });
  // History is intentionally retained: archived links are not deleted from canonical actions.
  base.history = Array.isArray(raw.history) ? raw.history.filter(h => h && typeof h.id === 'string' && typeof h.at === 'string' && Array.isArray(h.directions)) : [];
  base.conflicts = Array.isArray(raw.conflicts) ? raw.conflicts.filter(h => h && typeof h.id === 'string' && Array.isArray(h.directions)) : [];
  base.resolvedConflictIds = Array.isArray(raw.resolvedConflictIds) ? [...new Set(raw.resolvedConflictIds.filter(id => typeof id === 'string'))].sort() : [];
  base.conflicts = base.conflicts.filter(item => !base.resolvedConflictIds!.includes(item.id));
  return base;
}

export function updateOpenWindow(goal: Goal, directions: OpenWindowDirection[], label: string, at = new Date().toISOString()): Goal {
  const previous = goal.openWindow ?? createOpenWindow(goal.id);
  if (goal.openWindow && JSON.stringify(previous.directions) === JSON.stringify(directions)) return goal;
  const change: OpenWindowChange = { id: uid('window-change'), at, label, directions: copyDirections(previous.directions), actionsSnapshot: goal.actions.map(a=>({...a})), routinesSnapshot: goal.routines.map(r=>({...r,weekdays:[...r.weekdays]})) };
  return { ...goal, updatedAt: at, openWindow: { ...previous, directions: copyDirections(directions), history: [...previous.history, change] } };
}

/** 81 physical cells; the duplicated direction cells share directionId. */
export function getOpenWindowCells(goal: Goal) {
  const window = goal.openWindow ?? createOpenWindow(goal.id);
  return Array.from({ length: 81 }, (_, index) => {
    const row = Math.floor(index / 9), column = index % 9;
    const block = Math.floor(row / 3) * 3 + Math.floor(column / 3);
    const cell = row % 3 * 3 + column % 3;
    if (block === 4 && cell === 4) return { index, kind: 'goal' as const, goalId: goal.id };
    const position = WINDOW_POSITIONS.indexOf((block === 4 ? cell : block) as typeof WINDOW_POSITIONS[number]);
    const direction = window.directions.find(d => d.position === position)!;
    if (block === 4 || cell === 4) return { index, kind: 'direction' as const, directionId: direction.id, position };
    const actionPosition = WINDOW_POSITIONS.indexOf(cell as typeof WINDOW_POSITIONS[number]);
    return { index, kind: 'action' as const, directionId: direction.id, position, actionPosition, actionId: direction.actionIds[actionPosition] ?? direction.routineIds[actionPosition - direction.actionIds.length] ?? null };
  });
}

export function mergeGoalWindows(first: Goal, second: Goal): Goal {
  const ordered = [first, second].sort((a,b) => a.updatedAt.localeCompare(b.updatedAt) || JSON.stringify(a).localeCompare(JSON.stringify(b)));
  const older = ordered[0], newer = ordered[1];
  const merged = mergeGoalEntities(first, second);
  if (!older.openWindow) return merged;
  if (!newer.openWindow) return { ...merged, openWindow: older.openWindow };
  const byId = new Map<string, OpenWindowChange>();
  [...older.openWindow.history, ...newer.openWindow.history].forEach(h => byId.set(h.id, h));
  const resolved = [...new Set([...(older.openWindow.resolvedConflictIds ?? []), ...(newer.openWindow.resolvedConflictIds ?? [])])].sort();
  const conflicts = new Map<string, OpenWindowChange>();
  [...(older.openWindow.conflicts ?? []), ...(newer.openWindow.conflicts ?? [])].forEach(h => conflicts.set(h.id, h));
  if (directionsKey(older.openWindow.directions) !== directionsKey(newer.openWindow.directions)
    && !newer.openWindow.history.some(h=>directionsKey(h.directions)===directionsKey(older.openWindow!.directions))) {
    const existing = [...conflicts.values()].find(item => item.at === older.updatedAt && directionsKey(item.directions) === directionsKey(older.openWindow!.directions));
    const id = existing?.id ?? `${older.id}:conflict:${older.updatedAt}:${directionsKey(older.openWindow.directions)}`;
    conflicts.set(id, { id, at: older.updatedAt, label: 'Вариант с другого устройства', directions: copyDirections(older.openWindow.directions), actionsSnapshot: older.actions, routinesSnapshot: older.routines });
  }
  return { ...merged, openWindow: { ...newer.openWindow, directions: mergeEntityList(older.openWindow.directions, newer.openWindow.directions).sort((a,b)=>a.position-b.position), resolvedConflictIds: resolved, history: [...byId.values()].sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id)), conflicts: [...conflicts.values()].filter(item => !resolved.includes(item.id)).sort((a,b)=>a.id.localeCompare(b.id)) } };
}
