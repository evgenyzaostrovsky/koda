import type { Goal, PlannerItem } from './types';
import { upsertRoutineLog } from './goalLogic';
import { goalPlannerItemsInRange, isPlannerDate, plannerDateOffset, plannerWorkKey } from './plannerOverview';

export type PlannerCalendarMode = 'day' | 'week' | 'month' | 'year';

/** Civil dates mirror the calendar's Monday-first, 42-cell month grid. */
export function plannerCalendarRange(mode: PlannerCalendarMode, selectedDate: string) {
  if (!isPlannerDate(selectedDate)) throw new Error('Invalid calendar date');
  const monday = (date: string) => plannerDateOffset(date, -((new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7));
  if (mode === 'day') return { from: selectedDate, to: selectedDate };
  if (mode === 'week') { const from = monday(selectedDate); return { from, to: plannerDateOffset(from, 6) }; }
  if (mode === 'month') { const from = monday(`${selectedDate.slice(0, 7)}-01`); return { from, to: plannerDateOffset(from, 41) }; }
  return { from: `${selectedDate.slice(0, 4)}-01-01`, to: `${selectedDate.slice(0, 4)}-12-31` };
}

export function isGoalRoutinePlannerItem(item: PlannerItem) {
  return item.sourceType === 'goal' && Boolean(item.goalId && item.sourceId) && !item.goalActionId && item.id.startsWith('goal-routine:');
}

/** Keep persisted/manual/autoplan identities, adding missing goal projections only. */
export function plannerCalendarItems(items: PlannerItem[], goals: Goal[], selectedDate: string, mode: PlannerCalendarMode, ownerId?: string | null) {
  const { from, to } = plannerCalendarRange(mode, selectedDate);
  const existing = new Map<string, PlannerItem>();
  for (const item of items) {
    const key = plannerWorkKey(item), previous = existing.get(key);
    if (!previous || (!previous.deletedAt && (item.deletedAt || (item.updatedAt ?? '') > (previous.updatedAt ?? '')))) existing.set(key, item);
  }
  for (const item of goalPlannerItemsInRange(goals, from, to, ownerId)) {
    const key = plannerWorkKey(item);
    // An explicit/autoplan assignment supersedes the original action due date.
    // Routine occurrence keys include their date, so different days stay distinct.
    if (!existing.has(key)) existing.set(key, item);
  }
  return [...existing.values()].filter(item => !item.deletedAt && isPlannerDate(item.date) && item.date >= from && item.date <= to);
}

export function toggleGoalCalendarItem(goals: Goal[], item: PlannerItem, ownerId: string | null, at: string): Goal[] {
  if (item.sourceType !== 'goal' || (item.ownerId ?? null) !== ownerId || !isPlannerDate(item.date)) return goals;
  return goals.map(goal => {
    if (goal.id !== item.goalId || goal.deletedAt) return goal;
    if (isGoalRoutinePlannerItem(item)) {
      const routine = goal.routines.find(r => r.id === item.sourceId && r.isActive);
      return routine ? {...goal,updatedAt:at,routineLogs:upsertRoutineLog(goal.routineLogs,routine.id,item.date,item.done?0:routine.targetValue)} : goal;
    }
    return {...goal,updatedAt:at,actions:goal.actions.map(action=>action.id===item.goalActionId?{...action,status:item.done?'pending':'completed',completedAt:item.done?null:at}:action)};
  });
}
export function moveGoalCalendarAction(goals: Goal[], item: PlannerItem, date: string, ownerId: string | null, at: string): Goal[] {
  if (item.sourceType!=='goal'||!item.id.startsWith('goal-action:')||(item.ownerId??null)!==ownerId||!isPlannerDate(date)) return goals;
  return goals.map(goal=>goal.id===item.goalId&&!goal.deletedAt?{...goal,updatedAt:at,actions:goal.actions.map(action=>action.id===item.goalActionId?{...action,dueDate:date,deferredUntil:undefined}:action)}:goal);
}
