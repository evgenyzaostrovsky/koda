import assert from 'node:assert/strict';
import {
  createSupabaseWizardDraftTransport, emptyWizardSyncState, mergeWizardRevisions,
  normalizeWizardDraft, parseWizardSyncState, resolveWizardConflict, stageWizardDraft,
  syncWizardDraft, wizardSyncView, type WizardDraftPayload, type WizardRevision,
} from '../src/features/koda/wizardDraftSync';

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
function draft(answer: string): WizardDraftPayload {
  return normalizeWizardDraft({ version: 1, wish: 'Write a story', clarificationQuestions: ['What next?', 'When?'], clarificationAnswers: [answer, ''] })!;
}
function row(owner: string, revision: WizardRevision) {
  return { user_id: owner, revision_id: revision.id, parent_ids: revision.parentIds, draft: revision.draft, created_at: '2026-10-22T10:00:00Z' };
}
type Row = ReturnType<typeof row>;

// Local fake implements only the Supabase query contract used by this adapter.
// Its owner checks are a fixture, NOT verification of hosted PostgreSQL/RLS policies.
function mockSupabase(rows = new Map<string, Row>(), initialOwner: string | null = A) {
  let owner = initialOwner;
  let offline = false;
  let missingTable = false;
  let loseAck = false;
  let ownerAfterQuery: string | null | undefined;
  let spoof: Row | undefined;
  let insertCalls = 0;
  let selectCalls = 0;
  const client = {
    auth: { async getSession() { return { data: { session: owner ? { user: { id: owner } } : null }, error: null }; } },
    from(table: string) {
      assert.equal(table, 'goal_wizard_drafts');
      const filters = new Map<string, unknown>();
      let start = 0, end = Number.MAX_SAFE_INTEGER, single = false, insert: Row | undefined;
      const query = {
        select(_columns: string) { return query; },
        eq(column: string, value: unknown) { filters.set(column, value); return query; },
        order(column: string, options: { ascending: boolean }) { assert.equal(column, 'revision_id'); assert.equal(options.ascending, true); return query; },
        range(first: number, last: number) { start = first; end = last; return query; },
        maybeSingle() { single = true; return query; },
        upsert(value: Row, options: { onConflict: string; ignoreDuplicates: boolean }) {
          assert.deepEqual(options, { onConflict: 'user_id,revision_id', ignoreDuplicates: true });
          insert = value; return query;
        },
        async then(resolve: (value: { data: unknown; error: unknown }) => unknown, reject?: (error: unknown) => unknown) {
          try {
            if (offline) return resolve({ data: null, error: new Error('fixture offline') });
            if (missingTable) return resolve({ data: null, error: { code: '42P01', message: 'fixture missing table' } });
            let data: unknown;
            let error: unknown = null;
            if (insert) {
              insertCalls += 1;
              if (insert.user_id !== owner) return resolve({ data: null, error: new Error('fixture RLS rejection') });
              const key = `${insert.user_id}/${insert.revision_id}`;
              if (!rows.has(key)) rows.set(key, { ...insert, created_at: '2026-10-22T10:00:00Z' });
              if (loseAck) { loseAck = false; error = new Error('fixture lost acknowledgement'); }
              data = null;
            } else {
              selectCalls += 1;
              const selected = [...rows.values()].filter((item) => item.user_id === owner && [...filters].every(([key, value]) => (item as any)[key] === value))
                .sort((left, right) => left.revision_id.localeCompare(right.revision_id)).slice(start, end + 1);
              data = single ? selected[0] ?? null : selected;
              if (spoof) data = single ? spoof : [spoof];
            }
            if (ownerAfterQuery !== undefined) { owner = ownerAfterQuery; ownerAfterQuery = undefined; }
            return resolve({ data, error });
          } catch (error) { if (reject) return reject(error); throw error; }
        },
      };
      return query;
    },
  };
  return {
    client, rows, transport: createSupabaseWizardDraftTransport(client),
    setOwner(value: string | null) { owner = value; },
    setOffline(value: boolean) { offline = value; },
    setMissingTable(value: boolean) { missingTable = value; },
    loseNextAck() { loseAck = true; },
    switchAfterQuery(value: string | null) { ownerAfterQuery = value; },
    spoofResponse(value: Row | undefined) { spoof = value; },
    get insertCalls() { return insertCalls; }, get selectCalls() { return selectCalls; },
  };
}

async function main() {
  assert.equal(normalizeWizardDraft(null), null);
  assert.equal(normalizeWizardDraft({ version: 2, wish: 'Invalid' }), null);
  const bounded = normalizeWizardDraft({ version: 1, wish: 'w'.repeat(5000), step: 99,
    clarificationQuestions: ['q'.repeat(500), 'Second?', 'Third?'], clarificationAnswers: ['a'.repeat(500), ''],
    directions: Array.from({ length: 10 }, () => ({ title: 't'.repeat(500), actions: Array(10).fill('a'.repeat(500)) })),
  })!;
  assert.equal(bounded.wish.length, 4000); assert.equal(bounded.step, 4);
  assert.equal(bounded.clarificationQuestions.length, 2); assert.equal(bounded.clarificationQuestions[0].length, 300);
  assert.deepEqual(bounded.clarificationAnswers.map((answer) => answer.length), [400, 0]);
  assert.equal(bounded.directions.length, 8); assert.equal(bounded.directions[0].actions.length, 8);
  assert.equal(bounded.directions[0].title.length, 300); assert.equal(bounded.directions[0].actions[0].length, 300);
  assert.throws(() => emptyWizardSyncState('guest'), /authenticated account/);
  assert.throws(() => parseWizardSyncState(JSON.stringify(emptyWizardSyncState(A)), B), /account mismatch/);
  assert.throws(() => parseWizardSyncState('{bad', A));

  const shared = new Map<string, Row>();
  const device1 = mockSupabase(shared), device2 = mockSupabase(shared), accountB = mockSupabase(shared, B);
  let one = stageWizardDraft(emptyWizardSyncState(A), draft('  partial answer '), 'base');
  const persisted = JSON.stringify(one);
  device1.setOffline(true);
  await assert.rejects(syncWizardDraft(one, device1.transport), /offline/);
  assert.equal(JSON.stringify(one), persisted, 'A failed sync must not mutate local persisted state');
  one = parseWizardSyncState(persisted, A);
  device1.setOffline(false);
  one = await syncWizardDraft(one, device1.transport);
  assert.equal(one.outbox.length, 0);
  let two = await syncWizardDraft(emptyWizardSyncState(A), device2.transport);
  assert.deepEqual(wizardSyncView(two).draft?.clarificationAnswers, ['  partial answer ', ''], 'Another device restores unsent text and blank second answer');
  const separate = await syncWizardDraft(stageWizardDraft(emptyWizardSyncState(B), draft('B private'), 'base'), accountB.transport);
  assert.equal(wizardSyncView(separate).draft?.clarificationAnswers[0], 'B private');
  assert.equal(wizardSyncView(await syncWizardDraft(one, device1.transport)).draft?.clarificationAnswers[0], '  partial answer ');

  one = stageWizardDraft(one, draft('device one'), 'one-change');
  two = stageWizardDraft(two, draft('device two'), 'two-change');
  one = await syncWizardDraft(one, device1.transport);
  two = await syncWizardDraft(two, device2.transport);
  assert.equal(wizardSyncView(two).kind, 'conflict');
  assert.deepEqual(new Set(wizardSyncView(two).heads.map((head) => head.draft?.clarificationAnswers[0])), new Set(['device one', 'device two']));
  assert.equal(wizardSyncView(two).draft, null, 'A conflict must not automatically select a winner');
  assert.throws(() => stageWizardDraft(two, draft('silent overwrite'), 'bad-edit'), /Resolve/);
  assert.throws(() => resolveWizardConflict(two, 'base', 'bad-resolution'), /current wizard conflict/);
  two = resolveWizardConflict(two, 'two-change', 'resolution');
  assert.deepEqual(two.revisions.at(-1)?.parentIds, ['one-change', 'two-change']);
  two = await syncWizardDraft(two, device2.transport);
  one = await syncWizardDraft(one, device1.transport);
  assert.equal(wizardSyncView(one).kind, 'draft');
  assert.equal(wizardSyncView(one).draft?.clarificationAnswers[0], 'device two');
  assert.ok(one.revisions.some((revision) => revision.id === 'one-change'), 'Resolution retains the unselected immutable version');

  const beforeAck = stageWizardDraft(one, draft('newest answer'), 'lost-ack');
  device1.loseNextAck();
  const beforeInserts = device1.insertCalls;
  await assert.rejects(syncWizardDraft(beforeAck, device1.transport), /lost acknowledgement/);
  assert.deepEqual(beforeAck.outbox, ['lost-ack']);
  one = await syncWizardDraft(parseWizardSyncState(JSON.stringify(beforeAck), A), device1.transport);
  assert.equal(device1.insertCalls, beforeInserts + 1, 'Retry discovers committed ID before uploading again');
  assert.equal(one.outbox.length, 0);
  assert.equal([...shared.values()].filter((item) => item.user_id === A && item.revision_id === 'lost-ack').length, 1);

  two = await syncWizardDraft(two, device2.transport);
  const staleOffline = stageWizardDraft(two, draft('offline edit before learning of deletion'), 'stale-offline');
  one = await syncWizardDraft(stageWizardDraft(one, null, 'deleted-on-save'), device1.transport);
  assert.equal(wizardSyncView(one).kind, 'deleted');
  const deletionConflict = await syncWizardDraft(staleOffline, device2.transport);
  assert.equal(wizardSyncView(deletionConflict).kind, 'conflict');
  assert.equal(wizardSyncView(deletionConflict).draft, null, 'An old offline branch must not resurrect a deleted draft');
  assert.ok(wizardSyncView(deletionConflict).heads.some((head) => head.draft === null));
  assert.ok(wizardSyncView(deletionConflict).heads.some((head) => head.id === 'stale-offline'));
  const keepDeleted = await syncWizardDraft(resolveWizardConflict(deletionConflict, 'deleted-on-save', 'confirm-deleted'), device2.transport);
  assert.equal(wizardSyncView(keepDeleted).kind, 'deleted');
  const newWish = stageWizardDraft(keepDeleted, draft('intentional new wish'), 'new-after-delete');
  assert.deepEqual(newWish.revisions.at(-1)?.parentIds, ['confirm-deleted']);
  assert.equal(wizardSyncView(newWish).kind, 'draft');

  const pendingSnapshot = stageWizardDraft(keepDeleted, draft('pending'), 'pending');
  const inFlightResult = await syncWizardDraft(pendingSnapshot, device1.transport);
  const laterEdit = stageWizardDraft(pendingSnapshot, draft('typed during sync'), 'typed-later');
  const combined = mergeWizardRevisions(laterEdit, inFlightResult.revisions);
  assert.deepEqual(combined.outbox, ['typed-later'], 'Acknowledgements must not remove concurrent local edits from the outbox');
  assert.equal(wizardSyncView(combined).draft?.clarificationAnswers[0], 'typed during sync');
  assert.deepEqual(wizardSyncView(mergeWizardRevisions(emptyWizardSyncState(A), [...combined.revisions].reverse())).heads, wizardSyncView(combined).heads, 'Out-of-order history is resolved by ancestry, not response order or timestamps');

  const collision = { ...one.revisions[0], draft: draft('different body with same ID') };
  assert.throws(() => mergeWizardRevisions(one, [collision]), /collision/);
  await assert.rejects(device1.transport.push(A, collision), /collision/);
  assert.throws(() => mergeWizardRevisions(emptyWizardSyncState(A), [{ id: 'orphan', parentIds: ['absent'], draft: draft('orphan') }]), /missing parent/);
  assert.throws(() => mergeWizardRevisions(emptyWizardSyncState(A), [
    { id: 'cycle1', parentIds: ['cycle2'], draft: null }, { id: 'cycle2', parentIds: ['cycle1'], draft: null },
  ]), /cycle/);

  const auth = mockSupabase(shared);
  const anonymous = createSupabaseWizardDraftTransport({ auth: { async getSession() { return { data: { session: { user: { id: A, is_anonymous: true } } }, error: null }; } } });
  await assert.rejects(anonymous.pull(A), /anonymous/);
  await assert.rejects(auth.transport.pull('guest'), /authenticated account/);
  auth.setOwner(null); await assert.rejects(auth.transport.pull(A), /account changed/);
  auth.setOwner(B); await assert.rejects(auth.transport.pull(A), /account changed/);
  assert.equal(auth.selectCalls, 0, 'An invalid session must be rejected before any table request');
  auth.setOwner(A); auth.switchAfterQuery(B);
  await assert.rejects(auth.transport.pull(A), /account changed/, 'A response completing after an account switch must not be applied');
  auth.setOwner(A); auth.switchAfterQuery(B);
  await assert.rejects(auth.transport.push(A, { id: 'switch-on-write', parentIds: [], draft: draft('A only') }), /account changed/);
  assert.ok(!shared.has(`${B}/switch-on-write`));
  auth.setOwner(A); auth.spoofResponse(row(B, { id: 'foreign', parentIds: [], draft: draft('B secret') }));
  await assert.rejects(auth.transport.pull(A), /another account/);
  auth.spoofResponse({ ...row(A, { id: 'invalid', parentIds: [], draft: draft('valid') }), draft: { version: 1, wish: 'not normalized' } as any });
  await assert.rejects(auth.transport.pull(A), /Invalid wizard draft payload/);
  auth.spoofResponse(undefined); auth.setMissingTable(true);
  await assert.rejects(syncWizardDraft(combined, auth.transport), (error: any) => error.code === '42P01');
  assert.equal(wizardSyncView(combined).draft?.clarificationAnswers[0], 'typed during sync', 'Missing cloud infrastructure must leave local questions and answers intact');

  const manyRows = new Map<string, Row>();
  for (let index = 0; index < 205; index += 1) {
    const id = `page-${String(index).padStart(3, '0')}`;
    manyRows.set(`${A}/${id}`, row(A, { id, parentIds: index ? [`page-${String(index - 1).padStart(3, '0')}`] : [], draft: draft(String(index)) }));
  }
  const paged = mockSupabase(manyRows);
  const fullHistory = await paged.transport.pull(A);
  assert.equal(fullHistory.length, 205); assert.equal(paged.selectCalls, 2);
  assert.equal(wizardSyncView(mergeWizardRevisions(emptyWizardSyncState(A), fullHistory)).draft?.clarificationAnswers[0], '204');
  console.log('Wizard draft sync: two devices/accounts, bounded payloads, offline/reload, conflicts, tombstones, lost ACK, out-of-order DAG, concurrent edits, owner guards, missing table, pagination PASS (local mocks; hosted RLS not tested)');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
