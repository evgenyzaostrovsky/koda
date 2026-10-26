import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseChatTransport, mergeChatMessages } from '../src/features/koda/chatSync';
import { createChatHistoryStore } from '../src/features/koda/chatHistory';
import type { ChatMessage } from '../src/features/koda/types';

// Explicit opt-in: writes only synthetic messages in dedicated test accounts.
async function main() {
  assert.equal(process.env.KODA_CHAT_LIVE_TEST, '1', 'Set KODA_CHAT_LIVE_TEST=1 to allow live test writes.');
  dotenv.config({ path: '.env.local', quiet: true }); dotenv.config({ quiet: true });
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL!, key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;
  assert(url && key, 'Supabase configuration missing');
  const credentialPath = '.env.chat-sync.local';
  let accounts: { email: string; password: string; username: string }[];
  try { accounts = JSON.parse(await readFile(credentialPath, 'utf8')); }
  catch (error: any) {
    if (error.code !== 'ENOENT') throw error;
    assert.equal(process.env.KODA_CHAT_LIVE_CREATE, '1', 'Dedicated account fixture missing; allow creation explicitly.');
    const suffix = randomBytes(5).toString('hex');
    accounts = ['a', 'b'].map(label => ({ username: `chatqa_${label}_${suffix}`, email: `chatqa_${label}_${suffix}@koda-life.vercel.app`, password: randomBytes(24).toString('base64url') }));
    // Save before creation so failed attempts can be investigated without losing fixture credentials.
    await writeFile(credentialPath, JSON.stringify(accounts), { flag: 'wx', mode: 0o600 });
    for (const account of accounts) {
      const response = await fetch('https://koda-life.vercel.app/api/auth-register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: account.username, password: account.password, name: 'KODA Chat Sync QA' }) });
      assert(response.ok, `Test account registration failed (${response.status})`);
    }
  }
  const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const clients = [client(), client(), client(), client()];
  const owners: string[] = [];
  for (let i = 0; i < clients.length; i++) {
    const account = accounts[i < 2 ? 0 : 1];
    const { data, error } = await clients[i].auth.signInWithPassword(account);
    assert.equal(error, null, `Test session ${i} login failed`); assert(data.user);
    owners.push(data.user.id);
  }
  assert.equal(owners[0], owners[1]); assert.equal(owners[2], owners[3]); assert.notEqual(owners[0], owners[2]);
  const transports = clients.map(createSupabaseChatTransport);
  const run = `live-${randomBytes(6).toString('hex')}`;
  const message = (id: string, text: string, offset = 0, role: 'user' | 'koda' = 'user'): ChatMessage => ({ id: `${run}-${id}`, text, role, createdAt: new Date(Date.now() + offset).toISOString() });
  const a = message('same-id', 'Synthetic account A message');
  const b = message('same-id', 'Synthetic account B message');
  await Promise.all([transports[0].push(owners[0], [a]), transports[2].push(owners[2], [b])]);
  await Promise.all(Array.from({ length: 4 }, () => transports[1].push(owners[0], [a])));
  await transports[1].push(owners[0], [{ ...a, text: 'Synthetic attempt to replace canonical content' }]);
  const aRemote = await transports[1].pull(owners[0]), bRemote = await transports[3].pull(owners[2]);
  assert.equal(aRemote.messages.filter(m => m.id === a.id).length, 1);
  assert.equal(aRemote.messages.find(m => m.id === a.id)?.text, a.text);
  assert.equal(bRemote.messages.find(m => m.id === b.id)?.text, b.text);
  console.log('PASS live: separate sessions, duplicate retries, same message ID isolated by account');

  const offline1 = message('offline-1', 'Synthetic offline device 1', 1), offline2 = message('offline-2', 'Synthetic offline device 2', 2);
  await Promise.all([transports[0].push(owners[0], [offline1]), transports[1].push(owners[0], [offline2])]);
  const merged = mergeChatMessages([a, offline1], (await transports[1].pull(owners[0])).messages);
  await transports[0].push(owners[0], merged);
  const converged = (await transports[1].pull(owners[0])).messages.filter(m => m.id.startsWith(run));
  assert.equal(converged.length, 3); assert.equal(new Set(converged.map(m => m.id)).size, 3);
  const reply = { ...message('reply', 'Synthetic canonical reply', 3, 'koda'), id: `reply-${a.id}` };
  await Promise.all([transports[0].push(owners[0], [reply], 'yandex'), transports[1].push(owners[0], [{ ...reply, text: 'Synthetic competing reply' }], 'yandex')]);
  const replies = (await transports[0].pull(owners[0])).messages.filter(m => m.id === reply.id);
  assert.equal(replies.length, 1);
  assert.equal((await transports[1].pull(owners[0])).messages.find(m => m.id === reply.id)?.text, replies[0].text);
  console.log('PASS live: concurrent offline additions converge; competing replies produce one canonical row');

  for (const [i, foreign] of [[0, owners[2]], [2, owners[0]]] as const) {
    const read = await clients[i].from('chat_messages').select('message_id').eq('user_id', foreign);
    assert.equal(read.error, null); assert.deepEqual(read.data, []);
    const forged = await clients[i].from('chat_messages').insert({ user_id: foreign, message_id: `${run}-forged`, role: 'user', text: 'Synthetic forbidden write' });
    assert.equal(forged.error?.code, '42501');
  }
  const anon = await client().from('chat_messages').select('message_id').limit(1);
  assert.equal(anon.error?.code, '42501');
  const update = await clients[0].from('chat_messages').update({ text: 'Synthetic forbidden edit' }).eq('message_id', a.id);
  assert.equal(update.error?.code, '42501');
  console.log('PASS live: real JWT RLS denies foreign reads/writes, anonymous reads and updates');

  const memory = new Map<string, string>();
  const storage = { getItem: async (k: string) => memory.get(k) ?? null, setItem: async (k: string, v: string) => { memory.set(k, v); } };
  const local = createChatHistoryStore(storage);
  await local.load(owners[0]); await local.load(owners[2]);
  await local.save(owners[0], { version: 1, messages: [a], provider: null, pendingRequest: null });
  await local.save(owners[2], { version: 1, messages: [b], provider: null, pendingRequest: null });
  const switchResult = await clients[1].auth.signInWithPassword(accounts[1]); assert.equal(switchResult.error, null);
  await assert.rejects(transports[1].pull(owners[0]), /account changed/);
  await assert.rejects(transports[1].push(owners[0], [message('stale-owner', 'Synthetic stale owner write')]), /account changed/);
  const switched = await transports[1].pull(owners[2]);
  assert.equal(switched.messages.find(m => m.id === b.id)?.text, b.text);
  assert.equal((await local.load(owners[0])).messages[0].text, a.text);
  assert.equal((await local.load(owners[2])).messages[0].text, b.text);
  console.log('PASS live: account switch rejects stale owner and restores separately scoped history');
  for (const c of clients) await c.auth.signOut({ scope: 'local' });
  console.log('PASS live chat sync: 2 dedicated accounts, 4 independent authenticated clients; synthetic rows retained for review.');
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Live chat test failed'); process.exitCode = 1; });
