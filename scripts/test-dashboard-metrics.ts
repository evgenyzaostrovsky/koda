import assert from 'node:assert/strict';
import type { Habit, KodaDay } from '../src/features/koda/types';
import { aggregateHabitStreak, monthlyScoreCoordinates, monthlyScoreSummary, weeklyScoreSummary } from '../src/features/koda/dashboardMetrics';

function day(localDate: string, totalScore: number, scoreVersion = 3, status: KodaDay['status'] = 'completed'): KodaDay {
  return { id: localDate, localDate, timezone: 'UTC', status, startedAt: null, finishedAt: null, goalScore: null,
    plannerScore: 0, totalScore, classification: 'unclassified', scoreVersion, summary: '', focusLoss: '',
    nextRecommendation: '', goalsSnapshot: [], plannerSnapshot: [], calculationSnapshot: null, createdAt: '', updatedAt: localDate };
}
const summary = weeklyScoreSummary([
  day('2026-10-24', 80), day('2026-10-23', 40), day('2026-10-22', 100, 2), day('2026-10-20', 10, 3, 'active'),
  day('2026-10-17', 100), // outside the seven calendar dates
], '2026-10-24');
assert.deepEqual(summary, { average: 60, completedCount: 2 });
assert.deepEqual(weeklyScoreSummary([], '2026-10-24'), { average: null, completedCount: 0 });

function habit(id: string, patch: Partial<Habit> = {}): Habit {
  return { id, title: id, target: '', doneDays: [], monthDays: [], monthHistory: {}, createdDate: '2026-10-20', ...patch };
}
const daily = habit('daily', { dayEdits: Object.fromEntries(['2026-10-20','2026-10-21','2026-10-22','2026-10-23'].map((date, i) => [date, { done: true, at: `${date}T12:00:00Z`, id: String(i) }])) });
// Today is unfinished, so yesterday's completed run remains current. A gap on the previous day breaks it.
assert.equal(aggregateHabitStreak([daily], '2026-10-24'), 4);
const gap = habit('gap', { dayEdits: { '2026-10-23': { done: false, at: '2026-10-23T12:00:00Z', id: 'x' } } });
assert.equal(aggregateHabitStreak([gap], '2026-10-24'), 0);
const weekdays = habit('weekdays', { frequency: 'weekdays', weekdays: [1,2,3,4,5], dayEdits: {
  '2026-10-22': { done: true, at: '2026-10-22T12:00:00Z', id: '1' }, '2026-10-23': { done: true, at: '2026-10-23T12:00:00Z', id: '2' },
} });
assert.equal(aggregateHabitStreak([weekdays], '2026-10-26'), 2); // Saturday/Sunday are rest days, not completions
assert.equal(aggregateHabitStreak([habit('new', { createdDate: '2026-10-24' })], '2026-10-23'), 0);
console.log('Dashboard metrics tests passed.');

const monthlyDays = [
 {id:'a',localDate:'2026-10-01',updatedAt:'2026-10-01',status:'completed',scoreVersion:3,totalScore:20},
 {id:'b',localDate:'2026-10-02',updatedAt:'2026-10-02',status:'completed',scoreVersion:3,totalScore:80},
 {id:'c',localDate:'2026-09-30',updatedAt:'2026-10-02',status:'completed',scoreVersion:3,totalScore:100},
 {id:'d',localDate:'2026-10-03',updatedAt:'2026-10-03',status:'active',scoreVersion:3,totalScore:100},
 {id:'e',localDate:'2026-10-01',updatedAt:'2026-10-04',status:'completed',scoreVersion:3,totalScore:40},
] as KodaDay[];
assert.equal(monthlyScoreSummary(monthlyDays,'2026-10').average,60);
assert.equal(monthlyScoreSummary(monthlyDays,'2026-10').points.length,2);
assert.equal(monthlyScoreSummary(monthlyDays,'2026-08').average,null);
console.log('Monthly SCORE: month boundaries, latest revisions, active days and empty month passed.');

const paused = {...daily,isActive:false,pauseEdits:{'2026-10-24':{paused:true,at:'2026-10-24T08:00:00Z',id:'pause'}}};
assert.equal(aggregateHabitStreak([paused],'2026-10-24'),4);
assert.equal(aggregateHabitStreak([paused],'2026-10-25'),4);
assert.equal(aggregateHabitStreak([{...paused,isActive:true,pauseEdits:{...paused.pauseEdits,'2026-10-26':{paused:false,at:'2026-10-26T08:00:00Z',id:'resume'}}}],'2026-10-26'),4);
assert.equal(aggregateHabitStreak([{...paused,deletedAt:'2026-10-24'}],'2026-10-24'),0);
const positions = monthlyScoreCoordinates([{date:'2026-10-01',value:10},{date:'2026-10-02',value:20},{date:'2026-10-20',value:30}],'2026-10');
assert.ok(Math.abs((positions[2].x-positions[1].x)/(positions[1].x-positions[0].x)-18)<1e-8);
assert.equal(monthlyScoreCoordinates([{date:'2024-02-28',value:50},{date:'2024-02-29',value:100}],'2024-02')[1].x,158);
console.log('Aggregate pause/resume history and calendar-spaced monthly graph regressions passed.');
