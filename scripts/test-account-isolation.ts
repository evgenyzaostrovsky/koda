import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { initialGoals, initialHabits, initialTasks, defaultJournalEntry } from '../src/features/koda/constants';
import { normalizeStoredKodaState, isJournalEntryWorthSyncing } from '../src/features/koda/persistence';

const filename = resolve('src/features/koda/KodaApp.tsx');
const appRequire = createRequire(filename);
const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const flush = () => new Promise<void>(done => setImmediate(done));
function deferred() { let release!: () => void; const promise = new Promise<void>(done => { release = done; }); return { promise, release }; }
type Element = { type: string | Function; props: any; key?: string };
type Instance = { key?: string; slots: any[]; cleanups: Map<number, () => void>; disposed: boolean };

// Executes the real component with deterministic hook scheduling and fake local/cloud adapters.
// It exercises orchestration and keyed remounts, not a browser or a React DOM renderer.
function harness(options: { data?: Map<string, string>; cloud?: boolean; offline?: boolean; owner?: string | null; blockOwner?: string } = {}) {
  const data = options.data ?? new Map<string, string>();
  const reads: string[] = [], writes: Array<{ table: string; action: string; value: any; filters: Record<string, unknown> }> = [];
  const pullGate = deferred();
  let owner = options.owner, current: Instance | undefined, tree: Element, cursor = 0, scheduled = false;
  let effects: Array<() => void> = [], serial = 0;
  const timeouts = new Map<number, () => void>();
  const events = new Map<string, Set<() => void>>();
  const network = { onLine: !options.offline };
  const remote = new Map<string, any>();
  function schedule(instance: Instance) {
    if (instance.disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!current?.disposed) render(); });
  }
  const react = {
    useState(initial: any) {
      const instance = current!, index = cursor++;
      if (!(index in instance.slots)) instance.slots[index] = typeof initial === 'function' ? initial() : initial;
      return [instance.slots[index], (value: any) => {
        if (instance.disposed) return;
        const next = typeof value === 'function' ? value(instance.slots[index]) : value;
        if (!Object.is(next, instance.slots[index])) { instance.slots[index] = next; schedule(instance); }
      }];
    },
    useRef(initial: any) { const index = cursor++; return current!.slots[index] ?? (current!.slots[index] = { current: initial }); },
    useMemo(make: () => any, deps: any[]) {
      const index = cursor++, old = current!.slots[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old.deps[i]))) current!.slots[index] = { deps, value: make() };
      return current!.slots[index].value;
    },
    useEffect(effect: () => void | (() => void), deps: any[]) {
      const instance = current!, index = cursor++, old = instance.slots[index];
      if (!old || deps.some((dep, i) => !Object.is(dep, old[i]))) {
        instance.slots[index] = deps;
        effects.push(() => { instance.cleanups.get(index)?.(); const cleanup = effect(); if (cleanup) instance.cleanups.set(index, cleanup); else instance.cleanups.delete(index); });
      }
    },
    useLayoutEffect(effect: () => void | (() => void), deps: any[]) { react.useEffect(effect, deps); },
  };
  const storage = {
    async getItem(key: string) { reads.push(key); return data.get(key) ?? null; },
    async setItem(key: string, value: string) { data.set(key, value); },
  };
  const client = {
    channel: () => ({ on() { return this; }, subscribe() { return this; } }), removeChannel() {},
    from(table: string) {
      const filters: Record<string, unknown> = {}; let action = 'select', value: any;
      const query: any = {
        select() { return query; }, order() { return query; }, maybeSingle() { return query; },
        eq(key: string, v: unknown) { filters[key] = v; return query; }, in(key: string, v: unknown) { filters[key] = v; return query; },
        upsert(v: any) { action = 'upsert'; value = v; return query; },
        insert(v: any) { action = 'insert'; value = v; return query; },
        update(v: any) { action = 'update'; value = v; return query; },
        delete() { action = 'delete'; return query; },
        then(yes: (v: any) => any, no: (e: unknown) => any) {
          return (async () => {
            const id = filters.user_id ?? (typeof filters.owner_key === 'string' ? filters.owner_key.replace(/^user:/, '') : filters.id);
            if (action !== 'select') { writes.push({ table, action, value, filters: { ...filters } }); return { data: { user_id: id }, error: null }; }
            if (id === options.blockOwner) await pullGate.promise;
            if (!network.onLine) throw new Error('fixture offline');
            return { data: remote.get(`${table}:${id}`) ?? (table === 'profiles' || table === 'user_app_state' ? null : []), error: null };
          })().then(yes, no);
        },
      }; return query;
    },
  };
  const componentModules = new Set(['./usePomodoroTimer', './components/WorkspaceIdentity']);
  const modules: Record<string, any> = {
    react, 'react/jsx-runtime': { jsx: (type: any, props: any, key?: string) => ({ type, props, key }), jsxs: (type: any, props: any, key?: string) => ({ type, props, key }) },
    '@react-native-async-storage/async-storage': storage,
    '../../config/env': { isSupabaseConfigured: () => Boolean(options.cloud) }, '../../lib/supabase': { supabase: client },
    'react-native': { AppState: { addEventListener: () => ({ remove() {} }) }, useWindowDimensions: () => ({ width: 1200 }), SafeAreaView: 'SafeAreaView', View: 'View' },
    './styles': { styles: {} }, './theme': { applyKodaTheme() {}, resolveKodaThemeId: (id: string) => id },
    './usePersistentChat': { usePersistentChat: () => ({ chat: [] }) },
    './components/WidgetShell': { WidgetShell: 'WidgetShell', useWidgetLayout: () => ({ layout: {}, ready: true }) },
    './components/WorkspaceIdentity': { accountDisplayName: () => 'Fixture' },
  };
  const exported: any = {};
  runInNewContext(source, {
    exports: exported, require: (id: string) => {
      if (modules[id]) return modules[id];
      if (id.startsWith('./components/') || id.startsWith('./screens/') || componentModules.has(id) || id === 'expo-status-bar' || id === 'lucide-react-native') return new Proxy({}, { get: (_, key) => key });
      return appRequire(id);
    }, navigator: network, URLSearchParams, console,
    window: { location: { hash: '#habits' }, addEventListener: (name: string, fn: () => void) => { if (!events.has(name)) events.set(name, new Set()); events.get(name)!.add(fn); }, removeEventListener: (name: string, fn: () => void) => events.get(name)?.delete(fn) },
    setInterval: () => ++serial, clearInterval() {},
    setTimeout: (fn: () => void) => { const id = ++serial; timeouts.set(id, fn); return id; }, clearTimeout: (id: number) => timeouts.delete(id),
  });
  function render() {
    const root: Element = exported.KodaApp({ userId: owner });
    if (!current || current.key !== root.key) {
      if (current) { current.disposed = true; current.cleanups.forEach(fn => fn()); }
      current = { key: root.key, slots: [], cleanups: new Map(), disposed: false };
    }
    cursor = 0; effects = []; tree = (root.type as Function)(root.props);
    const pending = effects; effects = []; pending.forEach(fn => fn());
  }
  function find(type: string, element: any = tree): any {
    if (!element || typeof element !== 'object') return undefined;
    if (Array.isArray(element)) return element.map(child => find(type, child)).find(Boolean);
    if (element.type === type) return element.props;
    return find(type, element.props?.children ?? null);
  }
  render();
  return { data, reads, writes, remote, find,
    setOwner(id: string | null) { owner = id; render(); }, releasePull: pullGate.release,
    retry() { events.get('online')?.forEach(fn => fn()); },
    runTimers() { const pending = [...timeouts.values()]; timeouts.clear(); pending.forEach(fn => fn()); },
    dispose() { current!.disposed = true; current!.cleanups.forEach(fn => fn()); },
  };
}
const appKey = (owner: string) => `koda:appState:v1:${owner}`;
const plannerKey = (owner: string) => `koda:plannerItems:v1:${owner}`;
const planner = { id: 'fixture-plan', date: '2099-01-01', time: '', title: 'Private A plan', done: false };
const owned = normalizeStoredKodaState({ goals: [{ id: 'goal-1', title: 'Existing goal with a legacy ID' }], habits: [{ id: 'habit-1', title: 'Existing habit', target: 'Daily' }] })!;

async function main() {
  assert.deepEqual([initialGoals, initialHabits, initialTasks], [[], [], []]);
  assert.equal(isJournalEntryWorthSyncing(defaultJournalEntry), false);
  for (const raw of [{}, { goals: null, habits: null }, { goals: [null], habits: [null] }]) {
    const state = normalizeStoredKodaState(raw)!;
    assert.equal(state.goals.length, 0); assert.equal(state.habits.length, 0);
  }
  assert.equal(owned.goals.length, 1, 'Existing legacy-ID records are preserved');
  const data = new Map([[appKey('a'), JSON.stringify(owned)], [plannerKey('a'), JSON.stringify([planner])], ['koda:plannerItems:v1', JSON.stringify([{ ...planner, title: 'Private guest plan' }])]]);
  const h = harness({ data, owner: 'a', offline: true }); await flush();
  assert.equal(h.find('WidgetDesktop').goals[0].title, owned.goals[0].title);
  const aBefore = data.get(appKey('a'));
  h.setOwner('b'); await flush();
  assert.equal(h.find('WidgetDesktop').goals.length, 0); assert.equal(h.find('WidgetDesktop').habits.length, 0); assert.equal(h.find('WidgetDesktop').items.length, 0);
  assert.ok(!h.reads.includes('koda:plannerItems:v1'), 'Signed-in accounts must not import guest storage');
  assert.equal(data.get(appKey('a')), aBefore, 'Switching must not overwrite A');
  h.setOwner('a'); await flush(); assert.equal(h.find('WidgetDesktop').items[0].title, planner.title); h.dispose();
  const reload = harness({ data, owner: 'b', offline: true }); await flush(); assert.equal(reload.find('WidgetDesktop').goals.length, 0); reload.dispose();

  const late = harness({ owner: 'a', cloud: true, blockOwner: 'a' });
  late.remote.set('user_app_state:a', owned); late.remote.set('planner_events:a', [{ id: planner.id, event_date: planner.date, title: planner.title }]);
  await flush(); late.setOwner('b'); await flush(); late.releasePull(); await flush();
  assert.equal(late.find('WidgetDesktop').goals.length, 0); assert.equal(late.find('WidgetDesktop').items.length, 0);
  assert.equal(JSON.parse(late.data.get(appKey('b'))!).goals.length, 0); late.dispose();

  const queued = new Map([[plannerKey('a'), JSON.stringify([planner])], ['koda:syncQueue:v1:a', '["planner"]'], ['koda:plannerDeleted:v1:a', '["removed-a"]'], ['koda:calendarKey:v1', 'old-guest-calendar']]);
  const pending = harness({ data: queued, owner: 'a', cloud: true }); await flush(); pending.setOwner('b'); await flush(); pending.runTimers(); await flush();
  assert.equal(pending.writes.length, 0, 'A pending debounce must not run for B');
  assert.deepEqual(JSON.parse(pending.data.get('koda:syncQueue:v1:b')!), []);
  pending.setOwner('a'); await flush(); pending.runTimers(); await flush();
  const push = pending.writes.find(write => write.table === 'planner_events' && write.action === 'upsert')!;
  assert.ok(push); assert.ok(push.value.every((row: any) => row.owner_key === 'user:a'), 'Never mirror private items into a guest calendar');
  const deletion = pending.writes.find(write => write.action === 'delete')!;
  assert.equal(deletion.filters.owner_key, 'user:a'); assert.deepEqual(Array.from(deletion.filters.id as string[]), ['removed-a']);
  assert.equal(JSON.parse(pending.data.get(plannerKey('a'))!)[0].title, planner.title); pending.dispose();
  console.log('Account isolation: empty defaults, preserved records, offline switching/reload, guest isolation, stale pulls, pending queues and owner-scoped planner writes PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
