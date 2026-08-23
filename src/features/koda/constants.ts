import type { Goal, Habit, JournalEntry, JournalMood, JournalMoodName, PlannerItem, Task } from './types';
import { createHabit, todayDateKey } from './utils';

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
export const initialTasks: Task[] = [
  { id: 'task-1', title: 'Изучить JOIN в SQL', detail: '45 мин', done: false },
  { id: 'task-2', title: 'Тренировка', detail: '1 ч', done: true },
  { id: 'task-3', title: 'Прочитать 30 страниц', detail: '30 мин', done: false },
  { id: 'task-4', title: 'Английский', detail: '20 мин', done: false },
];
export const initialPlannerItems: PlannerItem[] = [];
export const initialGoals: Goal[] = [
  {
    id: 'goal-1',
    title: 'Стать Data Analyst',
    desiredResult: 'Получить оффер Data Analyst с доходом от 150 000 ₽',
    deadline: '2027-03-01',
    priority: 'main',
    status: 'active',
    createdAt: '2026-07-14T09:00:00.000Z',
    updatedAt: '2026-07-14T09:00:00.000Z',
    completedAt: null,
    archivedAt: null,
    milestones: [
      { id: 'milestone-1', title: 'Закончить Python', description: '', deadline: '', status: 'in_progress', position: 0, completedAt: null },
      { id: 'milestone-2', title: 'Закончить SQL', description: '', deadline: '', status: 'not_started', position: 1, completedAt: null },
      { id: 'milestone-3', title: 'Сделать 3 проекта', description: '', deadline: '', status: 'not_started', position: 2, completedAt: null },
    ],
    actions: [
      {
        id: 'goal-action-1',
        title: 'Закончить урок по Pandas',
        description: '',
        dueDate: todayDateKey(),
        estimatedMinutes: 45,
        importance: 'key',
        milestoneId: 'milestone-1',
        status: 'pending',
        position: 0,
        completedAt: null,
      },
      {
        id: 'goal-action-2',
        title: 'Сделать первый дашборд',
        description: '',
        dueDate: '',
        estimatedMinutes: 90,
        importance: 'normal',
        milestoneId: 'milestone-3',
        status: 'pending',
        position: 1,
        completedAt: null,
      },
    ],
    routines: [
      {
        id: 'goal-routine-1',
        title: 'Учёба',
        metricType: 'minutes',
        targetValue: 60,
        frequencyType: 'daily',
        weekdays: [],
        startDate: todayDateKey(),
        endDate: '',
        isActive: true,
      },
    ],
    routineLogs: [
      {
        id: 'goal-routine-log-1',
        routineId: 'goal-routine-1',
        date: todayDateKey(),
        value: 25,
        createdAt: '2026-07-14T09:00:00.000Z',
        updatedAt: '2026-07-14T09:00:00.000Z',
      },
    ],
  },
];
export const initialHabits: Habit[] = [
  createHabit('habit-1', 'Тренировка', '5 раз в неделю', [true, true, true, true, false, false, false], [1, 2, 3, 5, 8, 10, 13, 15, 17, 20, 23]),
  createHabit('habit-2', 'Чтение', '30 минут в день', [true, false, false, false, false, false, false], [1, 4, 6, 7, 11, 12, 16, 19, 22]),
  createHabit('habit-3', 'Медитация', '10 минут в день', [true, false, false, false, false, false, false], [2, 3, 9, 14, 18, 21]),
  createHabit('habit-4', 'Английский', '20 минут в день', [true, false, false, false, false, false, false], [1, 5, 6, 10, 15, 20]),
];
