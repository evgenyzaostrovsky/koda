import type { Habit, KodaDay } from './types';
import { habitDoneOn, habitMetadata, habitPausedOn, normalizeHabitPauseEdits } from './habitModel';
import { plannerDateOffset } from './plannerOverview';

export function monthlyScoreSummary(days: KodaDay[], month: string) {
  const latest = new Map<string, KodaDay>();
  for (const day of [...days].sort((a,b)=>a.updatedAt.localeCompare(b.updatedAt))) {
    if (day.localDate.slice(0,7) === month) latest.set(day.localDate, day);
  }
  const points = [...latest.values()].filter(day => day.status === 'completed' && day.scoreVersion === 3 && typeof day.totalScore === 'number' && Number.isFinite(day.totalScore)).sort((a,b)=>a.localDate.localeCompare(b.localDate)).map(day=>({date:day.localDate,value:day.totalScore!}));
  return {points, average:points.length ? Math.round(points.reduce((sum,p)=>sum+p.value,0)/points.length):null};
}

/** Completed v3 SCORE days in the seven calendar days ending on date. Missing and legacy days are excluded. */
export function weeklyScoreSummary(days: KodaDay[], date: string) {
  const dates = Array.from({ length: 7 }, (_, index) => plannerDateOffset(date, index - 6));
  const byDate = new Map<string, KodaDay>();
  for (const day of [...days].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt))) byDate.set(day.localDate, day);
  const completed = dates.flatMap(key => {
    const day = byDate.get(key);
    return day?.status === 'completed' && day.scoreVersion === 3 && typeof day.totalScore === 'number' && Number.isFinite(day.totalScore)
      ? [day.totalScore] : [];
  });
  return { average: completed.length ? Math.round(completed.reduce((sum, value) => sum + value, 0) / completed.length) : null, completedCount: completed.length };
}

/** Consecutive scheduled days where every due active habit is done. Rest days are skipped. */
export function aggregateHabitStreak(habits: Habit[], date: string) {
  let streak = 0;
  for (let offset = 0; offset < 3660; offset++) {
    const key = plannerDateOffset(date, -offset);
    const due = habits.filter(habit => {
      const metadata = habitMetadata(habit);
      if (habit.deletedAt || habit.archivedAt || (metadata.createdDate && key < metadata.createdDate)) return false;
      // Current inactivity must not erase dates before a recorded pause.
      if (!metadata.isActive && !Object.keys(normalizeHabitPauseEdits(habit.pauseEdits)).length) return false;
      return !habitPausedOn(habit, key) && (metadata.frequency === 'daily' || metadata.weekdays.includes(new Date(`${key}T12:00:00Z`).getUTCDay()));
    });
    if (!due.length) continue;
    if (offset === 0 && due.some(habit => !habitDoneOn(habit, key))) continue; // today's unfinished routine has not broken yesterday yet
    if (due.some(habit => !habitDoneOn(habit, key))) break;
    streak++;
  }
  return streak;
}

/** Calendar spacing preserves gaps between recorded days; missing days are not zero scores. */
export function monthlyScoreCoordinates(points: {date:string;value:number}[], _month:string) {
  const times = points.map(point => Date.parse(`${point.date}T12:00:00Z`));
  const first = Math.min(...times), last = Math.max(...times);
  return points.map((point,index) => ({
    x: first === last ? 80 : 2 + (times[index] - first) / (last - first) * 156,
    y: 10 + (100 - Math.max(0, Math.min(100, point.value))) * .63,
  }));
}
