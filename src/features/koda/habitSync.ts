import type { Habit } from './types';
import { defaultHabitMonth, defaultHabitYear } from './constants';
import { getCurrentWeekDates, getHabitMonthDays, monthKey } from './utils';
import { habitMetadata, normalizeHabitMetadata, normalizeHabitPauseEdits } from './habitModel';

export type HabitDayEdit = { done: boolean; at: string; id: string };
export type HabitWithSync = Habit & {
  updatedAt?: string;
  deletedAt?: string | null;
  dayEdits?: Record<string, HabitDayEdit>;
};
const legacyMonth = monthKey(defaultHabitYear, defaultHabitMonth);
const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const millis = (value?: string | null) => value && Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;

/** Inputs must belong to the same account; this module has no shared or account-global state.
 * Deleted rows are deliberately returned. The UI filters them, persistence must retain them.
 */
export function mergeHabits(remote: readonly Habit[], local: readonly Habit[]): HabitWithSync[] {
  const byId = new Map<string, HabitWithSync>();
  for (const habit of [...remote, ...local]) {
    const previous = byId.get(habit.id);
    byId.set(habit.id, previous ? mergeOne(previous, habit) : materialize(copyHabit(habit)));
  }
  return [...byId.values()].sort((a, b) => compareText(a.id, b.id));
}

/** Only for explicit UI edits, never hydration. Reuse BOTH at and eventId when retrying an operation.
 * Each changed day is an absolute register. A removed row becomes a persistent tombstone.
 */
export function recordHabitEdits(previous: readonly Habit[], next: readonly Habit[], at = new Date().toISOString(), eventId = newEventId()): HabitWithSync[] {
  if (!Number.isFinite(Date.parse(at)) || !eventId.trim()) throw new Error('Habit edits require a valid timestamp and operation id');
  const timestamp = new Date(at).toISOString();
  const beforeById = new Map(previous.map(habit => [habit.id, habit as HabitWithSync]));
  const afterIds = new Set(next.map(habit => habit.id));
  const result: HabitWithSync[] = [];
  for (const rawAfter of next) {
    const after = rawAfter as HabitWithSync;
    const before = beforeById.get(after.id);
    // Reappearance in a stale array is not an explicit restore operation.
    if (before?.deletedAt) { result.push(mergeOne(before, after)); continue; }
    let merged = before ? mergeOne(before, after) : copyHabit(after);
    const edits = { ...validEdits(merged.dayEdits) };
    const metadataChanged = !before || metadataKey(before) !== metadataKey(after);
    let changed = metadataChanged;
    const months = new Set([legacyMonth, ...Object.keys(after.monthHistory ?? {})]);
    for (const key of [...months].filter(validMonth).sort(compareText)) {
      const [year, month] = key.split('-').map(Number);
      const oldDays = before ? getHabitMonthDays(before, year, month - 1) : [];
      const newDays = getHabitMonthDays(after, year, month - 1);
      for (let day = 0; day < newDays.length; day++) {
        if (Boolean(oldDays[day]) === Boolean(newDays[day])) continue;
        setEdit(edits, `${key}-${String(day + 1).padStart(2, '0')}`, Boolean(newDays[day]), timestamp, eventId, after.id);
        changed = true;
      }
    }
    // doneDays is a redundant undated mirror; only dated calendar edits can create facts.
    // Otherwise retrying an edit with an older weekly mirror could invent an undo.
    if (after.deletedAt && !before?.deletedAt) changed = true;
    const stampMetadata = metadataChanged && millis(timestamp) >= millis(metadataStamp(merged));
    let pauseEdits = mergePauseEdits(before?.pauseEdits, after.pauseEdits);
    if (habitMetadata(before ?? {}).isActive !== habitMetadata(after).isActive && stampMetadata) {
      // Capture the local civil date once, using the operation's timestamp even on retries.
      const instant = new Date(timestamp);
      const date = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
      pauseEdits = mergePauseEdits(pauseEdits, { [date]: {
        paused: !habitMetadata(after).isActive, at: timestamp, id: JSON.stringify([eventId, after.id, 'pause', date]),
      } });
    }
    const metadata = habitMetadata(after);
    merged = { ...merged,
      ...(stampMetadata ? { title: after.title, target: after.target, ...metadata,
        color: metadata.color, archivedAt: metadata.archivedAt, metadataUpdatedAt: timestamp } : {}),
      ...(changed && millis(timestamp) >= millis(merged.updatedAt) ? { updatedAt: timestamp } : {}), dayEdits: edits,
      ...(Object.keys(pauseEdits).length ? { pauseEdits } : {}),
      ...(after.deletedAt ? { deletedAt: after.deletedAt } : {}) };
    result.push(materialize(merged));
  }
  for (const before of previous as readonly HabitWithSync[]) {
    if (afterIds.has(before.id)) continue;
    result.push(before.deletedAt ? materialize(copyHabit(before)) : materialize({ ...copyHabit(before), deletedAt: timestamp, updatedAt: timestamp }));
  }
  return result;
}

function mergeOne(a: HabitWithSync, b: HabitWithSync): HabitWithSync {
  const newest = compareHabitMetadata(a, b) >= 0 ? a : b;
  const keys = new Set([legacyMonth, ...Object.keys(a.monthHistory ?? {}), ...Object.keys(b.monthHistory ?? {})]);
  const history: Record<string, boolean[]> = {};
  for (const key of [...keys].filter(validMonth).sort(compareText)) {
    const [year, month] = key.split('-').map(Number);
    const first = getHabitMonthDays(a, year, month - 1);
    const second = getHabitMonthDays(b, year, month - 1);
    history[key] = first.map((value, index) => value || second[index]);
  }
  const firstEdits = validEdits(a.dayEdits);
  const secondEdits = validEdits(b.dayEdits);
  const edits: Record<string, HabitDayEdit> = {};
  for (const date of [...new Set([...Object.keys(firstEdits), ...Object.keys(secondEdits)])].sort(compareText)) {
    const first = firstEdits[date]; const second = secondEdits[date];
    edits[date] = { ...(!first ? second : !second ? first : compareEdit(first, second) >= 0 ? first : second) };
  }
  const deletedAt = [a.deletedAt, b.deletedAt].filter((value): value is string => typeof value === 'string' && Boolean(value))
    .sort((first, second) => millis(first) - millis(second) || compareText(first, second)).at(-1);
  const updatedAt = [a.updatedAt, b.updatedAt].filter((value): value is string => typeof value === 'string')
    .sort((first, second) => millis(first) - millis(second) || compareText(first, second)).at(-1);
  return materialize({ ...newest, metadataUpdatedAt: metadataStamp(newest), ...(updatedAt ? { updatedAt } : {}), monthHistory: history, monthDays: history[legacyMonth],
    doneDays: Array.from({ length: 7 }, (_, index) => Boolean(a.doneDays[index] || b.doneDays[index])), dayEdits: edits,
    ...(a.pauseEdits || b.pauseEdits ? { pauseEdits: mergePauseEdits(a.pauseEdits, b.pauseEdits) } : {}),
    ...(deletedAt ? { deletedAt } : {}) });
}

function materialize(habit: HabitWithSync): HabitWithSync {
  const history: Record<string, boolean[]> = {};
  const keys = new Set([legacyMonth, ...Object.keys(habit.monthHistory ?? {})]);
  for (const key of [...keys].filter(validMonth).sort(compareText)) {
    const [year, month] = key.split('-').map(Number);
    history[key] = getHabitMonthDays(habit, year, month - 1);
  }
  const edits = validEdits(habit.dayEdits);
  for (const date of Object.keys(edits).sort(compareText)) {
    const key = date.slice(0, 7);
    const [year, month, day] = date.split('-').map(Number);
    history[key] ??= Array.from({ length: new Date(year, month, 0).getDate() }, () => false);
    history[key][day - 1] = edits[date].done;
  }
  const doneDays = getCurrentWeekDates().map((date, index) => {
    const days = history[monthKey(date.getFullYear(), date.getMonth())];
    return days ? Boolean(days[date.getDate() - 1]) : Boolean(habit.doneDays[index]);
  });
  const latestPause = Object.values(normalizeHabitPauseEdits(habit.pauseEdits))
    .sort((a, b) => millis(a.at) - millis(b.at) || compareText(a.id, b.id) || Number(a.paused) - Number(b.paused)).at(-1);
  return { ...normalizeHabitMetadata(habit), ...(latestPause ? { isActive: !latestPause.paused } : {}),
    metadataUpdatedAt: metadataStamp(habit), monthHistory: Object.fromEntries(Object.entries(history).sort(([a], [b]) => compareText(a, b))),
    monthDays: [...history[legacyMonth]], doneDays, dayEdits: edits };
}

function setEdit(edits: Record<string, HabitDayEdit>, date: string, done: boolean, at: string, operationId: string, habitId: string) {
  const id = JSON.stringify([operationId, habitId, date]);
  const existing = edits[date];
  if (existing?.id === id) {
    if (existing.done !== done) throw new Error('Habit operation id was reused with another value');
    return;
  }
  const incoming = { done, at, id };
  // Preserve the operation's timestamp on retries. Raising it past the current register would
  // let an old replay erase a later undo. Clock ordering is the same as the merge rule.
  if (!existing || compareEdit(incoming, existing) > 0) edits[date] = incoming;
}

function validEdits(value: HabitWithSync['dayEdits']): Record<string, HabitDayEdit> {
  const edits: Record<string, HabitDayEdit> = {};
  if (!value || typeof value !== 'object') return edits;
  for (const date of Object.keys(value).sort(compareText)) {
    const edit = value[date];
    if (!validDate(date) || !edit || typeof edit.done !== 'boolean' || typeof edit.id !== 'string' || !edit.id ||
      typeof edit.at !== 'string' || !Number.isFinite(Date.parse(edit.at))) continue;
    edits[date] = { done: edit.done, at: new Date(edit.at).toISOString(), id: edit.id };
  }
  return edits;
}
function compareEdit(a: HabitDayEdit, b: HabitDayEdit) {
  // Same timestamp/id with corrupt differing contents resolves to false, never extra completion.
  return millis(a.at) - millis(b.at) || compareText(a.id, b.id) || Number(b.done) - Number(a.done);
}
function compareHabitMetadata(a: HabitWithSync, b: HabitWithSync) {
  return millis(metadataStamp(a)) - millis(metadataStamp(b)) || compareText(metadataKey(a), metadataKey(b)) ||
    compareText(metadataShape(a), metadataShape(b));
}
function metadataShape(habit: Habit) {
  // Absent legacy defaults and explicit defaults mean the same thing, but still need a
  // deterministic winner so equal-clock merges have identical serialized output.
  const normalized = normalizeHabitMetadata(habit);
  return JSON.stringify([normalized.icon, normalized.frequency, normalized.weekdays, normalized.isActive, normalized.createdDate, normalized.color, normalized.archivedAt]);
}
function metadataKey(habit: Habit) {
  const meta = habitMetadata(habit);
  return JSON.stringify([habit.title, habit.target, meta.icon, meta.frequency, meta.weekdays, meta.isActive, meta.createdDate, meta.color, meta.archivedAt]);
}

function mergePauseEdits(a: Habit['pauseEdits'], b: Habit['pauseEdits']): NonNullable<Habit['pauseEdits']> {
  const result = normalizeHabitPauseEdits(a);
  for (const [date, edit] of Object.entries(normalizeHabitPauseEdits(b))) {
    const previous = result[date];
    if (!previous || millis(edit.at) - millis(previous.at) > 0 ||
      (millis(edit.at) === millis(previous.at) && (compareText(edit.id, previous.id) > 0 ||
        (edit.id === previous.id && edit.paused && !previous.paused)))) result[date] = edit;
  }
  return normalizeHabitPauseEdits(result);
}
function metadataStamp(habit: Habit) {
  // Pin the legacy metadata clock before independent day changes advance updatedAt.
  const value = habit.metadataUpdatedAt ?? habit.updatedAt;
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : '1970-01-01T00:00:00.000Z';
}
function copyHabit(habit: HabitWithSync): HabitWithSync {
  return { ...normalizeHabitMetadata(habit), metadataUpdatedAt: metadataStamp(habit), doneDays: [...habit.doneDays], monthDays: [...habit.monthDays],
    monthHistory: Object.fromEntries(Object.entries(habit.monthHistory ?? {}).map(([key, days]) => [key, [...days]])),
    dayEdits: validEdits(habit.dayEdits) };
}
function validMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}
function newEventId() {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
    : `habit-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
