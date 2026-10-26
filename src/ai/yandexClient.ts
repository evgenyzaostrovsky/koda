import type { requestOpenRouter } from './openRouterClient';
export class YandexError extends Error {
  constructor(public readonly status: number, public readonly reason: string) {
    super('Yandex: ' + reason + ' (' + status + ')'); this.name = 'YandexError';
  }
}
export async function requestYandex(config: { apiKey: string; folderId: string; model?: string; timeoutMs?: number }, request: Parameters<typeof requestOpenRouter>[1]): Promise<string> {
  const controller = new AbortController();
  const timeoutMs=typeof config.timeoutMs==='number'&&Number.isFinite(config.timeoutMs)?Math.max(1,Math.min(40000,config.timeoutMs)):40000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://ai.api.cloud.yandex.net/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: 'Api-Key ' + config.apiKey, 'OpenAI-Project': config.folderId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...request, model: 'gpt://' + config.folderId + '/' + (config.model || 'yandexgpt-5.1') }),
    });
    if (!response.ok) throw new YandexError(response.status, response.status === 401 || response.status === 403 ? 'authentication' : response.status === 429 ? 'rate_limit' : 'provider_unavailable');
    const data = await response.json();
    const choice = data?.choices?.[0];
    const content = choice?.message?.content;
    if (data?.error || typeof content !== 'string' || !content.trim() || choice.finish_reason === 'length') throw new YandexError(502, 'invalid_response');
    return content;
  } finally { clearTimeout(timer); }
}
