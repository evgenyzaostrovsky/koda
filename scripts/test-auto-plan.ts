import assert from 'node:assert/strict';
import { advanceAutoPlan, applyAutoPlanProgress, autoPlanCompletion, buildAutoPlanItems, configureAutoPlan, mergeAutoPlans, moveAutoPlanAssignment, parseAutoPlanState, recordAutoPlanCompletion, type AutoPlanState } from '../src/features/koda/autoPlan';
import { defaultProfile, mergeStoredKodaState, normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { createGoal, createGoalAction } from '../src/features/koda/goalLogic';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Goal, PlannerItem } from '../src/features/koda/types';

const d1 = '2026-11-05', d2 = '2026-11-06', d3 = '2026-11-07';
const at = (date = d1, hour = '08') => `${date}T${hour}:00:00.000Z`;
let checked = 0;
function test(name: string, run: () => void) { run(); checked++; console.log(`PASS ${name}`); }
function goal(id = 'g', minutes = 30): Goal {
  return { ...createGoal({ title: 'Goal', desiredResult: '', deadline: '', priority: 'main' }), id, priority: 'main', createdAt: at(), updatedAt: at(), actions: ['a', 'b', 'c'].map((id, position) => ({ ...createGoalAction({ title: id, estimatedMinutes: minutes, position }), id })) };
}
const enable = (owner = 'account', minutes = 120) => configureAutoPlan(undefined, owner, { enabled: true, dailyMinutes: minutes, timezone: 'Europe/Moscow' }, at(), 'enable');
const start = (goals = [goal()], state = enable(), date = d1) => advanceAutoPlan(state, goals, [], date, at(date));
const items = (state: AutoPlanState, goals = [goal()], date = d1) => buildAutoPlanItems(state, goals, date);
const mark = (state: AutoPlanState, done = true, date = d1, id = 'complete') => recordAutoPlanCompletion(state, state.assignments[0].id, done, date, at(date, '10'), id);

test('default120, deterministic order, first step only, no mutation', () => {
  const empty = enable(); const before = JSON.stringify(empty);
  assert.equal(configureAutoPlan(undefined, 'x', {}, at(), 'x').settings.dailyMinutes, 120);
  const g = goal(); g.actions.reverse();
  const state = start([g], empty);
  assert.equal(JSON.stringify(empty), before);
  assert.equal(state.assignments.length, 1);
  assert.equal(items(state)[0].goalActionId, 'a');
  assert.deepEqual(start([g], state), state);
  assert.deepEqual(parseAutoPlanState(JSON.parse(JSON.stringify(state)), 'account'), state);
  assert.equal(items(state)[0].ownerId, 'account');
});
test('carry several skipped days keeps one ID and no stale intermediate days', () => {
  const initial = start(); const later = start([goal()], initial, '2026-11-15');
  assert.equal(later.assignments.length, 1);
  assert.deepEqual(later.days.map(d => d.date), [d1, '2026-11-15']);
  assert.equal(items(later, [goal()], '2026-11-15')[0].date, '2026-11-15');
  assert.equal(items(initial)[0].id, items(later, [goal()], '2026-11-15')[0].id);
});
test('calendar completion unlocks next day only, then no same-day replenishment', () => {
  const complete = mark(start());
  assert.equal(start([goal()], complete).assignments.length, 1);
  const next = start([goal()], complete, d2);
  assert.equal(next.assignments.length, 2);
  assert.deepEqual(items(next, [goal()], d2).map(i => [i.goalActionId, i.done, i.date]), [['a', true, d1], ['b', false, d2]]);
  const b = next.assignments.find(a => a.actionId === 'b')!;
  const allDone = recordAutoPlanCompletion(next, b.id, true, d2, at(d2, '10'), 'b');
  assert.equal(start([goal()], allDone, d2).assignments.length, 2);
  assert.equal(start([goal()], allDone, d3).assignments.length, 3);
});
test('goal status cannot bypass calendar; explicit undo blocks successor and overlays progress', () => {
  const initial = start(); const changed = goal(); changed.actions[0].status = 'completed';
  assert.equal(start([changed], initial, d2).assignments.length, 1);
  assert.equal(applyAutoPlanProgress(initial, [changed])[0].actions[0].status, 'pending');
  const next = start([goal()], mark(initial), d2);
  const undo = recordAutoPlanCompletion(next, initial.assignments[0].id, false, d2, at(d2, '11'), 'undo');
  assert.deepEqual(items(undo, [goal()], d2).map(i => i.goalActionId), ['a']);
  assert.equal(applyAutoPlanProgress(undo, [changed])[0].actions[0].status, 'pending');
  const merged = mergeAutoPlans(next, undo)!;
  assert.equal(autoPlanCompletion(merged, initial.assignments[0].id)?.done, false);
});
test('manual same-day plans are not duplicated; empty batch accepts newly available work', () => {
  const manual: PlannerItem = { id: 'manual', date: d1, title: 'a', time: '', done: false, goalId: 'g', goalActionId: 'a' };
  const state = advanceAutoPlan(enable(), [goal()], [manual], d1, at());
  assert.equal(state.assignments.length, 0);
  assert.equal(start([goal()], state).assignments.length, 1);
  assert.equal(start([goal()], state, d2).assignments.length, 1);
});
test('any due carry blocks all new goals; unknown duration20 and long step blocked', () => {
  const a = goal('a', 80), b = goal('b', 60);
  let state = start([a]); state = start([a, b], state, d2);
  assert.equal(state.assignments.length, 1);
  assert.equal(state.days[1].assignmentIds.length, 1);
  const long = goal('long', 121), unknown = goal('unknown'); unknown.actions[0].estimatedMinutes = null;
  const other = start([long, unknown]);
  assert.equal(other.days[0].blocked[0].reason, 'exceeds_daily_limit');
  assert.equal(other.assignments[0].estimatedMinutes, 20);
  const huge = start([goal('huge', 2000)]);
  assert.equal(huge.assignments.length, 0);
  assert.equal(parseAutoPlanState(huge)?.days[0].blocked[0].estimatedMinutes, 2000);
});
test('empty batch can fill after goals arrive or limit increases; filled batch stays sealed', () => {
  const empty = start([]);
  const filled = advanceAutoPlan(empty, [goal()], [], d1, at(d1, '09'));
  assert.equal(filled.assignments.length, 1);
  assert.deepEqual(mergeAutoPlans(empty, filled), mergeAutoPlans(filled, empty));
  assert.equal(items(mergeAutoPlans(empty, filled)!).length, 1);
  const long = goal('g', 100);
  const low = start([long], enable('account', 60));
  const raised = configureAutoPlan(low, 'account', { dailyMinutes: 120 }, at(d1, '09'), 'raise');
  const next = advanceAutoPlan(raised, [long], [], d1, at(d1, '10'));
  assert.equal(next.assignments.length, 1);
  const expanded = advanceAutoPlan(next, [long, goal('other', 10)], [], d1, at(d1, '11'));
  assert.equal(expanded.assignments.length, 1);
});
test('dependencies, due/deferred dates, archive and main priority are respected', () => {
  const blocked = goal(); blocked.actions[0].dependsOn = ['missing'];
  assert.equal(start([blocked]).assignments.length, 0);
  const future = goal(); future.actions[0].dueDate = d2;
  assert.equal(start([future]).assignments.length, 0);
  future.actions[0].dueDate = ''; future.actions[0].deferredUntil = d2;
  assert.equal(start([future]).assignments.length, 0);
  assert.equal(start([{ ...goal(), status: 'paused' }]).assignments.length, 0);
  assert.equal(start([{ ...goal(), priority: 'important' }]).assignments.length, 0);
  const archived = goal(); archived.actions[0].archivedAt = at();
  assert.equal(start([archived]).assignments[0].actionId, 'b');
  const direction = goal(); direction.openWindow = { version: 1, history: [], directions: [{ id: 'dir', title: 'archived', position: 0, actionIds: ['a'], routineIds: [], archivedAt: at() }] };
  assert.equal(start([direction]).assignments[0].actionId, 'b');
  const active = start(); const removed = { ...goal(), archivedAt: at() };
  assert.equal(items(active, [removed], d2).length, 0);
  assert.equal(items(mark(active), [removed], d2).length, 1, 'completed history retained');
});
test('future manual move survives automatic carry and concurrent completion', () => {
  const initial = start(); const moved = moveAutoPlanAssignment(initial, initial.assignments[0].id, d3, at(d1, '09'), 'move');
  const carry = start([goal()], initial, d2);
  const merged = mergeAutoPlans(carry, moved)!;
  assert.equal(items(merged, [goal()], d2)[0].date, d3);
  const done = mark(initial);
  const final = mergeAutoPlans(merged, done)!;
  assert.equal(items(final, [goal()], d2)[0].done, true);
  assert.equal(items(final, [goal()], d2)[0].date, d1);
  assert.deepEqual(mergeAutoPlans(done, merged), final);
  assert.deepEqual(moveAutoPlanAssignment(moved, initial.assignments[0].id, d3, at(d1, '09'), 'move'), moved);
});
test('pause preserves completion/history and stops new assignments', () => {
  const done = mark(start());
  const paused = configureAutoPlan(done, 'account', { enabled: false }, at(d1, '11'), 'pause');
  assert.deepEqual(start([goal()], paused, d2), paused);
  assert.equal(items(paused, [goal()], d2)[0].done, true);
  const resumed = configureAutoPlan(paused, 'account', { enabled: true }, at(d2), 'resume');
  assert.equal(start([goal()], resumed, d2).assignments.length, 2);
});
test('account isolation and malformed records are rejected', () => {
  const state = start();
  assert.equal(parseAutoPlanState(state, 'other'), undefined);
  assert.throws(() => mergeAutoPlans(state, enable('other')), /another account/);
  assert.throws(() => configureAutoPlan(state, 'other', {}, at(), 'foreign'), /another account/);
  assert.notEqual(start([goal()], enable('other')).assignments[0].id, state.assignments[0].id);
  const malformed = structuredClone(state); malformed.assignments[0].id = 'foreign';
  assert.equal(parseAutoPlanState(malformed), undefined);
  assert.equal(normalizeStoredKodaState({ user_id: 'other', profile: { ...defaultProfile, autoPlan: state } })!.profile.autoPlan, undefined);
});
test('concurrent batches choose one sealed budget and merge is commutative/idempotent/associative', () => {
  const base = enable();
  const a = advanceAutoPlan(base, [goal('a', 100)], [], d1, at());
  const b = advanceAutoPlan(base, [goal('b', 100)], [], d1, at(d1, '09'));
  const c = configureAutoPlan(base, 'account', { dailyMinutes: 60 }, at(d1, '10'), 'limit');
  const ab = mergeAutoPlans(a, b)!;
  assert.equal(items(ab, [goal('a'), goal('b')]).length, 1);
  assert.deepEqual(mergeAutoPlans(a, b), mergeAutoPlans(b, a));
  assert.deepEqual(mergeAutoPlans(ab, ab), ab);
  assert.deepEqual(mergeAutoPlans(mergeAutoPlans(a, b), c), mergeAutoPlans(a, mergeAutoPlans(b, c)));
  assert.equal(items(mergeAutoPlans(ab, c)!, [goal('a'), goal('b')]).length, 1);
});
test('late completion and stale next-day advance never lose the checkmark or replenish today', () => {
  const initial = start();
  const carry = start([goal()], initial, d2);
  const completion = recordAutoPlanCompletion(initial, initial.assignments[0].id, true, d2, at(d2), 'offline');
  const merged = mergeAutoPlans(carry, completion)!;
  assert.equal(start([goal()], merged, d2).assignments.length, 1);
  assert.equal(items(merged, [goal()], d2)[0].done, true);
  assert.equal(start([goal()], merged, d3).assignments.length, 2);
});
test('profile persistence retains autoPlan when legacy client omits it', () => {
  const state = start();
  const rich = normalizeStoredKodaState({ profile: { ...defaultProfile, autoPlan: state } })!;
  const legacy = normalizeStoredKodaState({ profile: defaultProfile })!;
  assert.deepEqual(mergeStoredKodaState(rich, legacy).profile.autoPlan, state);
  assert.deepEqual(parseStoredKodaState(JSON.stringify(rich))!.profile.autoPlan, state);
  assert.deepEqual(normalizeStoredKodaState({ profile: { autoPlan: state } })!.profile.autoPlan, state);
});
test('reduced next-day budget queues overflow and preserves completed history', () => {
  const goals = [goal('a', 60), goal('b', 60), goal('c', 30)];
  const initial = start(goals, enable('account', 180));
  const completed = recordAutoPlanCompletion(initial, initial.assignments.find(a => a.goalId === 'c')!.id, true, d1, at(d1, '10'), 'c-done');
  const reduced = configureAutoPlan(completed, 'account', { dailyMinutes: 60 }, at(d1, '11'), 'reduce');
  assert.equal(items(reduced, goals, d2).filter(i => !i.done && i.date === d2).length, 1, 'pre-write render is capped too');
  assert.equal(items(reduced, goals, d1).filter(i => !i.done && i.date === d1).length, 2, 'today retains original sealed budget');
  const next = start(goals, reduced, d2);
  const today = next.days.find(d => d.date === d2)!;
  assert.equal(today.assignmentIds.length, 1);
  assert.equal(today.blocked[0].reason, 'remaining_budget');
  const projected = items(next, goals, d2);
  assert.equal(projected.filter(i => !i.done && i.date === d2).length, 1);
  assert.equal(projected.find(i => i.goalId === 'b')!.date, d3);
  assert.equal(projected.find(i => i.goalId === 'c')!.date, d1);
  assert.equal(next.assignments.length, initial.assignments.length);
});
test('carry larger than new limit is blocked and visible undated, never replaced by new work', () => {
  const goals = [goal('a', 100), goal('b', 20)];
  const initial = start([goals[0]]);
  const reduced = configureAutoPlan(initial, 'account', { dailyMinutes: 60 }, at(d1, '11'), 'reduce');
  const next = start(goals, reduced, d2);
  assert.equal(next.days.find(d => d.date === d2)!.assignmentIds.length, 0);
  assert.equal(next.days.find(d => d.date === d2)!.blocked[0].reason, 'exceeds_daily_limit');
  assert.equal(next.assignments.length, 1);
  assert.equal(items(next, goals, d2)[0].date, '');
});
test('manual future collisions and same-day moves cannot overflow the sealed batch', () => {
  const goals = [goal('a', 80), goal('b', 80)];
  const initial = start([goals[0]]);
  const moved = moveAutoPlanAssignment(initial, initial.assignments[0].id, d3, at(d1, '10'), 'future');
  const next = start(goals, moved, d2);
  assert.equal(next.assignments.length, 2);
  const b = next.assignments.find(a => a.goalId === 'b')!;
  const bothFuture = moveAutoPlanAssignment(next, b.id, d3, at(d2, '10'), 'future-b');
  assert.deepEqual(items(bothFuture, goals, d2).map(i => i.date), [d3, '2026-11-08']);
  const due = start(goals, bothFuture, d3);
  assert.equal(due.days.find(d => d.date === d3)!.assignmentIds.length, 1);
  assert.equal(items(due, goals, d3).filter(i => i.date === d3).length, 1);
  const moveBack = moveAutoPlanAssignment(next, initial.assignments[0].id, d2, at(d2, '11'), 'back');
  assert.deepEqual(items(moveBack, goals, d2).filter(i => i.date === d2).map(i => i.goalId), ['b']);
  assert.equal(items(moveBack, goals, d2).find(i => i.goalId === 'a')!.date, d3);
  const merged = mergeAutoPlans(bothFuture, moveBack)!;
  assert.deepEqual(items(merged, goals, d2), items(mergeAutoPlans(moveBack, bothFuture)!, goals, d2));
  assert.equal(merged.assignments.length, 2);
});

// In-memory CAS boundary: inject a server completion between read and write.
async function casTest() {
  const initial = start(); let row: any = { user_id: 'account', updated_at: 'v0', profile: { ...defaultProfile, autoPlan: initial } };
  let inject = true, conflicts = 0;
  const backend = { from(table: string) {
    assert.equal(table, 'user_app_state'); let payload: any; const filters: any = {};
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (value: unknown) => { payload = value; return query; }, insert: (value: unknown) => { payload = value; return query; },
      maybeSingle: async () => {
        if (!payload) return { data: structuredClone(row), error: null };
        if (inject) { row.profile.autoPlan = mark(initial); row.updated_at = 'v1'; inject = false; }
        if (filters.updated_at !== row.updated_at) { conflicts++; return { data: null, error: null }; }
        row = structuredClone({ ...row, ...payload, updated_at: 'v2' }); return { data: { user_id: 'account' }, error: null };
      } }; return query;
  } };
  const stale = normalizeStoredKodaState({ profile: { ...defaultProfile, autoPlan: initial } })!;
  await writeAppStateSnapshot(backend, 'account', stale);
  assert.equal(conflicts, 1);
  assert.equal(autoPlanCompletion(row.profile.autoPlan, initial.assignments[0].id)?.done, true);
  await writeAppStateSnapshot(backend, 'account', normalizeStoredKodaState({ profile: defaultProfile })!);
  assert.equal(autoPlanCompletion(row.profile.autoPlan, initial.assignments[0].id)?.done, true);
  await assert.rejects(writeAppStateSnapshot(backend, 'other', stale), /another account/);
  checked++; console.log('PASS CAS retries preserve concurrent server completion and legacy writes');
}
casTest().then(() => console.log(`Auto plan: ${checked} suites passed`)).catch(error => { console.error(error); process.exitCode = 1; });
