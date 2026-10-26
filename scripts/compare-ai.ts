import 'dotenv/config';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createGoalPlanGenerator } from '../src/ai/goalPlanProvider';
import { createAiProvider } from '../src/ai/aiProvider';
import { readAiConfig, type AiProviderConfig } from '../src/ai/providerConfig';
import type { KodaAiInput } from '../src/types/koda';

// Explicitly opt-in: this sends 12 synthetic requests, including paid Yandex calls.
const cases = [
  { id: 'ordinary', wish: 'Хочу за три месяца сделать учебный проект на Python: приложение для учёта книг. Есть 30 минут в день, пять дней в неделю.' },
  { id: 'overloaded', wish: 'Хочу за три месяца подготовить портфолио для смены работы. Работаю полный день, забочусь о ребёнке, есть максимум 15 минут три раза в неделю. Не предлагай обязательный ежедневный режим и дорогие курсы.' },
  { id: 'hard-day', wish: 'Хочу закончить небольшой рассказ за два месяца. Сейчас тяжёлая неделя, мало сил и трудно начать. Сегодня есть только 5 минут. Мне нужен очень маленький первый шаг, без чувства вины и попыток наверстать всё.' },
  { id: 'vague', wish: 'Хочу привести жизнь в порядок и стать лучше. Пока не знаю, какой результат выбрать. Есть 20 минут по выходным. Не придумывай за меня доход, вес, диагноз или срок.' },
];
const originalFetch = globalThis.fetch;
async function main() {
  if (!process.argv.includes('--live')) { console.log('Use --live for 12 synthetic requests, or --live --yandex-only for 6 Yandex requests (billed). Add --mentor-only for mentor cases only.'); return; }
  const config = readAiConfig(process.env);
  const yandexOnly = process.argv.includes('--yandex-only');
  if (!config.yandexApiKey || !config.yandexFolderId || (!yandexOnly && !config.openRouterApiKey)) throw new Error('Both providers must be configured');
  const retryFailed = process.argv.includes('--retry-failed');
  if (retryFailed && !yandexOnly) throw new Error('Retry is supported only with --yandex-only');
  const selected = process.argv.find(arg => arg.startsWith('--scenarios='))?.slice('--scenarios='.length).split(',');
  if (selected && !yandexOnly) throw new Error('Scenario selection requires --yandex-only');
  const rows: any[] = (retryFailed || selected) ? JSON.parse(await readFile('docs/evidence/ai-yandex-capacity.json', 'utf8')).rows : [];
  for (let index = process.argv.includes('--mentor-only') ? 4 : 0; index < 6; index++) {
    const order = yandexOnly ? ['yandex'] as const : index % 2 ? ['openrouter', 'yandex'] as const : ['yandex', 'openrouter'] as const;
    for (const provider of order) {
      const scenario = index < 4 ? cases[index].id : index === 4 ? 'mentor-overloaded' : 'mentor-hard-day';
      if (selected && !selected.includes(scenario)) continue;
      const previous = rows.filter(row => row.scenario === scenario && row.provider === provider);
      if (retryFailed && previous.at(-1)?.success) continue;
      const telemetry: any[] = [];
      globalThis.fetch = (async (url, init) => {
        let response: Response;
        try { response = await originalFetch(url, init); }
        catch (error) {
          const cause = error instanceof Error ? (error as Error & { cause?: { code?: unknown } }).cause : undefined;
          telemetry.push({ networkFailure: true, code: typeof cause?.code === 'string' ? cause.code : 'network_or_abort' });
          throw error;
        }
        const data = await response.clone().json().catch(() => ({}));
        telemetry.push({ status: response.status, model: typeof data.model === 'string' ? data.model.replace(/^gpt:\/\/[^/]+\//, '') : undefined, usage: data.usage, rawContent: data.choices?.[0]?.message?.content });
        return response;
      }) as typeof fetch;
      const isolated: AiProviderConfig = provider === 'yandex' ? { yandexApiKey: config.yandexApiKey, yandexFolderId: config.yandexFolderId, yandexModel: config.yandexModel, preferredProvider: 'yandex' } : { openRouterApiKey: config.openRouterApiKey, openRouterModel: config.openRouterModel, preferredProvider: 'openrouter' };
      const start = Date.now();
      let output: unknown; let success = false;
      try {
        if (index < 4) {
          output = await createGoalPlanGenerator(isolated)({ wish: cases[index].wish, availableMinutes: [30,15,10,20][index] }); success = true;
        } else {
          const answer = index === 4 ? 'Хочу спокойнее развиваться в профессии и быть внимательным родителем. После работы у меня 15 минут, не каждый день. Важнее устойчивость, чем продуктивность любой ценой.' : 'У меня СДВГ, сегодня очень мало сил. Хочу двигаться к своим главным целям, но не превращать отдых и бытовые дела в экзамен. Мне нужен маленький шаг и право пересмотреть перегруженный план без наказания.';
          const input: KodaAiInput = { name: 'Тест', targetYear: '2027', maxQuestions: 1, answers: [{ eyebrow: 'Будущее', question: 'Что важно?', placeholder: '', rationale: '', answer }] };
          const result = await createAiProvider(isolated).generate(input); output = result; success = result.provider === provider;
        }
      } catch { output = { error: 'provider_or_contract_failed' }; }
      const row = { attempt: previous.length + 1, scenario: index < 4 ? cases[index].id : index === 4 ? 'mentor-overloaded' : 'mentor-hard-day', provider, success, elapsedMs: Date.now()-start, telemetry, output };
      rows.push(row);
      console.log(JSON.stringify({ scenario: row.scenario, provider, success, elapsedMs: row.elapsedMs, telemetry: telemetry.map(({rawContent, ...metadata}) => metadata) }));
      await mkdir('docs/evidence', { recursive: true });
      await writeFile(yandexOnly ? 'docs/evidence/ai-yandex-capacity.json' : process.argv.includes('--mentor-only') ? 'docs/evidence/ai-comparison-mentor-refined.json' : 'docs/evidence/ai-comparison.json', JSON.stringify({ generatedAt: new Date().toISOString(), note: 'Synthetic inputs only; one sample per provider/scenario, not a statistical benchmark. No fallback-provider success accepted.', rows }, null, 2));
    }
  }
}
main().finally(() => { globalThis.fetch = originalFetch; }).catch(() => { console.error('Comparison could not complete; check server credentials/network.'); process.exitCode = 1; });
