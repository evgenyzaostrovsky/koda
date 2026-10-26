import { isRoutineDueToday, routineLogValue } from './goalLogic';
import type { Goal, GoalAction, GoalRoutine, KodaDayClassification, PlannerItem } from './types';
import { acceptDayPlan, calculatePlanScore, suggestDayPlan } from './dayPlan';
import { syncDayPlanProgress } from './dayPlanSync';

export const KODA_SCORE_VERSION = 3;
export const KODA_FAILED_TASK_PENALTY = 0;
export const KODA_SCORE_WEIGHTS = {
  goals: 75,
  planner: 25,
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
    failed: number;
    penalty: number;
    completed: number;
    total: number;
    completionRatio: number;
    score: number;
  };
  suggestions: CatchUpSuggestion[];
  scoreVersion: number;
};

const priorityWeights: Record<Goal['priority'], number> = {
  main: 3,
  important: 2,
  supporting: 1,
};

export function calculateKodaScore(goals: Goal[], plannerItems: PlannerItem[], date: string): KodaScoreResult {
  // Compatibility preview only. Actual day scores always use the accepted immutable plan.
  const proposal = suggestDayPlan(goals, plannerItems, date, { availableMinutes: 100000, maxItems: 1000, maxActionsPerGoal: 1000, maxRoutineMinutes: 100000 });
  const score = calculatePlanScore(syncDayPlanProgress(acceptDayPlan(proposal), goals, plannerItems));
  const goalBreakdowns = calculateGoalBreakdowns(goals, date);
  const planner = calculatePlannerScore(plannerItems, date);
  const goalScore = score.goalScore;
  const totalScore = score.totalScore;
  const classification = getKodaClassification(totalScore);
  const nextThreshold = getNextThreshold(totalScore);
  const pointsToNextThreshold = totalScore === null || nextThreshold === null ? null : Math.max(0, Math.ceil(nextThreshold - totalScore));

  return {
    goalScore,
    plannerScore: score.plannerScore,
    totalScore,
    classification,
    nextThreshold,
    pointsToNextThreshold,
    goals: goalBreakdowns,
    planner,
    suggestions: score.items.filter(item => item.completionRatio < 1).slice(0,3).map(item=>({id:item.sourceKey,goalId:item.goalId,label:item.title,points:Math.round(item.weight-item.points)})),
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
    .filter((action) => action.dueDate && action.dueDate <= date && (action.status !== 'completed' || action.dueDate === date))
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
  if (classification === 'sabotage') return 'ЕСТЬ СЛЕДУЮЩИЙ ШАГ';
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

function calculatePlannerScore(items: PlannerItem[], date: string) {
  const todayItems = items.filter((item) => item.date === date && !item.deletedAt);
  const total = todayItems.length;
  const completed = todayItems.filter((item) => item.done && !item.failed).length;
  const failed = todayItems.filter((item) => item.failed).length;
  const completionRatio = total ? completed / total : 0;
  return {
    failed,
    penalty: failed * KODA_FAILED_TASK_PENALTY,
    completed,
    total,
    completionRatio,
    score: clampScore(KODA_SCORE_WEIGHTS.planner * completionRatio),
  };
}

function clampRatio(value: number) {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}
