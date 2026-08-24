import type { KodaDay } from './types';
import type { Goal, PlannerItem } from './types';
import { mergeKodaDays } from './persistence';
import { calculateKodaScore, KODA_SCORE_WEIGHTS } from './kodaScore';

type KodaDayRow = Record<string, unknown>;

export function mergeKodaDaySources(remoteDays: KodaDay[], localDays: KodaDay[]) {
  return mergeKodaDays(remoteDays, localDays);
}

export function autoFinalizeExpiredKodaDays(days: KodaDay[], goals: Goal[], plannerItems: PlannerItem[], now = new Date()) {
  let changed = false;
  const nextDays = days.map((day) => {
    if (day.status !== 'active' || now.getTime() < getKodaDayAutoCloseAt(day.localDate).getTime()) return day;
    changed = true;
    return finalizeKodaDay(day, goals, plannerItems, getKodaDayAutoCloseAt(day.localDate).toISOString());
  });
  return changed ? nextDays : days;
}

export function finalizeKodaDay(day: KodaDay, goals: Goal[], plannerItems: PlannerItem[], finishedAt = new Date().toISOString()) {
  const result = calculateKodaScore(goals, plannerItems, day.localDate);
  const weakest = [...result.goals].sort((a, b) => a.completionRatio - b.completionRatio)[0];
  const summary = result.totalScore === null
    ? 'Недостаточно данных для KODA Score, но день сохранён.'
    : result.totalScore >= 75
      ? 'День заметно приблизил тебя к выбранной версии себя.'
      : result.totalScore >= 50
        ? 'Движение было, но главный фокус можно усилить.'
        : 'День был загруженным, но движение по целям оказалось слабым.';
  const focusLoss = !weakest
    ? 'Действий целей на день не было.'
    : weakest.completionRatio >= 1
      ? 'Потерь фокуса по целям не видно.'
      : `Меньше всего закрыта цель: ${weakest.title}.`;
  const nextRecommendation = result.suggestions[0]?.label
    ? `Завтра начни с: ${result.suggestions[0].label}.`
    : 'Завтра начни с главной цели.';

  return {
    ...day,
    status: 'completed',
    finishedAt,
    goalScore: result.goalScore,
    plannerScore: result.plannerScore,
    totalScore: result.totalScore,
    classification: result.classification,
    scoreVersion: result.scoreVersion,
    summary,
    focusLoss,
    nextRecommendation,
    goalsSnapshot: result.goals,
    plannerSnapshot: plannerItems.filter((item) => item.date === day.localDate),
    calculationSnapshot: { ...result, weights: KODA_SCORE_WEIGHTS },
    updatedAt: finishedAt,
  } satisfies KodaDay;
}

export function getKodaDayAutoCloseAt(localDate: string) {
  const [year, month, day] = localDate.split('-').map(Number);
  return new Date(year, month - 1, day + 1, 3, 0, 0, 0);
}

export function kodaDayId(userId: string, localDate: string) {
  const input = `${userId}:${localDate}`;
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    first = Math.imul(first ^ input.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ input.charCodeAt(index), 0x85ebca6b);
  }
  const chunk = (value: number) => (value >>> 0).toString(16).padStart(8, '0');
  const hex = `${chunk(first)}${chunk(second)}${chunk(first ^ second)}${chunk(Math.imul(first, second))}`;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function toKodaDayRow(day: KodaDay, userId: string) {
  return {
    id: kodaDayId(userId, day.localDate),
    user_id: userId,
    local_date: day.localDate,
    timezone: day.timezone,
    status: day.status,
    started_at: day.startedAt,
    finished_at: day.finishedAt,
    goal_score: day.goalScore,
    planner_score: day.plannerScore,
    total_score: day.totalScore,
    classification: day.classification,
    score_version: day.scoreVersion,
    summary: day.summary,
    focus_loss: day.focusLoss,
    next_recommendation: day.nextRecommendation,
    goals_snapshot: day.goalsSnapshot,
    planner_snapshot: day.plannerSnapshot,
    calculation_snapshot: day.calculationSnapshot,
    created_at: day.createdAt,
    updated_at: day.updatedAt,
  };
}

export function fromKodaDayRow(value: KodaDayRow): KodaDay | null {
  if (typeof value.id !== 'string' || typeof value.local_date !== 'string' || typeof value.status !== 'string') return null;
  if (value.status !== 'not_started' && value.status !== 'active' && value.status !== 'completed') return null;
  return {
    id: value.id,
    localDate: value.local_date,
    timezone: typeof value.timezone === 'string' ? value.timezone : 'local',
    status: value.status,
    startedAt: typeof value.started_at === 'string' ? value.started_at : null,
    finishedAt: typeof value.finished_at === 'string' ? value.finished_at : null,
    goalScore: typeof value.goal_score === 'number' ? value.goal_score : null,
    plannerScore: typeof value.planner_score === 'number' ? value.planner_score : 0,
    totalScore: typeof value.total_score === 'number' ? value.total_score : null,
    classification: value.classification === 'strike' || value.classification === 'pace' || value.classification === 'minimum' || value.classification === 'sabotage' ? value.classification : 'unclassified',
    scoreVersion: typeof value.score_version === 'number' ? value.score_version : 1,
    summary: typeof value.summary === 'string' ? value.summary : '',
    focusLoss: typeof value.focus_loss === 'string' ? value.focus_loss : '',
    nextRecommendation: typeof value.next_recommendation === 'string' ? value.next_recommendation : '',
    goalsSnapshot: value.goals_snapshot ?? [],
    plannerSnapshot: value.planner_snapshot ?? [],
    calculationSnapshot: value.calculation_snapshot ?? null,
    createdAt: typeof value.created_at === 'string' ? value.created_at : new Date().toISOString(),
    updatedAt: typeof value.updated_at === 'string' ? value.updated_at : new Date().toISOString(),
  };
}
