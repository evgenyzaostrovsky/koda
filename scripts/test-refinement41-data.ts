import assert from 'node:assert/strict';
import type { Goal, Habit } from '../src/features/koda/types';
import { createHabit, HABIT_ICONS, habitDoneOn, habitIcon, habitIsDue, habitPausedOn, habitStreak } from '../src/features/koda/habitModel';
import { mergeHabits, recordHabitEdits } from '../src/features/koda/habitSync';
import { normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { calculateGoalProgress, calculateMilestoneProgress, createGoal, createGoalAction, createMilestone } from '../src/features/koda/goalLogic';
import { compactGoalMilestones, currentGoalMilestone, nextRoadmapAction } from '../src/features/koda/components/goalPresentation';
import { getHabitMonthDays } from '../src/features/koda/utils';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';

let passed = 0;
function test(name: string, run: () => void) { run(); passed++; console.log(`PASS ${name}`); }
const at = (day: number) => `2026-10-${day}T12:00:00.000Z`;
const base = () => createHabit('Read', { id: 'same-id', createdDate: '2026-10-19', icon: 'book' });
function done(habit: Habit, date: string, value = true): Habit {
  const [year, month, day] = date.split('-').map(Number);
  return { ...habit, monthHistory: { ...habit.monthHistory,
    [date.slice(0, 7)]: getHabitMonthDays(habit, year, month - 1).map((old, index) => index === day - 1 ? value : old) } };
}
function goalFixture(): Goal {
  return { ...createGoal({ title: 'Route', desiredResult: '', deadline: '', priority: 'main' }, at(19)), id: 'route',
    milestones: Array.from({ length: 8 }, (_, index) => ({ ...createMilestone(`Stage ${index}`, '', '', index), id: `stage-${index}` })),
    actions: Array.from({ length: 8 }, (_, index) => ({ ...createGoalAction({ title: `Action ${index}`, milestoneId: `stage-${index}`, position: index }), id: `action-${index}` })) };
}

test('archive and restore preserve dates, survive stale metadata, and remain separate from deletion', () => {
  const created = recordHabitEdits([], [base()], at(19), 'create');
  const checked = recordHabitEdits(created, [done(created[0], '2026-10-19')], at(20), 'check');
  const archived = recordHabitEdits(checked, [{ ...checked[0], archivedAt: at(21) }], at(21), 'archive');
  assert.equal(archived[0].metadataUpdatedAt, at(21));
  assert.equal(archived[0].deletedAt, undefined);
  assert.equal(habitIsDue(archived[0], '2026-10-22'), false);
  assert.equal(habitDoneOn(archived[0], '2026-10-19'), true);
  assert.deepEqual(mergeHabits(checked, archived), archived);
  const restored = recordHabitEdits(archived, [{ ...archived[0], archivedAt: null }], at(22), 'restore');
  assert.equal(mergeHabits(restored, archived)[0].archivedAt, null);
  assert.equal(habitIsDue(restored[0], '2026-10-22'), true);
  assert.deepEqual(recordHabitEdits(restored, archived, at(21), 'archive'), restored);
  const deleted = recordHabitEdits(restored, [], at(23), 'delete');
  assert.equal(mergeHabits(deleted, restored)[0].deletedAt, at(23));
});

test('recorded pause dates preserve streak on pause and resume without inventing completions', () => {
  const initial = recordHabitEdits([], [done(base(), '2026-10-19')], at(19), 'create');
  const paused = recordHabitEdits(initial, [{ ...initial[0], isActive: false }], at(20), 'pause');
  assert.equal(habitPausedOn(paused[0], '2026-10-19'), false);
  assert.equal(habitPausedOn(paused[0], '2026-10-21'), true);
  assert.equal(habitStreak(paused[0], '2026-10-22'), 1);
  const resumed = recordHabitEdits(paused, [{ ...paused[0], isActive: true }], at(23), 'resume');
  assert.equal(habitPausedOn(resumed[0], '2026-10-23'), false);
  assert.equal(habitStreak(resumed[0], '2026-10-23'), 1);
  assert.equal(habitStreak(resumed[0], '2026-10-24'), 0, 'missed scheduled resume day breaks streak');
  const checked = recordHabitEdits(resumed, [done(resumed[0], '2026-10-23')], at(23), 'check');
  assert.equal(habitStreak(checked[0], '2026-10-23'), 2);
  assert.equal(habitDoneOn(checked[0], '2026-10-21'), false);
  assert.deepEqual(mergeHabits(paused, checked), mergeHabits(checked, paused));
  assert.deepEqual(parseStoredKodaState(JSON.stringify({ habits: checked }))!.habits, checked);
  assert.deepEqual(recordHabitEdits(checked, paused, at(20), 'pause'), checked);
});

test('pause registers merge independently from metadata and converge on concurrent same-day changes', () => {
  const initial = recordHabitEdits([], [base()], at(19), 'create');
  const paused = recordHabitEdits(initial, [{ ...initial[0], isActive: false }], at(20), 'pause');
  const renamed = recordHabitEdits(initial, [{ ...initial[0], title: 'Read a book' }], at(21), 'rename');
  assert.equal(mergeHabits(paused, renamed)[0].isActive, false, 'renaming from a stale device cannot silently resume a pause');
  const resumed = recordHabitEdits(paused, [{ ...paused[0], isActive: true }], at(22), 'resume');
  const merged = mergeHabits(renamed, mergeHabits(paused, resumed));
  assert.deepEqual(merged, mergeHabits(mergeHabits(renamed, paused), resumed));
  assert.equal(habitPausedOn(merged[0], '2026-10-21'), true);
  assert.equal(habitPausedOn(merged[0], '2026-10-22'), false);
  const conflict = { ...resumed[0], pauseEdits: { ...resumed[0].pauseEdits,
    '2026-10-22': { at: at(22), id: 'z', paused: true } } };
  assert.deepEqual(mergeHabits(resumed, [conflict]), mergeHabits([conflict], resumed));
});

test('icon keys, legacy emoji, color and archive metadata round trip without schema changes', () => {
  assert.equal(new Set(HABIT_ICONS.map(icon => icon.key)).size, 11);
  for (const icon of HABIT_ICONS) assert.equal(habitIcon({ ...base(), icon: icon.key }), icon.emoji);
  assert.equal(habitIcon({ ...base(), icon: '🦉' }), '🦉');
  const initial = recordHabitEdits([], [base()], at(19), 'create');
  const styled = recordHabitEdits(initial, [{ ...initial[0], color: '#AABBCC', archivedAt: at(20) }], at(20), 'style');
  assert.equal(styled[0].color, '#aabbcc');
  assert.deepEqual(parseStoredKodaState(JSON.stringify({ habits: styled }))!.habits, styled);
  const cleared = recordHabitEdits(styled, [{ ...styled[0], color: undefined }], at(21), 'clear');
  assert.equal(mergeHabits(cleared, styled)[0].color, undefined);
});

test('malformed rows cannot replace surviving habits or fabricate true dates; duplicate IDs merge', () => {
  const saved = done(base(), '2026-10-19');
  const parsed = parseStoredKodaState(JSON.stringify({ habits: [saved, null, { id: 'bad' }] }))!;
  assert.equal(parsed.habits.length, 1);
  assert.equal(habitDoneOn(parsed.habits[0], '2026-10-19'), true);
  const corrupt = parseStoredKodaState(JSON.stringify({ habits: [{ ...base(), monthHistory: { '2026-10': ['yes', 1, true], broken: true } }] }))!;
  assert.deepEqual(corrupt.habits[0].monthHistory['2026-10'], [false, false, true]);
  assert.equal(parseStoredKodaState(JSON.stringify({ habits: [saved, done(base(), '2026-10-20')] }))!.habits.length, 1);
});

test('current stage is deterministic and next action prefers its available actions', () => {
  const goal = goalFixture();
  goal.milestones[2].status = 'in_progress';
  assert.equal(currentGoalMilestone(goal)?.id, 'stage-2');
  assert.equal(nextRoadmapAction(goal, '2026-10-23').action?.id, 'action-2');
  assert.equal(nextRoadmapAction(goal).fromOtherStage, false);
  goal.actions[2].deferredUntil = '2026-10-24';
  assert.equal(nextRoadmapAction(goal, '2026-10-23').fromOtherStage, false);
  assert.equal(nextRoadmapAction(goal, '2026-10-23').action, undefined);
  goal.actions[2].deferredUntil = '';
  goal.actions[2].dependsOn = ['action-3'];
  assert.equal(nextRoadmapAction(goal).action, undefined);
  goal.actions[3].status = 'completed';
  assert.equal(nextRoadmapAction(goal).action?.id, 'action-2');
  goal.actions[2].archivedAt = at(23);
  assert.equal(nextRoadmapAction(goal).action, undefined);
  goal.archivedAt = at(23);
  assert.equal(nextRoadmapAction(goal).action, undefined);
  goal.milestones.forEach(stage => { stage.position = 0; stage.status = 'not_started'; });
  assert.equal(currentGoalMilestone({ ...goal, milestones: [...goal.milestones].reverse() })?.id, currentGoalMilestone(goal)?.id);
});

test('empty current stage does not recommend a later stage; unstaged goals keep their backlog', () => {
  const goal = goalFixture();
  goal.actions = goal.actions.filter(action => action.milestoneId !== 'stage-0');
  assert.equal(nextRoadmapAction(goal).current?.id, 'stage-0');
  assert.equal(nextRoadmapAction(goal).action, undefined);
  assert.equal(nextRoadmapAction({...goal, milestones:[]}).action?.id, 'action-1');
});

test('compact route retains last completion, current and upcoming without duplicated nodes', () => {
  const goal = goalFixture();
  goal.actions.slice(0, 3).forEach(action => { action.status = 'completed'; });
  const compact = compactGoalMilestones(goal);
  assert.deepEqual(compact.milestones.map(stage => stage.id), ['stage-2', 'stage-3', 'stage-4', 'stage-5', 'stage-6']);
  assert.equal(compact.hiddenCount, 3);
  assert.equal(compact.completedCount, 3);
  assert.equal(compact.totalCount, 8);
  assert.deepEqual(compactGoalMilestones(goal, 1).milestones.map(stage => stage.id), ['stage-3']);
  assert.equal(compactGoalMilestones(goal, 0).milestones.length, 0);
  goal.milestones.push(goal.milestones[3]);
  assert.equal(compactGoalMilestones(goal).totalCount, 8);
});

test('progress uses equal stage weight, no creation credit, stable reorder and recalculated deletion', () => {
  const goal = goalFixture();
  goal.milestones = goal.milestones.slice(0, 4);
  goal.actions = goal.actions.slice(0, 4);
  assert.equal(calculateGoalProgress(goal), 0);
  goal.actions[0].status = 'completed';
  assert.equal(calculateGoalProgress(goal), 25);
  const secondAction = { ...createGoalAction({ title: 'Other', milestoneId: 'stage-0' }), id: 'extra' };
  goal.actions.push(secondAction);
  assert.equal(calculateMilestoneProgress(goal.milestones[0], goal.actions), 50);
  assert.equal(calculateGoalProgress(goal), 13);
  const reordered = { ...goal, milestones: [...goal.milestones].reverse().map((stage, position) => ({ ...stage, position })) };
  assert.equal(calculateGoalProgress(reordered), 13);
  assert.equal(calculateGoalProgress({ ...goal, milestones: goal.milestones.slice(0, 3) }), 17);
  assert.equal(calculateGoalProgress({ ...goal, milestones: goal.milestones.slice(1) }), 0);
});

// Simulated PostgREST only. No client credentials, network, production rows, or migrations.
class Backend {
  rows = new Map<string, any>(); offline = false; revision = 0; conflicts = 0;
  from(table: string) {
    assert.equal(table, 'user_app_state');
    let mode = 'read'; let payload: any; const filters: Record<string, any> = {};
    const query = {
      select: (_columns: string) => query,
      eq: (key: string, value: any) => { filters[key] = value; return query; },
      update: (value: any) => { mode = 'update'; payload = value; return query; },
      insert: (value: any) => { mode = 'insert'; payload = value; return query; },
      maybeSingle: async () => {
        if (this.offline) return { data: null, error: new Error('offline') };
        const owner = filters.user_id ?? payload.user_id;
        const existing = this.rows.get(owner);
        if (mode === 'read') return { data: structuredClone(existing ?? null), error: null };
        if (mode === 'insert' && existing) { this.conflicts++; return { data: null, error: { code: '23505' } }; }
        if (mode === 'update' && existing?.updated_at !== filters.updated_at) { this.conflicts++; return { data: null, error: null }; }
        this.rows.set(owner, structuredClone({ ...payload, updated_at: `revision-${++this.revision}` }));
        return { data: { user_id: owner }, error: null };
      },
    };
    return query;
  }
}

async function main() {
  const backend = new Backend();
  const storage = new Map<string, string>();
  const initial = recordHabitEdits([], [base()], at(19), 'create');
  const a = recordHabitEdits(initial, [done(initial[0], '2026-10-20')], at(20), 'a');
  const b = recordHabitEdits(initial, [done(initial[0], '2026-10-21')], at(21), 'b');
  const snapshot = (habits: Habit[]) => normalizeStoredKodaState({ habits, goals: [] })!;
  storage.set('owner-a', JSON.stringify(snapshot(a)));
  storage.set('owner-b', JSON.stringify(snapshot(initial)));
  backend.offline = true;
  await assert.rejects(writeAppStateSnapshot(backend, 'owner-a', snapshot(a)), /offline/);
  assert.equal(backend.rows.size, 0);
  backend.offline = false;
  await Promise.all([writeAppStateSnapshot(backend, 'owner-a', parseStoredKodaState(storage.get('owner-a')!)!),
    writeAppStateSnapshot(backend, 'owner-a', snapshot(b))]);
  assert.ok(backend.conflicts > 0);
  await writeAppStateSnapshot(backend, 'owner-b', parseStoredKodaState(storage.get('owner-b')!)!);
  await writeAppStateSnapshot(backend, 'owner-a', snapshot(a));
  const merged = normalizeStoredKodaState(backend.rows.get('owner-a'))!.habits;
  assert.equal(merged.length, 1);
  assert.equal(habitDoneOn(merged[0], '2026-10-20'), true);
  assert.equal(habitDoneOn(merged[0], '2026-10-21'), true);
  assert.equal(habitDoneOn(normalizeStoredKodaState(backend.rows.get('owner-b'))!.habits[0], '2026-10-20'), false);
  const undo = recordHabitEdits(merged, [done(merged[0], '2026-10-20', false)], at(22), 'undo');
  await writeAppStateSnapshot(backend, 'owner-a', snapshot(undo));
  await writeAppStateSnapshot(backend, 'owner-a', snapshot(a));
  assert.equal(habitDoneOn(normalizeStoredKodaState(backend.rows.get('owner-a'))!.habits[0], '2026-10-20'), false);
  console.log('PASS simulated offline storage reload, two owners, concurrent insert retry, idempotent replay and undo');
  console.log(`Refinement 4.1 data: ${passed + 1} targeted suites passed.`);
}
void main();
