import type { AiProvider, KodaAiInput, KodaAiResult } from '../types/koda';
import { createGeminiProvider } from './geminiProvider';
import { createOpenRouterProvider } from './openRouterProvider';
import { rulesProvider } from './rulesProvider';

type ProviderConfig = {
  geminiApiKey?: string;
  geminiModel?: string;
  openRouterApiKey?: string;
  openRouterModel?: string;
};

export function createAiProvider(config: ProviderConfig): AiProvider {
  const geminiProvider = createGeminiProvider({
    apiKey: config.geminiApiKey,
    model: config.geminiModel,
  });
  const openRouterProvider = createOpenRouterProvider({
    apiKey: config.openRouterApiKey,
    model: config.openRouterModel,
  });

  return {
    name: geminiProvider ? 'gemini' : openRouterProvider ? 'openrouter' : 'rules',
    async generate(input: KodaAiInput): Promise<KodaAiResult> {
      if (geminiProvider) {
        try {
          return await withTimeout(geminiProvider.generate(input), 10000, 'Gemini timeout');
        } catch (error) {
          console.warn('Gemini unavailable, trying OpenRouter:', error);
        }
      }

      if (openRouterProvider) {
        try {
          return await withTimeout(openRouterProvider.generate(input), 30000, 'OpenRouter timeout');
        } catch (error) {
          console.warn('OpenRouter unavailable, falling back to rulesProvider:', error);
        }
      }

      return rulesProvider.generate(input);
    },
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeout);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timeout);
        reject(error);
      });
  });
}
