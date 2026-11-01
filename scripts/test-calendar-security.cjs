const assert = require('node:assert/strict');
const { signCalendarToken, calendarOwnerFromToken } = require('../api/_calendarTokens');
const user = '123e4567-e89b-42d3-a456-426614174000';
const secret = 'test-secret-only-not-production';
const token = signCalendarToken(user, secret);
assert.equal(calendarOwnerFromToken(token, secret), `user:${user}`);
for (const invalid of ['', `user:${user}`, user, token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A'), token.replace(user, '123e4567-e89b-42d3-a456-426614174001')]) {
  assert.equal(calendarOwnerFromToken(invalid, secret), null, `reject ${invalid}`);
}
assert.equal(calendarOwnerFromToken(token, 'other-secret'), null);
assert.equal(signCalendarToken(user, ''), null);
const auth = require('../src/server/aiSecurity');
auth.validateBearerToken = async value => value === 'valid' ? user : null;
const link = require('../api/calendar-link');
const calendar = require('../api/koda-calendar.ics');
function response() { return { headers: {}, statusCode: 0, setHeader(k, v) { this.headers[k] = v; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; }, send(body) { this.body = body; return this; } }; }
async function invoke(handler, req) { const res = response(); await handler(req, res); return res; }
(async () => {
  process.env.CALENDAR_TOKEN_SECRET = secret;
  assert.equal((await invoke(link, {method:'POST', headers:{}})).statusCode, 401);
  const result = await invoke(link, {method:'POST', headers:{authorization:'Bearer valid'}});
  assert.equal(result.statusCode, 200);
  assert.equal(calendarOwnerFromToken(result.body.token, secret), `user:${user}`);
  assert.equal(result.headers['Cache-Control'], 'no-store');
  assert.equal((await invoke(calendar, {method:'GET', query:{key:`user:${user}`}})).statusCode, 403);
  assert.equal((await invoke(calendar, {method:'GET', query:{key:'bad-token'}})).statusCode, 403);
  delete process.env.CALENDAR_TOKEN_SECRET;
  assert.equal((await invoke(calendar, {method:'GET', query:{key:token}})).statusCode, 503);
  console.log('Calendar: verified signed links, forged and legacy link rejection, fail-closed config PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
