import assert from 'node:assert/strict';
import { changedDraftFields, recordGoalEdits, recordProjectEdits, recordProfileEdits, recordPomodoroEdits } from '../src/features/koda/entitySync';
import { normalizeGoal } from '../src/features/koda/goalLogic';
import { mergeGoals, mergeStoredKodaState, normalizeStoredKodaState, parseStoredKodaState, shouldSyncRecoveredAppState, type StoredKodaState } from '../src/features/koda/persistence';
import { mergeHabits, recordHabitEdits } from '../src/features/koda/habitSync';
import { createOpenWindow, updateOpenWindow } from '../src/features/koda/openWindow';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Habit, Project } from '../src/features/koda/types';

const t0 = '2026-11-06T08:00:00.000Z', t1 = '2026-11-06T09:00:00.000Z', t2 = '2026-11-06T10:00:00.000Z', t3 = '2026-11-06T11:00:00.000Z';
const goal = normalizeGoal({ id: 'goal', title: 'Goal', createdAt: t0, updatedAt: t0,
  actions: [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }],
  milestones: [{ id: 'stage', title: 'Stage' }], routines: [{ id: 'routine', title: 'Routine', startDate: '2026-08-01' }],
  routineLogs: [{ id: 'log', routineId: 'routine', date: '2026-11-06', value: 1, createdAt: t0, updatedAt: t0 }],
})!;
const project: Project = { id: 'project', title: 'Project', description: '', status: 'active', createdAt: t0, updatedAt: t0, completedAt: null,
  tasks: [{ id: 'task', title: 'Task', description: '', cost: '', plannedDate: '', plannedTime: '', status: 'todo', createdAt: t0, updatedAt: t0, completedAt: null, deletedAt: null }] };
const habit: Habit = { id: 'habit', title: 'Habit', target: '', doneDays: [], monthDays: [], monthHistory: {} };
const base = normalizeStoredKodaState({ goals: [goal], projects: [project], habits: [habit] })!;
const reload = (state: StoredKodaState) => parseStoredKodaState(JSON.stringify(state))!;
function editGoal(transform: (value: typeof goal) => typeof goal, at = t1, id = 'goal-edit'): StoredKodaState {
  return { ...base, goals: recordGoalEdits(base.goals, [transform(structuredClone(goal))], at, id) };
}
function editProject(transform: (value: Project) => Project, at = t1, id = 'project-edit'): StoredKodaState {
  return { ...base, projects: recordProjectEdits(base.projects, [transform(structuredClone(project))], at, id) };
}

class Backend {
  rows = new Map<string, any>(); offline = false; writes = 0; conflicts = 0; beforeWrite?: () => void;
  from(table: string) {
    assert.equal(table, 'user_app_state'); let payload: any; const filters: Record<string, unknown> = {};
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (value: unknown) => { payload = value; return query; }, insert: (value: unknown) => { payload = value; return query; },
      maybeSingle: async () => {
        if (this.offline) return { data: null, error: { code: 'FETCH', message: 'offline fixture' } };
        const owner = String(filters.user_id ?? payload?.user_id);
        if (!payload) return { data: structuredClone(this.rows.get(owner) ?? null), error: null };
        const race = this.beforeWrite; this.beforeWrite = undefined; race?.();
        if (this.rows.has(owner) && this.rows.get(owner).updated_at !== filters.updated_at) { this.conflicts++; return { data: null, error: null }; }
        this.rows.set(owner, structuredClone({ ...payload, updated_at: `v${++this.writes}` }));
        return { data: { user_id: owner }, error: null };
      },
    }; return query;
  }
}

async function main() {
  const patch = changedDraftFields(project.tasks[0], { title: 'Edited in modal', description: project.tasks[0].description });
  const hydratedTask = { ...project.tasks[0], description: 'Remote note', status: 'done', completedAt: t2 };
  assert.deepEqual({ ...hydratedTask, ...patch }, { ...hydratedTask, title: 'Edited in modal' }, 'An open modal changes only edited fields and preserves hydrated completion');
  assert.equal(Object.hasOwn(normalizeStoredKodaState({ ...base, profile: { ...base.profile, __kodaRecords: { privateFixture: true } } })!.profile, '__kodaRecords'), false, 'Transport records never enter cached editable profile');
  const backend = new Backend();
  const save = (state: StoredKodaState, owner = 'owner') => writeAppStateSnapshot(backend, owner, reload(state));
  const persisted = () => normalizeStoredKodaState(backend.rows.get('owner'))!;
  const taskDeleted = editProject(p => ({ ...p, updatedAt: t1, tasks: p.tasks.map(task => ({ ...task, deletedAt: t1, updatedAt: t1 })) }));
  const staleTaskEdit = editProject(p => ({ ...p, updatedAt: t2, tasks: p.tasks.map(task => ({ ...task, title: 'Offline rename', updatedAt: t2 })) }), t2, 'rename');
  await save(base); await save(base, 'another-account');
  backend.offline = true;
  await assert.rejects(save(taskDeleted));
  assert.equal(persisted().projects[0].tasks[0].deletedAt, null);
  backend.offline = false;
  await save(taskDeleted); await save(taskDeleted); await save(staleTaskEdit);
  assert.equal(persisted().projects[0].tasks[0].deletedAt, t1, 'Deletion beats a newer stale task edit after offline/reload/retry');
  assert.equal(normalizeStoredKodaState(backend.rows.get('another-account'))!.projects[0].tasks[0].deletedAt, null);

  const archivedProject = editProject(p => ({ ...p, status: 'archived', updatedAt: t1 }));
  await save(archivedProject); await save(staleTaskEdit);
  assert.equal(persisted().projects[0].status, 'archived', 'A task edit must not undo project archive');
  let current = persisted();
  await save({ ...current, projects: recordProjectEdits(current.projects, current.projects.map(p => ({ ...p, status: 'active', updatedAt: t3 })), t3, 'restore-project') });
  assert.equal(persisted().projects[0].status, 'active', 'Explicit restore has its own version');

  const removed = editGoal(g => ({ ...g, updatedAt: t1, milestones: [], routines: [], routineLogs: [], actions: g.actions.map(a => a.id === 'a' ? { ...a, archivedAt: t1 } : a) }));
  const renamed = editGoal(g => ({ ...g, updatedAt: t2, title: 'Offline goal name' }), t2, 'rename-goal');
  await save(removed); await save(renamed); await save(removed);
  const staleNestedArrays = normalizeGoal({ ...removed.goals[0], milestones: goal.milestones, routines: goal.routines, routineLogs: goal.routineLogs })!;
  assert.deepEqual(staleNestedArrays.milestones, []); assert.deepEqual(staleNestedArrays.routines, []); assert.deepEqual(staleNestedArrays.routineLogs, [], 'Reload applies retained removal IDs before rendering');
  assert.equal(persisted().goals[0].title, 'Offline goal name');
  assert.deepEqual(persisted().goals[0].milestones, []); assert.deepEqual(persisted().goals[0].routines, []);
  assert.deepEqual(persisted().goals[0].routineLogs, []);
  assert.equal(persisted().goals[0].actions.find(a => a.id === 'a')!.archivedAt, t1);
  assert.equal(shouldSyncRecoveredAppState(backend.rows.get('owner'), persisted()), false, 'Acknowledged metadata must not create a repair loop');

  const doneA = editGoal(g => ({ ...g, updatedAt: t1, actions: g.actions.map(a => a.id === 'a' ? { ...a, status: 'completed', completedAt: t1 } : a) }), t1, 'done-a');
  const doneB = editGoal(g => ({ ...g, updatedAt: t2, actions: g.actions.map(a => a.id === 'b' ? { ...a, status: 'completed', completedAt: t2 } : a) }), t2, 'done-b');
  await save(doneA); await save(doneB);
  assert.deepEqual(persisted().goals[0].actions.map(a => a.status), ['completed', 'completed'], 'Independent completions both survive');
  current = persisted();
  const undone = { ...current, goals: recordGoalEdits(current.goals, current.goals.map(g => ({ ...g, actions: g.actions.map(a => a.id === 'a' ? { ...a, status: 'pending' as const, completedAt: null } : a) })), t3, 'undo-a') };
  await save(undone); await save(doneA);
  assert.equal(persisted().goals[0].actions[0].status, 'pending', 'Retrying an earlier completion cannot undo a newer explicit undo');

  const archiveHabit = recordHabitEdits([habit], [{ ...habit, archivedAt: t1 }], t1, 'archive-habit');
  const renameHabit = recordHabitEdits([habit], [{ ...habit, title: 'Offline habit name' }], t2, 'rename-habit');
  await save({ ...base, habits: archiveHabit }); await save({ ...base, habits: renameHabit });
  assert.equal(persisted().habits[0].archivedAt, t1); assert.equal(persisted().habits[0].title, 'Offline habit name');
  const mergedHabits = mergeHabits(archiveHabit, renameHabit);
  const restoredHabit = recordHabitEdits(mergedHabits, mergedHabits.map(h => ({ ...h, archivedAt: null })), t3, 'restore-habit');
  await save({ ...base, habits: restoredHabit }); await save({ ...base, habits: archiveHabit });
  assert.equal(persisted().habits[0].archivedAt ?? null, null);

  const fieldA = { ...base, profile: recordProfileEdits(base.profile, { ...base.profile, focus: 'A' }, t1, 'focus'), pomodoro: recordPomodoroEdits(base.pomodoro, { ...base.pomodoro, workMinutes: 45 }, t1, 'work') };
  const fieldB = { ...base, profile: recordProfileEdits(base.profile, { ...base.profile, values: 'B' }, t2, 'values'), pomodoro: recordPomodoroEdits(base.pomodoro, { ...base.pomodoro, breakMinutes: 10 }, t2, 'break') };
  assert.equal(shouldSyncRecoveredAppState(backend.rows.get('another-account'), fieldA), true, 'Field versions repair an interrupted pending flag after reload');
  await save(fieldA); await save(fieldB);
  assert.equal(persisted().profile.focus, 'A'); assert.equal(persisted().profile.values, 'B');
  assert.equal(persisted().pomodoro.workMinutes, 45); assert.equal(persisted().pomodoro.breakMinutes, 10);
  current = persisted();
  await save({ ...current, profile: recordProfileEdits(current.profile, { ...current.profile, focus: '' }, t3, 'clear-focus'), pomodoro: recordPomodoroEdits(current.pomodoro, { ...current.pomodoro, workMinutes: 25 }, t3, 'default-work') });
  await save(fieldA);
  assert.equal(persisted().profile.focus, '', 'Explicit text clear survives stale nonempty values'); assert.equal(persisted().pomodoro.workMinutes, 25);
  assert.equal(mergeStoredKodaState({ ...base, profile: { ...base.profile, focus: 'remote' } }, { ...base, profile: { ...base.profile, focus: 'stale local' } }).profile.focus, 'remote');

  await save(base, 'race');
  backend.beforeWrite = () => backend.rows.set('race', { ...backend.rows.get('race'), goals: doneA.goals, updated_at: 'concurrent' });
  const raced = await save(doneB, 'race');
  assert.equal(backend.conflicts, 1); assert.deepEqual(raced.goals[0].actions.map(a => a.status), ['completed', 'completed'], 'CAS reread retains both concurrent edits');

  const windowGoal = { ...goal, openWindow: createOpenWindow(goal.id) };
  const windowA = recordGoalEdits([windowGoal], [updateOpenWindow(windowGoal, windowGoal.openWindow.directions.map(d => d.position === 0 ? { ...d, title: 'A' } : d), 'A', t1)], t1, 'window-a')[0];
  const windowB = recordGoalEdits([windowGoal], [updateOpenWindow(windowGoal, windowGoal.openWindow.directions.map(d => d.position === 1 ? { ...d, title: 'B' } : d), 'B', t2)], t2, 'window-b')[0];
  const windowMerged = mergeGoals([windowA], [windowB])[0];
  assert.equal(windowMerged.openWindow!.directions[0].title, 'A'); assert.equal(windowMerged.openWindow!.directions[1].title, 'B');
  const reordered = JSON.parse(JSON.stringify(windowMerged, (_key, value) => value && typeof value === 'object' && !Array.isArray(value) ? Object.fromEntries(Object.entries(value).reverse()) : value));
  assert.equal(mergeGoals([windowMerged], [reordered])[0].openWindow!.conflicts!.length, windowMerged.openWindow!.conflicts!.length, 'JSONB object-key reordering does not invent conflicts');
  const conflict = windowMerged.openWindow!.conflicts![0]; assert.ok(conflict);
  const restored = updateOpenWindow(windowMerged, conflict.directions, 'Resolved', t3);
  const resolved = recordGoalEdits([windowMerged], [{ ...restored, openWindow: { ...restored.openWindow!, resolvedConflictIds: [conflict.id], conflicts: restored.openWindow!.conflicts!.filter(c => c.id !== conflict.id) } }], t3, 'resolve-window')[0];
  await save({ ...base, goals: [windowMerged] }, 'window'); await save({ ...base, goals: [resolved] }, 'window');
  for (let i = 0; i < 3; i++) {
    const value = await save({ ...base, goals: [windowMerged] }, 'window');
    assert.ok(!value.goals[0].openWindow!.conflicts!.some(c => c.id === conflict.id), 'Resolved conflict cannot return after stale replay');
    assert.ok(value.goals[0].openWindow!.resolvedConflictIds!.includes(conflict.id));
  }

  assert.deepEqual(recordGoalEdits(base.goals, doneA.goals, t1, 'done-a'), doneA.goals, 'Recording the same operation is idempotent');
  const deletedAction = editGoal(g => ({ ...g, actions: g.actions.filter(a => a.id !== 'a') }), t1, 'remove-action');
  assert.deepEqual(mergeGoals(deletedAction.goals, doneA.goals)[0].actions.map(a => a.id), ['b'], 'A physically removed action cannot return through a stale completion');
  assert.deepEqual(mergeGoals([goal], [{ ...goal, updatedAt: t2, actions: [] }])[0].actions, [], 'Legacy whole-snapshot removal keeps its prior semantics');
  const forward = mergeStoredKodaState(doneA, doneB), backward = mergeStoredKodaState(doneB, doneA);
  assert.deepEqual(forward.goals, backward.goals, 'Registered concurrent changes converge in either arrival order');
  console.log('PASS nested sync: task tombstones; project/habit archive+restore; independent actions and window directions; stage/routine removal; resolved conflicts; profile/pomodoro clears; CAS, offline/reload/retry, account isolation');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
