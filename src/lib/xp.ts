import type { QuestDifficulty, XPLevelState } from '../types/domain';

export const QUEST_XP_BY_DIFFICULTY: Record<QuestDifficulty, number> = {
  micro: 30,
  easy: 50,
  medium: 80,
  hard: 120,
  keystone: 150,
};

export function getQuestXpReward(difficulty: QuestDifficulty, explicitReward?: number) {
  return explicitReward ?? QUEST_XP_BY_DIFFICULTY[difficulty];
}

export function getFutureSelfXpRequired(level: number) {
  return level * 250;
}

export function getAttributeXpRequired(level: number) {
  return level * 150;
}

export function applyXp(params: {
  level: number;
  currentXp: number;
  totalXp: number;
  amount: number;
  getRequiredXp: (level: number) => number;
}): XPLevelState & { leveledUp: boolean } {
  let level = params.level;
  let currentXp = params.currentXp + params.amount;
  const totalXp = params.totalXp + params.amount;
  let leveledUp = false;

  while (currentXp >= params.getRequiredXp(level)) {
    currentXp -= params.getRequiredXp(level);
    level += 1;
    leveledUp = true;
  }

  return {
    level,
    currentXp,
    totalXp,
    xpToNextLevel: params.getRequiredXp(level) - currentXp,
    leveledUp,
  };
}

export function calculateGoalProgressFromSteps(completedSteps: number, totalSteps: number) {
  if (totalSteps <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((completedSteps / totalSteps) * 100));
}
