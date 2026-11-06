import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { markGoalDeleted, recordGoalListChanges, visibleGoals, withoutDeletedGoalItems } from '../src/features/koda/goalDeletion';
import { normalizeGoal, calculateGoalProgress } from '../src/features/koda/goalLogic';
import { mergeGoals, mergeStoredKodaState, normalizeStoredKodaState, parseStoredKodaState, shouldSyncRecoveredAppState } from '../src/features/koda/persistence';
import { atSyncStage, SyncCoordinator, writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import { toNullableSqlDate, toRequiredSqlDate } from '../src/features/koda/syncDate';
import { kodaDayId } from '../src/features/koda/kodaDaySync';
import { advanceAutoPlan, buildAutoPlanItems, configureAutoPlan, recordAutoPlanCompletion } from '../src/features/koda/autoPlan';

const at = '2026-11-05T10:00:00.000Z', deletedAt = '2026-11-05T11:00:00.000Z';
const goal = normalizeGoal({ id: '11111111-1111-4111-8111-111111111111', title: 'Fixture', priority: 'main', createdAt: at, updatedAt: at,
  actions: [{ id: 'action', title: 'Fixture step', estimatedMinutes: 20 }],
  routines: [{ id: 'routine', title: 'Fixture ritual', startDate: '01.08' }],
})!;
const other = normalizeGoal({ ...goal, id: '22222222-2222-4222-8222-222222222222', title: 'Keep' })!;
const deleted = markGoalDeleted(goal, deletedAt);
const state = (goals = [goal]) => normalizeStoredKodaState({ goals })!;
assert.equal(mergeGoals([goal], [])[0].id, goal.id, 'Reproducer: absence alone cannot represent deletion during union');
assert.equal(goal.deletedAt, undefined, 'Deleting must not mutate the original or historical references');
assert.equal(deleted.status, 'archived');
assert.equal(markGoalDeleted(deleted, '2027-01-01T00:00:00Z'), deleted, 'Repeated deletion is idempotent');
assert.deepEqual(recordGoalListChanges([goal, other], [other], deletedAt).find(g => g.id === goal.id), deleted);
assert.deepEqual(visibleGoals(recordGoalListChanges([deleted, other], [goal, other], at)), [other], 'A stale UI updater cannot revive a deleted ID');
const reloaded = parseStoredKodaState(JSON.stringify(state([deleted, other])))!;
assert.equal(reloaded.goals.find(g => g.id === goal.id)!.deletedAt, deletedAt);
assert.deepEqual(visibleGoals(reloaded.goals).map(g => g.id), [other.id]);
const staleFuture = { ...goal, updatedAt: '2027-01-01T00:00:00Z', title: 'Stale offline edit' };
for (const [first, second] of [[deleted, staleFuture], [staleFuture, deleted]]) {
  const merged = mergeGoals([first], [second]);
  assert.equal(merged[0].deletedAt, deletedAt); assert.deepEqual(visibleGoals(merged), []);
}
const secondDelete = { ...deleted, title: 'Different offline metadata' };
assert.deepEqual(mergeGoals([deleted], [secondDelete]), mergeGoals([secondDelete], [deleted]), 'Concurrent tombstones converge');
const normalizedDeleted = normalizeGoal({ ...deleted, status: 'active', archivedAt: null })!;
assert.equal(normalizedDeleted.status, 'archived'); assert.equal(normalizedDeleted.archivedAt, deletedAt);
const mergedState = mergeStoredKodaState(state([staleFuture, other]), state([deleted]));
assert.deepEqual(visibleGoals(mergedState.goals).map(g => g.id), [other.id]);

// Historical day/plan inputs stay immutable; completed auto-plan projections must
// also be hidden because the projection builder deliberately keeps past work.
let plan = advanceAutoPlan(configureAutoPlan(undefined, 'owner', { enabled: true, timezone: 'UTC' }, at, 'enable'), [goal], [], '2026-11-05', at);
plan = recordAutoPlanCompletion(plan, plan.assignments[0].id, true, '2026-11-05', at, 'done');
const historical = JSON.stringify({ goal, plan });
const completed = buildAutoPlanItems(plan, visibleGoals([deleted]), '2026-11-05');
assert.ok(completed.length > 0, 'Fixture exercises a completed assignment retained without a live goal');
assert.deepEqual(withoutDeletedGoalItems(completed, [deleted]), []);
assert.equal(JSON.stringify({ goal, plan }), historical);

class Backend {
  rows = new Map<string, any>(); offline = false; writes = 0; conflicts = 0;
  beforeWrite?: () => void;
  from(table: string) {
    assert.equal(table, 'user_app_state'); let payload: any; const filters: Record<string, any> = {};
    const query = { select: () => query, eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (value: unknown) => { payload = value; return query; }, insert: (value: unknown) => { payload = value; return query; },
      maybeSingle: async () => {
        if (this.offline) return { data: null, error: { code: 'FETCH', message: 'offline' } };
        const owner = filters.user_id ?? payload?.user_id;
        if (!payload) return { data: structuredClone(this.rows.get(owner) ?? null), error: null };
        const race = this.beforeWrite; this.beforeWrite = undefined; race?.();
        if (this.rows.has(owner) && this.rows.get(owner).updated_at !== filters.updated_at) { this.conflicts++; return { data: null, error: null }; }
        this.rows.set(owner, structuredClone({ ...payload, updated_at: `v${++this.writes}` }));
        return { data: { user_id: owner }, error: null };
      },
    }; return query;
  }
}

async function main() {
  const backend = new Backend();
  await writeAppStateSnapshot(backend, 'owner', state([goal, other]));
  await writeAppStateSnapshot(backend, 'other-owner', state([goal]));
  backend.offline = true;
  await assert.rejects(writeAppStateSnapshot(backend, 'owner', state([deleted, other])));
  const pending = parseStoredKodaState(JSON.stringify(state([deleted, other])))!;
  assert.equal(visibleGoals(normalizeStoredKodaState(backend.rows.get('owner'))!.goals).length, 2, 'Failed request leaves server unchanged');
  backend.offline = false;
  assert.equal(shouldSyncRecoveredAppState(backend.rows.get('owner'), pending), true, 'Reload repairs deletion even if queue persistence was interrupted');
  await writeAppStateSnapshot(backend, 'owner', pending);
  await writeAppStateSnapshot(backend, 'owner', pending);
  const saved = await writeAppStateSnapshot(backend, 'owner', state([staleFuture, other]));
  assert.deepEqual(visibleGoals(saved.goals).map(g => g.id), [other.id], 'Writer returns remote deletion to a stale client before mirror writes');
  assert.equal(saved.goals.find(g => g.id === goal.id)!.deletedAt, deletedAt);
  assert.equal(shouldSyncRecoveredAppState(backend.rows.get('owner'), saved), false, 'Acknowledged deletion does not requeue forever');
  assert.equal(visibleGoals(normalizeStoredKodaState(backend.rows.get('other-owner'))!.goals).length, 1, 'Same ID in another account is unaffected');

  await writeAppStateSnapshot(backend, 'race', state([goal, other]));
  backend.beforeWrite = () => backend.rows.set('race', { ...backend.rows.get('race'), goals: [deleted, other], updated_at: 'concurrent-deletion' });
  const raced = await writeAppStateSnapshot(backend, 'race', state([staleFuture, other]));
  assert.equal(backend.conflicts, 1); assert.deepEqual(visibleGoals(raced.goals).map(g => g.id), [other.id]);

  // Execute the real app's mirror writer with a tombstone whose legacy routine
  // date is invalid: only the parent goal is archived; children are untouched.
  const app = ts.createSourceFile('KodaApp.tsx', readFileSync(new URL('../src/features/koda/KodaApp.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let writer: ts.FunctionDeclaration | undefined;
  const find = (node: ts.Node) => { if (ts.isFunctionDeclaration(node) && node.name?.text === 'syncGoalsToBackend') writer = node; ts.forEachChild(node, find); };
  find(app); assert.ok(writer);
  const js = ts.transpileModule(writer.getText(app), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const calls: { table: string; rows: any[] }[] = []; let failMirror = true;
  const client = { from: (table: string) => ({ upsert: async (rows: any[]) => { calls.push({ table, rows }); return { error: failMirror ? { code: 'FETCH' } : null }; } }) };
  const syncGoals = new Function('userId', 'isSupabaseConfigured', 'supabase', 'isUuid', 'kodaDayId', 'calculateGoalProgress', 'atSyncStage', 'toNullableSqlDate', 'toRequiredSqlDate', 'visibleGoals', `${js}; return syncGoalsToBackend;`)(
    'owner', () => true, client, (id: string) => /^[0-9a-f-]{36}$/.test(id), kodaDayId, calculateGoalProgress, atSyncStage, toNullableSqlDate, toRequiredSqlDate, visibleGoals,
  );
  await assert.rejects(syncGoals([deleted]));
  failMirror = false; await syncGoals([deleted]); await syncGoals([deleted]);
  assert.equal(calls.length, 3);
  for (const call of calls) {
    assert.equal(call.table, 'goals'); assert.equal(call.rows[0].status, 'archived');
    assert.equal(call.rows[0].archived_at, deletedAt); assert.equal(call.rows[0].user_id, 'owner');
  }
  const coordinator = new SyncCoordinator(); coordinator.changed('appState'); const old = coordinator.revision('appState');
  let finish!: () => void; const gate = new Promise<void>(resolve => { finish = resolve; }); let acknowledged = false;
  const inflight = coordinator.run('appState', old, async () => { await gate; acknowledged = coordinator.current('appState', old); });
  await Promise.resolve(); coordinator.changed('appState'); finish(); await inflight;
  assert.equal(acknowledged, false, 'An acknowledgement started before deletion cannot clear its revision');
  console.log('PASS goal deletion: union reproducer, durable tombstones, stale edits, reload/offline retry, CAS race, account isolation, hidden completed projections and archive-only mirror');
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
