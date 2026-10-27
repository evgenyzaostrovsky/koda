import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { transpileModule } from 'typescript';
import type { Habit } from '../src/features/koda/types';
import { createHabit, habitDoneOn, habitIcon, habitIsDue, habitMetadata, habitStreak } from '../src/features/koda/habitModel';
import { mergeHabits, recordHabitEdits } from '../src/features/koda/habitSync';
import { parseStoredKodaState } from '../src/features/koda/persistence';
import { buildHabitPlannerItems } from '../src/features/koda/plannerProjections';
import { getHabitMonthDays, todayDateKey } from '../src/features/koda/utils';
import { acceptDayPlan, calculatePlanScore, suggestDayPlan } from '../src/features/koda/dayPlan';
import { parseDayPlanState, syncDayPlanProgress, syncExplicitSourceChanges } from '../src/features/koda/dayPlanSync';
import { buildProjectPlannerItems } from '../src/features/koda/plannerProjections';

const firstAt = '2026-10-20T08:00:00.000Z';
const nextAt = '2026-10-20T09:00:00.000Z';
const laterAt = '2026-10-20T10:00:00.000Z';
function base(): Habit {
  return { id: 'widget-habit', title: 'Walk', target: 'Daily', doneDays: Array(7).fill(false), monthDays: Array(31).fill(false), monthHistory: {} };
}
function setDay(habit: Habit, date: string, done = true): Habit {
  const [year, month, day] = date.split('-').map(Number);
  const days = getHabitMonthDays(habit, year, month - 1).map((value, index) => index === day - 1 ? done : value);
  return { ...habit, monthHistory: { ...habit.monthHistory, [date.slice(0, 7)]: days } };
}
let count = 0;
function test(name: string, run: () => void) { run(); count++; console.log(`PASS ${name}`); }

if (process.argv.includes('--timezone-child')) {
  const instant = new Date('2026-03-09T02:30:00Z');
  const local = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
  assert.equal(local, process.env.TZ === 'America/Los_Angeles' ? '2026-03-08' : '2026-03-09');
  const sunday = { ...base(), frequency: 'weekdays' as const, weekdays: [0] };
  assert.equal(habitIsDue(sunday, local), local === '2026-03-08');
  const completed = setDay(setDay(sunday, '2026-03-01'), '2026-03-08');
  assert.equal(habitStreak(completed, local), 2);
  assert.equal(habitDoneOn(completed, local), local === '2026-03-08');
  assert.equal(createHabit('Local day').createdDate, todayDateKey());
  console.log(`PASS local civil dates across DST: ${process.env.TZ}`);
} else {
  test('legacy habits remain daily and active, with safe metadata defaults', () => {
    assert.equal(habitIsDue(base(), '2026-10-24'), true);
    assert.equal(habitIcon(base()), '✨');
    assert.deepEqual(habitMetadata(base()), { icon: '✨', frequency: 'daily', weekdays: [1, 2, 3, 4, 5], isActive: true, createdDate: undefined });
    const invalid = { ...base(), icon: 7, frequency: 'invalid', weekdays: [2, 2, 8, -1, 1.5, '3'], isActive: 'no', createdDate: '2026-02-31' };
    const loaded = parseStoredKodaState(JSON.stringify({ habits: [invalid] }))!.habits[0];
    assert.equal(loaded.icon, '✨');
    assert.equal(loaded.frequency, 'daily');
    assert.deepEqual(loaded.weekdays, [2]);
    assert.equal(loaded.isActive, true);
    assert.equal(loaded.createdDate, undefined);
    const explicitDefaults = { ...base(), ...habitMetadata(base()) };
    assert.deepEqual(mergeHabits([base()], [explicitDefaults]), mergeHabits([explicitDefaults], [base()]));
  });
  test('metadata round trip preserves dates, pause, and explicit empty weekday schedule', () => {
    const habit = createHabit('  Read  ', { id: 'read', icon: '📚', frequency: 'weekdays', weekdays: [5, 1, 1], isActive: false, createdDate: '2026-10-19' });
    const saved = recordHabitEdits([], [habit], firstAt, 'create')[0];
    const restored = parseStoredKodaState(JSON.stringify({ habits: [saved] }))!.habits[0];
    assert.deepEqual(restored, saved);
    assert.deepEqual(restored.weekdays, [1, 5]);
    assert.equal(restored.title, 'Read');
    assert.equal(restored.metadataUpdatedAt, firstAt);
    assert.deepEqual(parseStoredKodaState(JSON.stringify({ habits: [base()] }))!.habits[0], base());
    assert.equal(habitIsDue(createHabit('Empty schedule', { frequency: 'weekdays', weekdays: [], createdDate: '2026-10-01' }), '2026-10-20'), false);
  });
  test('metadata LWW is independent of a later day completion from another device', () => {
    const initial = recordHabitEdits([], [base()], firstAt, 'create');
    const configured = recordHabitEdits(initial, [{ ...initial[0], title: 'Run', icon: '🏃', frequency: 'weekdays', weekdays: [2, 4], isActive: false, createdDate: '2026-10-01' }], nextAt, 'config');
    const checked = recordHabitEdits(initial, [setDay(initial[0], '2026-10-20')], laterAt, 'check');
    const merged = mergeHabits(configured, checked);
    assert.deepEqual(merged, mergeHabits(checked, configured));
    assert.equal(merged[0].title, 'Run');
    assert.equal(merged[0].icon, '🏃');
    assert.equal(merged[0].frequency, 'weekdays');
    assert.equal(merged[0].isActive, false);
    assert.equal(merged[0].metadataUpdatedAt, nextAt);
    assert.equal(merged[0].updatedAt, laterAt);
    assert.equal(habitDoneOn(merged[0], '2026-10-20'), true);
    assert.deepEqual(mergeHabits(merged, checked), merged);
    assert.deepEqual(recordHabitEdits(merged, configured, nextAt, 'config'), merged);
    const latest = recordHabitEdits(configured, [{ ...configured[0], icon: '🌿', isActive: true }], laterAt, 'activate');
    assert.equal(mergeHabits(merged, latest)[0].icon, '🌿');
    assert.deepEqual(mergeHabits(mergeHabits(configured, checked), latest), mergeHabits(configured, mergeHabits(checked, latest)));
  });
  test('same-time metadata conflicts converge and deletion survives metadata updates', () => {
    const initial = recordHabitEdits([], [base()], firstAt, 'create');
    const a = recordHabitEdits(initial, [{ ...initial[0], weekdays: [1], frequency: 'weekdays' }], nextAt, 'a');
    const b = recordHabitEdits(initial, [{ ...initial[0], weekdays: [2], frequency: 'weekdays' }], nextAt, 'b');
    assert.deepEqual(mergeHabits(a, b), mergeHabits(b, a));
    const removed = recordHabitEdits(a, [], laterAt, 'delete');
    const merged = mergeHabits(removed, b)[0];
    assert.equal(merged.deletedAt, laterAt);
    assert.equal(habitIsDue(merged, '2026-10-20'), false);
    assert.equal(buildHabitPlannerItems([merged], '2026-10-20').length, 0);
  });
  test('planner excludes inactive, unscheduled, future-created and invalid dates', () => {
    const scheduled = { ...base(), frequency: 'weekdays' as const, weekdays: [1, 3], createdDate: '2026-10-19' };
    assert.equal(buildHabitPlannerItems([scheduled], '2026-10-19').length, 1);
    assert.equal(buildHabitPlannerItems([scheduled], '2026-10-20').length, 0);
    assert.equal(buildHabitPlannerItems([scheduled], '2026-10-12').length, 0);
    assert.equal(buildHabitPlannerItems([{ ...scheduled, isActive: false }], '2026-10-19').length, 0);
    assert.equal(buildHabitPlannerItems([base()], '2026-02-31').length, 0);
  });
  test('dated completion ignores weekly mirrors and honors explicit false', () => {
    const mirror = { ...base(), doneDays: Array(7).fill(true) };
    assert.equal(habitDoneOn(mirror, '2026-10-20'), false);
    assert.equal(habitStreak(mirror, '2026-10-20'), 0);
    const legacy = { ...mirror, monthDays: [true] };
    assert.equal(habitDoneOn(legacy, '2026-07-01'), true);
    assert.equal(habitDoneOn(legacy, '2026-10-01'), false);
    const done = setDay(mirror, '2026-10-20');
    const undone = { ...done, dayEdits: { '2026-10-20': { done: false, at: firstAt, id: 'undo' } } };
    assert.equal(habitDoneOn(undone, '2026-10-20'), false);
    assert.equal(buildHabitPlannerItems([undone], '2026-10-20')[0].done, false);
    assert.equal(habitDoneOn({ ...mirror, dayEdits: { '2026-10-20': { done: true, at: firstAt, id: 'only-edit' } } }, '2026-10-20'), true);
  });
  test('streak skips rest days, allows unfinished today, breaks on missed scheduled days', () => {
    const weekday = { ...base(), frequency: 'weekdays' as const, weekdays: [1, 3, 5], createdDate: '2026-10-01' };
    const done = ['2026-10-16', '2026-10-19', '2026-10-21'].reduce((habit, date) => setDay(habit, date), weekday as Habit);
    assert.equal(habitStreak(done, '2026-10-21'), 3);
    assert.equal(habitStreak(done, '2026-10-22'), 3);
    assert.equal(habitStreak(done, '2026-10-23'), 3);
    assert.equal(habitStreak(done, '2026-10-24'), 0);
    assert.equal(habitStreak({ ...done, createdDate: '2026-10-19' }, '2026-10-21'), 2);
    assert.equal(habitStreak({ ...done, isActive: false }, '2026-10-21'), 0);
    assert.equal(habitStreak({ ...done, weekdays: [] }, '2026-10-21'), 0);
  });
  test('daily streak crosses leap day and year boundary without borrowing future completions', () => {
    const leap = ['2024-02-28', '2024-02-29', '2024-03-01'].reduce((habit, date) => setDay(habit, date), base());
    assert.equal(habitStreak(leap, '2024-03-01'), 3);
    assert.equal(habitStreak(leap, '2024-02-28'), 1);
    const year = setDay(setDay(base(), '2025-12-31'), '2026-01-01');
    assert.equal(habitStreak(year, '2026-01-01'), 2);
  });
  test('actual source-edit handler persists imported progress before pause, deletion or undo', () => {
    // Execute the actual handler with local fixtures, without mounting React or loading native modules.
    const app = readFileSync(resolve('src/features/koda/KodaApp.tsx'), 'utf8');
    const start = app.indexOf('  function commitExplicitSources(');
    const end = app.indexOf('  function updatePlannerSources(', start);
    assert.ok(start >= 0 && end > start, 'The integration handler must be available to this regression test');
    const handler = transpileModule(app.slice(start, end), {}).outputText;
    const makeHandler = new Function('context', `const { editSources, goals, plannerItems, projects, habits, kodaDays, profile,
      todayDateKey, buildProjectPlannerItems, buildHabitPlannerItems, syncDayPlanProgress,
      syncExplicitSourceChanges, updateKodaDays } = context; ${handler}; return commitExplicitSources;`);
    const date = '2026-10-20';
    const initial = base();
    const root = acceptDayPlan(suggestDayPlan([], buildHabitPlannerItems([initial], date), date), { versionId: 'widget-root', at: firstAt });
    // Another device completes the habit without having this accepted plan.
    const completed = setDay(initial, date);
    for (const change of ['pause', 'delete', 'undo'] as const) {
      const sources = { goals: [], plannerItems: [], projects: [], habits: [completed] };
      let days = [{ id: 'widget-day', status: 'active', plan: root }];
      const commit = makeHandler({ ...sources, profile: {}, editSources: { current: sources }, kodaDays: days,
        todayDateKey: () => date, buildProjectPlannerItems, buildHabitPlannerItems, syncDayPlanProgress, syncExplicitSourceChanges,
        updateKodaDays: (update: (items: typeof days) => typeof days) => { days = update(days); },
      });
      assert.equal(calculatePlanScore(root).totalScore, 0);
      const nextHabits = change === 'pause' ? [{ ...completed, isActive: false }]
        : change === 'delete' ? [] : [setDay(completed, date, false)];
      commit({ habits: nextHabits });
      const persisted = parseDayPlanState(JSON.parse(JSON.stringify(days[0].plan)))!;
      assert.ok(persisted);
      assert.equal(calculatePlanScore(persisted).totalScore, change === 'undo' ? 0 : 100, change);
      assert.equal(persisted.progress.length, change === 'undo' ? 2 : 1, `${change}: import is stored before correction`);
      assert.equal(syncDayPlanProgress(persisted, [], buildHabitPlannerItems([completed], date)), persisted,
        `${change}: stale source reload neither duplicates the fact nor revives an explicit undo`);
    }
  });
  test('timezone boundaries and DST preserve local civil date identity', () => {
    for (const timezone of ['America/Los_Angeles', 'Europe/Moscow']) {
      const child = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/test-widget-habits.ts'), '--timezone-child'], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
      assert.equal(child.status, 0, `${timezone}: ${child.stdout}\n${child.stderr}`);
    }
  });
  console.log(`Widget habits: ${count} targeted suites passed.`);
}
