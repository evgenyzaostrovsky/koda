import { createYandexProvider } from './yandexProvider';
import type { AiProvider, KodaAiInput, KodaAiResult } from '../types/koda';
import { createGeminiProvider } from './geminiProvider';
import { createOpenRouterProvider } from './openRouterProvider';
import { rulesProvider } from './rulesProvider';
import { providerOrder, type AiProviderConfig } from './providerConfig';
import { requestOpenAI } from './openAiClient';
export function createAiProvider(config: AiProviderConfig): AiProvider {
  const available = { yandex: createYandexProvider(config), gemini: createGeminiProvider({ apiKey: config.geminiApiKey, model: config.geminiModel }), openrouter: createOpenRouterProvider({ apiKey: config.openRouterApiKey, model: config.openRouterModel }), openai: config.openAiApiKey || config.preferredProvider === 'openai' ? createOpenRouterProvider({ apiKey: config.openAiApiKey || '', model: config.openAiModel }, async (_cfg, request) => requestOpenAI({ apiKey: config.openAiApiKey, model: config.openAiModel }, request), 'openai') : null };
  const providers = providerOrder(config).map(name => available[name]).filter((provider): provider is AiProvider => Boolean(provider));
  return { name: providers[0]?.name ?? 'rules', async generate(input: KodaAiInput): Promise<KodaAiResult> {
    for (const provider of providers) {
      try { return await withTimeout(provider.generate(input), provider.name === 'gemini' ? 10000 : 45000); }
      catch (error) {
        if (config.preferredProvider === 'openai') throw error;
        console.warn('KODA ' + provider.name + ' unavailable; trying the next configured provider.');
      }
    }
    return rulesProvider.generate(input);
  } };
}
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('AI timeout')), timeoutMs); promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); }); });
}
