import { isPlannerDate } from './plannerOverview';
import type { PlannerItem } from './types';

/** Move ordinary unfinished all-day tasks, never copies of another source's work. */
export function rolloverUntimedPlannerItems(items: PlannerItem[], today: string, updatedAt: string): PlannerItem[] {
  if (!isPlannerDate(today)) return items;
  let changed = false;
  const next = items.map(item => {
    if (item.done || item.failed || item.deletedAt || (item.time ?? '').trim() ||
      (item.sourceType && item.sourceType !== 'planner') || item.goalId ||
      !isPlannerDate(item.date) || item.date >= today) return item;
    changed = true;
    return { ...item, date: today, updatedAt };
  });
  return changed ? next : items;
}
