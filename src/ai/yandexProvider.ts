import { createOpenRouterProvider } from './openRouterProvider';
import { requestYandex } from './yandexClient';
import type { AiProviderConfig } from './providerConfig';
export function createYandexProvider(config: AiProviderConfig) {
  if (!config.yandexApiKey || !config.yandexFolderId) return null;
  return createOpenRouterProvider({ apiKey: config.yandexApiKey, model: config.yandexModel }, (_config, request) => requestYandex({ apiKey: config.yandexApiKey!, folderId: config.yandexFolderId!, model: config.yandexModel }, request), 'yandex');
}
