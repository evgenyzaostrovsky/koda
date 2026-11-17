import assert from 'node:assert/strict';
import { calculateStudyPlan } from '../src/ai/studyPlanning';
import { applyGoalStudyPlan, normalizeGoalStudyPlan } from '../src/features/koda/goalStudyPlan';
import { calculateMilestoneProgress, createGoal, createGoalAction, normalizeGoal } from '../src/features/koda/goalLogic';
import { mergeGoalEntities, recordGoalEdits } from '../src/features/koda/entitySync';
import { normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { nextAvailableGoalAction, nextRoadmapAction } from '../src/features/koda/components/goalPresentation';
import { advanceAutoPlan, buildAutoPlanItems, configureAutoPlan, recordAutoPlanCompletion } from '../src/features/koda/autoPlan';
import { emptyWizardSyncState, mergeWizardRevisions, normalizeWizardDraft, parseWizardSyncState, resolveWizardConflict,
  stageWizardDraft, syncWizardDraft, wizardSyncView, type WizardRevision } from '../src/features/koda/wizardDraftSync';

const t0 = '2026-11-08T08:00:00.000Z', t1 = '2026-11-08T09:00:00.000Z', t2 = '2026-11-08T10:00:00.000Z';
const plan = calculateStudyPlan({ dailyMinutes: 120, studyDays: [0, 1, 2, 3, 4, 5, 6], assumptions: ['Test fixture'], modules: [
  { id: 'intro', title: 'Введение', status: 'completed', estimatedMinutes: 0 },
  { id: 'first', title: 'Модуль один', status: 'current', estimatedMinutes: 180 },
  { id: 'next', title: 'Модуль два', status: 'remaining', estimatedMinutes: 240, availableFrom: '2026-11-12' },
] }, '2026-11-08', '2026-11-15')!;
const initial = normalizeGoal({ ...createGoal({ title: 'Test course', desiredResult: 'Finish', deadline: '', priority: 'important' }, t0),
  actions: [createGoalAction({ title: 'Later exercise', studyModuleId: 'next', position: 0 }),
    createGoalAction({ title: 'First exercise', studyModuleId: 'first', position: 0 }),
    { ...createGoalAction({ title: 'Completed exercise', studyModuleId: 'first', position: 1 }), status: 'completed', completedAt: t0 },
    createGoalAction({ title: 'Модуль один', position: 2 })] })!;

async function main() {
  const original = structuredClone(initial);
  const applied = applyGoalStudyPlan(initial, plan);
  assert.deepEqual(initial, original, 'Application is pure and preserves the opening snapshot');
  assert.deepEqual(applied.studyPlan, plan);
  assert.deepEqual(applied.milestones.map(m => [m.studyModuleId, m.status, m.startDate, m.deadline]), [
    ['intro', 'completed', undefined, ''], ['first', 'in_progress', '2026-11-08', '2026-11-09'],
    ['next', 'not_started', '2026-11-12', '2026-11-13']]);
  const first = applied.actions.find(a => a.title === 'First exercise')!;
  const later = applied.actions.find(a => a.title === 'Later exercise')!;
  assert.equal(first.milestoneId, applied.milestones[1].id);
  assert.equal(later.milestoneId, applied.milestones[2].id);
  assert.deepEqual(later.dependsOn, [first.id]);
  assert.equal(later.deferredUntil, '2026-11-12');
  assert.equal(applied.actions.find(a => a.title === 'Модуль один')!.milestoneId, null, 'Titles alone do not establish a module identity');
  assert.equal(applied.actions.find(a => a.title === 'Completed exercise')!.completedAt, t0);
  assert.deepEqual(applied.actions.map(a => a.position), [0, 1, 2, 3]);
  assert.equal(nextRoadmapAction(applied, '2026-11-08').action?.id, first.id);
  assert.deepEqual(applyGoalStudyPlan(applied, plan), applied, 'Retry does not duplicate modules or dependencies');
  assert.notEqual(applyGoalStudyPlan({ ...initial, id: 'another-goal' }, plan).milestones[0].id, applied.milestones[0].id, 'Generated IDs are goal-scoped');
  const allDone = { ...applied, actions: applied.actions.map(a => ({ ...a, status: 'completed' as const, completedAt: t1 })) };
  assert.equal(calculateMilestoneProgress(allDone.milestones[1], allDone.actions), 0, 'Completing sample actions is not completing the curriculum');
  assert.equal(nextRoadmapAction(allDone, '2026-11-20').current?.studyModuleId, 'first');
  const completed = { ...applied, milestones: applied.milestones.map(m => m.studyModuleId === 'first' ? { ...m, status: 'completed' as const, completedAt: t1 } : m) };
  assert.equal(applyGoalStudyPlan(completed, plan).milestones[1].completedAt, t1, 'An accepted older plan cannot undo module completion');
  assert.equal(applyGoalStudyPlan(completed, plan).milestones[1].status, 'completed');

  const sessionsPlan = calculateStudyPlan({ dailyMinutes: 120, studyDays: [1, 2, 3, 4, 5], modules: [
    { id: 'practice', title: 'Практика', status: 'current', estimatedMinutes: 240 },
  ] }, '2026-11-06')!;
  const sessionsGoal = { ...initial, actions: [0, 1].map(position => createGoalAction({
    title: `Exercise ${position + 1}`, studyModuleId: 'practice', estimatedMinutes: 120, position })) };
  const sessionDates = applyGoalStudyPlan(sessionsGoal, sessionsPlan);
  assert.deepEqual(sessionDates.actions.map(action => [action.dueDate, action.deferredUntil, action.estimatedMinutes]), [
    ['2026-11-06', '2026-11-06', 120], ['2026-11-09', '2026-11-09', 120],
  ], 'Two full sessions use separate study days and skip weekends');
  assert.deepEqual(applyGoalStudyPlan(sessionDates, sessionsPlan), sessionDates, 'Allocated dates remain stable on retry');
  assert.equal(nextAvailableGoalAction({ ...sessionDates, actions: sessionDates.actions.map((action, index) => index === 0
    ? { ...action, status: 'completed' as const } : action) }, '2026-11-08'), undefined,
    'A second exercise is unavailable before its own session, even though its module has started');

  const sharedPlan = calculateStudyPlan({ dailyMinutes: 120, studyDays: [0, 1, 2, 3, 4, 5, 6], modules: [
    { id: 'foundation', title: 'Основы', status: 'current', estimatedMinutes: 180 },
    { id: 'practice', title: 'Практика', status: 'remaining', estimatedMinutes: 180 },
  ] }, '2026-11-08')!;
  const sharedGoal = { ...initial, actions: [
    createGoalAction({ title: 'Foundation sample', studyModuleId: 'foundation', estimatedMinutes: 30, position: 0 }),
    createGoalAction({ title: 'Short practice', studyModuleId: 'practice', estimatedMinutes: 60, position: 1 }),
    createGoalAction({ title: 'Full practice', studyModuleId: 'practice', estimatedMinutes: 120, position: 2 }),
  ] };
  const sharedDates = applyGoalStudyPlan(sharedGoal, sharedPlan);
  assert.deepEqual(sharedDates.actions.map(action => action.dueDate), ['2026-11-08', '2026-11-09', '2026-11-10'],
    'Replay all 180 foundation minutes, including unsampled work: only 60 practice minutes fit on the shared day');
  const fullOnShared = applyGoalStudyPlan({ ...sharedGoal, actions: [sharedGoal.actions[0], sharedGoal.actions[2]] }, sharedPlan);
  assert.equal(fullOnShared.actions[1].dueDate, '2026-11-10', 'An indivisible 120-minute exercise cannot use a 60-minute remainder');
  assert.throws(() => applyGoalStudyPlan({ ...sharedGoal, actions: [
    sharedGoal.actions[0], { ...sharedGoal.actions[2], position: 1 }, { ...sharedGoal.actions[1], position: 2 },
  ] }, sharedPlan), /не помещается целиком/, 'Do not overflow a module or reorder exercises when whole sessions cannot fit');

  const manual = { ...sessionsGoal, actions: sessionsGoal.actions.map((action, index) => index === 0
    ? { ...action, dueDate: '2026-11-09' } : action) };
  const withManual = applyGoalStudyPlan(manual, sessionsPlan);
  assert.deepEqual(withManual.actions.map(action => action.dueDate), ['2026-11-09', '2026-11-06'],
    'Preserve a chosen date and reserve its capacity before placing another exercise');
  const progressAndUnknown = { ...sessionsGoal, actions: [
    { ...sessionsGoal.actions[0], status: 'completed' as const, completedAt: t0, dueDate: '2026-11-01' },
    { ...sessionsGoal.actions[1], estimatedMinutes: null },
  ] };
  const preserved = applyGoalStudyPlan(progressAndUnknown, sessionsPlan);
  assert.equal(preserved.actions[0].dueDate, '2026-11-01');
  assert.equal(preserved.actions[0].completedAt, t0);
  assert.equal(preserved.actions[1].estimatedMinutes, null, 'Legacy actions do not acquire fabricated duration estimates');
  assert.equal(preserved.actions[1].dueDate, '2026-11-06');
  const releasePlan = calculateStudyPlan({ ...sessionsPlan, modules: sessionsPlan.modules.map(module => ({ ...module, availableFrom: '2026-11-10' })) }, '2026-11-06')!;
  assert.deepEqual(applyGoalStudyPlan(sessionsGoal, releasePlan).actions.map(action => action.dueDate), ['2026-11-10', '2026-11-11'],
    'Sessions respect the module opening date');

  // Test the public selectors and calendar projection, not just generated ordering metadata.
  // Real exercise durations are fixture inputs; the module's 180/240 minutes are not action estimates.
  const scheduled = { ...applied, priority: 'main' as const,
    actions: applied.actions.map(action => ({ ...action, estimatedMinutes: 60 })) };
  const sampleDone = { ...scheduled, actions: scheduled.actions.map(action => action.id === first.id
    ? { ...action, status: 'completed' as const, completedAt: t1 } : action) };
  const stageDone = { ...scheduled, milestones: completed.milestones };
  const sampleAndStageDone = { ...sampleDone, milestones: completed.milestones };
  const at = (date: string) => `${date}T08:00:00.000Z`;
  const enabled = () => configureAutoPlan(undefined, 'study-test-account',
    { enabled: true, dailyMinutes: 120, timezone: 'Europe/Moscow' }, t0, 'enable-study');
  const startState = advanceAutoPlan(enabled(), [scheduled], [], '2026-11-08', at('2026-11-08'));
  const assignment = startState.assignments.find(item => item.actionId === first.id)!;
  const actionDoneState = recordAutoPlanCompletion(startState, assignment.id, true, '2026-11-08', t1, 'finish-sample');
  const behaviorErrors: string[] = [];
  const check = (label: string, run: () => void) => {
    try { run(); } catch (error) { behaviorErrors.push(`${label}: ${error instanceof Error ? error.message : String(error)}`); }
  };
  check('Next step stays in current module', () => {
    assert.equal(nextAvailableGoalAction(scheduled, '2026-11-12')?.id, first.id);
    assert.equal(nextAvailableGoalAction(sampleDone, '2026-11-12'), undefined,
      'A pending later exercise must not replace an explicitly unfinished current module');
    assert.equal(nextAvailableGoalAction(stageDone, '2026-11-11'), undefined);
    assert.equal(nextAvailableGoalAction(stageDone, '2026-11-12')?.id, later.id,
      'Explicit module completion satisfies its pending exercise dependencies');
  });
  check('No auto assignment before course or module availability', () => {
    const beforeStart = advanceAutoPlan(enabled(), [scheduled], [], '2026-11-07', at('2026-11-07'));
    assert.equal(beforeStart.assignments.length, 0);
    assert.equal(nextAvailableGoalAction(scheduled, '2026-11-07'), undefined);
    const beforeOpening = advanceAutoPlan(enabled(), [stageDone], [], '2026-11-11', at('2026-11-11'));
    assert.equal(beforeOpening.assignments.length, 0);
    assert.deepEqual(buildAutoPlanItems(beforeOpening, [stageDone], '2026-11-11'), []);
  });
  check('Autoplan selects current module and respects the 120 minute limit', () => {
    assert.deepEqual(startState.assignments.map(item => item.actionId), [first.id]);
    assert.equal(startState.assignments[0].estimatedMinutes, 60);
    assert.ok(startState.assignments.reduce((sum, item) => sum + item.estimatedMinutes, 0) <= 120);
    assert.deepEqual(buildAutoPlanItems(startState, [scheduled], '2026-11-08').map(item => item.goalActionId), [first.id]);
  });
  check('Finishing a sample does not advance the module in autoplan', () => {
    const waiting = advanceAutoPlan(actionDoneState, [sampleDone], [], '2026-11-12', at('2026-11-12'));
    assert.equal(waiting.assignments.some(item => item.actionId === later.id), false);
    assert.deepEqual(buildAutoPlanItems(waiting, [sampleDone], '2026-11-12').filter(item => !item.done), []);
  });
  check('Completed sample plus explicit module completion unlocks opening day', () => {
    const before = advanceAutoPlan(actionDoneState, [sampleAndStageDone], [], '2026-11-11', at('2026-11-11'));
    assert.equal(before.assignments.some(item => item.actionId === later.id), false);
    const opened = advanceAutoPlan(before, [sampleAndStageDone], [], '2026-11-12', at('2026-11-12'));
    assert.equal(opened.assignments.some(item => item.actionId === later.id), true);
    assert.deepEqual(buildAutoPlanItems(opened, [sampleAndStageDone], '2026-11-12').filter(item => !item.done)
      .map(item => [item.goalActionId, item.date]), [[later.id, '2026-11-12']]);
  });
  check('Explicit module completion supersedes an uncompleted admitted sample', () => {
    const opened = advanceAutoPlan(startState, [stageDone], [], '2026-11-12', at('2026-11-12'));
    assert.equal(opened.assignments.some(item => item.actionId === later.id), true,
      'An obsolete admitted sample must not reserve the day and block the next module');
    assert.deepEqual(buildAutoPlanItems(opened, [stageDone], '2026-11-12').filter(item => !item.done)
      .map(item => [item.goalActionId, item.date]), [[later.id, '2026-11-12']]);
  });
  check('Opening a completed-stage goal on a fresh device projects the new module', () => {
    const opened = advanceAutoPlan(enabled(), [stageDone], [], '2026-11-12', at('2026-11-12'));
    assert.deepEqual(opened.assignments.map(item => item.actionId), [later.id]);
    assert.deepEqual(buildAutoPlanItems(opened, [stageDone], '2026-11-12').filter(item => !item.done)
      .map(item => [item.goalActionId, item.date]), [[later.id, '2026-11-12']],
      'Calendar projection must use the same effective completion rule as assignment generation');
  });
  assert.deepEqual(behaviorErrors, [], 'Study next-step and autoplan regressions');
  const removed = recordGoalEdits([applied], [{ ...applied, milestones: applied.milestones.filter(m => m.studyModuleId !== 'next') }], t1, 'delete-stage')[0];
  assert.equal(applyGoalStudyPlan(removed, plan).milestones.some(m => m.studyModuleId === 'next'), false, 'Deleted modules are not resurrected');
  const deletedGoal = { ...initial, deletedAt: t1 };
  assert.equal(applyGoalStudyPlan(deletedGoal, plan), deletedGoal);
  const cyclic = { ...initial, actions: initial.actions.map(a => a.studyModuleId === 'first' && a.status === 'pending'
    ? { ...a, dependsOn: [later.id] } : a) };
  assert.throws(() => applyGoalStudyPlan(cyclic, plan), /зависимост/);

  const stored = normalizeStoredKodaState({ goals: [applied] })!;
  const restored = parseStoredKodaState(JSON.stringify(stored))!.goals[0];
  assert.deepEqual(restored.studyPlan, plan);
  assert.deepEqual(restored.milestones, applied.milestones);
  assert.equal(restored.actions.find(a => a.id === first.id)!.studyModuleId, 'first');
  assert.deepEqual(normalizeGoalStudyPlan(plan), plan, 'Persisted dates are not recomputed');
  assert.equal(normalizeGoalStudyPlan({ ...plan, totalMinutes: 1 }), undefined);
  assert.equal(normalizeGoalStudyPlan({ ...plan, modules: [plan.modules[1], plan.modules[1]] }), undefined);
  assert.equal(normalizeGoalStudyPlan({ ...plan, modules: plan.modules.map(m => m.id === 'next' ? { ...m, startDate: '2026-02-30' } : m) }), undefined);

  const accepted = recordGoalEdits([initial], [applied], t1, 'apply-study')[0];
  const renamed = recordGoalEdits([initial], [{ ...initial, title: 'Offline rename', updatedAt: t2 }], t2, 'rename')[0];
  const merged = mergeGoalEntities(accepted, renamed);
  assert.deepEqual(merged.studyPlan, plan, 'An unrelated later device edit cannot erase the plan');
  assert.equal(merged.title, 'Offline rename');
  assert.equal(merged.actions.find(a => a.id === first.id)!.milestoneId, first.milestoneId);
  assert.deepEqual(mergeGoalEntities(renamed, accepted), merged, 'Merge order converges for versioned study fields');
  const cleared = recordGoalEdits([accepted], [{ ...accepted, studyPlan: undefined }], t2, 'clear-study')[0];
  assert.equal(mergeGoalEntities(accepted, cleared).studyPlan, undefined, 'Explicit removal has a version and survives stale replay');

  const owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const draft = normalizeWizardDraft({ version: 1, wish: 'Course', studyPlan: plan, directions: [] })!;
  const local = stageWizardDraft(emptyWizardSyncState(owner), draft, 'study-draft');
  assert.deepEqual(wizardSyncView(parseWizardSyncState(JSON.stringify(local), owner)).draft?.studyPlan, plan);
  assert.throws(() => parseWizardSyncState(JSON.stringify(local), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), /account mismatch/);
  const remote: WizardRevision[] = [];
  let loseAck = true;
  const transport = { async pull() { return structuredClone(remote); }, async push(_owner: string, revision: WizardRevision) {
    if (!remote.some(item => item.id === revision.id)) remote.push(structuredClone(revision));
    if (loseAck) { loseAck = false; throw new Error('Lost response fixture'); }
  } };
  await assert.rejects(syncWizardDraft(local, transport));
  const synced = await syncWizardDraft(parseWizardSyncState(JSON.stringify(local), owner), transport);
  assert.equal(remote.length, 1);
  assert.deepEqual(synced.outbox, []);
  assert.deepEqual(wizardSyncView(synced).draft?.studyPlan, plan);
  const other = stageWizardDraft(emptyWizardSyncState(owner), { ...draft, wish: 'Competing edit' }, 'other-draft');
  const conflict = mergeWizardRevisions(synced, other.revisions);
  assert.equal(wizardSyncView(conflict).kind, 'conflict');
  assert.deepEqual(wizardSyncView(resolveWizardConflict(conflict, 'study-draft', 'resolved')).draft?.studyPlan, plan);
  const removedDraft = stageWizardDraft(synced, null, 'deleted-draft');
  assert.equal(wizardSyncView(mergeWizardRevisions(removedDraft, synced.revisions)).kind, 'deleted');
  console.log('Study plan persistence, dated links, progress, retry, deletion, conflicts and account scope: PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
