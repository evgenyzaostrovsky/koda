import type { Database, Tables } from './database';

export type AttributeSlug =
  | 'finance'
  | 'health'
  | 'discipline'
  | 'career'
  | 'relationships'
  | 'emotional_stability';

export type QuestDifficulty = Database['public']['Enums']['quest_difficulty'];
export type QuestStatus = Database['public']['Enums']['quest_status'];
export type GoalStatus = Database['public']['Enums']['goal_status'];

export type AppUser = Tables<'profiles'>;
export type FutureSelf = Tables<'future_self'>;
export type Attribute = Tables<'attributes'>;
export type Goal = Tables<'goals'>;
export type GoalStep = Tables<'goal_steps'>;
export type Quest = Tables<'quests'>;
export type XPTransaction = Tables<'xp_transactions'>;
export type JournalEntry = Tables<'journal_entries'>;

export type DashboardStats = {
  currentStreak: number;
  totalXpSeason: number;
  questsTodayCompleted: number;
  questsTodayTotal: number;
  activeGoals: number;
};

export type DashboardData = {
  user: AppUser;
  futureSelf: FutureSelf;
  attributes: Attribute[];
  stats: DashboardStats;
  todayQuests: Quest[];
  topGoal: Goal | null;
  strongestAttribute: Attribute | null;
};

export type XPLevelState = {
  level: number;
  currentXp: number;
  totalXp: number;
  xpToNextLevel: number;
};

export type CompleteQuestResult = {
  quest: Quest;
  xpAwarded: number;
  futureSelfLevelUp: boolean;
  attributeLevelUp: boolean;
  futureSelf: FutureSelf;
  attribute: Attribute | null;
};

export const MVP_ATTRIBUTES: Array<{ slug: AttributeSlug; name: string; icon: string; sortOrder: number }> = [
  { slug: 'finance', name: 'Finance', icon: 'circle-dollar-sign', sortOrder: 1 },
  { slug: 'health', name: 'Health', icon: 'heart-pulse', sortOrder: 2 },
  { slug: 'discipline', name: 'Discipline', icon: 'calendar-check', sortOrder: 3 },
  { slug: 'career', name: 'Career', icon: 'briefcase-business', sortOrder: 4 },
  { slug: 'relationships', name: 'Relationships', icon: 'heart', sortOrder: 5 },
  { slug: 'emotional_stability', name: 'Emotional Stability', icon: 'smile-plus', sortOrder: 6 },
];
