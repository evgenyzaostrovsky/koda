import type { Attribute, DashboardData, FutureSelf, Goal, GoalStep, Quest } from './domain';

export type AuthProvider = 'email' | 'google';

export type SignUpRequest = {
  email: string;
  password: string;
  name: string;
};

export type SignInRequest = {
  email: string;
  password: string;
};

export type OnboardingStartResponse = {
  sessionId: string;
};

export type OnboardingAnswerRequest = {
  sessionId: string;
  step: string;
  answer: unknown;
};

export type OnboardingCompleteRequest = {
  sessionId: string;
  selectedAttributes: string[];
};

export type OnboardingCompleteResponse = {
  futureSelf: FutureSelf;
  attributes: Attribute[];
  goals: Goal[];
  quests: Quest[];
};

export type DashboardResponse = DashboardData;

export type CreateGoalRequest = {
  attributeId?: string;
  title: string;
  description?: string;
  targetDate?: string;
};

export type UpdateGoalRequest = Partial<CreateGoalRequest> & {
  status?: Goal['status'];
  progress?: number;
};

export type CreateQuestRequest = {
  attributeId?: string;
  goalId?: string;
  goalStepId?: string;
  title: string;
  description?: string;
  xpReward?: number;
  difficulty?: Quest['difficulty'];
  dueDate: string;
};

export type CompleteQuestResponse = {
  quest: Quest;
  xpAwarded: number;
  futureSelfLevelUp: boolean;
  attributeLevelUp: boolean;
};

export type GoalWithSteps = Goal & {
  steps: GoalStep[];
};
