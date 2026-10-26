import type { Goal, GoalAction, GoalMilestone } from '../types';
import { calculateMilestoneProgress, sortGoalActions } from '../goalLogic';
import { todayDateKey } from '../utils';

/** Read-only display selection; does not schedule or change saved actions. */
export function nextAvailableGoalAction(goal: Goal, date = todayDateKey()) {
  return availableGoalActions(goal, date)[0];
}

function availableGoalActions(goal: Goal, date: string): GoalAction[] {
  if (goal.archivedAt || goal.status !== 'active') return [];
  return goal.actions.filter(action => action.status !== 'completed' && !action.archivedAt &&
    (!action.deferredUntil || action.deferredUntil <= date) &&
    (!(goal.openWindow?.directions.some(direction => direction.actionIds.includes(action.id))) ||
      goal.openWindow.directions.some(direction => !direction.archivedAt && direction.actionIds.includes(action.id))) &&
    (action.dependsOn ?? []).every(id => goal.actions.some(dependency => dependency.id === id && dependency.status === 'completed')))
    .sort((a, b) => sortGoalActions(a, b) || compareId(a.id, b.id));
}

/** A completed stage cannot remain the current stage just because its old status was in_progress. */
export function currentGoalMilestone(goal: Goal) {
  const stages=orderedMilestones(goal);
  return stages.find(stage=>stage.status==='in_progress'&&calculateMilestoneProgress(stage,goal.actions)<100)
    ?? stages.find(stage=>calculateMilestoneProgress(stage,goal.actions)<100);
}

const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
function orderedMilestones(goal: Goal) {
  return [...goal.milestones].sort((a, b) => a.position - b.position || compareId(a.id, b.id))
    .filter((stage, index, stages) => stages.findIndex(item => item.id === stage.id) === index);
}

/** Stay inside the current stage. An empty or blocked stage needs an explicit next
 * action rather than a silent jump to later work. Goals without stages use their backlog. */
export function nextRoadmapAction(goal: Goal, date = todayDateKey()): {
  action: GoalAction | undefined; current: GoalMilestone | undefined; fromOtherStage: boolean;
} {
  const current = currentGoalMilestone(goal);
  const actions = availableGoalActions(goal, date);
  const action = current ? actions.find(item => item.milestoneId === current.id) : actions[0];
  return { action, current, fromOtherStage: Boolean(action && current && action.milestoneId !== current.id) };
}

/** Bounded display window in route order: latest completed stage, current stage, then
 * upcoming stages. Counts describe the omitted stages; this never invents route nodes. */
export function compactGoalMilestones(goal: Goal, limit = 5): {
  milestones: GoalMilestone[]; hiddenCount: number; completedCount: number; totalCount: number;
} {
  const stages = orderedMilestones(goal);
  const cap = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 5;
  const current = currentGoalMilestone(goal);
  const completed = stages.filter(stage => calculateMilestoneProgress(stage, goal.actions) === 100);
  const selected = new Set<string>();
  const add = (stage?: GoalMilestone) => { if (stage && selected.size < cap) selected.add(stage.id); };
  add(current);
  add(completed.at(-1));
  const currentIndex = current ? stages.findIndex(stage => stage.id === current.id) : -1;
  stages.slice(currentIndex + 1).forEach(add);
  [...stages].reverse().forEach(add);
  const milestones = stages.filter(stage => selected.has(stage.id));
  return { milestones, hiddenCount: stages.length - milestones.length, completedCount: completed.length, totalCount: stages.length };
}
