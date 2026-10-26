import type { GoalRoutine } from './types';

/** One civil-calendar schedule for plans, recommendations and score breakdowns. */
export function isRoutineScheduled(routine: GoalRoutine, date: string): boolean {
  const day = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return false;
  if (!routine.isActive || (routine.startDate && date < routine.startDate) || (routine.endDate && date > routine.endDate)) return false;
  const weekday = day.getUTCDay() || 7;
  if (routine.frequencyType === 'daily') return true;
  if (routine.frequencyType === 'selected_weekdays') return routine.weekdays.includes(weekday);
  if (routine.frequencyType === 'weekly') {
    const start = new Date(`${routine.startDate}T12:00:00Z`);
    return weekday === (routine.weekdays[0] ?? (Number.isFinite(start.getTime()) ? start.getUTCDay() || 7 : 1));
  }
  if (routine.frequencyType !== 'monthly') return false;
  const monthEnd = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth() + 1, 0)).getUTCDate();
  return day.getUTCDate() === Math.min(Number(routine.startDate.slice(-2)) || 1, monthEnd);
}
