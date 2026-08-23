import type {
  Goal,
  GoalAction,
  GoalMilestone,
  GoalMilestoneStatus,
  GoalPriority,
  GoalRoutine,
  GoalRoutineLog,
  GoalRoutineMetricType,
} from './types';
import { todayDateKey, uid } from './utils';

type LegacyGoal = { id?: string; title?: string; progress?: number; daysLeft?: number; archived?: boolean };

export type GoalDraft = {
  title: string;
  desiredResult: string;
  deadline: string;
  priority: GoalPriority;
};

export function createGoal(draft: GoalDraft, now = new Date().toISOString()): Goal {
  return {
    id: createStableGoalId(),
    title: draft.title.trim(),
    desiredResult: draft.desiredResult.trim(),
    deadline: draft.deadline,
    priority: draft.priority,
    status: 'active',
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    milestones: [],
    actions: [],
    routines: [],
    routineLogs: [],
  };
}

function createStableGoalId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }

  return uid('goal');
}

export function createMilestone(title: string, description = '', deadline = '', position = 0): GoalMilestone {
  return {
    id: uid('milestone'),
    title: title.trim(),
    description: description.trim(),
    deadline,
    status: 'not_started',
    position,
    completedAt: null,
  };
}

export function createGoalAction(input: {
  title: string;
  description?: string;
  dueDate?: string;
  estimatedMinutes?: number | null;
  importance?: 'normal' | 'key';
  milestoneId?: string | null;
  position?: number;
}): GoalAction {
  return {
    id: uid('goal-action'),
    title: input.title.trim(),
    description: input.description?.trim() ?? '',
    dueDate: input.dueDate ?? '',
    estimatedMinutes: input.estimatedMinutes ?? null,
    importance: input.importance ?? 'normal',
    milestoneId: input.milestoneId ?? null,
    status: 'pending',
    position: input.position ?? 0,
    completedAt: null,
  };
}

export function createGoalRoutine(input: {
  title: string;
  metricType: GoalRoutineMetricType;
  targetValue: number;
  frequencyType: GoalRoutine['frequencyType'];
  weekdays?: number[];
  startDate?: string;
  endDate?: string;
}): GoalRoutine {
  return {
    id: uid('goal-routine'),
    title: input.title.trim(),
    metricType: input.metricType,
    targetValue: Math.max(1, Math.round(input.targetValue || 1)),
    frequencyType: input.frequencyType,
    weekdays: input.weekdays ?? [],
    startDate: input.startDate || todayDateKey(),
    endDate: input.endDate ?? '',
    isActive: true,
  };
}

export function normalizeGoal(value: unknown): Goal | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<Goal> & LegacyGoal;
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (!title) return null;

  const now = new Date().toISOString();
  const deadline = typeof raw.deadline === 'string' ? raw.deadline : legacyDeadline(raw.daysLeft);

  return {
    id: typeof raw.id === 'string' ? raw.id : uid('goal'),
    title,
    desiredResult: typeof raw.desiredResult === 'string' ? raw.desiredResult : '',
    deadline,
    priority: isGoalPriority(raw.priority) ? raw.priority : 'important',
    status: isGoalStatus(raw.status) ? raw.status : raw.archived ? 'archived' : 'active',
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
    completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
    archivedAt: typeof raw.archivedAt === 'string' ? raw.archivedAt : raw.archived ? now : null,
    milestones: normalizeMilestones(raw.milestones),
    actions: normalizeActions(raw.actions),
    routines: normalizeRoutines(raw.routines),
    routineLogs: normalizeRoutineLogs(raw.routineLogs),
  };
}

export function calculateMilestoneProgress(milestone: GoalMilestone, actions: GoalAction[]) {
  const ownActions = actions.filter((action) => action.milestoneId === milestone.id);
  if (!ownActions.length) return milestone.status === 'completed' ? 100 : 0;
  return Math.round((ownActions.filter((action) => action.status === 'completed').length / ownActions.length) * 100);
}

export function calculateGoalProgress(goal: Goal) {
  const milestones = goal.milestones.filter((milestone) => milestone.status !== 'completed' || !goal.archivedAt);
  if (milestones.length) {
    return Math.round(milestones.reduce((sum, milestone) => sum + calculateMilestoneProgress(milestone, goal.actions), 0) / milestones.length);
  }

  if (goal.actions.length) {
    return Math.round((goal.actions.filter((action) => action.status === 'completed').length / goal.actions.length) * 100);
  }

  return goal.status === 'completed' ? 100 : 0;
}

export function isRoutineDueToday(routine: GoalRoutine, date = todayDateKey()) {
  if (!routine.isActive) return false;
  if (routine.startDate && routine.startDate > date) return false;
  if (routine.endDate && routine.endDate < date) return false;
  if (routine.frequencyType === 'daily') return true;
  if (routine.frequencyType === 'selected_weekdays') {
    const weekday = getIsoWeekday(date);
    return routine.weekdays.includes(weekday);
  }
  if (routine.frequencyType === 'weekly') return true;
  if (routine.frequencyType === 'monthly') return date.endsWith('-01') || routine.startDate.slice(-2) === date.slice(-2);
  return false;
}

export function routineLogValue(goal: Goal, routineId: string, date = todayDateKey()) {
  return goal.routineLogs.find((log) => log.routineId === routineId && log.date === date)?.value ?? 0;
}

export function upsertRoutineLog(logs: GoalRoutineLog[], routineId: string, date: string, value: number) {
  const now = new Date().toISOString();
  const existing = logs.find((log) => log.routineId === routineId && log.date === date);
  if (existing) {
    return logs.map((log) => (log.id === existing.id ? { ...log, value: Math.max(0, value), updatedAt: now } : log));
  }

  return [
    ...logs,
    {
      id: uid('goal-routine-log'),
      routineId,
      date,
      value: Math.max(0, value),
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function goalDeadlineLabel(deadline: string) {
  if (!deadline) return 'без срока';
  return formatDateLong(deadline);
}

export function formatDateLong(dateKey: string) {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function todayActionCandidates(goal: Goal, date = todayDateKey()) {
  const standaloneActions = goal.actions.filter((action) => !action.milestoneId);
  const overdue = standaloneActions
    .filter((action) => action.status !== 'completed' && action.dueDate && action.dueDate <= date)
    .sort(sortGoalActions);
  const next = standaloneActions
    .filter((action) => action.status !== 'completed' && !overdue.some((item) => item.id === action.id))
    .sort(sortGoalActions)
    .slice(0, Math.max(0, 2 - overdue.length));

  return {
    routines: goal.routines.filter((routine) => routine.frequencyType !== 'monthly' && isRoutineDueToday(routine, date)),
    actions: [...overdue, ...next].slice(0, 3),
  };
}

export function sortGoalActions(first: GoalAction, second: GoalAction) {
  if (first.status !== second.status) return first.status === 'completed' ? 1 : -1;
  if (first.dueDate !== second.dueDate) return (first.dueDate || '9999-99-99').localeCompare(second.dueDate || '9999-99-99');
  return first.position - second.position;
}

export function nextGoalPriorityGoals(goals: Goal[], nextGoal: Goal) {
  if (nextGoal.priority !== 'main' || nextGoal.status !== 'active') return goals;
  return goals.map((goal) => (goal.id !== nextGoal.id && goal.priority === 'main' && goal.status === 'active' ? { ...goal, priority: 'important' as const } : goal));
}

function normalizeMilestones(value: unknown): GoalMilestone[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<GoalMilestone>;
      if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
      return {
        id: typeof raw.id === 'string' ? raw.id : uid('milestone'),
        title: raw.title.trim(),
        description: typeof raw.description === 'string' ? raw.description : '',
        deadline: typeof raw.deadline === 'string' ? raw.deadline : '',
        status: isMilestoneStatus(raw.status) ? raw.status : 'not_started',
        position: typeof raw.position === 'number' ? raw.position : index,
        completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
      };
    })
    .filter((item): item is GoalMilestone => Boolean(item));
}

function normalizeActions(value: unknown): GoalAction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<GoalAction>;
      if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
      return {
        id: typeof raw.id === 'string' ? raw.id : uid('goal-action'),
        title: raw.title.trim(),
        description: typeof raw.description === 'string' ? raw.description : '',
        dueDate: typeof raw.dueDate === 'string' ? raw.dueDate : '',
        estimatedMinutes: typeof raw.estimatedMinutes === 'number' ? raw.estimatedMinutes : null,
        importance: raw.importance === 'key' ? 'key' : 'normal',
        milestoneId: typeof raw.milestoneId === 'string' ? raw.milestoneId : null,
        status: raw.status === 'completed' ? 'completed' : 'pending',
        position: typeof raw.position === 'number' ? raw.position : index,
        completedAt: typeof raw.completedAt === 'string' ? raw.completedAt : null,
      };
    })
    .filter((item): item is GoalAction => Boolean(item));
}

function normalizeRoutines(value: unknown): GoalRoutine[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<GoalRoutine>;
      if (typeof raw.title !== 'string' || !raw.title.trim()) return null;
      return {
        id: typeof raw.id === 'string' ? raw.id : uid('goal-routine'),
        title: raw.title.trim(),
        metricType: isMetricType(raw.metricType) ? raw.metricType : 'boolean',
        targetValue: typeof raw.targetValue === 'number' && raw.targetValue > 0 ? raw.targetValue : 1,
        frequencyType: isFrequencyType(raw.frequencyType) ? raw.frequencyType : 'daily',
        weekdays: Array.isArray(raw.weekdays) ? raw.weekdays.filter((day) => typeof day === 'number' && day >= 1 && day <= 7) : [],
        startDate: typeof raw.startDate === 'string' ? raw.startDate : todayDateKey(),
        endDate: typeof raw.endDate === 'string' ? raw.endDate : '',
        isActive: raw.isActive !== false,
      };
    })
    .filter((item): item is GoalRoutine => Boolean(item));
}

function normalizeRoutineLogs(value: unknown): GoalRoutineLog[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const raw = item as Partial<GoalRoutineLog>;
      if (typeof raw.routineId !== 'string' || typeof raw.date !== 'string') return null;
      const now = new Date().toISOString();
      return {
        id: typeof raw.id === 'string' ? raw.id : uid('goal-routine-log'),
        routineId: raw.routineId,
        date: raw.date,
        value: typeof raw.value === 'number' ? raw.value : 0,
        createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now,
      };
    })
    .filter((item): item is GoalRoutineLog => Boolean(item));
}

function legacyDeadline(daysLeft: unknown) {
  if (typeof daysLeft !== 'number') return '';
  const date = new Date();
  date.setDate(date.getDate() + Math.max(0, Math.round(daysLeft)));
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getIsoWeekday(dateKey: string) {
  const day = new Date(`${dateKey}T00:00:00`).getDay();
  return day === 0 ? 7 : day;
}

function isGoalStatus(value: unknown): value is Goal['status'] {
  return value === 'active' || value === 'paused' || value === 'completed' || value === 'archived';
}

function isGoalPriority(value: unknown): value is GoalPriority {
  return value === 'main' || value === 'important' || value === 'supporting';
}

function isMilestoneStatus(value: unknown): value is GoalMilestoneStatus {
  return value === 'not_started' || value === 'in_progress' || value === 'completed';
}

function isMetricType(value: unknown): value is GoalRoutineMetricType {
  return value === 'boolean' || value === 'minutes' || value === 'count';
}

function isFrequencyType(value: unknown): value is GoalRoutine['frequencyType'] {
  return value === 'daily' || value === 'weekly' || value === 'monthly' || value === 'selected_weekdays';
}
