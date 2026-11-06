import assert from 'node:assert/strict';
import {findAccountCompletionCandidates, findGoalCompletionCandidates} from '../src/features/koda/goalCompletion';
import {advanceAutoPlan, applyAutoPlanProgress, buildAutoPlanItems, configureAutoPlan, mergeAutoPlans, parseAutoPlanState, recordAutoPlanCompletion, recordAutoPlanGoalChanges} from '../src/features/koda/autoPlan';
import {createGoal, createGoalAction} from '../src/features/koda/goalLogic';
import {buildGoalPlanContext} from '../src/features/koda/goalPlanContext';

const at = '2026-11-06T10:00:00.000Z', date = '2026-11-06';
const lesson = {...createGoalAction({title: 'Пройти урок 6: Python', estimatedMinutes: 20}), id: 'lesson6'};
const goal = {...createGoal({title: 'Учебная цель', desiredResult: '', deadline: '', priority: 'main'}, at), actions: [lesson]};
const candidates = (content: string) => findGoalCompletionCandidates(goal, {role: 'user', content}).map(action => action.id);
for (const text of ['Я уже прошёл урок 6', 'Урок №6 давно пройден', 'Я прошла шестой урок', 'Закончил 6-й урок', 'Я выполнил: Пройти урок 6: Python']) {
  assert.deepEqual(candidates(text), ['lesson6'], text);
}
const lessonAndFollowup = {...goal, actions: [
  {...lesson, title: 'Закончить 6 урок. Исследование данных и создание метрик'},
  {...lesson, id: 'followup', title: 'В материалах курса найти ближайший невыполненный пункт после 6-го урока и записать его название'},
  {...lesson, id: 'exercise', title: 'Решить упражнение про урок 6'},
  {...lesson, id: 'after', title: 'После урок 6 написать конспект'},
]};
assert.deepEqual(findGoalCompletionCandidates(lessonAndFollowup, {role: 'user', content: 'Шестой урок давно пройден. Не предлагай его заново'}).map(action => action.id), ['lesson6']);
for (const text of ['Нет, урок6 ещё не пройден', 'Урок6 пройден. Нет, урок6 ещё не пройден', 'Я выполнил упражнение про урок 6', 'Я закончил конспект: урок 6']) {
  assert.deepEqual(candidates(text), [], text);
}
assert.deepEqual(candidates('Урок 6 не пройден. Исправляюсь: я прошел урок 6'), ['lesson6'], 'Later positive clarification in same message wins');
assert.deepEqual(findGoalCompletionCandidates({...goal, actions: [{...lesson, title: 'Урок 6'}]}, {role: 'user', content: 'Я закончил конспект: урок 6'}), [], 'An exact short lesson title is not completion of an exercise about it');
assert.deepEqual(candidates('Я выполнил: Пройти урок 6: Python. Нет, урок 6 не пройден'), [], 'A later short denial overrides an earlier full-title claim');
for (const text of ['Пройди урок 6', 'Я не прошел урок 6', 'Урок 6 не пройден', 'Я прошел урок 6?', 'Возможно, урок 6 пройден', 'Я прошел урок 60', 'Я прошел 6 уроков', 'Нужно, чтобы урок 6 был завершен', 'В программе есть урок 6']) {
  assert.deepEqual(candidates(text), [], text);
}
assert.deepEqual(findGoalCompletionCandidates(goal, {role: 'assistant', content: 'Урок 6 завершен'}), []);
assert.deepEqual(findGoalCompletionCandidates({...goal, actions: [lesson, {...lesson, id: 'other-course', title: 'Урок 6: SQL'}]}, {role: 'user', content: 'Прошел урок 6'}), [], 'Same-number lessons in different courses are ambiguous');
assert.deepEqual(findGoalCompletionCandidates({...goal, actions: [{...lesson, archivedAt: at}]}, {role: 'user', content: 'Прошел урок 6'}), []);
const completedGoal = {...goal, actions: [{...lesson, status: 'completed' as const, completedAt: at}]};
assert.deepEqual(findGoalCompletionCandidates(completedGoal, {role: 'user', content: 'Прошел урок 6'}), []);
assert.deepEqual(findAccountCompletionCandidates([goal, {...completedGoal, id: 'another-goal'}], {role: 'user', content: 'Прошел урок 6'}), [], 'Completed lesson in another goal remains ambiguous');
assert.equal(findAccountCompletionCandidates([goal], {role: 'user', content: 'Прошел урок 6'})[0].goalId, goal.id);
assert.deepEqual(buildGoalPlanContext({...completedGoal, actions: completedGoal.actions.map(action => ({...action, archivedAt: at}))}).goalProgress.completedActions, [lesson.title], 'Archived completed work stays in planning evidence');

const initial = advanceAutoPlan(configureAutoPlan(undefined, 'account-a', {enabled: true, timezone: 'Europe/Moscow'}, at, 'settings'), [goal], [], date, at);
// A previously admitted action becomes hidden behind an unresolved dependency.
const blocked = {...goal, actions: [{...lesson, dependsOn: ['missing']} ]};
assert.deepEqual(buildAutoPlanItems(initial, [blocked], date), []);
const confirmed = {...blocked, actions: blocked.actions.map(action => ({...action, status: 'completed' as const, completedAt: at}))};
const next = recordAutoPlanGoalChanges(initial, [blocked], [confirmed], date, at, 'confirm-lesson6');
assert.equal(next.completions.length, 1, 'Explicit confirmation reaches a hidden admitted assignment');
assert.equal(initial.completions.length, 0, 'Input state is immutable');
assert.equal(recordAutoPlanGoalChanges(next, [blocked], [confirmed], date, at, 'confirm-lesson6'), next, 'Retry uses the same operation ID');
assert.equal(recordAutoPlanGoalChanges(next, [confirmed], [{...confirmed, title: 'Renamed'}], date, at, 'rename'), next, 'Unrelated edits do not invent completion operations');
const merged = mergeAutoPlans(initial, next)!;
assert.deepEqual(mergeAutoPlans(next, initial), merged, 'Stale device replay preserves explicit completion');
assert.equal(applyAutoPlanProgress(merged, [blocked])[0].actions[0].status, 'completed');
assert.equal(buildAutoPlanItems(merged, [blocked], date)[0].done, true);
assert.equal(parseAutoPlanState(JSON.parse(JSON.stringify(merged)), 'account-a')?.completions.length, 1);
assert.equal(parseAutoPlanState(merged, 'account-b'), undefined, 'Account boundary rejects foreign progress');
const undo = recordAutoPlanGoalChanges(next, [confirmed], [blocked], date, '2026-11-06T12:00:00.000Z', 'undo');
assert.equal(applyAutoPlanProgress(mergeAutoPlans(next, undo), [confirmed])[0].actions[0].status, 'pending');
const later = recordAutoPlanCompletion(next, next.assignments[0].id, false, date, '2026-11-06T13:00:00.000Z', 'later-calendar-undo');
assert.equal(applyAutoPlanProgress(mergeAutoPlans(later, next), [confirmed])[0].actions[0].status, 'pending', 'Later explicit calendar undo wins over delayed correction');
console.log('PASS explicit completion suggestions, negation/ambiguity, archived completion context, hidden assignment confirmation, idempotency/reload, stale-device merge, explicit undo and account isolation');
