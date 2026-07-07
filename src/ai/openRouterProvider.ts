import type { AiProvider, KodaAiInput, KodaAiResult } from '../types/koda';
import { buildRulesPlan } from './rulesProvider';

type OpenRouterConfig = {
  apiKey?: string;
  model?: string;
};

const systemPrompt = `
Ты KODA, AI-наставник для Future Self Builder.

Методология:
- Не ставь диагнозы и не называй пользователя клиническими ярлыками.
- Используй рабочий профиль саморегуляции, а не "психотип" как приговор.
- Основывай диалог на WOOP, self-determination theory, implementation intentions, identity-based goals и ADHD-friendly принципах: малый шаг, низкое трение, быстрый видимый прогресс.
- Не превращай ответ в таск-менеджер.
- Не помогай ставить одну цель.
- Помогай сформировать будущую версию личности на горизонте 1-3 лет.
- Затем мягко подведи к будущим 90-дневным фокусам, но не раскрывай этот модуль полностью.
- Если вход содержит KODA Onboarding V2, используй выбранные сферы, боли, приоритеты, значение изменений, гордость и ключевую трансформацию.
- Пиши по-русски, коротко, тепло и конкретно.
- Верни только валидный JSON без markdown.
`;

export function createOpenRouterProvider(config: OpenRouterConfig): AiProvider | null {
  if (!config.apiKey) {
    return null;
  }

  const model = config.model || 'openrouter/free';

  return {
    name: 'openrouter',
    async generate(input: KodaAiInput): Promise<KodaAiResult> {
      const rulesDraft = buildRulesPlan(input);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);

      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:8081',
          'X-OpenRouter-Title': 'KODA MVP',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                task: 'Верни следующий адаптивный вопрос или финальный черновик целей KODA.',
                outputContract: {
                  shouldFinalize: 'boolean',
                  userProfile: {
                    archetype: 'string',
                    description: 'string',
                    strategy: 'string',
                  },
                  nextQuestion: 'object|null',
                  goals: 'array of 4-5 goals with title,target,firstStep',
                  nextStep: 'string',
                  explanation: 'string',
                  futureTitle: 'string',
                  summary: 'string',
                  progressReward: 'string',
                  visualPrompt: 'string',
                },
                user: {
                  name: input.name,
                  targetYear: input.targetYear,
                },
                maxQuestions: input.maxQuestions,
                answers: input.answers,
                rulesDraft,
                decisionRules: [
                  'Если ответов меньше maxQuestions и данных недостаточно, shouldFinalize=false и nextQuestion не null.',
                  'Если данных достаточно или достигнут maxQuestions, shouldFinalize=true и nextQuestion=null.',
                  'Всегда возвращай goals, userProfile, nextStep и explanation.',
                  'Не повторяй уже заданные вопросы.',
                  'Верни только JSON, без ``` и без пояснений вне JSON.',
                ],
              }),
            },
          ],
          temperature: 0.45,
          max_tokens: 1400,
          response_format: { type: 'json_object' },
        }),
      });
      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`OpenRouter failed: ${response.status}`);
      }

      const data = await response.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) {
        throw new Error('OpenRouter returned empty content');
      }

      const parsed = parseJson(text);

      return {
        ...rulesDraft,
        ...parsed,
        goals: parsed.goals?.length ? parsed.goals : rulesDraft.goals,
        userProfile: parsed.userProfile || rulesDraft.userProfile,
        nextQuestion: parsed.nextQuestion ?? rulesDraft.nextQuestion,
        nextStep: parsed.nextStep || rulesDraft.nextStep,
        explanation: parsed.explanation || 'OpenRouter free router собрал структурированный ответ по данным пользователя.',
        futureTitle: parsed.futureTitle || rulesDraft.futureTitle,
        summary: parsed.summary || rulesDraft.summary,
        progressReward: parsed.progressReward || rulesDraft.progressReward,
        visualPrompt: parsed.visualPrompt || rulesDraft.visualPrompt,
        shouldFinalize: Boolean(parsed.shouldFinalize),
        provider: 'openrouter',
      };
    },
  };
}

function parseJson(text: string) {
  const cleaned = text
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');

  return JSON.parse(cleaned);
}
