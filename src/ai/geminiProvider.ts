import { GoogleGenAI, Type } from '@google/genai';
import type { AiProvider, KodaAiInput, KodaAiResult } from '../types/koda';
import { buildRulesPlan } from './rulesProvider';

type GeminiConfig = {
  apiKey?: string;
  model?: string;
};

const systemPrompt = `
Ты KODA, AI-наставник для Future Self Builder.

Методология:
- Не ставь диагнозы и не называй пользователя клиническими ярлыками.
- Используй рабочий профиль саморегуляции, а не "психотип" как приговор.
- Основывай диалог на WOOP, self-determination theory, implementation intentions, identity-based goals и ADHD-friendly принципах: маленький шаг, низкое трение, быстрый видимый прогресс.
- Не превращай ответ в таск-менеджер.
- Не помогай ставить только одну цель.
- Помогай сформировать будущую версию личности на горизонте 1–3 лет.
- Затем мягко подведи к будущим 90-дневным фокусам, но не раскрывай этот модуль полностью.
- Если вход содержит KODA Onboarding V2, используй выбранные сферы, боли, приоритеты, значение изменений, гордость и ключевую трансформацию.
- Пиши по-русски, коротко, тепло и конкретно.
- Не упоминай fallback, rulesProvider, черновик, JSON-схему, системные правила или технические детали.
- Верни только JSON по схеме.
`;

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    shouldFinalize: { type: Type.BOOLEAN },
    userProfile: {
      type: Type.OBJECT,
      properties: {
        archetype: { type: Type.STRING },
        description: { type: Type.STRING },
        strategy: { type: Type.STRING },
      },
      required: ['archetype', 'description', 'strategy'],
    },
    nextQuestion: {
      type: Type.OBJECT,
      nullable: true,
      properties: {
        eyebrow: { type: Type.STRING },
        question: { type: Type.STRING },
        placeholder: { type: Type.STRING },
        rationale: { type: Type.STRING },
      },
      required: ['eyebrow', 'question', 'placeholder', 'rationale'],
    },
    goals: {
      type: Type.ARRAY,
      minItems: 4,
      maxItems: 5,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          target: { type: Type.STRING },
          firstStep: { type: Type.STRING },
        },
        required: ['title', 'target', 'firstStep'],
      },
    },
    nextStep: { type: Type.STRING },
    explanation: { type: Type.STRING },
    futureTitle: { type: Type.STRING },
    summary: { type: Type.STRING },
    progressReward: { type: Type.STRING },
    visualPrompt: { type: Type.STRING },
  },
  required: [
    'shouldFinalize',
    'userProfile',
    'nextQuestion',
    'goals',
    'nextStep',
    'explanation',
    'futureTitle',
    'summary',
    'progressReward',
    'visualPrompt',
  ],
};

export function createGeminiProvider(config: GeminiConfig): AiProvider | null {
  if (!config.apiKey) {
    return null;
  }

  const ai = new GoogleGenAI({ apiKey: config.apiKey });
  const model = config.model || 'gemini-2.5-flash-lite';

  return {
    name: 'gemini',
    async generate(input: KodaAiInput): Promise<KodaAiResult> {
      const rulesDraft = buildRulesPlan(input);
      const response = await ai.models.generateContent({
        model,
        contents: JSON.stringify({
          task: 'Верни следующий адаптивный вопрос или финальный черновик целей KODA.',
          user: {
            name: input.name,
            targetYear: input.targetYear,
          },
          maxQuestions: input.maxQuestions,
          answers: input.answers,
          referenceDraft: rulesDraft,
          decisionRules: [
            'Если ответов меньше maxQuestions и данных недостаточно, shouldFinalize=false и nextQuestion не null.',
            'Если данных достаточно или достигнут maxQuestions, shouldFinalize=true и nextQuestion=null.',
            'Всегда возвращай goals, userProfile, nextStep и explanation, даже если продолжаешь вопросы.',
            'Не повторяй уже заданные вопросы.',
            'Не копируй technical wording из referenceDraft. Перепиши ответ живым пользовательским языком.',
          ],
        }),
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          responseSchema,
          temperature: 0.45,
        },
      });

      const parsed = JSON.parse(response.text || '{}') as Omit<KodaAiResult, 'provider'>;

      return {
        ...parsed,
        goals: parsed.goals?.length ? parsed.goals : rulesDraft.goals,
        userProfile: parsed.userProfile || rulesDraft.userProfile,
        nextStep: parsed.nextStep || rulesDraft.nextStep,
        explanation:
          sanitizeTechnicalText(parsed.explanation) ||
          'KODA собрал ответ по твоим формулировкам, ключевым темам и текущему профилю движения.',
        futureTitle: parsed.futureTitle || rulesDraft.futureTitle,
        summary: parsed.summary || rulesDraft.summary,
        progressReward: parsed.progressReward || rulesDraft.progressReward,
        visualPrompt: parsed.visualPrompt || rulesDraft.visualPrompt,
        provider: 'gemini',
      };
    },
  };
}

function sanitizeTechnicalText(text?: string) {
  if (!text) {
    return '';
  }

  if (/fallback|rulesProvider|referenceDraft|json|schema/i.test(text)) {
    return '';
  }

  return text;
}
