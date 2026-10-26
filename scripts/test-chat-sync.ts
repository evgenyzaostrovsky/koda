import assert from 'node:assert/strict';
import { createSupabaseChatTransport, mergeChatMessages } from '../src/features/koda/chatSync';
import { normalizeChatCreatedAt, parseChatHistory } from '../src/features/koda/chatHistory';
import type { ChatMessage } from '../src/features/koda/types';

type Row = { user_id: string; message_id: string; role: string; text: string; created_at: string; provider: string | null };
const message = (id: string, minute: number, role: 'user' | 'koda' = 'user', text = id): ChatMessage => ({
  id, role, text, createdAt: new Date(Date.UTC(2026, 9, 21, 12, minute)).toISOString(),
});

function fakeClient(database: Map<string, Row>, initialOwner: string) {
  const state = { owner: initialOwner, offline: false, missingTable: false, foreignRow: false, authError: false, switchOnRead: false, switchOnWrite: false, queries: 0, writes: 0 };
  const key = (row: Row) => JSON.stringify([row.user_id, row.message_id]);
  return {
    state,
    auth: { async getSession() {
      return { data: { session: { user: { id: state.owner } } }, error: state.authError ? new Error('auth unavailable') : null };
    } },
    from(table: string) {
      assert.equal(table, 'chat_messages');
      state.queries += 1;
      return {
        async upsert(rows: Row[], options: unknown) {
          assert.deepEqual(options, { onConflict: 'user_id,message_id', ignoreDuplicates: true });
          if (state.offline) throw new Error('offline');
          if (state.missingTable) return { error: { code: '42P01', message: 'table missing' } };
          if (rows.some((row) => row.user_id !== state.owner)) throw new Error('RLS');
          for (const row of rows) if (!database.has(key(row))) { database.set(key(row), { ...row }); state.writes += 1; }
          if (state.switchOnWrite) state.owner = 'other-account';
          return { error: null };
        },
        select(columns: string) {
          assert.equal(columns, 'user_id,message_id,role,text,created_at,provider');
          let owner: string | undefined;
          const orders: string[] = [];
          const query = {
            eq(column: string, value: string) { assert.equal(column, 'user_id'); owner = value; return query; },
            order(column: string, options: unknown) { assert.deepEqual(options, { ascending: false }); orders.push(column); return query; },
            async limit(count: number) {
              assert.deepEqual(orders, ['created_at', 'message_id']);
              assert.equal(count, 200);
              assert.equal(owner, state.owner, 'Every read must filter the active owner');
              if (state.offline) throw new Error('offline');
              if (state.missingTable) return { error: { code: '42P01', message: 'table missing' }, data: null };
              const rows = [...database.values()].filter((row) => row.user_id === owner)
                .sort((a, b) => a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : a.message_id < b.message_id ? 1 : a.message_id > b.message_id ? -1 : 0).slice(0, count);
              if (state.foreignRow) rows.push({ user_id: 'foreign', message_id: 'foreign', role: 'user', text: 'private', created_at: message('x', 0).createdAt!, provider: null });
              if (state.switchOnRead) state.owner = 'other-account';
              return { error: null, data: rows };
            },
          };
          return query;
        },
      };
    },
  };
}

async function main() {
  const database = new Map<string, Row>();
  const clientA = fakeClient(database, 'account-a');
  const clientB = fakeClient(database, 'account-a');
  const a = createSupabaseChatTransport(clientA);
  const b = createSupabaseChatTransport(clientB);
  const initial = [message('first', 0), message('reply-first', 1, 'koda')];
  await a.push('account-a', initial, 'gemini');
  assert.deepEqual((await b.pull('account-a')).messages, initial);
  clientA.state.offline = true;
  clientB.state.offline = true;
  const localA = [...initial, message('offline-a', 2), message('reply-offline-a', 3, 'koda')];
  const localB = [...initial, message('offline-b', 2), message('reply-offline-b', 4, 'koda')];
  await assert.rejects(a.push('account-a', localA), /offline/);
  await assert.rejects(b.pull('account-a'), /offline/);
  assert.equal(database.size, 2);
  clientA.state.offline = false;
  clientB.state.offline = false;
  await Promise.all([a.push('account-a', localA, 'openrouter'), b.push('account-a', localB, 'yandex')]);
  const remoteA = await a.pull('account-a');
  const remoteB = await b.pull('account-a');
  const mergedA = mergeChatMessages(localA, remoteA.messages);
  const mergedB = mergeChatMessages(localB, remoteB.messages);
  assert.deepEqual(mergedA, mergedB, 'Both devices converge after independent offline appends');
  assert.equal(mergedA.length, 6);
  assert.deepEqual(mergedA.map((item) => item.id), ['first', 'reply-first', 'offline-a', 'offline-b', 'reply-offline-a', 'reply-offline-b']);
  assert.equal(remoteA.provider, 'yandex');
  await a.push('account-a', localA, 'openrouter');
  await b.push('account-a', [message('reply-first', 10, 'koda', 'different retry reply')], 'yandex');
  assert.equal(database.size, 6, 'Retries add no duplicate rows');
  assert.equal((await a.pull('account-a')).messages.find((item) => item.id === 'reply-first')!.text, 'reply-first', 'Canonical rows are immutable');
  const newerLocal = message('unsynced', 5);
  assert.deepEqual(mergeChatMessages([message('first', 100, 'user', 'changed locally'), newerLocal], remoteA.messages), [...remoteA.messages, newerLocal]);

  const otherClient = fakeClient(database, 'account-b');
  const other = createSupabaseChatTransport(otherClient);
  await other.push('account-b', [message('first', 0, 'user', 'account B private')]);
  assert.equal((await other.pull('account-b')).messages.length, 1);
  assert.equal((await a.pull('account-a')).messages[0].text, 'first');
  const queriesBeforeGuest = clientA.state.queries;
  await a.push(null, [message('guest', 5)]);
  assert.deepEqual(await a.pull(undefined), { messages: [], provider: null });
  assert.equal(clientA.state.queries, queriesBeforeGuest);
  await assert.rejects(a.push('account-b', initial), /account changed/);
  await assert.rejects(a.pull('account-b'), /account changed/);
  assert.equal(clientA.state.queries, queriesBeforeGuest, 'Mismatched owner must never reach a data query');
  clientA.state.foreignRow = true;
  await assert.rejects(a.pull('account-a'), /another account/);
  clientA.state.foreignRow = false;
  clientA.state.authError = true;
  await assert.rejects(a.pull('account-a'), /auth unavailable/);
  clientA.state.authError = false;
  clientA.state.missingTable = true;
  await assert.rejects(a.pull('account-a'), (error: any) => error.code === '42P01');
  await assert.rejects(a.push('account-a', initial), (error: any) => error.code === '42P01');
  clientA.state.missingTable = false;
  clientA.state.switchOnRead = true;
  await assert.rejects(a.pull('account-a'), /account changed/);
  clientA.state.switchOnRead = false;
  clientA.state.owner = 'account-a';
  clientA.state.switchOnWrite = true;
  await assert.rejects(a.push('account-a', initial), /account changed/);
  clientA.state.switchOnWrite = false;
  clientA.state.owner = 'account-a';

  const bounded = mergeChatMessages(Array.from({ length: 250 }, (_, index) => message(String(index), index)).reverse(), []);
  assert.equal(bounded.length, 200);
  assert.equal(bounded[0].id, '50');
  assert.equal(bounded[199].id, '249');
  assert.deepEqual(mergeChatMessages([message('z', 0), message('a', 0)], []), [message('a', 0), message('z', 0)]);
  const legacy: ChatMessage = { id: 'legacy', role: 'user', text: 'Old local message' };
  await a.push('account-a', [legacy]);
  const legacyRow = (await a.pull('account-a')).messages.find((item) => item.id === 'legacy')!;
  assert.equal(legacyRow.createdAt, '1970-01-01T00:00:00.000Z');
  await a.push('account-a', [legacy]);
  assert.deepEqual((await a.pull('account-a')).messages.find((item) => item.id === 'legacy'), legacyRow);
  assert.equal(normalizeChatCreatedAt('bad'), undefined);
  assert.equal(normalizeChatCreatedAt('2026-99-99T99:00:00Z'), undefined);
  assert.equal(normalizeChatCreatedAt('2026-10-21T15:00:00+03:00'), '2026-10-21T12:00:00.000Z');
  assert.deepEqual(parseChatHistory(JSON.stringify({ version: 1, messages: initial })).messages, initial);
  assert.deepEqual(parseChatHistory(JSON.stringify({ version: 1, messages: [{ ...legacy, createdAt: 'invalid' }] })).messages, [legacy]);
  console.log('Chat sync tests passed: offline convergence, append-only retries, canonical merge, owner/auth isolation, errors, bounds and timestamps.');
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
