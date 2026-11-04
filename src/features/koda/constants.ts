import type { Goal, Habit, JournalEntry, JournalMood, JournalMoodName, PlannerItem, Task } from './types';

export const dayTagOptions = ['Друзья', 'Семья', 'Работа', 'Досуг', 'Здоровье', 'Учеба', 'Дом', 'Отдых'];
export const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const defaultHabitMonth = 6;
export const defaultHabitYear = 2026;
export const journalOwnerKey = 'default';
export const defaultJournalEntry: JournalEntry = {
  id: 'journal-1',
  title: 'Мысли дня',
  text: '',
  sleepStart: '23:30',
  wakeTime: '07:20',
  tags: [],
  mood: 4,
  createdAt: '',
};
export const journalMoodByValue: Record<JournalMood, JournalMoodName> = {
  1: 'bad',
  2: 'low',
  3: 'neutral',
  4: 'good',
  5: 'great',
};
export const journalMoodByName: Record<JournalMoodName, JournalMood> = {
  bad: 1,
  low: 2,
  neutral: 3,
  good: 4,
  great: 5,
};
// New workspaces start empty. Examples must never become persisted account data.
export const initialTasks: Task[] = [];
export const initialPlannerItems: PlannerItem[] = [];
export const initialGoals: Goal[] = [];
export const initialHabits: Habit[] = [];
