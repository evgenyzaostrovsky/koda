import type { Goal } from './types';

export function visibleGoals(goals: Goal[]): Goal[] {
  return goals.filter(goal => !goal.deletedAt);
}

export function markGoalDeleted(goal: Goal, at: string): Goal {
  if (goal.deletedAt) return goal;
  if (!Number.isFinite(Date.parse(at))) throw new Error('Goal deletion requires a valid timestamp');
  return { ...goal, deletedAt: at, updatedAt: at, status: 'archived', archivedAt: at };
}

/** Deleted IDs are never reused. A later stale edit cannot undo a deletion. */
export function mergeGoalTombstone(first: Goal, second: Goal): Goal | undefined {
  if (!first.deletedAt) return second.deletedAt ? second : undefined;
  if (!second.deletedAt) return first;
  const order = first.deletedAt.localeCompare(second.deletedAt) || first.updatedAt.localeCompare(second.updatedAt);
  if (order) return order > 0 ? first : second;
  const stable = (value: Goal) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
  return stable(first) >= stable(second) ? first : second;
}

/** Retain tombstones even when a UI updater supplies only the visible list. */
export function recordGoalListChanges(previous: Goal[], next: Goal[], at: string): Goal[] {
  const byId = new Map(previous.filter(goal => goal.deletedAt).map(goal => [goal.id, goal]));
  const nextIds = new Set(next.map(goal => goal.id));
  for (const goal of previous) if (!nextIds.has(goal.id)) byId.set(goal.id, markGoalDeleted(goal, at));
  for (const goal of next) {
    const existing = byId.get(goal.id);
    byId.set(goal.id, existing ? mergeGoalTombstone(existing, goal) ?? goal : goal);
  }
  return [...byId.values()];
}

/** Completed auto-plan projections can outlive a missing goal; hide deleted IDs explicitly. */
export function withoutDeletedGoalItems<T extends { goalId?: string | null }>(items: T[], goals: Goal[]): T[] {
  const deleted = new Set(goals.filter(goal => goal.deletedAt).map(goal => goal.id));
  return items.filter(item => !item.goalId || !deleted.has(item.goalId));
}
