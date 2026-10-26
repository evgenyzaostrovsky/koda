export type AiMode = 'checking' | 'gemini' | 'openrouter' | 'yandex' | 'rules' | 'offline';

export type Question = {
  eyebrow: string;
  question: string;
  placeholder: string;
  rationale: string;
};

export type Answer = Question & {
  answer: string;
};

export type Goal = {
  title: string;
  target: string;
  firstStep: string;
};

export type KodaPlan = {
  userProfile: {
    archetype: string;
    description: string;
    strategy: string;
  };
  nextQuestion: Question | null;
  goals: Goal[];
  nextStep: string;
  explanation: string;
  futureTitle: string;
  summary: string;
  progressReward: string;
  visualPrompt: string;
};

export type KodaAiInput = {
  name: string;
  targetYear: string;
  answers: Answer[];
  maxQuestions: number;
};

export type KodaAiResult = KodaPlan & {
  shouldFinalize: boolean;
  provider: 'gemini' | 'openrouter' | 'yandex' | 'rules';
};

export type AiProvider = {
  name: 'gemini' | 'openrouter' | 'yandex' | 'rules';
  generate(input: KodaAiInput): Promise<KodaAiResult>;
};
