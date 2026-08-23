import { isRoutineDueToday, routineLogValue } from './goalLogic';
import type { Goal, GoalAction, GoalRoutine, KodaDayClassification, PlannerItem } from './types';

export const KODA_SCORE_VERSION = 1;
export const KODA_SCORE_WEIGHTS = {
  goals: 90,
  planner: 10,
  regularity: 0,
} as const;

export type GoalDayEntry =
  | {
      goal: Goal;
      kind: 'routine';
      routine: GoalRoutine;
      completionRatio: number;
      currentValue: number;
      targetValue: number;
    }
  | {
      action: GoalAction;
      goal: Goal;
      kind: 'action';
      completionRatio: number;
      currentValue: number;
      targetValue: number;
    };

export type GoalScoreBreakdown = {
  goalId: string;
  title: string;
  priority: Goal['priority'];
  priorityWeight: number;
  completionRatio: number;
  weightedPoints: number;
  actions: Array<{
    id: string;
    title: string;
    kind: GoalDayEntry['kind'];
    completionRatio: number;
    currentValue: number;
    targetValue: number;
  }>;
};

export type CatchUpSuggestion = {
  id: string;
  goalId?: string;
  label: string;
  points: number;
};

export type KodaScoreResult = {
  goalScore: number | null;
  plannerScore: number;
  totalScore: number | null;
  classification: KodaDayClassification;
  nextThreshold: number | null;
  pointsToNextThreshold: number | null;
  goals: GoalScoreBreakdown[];
  planner: {
    completed: number;
    total: number;
    completionRatio: number;
    score: number;
  };
  suggestions: CatchUpSuggestion[];
  scoreVersion: number;
};

const priorityWeights: Record<Goal['priority'], number> = {
  main: 6,
  important: 2,
  supporting: 1,
};

export function calculateKodaScore(goals: Goal[], plannerItems: PlannerItem[], date: string): KodaScoreResult {
  const goalBreakdowns = calculateGoalBreakdowns(goals, date);
  const planner = calculatePlannerScore(plannerItems, date);
  const goalScore = goalBreakdowns.length ? calculateGoalScore(goalBreakdowns) : null;
  const totalScore = goalScore === null ? null : clampScore(goalScore + planner.score);
  const classification = getKodaClassification(totalScore);
  const nextThreshold = getNextThreshold(totalScore);
  const pointsToNextThreshold = totalScore === null || nextThreshold === null ? null : Math.max(0, Math.ceil(nextThreshold - totalScore));

  return {
    goalScore,
    plannerScore: planner.score,
    totalScore,
    classification,
    nextThreshold,
    pointsToNextThreshold,
    goals: goalBreakdowns,
    planner,
    suggestions: buildCatchUpSuggestions(goalBreakdowns, planner, totalScore),
    scoreVersion: KODA_SCORE_VERSION,
  };
}

export function getGoalDayEntries(goal: Goal, date: string): GoalDayEntry[] {
  if (goal.status !== 'active') return [];

  const routines: GoalDayEntry[] = goal.routines
    .filter((routine) => isRoutineDueToday(routine, date))
    .map((routine) => {
      const currentValue = routineLogValue(goal, routine.id, date);
      const targetValue = Math.max(1, routine.targetValue);
      return {
        goal,
        kind: 'routine' as const,
        routine,
        completionRatio: clampRatio(currentValue / targetValue),
        currentValue,
        targetValue,
      };
    });

  const actions: GoalDayEntry[] = goal.actions
    .filter((action) => action.dueDate && action.dueDate <= date)
    .map((action) => ({
      action,
      goal,
      kind: 'action' as const,
      completionRatio: action.status === 'completed' ? 1 : 0,
      currentValue: action.status === 'completed' ? 1 : 0,
      targetValue: 1,
    }));

  return [...routines, ...actions];
}

export function getKodaClassification(totalScore: number | null): KodaDayClassification {
  if (totalScore === null) return 'unclassified';
  if (totalScore >= 90) return 'strike';
  if (totalScore >= 75) return 'pace';
  if (totalScore >= 50) return 'minimum';
  return 'sabotage';
}

export function getNextThreshold(totalScore: number | null) {
  if (totalScore === null) return null;
  if (totalScore < 50) return 50;
  if (totalScore < 75) return 75;
  if (totalScore < 90) return 90;
  return null;
}

export function classificationLabel(classification: KodaDayClassification) {
  if (classification === 'strike') return 'УДАР';
  if (classification === 'pace') return 'ТЕМП';
  if (classification === 'minimum') return 'МИНИМУМ';
  if (classification === 'sabotage') return 'САБОТАЖ';
  return 'БЕЗ ОЦЕНКИ';
}

function calculateGoalBreakdowns(goals: Goal[], date: string): GoalScoreBreakdown[] {
  return goals
    .filter((goal) => goal.status === 'active')
    .map((goal) => {
      const entries = getGoalDayEntries(goal, date);
      if (!entries.length) return null;

      const completionRatio = entries.reduce((sum, entry) => sum + entry.completionRatio, 0) / entries.length;
      const priorityWeight = priorityWeights[goal.priority];
      return {
        goalId: goal.id,
        title: goal.title,
        priority: goal.priority,
        priorityWeight,
        completionRatio,
        weightedPoints: completionRatio * priorityWeight,
        actions: entries.map((entry) => ({
          id: entry.kind === 'routine' ? entry.routine.id : entry.action.id,
          title: entry.kind === 'routine' ? entry.routine.title : entry.action.title,
          kind: entry.kind,
          completionRatio: entry.completionRatio,
          currentValue: entry.currentValue,
          targetValue: entry.targetValue,
        })),
      };
    })
    .filter((item): item is GoalScoreBreakdown => Boolean(item));
}

function calculateGoalScore(goalBreakdowns: GoalScoreBreakdown[]) {
  const weightSum = goalBreakdowns.reduce((sum, goal) => sum + goal.priorityWeight, 0);
  if (!weightSum) return null;
  return clampScore(KODA_SCORE_WEIGHTS.goals * goalBreakdowns.reduce((sum, goal) => sum + goal.weightedPoints, 0) / weightSum);
}

function calculatePlannerScore(items: PlannerItem[], date: string) {
  const todayItems = items.filter((item) => item.date === date);
  const total = todayItems.length;
  const completed = todayItems.filter((item) => item.done).length;
  const completionRatio = total ? completed / total : 1;
  return {
    completed,
    total,
    completionRatio,
    score: clampScore(KODA_SCORE_WEIGHTS.planner * completionRatio),
  };
}

function buildCatchUpSuggestions(goalBreakdowns: GoalScoreBreakdown[], planner: KodaScoreResult['planner'], totalScore: number | null): CatchUpSuggestion[] {
  if (totalScore === null) return [];
  const weightSum = goalBreakdowns.reduce((sum, goal) => sum + goal.priorityWeight, 0) || 1;
  const suggestions = goalBreakdowns
    .flatMap((goal) =>
      goal.actions
        .filter((action) => action.completionRatio < 1)
        .map((action) => {
          const remainingRatio = 1 - action.completionRatio;
          const points = KODA_SCORE_WEIGHTS.goals * goal.priorityWeight / weightSum / goal.actions.length * remainingRatio;
          const remainingValue = Math.ceil(action.targetValue - action.currentValue);
          return {
            id: `${goal.goalId}:${action.id}`,
            goalId: goal.goalId,
            label: action.targetValue > 1 ? `Ещё ${remainingValue} к "${action.title}"` : `Завершить "${action.title}"`,
            points: Math.round(points),
          };
        }),
    )
    .sort((first, second) => second.points - first.points);

  if (planner.total && planner.completed < planner.total && planner.score < 9) {
    suggestions.push({
      id: 'planner',
      goalId: '',
      label: `Закрыть ${planner.total - planner.completed} текущих дел`,
      points: Math.round(KODA_SCORE_WEIGHTS.planner - planner.score),
    });
  }

  return suggestions.slice(0, 3);
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}
