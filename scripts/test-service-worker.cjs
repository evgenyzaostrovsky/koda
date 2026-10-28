const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/serviceWorker.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;

function harness(options = {}) {
  const listeners = new Map();
  const timers = new Map();
  let timerId = 0;
  let now = 0;
  let updates = 0;
  let registrations = 0;
  let reloads = 0;
  let registerOptions;
  const add = (target) => (name, handler) => {
    const key = `${target}:${name}`;
    listeners.set(key, [...listeners.get(key) || [], handler]);
  };
  const dispatch = (target, name, event) => { for (const handler of listeners.get(`${target}:${name}`) || []) handler(event); };
  const registration = { update: async () => { updates++; if (options.updateFailure) throw Error('Offline'); } };
  const serviceWorker = {
    controller: null,
    addEventListener: add('sw'),
    register: async (_url, settings) => {
      registrations++;
      registerOptions = settings;
      if (options.registerFailure) throw Error('Offline');
      return registration;
    },
  };
  const window = {
    addEventListener: add('window'),
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; },
    clearTimeout: (id) => timers.delete(id),
    location: { reload: () => { reloads++; } },
  };
  const document = {
    visibilityState: 'visible',
    querySelector: () => options.noMeta ? null : { content: 'build-a' },
    addEventListener: add('document'),
  };
  const navigator = { serviceWorker, onLine: true };
  class MessageChannel {
    constructor() {
      this.port1 = { close() {}, onmessage: null };
      this.port2 = { close() {}, answer: (data) => queueMicrotask(() => this.port1.onmessage?.({ data })) };
    }
  }
  const exports = {};
  vm.runInNewContext(source, {
    require: () => ({ Platform: { OS: options.native ? 'ios' : 'web' } }), exports,
    window, document, navigator, MessageChannel, Date: { now: () => now },
  });
  const controller = (buildId) => ({ postMessage: (_message, ports) => ports[0].answer({ buildId }) });
  return {
    register: exports.registerServiceWorker, document, navigator, controller, dispatch, listeners, timers,
    advance: () => { now += 60_001; },
    stats: () => ({ updates, registrations, reloads, registerOptions }),
  };
}
const flush = () => new Promise(resolve => setImmediate(resolve));

module.exports = async function testServiceWorker() {
  const idle = harness({ updateFailure: true });
  await idle.register();
  await idle.register();
  await flush();
  assert.equal(idle.stats().registrations, 1);
  assert.equal(idle.stats().registerOptions.updateViaCache, 'none');
  let reportedBuild;
  idle.dispatch('sw', 'message', { data: { type: 'KODA_GET_PAGE_BUILD' }, ports: [{ postMessage: value => reportedBuild = value.buildId }] });
  assert.equal(reportedBuild, 'build-a', 'page reports its actual HTML build for safe cache retention');
  idle.dispatch('window', 'online');
  await flush();
  assert.equal(idle.stats().updates, 2, 'failed update retries online without waiting for focus throttle');
  idle.navigator.serviceWorker.controller = idle.controller('older-than-page');
  idle.dispatch('window', 'focus');
  await flush();
  assert.equal(idle.stats().reloads, 0, 'focus must not mistake an older controller for a new release');
  idle.navigator.serviceWorker.controller = idle.controller('build-b');
  idle.dispatch('sw', 'controllerchange');
  await flush();
  assert.equal(idle.stats().reloads, 1, 'untouched stale launch switches to installed build');
  idle.dispatch('sw', 'controllerchange');
  await flush();
  assert.equal(idle.stats().reloads, 1, 'reload cannot loop within one document');
  assert.equal(idle.timers.size, 0);
  const timedOut = harness();
  await timedOut.register();
  timedOut.navigator.serviceWorker.controller = timedOut.controller('build-b');
  timedOut.dispatch('sw', 'controllerchange');
  for (const callback of timedOut.timers.values()) callback();
  await flush(); // Simulated queued reply arrives after port timeout/close.
  assert.equal(timedOut.stats().reloads, 0, 'late version reply after timeout is ignored');
  const superseded = harness();
  await superseded.register();
  superseded.navigator.serviceWorker.controller = superseded.controller('build-b');
  superseded.dispatch('sw', 'controllerchange');
  superseded.navigator.serviceWorker.controller = superseded.controller('build-c');
  await flush();
  assert.equal(superseded.stats().reloads, 0, 'reply from superseded controller is ignored');

  for (const event of ['pointerdown', 'touchstart', 'click', 'keydown', 'input', 'change', 'compositionstart']) {
    const edited = harness();
    await edited.register();
    edited.navigator.serviceWorker.controller = edited.controller('build-b');
    edited.dispatch('sw', 'controllerchange');
    edited.dispatch('window', event); // Input during the asynchronous version reply.
    await flush();
    edited.document.visibilityState = 'hidden';
    edited.dispatch('document', 'visibilitychange');
    edited.document.visibilityState = 'visible';
    edited.dispatch('document', 'visibilitychange');
    edited.dispatch('window', 'focus');
    await flush();
    assert.equal(edited.stats().reloads, 0, `${event} prevents losing user work`);
  }
  const fresh = harness();
  await fresh.register();
  fresh.navigator.serviceWorker.controller = fresh.controller('build-a');
  fresh.dispatch('sw', 'controllerchange');
  await flush();
  assert.equal(fresh.stats().reloads, 0, 'fresh page does not reload on first install');
  fresh.document.visibilityState = 'hidden';
  fresh.navigator.serviceWorker.controller = fresh.controller('build-b');
  fresh.dispatch('sw', 'controllerchange');
  await flush();
  assert.equal(fresh.stats().reloads, 0);
  fresh.document.visibilityState = 'visible';
  fresh.advance();
  fresh.dispatch('document', 'visibilitychange');
  await flush();
  assert.equal(fresh.stats().reloads, 1, 'hidden untouched page switches on return');
  assert.equal(fresh.stats().updates, 2, 'return to app checks for new deployment');

  const failure = { registerFailure: true };
  const retry = harness(failure);
  assert.equal(await retry.register(), null);
  failure.registerFailure = false;
  retry.dispatch('window', 'online');
  await flush();
  assert.equal(retry.stats().registrations, 2, 'offline registration retries when connection returns');
  assert.equal(retry.listeners.get('sw:controllerchange').length, 1);
  retry.advance();
  retry.navigator.onLine = false;
  retry.dispatch('window', 'focus');
  await flush();
  assert.equal(retry.stats().updates, 1, 'offline resume does not issue doomed update');
  const legacy = harness({ noMeta: true });
  await legacy.register();
  legacy.navigator.serviceWorker.controller = legacy.controller('build-b');
  legacy.dispatch('sw', 'controllerchange');
  legacy.dispatch('window', 'focus');
  await flush();
  assert.equal(legacy.stats().reloads, 0, 'legacy document without a build identity is never forced to reload');
  const native = harness({ native: true });
  assert.equal(await native.register(), null);
  assert.equal(native.stats().registrations, 0);
  console.log('Worker client: fresh/stale launches, input protection, resume, retry, offline errors and native guard PASS');
};
