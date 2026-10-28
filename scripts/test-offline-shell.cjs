const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'koda-offline-test-'));
const hash = 'a'.repeat(32);
const oldHash = 'b'.repeat(32);
const sharedPet = `/assets/pet/poses_01.${hash}.png`;
const sharedJs = `/_expo/static/js/web/index-${hash}.js`;
const olderPet = `/assets/pet/poses_02.${hash}.png`;
const newPet = `/assets/pet/poses_03.${hash}.png`;
const unreadablePet = `/assets/pet/poses_04.${hash}.png`;
const invalidPet = `/assets/pet/poses_05.${hash}.png`;
const unrelatedPet = `/assets/pet/poses_06.${hash}.png`;
const mutableFiles = [
  '/assets/pet/poses_01.png', '/assets/pet/poses_01.1234abcd.png',
  `/assets/${hash}/poses_01.png`, `/assets/page.${hash}.html`,
  `/outside/pet.${hash}.png`,
];
for (const url of [sharedPet, sharedJs, olderPet, newPet, unreadablePet, invalidPet, unrelatedPet, ...mutableFiles]) {
  const file = path.join(output, url.slice(1));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'fixture');
}
fs.writeFileSync(path.join(output, 'index.html'), '<html><head></head><body><div id="root"></div></body></html>');
execFileSync(process.execPath, ['scripts/prepare-pwa.js', output]);
const html = fs.readFileSync(path.join(output, 'index.html'), 'utf8');
assert.match(html, /<div id="root"><div id="koda-boot" role="status"/);
assert.match(html, /prefers-reduced-motion:reduce/);
const source = fs.readFileSync(path.join(output, 'sw.js'), 'utf8');
const currentName = source.match(/const CACHE_NAME = '([^']+)'/)[1];
const buildId = source.match(/const BUILD_ID = '([^']+)'/)[1];
const precache = JSON.parse(source.match(/const PRECACHE_URLS = (\[[\s\S]*?\]);/)[1]);

// An in-memory CacheStorage double exercises the actual generated worker lifecycle.
// It clones bodies and models addAll's all-or-nothing response validation.
function installationHarness(options = {}) {
  const storage = new Map();
  const listeners = {};
  const downloads = [];
  const events = [];
  const deadlines = [];
  const urlKey = (request) => new URL(typeof request === 'string' ? request : request.url, 'https://koda.test').pathname;
  class WorkerRequest extends Request {
    constructor(url, init) { super(new URL(url, 'https://koda.test'), init); }
  }
  const network = async (request, init = {}) => {
    const url = urlKey(request);
    downloads.push({ url, cache: init.cache || request.cache });
    if (options.offline || url === options.blocked) throw new Error('Network unavailable');
    return new Response(url === '/' ? (options.shell || html) : `fresh:${url}`, {
      status: url === options.httpFailure ? 404 : 200,
      headers: url === '/' || url === options.assetHtml ? { 'Content-Type': 'text/html' } : {},
    });
  };
  function seed(name, entries) { storage.set(name, new Map(entries.map(([url, body, status = 200]) => [url, new Response(body, { status })]))); }
  const oldName = 'koda-offline-previous';
  seed('koda-offline-older', [[olderPet, 'older pet']]);
  seed(oldName, [
    ['/', 'old shell'], ['/manifest.webmanifest', 'old manifest'], ['/metadata.json', 'old metadata'],
    ['/pwa-icon-192.png', 'old icon'], [sharedPet, 'shared pet'], [sharedJs, 'shared bundle'],
    [unreadablePet, 'unreadable'], [invalidPet, 'invalid response', 404],
    [newPet.replace(hash, oldHash), 'different version'],
    ...mutableFiles.map((url) => [url, 'old mutable']),
  ]);
  seed('another-app', [[unrelatedPet, 'unrelated cache']]);
  const caches = {
    keys: async () => [...storage.keys()],
    delete: async (name) => { events.push(`delete:${name}`); return storage.delete(name); },
    match: async (request, { cacheName } = {}) => {
      const url = urlKey(request);
      if (cacheName === oldName && url === unreadablePet) throw new Error('Cache read failed');
      for (const name of cacheName ? [cacheName] : storage.keys()) {
        const response = storage.get(name)?.get(url);
        if (response) return response.clone();
      }
    },
    open: async (name) => {
      if (!storage.has(name)) storage.set(name, new Map());
      const data = storage.get(name);
      return {
        match: async (request) => data.get(urlKey(request))?.clone(),
        put: async (request, response) => {
          const url = urlKey(request);
          if (options.copyFailure && url === sharedPet) throw new Error('Quota exceeded');
          if (options.copyFailure && url === olderPet) await new Promise((resolve) => setTimeout(resolve, 10));
          events.push(`put:${url}`);
          data.set(url, response.clone());
        },
        addAll: async (requests) => {
          const results = await Promise.allSettled(requests.map(network));
          const failure = results.find((result) => result.status === 'rejected');
          if (failure) throw failure.reason;
          if (results.some((result) => !result.value.ok)) throw new Error('Invalid response');
          requests.forEach((request, index) => data.set(urlKey(request), results[index].value.clone()));
        },
      };
    },
  };
  vm.runInNewContext(source, {
    self: {
      addEventListener: (name, handler) => listeners[name] = handler,
      location: { origin: 'https://koda.test' },
      skipWaiting: async () => events.push('skipWaiting'),
      clients: {
        claim: async () => { if (options.claimFailure) throw new Error('Claim failed'); events.push('claim'); },
        matchAll: async () => options.clients || [],
      },
    },
    caches, fetch: network, Request: WorkerRequest, URL, Response, AbortController, MessageChannel,
    setTimeout: (callback, delay) => { deadlines.push(delay); return setTimeout(callback, delay); }, clearTimeout,
  });
  async function run(name) {
    let pending;
    listeners[name]({ waitUntil: (promise) => pending = promise });
    await pending;
  }
  async function request(mode, pathname, method = 'GET') {
    let result;
    listeners.fetch({ request: { method, mode, url: `https://koda.test${pathname}` }, respondWith: promise => result = promise });
    return result;
  }
  return { storage, downloads, events, deadlines, run, request, oldName, listeners };
}

async function testInstallation() {
  const successful = installationHarness();
  await successful.run('install');
  const downloaded = successful.downloads.map(({ url }) => url);
  for (const url of [sharedPet, sharedJs, olderPet]) assert.ok(!downloaded.includes(url), `reused ${url}`);
  for (const url of ['/', '/manifest.webmanifest', '/pwa-icon-192.png', newPet, unreadablePet, invalidPet, unrelatedPet, ...mutableFiles]) {
    assert.ok(downloaded.includes(url), `downloaded ${url}`);
    assert.equal(await successful.storage.get(currentName).get(url).clone().text(), url === '/' ? html : `fresh:${url}`);
  }
  assert.ok(successful.downloads.every(({ cache }) => cache === 'reload'));
  assert.equal(await successful.storage.get(currentName).get(sharedPet).clone().text(), 'shared pet');
  assert.equal(successful.storage.get(currentName).size, precache.length);
  assert.ok(successful.storage.has(successful.oldName), 'old cache survives install');
  assert.ok(successful.events.includes('skipWaiting'));
  await successful.run('activate');
  assert.ok(!successful.storage.has(successful.oldName));
  assert.ok(!successful.storage.has('koda-offline-older'));
  assert.ok(successful.storage.has('another-app'));
  assert.ok(successful.events.indexOf('claim') < successful.events.indexOf(`delete:${successful.oldName}`));
  assert.ok(!precache.includes('/sw.js'), 'worker itself is not precached');

  for (const options of [{ blocked: newPet }, { httpFailure: newPet }, { offline: true }, { copyFailure: true }, { shell: '<html>stale deployment</html>' }, { assetHtml: newPet }]) {
    const failed = installationHarness(options);
    await assert.rejects(failed.run('install'));
    assert.ok(!failed.storage.has(currentName), 'failed cache removed');
    assert.ok(failed.storage.has(failed.oldName), 'old cache preserved');
    assert.equal(await failed.storage.get(failed.oldName).get('/').clone().text(), 'old shell');
    assert.ok(!failed.events.includes('skipWaiting'), 'failed worker cannot replace old worker');
    assert.equal(failed.events.at(-1), `delete:${currentName}`, 'no late writes after cleanup');
    // A later retry of the same worker starts clean and can finish.
    Object.keys(options).forEach((key) => delete options[key]);
    await failed.run('install');
    assert.equal(failed.storage.get(currentName).size, precache.length);
  }

  const incomplete = installationHarness();
  await incomplete.run('install');
  incomplete.storage.get(currentName).delete(sharedPet);
  await assert.rejects(incomplete.run('activate'), /Incomplete offline cache/);
  assert.ok(incomplete.storage.has(incomplete.oldName));
  assert.ok(!incomplete.events.includes('claim'));

  const claimFailure = installationHarness({ claimFailure: true });
  await claimFailure.run('install');
  await assert.rejects(claimFailure.run('activate'), /Claim failed/);
  assert.ok(claimFailure.storage.has(claimFailure.oldName));
  const knownClient = installationHarness({ clients: [{ postMessage: (_message, ports) => ports[0].postMessage({ buildId: 'previous' }) }] });
  await knownClient.run('install');
  await knownClient.run('activate');
  assert.ok(knownClient.storage.has(knownClient.oldName), 'known open build retained');
  assert.ok(!knownClient.storage.has('koda-offline-older'), 'unused older build cleaned even with open windows');
  console.log('Offline install: hash reuse, fresh mutable resources, network fallback, failed install cleanup, retry and activation guards PASS');
}
async function testServing() {
  const options = { clients: [{ id: 'old-tab' }] };
  const worker = installationHarness(options);
  await worker.run('install');
  await worker.run('activate');
  assert.ok(worker.storage.has(worker.oldName), 'open old page keeps its lazy chunks');
  let reportedBuild;
  worker.listeners.message({ data: { type: 'KODA_GET_BUILD' }, ports: [{ postMessage: value => reportedBuild = value.buildId }] });
  assert.equal(reportedBuild, buildId);

  options.offline = true;
  assert.equal(await (await worker.request('navigate', '/?source=pwa')).text(), html, 'fallback belongs to active worker, not older cache');
  assert.equal(await (await worker.request('cors', '/manifest.webmanifest')).text(), 'fresh:/manifest.webmanifest');
  const before = worker.downloads.length;
  assert.equal(await (await worker.request('cors', sharedJs)).text(), 'shared bundle');
  assert.equal(await (await worker.request('cors', newPet.replace(hash, oldHash))).text(), 'different version', 'old page lazy asset survives activation offline');
  assert.equal(worker.downloads.length, before, 'hashed assets need no network');
  const corruptedJs = `/_expo/static/js/web/index-${oldHash}.js`;
  const corruptedPng = `/assets/old-image.${oldHash}.png`;
  for (const url of [corruptedJs, corruptedPng]) {
    worker.storage.get(worker.oldName).set(url, new Response('<html>SPA fallback</html>', { headers: { 'Content-Type': 'text/html' } }));
    assert.equal((await worker.request('cors', url)).status, 0, 'offline cannot serve cached HTML as JS or image');
    options.offline = false;
    assert.equal(await (await worker.request('cors', url)).text(), `fresh:${url}`, 'corrupt old asset falls through to network');
    options.assetHtml = url;
    assert.equal((await worker.request('cors', url)).status, 0, 'SPA fallback from network is also rejected for hashed assets');
    delete options.assetHtml;
    options.offline = true;
  }
  worker.storage.get(currentName).set(sharedJs, new Response('<html>corrupt current asset</html>', { headers: { 'Content-Type': 'text/html' } }));
  assert.equal(await (await worker.request('cors', sharedJs)).text(), 'shared bundle', 'invalid current asset can fall back to valid old immutable asset');

  options.offline = false;
  options.shell = '<html>newer build not yet installed</html>';
  assert.equal(await (await worker.request('navigate', '/')).text(), options.shell);
  assert.equal(worker.downloads.at(-1).cache, 'no-store', 'navigation bypasses browser HTTP cache');
  assert.equal(worker.deadlines.at(-1), 8000, 'slow navigation no longer falls back after 1.5 seconds');
  assert.equal(await worker.storage.get(currentName).get('/').clone().text(), html, 'new shell cannot poison installed offline build');
  options.offline = true;
  assert.equal(await (await worker.request('navigate', '/')).text(), html);
  options.offline = false;
  options.httpFailure = '/';
  assert.equal(await (await worker.request('navigate', '/')).text(), html, 'HTTP failure falls back to installed shell');
  assert.equal(await worker.request('navigate', '/api/account'), undefined, 'API is not cached');
  assert.equal(await worker.request('navigate', '/', 'POST'), undefined, 'writes are not intercepted');
  worker.storage.get(currentName).delete('/');
  options.offline = true;
  assert.equal((await worker.request('navigate', '/')).status, 503, 'evicted active shell must not silently use unrelated or old HTML');
  console.log('Offline serving: build isolation, deployment race, retained old chunks, fresh navigation, error fallback PASS');
}
(async () => {
  await testInstallation();
  await testServing();
  await require('./test-service-worker.cjs')();
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  assert.equal(path.dirname(path.resolve(output)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(output).startsWith('koda-offline-test-'));
  fs.rmSync(output, { recursive: true, force: true });
});
