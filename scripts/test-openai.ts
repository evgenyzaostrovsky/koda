import assert from 'node:assert/strict';
import { requestOpenAI, OpenAiError } from '../src/ai/openAiClient';
import { providerOrder, readAiConfig, configuredAiHealth } from '../src/ai/providerConfig';

async function main() {
  const config = readAiConfig({ KODA_AI_PROVIDER: 'openai', OPENAI_MODEL: 'test-model', OPENAI_API_KEY: 'test-secret' });
  assert.deepEqual(providerOrder(config), ['openai']);
  assert.equal(configuredAiHealth(config).model, 'test-model');
  assert.deepEqual(providerOrder(readAiConfig({ KODA_AI_PROVIDER: 'openai' })), ['openai']);

  const originalFetch = globalThis.fetch;
  let captured: { url: string; init?: RequestInit } | undefined;
  try {
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      captured = { url: String(input), init };
      return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: '{"reply":"Привет"}' }] }] }), { status: 200 });
    }) as typeof fetch;
    const text = await requestOpenAI({ apiKey: 'test-secret', model: 'test-model', timeoutMs: 2000 }, { messages: [{ role: 'system', content: 'Return JSON.' }, { role: 'user', content: 'Hello' }], max_tokens: 80 });
    assert.equal(text, '{"reply":"Привет"}');
    assert.equal(captured?.url, 'https://api.openai.com/v1/responses');
    assert.equal((captured?.init?.headers as Record<string, string>).Authorization, 'Bearer test-secret');
    const body = JSON.parse(String(captured?.init?.body));
    assert.equal(body.model, 'test-model');
    assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_object');
    assert.equal(body.input.length, 2);
    assert.equal(body.input[1].content, 'Hello');

    globalThis.fetch = (async () => new Response(JSON.stringify({ error: { message: 'secret detail' } }), { status: 401 })) as typeof fetch;
    await assert.rejects(requestOpenAI({ apiKey: 'test-secret' }, { messages: [{ role: 'user', content: 'x' }], max_tokens: 10 }), (error: unknown) => error instanceof OpenAiError && error.reason === 'authentication');
    await assert.rejects(requestOpenAI({}, { messages: [{ role: 'user', content: 'x' }], max_tokens: 10 }), (error: unknown) => error instanceof OpenAiError && error.reason === 'authentication');

    globalThis.fetch = (async () => new Response(JSON.stringify({ status: 'incomplete', output: [] }), { status: 200 })) as typeof fetch;
    await assert.rejects(requestOpenAI({ apiKey: 'test-secret' }, { messages: [{ role: 'user', content: 'x' }], max_tokens: 10 }), (error: unknown) => error instanceof OpenAiError && error.reason === 'invalid_response');

    globalThis.fetch = (async () => new Response('{}', { status: 404 })) as typeof fetch;
    await assert.rejects(requestOpenAI({ apiKey: 'test-secret' }, { messages: [{ role: 'user', content: 'x' }], max_tokens: 10 }), (error: unknown) => error instanceof OpenAiError && error.reason === 'model_unavailable');
    globalThis.fetch = (async () => new Response('{}', { status: 429 })) as typeof fetch;
    await assert.rejects(requestOpenAI({ apiKey: 'test-secret' }, { messages: [{ role: 'user', content: 'x' }], max_tokens: 10 }), (error: unknown) => error instanceof OpenAiError && error.reason === 'rate_limit');
  } finally { globalThis.fetch = originalFetch; }
  console.log('OpenAI provider mock checks passed.');
}
void main();
