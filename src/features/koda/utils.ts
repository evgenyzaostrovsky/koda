import type { Habit } from './types';

const defaultHabitMonth = 6;
const defaultHabitYear = 2026;

export function uid(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.round(Math.random() * 10000)}`;
}

export function monthKey(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

export function getDaysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function buildMonthDays(doneDayNumbers: number[] = [], year = defaultHabitYear, monthIndex = defaultHabitMonth) {
  const dayCount = getDaysInMonth(year, monthIndex);
  return Array.from({ length: dayCount }, (_, index) => doneDayNumbers.includes(index + 1));
}

export function resizeMonthDays(days: boolean[] | undefined, year: number, monthIndex: number) {
  const dayCount = getDaysInMonth(year, monthIndex);
  return Array.from({ length: dayCount }, (_, index) => Boolean(days?.[index]));
}

export function getHabitMonthDays(habit: Habit, year: number, monthIndex: number) {
  const key = monthKey(year, monthIndex);
  const fallback = year === defaultHabitYear && monthIndex === defaultHabitMonth ? habit.monthDays : undefined;
  return resizeMonthDays(habit.monthHistory[key] ?? fallback, year, monthIndex);
}

export function getCurrentWeekDates(date = new Date()) {
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index));
}

export function getCurrentWeekHabitDays(habit: Habit, date = new Date()) {
  return getCurrentWeekDates(date).map((weekDate) => {
    const monthDays = getHabitMonthDays(habit, weekDate.getFullYear(), weekDate.getMonth());
    return Boolean(monthDays[weekDate.getDate() - 1]);
  });
}

export function createHabit(id: string, title: string, target: string, doneDays: boolean[], doneDayNumbers: number[]): Habit {
  const monthDays = buildMonthDays(doneDayNumbers);

  return {
    id,
    title,
    target,
    doneDays,
    monthDays,
    monthHistory: { [monthKey(defaultHabitYear, defaultHabitMonth)]: monthDays },
  };
}

export function todayDateKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function normalizeTimeValue(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function displayTimeValue(value: string | null) {
  return value ? value.slice(0, 5) : '';
}

export function sleepDurationMinutes(sleepStart: string, wakeTime: string) {
  const normalizedStart = normalizeTimeValue(sleepStart);
  const normalizedWake = normalizeTimeValue(wakeTime);
  if (!normalizedStart || !normalizedWake) return null;

  const [startHours, startMinutes] = normalizedStart.split(':').map(Number);
  const [wakeHours, wakeMinutes] = normalizedWake.split(':').map(Number);
  const startTotal = startHours * 60 + startMinutes;
  const wakeTotal = wakeHours * 60 + wakeMinutes;

  return wakeTotal > startTotal ? wakeTotal - startTotal : wakeTotal + 24 * 60 - startTotal;
}

