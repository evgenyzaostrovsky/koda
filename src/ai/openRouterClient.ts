export const FREE_ROUTER = 'openrouter/free';
export class OpenRouterError extends Error {
  constructor(public readonly status: number, public readonly reason: 'model_unavailable' | 'authentication' | 'rate_limit' | 'provider_unavailable' | 'invalid_response') {
    super('OpenRouter: ' + reason + ' (' + status + ')'); this.name = 'OpenRouterError';
  }
}
type Request = { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; temperature?: number; max_tokens: number; response_format: { type: 'json_object' } };
/** A removed free model can fall back only to the free pool, never to its paid slug. */
export async function requestOpenRouter(config: { apiKey: string; model?: string; timeoutMs?:number }, request: Request): Promise<string> {
  const model = config.model?.trim() || FREE_ROUTER;
  const models = model !== FREE_ROUTER && model.endsWith(':free') ? [model, FREE_ROUTER] : [model];
  const controller = new AbortController();
  const timeoutMs=typeof config.timeoutMs==='number'&&Number.isFinite(config.timeoutMs)?Math.max(1,Math.min(40000,config.timeoutMs)):40000;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    for (let index = 0; index < models.length; index++) {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: 'Bearer ' + config.apiKey, 'Content-Type': 'application/json', 'X-OpenRouter-Title': 'KODA' },
        body: JSON.stringify({ ...request, model: models[index], reasoning: { effort: 'low', exclude: true }, provider: { require_parameters: true } }),
      });
      if (!response.ok) {
        if (response.status === 404 && index + 1 < models.length) { await response.body?.cancel(); continue; }
        throw new OpenRouterError(response.status, response.status === 404 ? 'model_unavailable' : response.status === 401 || response.status === 403 ? 'authentication' : response.status === 429 ? 'rate_limit' : 'provider_unavailable');
      }
      const data = await response.json();
      const choice = data?.choices?.[0];
      const content = choice?.message?.content;
      if (data?.error || typeof content !== 'string' || !content.trim() || choice.finish_reason === 'length') throw new OpenRouterError(502, 'invalid_response');
      return content;
    }
    throw new OpenRouterError(404, 'model_unavailable');
  } finally { clearTimeout(timeout); }
}
export function parseModelJson(content: string): unknown {
  try { return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
  catch { throw new OpenRouterError(502, 'invalid_response'); }
}
