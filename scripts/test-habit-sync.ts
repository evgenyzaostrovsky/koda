import assert from 'node:assert/strict';
import { mergeHabits, recordHabitEdits, type HabitWithSync } from '../src/features/koda/habitSync';
import { getHabitMonthDays } from '../src/features/koda/utils';
import { habitDoneOn, habitStreak, toggleHabitDateValue } from '../src/features/koda/habitModel';

const firstAt = '2026-10-20T08:00:00.000Z';
const nextAt = '2026-10-20T09:00:00.000Z';
const laterAt = '2026-10-20T10:00:00.000Z';
let checked = 0;
function test(name: string, run: () => void) { run(); checked++; console.log(`PASS ${name}`); }
function habit(id = 'same-id'): HabitWithSync {
  return { id, title: 'Walk', target: 'Daily', doneDays: Array(7).fill(false), monthDays: Array(31).fill(false),
    monthHistory: { '2026-10': Array(31).fill(false) } };
}
function setDay(value: HabitWithSync, date: string, done: boolean): HabitWithSync {
  const [year, month, day] = date.split('-').map(Number);
  const key = date.slice(0, 7);
  const days = getHabitMonthDays(value, year, month - 1).map((old, index) => index === day - 1 ? done : old);
  return { ...value, monthHistory: { ...value.monthHistory, [key]: days } };
}
function day(value: HabitWithSync, date: string) {
  const [year, month, number] = date.split('-').map(Number);
  return getHabitMonthDays(value, year, month - 1)[number - 1];
}

test('two offline devices preserve independent days and months', () => {
  const base = habit();
  const a = recordHabitEdits([base], [setDay(base, '2026-10-20', true)], firstAt, 'a');
  const b = recordHabitEdits([base], [setDay(base, '2026-10-21', true)], firstAt, 'b');
  const c = recordHabitEdits([base], [setDay(base, '2026-09-30', true)], firstAt, 'c');
  const merged = mergeHabits(a, b);
  assert.equal(day(merged[0], '2026-10-20'), true);
  assert.equal(day(merged[0], '2026-10-21'), true);
  assert.deepEqual(merged, mergeHabits(b, a));
  assert.deepEqual(mergeHabits(merged, c), mergeHabits(a, mergeHabits(b, c)));
  assert.equal(day(mergeHabits(merged, c)[0], '2026-09-30'), true);
});
test('explicit false survives stale true and legacy data without metadata', () => {
  const base = habit();
  const done = recordHabitEdits([base], [setDay(base, '2026-10-20', true)], firstAt, 'done');
  const undone = recordHabitEdits(done, [setDay(done[0], '2026-10-20', false)], nextAt, 'undo');
  assert.equal(day(mergeHabits(done, undone)[0], '2026-10-20'), false);
  assert.equal(day(mergeHabits([setDay(base, '2026-10-20', true)], undone)[0], '2026-10-20'), false);
  const restored = recordHabitEdits(undone, [setDay(undone[0], '2026-10-20', true)], laterAt, 'redone');
  assert.equal(day(mergeHabits(restored, undone)[0], '2026-10-20'), true);
});
test('same-cell concurrent edits resolve by timestamp and id independently of merge order', () => {
  const initial = habit();
  const done = recordHabitEdits([initial], [setDay(initial, '2026-10-20', true)], firstAt, 'a');
  const undone = recordHabitEdits(done, [setDay(done[0], '2026-10-20', false)], nextAt, 'z');
  const other = { ...done[0], dayEdits: { ...done[0].dayEdits, '2026-10-20': { done: true, at: nextAt, id: 'a' } } };
  const merged = mergeHabits(undone, [other]);
  assert.deepEqual(merged, mergeHabits([other], undone));
  const expected = [undone[0].dayEdits!['2026-10-20'], other.dayEdits['2026-10-20']].sort((a, b) => a.id < b.id ? -1 : 1).at(-1)!.done;
  assert.equal(day(merged[0], '2026-10-20'), expected);
});
test('retry is idempotent including stale redundant weekly mirror', () => {
  const base = habit();
  const raw = setDay(base, '2026-10-20', true);
  const once = recordHabitEdits([base], [raw], firstAt, 'retry');
  assert.deepEqual(recordHabitEdits([base], [raw], firstAt, 'retry'), once);
  assert.deepEqual(recordHabitEdits(once, [raw], firstAt, 'retry'), once);
  assert.deepEqual(mergeHabits(once, once), once);
});
test('deletion tombstone prevents resurrection by stale and newer source rows', () => {
  const base = habit();
  const done = recordHabitEdits([base], [setDay(base, '2026-10-20', true)], firstAt, 'done');
  const removed = recordHabitEdits(done, [], nextAt, 'delete');
  assert.equal(removed[0].id, base.id);
  assert.equal(removed[0].deletedAt, nextAt);
  assert.equal(day(removed[0], '2026-10-20'), true);
  const stale = [{ ...done[0], updatedAt: laterAt, title: 'Offline rename' }];
  assert.equal(mergeHabits(removed, stale)[0].deletedAt, nextAt);
  assert.deepEqual(mergeHabits(removed, stale), mergeHabits(stale, removed));
  assert.equal(recordHabitEdits(removed, [base], laterAt, 'stale-reappearance')[0].deletedAt, nextAt);
  assert.deepEqual(recordHabitEdits(removed, [], laterAt, 'delete-again'), removed);
});
test('legacy historical cells use OR; July monthDays retain their original date identity', () => {
  const base = habit();
  const a = setDay(base, '2026-10-20', true);
  const b = setDay(base, '2026-10-21', true);
  const merged = mergeHabits([a], [b])[0];
  assert.equal(day(merged, '2026-10-20'), true);
  assert.equal(day(merged, '2026-10-21'), true);
  const legacy = { ...base, monthHistory: {}, monthDays: base.monthDays.map((_, index) => index === 2) };
  const normalized = mergeHabits([legacy], [base])[0];
  assert.equal(day(normalized, '2026-07-03'), true);
  assert.equal(day(normalized, '2026-10-03'), false);
  const edited = recordHabitEdits([base], [legacy], firstAt, 'legacy-edit')[0];
  assert.equal(edited.dayEdits!['2026-07-03'].done, true);
});
test('rename metadata, JSON reload, immutability and malformed date filtering', () => {
  const base = habit();
  const before = JSON.stringify(base);
  const done = recordHabitEdits([base], [setDay(base, '2026-10-20', true)], firstAt, 'done');
  const renamed = recordHabitEdits(done, [{ ...done[0], title: 'New label', target: 'Twice' }], nextAt, 'rename');
  assert.equal(mergeHabits(done, renamed)[0].title, 'New label');
  assert.equal(mergeHabits(done, renamed)[0].target, 'Twice');
  const loaded = JSON.parse(JSON.stringify(renamed));
  assert.deepEqual(mergeHabits(loaded, done), renamed);
  assert.equal(JSON.stringify(base), before);
  const invalid = { ...base, dayEdits: { '2026-02-31': { done: true, at: firstAt, id: 'bad' } } };
  assert.deepEqual(mergeHabits([invalid], [base])[0].dayEdits, {});
});
test('separate account calls do not leak records; account scoping remains caller responsibility', () => {
  const a = recordHabitEdits([habit()], [setDay(habit(), '2026-10-20', true)], firstAt, 'account-a');
  const b = mergeHabits([habit()], []);
  assert.equal(day(a[0], '2026-10-20'), true);
  assert.equal(day(b[0], '2026-10-20'), false);
  assert.equal(a[0].id, b[0].id);
});
test('retrying an older operation after a newer undo cannot reactivate a day', () => {
  const base = habit();
  const done = recordHabitEdits([base], [setDay(base, '2026-10-20', true)], firstAt, 'done');
  const undo = recordHabitEdits(done, [setDay(done[0], '2026-10-20', false)], nextAt, 'undo');
  const replay = recordHabitEdits(undo, [setDay(undo[0], '2026-10-20', true)], firstAt, 'done');
  assert.equal(day(replay[0], '2026-10-20'), false);
  assert.deepEqual(replay[0].dayEdits, undo[0].dayEdits);
  assert.deepEqual(replay, undo);
  assert.equal(day(mergeHabits(replay, done)[0], '2026-10-20'), false);
});
test('backdated calendar toggle stamps only the selected date and preserves reload, retry and undo', () => {
  const base = habit();
  const raw = toggleHabitDateValue(base, '2026-09-30', '2026-10-20');
  const done = recordHabitEdits([base], [raw], firstAt, 'backdate');
  assert.equal(done.length, 1);
  assert.equal(done[0].id, base.id);
  assert.deepEqual(Object.keys(done[0].dayEdits!), ['2026-09-30']);
  assert.equal(habitDoneOn(done[0], '2026-09-30'), true);
  assert.equal(habitDoneOn(done[0], '2026-10-20'), false);
  const loaded = JSON.parse(JSON.stringify(done));
  assert.deepEqual(mergeHabits(loaded, done), done);
  assert.deepEqual(recordHabitEdits(done, [raw], firstAt, 'backdate'), done);
  const undo = recordHabitEdits(done, [toggleHabitDateValue(done[0], '2026-09-30', '2026-10-20')], nextAt, 'backdate-undo');
  assert.equal(habitDoneOn(mergeHabits(done, undo)[0], '2026-09-30'), false);
  assert.deepEqual(Object.keys(undo[0].dayEdits!), ['2026-09-30']);
  assert.equal(habitDoneOn(base, '2026-09-30'), false);
});
test('yesterday backfill repairs streak and an undo breaks it without duplicating dates', () => {
  const base = habit();
  const today = '2026-10-20';
  let saved = recordHabitEdits([base], [toggleHabitDateValue(base, today, today)], firstAt, 'today');
  saved = recordHabitEdits(saved, [toggleHabitDateValue(saved[0], '2026-10-18', today)], nextAt, 'older');
  assert.equal(habitStreak(saved[0], today), 1);
  saved = recordHabitEdits(saved, [toggleHabitDateValue(saved[0], '2026-10-19', today)], laterAt, 'yesterday');
  assert.equal(habitStreak(saved[0], today), 3);
  assert.equal(Object.keys(saved[0].dayEdits!).length, 3);
  const undone = recordHabitEdits(saved, [toggleHabitDateValue(saved[0], '2026-10-19', today)], '2026-10-20T11:00:00Z', 'undo-yesterday');
  assert.equal(habitStreak(undone[0], today), 1);
  assert.equal(Object.keys(undone[0].dayEdits!).length, 3);
});
test('calendar toggle rejects future, malformed, unavailable and pre-creation dates', () => {
  const base = habit();
  for (const date of ['2026-10-21', '2026-02-31', '2026-2-01', 'invalid']) {
    assert.equal(toggleHabitDateValue(base, date, '2026-10-20'), base);
  }
  for (const value of [
    { ...base, createdDate: '2026-10-20' }, { ...base, isActive: false },
    { ...base, deletedAt: firstAt }, { ...base, archivedAt: firstAt },
    { ...base, frequency: 'weekdays' as const, weekdays: [2] },
    { ...base, pauseEdits: { '2026-10-18': { paused: true, at: firstAt, id: 'pause' } } },
  ]) assert.equal(toggleHabitDateValue(value, '2026-10-19', '2026-10-20'), value);
});
test('backdated calendar toggle retains leap day, year and legacy month identities', () => {
  for (const date of ['2024-02-29', '2025-12-31', '2026-07-01']) {
    const base = habit();
    const saved = recordHabitEdits([base], [toggleHabitDateValue(base, date, '2026-10-20')], firstAt, date)[0];
    assert.deepEqual(Object.keys(saved.dayEdits!), [date]);
    assert.equal(habitDoneOn(saved, date), true);
    assert.equal(habitDoneOn(saved, '2026-10-20'), false);
    if (date === '2026-07-01') assert.equal(saved.monthDays[0], true);
  }
});
console.log(`Habit sync: ${checked} targeted suites passed.`);
