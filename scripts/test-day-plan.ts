import assert from 'node:assert/strict';
import { acceptDayPlan, calculatePlanScore, completionLocalDate, getCurrentPlanVersion, isPlanRoutineDue,
  planProgressValue, recordPlanProgress, reviseDayPlan, splitPlanItem, suggestDayPlan,
  resolveDayPlanConflict,
  type DayPlanItem, type DayPlanProposal, type DayPlanState } from '../src/features/koda/dayPlan';
import { mergeDayPlans, parseDayPlanState, syncDayPlanProgress, syncExplicitSourceChanges } from '../src/features/koda/dayPlanSync';
import type { Goal, GoalRoutine, PlannerItem } from '../src/features/koda/types';

const date = '2026-10-20';
const at = `${date}T08:00:00.000Z`;
const options = { versionId: 'initial', at, ownerId: 'alice' };
let checked = 0;
const testFilter = process.argv[2];
function test(name: string, run: () => void) {
  if (testFilter && !name.includes(testFilter)) return;
  run(); checked++; console.log(`PASS ${name}`);
}
function close(actual: number | null, expected: number) { assert.ok(actual !== null && Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
function goal(id = 'g', priority: Goal['priority'] = 'main', count = 1): Goal {
  return { id, title: id, priority, status: 'active', desiredResult: '', deadline: '', createdAt: at, updatedAt: at,
    completedAt: null, archivedAt: null, milestones: [], routines: [], routineLogs: [],
    actions: Array.from({ length: count }, (_, index) => ({ id: `${id}-${index}`, title: `Action ${index}`, description: '',
      dueDate: date, estimatedMinutes: 10, importance: 'normal', milestoneId: null, status: 'pending', position: index, completedAt: null })) };
}
function task(id = 't', subtasks = 0): PlannerItem {
  return { id, title: id, date, time: '', done: false, ownerId: 'alice',
    subtasks: Array.from({ length: subtasks }, (_, index) => ({ id: `${id}-${index}`, title: `Step ${index}`, done: false })) };
}
function proposal(items: readonly DayPlanItem[], minimum: DayPlanProposal['minimum'] = null): DayPlanProposal {
  return { date, items, minimum, availableMinutes: 120, reserveRatio: 0.2 };
}
function measurable(target = 30): DayPlanItem {
  return { sourceKey: 'practice', budgetKey: 'practice', title: 'Practice', category: 'goal', goalId: 'g', goalTitle: 'G',
    priority: 'main', metric: 'minutes', targetValue: target, estimatedMinutes: target, source: { kind: 'routine', id: 'r', goalId: 'g' } };
}
function finish(state: DayPlanState): DayPlanState {
  return getCurrentPlanVersion(state).items.reduce((next, item, index) => recordPlanProgress(next, item.sourceKey, item.targetValue, `done-${index}`, { at }), state);
}
function score(state: DayPlanState) { return calculatePlanScore(state).totalScore; }

test('01 easy day: one completed commitment reaches 100', () => {
  const state = acceptDayPlan(suggestDayPlan([goal()], [], date, { availableMinutes: 15 }), options);
  assert.equal(getCurrentPlanVersion(state).items.length, 1);
  close(score(finish(state)), 100);
});
test('02 heavy day: 64 actions do not become today; time reserve is respected', () => {
  const planned = suggestDayPlan([goal('g', 'main', 64)], Array.from({ length: 30 }, (_, i) => task(`t${i}`)), date, { availableMinutes: 90 });
  assert.ok(planned.items.length <= 6);
  assert.ok(planned.items.reduce((sum, item) => sum + item.estimatedMinutes, 0) <= 72);
  assert.equal(planned.items.filter(item => item.goalId === 'g').length, 2);
  close(score(finish(acceptDayPlan(planned, options))), 100);
});
test('03 goals-only normalized to 100', () => close(score(finish(acceptDayPlan(suggestDayPlan([goal()], [], date), options))), 100));
test('04 planner-only normalized to 100; failed flag has no penalty', () => {
  const state = acceptDayPlan(suggestDayPlan([], [task(), { ...task('other'), failed: true }], date), options);
  close(score(recordPlanProgress(state, 'planner:t', 1, 'done', { at })), 50);
});
test('05 no accepted/empty plan has no fictional score', () => {
  assert.equal(calculatePlanScore(null).totalScore, null);
  assert.equal(score(acceptDayPlan(proposal([]), options)), null);
});
test('06 partial minutes/count/subtasks and binary result', () => {
  const minute = acceptDayPlan(proposal([measurable()]), options);
  close(score(recordPlanProgress(minute, 'practice', 15, 'half', { at })), 50);
  const count = acceptDayPlan(proposal([{ ...measurable(4), metric: 'count' }]), options);
  close(score(recordPlanProgress(count, 'practice', 1, 'quarter', { at })), 25);
  const binary = acceptDayPlan(proposal([{ ...measurable(1), metric: 'binary' }]), options);
  close(score(recordPlanProgress(binary, 'practice', 0.5, 'opened-form', { at })), 0);
  const parent = task('parent', 4);
  const sub = acceptDayPlan(suggestDayPlan([], [parent], date), options);
  const partial = { ...parent, subtasks: parent.subtasks!.map((step, index) => ({ ...step, done: index === 0 })) };
  close(score(syncDayPlanProgress(sub, [], [partial], { at })), 25);
});
test('07 minimum achieved separately without bonus', () => {
  let state = acceptDayPlan(proposal([measurable(60)], { sourceKey: 'practice', targetValue: 10, label: '10 minutes' }), options);
  state = recordPlanProgress(state, 'practice', 10, 'minimum', { at });
  assert.equal(calculatePlanScore(state).minimumCompleted, true);
  close(score(state), 100 / 6);
});
test('08 two explicit revisions preserve original and adaptation scores', () => {
  let state = acceptDayPlan(proposal([measurable(60)]), options);
  state = recordPlanProgress(state, 'practice', 10, 'fact', { at });
  state = reviseDayPlan(state, proposal([measurable(30)]), 'Less time', { versionId: 'r1', at });
  state = reviseDayPlan(state, proposal([measurable(10)]), 'Unexpected appointment', { versionId: 'r2', at });
  const result = calculatePlanScore(state);
  close(result.originalScore, 100 / 6);
  close(result.totalScore, 100 / 6);
  close(result.currentScore, 100);
  assert.equal(result.revisionCount, 2);
  assert.equal(state.versions[0].items[0].targetValue, 60);
  close(calculatePlanScore(state, 'r1').totalScore, 100 / 3);
});
test('09 splitting work preserves the root budget and expected volume', () => {
  const original = measurable(30);
  const plain = acceptDayPlan(proposal([original]), options);
  const split = acceptDayPlan(proposal(splitPlanItem(original, ['First half', 'Second half'])), options);
  assert.equal(getCurrentPlanVersion(split).items.length, 1);
  close(score(recordPlanProgress(split, original.sourceKey, 15, 'half', { at })), score(recordPlanProgress(plain, original.sourceKey, 15, 'half', { at }))!);
  assert.throws(() => acceptDayPlan(proposal([{ ...original, sourceKey: 'invented-child' }]), options));
});
test('10 deleting unfinished parent/subtasks cannot inflate score', () => {
  const tasks = [task('a', 2), task('b')];
  let state = acceptDayPlan(suggestDayPlan([], tasks, date), options);
  const half = { ...tasks[0], subtasks: tasks[0].subtasks!.map((entry, index) => ({ ...entry, done: index === 0 })) };
  state = syncDayPlanProgress(state, [], [half, tasks[1]], { at });
  const before = score(state);
  const deletedStep = { ...half, done: true, subtasks: half.subtasks.filter(entry => entry.done) };
  state = syncDayPlanProgress(state, [], [deletedStep, { ...tasks[1], deletedAt: at }], { at });
  close(score(state), before!);
  close(score(syncDayPlanProgress(state, [], [], { at })), before!);
});
test('11 moving commitments does not create work or destroy facts', () => {
  const t = task();
  let state = acceptDayPlan(suggestDayPlan([], [t], date), options);
  state = syncDayPlanProgress(state, [], [{ ...t, date: '2026-10-21', done: true }], { at });
  close(score(state), 0);
  state = syncDayPlanProgress(state, [], [{ ...t, done: true }], { at });
  close(score(syncDayPlanProgress(state, [], [{ ...t, date: '2026-10-21' }], { at })), 100);
});
test('12 changing live priorities and renaming does not change snapshot', () => {
  const g = goal();
  const state = acceptDayPlan(suggestDayPlan([g], [], date), options);
  const before = JSON.stringify(state.versions);
  g.title = 'Renamed'; g.priority = 'supporting'; g.actions[0].title = 'Changed';
  assert.equal(JSON.stringify(syncDayPlanProgress(state, [g], [], { at }).versions), before);
  assert.ok(Object.isFrozen(state.versions[0].items[0]));
});
test('13 priorities 3:2:1, budgets per goal, categories 75:25', () => {
  const goals = [goal('main', 'main', 2), goal('important', 'important'), goal('supporting', 'supporting')];
  const state = acceptDayPlan(suggestDayPlan(goals, [task()], date, { availableMinutes: 400, maxItems: 20 }), options);
  const entries = getCurrentPlanVersion(state).items;
  close(entries.filter(item => item.goalId === 'main').reduce((n, item) => n + item.weight, 0), 37.5);
  close(entries.filter(item => item.goalId === 'important').reduce((n, item) => n + item.weight, 0), 25);
  close(entries.filter(item => item.goalId === 'supporting').reduce((n, item) => n + item.weight, 0), 12.5);
  close(entries.filter(item => item.category === 'planner').reduce((n, item) => n + item.weight, 0), 25);
});
test('14 offline fact/revision survives JSON reload and repeated delivery', () => {
  let state = acceptDayPlan(proposal([measurable()]), options);
  state = recordPlanProgress(state, 'practice', 15, 'offline', { at });
  state = reviseDayPlan(state, proposal([measurable(20)]), 'Reconsidered', { versionId: 'revision', at });
  const reloaded = parseDayPlanState(JSON.stringify(state));
  assert.ok(reloaded);
  assert.deepEqual(reloaded, state);
  assert.equal(recordPlanProgress(reloaded, 'practice', 15, 'offline', { at }), reloaded);
  close(calculatePlanScore(mergeDayPlans(reloaded, state)).originalScore, 50);
  close(score(mergeDayPlans(reloaded, state)), 50);
});
test('15 competing revisions retained; progress merges by causality, not sum or clock', () => {
  const base = acceptDayPlan(proposal([measurable()]), options);
  let a = reviseDayPlan(base, proposal([measurable(20)]), 'Device A', { versionId: 'a', at });
  let b = reviseDayPlan(base, proposal([measurable(10)]), 'Device B', { versionId: 'b', at });
  a = recordPlanProgress(a, 'practice', 10, 'a-progress', { at: '2030-01-01T00:00:00Z' });
  b = recordPlanProgress(b, 'practice', 15, 'b-progress', { at: '2020-01-01T00:00:00Z' });
  const merged = mergeDayPlans(a, b);
  assert.deepEqual(merged, mergeDayPlans(b, a));
  assert.equal(merged.versions.length, 3);
  assert.equal(calculatePlanScore(merged).hasConflicts, true);
  assert.equal(merged.currentVersionId, 'b');
  close(calculatePlanScore(merged).originalScore, 50);
  close(score(merged), 50);
  const correction = recordPlanProgress(merged, 'practice', 5, 'explicit-correction', { at });
  close(calculatePlanScore(mergeDayPlans(correction, a)).originalScore, 100 / 6);
  close(score(mergeDayPlans(correction, a)), 100 / 6);
});
test('16 returning after a week does not repeat old completion or old regular logs', () => {
  const g = goal();
  g.actions[0].status = 'completed'; g.actions[0].completedAt = '2026-10-13T10:00:00Z';
  const plan = suggestDayPlan([g], [], date);
  assert.equal(plan.items.length, 0);
  assert.equal(suggestDayPlan([goal('backlog', 'main', 64)], [], date).items.length, 2);
  const state = acceptDayPlan(proposal([measurable()]), options);
  g.routineLogs = [{ id: 'log', routineId: 'r', date: '2026-10-13', value: 30, createdAt: at, updatedAt: at }];
  close(score(syncDayPlanProgress(state, [g], [], { at })), 0);
});
test('linked planner and action representations never receive double budget', () => {
  const g = goal();
  const linked = { ...task(), goalId: g.id, goalActionId: g.actions[0].id, sourceType: 'goal' as const };
  const state = acceptDayPlan(suggestDayPlan([g], [linked, { ...linked, id: 'copy' }], date), options);
  assert.equal(getCurrentPlanVersion(state).items.length, 1);
  close(score(syncDayPlanProgress(state, [g], [{ ...linked, done: true }], { at })), 100);
});
test('minute session fits the main goal, keeps canonical target and supports full preview', () => {
  const g = goal();
  g.actions = [];
  g.routines = [{ id: 'long', title: 'Practice', metricType: 'minutes', targetValue: 120,
    frequencyType: 'daily', weekdays: [], startDate: date, endDate: '', isActive: true }];
  const suggested = suggestDayPlan([g], [task()], date, { availableMinutes: 60 });
  const routine = suggested.items.find(item => item.source.kind === 'routine');
  assert.ok(routine);
  assert.equal(routine.targetValue, 24);
  assert.equal(routine.estimatedMinutes, 24);
  assert.equal(routine.explanation, 'Посильная часть регулярного действия: 24 из 120 мин');
  assert.equal(suggested.items[0].goalId, g.id);
  assert.equal(g.routines[0].targetValue, 120);
  assert.ok(suggested.items.some(item => item.category === 'planner'));
  assert.ok(suggested.items.reduce((sum, item) => sum + item.estimatedMinutes, 0) <= 48);
  const accepted = acceptDayPlan(suggested, options);
  g.routines[0].targetValue = 180;
  assert.equal(getCurrentPlanVersion(accepted).items.find(item => item.source.kind === 'routine')!.targetValue, 24);
  g.routines[0].targetValue = 120;
  const preview = suggestDayPlan([g], [], date, { availableMinutes: 100000, maxRoutineMinutes: 100000 });
  assert.equal(preview.items[0].targetValue, 120);
  const previewState = acceptDayPlan(preview, options);
  close(score(recordPlanProgress(previewState, preview.items[0].sourceKey, 60, 'half-full-target', { at })), 50);
  assert.equal(suggestDayPlan([g], [], date, { availableMinutes: 1 }).items.length, 0);
  assert.equal(suggestDayPlan([g], [], date, { availableMinutes: 1000 }).items[0].targetValue, 45);
  const binaryGoal = goal('binary');
  binaryGoal.actions[0].estimatedMinutes = 120;
  assert.equal(suggestDayPlan([binaryGoal], [], date, { availableMinutes: 60 }).items.length, 0);
});
test('weekly/monthly/selected weekdays obey due date', () => {
  const routine: GoalRoutine = { id: 'r', title: 'weekly', metricType: 'minutes', targetValue: 20,
    frequencyType: 'weekly', weekdays: [], startDate: '2026-10-19', endDate: '', isActive: true };
  assert.equal(isPlanRoutineDue(routine, date), false);
  assert.equal(isPlanRoutineDue(routine, '2026-10-26'), true);
  assert.equal(isPlanRoutineDue({ ...routine, frequencyType: 'selected_weekdays', weekdays: [2] }, date), true);
  assert.equal(isPlanRoutineDue({ ...routine, frequencyType: 'monthly', startDate: '2026-01-31' }, '2026-02-28'), true);
  assert.equal(isPlanRoutineDue({ ...routine, frequencyType: 'monthly', startDate: '2026-01-31' }, '2026-02-01'), false);
});
test('archived matrix work and future linked work are not suggested', () => {
  const g = goal('matrix', 'main', 2);
  g.openWindow = { version: 1, history: [], directions: [{ id: 'd', title: 'Archived', position: 0,
    actionIds: [g.actions[0].id], routineIds: [], archivedAt: at }] };
  g.actions[1].dueDate = '2026-10-21';
  const linked = { ...task(), goalId: g.id, goalActionId: g.actions[0].id };
  assert.equal(suggestDayPlan([g], [linked], date).items.length, 0);
});
test('completion instants use local calendar date near midnight', () => {
  const local = new Date(2026, 9, 20, 0, 30, 0);
  assert.equal(completionLocalDate(local.toISOString()), date);
  const g = goal();
  const state = acceptDayPlan(suggestDayPlan([g], [], date), options);
  g.actions[0].status = 'completed'; g.actions[0].completedAt = local.toISOString();
  close(score(syncDayPlanProgress(state, [g], [], { at })), 100);
});
test('account isolation and malformed persisted history rejected', () => {
  const state = acceptDayPlan(proposal([measurable()]), options);
  assert.throws(() => mergeDayPlans(state, { ...state, ownerId: 'bob' }));
  assert.equal(parseDayPlanState({ ...state, progress: [{ id: 'invalid' }] }), null);
  assert.equal(parseDayPlanState({ ...state, currentVersionId: 'missing' }), null);
  const projectTask = { ...task(), sourceType: 'project' as const, sourceId: 'project-task', ownerId: 'project-container' };
  const planner = acceptDayPlan(suggestDayPlan([], [projectTask], date, { ownerId: 'alice' }), options);
  close(score(syncDayPlanProgress(planner, [], [{ ...projectTask, done: true }], { at })), 100);
});
test('source imports are idempotent across devices and cannot resurrect undone facts', () => {
  const base = acceptDayPlan(suggestDayPlan([], [task()], date), options);
  const completed = { ...task(), done: true };
  const a = syncDayPlanProgress(base, [], [completed], { at });
  const b = syncDayPlanProgress(base, [], [completed], { at: `${date}T10:00:00Z` });
  const merged = mergeDayPlans(a, b);
  close(score(merged), 100);
  const undone = recordPlanProgress(merged, 'planner:t', 0, 'undo', { at });
  close(score(syncDayPlanProgress(undone, [], [completed], { at })), 0);
});
test('explicit action undo/re-completion and already-recorded UI changes', () => {
  const pending = goal();
  const completed = { ...pending, actions: pending.actions.map(action => ({ ...action, status: 'completed' as const, completedAt: at })) };
  const base = acceptDayPlan(suggestDayPlan([pending], [], date), options);
  const done = syncExplicitSourceChanges(base, [pending], [completed], [], [], { at });
  close(score(done), 100);
  const undone = syncExplicitSourceChanges(done, [completed], [pending], [], [], { at });
  close(score(undone), 0);
  assert.equal(syncExplicitSourceChanges(undone, [completed], [pending], [], [], { at }), undone);
  const redone = syncExplicitSourceChanges(undone, [pending], [completed], [], [], { at });
  close(score(redone), 100);
  assert.equal(redone.progress.length, 3);
  const alreadyRecorded = recordPlanProgress(done, getCurrentPlanVersion(done).items[0].sourceKey, 0, 'day-screen-undo', { at });
  assert.equal(syncExplicitSourceChanges(alreadyRecorded, [completed], [pending], [], [], { at }), alreadyRecorded);
  assert.equal(syncExplicitSourceChanges(done, [completed], [{ ...completed, title: 'Renamed' }], [], [], { at }), done);
});
test('explicit routine first log, correction, undo; deletion/date changes preserve facts', () => {
  const g = goal();
  g.routines = [{ id: 'r', title: 'Practice', metricType: 'minutes', targetValue: 30,
    frequencyType: 'daily', weekdays: [], startDate: date, endDate: '', isActive: true }];
  const logged = { ...g, routineLogs: [{ id: 'log', routineId: 'r', date, value: 30, createdAt: at, updatedAt: at }] };
  const base = acceptDayPlan(proposal([measurable()]), options);
  const done = syncExplicitSourceChanges(base, [g], [logged], [], [], { at });
  close(score(done), 100);
  const corrected = { ...logged, routineLogs: logged.routineLogs.map(log => ({ ...log, value: 15 })) };
  close(score(syncExplicitSourceChanges(done, [logged], [corrected], [], [], { at })), 50);
  const zero = { ...logged, routineLogs: logged.routineLogs.map(log => ({ ...log, value: 0 })) };
  close(score(syncExplicitSourceChanges(done, [logged], [zero], [], [], { at })), 0);
  assert.equal(syncExplicitSourceChanges(done, [logged], [g], [], [], { at }), done);
  assert.equal(syncExplicitSourceChanges(done, [logged], [{ ...logged, routines: [] }], [], [], { at }), done);
  const moved = { ...logged, routineLogs: logged.routineLogs.map(log => ({ ...log, date: '2026-10-21', value: 0 })) };
  assert.equal(syncExplicitSourceChanges(done, [logged], [moved], [], [], { at }), done);
});
test('explicit subtask undo and whole-task source edits preserve frozen denominator', () => {
  const before = task('steps', 2);
  const complete = { ...before, done: true, subtasks: before.subtasks!.map(step => ({ ...step, done: true })) };
  const base = acceptDayPlan(suggestDayPlan([], [before], date), options);
  const done = syncExplicitSourceChanges(base, [], [], [before], [complete], { at });
  close(score(done), 100);
  const half = { ...complete, done: false, subtasks: complete.subtasks.map((step, index) => ({ ...step, done: index === 0 })) };
  const partial = syncExplicitSourceChanges(done, [], [], [complete], [half], { at });
  close(score(partial), 50);
  close(score(syncExplicitSourceChanges(partial, [], [], [half], [before], { at })), 0);
  const deletedStep = { ...complete, subtasks: complete.subtasks.slice(1) };
  assert.equal(syncExplicitSourceChanges(done, [], [], [complete], [deletedStep], { at }), done);
  const project = { ...task('project'), sourceType: 'project' as const, sourceId: 'work', ownerId: 'container' };
  const projectPlan = acceptDayPlan(suggestDayPlan([], [project], date), options);
  close(score(syncExplicitSourceChanges(projectPlan, [], [], [project], [{ ...project, done: true }], { at })), 100);
});
test('source deletion, tombstone, move, unchanged old cache and scheduling are not explicit undo', () => {
  const g = goal();
  const completed = { ...g, actions: g.actions.map(action => ({ ...action, status: 'completed' as const, completedAt: at })) };
  const plan = syncExplicitSourceChanges(acceptDayPlan(suggestDayPlan([g], [], date), options), [g], [completed], [], [], { at });
  assert.equal(syncExplicitSourceChanges(plan, [completed], [], [], [], { at }), plan);
  assert.equal(syncExplicitSourceChanges(plan, [completed], [{ ...completed, actions: [] }], [], [], { at }), plan);
  const rescheduled = { ...completed, actions: completed.actions.map(action => ({ ...action, status: 'pending' as const, dueDate: '2026-10-21' })) };
  assert.equal(syncExplicitSourceChanges(plan, [completed], [rescheduled], [], [], { at }), plan);
  assert.equal(syncExplicitSourceChanges(plan, [g], [g], [], [], { at }), plan);
  const t = { ...task(), done: true };
  const tasks = syncDayPlanProgress(acceptDayPlan(suggestDayPlan([], [t], date), options), [], [t], { at });
  assert.equal(syncExplicitSourceChanges(tasks, [], [], [t], [{ ...t, deletedAt: at, done: false }], { at }), tasks);
  assert.equal(syncExplicitSourceChanges(tasks, [], [], [t], [{ ...t, date: '2026-10-21', done: false }], { at }), tasks);
});
test('chosen conflict snapshot survives merge/reload and resolution replay is idempotent', () => {
  const base = recordPlanProgress(acceptDayPlan(proposal([measurable()]), options), 'practice', 5, 'work', { at });
  const a = reviseDayPlan(base, proposal([measurable(20)]), 'A', { versionId: 'a', at });
  const b = reviseDayPlan(base, proposal([measurable(10)]), 'B', { versionId: 'b', at });
  const b2 = reviseDayPlan(b, proposal([measurable(8)]), 'B again', { versionId: 'b2', at });
  const combined = mergeDayPlans(a, b2);
  const resolved = resolveDayPlanConflict(combined, 'a', { versionId: 'choice-a', at });
  assert.equal(resolved.currentVersionId, 'choice-a');
  assert.equal(getCurrentPlanVersion(resolved).items[0].targetValue, 20);
  assert.deepEqual(getCurrentPlanVersion(resolved).resolvesVersionIds, ['a', 'b2']);
  assert.equal(calculatePlanScore(resolved).hasConflicts, false);
  assert.deepEqual(resolved.progress, combined.progress);
  assert.equal(resolved.originalVersionId, base.originalVersionId);
  close(score(resolved), score(base)!);
  assert.equal(resolveDayPlanConflict(resolved, 'a', { versionId: 'choice-a', at }), resolved);
  assert.equal(resolveDayPlanConflict(resolved, 'a', { at }), resolved);
  assert.deepEqual(mergeDayPlans(resolved, combined), resolved);
  assert.deepEqual(parseDayPlanState(JSON.stringify(resolved)), resolved);
  assert.throws(() => resolveDayPlanConflict(resolved, 'b2', { versionId: 'choice-a', at }));
  assert.equal(parseDayPlanState({ ...resolved, versions: resolved.versions.map(version => version.id === 'choice-a'
    ? { ...version, resolvesVersionIds: ['unseen'] } : version) }), null);
});
test('resolution does not hide unseen later forks or another concurrent decision', () => {
  const base = acceptDayPlan(proposal([measurable()]), options);
  const a = reviseDayPlan(base, proposal([measurable(20)]), 'A', { versionId: 'a', at });
  const b = reviseDayPlan(base, proposal([measurable(10)]), 'B', { versionId: 'b', at });
  const combined = mergeDayPlans(a, b);
  const choice = resolveDayPlanConflict(combined, 'a', { versionId: 'choice-a', at });
  const unseen = reviseDayPlan(b, proposal([measurable(15)]), 'Offline unseen', { versionId: 'unseen', at });
  const withUnseen = mergeDayPlans(choice, unseen);
  assert.deepEqual(withUnseen, mergeDayPlans(unseen, choice));
  assert.equal(calculatePlanScore(withUnseen).hasConflicts, true);
  assert.deepEqual(new Set(calculatePlanScore(withUnseen).conflictingVersionIds), new Set(['choice-a', 'unseen']));
  assert.equal(resolveDayPlanConflict(withUnseen, 'a', { versionId: 'choice-a', at }), withUnseen);
  const choiceAgain = resolveDayPlanConflict(withUnseen, 'choice-a', { versionId: 'choice-again', at });
  assert.equal(calculatePlanScore(choiceAgain).hasConflicts, false);
  assert.ok(parseDayPlanState(choiceAgain));
  const otherChoice = resolveDayPlanConflict(combined, 'b', { versionId: 'choice-b', at });
  assert.equal(calculatePlanScore(mergeDayPlans(choice, otherChoice)).hasConflicts, true);
});
test('archived, deferred and blocked actions are not autoplan candidates', () => {
  const g = goal('availability', 'main', 4);
  g.actions[0].archivedAt = at;
  g.actions[1].deferredUntil = '2026-10-21';
  g.actions[2].dependsOn = [g.actions[3].id];
  const linked = { ...task(), goalId: g.id, goalActionId: g.actions[2].id };
  const suggested = suggestDayPlan([g], [linked], date);
  assert.deepEqual(suggested.items.map(item => item.source.id), [g.actions[3].id]);
  g.actions[3].status = 'completed';
  assert.deepEqual(suggestDayPlan([g], [], date).items.map(item => item.source.id), [g.actions[2].id]);
});
test('seeded property loops: range, monotonicity, order, rename, duplication, split, merge algebra', () => {
  let seed = 0x42c0ffee;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let run = 0; run < 250; run++) {
    const count = 1 + Math.floor(random() * 10);
    const entries = Array.from({ length: count }, (_, index) => ({ ...measurable(1 + Math.floor(random() * 100)),
      sourceKey: `work-${index}`, budgetKey: `work-${index}`, goalId: `g-${index % 3}`,
      priority: (['main', 'important', 'supporting'] as const)[index % 3] }));
    const original = acceptDayPlan(proposal(entries), options);
    const renamed = acceptDayPlan(proposal([...entries].reverse().map(item => ({ ...item, title: `Renamed ${random()}` }))), options);
    const duplicates = acceptDayPlan(proposal([...entries, ...entries]), options);
    const split = acceptDayPlan(proposal(entries.flatMap(item => splitPlanItem(item, ['one', 'two', 'three']))), options);
    let a = original; let b = renamed; let c = duplicates; let d = split;
    for (const [index, entry] of entries.entries()) {
      const value = random() * entry.targetValue * 1.5;
      const before = score(a)!;
      a = recordPlanProgress(a, entry.sourceKey, value, `fact-${index}`, { at });
      b = recordPlanProgress(b, entry.sourceKey, value, `fact-${index}`, { at });
      c = recordPlanProgress(c, entry.sourceKey, value, `fact-${index}`, { at });
      d = recordPlanProgress(d, entry.sourceKey, value, `fact-${index}`, { at });
      assert.ok(score(a)! >= before - 1e-9 && score(a)! >= 0 && score(a)! <= 100);
      close(score(a), score(b)!); close(score(a), score(c)!); close(score(a), score(d)!);
    }
    const left = recordPlanProgress(original, entries[0].sourceKey, random() * entries[0].targetValue, 'left', { at });
    const right = recordPlanProgress(original, entries[0].sourceKey, random() * entries[0].targetValue, 'right', { at });
    const merged = mergeDayPlans(left, right);
    assert.deepEqual(merged, mergeDayPlans(right, left));
    assert.deepEqual(mergeDayPlans(merged, merged), merged);
    assert.deepEqual(mergeDayPlans(mergeDayPlans(left, right), a), mergeDayPlans(left, mergeDayPlans(right, a)));
    assert.equal(planProgressValue(merged, entries[0].budgetKey), Math.max(planProgressValue(left, entries[0].budgetKey), planProgressValue(right, entries[0].budgetKey)));
    const revisedOnce = reviseDayPlan(a, proposal(entries.map(item => ({ ...item, targetValue: item.targetValue / 2 }))), 'Less time', { versionId: 'revision-one', at });
    const revisedTwice = reviseDayPlan(revisedOnce, proposal(entries.slice(0, 1)), 'Keep one step', { versionId: 'revision-two', at });
    close(score(revisedTwice), score(a)!);
    assert.equal(calculatePlanScore(revisedTwice).revisionCount, 2);
    assert.deepEqual(mergeDayPlans(revisedTwice, a), mergeDayPlans(a, revisedTwice));
  }
});
assert.ok(checked > 0, 'No tests matched the requested filter');
console.log(`Day plan: ${checked} suites passed${testFilter ? ` (filter: ${testFilter})` : ' (16 scenarios + targeted regressions + 250 seeded property iterations)'}.`);
