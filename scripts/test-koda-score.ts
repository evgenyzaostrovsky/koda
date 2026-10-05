import assert from 'node:assert/strict';
import { calculateKodaScore, classificationLabel } from '../src/features/koda/kodaScore';
import type { Goal, PlannerItem } from '../src/features/koda/types';

const date = '2026-08-01';

function goal(overrides: Partial<Goal>): Goal {
  return {
    id: overrides.id ?? 'goal-1',
    title: overrides.title ?? 'Data Analyst',
    desiredResult: '',
    deadline: '',
    priority: overrides.priority ?? 'main',
    status: overrides.status ?? 'active',
    createdAt: '',
    updatedAt: '',
    completedAt: null,
    archivedAt: null,
    milestones: [],
    actions: overrides.actions ?? [],
    routines: overrides.routines ?? [],
    routineLogs: overrides.routineLogs ?? [],
  };
}

const goals = [
  goal({
    id: 'main',
    priority: 'main',
    routines: [{ id: 'study', title: 'Учёба', metricType: 'minutes', targetValue: 120, frequencyType: 'daily', weekdays: [], startDate: date, endDate: '', isActive: true }],
    routineLogs: [{ id: 'log-1', routineId: 'study', date, value: 60, createdAt: '', updatedAt: '' }],
  }),
  goal({
    id: 'important',
    priority: 'important',
    routines: [{ id: 'calls', title: 'Звонки', metricType: 'count', targetValue: 10, frequencyType: 'daily', weekdays: [], startDate: date, endDate: '', isActive: true }],
    routineLogs: [{ id: 'log-2', routineId: 'calls', date, value: 10, createdAt: '', updatedAt: '' }],
  }),
];

const planner: PlannerItem[] = [
  { id: 'task-1', date, time: '', title: 'Быт', done: true, subtasks: [] },
  { id: 'task-2', date, time: '', title: 'Письмо', done: false, subtasks: [] },
];

const result = calculateKodaScore(goals, planner, date);
assert.equal(Math.round(result.goalScore ?? 0), 56);
assert.equal(result.plannerScore, 5);
assert.equal(Math.round(result.totalScore ?? 0), 61);
assert.equal(classificationLabel(result.classification), 'МИНИМУМ');

const unclassified = calculateKodaScore([], planner, date);
assert.equal(unclassified.goalScore, null);
assert.equal(unclassified.totalScore, null);
assert.equal(unclassified.classification, 'unclassified');

const failedItems = planner.map((item) => item.done ? item : { ...item, failed: true });
const failedResult = calculateKodaScore(goals, failedItems, date);
assert.equal(failedResult.planner.penalty, 2);
assert.equal(failedResult.totalScore, (result.totalScore ?? 0) - 2);
assert.equal(calculateKodaScore(goals, failedItems.map((item) => ({ ...item, failed: false })), date).totalScore, result.totalScore);
const restored = calculateKodaScore(goals, failedItems.map((item) => ({ ...item, failed: false, done: true })), date);
assert.equal(restored.planner.penalty, 0);
assert.equal(restored.plannerScore, 10);
const manyFailures = Array.from({ length: 60 }, (_, i) => ({ id: `failed-${i}`, date, time: '', title: 'Не выполнено', done: false, failed: true }));
assert.equal(calculateKodaScore(goals, manyFailures, date).totalScore, 0);
assert.equal(calculateKodaScore(goals, [...planner, { ...manyFailures[0], deletedAt: '2026-08-01T12:00:00Z' }, { ...manyFailures[1], date: '2026-08-02' }], date).totalScore, result.totalScore);
console.log('koda score tests passed');
