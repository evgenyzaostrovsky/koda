import assert from 'node:assert/strict';
import type {GoalPlanSuggestion} from '../src/ai/goalPlanContract';
import {applyGoalRoadmap, goalRoadmapStructureSignature} from '../src/features/koda/goalRoadmapStructure';
import {buildGoalPlanContext} from '../src/features/koda/goalPlanContext';
import {calculateMilestoneProgress, createGoal, createGoalAction, createMilestone, normalizeGoal} from '../src/features/koda/goalLogic';
import {recordGoalEdits} from '../src/features/koda/entitySync';
import {mergeGoals, normalizeStoredKodaState, parseStoredKodaState} from '../src/features/koda/persistence';
import {createOpenWindow} from '../src/features/koda/openWindow';
import {currentGoalMilestone, nextRoadmapAction} from '../src/features/koda/components/goalPresentation';

const at = '2026-11-06T10:00:00.000Z';
const initial = createGoal({title: 'Тестовая аналитика', desiredResult: 'Портфолио', deadline: '', priority: 'main'}, at);
const python = {...createMilestone('Python', 'Мои заметки', '', 4), status: 'in_progress' as const};
const done = {...createGoalAction({title: 'Решить пример', milestoneId: python.id}), status: 'completed' as const, completedAt: at};
const pending = {...createGoalAction({title: 'Прочитать модуль', milestoneId: python.id, description: 'Мой конспект', position: 5}), deferredUntil: '2026-11-07', dependsOn: [done.id]};
const archived = {...createGoalAction({title: 'Старый урок', milestoneId: python.id}), archivedAt: at};
const backlog = createGoalAction({title: 'Выбрать данные', description: 'Личный источник', dueDate: '2026-12-01', importance: 'key', position: 9});
const window = createOpenWindow(initial.id);
window.directions[0] = {...window.directions[0], title: 'OTANI', actionIds: [backlog.id]};
window.history.push({id: 'old-history', at, label: 'Старая карта', directions: [], actionsSnapshot: [done], routinesSnapshot: []});
const base = normalizeGoal({...initial, milestones: [python], actions: [done, pending, archived, backlog], openWindow: window})!;
const original = JSON.stringify(base);
const proposal: GoalPlanSuggestion = {desiredResult: 'Не менять результат', goalTitle: 'Не менять название', directions: [
  {title: '  PYTHON  ', actions: [done.title, pending.title, 'Пройти следующий урок'], actionDetails: [{title: pending.title, shortTitle: 'Читать', description: 'Не заменять конспект'}]},
  {title: 'SQL', actions: ['Выбрать   ДАННЫЕ', 'Написать запрос'], actionDetails: [{title: 'Написать запрос', shortTitle: 'Запрос', description: 'Проверить результат запроса'}]},
  {title: 'Статистика', actions: ['Проверить гипотезу']},
  {title: 'Портфолио', actions: []},
]};
const next = applyGoalRoadmap(base, proposal);
assert.equal(JSON.stringify(base), original, 'Application is immutable');
assert.equal(next.title, base.title);
assert.equal(next.desiredResult, base.desiredResult);
assert.equal(next.openWindow, base.openWindow, 'OTANI structure/history untouched');
assert.equal(next.routines, base.routines);
assert.equal(next.routineLogs, base.routineLogs);
assert.equal(next.milestones[0], base.milestones[0], 'Existing milestone identity/status/notes untouched');
for (const id of [done.id, pending.id, archived.id]) assert.equal(next.actions.find(action => action.id === id), base.actions.find(action => action.id === id));
const sql = next.milestones.find(stage => stage.title === 'SQL')!;
assert.deepEqual(next.actions.find(action => action.id === backlog.id), {...base.actions.find(action => action.id === backlog.id), milestoneId: sql.id});
assert.deepEqual(next.milestones.map(stage => stage.position), [4, 5, 6, 7]);
assert.equal(next.actions.find(action => action.title === 'Написать запрос')?.shortTitle, 'Запрос');
assert.equal(next.actions.find(action => action.title === 'Написать запрос')?.description, 'Проверить результат запроса');
assert(next.actions.every(action => action.milestoneId));
assert.equal(applyGoalRoadmap(next, proposal), next, 'An identical reviewed proposal is a no-op');
assert.equal(currentGoalMilestone(next)?.id, python.id);
assert.equal(nextRoadmapAction(next, '2026-11-06').action?.title, 'Пройти следующий урок');

const state = normalizeStoredKodaState({goals: [next]})!;
const reloaded = parseStoredKodaState(JSON.stringify(state))!.goals[0];
assert.equal(goalRoadmapStructureSignature(reloaded), goalRoadmapStructureSignature(next));
assert.equal(applyGoalRoadmap(reloaded, proposal), reloaded, 'Reload does not break idempotency');
assert.deepEqual(reloaded.openWindow, base.openWindow);

const rejects = (directions: GoalPlanSuggestion['directions'], pattern: RegExp) => {
  assert.throws(() => applyGoalRoadmap(base, {desiredResult: '', directions}), pattern);
  assert.equal(JSON.stringify(base), original, 'Rejected proposals do not partially mutate the goal');
};
rejects([{title:'Python',actions:[archived.title]}], /архиве/);
rejects([], /хотя бы один/);
rejects([{title: '', actions: []}], /название/);
rejects([{title: 'SQL', actions: []}, {title: ' sql ', actions: []}], /разные/);
rejects([{title: 'SQL', actions: ['Шаг', ' шаг ']}], /повторяется/);
rejects([{title: 'SQL', actions: ['Шаг']}, {title: 'Статистика', actions: ['Шаг']}], /повторяется/);
rejects([{title: 'SQL', actions: [pending.title]}], /другим этапом/);
rejects([{title: 'SQL', actions: [archived.title]}], /архиве/);
rejects([{title: 'SQL', actions: ['x'.repeat(301)]}], /название/);
assert.throws(() => applyGoalRoadmap({...base, milestones: [...base.milestones, {...python, id: 'duplicate-stage', title: ' PYTHON '}]}, proposal), /несколько этапов/);
assert.throws(() => applyGoalRoadmap({...base, actions: [...base.actions, {...pending, id: 'duplicate-action'}]}, proposal), /несколько шагов/);
assert.throws(() => applyGoalRoadmap({...base, actions: [...base.actions, {...createGoalAction({title: 'Архив без этапа'}), archivedAt: at}]}, {desiredResult: '', directions: [{title: 'SQL', actions: ['Архив без этапа']}]}), /архиве/);
assert.throws(() => applyGoalRoadmap({...base, deletedAt: at}, proposal), /удалена/);
assert.throws(() => applyGoalRoadmap({...base, archivedAt: at, status: 'archived'}, proposal), /архиве/);
const completedGoal = {...base, actions: base.actions.filter(action => action.id !== pending.id)};
assert.equal(calculateMilestoneProgress(python, completedGoal.actions), 100);
assert.throws(() => applyGoalRoadmap(completedGoal, {desiredResult: '', directions: [{title: 'Python', actions: ['Новое будущее']}]}), /завершён/);

const otani = buildGoalPlanContext(base);
assert.deepEqual(otani, buildGoalPlanContext(base, 'otani'), 'Legacy context remains the default');
assert.equal(otani.existingDirections[0].title, 'OTANI');
const context = buildGoalPlanContext(next, 'roadmap');
assert.deepEqual(context.existingDirections.map(stage => stage.title), ['Python', 'SQL', 'Статистика', 'Портфолио']);
assert.deepEqual(context.existingDirections[1].actions, ['Выбрать данные', 'Написать запрос']);
assert(!context.existingDirections[0].actions.includes(archived.title), 'Archived work is not offered as active route work');
assert(context.existingDirections.every(stage => stage.routineTitles.length === 0));
assert.deepEqual(context.existingDirections[0].completedActions, [done.title]);
assert.equal(buildGoalPlanContext(completedGoal, 'roadmap').goalProgress.milestones[0].status, 'completed', 'Completed action progress overrides stale in_progress');
assert.equal(buildGoalPlanContext({...base, milestones: Array.from({length: 12}, (_,index) => createMilestone(`Этап ${index}`, '', '', index))}, 'roadmap').existingDirections.length, 8, 'The provider contract has eight route slots');

// Local sync fixtures: apply and independent completion on another device merge by ID.
const saved = recordGoalEdits([base], [next], '2026-11-06T11:00:00.000Z', 'route-edit')[0];
const otherDevice = recordGoalEdits([base], [{...base, actions: base.actions.map(action => action.id === pending.id ? {...action, status: 'completed', completedAt: '2026-11-06T12:00:00.000Z'} : action), updatedAt: '2026-11-06T12:00:00.000Z'}], '2026-11-06T12:00:00.000Z', 'complete-edit')[0];
const merged = mergeGoals([saved], [otherDevice])[0];
assert.equal(goalRoadmapStructureSignature(saved), goalRoadmapStructureSignature(next), 'Sync metadata does not invalidate the apply receipt');
assert.equal(merged.actions.find(action => action.id === pending.id)?.status, 'completed');
assert.equal(goalRoadmapStructureSignature(merged), goalRoadmapStructureSignature(next));
assert.equal(applyGoalRoadmap(merged, proposal), merged);
assert.deepEqual(mergeGoals([saved], [otherDevice]), mergeGoals([otherDevice], [saved]));
assert.deepEqual(mergeGoals([merged], [saved]), [merged], 'A replay cannot revert completion or duplicate new rows');
const removedId = saved.actions.find(action => action.title === 'Написать запрос')!.id;
const removed = recordGoalEdits([saved], [{...saved, actions: saved.actions.filter(action => action.id !== removedId), updatedAt: '2026-11-06T13:00:00.000Z'}], '2026-11-06T13:00:00.000Z', 'remove-edit')[0];
assert(!mergeGoals([removed], [saved])[0].actions.some(action => action.id === removedId), 'A stale saved route cannot resurrect a deleted action');
console.log('PASS roadmap structure: linked stages, additive merge, IDs/progress/OTANI preservation, atomic collision rejection, idempotency/reload, roadmap context, independent device completion and deletion replay.');
