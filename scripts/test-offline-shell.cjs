const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'koda-offline-test-'));
fs.writeFileSync(path.join(output, 'index.html'), '<html><head></head><body></body></html>');
execFileSync(process.execPath, ['scripts/prepare-pwa.js', output]);
const handlers = {};
const cached = new Response('<html>saved KODA</html>', { headers: { 'Content-Type': 'text/html' } });
let online = false;
let requests = 0;
vm.runInNewContext(fs.readFileSync(path.join(output, 'sw.js'), 'utf8'), {
  self: { addEventListener: (name, handler) => handlers[name] = handler, location: { origin: 'https://koda.test' } },
  caches: { match: async key => key === '/index.html' || typeof key === 'object' ? cached.clone() : undefined, open: async () => ({ put: async () => {} }) },
  fetch: async () => { requests++; if (!online) throw Error('blocked'); return new Response('fresh', { headers: { 'Content-Type': 'text/html' } }); },
  URL, Response, AbortController, setTimeout, clearTimeout,
});
async function request(mode, pathname) {
  let result;
  handlers.fetch({ request: { method: 'GET', mode, url: `https://koda.test${pathname}` }, respondWith: promise => result = promise });
  return result;
}
(async () => {
  assert.equal(await (await request('navigate', '/')).text(), '<html>saved KODA</html>');
  const before = requests;
  assert.equal(await (await request('cors', '/_expo/static/js/web/bundle.js')).text(), '<html>saved KODA</html>');
  assert.equal(requests, before);
  online = true;
  assert.equal(await (await request('navigate', '/')).text(), 'fresh');
  console.log('Offline shell: blocked network fallback, index fallback, cached assets and online refresh PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
