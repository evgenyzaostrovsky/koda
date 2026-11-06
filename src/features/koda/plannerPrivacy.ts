import { mergePlannerItems } from './persistence';
import type { PlannerItem } from './types';

export function plannerOwnerKey(userId: string) {
  if (!userId) throw new Error('Planner cloud sync requires an account');
  return `user:${userId}`;
}

/** A failed read preserves local data; a successful empty snapshot is authoritative. */
export function resolvePlannerPull(
  local: PlannerItem[] | null,
  remote: PlannerItem[] | null,
  pending: boolean,
  deletedIds: string[],
) {
  const items = remote === null ? local ?? []
    : pending && local ? mergePlannerItems(remote, local) : remote;
  return items.filter(item => !deletedIds.includes(item.id));
}

/** Never mirror account data into a legacy calendar/guest namespace. */
export function plannerRowsForAccount(userId: string, items: PlannerItem[]) {
  const owner = plannerOwnerKey(userId);
  return items.map(item => ({
    id: item.id,
    owner_key: owner,
    event_date: item.date,
    event_time: item.time || null,
    title: item.title,
    done: item.done,
    failed: Boolean(item.failed),
    subtasks: item.subtasks ?? [],
    updated_at: item.updatedAt ?? new Date().toISOString(),
  }));
}
