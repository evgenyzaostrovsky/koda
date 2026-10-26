import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { goalOverviewItems, isPlannerDate, plannerDateOffset, plannerGoalEntries, plannerOverview } from '../src/features/koda/plannerOverview';
import { parseQuickTaskInput } from '../src/features/koda/quickTaskInput';
import { calculateGoalProgress, calculateMilestoneProgress, createGoal, createGoalAction, createGoalRoutine, createMilestone } from '../src/features/koda/goalLogic';
import { scoreWeek } from '../src/features/koda/widgetDesktop';
import type { Goal, GoalAction, KodaDay, PlannerItem } from '../src/features/koda/types';

const today = '2026-10-23';
const stamp = '2026-10-23T12:00:00.000Z';
const item = (id: string, date: string, time = '', patch: Partial<PlannerItem> = {}): PlannerItem =>
  ({ id, title: id, date, time, done: false, ...patch });
const action = (id: string, date: string, patch: Partial<GoalAction> = {}): GoalAction =>
  ({ ...createGoalAction({ title: id, dueDate: date }), id, ...patch });
const goal = (patch: Partial<Goal> = {}): Goal =>
  ({ ...createGoal({ title: 'Goal', desiredResult: '', deadline: '', priority: 'main' }, stamp), id: 'goal', ...patch });
const day = (id: string, localDate: string, patch: Partial<KodaDay> = {}): KodaDay => ({
  id, localDate, timezone: 'Europe/Moscow', status: 'completed', startedAt: stamp, finishedAt: stamp,
  goalScore: null, plannerScore: 0, totalScore: 60, classification: 'minimum', scoreVersion: 3,
  summary: '', focusLoss: '', nextRecommendation: '', goalsSnapshot: null, plannerSnapshot: null,
  calculationSnapshot: null, createdAt: stamp, updatedAt: stamp, ...patch,
});

let passed = 0;
let failed = 0;
function test(name: string, run: () => void) {
  try { run(); passed++; console.log(`PASS ${name}`); }
  catch (error) { failed++; console.error(`FAIL ${name}`); console.error(error); }
}

if (process.argv.includes('--timezone-child')) {
  const instant = new Date('2026-10-23T00:30:00Z');
  const reference = `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, '0')}-${String(instant.getDate()).padStart(2, '0')}`;
  const expected = process.env.TZ === 'America/Los_Angeles' ? '2026-10-23' : '2026-10-24';
  assert.equal(parseQuickTaskInput('Завтра в 9:15 Позвонить', '2027-01-01', '', reference)?.date, expected);
  assert.equal(plannerDateOffset('2026-03-08', 1), '2026-03-09');
  assert.equal(plannerDateOffset('2026-11-01', -1), '2026-10-31');
  console.log(`PASS local reference dates and civil DST arithmetic in ${process.env.TZ}`);
} else {
  test('planner separates overdue and undated work; orders real dates and timed items before all-day tasks', () => {
    const rows = [item('overdue', '2026-10-22', '23:00'), item('undated', ''), item('future', '2026-10-24', '07:00'),
      item('all-day', today), item('late', today, '18:30'), item('early', today, '09:00'),
      item('title-is-not-date', '2026-10-25', '', { title: 'Сегодня в 08:00' }), item('invalid', '2026-02-31')];
    const result = plannerOverview(rows, today);
    assert.deepEqual(result.upcoming.map(row => row.id), ['early', 'late', 'all-day']);
    assert.deepEqual(result.overdue.map(row => row.id), ['overdue']);
    assert.deepEqual(result.undated.map(row => row.id), ['undated']);
    assert.deepEqual(plannerOverview(rows, today, 5).upcoming.map(row => row.id), ['early', 'late', 'all-day', 'future', 'title-is-not-date']);
    assert.deepEqual(plannerOverview(rows, today, 0).upcoming, []);
    assert.deepEqual(rows.map(row => row.id), ['overdue', 'undated', 'future', 'all-day', 'late', 'early', 'title-is-not-date', 'invalid']);
  });

  test('planner excludes habits, completed, failed and deleted entries in every bucket', () => {
    const rows = ['', '2026-10-22', today, '2026-10-24'].flatMap((date, index) => [
      item(`habit:${index}`, date), item(`done-${index}`, date, '', { done: true }),
      item(`failed-${index}`, date, '', { failed: true }), item(`deleted-${index}`, date, '', { deletedAt: stamp }),
    ]);
    assert.deepEqual(plannerOverview(rows, today), { upcoming: [], overdue: [], undated: [] });
  });

  test('planner aliases of goal/project work appear once and separate owners remain separate', () => {
    const goalLink = { sourceType: 'goal' as const, goalId: 'g', goalActionId: 'a' };
    const projectLink = { sourceType: 'project' as const, ownerId: 'p', sourceId: 'task' };
    const rows = [item('project-source', today, '', projectLink), item('goal-source', today, '', goalLink),
      item('goal-copy', today, '', goalLink), item('project-copy', today, '', projectLink),
      item('different-project', today, '', { ...projectLink, ownerId: 'other-project' })];
    const result = plannerOverview(rows, today, 10);
    assert.equal(result.upcoming.length, 3);
    assert.equal(result.upcoming.filter(row => row.goalId === 'g').length, 1);
    assert.equal(result.upcoming.filter(row => row.ownerId === 'p').length, 1);
    assert.equal(result.upcoming.filter(row => row.ownerId === 'other-project').length, 1);
  });

  test('stale duplicate cannot resurrect a newer completion when input order changes', () => {
    const stale = item('same', today, '', { updatedAt: '2026-10-23T10:00:00.000Z' });
    const completed = { ...stale, done: true, updatedAt: '2026-10-23T11:00:00.000Z' };
    assert.deepEqual(plannerOverview([stale, completed], today).upcoming, []);
    assert.deepEqual(plannerOverview([completed, stale], today).upcoming, []);
  });

  test('goal projection retains actual due dates, deferrals and completion, excluding archived and blocked actions', () => {
    const source = goal({ actions: [action('old', '2026-10-20'), action('future', '2026-10-26'),
      action('deferred', '2026-10-21', { deferredUntil: '2026-10-25' }), action('no-date', ''), action('invalid-date', '2026-02-31'),
      action('archived', today, { archivedAt: stamp }), action('blocked', today, { dependsOn: ['missing'] }),
      action('completed', today, { status: 'completed' }), action('unblocked', today, { dependsOn: ['completed'] })] });
    const before = JSON.stringify(source);
    const projected = goalOverviewItems([source], today);
    assert.deepEqual(projected.map(row => row.sourceId), ['old', 'future', 'deferred', 'completed', 'unblocked']);
    assert.equal(projected.find(row => row.sourceId === 'deferred')?.date, '2026-10-25');
    assert.equal(projected.find(row => row.sourceId === 'completed')?.done, true);
    assert.equal(projected.find(row => row.sourceId === 'unblocked')?.goalActionId, 'unblocked');
    const overview = plannerOverview(projected, today, 10);
    assert.deepEqual(overview.overdue.map(row => row.sourceId), ['old']);
    assert.deepEqual(overview.upcoming.map(row => row.sourceId), ['unblocked', 'deferred', 'future']);
    assert.equal(JSON.stringify(source), before, 'projection must not move dates in the saved goal');
    assert.deepEqual(goalOverviewItems([{ ...source, archivedAt: stamp }, { ...source, status: 'paused' }, { ...source, status: 'completed' }], today), []);
    assert.equal(plannerGoalEntries(source, today).some(entry => entry.kind === 'action' && ['blocked', 'archived', 'deferred'].includes(entry.action.id)), false);
  });

  test('routine projection uses scheduled weekdays, real completion logs and a bounded horizon', () => {
    const routine = { ...createGoalRoutine({ title: 'Practice', metricType: 'count', targetValue: 2,
      frequencyType: 'selected_weekdays', weekdays: [1], startDate: today }), id: 'routine' };
    const source = goal({ routines: [routine], routineLogs: [{ id: 'log', routineId: 'routine', date: '2026-10-26', value: 2, createdAt: stamp, updatedAt: stamp }] });
    const projected = goalOverviewItems([source], today);
    assert.deepEqual(projected.map(row => [row.date, row.done]), [['2026-10-26', true], ['2026-11-02', false]]);
    assert.deepEqual(plannerOverview(projected, today).upcoming.map(row => row.date), ['2026-11-02']);
    assert.deepEqual(goalOverviewItems([{ ...source, routines: [{ ...routine, isActive: false }] }], today), []);
    assert.deepEqual(goalOverviewItems([{ ...source, routines: [{ ...routine, startDate: '2026-12-01' }] }], today), []);
  });

  test('civil date validation and offsets cross leap days, month/year boundaries', () => {
    assert.equal(isPlannerDate('2024-02-29'), true);
    for (const invalid of ['2026-02-29', '2026-02-31', '2026-13-01', '2026-10-00', '2026-1-01', '']) assert.equal(isPlannerDate(invalid), false);
    assert.equal(plannerDateOffset('2024-02-28', 1), '2024-02-29');
    assert.equal(plannerDateOffset('2024-03-01', -1), '2024-02-29');
    assert.equal(plannerDateOffset('2026-12-31', 1), '2027-01-01');
    assert.equal(plannerDateOffset('2026-01-01', -1), '2025-12-31');
  });

  test('quick input handles capitalized Russian relative dates using local reference, explicit dates and times', () => {
    assert.deepEqual(parseQuickTaskInput('Завтра в 09:30 Позвонить', '2027-05-15', '08:00', today), { date: '2026-10-24', time: '09:30', title: 'Позвонить' });
    assert.deepEqual(parseQuickTaskInput('ПОСЛЕЗАВТРА Купить продукты в 18', today, '', today), { date: '2026-10-25', time: '18:00', title: 'Купить продукты' });
    assert.deepEqual(parseQuickTaskInput('Сегодня Отправить письмо', '2027-05-15', '', today), { date: today, time: '', title: 'Отправить письмо' });
    assert.deepEqual(parseQuickTaskInput('01.11.2026 в 08:05 Приём', today, '', today), { date: '2026-11-01', time: '08:05', title: 'Приём' });
    assert.deepEqual(parseQuickTaskInput('01/11/26 Приём', today, '', today), { date: '2026-11-01', time: '', title: 'Приём' });
    assert.deepEqual(parseQuickTaskInput('05.01 Забрать заказ', '2026-12-31', '', '2026-12-31'), { date: '2027-01-05', time: '', title: 'Забрать заказ' });
    assert.deepEqual(parseQuickTaskInput('Встреча в 18.30', today, '', today), { date: today, time: '18:30', title: 'Встреча' });
    assert.deepEqual(parseQuickTaskInput('  Обычная задача  ', today, '9:15', today), { date: today, time: '09:15', title: 'Обычная задача' });
  });

  test('quick input refuses impossible dates/times and date-only empty tasks', () => {
    for (const value of ['31.02.2026 Встреча', '29.02.2026 Встреча', 'Встреча в 25:00', 'Встреча в 10:61', 'Встреча в 24', 'Завтра', 'в 09:30', '']) {
      assert.equal(parseQuickTaskInput(value, today, '', today), null, value);
    }
    assert.equal(parseQuickTaskInput('Задача', '2026-02-31', '', today), null);
    assert.equal(parseQuickTaskInput('Задача', today, '25:00', today), null);
    assert.equal(parseQuickTaskInput('Задача', today, '', '2026-02-31'), null);
  });

  test('progress counts repeated action IDs once and resolves inconsistent duplicate completion conservatively', () => {
    const milestone = { ...createMilestone('Stage'), id: 'stage' };
    const completed = action('completed', '', { milestoneId: 'stage', status: 'completed' });
    const pending = action('pending', '', { milestoneId: 'stage' });
    const repeated = [completed, completed, pending];
    assert.equal(calculateMilestoneProgress(milestone, repeated), 50);
    assert.equal(calculateGoalProgress(goal({ actions: repeated })), 50);
    for (const actions of [[completed, { ...completed, status: 'pending' as const }, pending], [pending, { ...completed, status: 'pending' as const }, completed]]) {
      assert.equal(calculateMilestoneProgress(milestone, actions), 0);
      assert.equal(calculateGoalProgress(goal({ actions })), 0);
    }
    assert.equal(calculateMilestoneProgress(milestone, [completed, pending, action('archive', '', { milestoneId: 'stage', archivedAt: stamp })]), 50);
  });

  test('archiving a goal, repeated stages and reordering retain real progress without creation credit', () => {
    const stages = [0, 1, 2, 3].map(index => ({ ...createMilestone(`Stage ${index}`, '', '', index), id: `stage-${index}` }));
    const source = goal({ milestones: stages });
    assert.equal(calculateGoalProgress(source), 0);
    source.milestones[0].status = 'completed';
    assert.equal(calculateGoalProgress(source), 25);
    assert.equal(calculateGoalProgress({ ...source, archivedAt: stamp, status: 'archived' }), 25);
    assert.equal(calculateGoalProgress({ ...source, milestones: [...stages, stages[0]] }), 25);
    assert.equal(calculateGoalProgress({ ...source, milestones: [...stages].reverse().map((stage, position) => ({ ...stage, position })) }), 25);
    assert.equal(calculateGoalProgress({ ...source, milestones: stages.slice(0, 3) }), 33);
  });

  test('score week preserves calendar gaps and distinguishes legacy/active/missing from recorded zero', () => {
    const records = [day('legacy', '2026-10-18', { scoreVersion: 2, totalScore: 99 }),
      day('active', '2026-10-19', { status: 'active', totalScore: 80 }),
      day('zero', '2026-10-20', { totalScore: 0 }), day('completed', '2026-10-21', { totalScore: 75 }),
      day('null', '2026-10-22', { totalScore: null }), day('nonfinite', today, { totalScore: Number.NaN }),
      day('outside', '2026-10-16', { totalScore: 100 })];
    const result = scoreWeek(records, today);
    assert.deepEqual(result.map(row => row.date), ['2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', today]);
    assert.deepEqual(result.map(row => row.value), [null, null, null, 0, 75, null, null]);
    assert.deepEqual(result.slice(0, 5).map(row => row.status), ['empty', 'legacy', 'active', 'completed', 'completed']);
    assert.equal(result[0].day, undefined);
    assert.equal(result[3].day?.id, 'zero');
    assert.deepEqual(scoreWeek([], today, 2).map(row => row.value), [null, null]);
  });

  test('score week chooses latest day revision, independent of input order', () => {
    const older = day('old', today, { totalScore: 10, updatedAt: '2026-10-23T10:00:00.000Z' });
    const newer = day('new', today, { totalScore: 0, updatedAt: '2026-10-23T11:00:00.000Z' });
    assert.equal(scoreWeek([older, newer], today, 1)[0].value, 0);
    assert.deepEqual(scoreWeek([older, newer], today, 1), scoreWeek([newer, older], today, 1));
    const reopened = { ...newer, status: 'active' as const, updatedAt: '2026-10-23T12:00:00.000Z' };
    assert.equal(scoreWeek([older, reopened], today, 1)[0].value, null);
    assert.equal(scoreWeek([older, reopened], today, 1)[0].status, 'active');
  });

  test('local tomorrow and DST date arithmetic are stable in Moscow and Los Angeles', () => {
    for (const timezone of ['Europe/Moscow', 'America/Los_Angeles']) {
      const child = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/test-refinement41-planner.ts'), '--timezone-child'],
        { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
      assert.equal(child.status, 0, `${timezone}: ${child.stdout}\n${child.stderr}`);
    }
  });
  console.log(`Refinement 4.1 planner: ${passed} suites passed; ${failed} failed.`);
  if (failed) process.exitCode = 1;
}

assert.deepEqual(parseQuickTaskInput('в 10.05 встреча','2026-10-25','','2026-10-25'),{date:'2026-10-25',time:'10:05',title:'встреча'});
assert.deepEqual(parseQuickTaskInput('завтра в 10.05 встреча','2026-10-25','','2026-10-25'),{date:'2026-10-26',time:'10:05',title:'встреча'});
assert.equal(parseQuickTaskInput('в 25.10 встреча','2026-10-25','','2026-10-25'),null);
console.log('Explicit dotted clock times are not confused with calendar dates.');
