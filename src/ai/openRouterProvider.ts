import { capacityGuidance } from './planningGuidance';
import { requestOpenRouter, parseModelJson, OpenRouterError } from './openRouterClient';
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
- Выбери 1–2 цели только из приоритетов пользователя; одна цель допустима. Не добавляй другие сферы ради полноты.
- Помогай сформировать будущую версию личности на горизонте 1-3 лет.
- Затем мягко подведи к будущим 90-дневным фокусам, но не раскрывай этот модуль полностью.
- Если вход содержит KODA Onboarding V2, используй выбранные сферы, боли, приоритеты, значение изменений, гордость и ключевую трансформацию.
- Пиши по-русски, коротко, тепло и конкретно.
${capacityGuidance}
- В nextStep дай одно ближайшее действие, а не выбор из списка или ещё одно задание планировать. При малом ресурсе оно занимает 1–5 минут.
- Верни только валидный JSON без markdown.
`;

export function createOpenRouterProvider(config: OpenRouterConfig, transport: typeof requestOpenRouter = requestOpenRouter, providerName: 'openrouter' | 'yandex' = 'openrouter'): AiProvider | null {
  if (!config.apiKey) {
    return null;
  }

  const model = config.model || 'openrouter/free';

  return {
    name: providerName,
    async generate(input: KodaAiInput): Promise<KodaAiResult> {
      const rulesDraft = buildRulesPlan(input);
      const questionLimitReached = input.maxQuestions > 0 && input.answers.length >= input.maxQuestions;
      const text = await transport({ apiKey: config.apiKey!, model }, {
          messages: [
            { role: 'system', content: systemPrompt },
            {
              role: 'user',
              content: JSON.stringify({
                task: questionLimitReached ? 'Лимит вопросов достигнут. Верни финальный черновик с непустым массивом goals, shouldFinalize=true и nextQuestion=null. Не задавай новых вопросов.' : 'Верни следующий адаптивный вопрос или финальный черновик целей KODA.',
                outputContract: {
                  shouldFinalize: questionLimitReached ? true : 'boolean',
                  userProfile: {
                    archetype: 'string',
                    description: 'string',
                    strategy: 'string',
                  },
                  nextQuestion: questionLimitReached ? null : { eyebrow: 'string', question: 'string', placeholder: 'string', rationale: 'string' },
                  goals: [{ title: 'Название цели из ответов пользователя', target: 'Проверяемый результат', firstStep: 'Конкретный маленький шаг в пределах доступного времени' }],
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
                decisionRules: [
                  'Если ответов меньше maxQuestions и данных недостаточно, shouldFinalize=false и nextQuestion не null.',
                  'Если данных достаточно или достигнут maxQuestions, shouldFinalize=true и nextQuestion=null.',
                  'Всегда возвращай goals, userProfile, nextStep и explanation. nextQuestion=null при shouldFinalize=true.',
                  'Все поля, включая target, strategy и progressReward, соблюдают ограничения ресурса. Никакого назначенного ежедневного режима: только выбранная самим пользователем частота.',
                  'Не придумывай финансовые цели, количественные обязательства или диагнозы, которых нет в ответах.',
                  'Не повторяй уже заданные вопросы.',
                  'Верни только JSON, без ``` и без пояснений вне JSON.',
                ],
              }),
            },
          ],
          temperature: 0.45,
          max_tokens: 3000,
          response_format: { type: 'json_object' },
      });
      const parsed = parseModelJson(text) as Partial<KodaAiResult> | null;
      if (!parsed || typeof parsed !== 'object' || typeof parsed.shouldFinalize !== 'boolean') throw new OpenRouterError(502, 'invalid_response');

      const hasText = (value: unknown): value is string => typeof value === 'string' && Boolean(value.trim());
      if (!Array.isArray(parsed.goals) || !parsed.goals.length || parsed.goals.length > 5 || !parsed.goals.every(goal => goal && hasText(goal.title) && hasText(goal.target) && hasText(goal.firstStep)) || !parsed.userProfile || !hasText(parsed.userProfile.archetype) || !hasText(parsed.userProfile.description) || !hasText(parsed.userProfile.strategy)) throw new OpenRouterError(502, 'invalid_response');
      // The question cap is an application rule; a model cannot extend the questionnaire.
      const shouldFinalize = parsed.shouldFinalize || questionLimitReached;
      if (!shouldFinalize && (!parsed.nextQuestion || !hasText(parsed.nextQuestion.question) || !hasText(parsed.nextQuestion.eyebrow) || typeof parsed.nextQuestion.placeholder !== 'string' || typeof parsed.nextQuestion.rationale !== 'string')) throw new OpenRouterError(502, 'invalid_response');
      return {
        ...rulesDraft,
        ...parsed,
        goals: parsed.goals?.length ? parsed.goals : rulesDraft.goals,
        userProfile: parsed.userProfile || rulesDraft.userProfile,
        nextQuestion: shouldFinalize ? null : parsed.nextQuestion ?? rulesDraft.nextQuestion,
        nextStep: parsed.nextStep?.trim() || parsed.goals[0].firstStep,
        explanation: parsed.explanation || 'Помощник собрал структурированный ответ по данным пользователя.',
        futureTitle: parsed.futureTitle || rulesDraft.futureTitle,
        summary: parsed.summary || rulesDraft.summary,
        progressReward: parsed.progressReward || rulesDraft.progressReward,
        visualPrompt: parsed.visualPrompt || rulesDraft.visualPrompt,
        shouldFinalize,
        provider: providerName,
      };
    },
  };
}
