import assert from 'node:assert/strict';
import { createGoal, normalizeGoal } from '../src/features/koda/goalLogic';
import { createOpenWindow } from '../src/features/koda/openWindow';
import { mergeGoals, mergeStoredKodaState, normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Goal } from '../src/features/koda/types';

const earlier = '2026-10-22T09:00:00.000Z';
const later = '2026-10-22T10:00:00.000Z';
const latest = '2026-10-22T11:00:00.000Z';
const legacy = { ...createGoal({ title: 'Goal A', desiredResult: '', deadline: '', priority: 'main' }, earlier), id: 'goal-a' };
const text = '  Current progress\nResources: 2 hours\n\nConstraints: keep whitespace  ';
const saved: Goal = { ...legacy, planningContext: text, updatedAt: later };
const cleared: Goal = { ...saved, planningContext: '', updatedAt: latest };
const state = (goals: Goal[]) => normalizeStoredKodaState({ goals })!;
const roundTrip = (goals: Goal[]) => parseStoredKodaState(JSON.stringify(state(goals)))!;

assert.equal(Object.hasOwn(normalizeGoal(legacy)!, 'planningContext'), false, 'Legacy absence is not an explicit clear');
for (const invalid of [null, 7, {}, [], false]) {
  assert.equal(Object.hasOwn(normalizeGoal({ ...legacy, planningContext: invalid })!, 'planningContext'), false);
}
assert.equal(normalizeGoal(saved)?.planningContext, text, 'Preserve leading/trailing spaces and line breaks');
assert.equal(normalizeGoal({ ...saved, planningContext: 'a'.repeat(2100) })?.planningContext, 'a'.repeat(2000));
assert.equal(roundTrip([saved]).goals[0].planningContext, text, 'The actual local JSON parser restores context');
assert.equal(roundTrip([cleared]).goals[0].planningContext, '', 'An explicit clear survives reload');
assert.equal(Object.hasOwn(roundTrip([legacy]).goals[0], 'planningContext'), false);
const other: Goal = { ...saved, id: 'goal-b', title: 'Goal B', planningContext: 'Other goal context' };
assert.deepEqual(roundTrip([saved, other]).goals.map(goal => goal.planningContext), [text, other.planningContext]);

for (const withWindow of [false, true]) {
  const first = withWindow ? { ...saved, openWindow: createOpenWindow(saved.id) } : saved;
  const newerLegacy = { ...legacy, title: 'Renamed by an older client', updatedAt: latest };
  for (const [remote, local] of [[first, newerLegacy], [newerLegacy, first]]) {
    const merged = mergeGoals([remote], [local])[0];
    assert.equal(merged.title, newerLegacy.title);
    assert.equal(merged.planningContext, text, 'A client lacking the field cannot implicitly clear it');
    assert.equal(Boolean(merged.openWindow), withWindow);
  }
}
for (const [remote, local] of [[saved, cleared], [cleared, saved]]) {
  assert.equal(mergeStoredKodaState(state([remote]), state([local])).goals[0].planningContext, '', 'A newer clear wins over stale text');
}
assert.equal(mergeGoals([cleared], [{ ...legacy, updatedAt: '2026-10-22T12:00:00.000Z' }])[0].planningContext, '');
assert.deepEqual(mergeGoals([saved], [cleared]), mergeGoals([cleared], [saved]), 'Merge order does not change the result');
const tied = { ...saved, planningContext: 'Competing context at the same timestamp' };
assert.deepEqual(mergeGoals([saved], [tied]), mergeGoals([tied], [saved]), 'Existing deterministic tie-breaking is preserved');
const mergedOnce = mergeGoals([saved], [cleared]);
assert.deepEqual(mergeGoals(mergedOnce, mergedOnce), mergedOnce, 'Repeated merges are idempotent');
assert.equal(roundTrip([{ ...saved, status: 'archived', archivedAt: latest }]).goals[0].planningContext, text);

// In-memory implementation of the existing PostgREST boundary. No credentials/network.
class AppStateBackend {
  rows = new Map<string, Record<string, any>>();
  offline = false;
  conflicts = 0;
  writes = 0;
  from(table: string) {
    assert.equal(table, 'user_app_state');
    let operation = 'read';
    let payload: Record<string, any> = {};
    const filters: Record<string, unknown> = {};
    const query = {
      select: (_columns: string) => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (value: Record<string, any>) => { operation = 'update'; payload = value; return query; },
      insert: (value: Record<string, any>) => { operation = 'insert'; payload = value; return query; },
      maybeSingle: async () => {
        if (this.offline) return { data: null, error: { code: 'FETCH', message: 'offline' } };
        const userId = String(filters.user_id ?? payload.user_id);
        const current = this.rows.get(userId);
        if (operation === 'read') return { data: structuredClone(current ?? null), error: null };
        if (operation === 'insert' && current) return { data: null, error: { code: '23505', message: 'duplicate' } };
        if (operation === 'update' && current?.updated_at !== filters.updated_at) {
          this.conflicts += 1;
          return { data: null, error: null };
        }
        this.writes += 1;
        // JSON serialization models the network payload, rather than retaining object references.
        this.rows.set(userId, JSON.parse(JSON.stringify({ ...current, ...payload, updated_at: `server-${this.writes}` })));
        return { data: { user_id: userId }, error: null };
      },
    };
    return query;
  }
  goals(userId: string) { return normalizeStoredKodaState(this.rows.get(userId))!.goals; }
}

async function testCloudBoundary() {
  const backend = new AppStateBackend();
  await writeAppStateSnapshot(backend, 'account-a', state([saved, other]));
  assert.deepEqual(backend.goals('account-a').map(goal => goal.planningContext), [text, other.planningContext]);
  const secondAccount: Goal = { ...saved, planningContext: 'Account B context for the same goal id' };
  await writeAppStateSnapshot(backend, 'account-b', state([secondAccount]));
  assert.equal(backend.goals('account-b')[0].planningContext, secondAccount.planningContext);
  assert.equal(backend.goals('account-a')[0].planningContext, text, 'User-scoped writes do not change another account');

  backend.offline = true;
  await assert.rejects(writeAppStateSnapshot(backend, 'account-a', state([cleared])));
  const offlineSnapshot = roundTrip([cleared]);
  assert.equal(offlineSnapshot.goals[0].planningContext, '', 'The local clear remains recoverable after a failed request');
  assert.equal(backend.goals('account-a')[0].planningContext, text);
  backend.offline = false;
  await writeAppStateSnapshot(backend, 'account-a', offlineSnapshot);
  await writeAppStateSnapshot(backend, 'account-a', offlineSnapshot);
  assert.equal(backend.goals('account-a')[0].planningContext, '', 'Retry persists clear without restoring stale text');
  assert.equal(backend.goals('account-a').length, 2, 'Retry preserves other goals without duplicates');

  await writeAppStateSnapshot(backend, 'legacy', state([saved]));
  await writeAppStateSnapshot(backend, 'legacy', state([{ ...legacy, title: 'Legacy rename', updatedAt: latest }]));
  assert.equal(backend.goals('legacy')[0].planningContext, text, 'Merge against a row preserves context when local input omits it');

  await writeAppStateSnapshot(backend, 'race', state([saved, other]));
  await Promise.all([
    writeAppStateSnapshot(backend, 'race', state([cleared])),
    writeAppStateSnapshot(backend, 'race', state([{ ...other, planningContext: 'Changed independently', updatedAt: latest }])),
  ]);
  assert.ok(backend.conflicts > 0, 'Exercise a failed compare-and-swap and re-read');
  assert.deepEqual(backend.goals('race').map(goal => goal.planningContext), ['', 'Changed independently']);
  await writeAppStateSnapshot(backend, 'race', state([saved]));
  assert.equal(backend.goals('race')[0].planningContext, '', 'A stale device cannot restore text over a newer clear');
}

testCloudBoundary().then(() => {
  console.log('Goal context: normalization, JSON reload, explicit clear, legacy merge, account isolation, offline retry and concurrent writes PASS');
}).catch(error => { console.error(error); process.exitCode = 1; });
