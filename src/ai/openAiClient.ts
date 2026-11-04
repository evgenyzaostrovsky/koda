export class OpenAiError extends Error {
  constructor(public readonly status: number, public readonly reason: 'authentication' | 'rate_limit' | 'provider_unavailable' | 'invalid_response' | 'model_unavailable') {
    super('OpenAI: ' + reason + ' (' + status + ')'); this.name = 'OpenAiError';
  }
}
type Request = { messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>; temperature?: number; max_tokens: number };

/** Server-only Responses API client. No credentials are ever returned to callers or logged. */
export async function requestOpenAI(config: { apiKey?: string; model?: string; timeoutMs?: number }, request: Request): Promise<string> {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) throw new OpenAiError(401, 'authentication');
  const timeoutMs = typeof config.timeoutMs === 'number' && Number.isFinite(config.timeoutMs) ? Math.max(1, Math.min(40000, config.timeoutMs)) : 40000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: controller.signal,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model?.trim() || 'gpt-6-luna',
        input: request.messages.map(message => ({ role: message.role, content: message.content })),
        max_output_tokens: request.max_tokens,
        text: { format: { type: 'json_object' } },
        store: false,
      }),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new OpenAiError(response.status, response.status === 401 || response.status === 403 ? 'authentication' : response.status === 404 ? 'model_unavailable' : response.status === 429 ? 'rate_limit' : 'provider_unavailable');
    }
    const data = await response.json();
    const text = data?.output?.flatMap((item: any) => item?.type === 'message' && Array.isArray(item.content) ? item.content.filter((part: any) => part?.type === 'output_text').map((part: any) => part.text) : []).join('');
    if (data?.error || typeof text !== 'string' || !text.trim() || data.status === 'incomplete') throw new OpenAiError(502, 'invalid_response');
    return text;
  } catch (error) {
    if (error instanceof OpenAiError) throw error;
    if (controller.signal.aborted) throw new OpenAiError(504, 'provider_unavailable');
    throw new OpenAiError(502, 'provider_unavailable');
  } finally { clearTimeout(timeout); }
}
