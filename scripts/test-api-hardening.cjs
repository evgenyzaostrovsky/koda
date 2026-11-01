const assert = require('node:assert/strict');
const { isAllowedPushEndpoint } = require('../api/_pushSecurity');
const { escapeIcs } = require('../src/server/ics');

const accepted = [
  'https://fcm.googleapis.com/fcm/send/test',
  'https://updates.push.services.mozilla.com/wpush/test',
  'https://foo.notify.windows.com/test',
  'https://web.push.apple.com/test',
];
const rejected = [
  'http://fcm.googleapis.com/test', 'https://fcm.googleapis.com.evil.test/test',
  'https://fcm.googleapis.com@evil.test/test', 'https://127.0.0.1/test',
  'https://fcm.googleapis.com:444/test', 'https://fcm.googleapis.com/test#x', null,
];
for (const endpoint of accepted) assert.equal(isAllowedPushEndpoint(endpoint), true, `allow ${endpoint}`);
for (const endpoint of rejected) assert.equal(isAllowedPushEndpoint(endpoint), false, `reject ${endpoint}`);
assert.equal(escapeIcs('a\r\nBEGIN:VEVENT\rb\nc,;\\'), 'a\\nBEGIN:VEVENT\\nb\\nc\\,\\;\\\\');
assert.equal(/[\r\n]/.test(escapeIcs('line\r\nSUMMARY:injected')), false);

const auth = require('../src/server/aiSecurity');
auth.validateBearerToken = async token => token === 'valid-token' ? 'verified-user' : null;
const admin = require('../api/_supabaseAdmin');
let writes = [];
admin.getSupabaseAdmin = () => ({ from: () => ({ upsert: async row => { writes.push(row); return { error: null }; } }) });
const subscribe = require('../api/push-subscriptions');
const cron = require('../api/push-cron');
function response() { return { statusCode: 0, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }
(async () => {
  const subscription = { endpoint: accepted[0], keys: { p256dh: 'key', auth: 'auth' } };
  assert.equal((await invoke(subscribe, { method: 'POST', headers: {}, body: { subscription } })).statusCode, 401);
  assert.equal(writes.length, 0);
  assert.equal((await invoke(subscribe, { method: 'POST', headers: { authorization: 'Bearer invalid' }, body: { subscription } })).statusCode, 401);
  assert.equal((await invoke(subscribe, { method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: { subscription: { ...subscription, endpoint: 'https://127.0.0.1/test' } } })).statusCode, 400);
  assert.equal((await invoke(subscribe, { method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: { subscription, timezone: 'invalid/timezone' } })).statusCode, 400);
  const result = await invoke(subscribe, { method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: { subscription, ownerKey: 'victim', timezone: 'UTC' } });
  assert.equal(result.statusCode, 200);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].owner_key, 'verified-user');
  const savedSecret = process.env.CRON_SECRET;
  delete process.env.CRON_SECRET;
  assert.equal((await invoke(cron, { method: 'GET', headers: {} })).statusCode, 503);
  process.env.CRON_SECRET = 'test-secret';
  assert.equal((await invoke(cron, { method: 'GET', headers: { authorization: 'Bearer wrong' } })).statusCode, 401);
  if (savedSecret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = savedSecret;
  console.log('Security: ICS escaping, push endpoint allowlist, verified owner and cron fail-closed PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
