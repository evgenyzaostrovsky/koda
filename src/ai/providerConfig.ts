export type ProviderName = 'gemini' | 'openrouter' | 'yandex';
export type AiProviderConfig = {
  geminiApiKey?: string; geminiModel?: string;
  openRouterApiKey?: string; openRouterModel?: string;
  yandexApiKey?: string; yandexFolderId?: string; yandexModel?: string;
  preferredProvider?: ProviderName | 'auto';
};
export function readAiConfig(env: Record<string, string | undefined>): AiProviderConfig {
  const preferred = env.KODA_AI_PROVIDER;
  return {
    geminiApiKey: env.GEMINI_API_KEY, geminiModel: env.GEMINI_MODEL,
    openRouterApiKey: env.OPENROUTER_API_KEY, openRouterModel: env.OPENROUTER_MODEL,
    yandexApiKey: env.YANDEX_API_KEY, yandexFolderId: env.YANDEX_FOLDER_ID, yandexModel: env.YANDEX_MODEL,
    preferredProvider: preferred === 'openrouter' || preferred === 'gemini' || preferred === 'yandex' ? preferred : 'auto',
  };
}
export function providerOrder(config: AiProviderConfig): ProviderName[] {
  // Paid Yandex requests are opt-in; adding credentials alone never changes the fallback chain.
  const order: ProviderName[] = config.preferredProvider === 'yandex' ? ['yandex', 'openrouter', 'gemini'] : config.preferredProvider === 'openrouter' ? ['openrouter', 'gemini'] : ['gemini', 'openrouter'];
  return order.filter(name => name === 'yandex' ? Boolean(config.yandexApiKey && config.yandexFolderId) : Boolean(name === 'gemini' ? config.geminiApiKey : config.openRouterApiKey));
}
export function configuredAiHealth(config: AiProviderConfig) {
  const provider = providerOrder(config)[0] ?? 'rules';
  const model = provider === 'yandex' ? config.yandexModel || 'yandexgpt-5.1' : provider === 'gemini' ? config.geminiModel || 'gemini-2.5-flash-lite' : provider === 'openrouter' ? config.openRouterModel?.trim() || 'openrouter/free' : 'rules';
  return { provider, geminiEnabled: Boolean(config.geminiApiKey), openRouterEnabled: Boolean(config.openRouterApiKey), yandexEnabled: Boolean(config.yandexApiKey && config.yandexFolderId), model };
}
