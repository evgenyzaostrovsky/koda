const assert = require('node:assert/strict');
const handler = require('../api/auth-reset-password');

async function request(method, body) {
  const result = {};
  const res = { status(code) { result.status = code; return this; }, json(data) { result.body = data; return this; } };
  await handler({ method, body, headers: {} }, res);
  return result;
}

(async () => {
  for (const body of [{ username: 'victim', password: 'changed-password' }, {}, null]) {
    const result = await request('POST', body);
    assert.equal(result.status, 410, 'legacy reset cannot change any account password');
    assert.match(result.body.error, /Обновите приложение/);
  }
  assert.equal((await request('GET', {})).status, 405);
  console.log('Legacy password-reset endpoint is disabled.');
})().catch(error => { console.error(error); process.exitCode = 1; });
