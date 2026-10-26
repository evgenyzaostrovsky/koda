const { createClient } = require('@supabase/supabase-js');

const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 20;
const MAX_BUCKETS = 10_000;
const AUTH_TIMEOUT_MS = 8_000;
// This protects a single Node process only. Serverless/multi-instance deployments need a shared store for a global quota.
const buckets = new Map();
let supabaseClient;

function createAuthFetch(fetchImpl = globalThis.fetch, timeoutMs = AUTH_TIMEOUT_MS) {
  return (input, init = {}) => {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(init.signal?.reason);
    if (init.signal?.aborted) abortFromCaller();
    else init.signal?.addEventListener('abort', abortFromCaller, { once: true });
    const timer = setTimeout(() => controller.abort(new Error('Supabase auth request timed out')), timeoutMs);
    return Promise.resolve()
      .then(() => fetchImpl(input, { ...init, signal: controller.signal }))
      .finally(() => {
        clearTimeout(timer);
        init.signal?.removeEventListener('abort', abortFromCaller);
      });
  };
}

function getAuthClient(env = process.env) {
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!supabaseClient) {
    supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: createAuthFetch() },
    });
  }
  return supabaseClient;
}

async function validateBearerToken(token, env = process.env, clientFactory = getAuthClient) {
  if (!token || typeof token !== 'string') return null;
  try {
    const client = clientFactory(env);
    if (!client) return null;
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user?.id || data.user.is_anonymous === true) return null;
    return data.user.id;
  } catch {
    return null;
  }
}

function consumeRateLimit(userId, now = Date.now()) {
  for (const [id, bucket] of buckets) {
    if (now - bucket.startedAt >= WINDOW_MS) buckets.delete(id);
  }
  let bucket = buckets.get(userId);
  if (!bucket) {
    if (buckets.size >= MAX_BUCKETS) {
      let earliestExpiry = Number.POSITIVE_INFINITY;
      for (const activeBucket of buckets.values()) earliestExpiry = Math.min(earliestExpiry, activeBucket.startedAt + WINDOW_MS);
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((earliestExpiry - now) / 1000)) };
    }
    bucket = { startedAt: now, count: 0 };
    buckets.set(userId, bucket);
  }
  if (now - bucket.startedAt >= WINDOW_MS) bucket = { startedAt: now, count: 0 };
  bucket.count += 1;
  buckets.set(userId, bucket);
  return { allowed: bucket.count <= MAX_REQUESTS, retryAfterSeconds: Math.max(1, Math.ceil((bucket.startedAt + WINDOW_MS - now) / 1000)) };
}

async function authorizeAiRequest(req, res, dependencies = {}) {
  const env = dependencies.env || process.env;
  const validateToken = dependencies.validateToken || validateBearerToken;
  const rateLimit = dependencies.rateLimit || consumeRateLimit;
  const header = req.headers?.authorization || req.headers?.Authorization;
  const match = typeof header === 'string' && header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    res.status(401).json({ error: 'Войдите в аккаунт, чтобы использовать помощника.' });
    return false;
  }
  const userId = await validateToken(match[1], env);
  if (!userId) {
    const configured = Boolean((env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL) && (env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY));
    res.status(configured ? 401 : 503).json({ error: configured ? 'Сессия недействительна. Войдите снова.' : 'Авторизация помощника не настроена.' });
    return false;
  }
  const limit = rateLimit(userId);
  if (!limit.allowed) {
    res.setHeader?.('Retry-After', String(limit.retryAfterSeconds));
    res.status(429).json({ error: 'Слишком много запросов. Попробуйте позже.' });
    return false;
  }
  return true;
}

function resetSecurityStateForTests() {
  buckets.clear();
  supabaseClient = undefined;
}

module.exports = { authorizeAiRequest, consumeRateLimit, validateBearerToken, resetSecurityStateForTests, createAuthFetch, WINDOW_MS, MAX_REQUESTS, MAX_BUCKETS, AUTH_TIMEOUT_MS };
