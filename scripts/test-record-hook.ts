import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { accountRecordValues, bootstrapAccountRecords, readAccountRecordDomain } from '../src/features/koda/accountRecordSync';
import { loadLegacyRecords, mirrorAccountRecords } from '../src/features/koda/accountRecordLegacy';

const filename = resolve('src/features/koda/useSyncedRecords.ts');
const realRequire = createRequire(filename);
const source = ts.transpileModule(readFileSync(filename, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const copy = <T>(value: T): T => structuredClone(value);
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise<void>(done => setImmediate(done)); };
function deferred() { let release!: () => void; const promise = new Promise<void>(done => { release = done; }); return { promise, release }; }
type Item = { id: string; title: string; date: string; time: string; done: boolean };
const item = (id: string, title = id): Item => ({ id, title, date: '2099-01-01', time: '', done: false });
const localKey = (owner = 'a') => `koda:records:v2:${owner}:planner`;
const legacyKey = 'koda:plannerItems:v1';

class Backend {
  rows = new Map<string, any>();
  legacy = new Map<string, any[]>();
  writes: Array<{ table: string; action: string; payload: any; owner: string }> = [];
  reads = 0;
  revision = 0;
  readError = false;
  mirrorError: any = null;
  gate?: { table: string; action: string; start: ReturnType<typeof deferred>; stop: ReturnType<typeof deferred> };
  pause(table = 'user_app_state', action = 'read') {
    const gate = { table, action, start: deferred(), stop: deferred() }; this.gate = gate;
    return { started: gate.start.promise, release: gate.stop.release };
  }
  seed(owner: string, records: Item[]) {
    this.rows.set(owner, { user_id: owner, updated_at: `v${++this.revision}`, profile: { displayName: owner, __kodaRecords: { version: 1, ownerId: owner, domains: { planner: bootstrapAccountRecords(owner, 'planner', records) } } } });
  }
  values(owner = 'a') { return accountRecordValues<Item>(readAccountRecordDomain(this.rows.get(owner)?.profile, owner, 'planner')!); }
  client(session: { owner: string | null }) {
    return {
      auth: { async getSession() { return { data: { session: session.owner ? { user: { id: session.owner } } : null }, error: null }; } },
      from: (table: string) => {
        let action = 'read', payload: any;
        const filters: Record<string, any> = {};
        const query: any = {
          select: () => query, maybeSingle: () => query,
          eq: (key: string, value: any) => { filters[key] = value; return query; },
          in: (key: string, value: any) => { filters[key] = value; return query; },
          insert: (value: any) => { action = 'insert'; payload = copy(value); return query; },
          update: (value: any) => { action = 'update'; payload = copy(value); return query; },
          upsert: (value: any) => { action = 'upsert'; payload = copy(value); return query; },
          delete: () => { action = 'delete'; return query; },
          then: (yes: any, no: any) => (async () => {
            const owner = filters.user_id ?? filters.owner_key?.replace(/^user:/, '') ?? payload?.user_id ?? session.owner;
            const read = table === 'user_app_state' ? copy(this.rows.get(owner) ?? null) : copy(this.legacy.get(`${table}:${owner}`) ?? []);
            if (this.gate?.table === table && this.gate.action === action) {
              const gate = this.gate; this.gate = undefined; gate.start.release(); await gate.stop.promise;
            }
            if (action === 'read') { this.reads++; return { data: this.readError ? null : read, error: this.readError ? new Error('network failed') : null }; }
            if (table !== 'user_app_state') {
              this.writes.push({ table, action, payload, owner });
              return { data: [], error: this.mirrorError };
            }
            const existing = this.rows.get(owner);
            if (action === 'insert' && existing) return { data: null, error: { code: '23505' } };
            if (action === 'update' && existing?.updated_at !== filters.updated_at) return { data: null, error: null };
            this.writes.push({ table, action, payload, owner });
            this.rows.set(owner, { ...existing, ...payload, updated_at: `v${++this.revision}` });
            return { data: { user_id: owner }, error: null };
          })().then(yes, no),
        };
        return query;
      },
    };
  }
}

/** Runs the actual hook's effects and closures with deterministic React scheduling. */
function mount(db: Backend, options: { data?: Map<string, string>; owner?: string; online?: boolean } = {}) {
  const data = options.data ?? new Map<string, string>();
  const session = { owner: options.owner ?? 'a' } as { owner: string | null };
  let props = { owner: session.owner, domain: 'planner', legacyKey, legacyDeletedKey: 'koda:plannerDeleted:v1', online: options.online ?? true, pullToken: 0, retryToken: 0 };
  const slots: any[] = [], cleanups = new Map<number, () => void>();
  let cursor = 0, disposed = false, scheduled = false, effects: Array<() => void> = [], result: any, renders = 0;
  const storage = { failures: 0, failAcknowledgement: false, writes: 0,
    async getItem(key: string) { return data.get(key) ?? null; },
    async setItem(key: string, value: string) {
      storage.writes++;
      if (storage.failures > 0) { storage.failures--; throw new Error('disk full'); }
      if (storage.failAcknowledgement && JSON.parse(value).patches.length === 0) { storage.failAcknowledgement = false; throw new Error('ack write failed'); }
      data.set(key, value);
    },
  };
  function schedule() {
    if (disposed || scheduled) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!disposed) render(); });
  }
  const react = {
    useState(initial: any) {
      const i = cursor++;
      if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
      return [slots[i], (value: any) => { if (disposed) return; const next = typeof value === 'function' ? value(slots[i]) : value; if (!Object.is(next, slots[i])) { slots[i] = next; schedule(); } }];
    },
    useRef(initial: any) { const i = cursor++; return slots[i] ?? (slots[i] = { current: initial }); },
    useEffect(effect: () => any, deps: any[]) {
      const i = cursor++, previous = slots[i];
      if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) {
        slots[i] = deps;
        effects.push(() => { cleanups.get(i)?.(); const cleanup = effect(); if (cleanup) cleanups.set(i, cleanup); else cleanups.delete(i); });
      }
    },
  };
  const exported: any = {};
  runInNewContext(source, { exports: exported, require: (name: string) => {
    if (name === 'react') return react;
    if (name === '@react-native-async-storage/async-storage') return storage;
    if (name === '../../config/env') return { isSupabaseConfigured: () => true };
    if (name === '../../lib/supabase') return { supabase: db.client(session) };
    return realRequire(name);
  }, console });
  function render() {
    assert.ok(++renders < 300, 'hook must not spin in a retry render loop');
    cursor = 0; effects = []; result = exported.useSyncedRecords(props);
    const pending = effects; effects = []; pending.forEach(effect => effect());
  }
  render();
  return { data, session, storage, get value() { return result; },
    edit(title: string, id = 'one') { result.update((items: Item[]) => items.map(record => record.id === id ? { ...record, title } : record)); },
    remove(id: string) { result.update((items: Item[]) => items.filter(record => record.id !== id)); },
    retry() { props = { ...props, retryToken: props.retryToken + 1 }; render(); },
    pull() { props = { ...props, pullToken: props.pullToken + 1 }; render(); },
    online(value: boolean) { props = { ...props, online: value }; render(); },
    switchOwner(owner: string) { session.owner = owner; props = { ...props, owner }; render(); },
    dispose() { disposed = true; cleanups.forEach(cleanup => cleanup()); },
  };
}

async function main() {
  const db = new Backend(); db.seed('a', [item('one'), item('two')]);
  const a = mount(db); await flush();
  assert.equal(a.value.ready, true); assert.equal(a.value.cloudReady, true);
  a.online(false); a.edit('Offline edit'); await flush();
  assert.equal(a.value.pending, true);
  const saved = JSON.parse(a.data.get(localKey())!);
  assert.equal(saved.patches.length, 1);
  a.dispose();
  const reload = mount(db, { data: a.data, online: false }); await flush();
  assert.equal(reload.value.items[0].title, 'Offline edit'); assert.equal(reload.value.pending, true);
  const b = mount(db); await flush();
  b.edit('Device B other', 'two'); await flush();
  reload.online(true); await flush();
  assert.deepEqual(db.values().map(row => row.title), ['Offline edit', 'Device B other']);
  assert.equal(reload.value.pending, false);
  b.pull(); await flush(); assert.equal(b.value.items[0].title, 'Offline edit');

  const gate = db.pause('user_app_state', 'update');
  reload.edit('First in flight'); await gate.started;
  reload.edit('Newer local edit'); await flush(); gate.release(); await flush();
  assert.equal(db.values()[0].title, 'Newer local edit'); assert.equal(reload.value.pending, false);
  assert.equal(JSON.parse(reload.data.get(localKey())!).patches.length, 0);

  reload.online(false); b.remove('one'); await flush(); reload.edit('Stale resurrection'); await flush();
  reload.online(true); await flush();
  assert.deepEqual(db.values().map(row => row.id), ['two']);
  assert.deepEqual(Array.from(reload.value.items, (row: Item) => row.id), ['two']);
  b.dispose(); reload.dispose();

  const failingDb = new Backend(); failingDb.seed('a', [item('one')]);
  const failing = mount(failingDb); await flush();
  failing.storage.failures = 10;
  failing.edit('Survive storage failure'); await flush();
  assert.equal(failing.value.pending, true); assert.equal(failingDb.values()[0].title, 'one');
  const failedWriteCount = failing.storage.writes; await flush(); assert.equal(failing.storage.writes, failedWriteCount, 'no automatic busy retry loop');
  failing.storage.failures = 0; failing.retry(); await flush();
  assert.equal(failingDb.values()[0].title, 'Survive storage failure'); assert.equal(failing.value.pending, false);
  failing.storage.failAcknowledgement = true;
  failing.edit('Ack disk failure'); await flush();
  assert.equal(failingDb.values()[0].title, 'Ack disk failure'); assert.equal(failing.value.pending, true, 'failed durable acknowledgement keeps queue');
  failing.retry(); await flush(); assert.equal(failing.value.pending, false);
  failingDb.mirrorError = new Error('mirror offline');
  failing.edit('Canonical despite mirror'); await flush();
  assert.equal(failingDb.values()[0].title, 'Canonical despite mirror'); assert.equal(failing.value.pending, true);
  failingDb.mirrorError = null; failing.retry(); await flush(); assert.equal(failing.value.pending, false);
  failing.dispose();

  const logoutDb = new Backend(); logoutDb.seed('a', [item('one')]);
  const logout = mount(logoutDb); await flush();
  const readGate = logoutDb.pause(); logout.edit('Should stay queued'); await readGate.started;
  const writesBeforeLogout = logoutDb.writes.length;
  logout.session.owner = null; logout.dispose(); readGate.release(); await flush();
  assert.equal(logoutDb.writes.length, writesBeforeLogout, 'no CAS or mirror after stale read following logout');
  assert.equal(JSON.parse(logout.data.get(localKey())!).patches.length, 1);

  const switchDb = new Backend(); switchDb.seed('a', [item('one')]); switchDb.seed('b', [item('b', 'Private B')]);
  const switching = mount(switchDb); await flush(); const switchGate = switchDb.pause();
  switching.edit('Private A'); await switchGate.started; switching.switchOwner('b'); await flush(); switchGate.release(); await flush();
  assert.deepEqual(Array.from(switching.value.items, (row: Item) => row.title), ['Private B']);
  assert.equal(switchDb.values('a')[0].title, 'one');
  assert.equal(JSON.parse(switching.data.get(localKey('a'))!).patches.length, 1); switching.dispose();

  const recoveryDb = new Backend(); recoveryDb.seed('a', [item('one', 'Cloud')]);
  const recoveryData = new Map([[`${legacyKey}:a`, JSON.stringify([item('one', 'Old pending cache'), item('new', 'Offline create')])], ['koda:syncQueue:v1:a', '["planner"]']]);
  const recovery = mount(recoveryDb, { data: recoveryData }); await flush();
  assert.equal(recovery.value.recovery.length, 2); assert.equal(recoveryDb.values()[0].title, 'Cloud');
  recovery.edit('Must wait for choice'); await flush(); assert.equal(recoveryDb.values()[0].title, 'Cloud');
  recovery.value.recover(true); await flush();
  assert.deepEqual(recoveryDb.values().map(row => row.title), ['Old pending cache', 'Offline create']);
  assert.equal(recovery.value.recovery, null); recovery.dispose();
  const discarded = mount(recoveryDb, { data: new Map(recoveryData).set(localKey(), JSON.stringify({ ...JSON.parse(recoveryData.get(localKey())!), recovery: [item('one', 'Ignore local')] })) });
  await flush(); discarded.value.recover(false); await flush(); assert.equal(discarded.value.recovery, null); assert.equal(recoveryDb.values()[0].title, 'Old pending cache'); discarded.dispose();

  const notesDb = new Backend();
  const note = (id: string, title: string, updatedAt: string, deletedAt: string | null = null) => ({ id, userId: 'a', title, content: { type: 'doc', content: [] }, pinned: false, createdAt: '2026-01-01', updatedAt, deletedAt });
  notesDb.rows.set('a', { user_id: 'a', updated_at: 'v1', profile: { __kodaNotes: [note('fallback', 'Only fallback', '2026-02-01'), note('shared', 'Newer fallback', '2026-03-01'), note('deleted', 'Delete', '2026-01-01', '2026-01-01')] } });
  notesDb.legacy.set('notes:a', ['shared', 'deleted'].map(id => ({ id, title: 'Stale table', content: { type: 'doc', content: [] }, created_at: '2026-01-01', updated_at: '2026-02-01' })));
  const notes = await loadLegacyRecords(notesDb.client({ owner: 'a' }), 'a', 'notes');
  assert.equal(notes.length, 3); assert.equal(notes.find(row => row.id === 'shared')!.title, 'Newer fallback'); assert.ok((notes.find(row => row.id === 'deleted') as any).deletedAt);
  notesDb.mirrorError = { code: '42P01' }; await mirrorAccountRecords(notesDb.client({ owner: 'a' }), 'a', 'notes', notes, []);
  notesDb.mirrorError = { code: 'FETCH' }; await assert.rejects(mirrorAccountRecords(notesDb.client({ owner: 'a' }), 'a', 'notes', notes, []));
  notesDb.legacy.set('notes:a', [{ id: 'bad', content: 'bad json' }]);
  await assert.rejects(loadLegacyRecords(notesDb.client({ owner: 'a' }), 'a', 'notes'), 'malformed rows fail import instead of disappearing');
  const noNotesTable = { from: (table: string) => {
    const result = { data: null, error: table === 'notes' ? { code: '42P01' } : null };
    const query: any = { select: () => query, eq: () => query, maybeSingle: () => Promise.resolve(result), then: (yes: any, no: any) => Promise.resolve(result).then(yes, no) };
    return query;
  } };
  assert.deepEqual(await loadLegacyRecords(noNotesTable, 'a', 'notes'), [], 'confirmed absent notes table allows a fresh canonical document');
  const inaccessibleNotes = { from: (table: string) => {
    const result = table === 'notes' ? {data:null,error:{code:'FETCH'}} : {data:{profile:{__kodaNotes:[note('fallback','Saved fallback','2026-01-01')]}},error:null};
    const query: any = {select:()=>query,eq:()=>query,maybeSingle:()=>Promise.resolve(result),then:(yes:any,no:any)=>Promise.resolve(result).then(yes,no)};
    return query;
  }};
  await assert.rejects(loadLegacyRecords(inaccessibleNotes,'a','notes'),'network error must not initialize from an incomplete fallback');
  const mirrorRows: any[] = [];
  const oldPlanner = { from: () => ({ upsert: async (rows: any[]) => { mirrorRows.push(rows); return { error: mirrorRows.length === 1 ? { code: 'PGRST204', message: 'subtasks column missing' } : null }; } }) };
  await mirrorAccountRecords(oldPlanner, 'a', 'planner', [item('one') as any], []);
  assert.equal(mirrorRows.length, 2); assert.ok(!('subtasks' in mirrorRows[1][0])); assert.ok(!('failed' in mirrorRows[1][0]));
  console.log('record hook: real effects, offline reload, two devices, newer edits, disk retries, ack failure, logout/switch, recovery and legacy adapters PASS');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
