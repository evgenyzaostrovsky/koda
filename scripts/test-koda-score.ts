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

console.log('koda score tests passed');
