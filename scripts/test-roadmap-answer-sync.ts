import assert from 'node:assert/strict';
import { createGoal, normalizeGoal } from '../src/features/koda/goalLogic';
import { clearRoadmapClarifications, getActiveRoadmapClarifications as active, getRoadmapRequestClarifications as request, mergeRoadmapClarifications, normalizeRoadmapClarifications, removeRoadmapClarification, updateRoadmapAnswer, upsertRoadmapQuestions } from '../src/features/koda/goalRoadmapClarifications';
import { mergeGoals, normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { SyncCoordinator, writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Goal } from '../src/features/koda/types';

const t0 = '2026-10-22T09:00:00.000Z', t1 = '2026-10-22T10:00:00.000Z', t2 = '2026-10-22T11:00:00.000Z';
const base: Goal = { ...createGoal({ title: 'Learn SQL', desiredResult: 'Build portfolio', deadline: '', priority: 'main' }, t0), id: 'goal-a', planningContext: 'Started a course' };
const state = (goals: Goal[]) => normalizeStoredKodaState({ goals })!;
const reload = (goal: Goal) => parseStoredKodaState(JSON.stringify(state([goal])))!.goals[0];
const question = (goal: Goal, text: string) => active(goal).find(item => item.question === text)!;
const answer = (goal: Goal, text: string, value: string, at = t1) => updateRoadmapAnswer(goal, question(goal, text).id, value, at);
const merge = (a: Goal, b: Goal) => mergeGoals([a], [b])[0];
const questions = upsertRoadmapQuestions(base, ['Experience?', 'Resources?'], t0);
const first = answer(questions, 'Experience?', '  SQL basics\n\nKeep whitespace  ');
const second = answer(questions, 'Resources?', 'Evenings and a laptop');
const both = merge(first, second);

assert.equal(Object.hasOwn(normalizeGoal(base)!, 'roadmapClarifications'), false);
for (const invalid of [null, [], {}, {version: 1, edits: null, clears: []}]) assert.equal(normalizeRoadmapClarifications(invalid), undefined);
assert.deepEqual(normalizeRoadmapClarifications({version: 1, edits: [null, {}], clears: [{}]}), {version: 1, edits: [], clears: []});
assert.deepEqual(reload(both).roadmapClarifications, both.roadmapClarifications, 'Raw multiline answers survive the actual local JSON parser');
assert.equal(question(reload(both), 'Experience?').answer, '  SQL basics\n\nKeep whitespace  ');
assert.deepEqual(active(both).map(item => item.answer), ['  SQL basics\n\nKeep whitespace  ', 'Evenings and a laptop']);
assert.deepEqual(merge(first, second), merge(second, first), 'Merge commutes');
assert.deepEqual(merge(both, both), both, 'Merge is idempotent');
assert.deepEqual(mergeRoadmapClarifications(merge(first, second).roadmapClarifications, base.roadmapClarifications), both.roadmapClarifications);
assert.deepEqual(active({...both, planningContext: 'More details', deadline: '2027-01-01', status: 'paused'}), active(both), 'Context supplements and goal progress do not discard facts');
assert.deepEqual(active({...both, title: 'A different goal'}), [], 'Changed goal identity must not silently reuse outdated answers');
assert.deepEqual(active({...both, id: 'goal-b'}), [], 'Copied data cannot leak into another goal');
assert.equal(question(questions, 'Experience?').answer, '');
assert.equal(request(questions)[0].answer, 'не знаю', 'Fallback is request-only');
assert.equal(question(reload(questions), 'Experience?').answer, '');
assert.equal(upsertRoadmapQuestions(both, ['Experience?'], t2), both, 'Repeated model question never overwrites an answer');
assert.deepEqual(active(merge(both, {...base, updatedAt: t2})), active(both), 'Legacy omission cannot delete memory');

const competing = answer(questions, 'Experience?', 'Another device answer');
const conflict = merge(first, competing);
assert.deepEqual(merge(first, competing), merge(competing, first));
const values = conflict.roadmapClarifications!.edits.map(edit => edit.answer);
assert.ok(values.includes('Another device answer') && values.includes('  SQL basics\n\nKeep whitespace  '), 'Concurrent same-question versions retained');
assert.ok(question(conflict, 'Experience?').previousAnswers.length > 0);
const cleared = clearRoadmapClarifications(both, t2);
assert.deepEqual(active(reload(merge(cleared, both))), [], 'Clear tombstone survives reload and stale device merge');
assert.deepEqual(active(merge(cleared, {...base, updatedAt: '2026-10-23T00:00:00.000Z'})), []);
const removed = removeRoadmapClarification(both, question(both, 'Experience?').id, t2);
assert.deepEqual(active(merge(removed, first)).map(item => item.question), ['Resources?'], 'Per-pair tombstone preserves the other pair');
const concurrentDelete = removeRoadmapClarification(questions, question(questions, 'Experience?').id, t1);
assert.equal(question(merge(concurrentDelete, first), 'Experience?'), undefined, 'Concurrent delete wins tied logical clock');
const reopened = answer(upsertRoadmapQuestions(cleared, ['Experience?'], t2), 'Experience?', 'Intentional new answer', t2);
assert.equal(question(merge(reopened, cleared), 'Experience?').answer, 'Intentional new answer');
const independentlyAddedA = upsertRoadmapQuestions(base, ['Question A'], t1);
const independentlyAddedB = upsertRoadmapQuestions(base, ['Question B'], t1);
assert.equal(active(merge(independentlyAddedA, independentlyAddedB)).length, 2);
assert.deepEqual(merge(merge(first, second), competing).roadmapClarifications, merge(first, merge(second, competing)).roadmapClarifications, 'Field merge is associative');
assert.deepEqual(answer(questions, 'Experience?', 'Replay'), answer(questions, 'Experience?', 'Replay'), 'Explicit-time helper calls are pure under updater replay');
assert.deepEqual(upsertRoadmapQuestions(base, ['Replay'], t1), upsertRoadmapQuestions(base, ['Replay'], t1));
assert.deepEqual(clearRoadmapClarifications(both, t2), clearRoadmapClarifications(both, t2));
let typed = questions;
for (let index = 0; index < 1000; index++) typed = answer(typed, 'Experience?', `Draft ${index}`);
assert.ok(typed.roadmapClarifications!.edits.length <= 9, 'Per-keystroke history is bounded to eight versions per question');
assert.equal(question(merge(typed, first), 'Experience?').answer, 'Draft 999', 'Compaction cannot let an old snapshot supersede retained newer versions');
const typedRemoved = removeRoadmapClarification(typed, question(typed, 'Experience?').id, t2);
assert.equal(question(merge(typedRemoved, first), 'Experience?'), undefined, 'Compaction retains deletion watermark');
const bounded = upsertRoadmapQuestions(base, Array.from({length: 20}, (_, index) => `Question ${index}`), t1);
assert.equal(active(bounded).length, 8, 'Local creation is limited to eight active pairs');
const extraBatch = upsertRoadmapQuestions(base, Array.from({length: 8}, (_, index) => `Other ${index}`), t1);
const overflow = merge(bounded, extraBatch);
assert.equal(active(overflow).length, 8, 'Concurrent overflow exposes eight deterministic pairs');
assert.equal(new Set(overflow.roadmapClarifications!.edits.map(edit => edit.questionId)).size, 16, 'Overflow pairs remain recoverable in stored memory');
assert.deepEqual(active(overflow), active(merge(extraBatch, bounded)));

// In-memory PostgREST transport; calls the real normalization/merge/CAS implementation.
class AppStateBackend {
  rows = new Map<string, Record<string, any>>();
  offline = false;
  failWrite = false;
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
        if (this.offline || (this.failWrite && operation !== 'read')) return { data: null, error: { code: 'FETCH', message: 'offline' } };
        const userId = String(filters.user_id ?? payload.user_id);
        const current = this.rows.get(userId);
        if (operation === 'read') return { data: structuredClone(current ?? null), error: null };
        if (operation === 'insert' && current) return { data: null, error: { code: '23505', message: 'duplicate' } };
        if (operation === 'update' && current?.updated_at !== filters.updated_at) {
          this.conflicts++;
          return { data: null, error: null };
        }
        this.rows.set(userId, JSON.parse(JSON.stringify({ ...current, ...payload, updated_at: `server-${++this.writes}` })));
        return { data: { user_id: userId }, error: null };
      },
    };
    return query;
  }
  goal(user: string) { return normalizeStoredKodaState(this.rows.get(user))!.goals[0]; }
}

async function testTransport() {
  const backend = new AppStateBackend();
  await writeAppStateSnapshot(backend, 'account-a', state([questions]));
  await writeAppStateSnapshot(backend, 'account-b', state([answer(questions, 'Experience?', 'Account B private answer')]));
  await Promise.all([
    writeAppStateSnapshot(backend, 'account-a', state([first])),
    writeAppStateSnapshot(backend, 'account-a', state([second])),
  ]);
  assert.ok(backend.conflicts > 0, 'Actual CAS retry path exercised');
  assert.deepEqual(active(backend.goal('account-a')), active(both));
  assert.equal(question(backend.goal('account-b'), 'Experience?').answer, 'Account B private answer');
  const accountB = structuredClone(backend.rows.get('account-b'));
  backend.offline = true;
  await assert.rejects(writeAppStateSnapshot(backend, 'account-a', state([cleared])));
  assert.deepEqual(active(backend.goal('account-a')), active(both));
  const offline = reload(cleared);
  backend.offline = false;
  backend.failWrite = true;
  await assert.rejects(writeAppStateSnapshot(backend, 'account-a', state([offline])));
  backend.failWrite = false;
  await writeAppStateSnapshot(backend, 'account-a', state([offline]));
  await writeAppStateSnapshot(backend, 'account-a', state([offline]));
  await writeAppStateSnapshot(backend, 'account-a', state([both]));
  assert.deepEqual(active(backend.goal('account-a')), [], 'Offline clear retries and stale upload cannot resurrect answers');
  assert.deepEqual(backend.rows.get('account-b'), accountB, 'User-scoped writes preserve the other account');
  await writeAppStateSnapshot(backend, 'account-a', state([reopened]));
  assert.equal(question(backend.goal('account-a'), 'Experience?').answer, 'Intentional new answer');
  await Promise.all([
    writeAppStateSnapshot(backend, 'new-account', state([independentlyAddedA])),
    writeAppStateSnapshot(backend, 'new-account', state([independentlyAddedB])),
  ]);
  assert.equal(active(backend.goal('new-account')).length, 2, 'Initial insert collision retries without losing either question');
  // Verify stale acknowledgements cannot mark a newer local draft as synced.
  const coordinator = new SyncCoordinator();
  coordinator.changed('app');
  const revision = coordinator.revision('app');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let acknowledged = false;
  const pending = coordinator.run('app', revision, async () => { await gate; acknowledged = coordinator.current('app', revision); });
  await Promise.resolve();
  coordinator.changed('app');
  release();
  await pending;
  assert.equal(acknowledged, false);
}

testTransport().then(() => console.log('Roadmap answers: JSON reload, applicable context, pair merge, retained concurrent versions, tombstones, legacy, mocked accounts/offline/CAS/retry and stale acknowledgement PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
