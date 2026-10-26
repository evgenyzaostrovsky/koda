import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { authorizeAiRequest, consumeRateLimit, resetSecurityStateForTests, validateBearerToken, createAuthFetch, MAX_REQUESTS, MAX_BUCKETS } = require('../src/server/aiSecurity');

async function main() {
  resetSecurityStateForTests();
  assert.equal(await validateBearerToken('token', {}, () => null), null, 'missing server Supabase config fails closed');

  const verified = await validateBearerToken('good-token', {}, () => ({ auth: { getUser: async (token: string) => ({ data: { user: { id: 'user-1' } }, error: token === 'bad-token' ? new Error('invalid') : null }) } }));
  assert.equal(verified, 'user-1');
  const invalid = await validateBearerToken('bad-token', {}, () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1' } }, error: new Error('invalid') }) } }));
  assert.equal(invalid, null);
  const anonymous = await validateBearerToken('anon-token', {}, () => ({ auth: { getUser: async () => ({ data: { user: { id: 'user-1', is_anonymous: true } }, error: null }) } }));
  assert.equal(anonymous, null, 'anonymous Supabase users are rejected');
  assert.equal(await validateBearerToken('token', {}, () => { throw new Error('bad Supabase URL'); }), null, 'invalid Supabase config is caught');

  let timedOut = false;
  const timedFetch = createAuthFetch((_input: unknown, init: { signal: AbortSignal }) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => { timedOut = true; reject(new Error('aborted')); }, { once: true });
  }), 5);
  await assert.rejects(() => timedFetch('https://example.test', {}), /aborted/);
  assert.equal(timedOut, true, 'auth network fetch has a deadline');

  resetSecurityStateForTests();
  for (let index = 0; index < MAX_REQUESTS; index += 1) assert.equal(consumeRateLimit('user-1', 1000).allowed, true);
  assert.equal(consumeRateLimit('user-1', 1000).allowed, false, 'limit is shared by user id');
  assert.equal(consumeRateLimit('user-2', 1000).allowed, true, 'users have separate limits');
  assert.equal(consumeRateLimit('user-1', 1000 + 10 * 60 * 1000).allowed, true, 'window expires');

  resetSecurityStateForTests();
  for (let index = 0; index < MAX_BUCKETS; index += 1) assert.equal(consumeRateLimit(`capacity-user-${index}`, 2000).allowed, true);
  const capacityDenied = consumeRateLimit('capacity-new-user', 2000);
  assert.equal(capacityDenied.allowed, false, 'full capacity rejects new users without evicting an active bucket');
  assert.equal(capacityDenied.retryAfterSeconds, 600, 'capacity response reports the earliest active bucket expiry');
  assert.equal(consumeRateLimit('capacity-user-0', 2000).allowed, true, 'existing users retain their quota at capacity');
  assert.equal(consumeRateLimit('capacity-new-user', 2000 + 10 * 60 * 1000).allowed, true, 'new users are accepted after active buckets expire');

  let status = 0;
  let body: unknown;
  let retryAfter = '';
  const makeResponse = () => ({ status(value: number) { status = value; return this; }, json(value: unknown) { body = value; return this; }, setHeader(_name: string, value: string) { retryAfter = value; } });
  let response = makeResponse();
  const denied = await authorizeAiRequest({ headers: {} }, response, { env: {}, validateToken: async () => null });
  assert.equal(denied, false);
  assert.equal(status, 401);
  assert.deepEqual(body, { error: 'Войдите в аккаунт, чтобы использовать помощника.' });

  response = makeResponse();
  assert.equal(await authorizeAiRequest({ headers: { authorization: 'Bearer bad' } }, response, { env: { EXPO_PUBLIC_SUPABASE_URL: 'https://example.test', EXPO_PUBLIC_SUPABASE_ANON_KEY: 'public' }, validateToken: async () => null }), false);
  assert.equal(status, 401, 'invalid token is rejected');
  assert.deepEqual(body, { error: 'Сессия недействительна. Войдите снова.' });

  response = makeResponse();
  assert.equal(await authorizeAiRequest({ headers: { authorization: 'Bearer token' } }, response, { env: {}, validateToken: async () => null }), false);
  assert.equal(status, 503, 'missing auth config fails closed');

  response = makeResponse();
  assert.equal(await authorizeAiRequest({ headers: { authorization: 'Bearer token' } }, response, { env: {}, validateToken: async () => 'user-ok', rateLimit: () => ({ allowed: true, retryAfterSeconds: 1 }) }), true);

  response = makeResponse();
  assert.equal(await authorizeAiRequest({ headers: { authorization: 'Bearer token' } }, response, { env: {}, validateToken: async () => 'user-limited', rateLimit: () => ({ allowed: false, retryAfterSeconds: 123 }) }), false);
  assert.equal(status, 429);
  assert.equal(retryAfter, '123');
  assert.deepEqual(body, { error: 'Слишком много запросов. Попробуйте позже.' });

  for (const path of ['api/chat.js', 'api/goal-plan.js', 'api/onboarding.js']) {
    const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
    assert.ok(source.indexOf('authorizeAiRequest(req, res)') < source.indexOf('await generate(') || source.indexOf('authorizeAiRequest(req, res)') < source.indexOf('await aiProvider.generate('), `${path} guards AI calls first`);
  }
  const serverSource = readFileSync(new URL('../server.ts', import.meta.url), 'utf8');
  for (const route of ['/api/chat', '/api/goal-plan', '/api/onboarding']) {
    const start = serverSource.indexOf(`app.post('${route}'`);
    const nextRoute = serverSource.indexOf("app.post('/api/", start + 1);
    const end = nextRoute === -1 ? serverSource.length : nextRoute;
    const handler = serverSource.slice(start, end);
    assert.ok(handler.indexOf('authorizeAiRequest(req, res)') >= 0 && handler.indexOf('authorizeAiRequest(req, res)') < Math.max(handler.indexOf('await generate'), handler.indexOf('await aiProvider.generate')), `server.ts ${route} guards AI calls first`);
  }
  console.log('AI API security checks passed (mocked; no HTTP or AI provider calls).');
}

void main();
