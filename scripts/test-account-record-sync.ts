import assert from 'node:assert/strict';
import {
  accountRecordValues, applyAccountRecordPatches, createAccountRecordPatches,
  readAccountRecordDomain, syncAccountRecordDomain,
  type AccountRecordDomain, type AccountRecordPatch,
} from '../src/features/koda/accountRecordSync';

type Row = { user_id: string; profile: Record<string, unknown>; updated_at: string; goals?: unknown[] };
type Item = { id: string; title: string; text?: string; done?: boolean; deletedAt?: string | null };
const copy = <T>(value: T): T => structuredClone(value);

/** Executable CAS: each update checks the version at execution, not at read. */
class Backend {
  rows = new Map<string, Row>();
  serial = 0;
  writes = 0;
  reads = 0;
  failRead = false;
  loseAcknowledgement = false;
  conflictBudget = 0;
  beforeWrite?: () => Promise<void>;
  from(table: string) {
    assert.equal(table, 'user_app_state');
    let operation = 'read';
    let payload: any;
    const filters: Record<string, unknown> = {};
    const query: any = {
      select: () => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (value: unknown) => { operation = 'update'; payload = copy(value); return query; },
      insert: (value: unknown) => { operation = 'insert'; payload = copy(value); return query; },
      maybeSingle: async () => {
        if (operation === 'read') {
          this.reads += 1;
          if (this.failRead) return { data: null, error: new Error('offline') };
          return { data: copy(this.rows.get(String(filters.user_id)) ?? null), error: null };
        }
        const beforeWrite = this.beforeWrite;
        this.beforeWrite = undefined;
        await beforeWrite?.();
        const owner = payload.user_id;
        const current = this.rows.get(owner);
        if (operation === 'insert' && current) return { data: null, error: { code: '23505' } };
        assert.ok(operation === 'insert' || filters.user_id === owner, 'all updates must filter account');
        if (operation === 'update' && (this.conflictBudget-- > 0 || current?.updated_at !== filters.updated_at)) return { data: null, error: null };
        this.writes += 1;
        this.rows.set(owner, { ...current, ...payload, updated_at: `server-${++this.serial}` });
        if (this.loseAcknowledgement) { this.loseAcknowledgement = false; throw new Error('response lost after commit'); }
        return { data: { user_id: owner }, error: null };
      },
    };
    return query;
  }
}

const owner = 'account-a';
const initial: Item[] = [{ id: 'one', title: 'Original', text: 'Body' }, { id: 'two', title: 'Other' }];
const neverLegacy = async (): Promise<Item[]> => { throw new Error('initialized domains must never read legacy'); };

async function run() {
  for (const domain of ['notes', 'planner', 'journal'] as AccountRecordDomain[]) {
    const db = new Backend();
    db.rows.set(owner, { user_id: owner, updated_at: 'old', profile: { displayName: 'Keep', __kodaNotes: ['legacy'], unrelated: { a: 1 } }, goals: ['preserve'] });
    const original = await syncAccountRecordDomain(db, owner, domain, [], async () => initial);
    const editA = createAccountRecordPatches(owner, domain, initial, [{ ...initial[0], title: 'Phone title' }, initial[1]], 'phone', original, 100);
    const editB = createAccountRecordPatches(owner, domain, initial, [initial[0], { ...initial[1], title: 'Laptop other' }], 'laptop', original, 100);
    // Force B's write between A's read and CAS, requiring A to rebase.
    db.beforeWrite = async () => { await syncAccountRecordDomain(db, owner, domain, editB, neverLegacy); };
    const both = await syncAccountRecordDomain(db, owner, domain, editA, neverLegacy);
    assert.deepEqual(accountRecordValues<Item>(both).map(item => item.title), ['Phone title', 'Laptop other']);
    assert.equal(db.rows.get(owner)!.profile.displayName, 'Keep');
    assert.deepEqual(db.rows.get(owner)!.goals, ['preserve']);
    assert.deepEqual(db.rows.get(owner)!.profile.unrelated, { a: 1 });
    const independentField = createAccountRecordPatches(owner, domain, initial, [{ ...initial[0], text: 'New body' }, initial[1]], 'tablet', original, 100);
    const fields = await syncAccountRecordDomain(db, owner, domain, independentField, neverLegacy);
    assert.equal(accountRecordValues<Item>(fields)[0].title, 'Phone title', 'unchanged stale title cannot overwrite fresh title');
    assert.equal(accountRecordValues<Item>(fields)[0].text, 'New body');
    const staleSnapshot = copy(fields);
    const deleteOne = createAccountRecordPatches(owner, domain, initial, [initial[1]], 'phone', original, 101);
    const deleted = await syncAccountRecordDomain(db, owner, domain, deleteOne, neverLegacy);
    assert.equal(accountRecordValues(deleted).length, 1);
    const staleEdit = createAccountRecordPatches(owner, domain, initial, [{ ...initial[0], title: 'Resurrect?' }, initial[1]], 'offline', staleSnapshot, 999999);
    const afterOffline = await syncAccountRecordDomain(db, owner, domain, staleEdit, neverLegacy);
    assert.deepEqual(accountRecordValues<Item>(afterOffline).map(item => item.id), ['two'], 'permanent tombstone wins over newer stale edits');
    assert.ok(afterOffline.records.one.deleted);
    const deleteTwo = createAccountRecordPatches(owner, domain, [initial[1]], [], 'phone', afterOffline, 1000000);
    await syncAccountRecordDomain(db, owner, domain, deleteTwo, neverLegacy);
    const empty = await syncAccountRecordDomain(db, owner, domain, [], neverLegacy);
    assert.deepEqual(accountRecordValues(empty), [], 'authoritative empty pull clears stale lists');
    assert.equal(Object.keys(empty.records).length, 2, 'deletion history retained');
    assert.deepEqual(readAccountRecordDomain(db.rows.get(owner)!.profile, owner, domain), empty);
    const noChange = createAccountRecordPatches(owner, domain, initial, copy(initial), 'phone', original);
    assert.deepEqual(noChange, [], 'no whole snapshot write for unchanged rows');
    const beforeRetry = db.writes;
    await syncAccountRecordDomain(db, owner, domain, JSON.parse(JSON.stringify(deleteTwo)), neverLegacy);
    assert.equal(db.writes, beforeRetry, 'idempotent retry skips needless writes');
  }

  const db = new Backend();
  let legacyReads = 0;
  const bootstrap = async () => { legacyReads += 1; return initial; };
  // Concurrent first initialization must merge domains without replacing profile.
  const snapshots = await Promise.all([
    syncAccountRecordDomain(db, owner, 'notes', [], bootstrap),
    syncAccountRecordDomain(db, owner, 'planner', [], bootstrap),
    syncAccountRecordDomain(db, owner, 'journal', [], bootstrap),
  ]);
  assert.equal(legacyReads, 3);
  for (const domain of ['notes', 'planner', 'journal'] as AccountRecordDomain[]) assert.ok(readAccountRecordDomain(db.rows.get(owner)!.profile, owner, domain));
  const base = snapshots[0];
  const equalCounter = 9000000;
  const a: AccountRecordPatch = { ownerId: owner, domain: 'notes', id: 'one', version: { counter: equalCounter, actor: 'a' }, set: { title: 'A' }, unset: [], deleted: false };
  const z: AccountRecordPatch = { ...a, version: { counter: equalCounter, actor: 'z' }, set: { title: 'Z' } };
  assert.deepEqual(applyAccountRecordPatches(base, [a, z]), applyAccountRecordPatches(base, [z, a]), 'same field conflict deterministic in both arrival orders');
  const unset: AccountRecordPatch = { ...z, version: { counter: equalCounter + 1, actor: 'z' }, set: {}, unset: ['text'] };
  const staleField: AccountRecordPatch = { ...a, set: { text: 'stale' } };
  assert.equal(accountRecordValues<Item>(applyAccountRecordPatches(base, [unset, staleField]))[0].text, undefined, 'field removal retains version');
  const causal = createAccountRecordPatches(owner, 'notes', initial, [{ ...initial[0], title: 'Causal' }, initial[1]], 'clock-behind', applyAccountRecordPatches(base, [z]), 1);
  assert.ok(causal[0].version.counter > equalCounter, 'observed edit beats future device clock');
  const failed = new Backend();
  await assert.rejects(syncAccountRecordDomain(failed, owner, 'planner', [], async () => { throw new Error('failed legacy fetch'); }));
  assert.equal(failed.writes, 0, 'failed legacy read cannot initialize an empty domain');
  failed.failRead = true;
  await assert.rejects(syncAccountRecordDomain(failed, owner, 'planner', [], async () => []));
  assert.equal(failed.writes, 0);
  failed.failRead = false;
  assert.deepEqual(accountRecordValues(await syncAccountRecordDomain(failed, owner, 'planner', [], async () => [])), []);
  db.loseAcknowledgement = true;
  await assert.rejects(syncAccountRecordDomain(db, owner, 'notes', [a], neverLegacy), /response lost/);
  const countAfterCommit = db.writes;
  await syncAccountRecordDomain(db, owner, 'notes', [a], neverLegacy);
  assert.equal(db.writes, countAfterCommit, 'ambiguous commit retry idempotent');
  // Legacy mirror fails after successful canonical commit; stale mirror data is ignored.
  await assert.rejects(async () => { await syncAccountRecordDomain(db, owner, 'notes', [z], neverLegacy); throw new Error('mirror offline'); });
  assert.equal(accountRecordValues<Item>(await syncAccountRecordDomain(db, owner, 'notes', [], neverLegacy))[0].title, 'Z');
  const count = db.writes;
  await assert.rejects(syncAccountRecordDomain(db, 'account-b', 'notes', [a], neverLegacy), /foreign/);
  assert.equal(db.writes, count);
  assert.throws(() => readAccountRecordDomain(db.rows.get(owner)!.profile, 'account-b', 'notes'), /foreign/);
  assert.throws(() => createAccountRecordPatches('account-b', 'notes', initial, [], 'phone', base), /Foreign/);
  assert.equal(readAccountRecordDomain({}, owner, 'notes'), null);
  assert.throws(() => readAccountRecordDomain({ __kodaRecords: { version: 2, ownerId: owner, domains: {} } }, owner, 'notes'), /Invalid/);
  const corrupt = new Backend();
  corrupt.rows.set(owner, { user_id: owner, updated_at: 'v', profile: { __kodaRecords: {} } });
  await assert.rejects(syncAccountRecordDomain(corrupt, owner, 'notes', [], async () => []), /Invalid/);
  assert.equal(corrupt.writes, 0, 'invalid canonical metadata never silently overwritten');
  db.conflictBudget = 10;
  await assert.rejects(syncAccountRecordDomain(db, owner, 'notes', causal, neverLegacy), /retry required/);
  console.log('account record sync: three-domain CAS, tombstones, field conflicts, bootstrap, retries, isolation passed');
}

void run();
