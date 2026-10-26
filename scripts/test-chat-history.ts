import assert from 'node:assert/strict';
import {
  CHAT_HISTORY_MAX_MESSAGES,
  CHAT_HISTORY_MAX_USER_CHARS,
  CHAT_HISTORY_MAX_ASSISTANT_CHARS,
  chatHistoryKey,
  createChatHistoryStore,
  normalizeChatHistory,
  parseChatHistory,
  type ChatHistorySnapshot,
  type ChatHistoryStorage,
} from '../src/features/koda/chatHistory';

function fixture(text = 'Hello'): ChatHistorySnapshot {
  return {
    version: 1,
    messages: [{ id: 'user-1', role: 'user', text }, { id: 'koda-1', role: 'koda', text: 'Reply' }],
    provider: 'yandex',
    pendingRequest: [{ role: 'assistant', content: 'Reply' }, { role: 'user', content: 'Continue' }],
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  return { data, getItem: async (key: string) => data.get(key) ?? null, setItem: async (key: string, value: string) => { data.set(key, value); } };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  const empty = { version: 1, messages: [], provider: null, pendingRequest: null };
  assert.equal(chatHistoryKey(null), chatHistoryKey(undefined));
  assert.equal(chatHistoryKey(''), chatHistoryKey(null));
  const owners = [null, 'guest', 'user:guest', 'a/b', 'a%2Fb', ' a ', 'a', '__proto__'];
  assert.equal(new Set(owners.map(chatHistoryKey)).size, owners.length);
  for (const raw of [null, undefined, '', '{bad', 'null', '[]', '1', '{"version":2}', '{"messages":[]}']) {
    assert.deepEqual(parseChatHistory(raw), empty);
  }
  const normalized = normalizeChatHistory({
    ...fixture(), provider: 'untrusted', credentials: 'never persist',
    messages: [null, {}, { id: 'bad', role: 'system', text: 'bad' }, { id: 'blank', role: 'user', text: '  ' },
      { id: 'same', role: 'user', text: 'old' }, { id: 'same', role: 'user', text: 'latest' },
      { id: 'safe', role: 'koda', text: '<script>no execution</script>', extra: 'drop' }],
    pendingRequest: [{ role: 'system', content: 'bad' }, { role: 'user', content: 'last' }],
  });
  assert.deepEqual(normalized, { version: 1, messages: [{ id: 'same', role: 'user', text: 'latest' }, { id: 'safe', role: 'koda', text: '<script>no execution</script>' }], provider: null, pendingRequest: null });
  assert.equal(normalizeChatHistory({ ...fixture(), pendingRequest: [{ role: 'assistant', content: 'reply' }] }).pendingRequest, null);

  const withPendingId: ChatHistorySnapshot = { ...fixture(), pendingMessageId: 'user-1' };
  assert.deepEqual(normalizeChatHistory(withPendingId), withPendingId);
  assert.deepEqual(parseChatHistory(JSON.stringify(withPendingId)), withPendingId);
  const acknowledged = { ...withPendingId, syncedMessageIds: ['user-1', 'koda-1'] };
  assert.deepEqual(parseChatHistory(JSON.stringify(acknowledged)), acknowledged, 'Cloud acknowledgements survive reload');
  assert.deepEqual(normalizeChatHistory({ ...withPendingId, syncedMessageIds: ['user-1', null, 42, {}, 'missing', 'user-1'] }).syncedMessageIds, ['user-1']);
  for (const syncedMessageIds of [undefined, null, {}, 'user-1', 123]) {
    assert.equal(Object.hasOwn(normalizeChatHistory({ ...withPendingId, syncedMessageIds }), 'syncedMessageIds'), false);
  }
  assert.equal(Object.hasOwn(normalizeChatHistory(withPendingId), 'syncedMessageIds'), false, 'Legacy histories remain conservative until cloud confirmation');
  assert.equal(Object.hasOwn(normalizeChatHistory(fixture()), 'pendingMessageId'), false, 'Legacy snapshots keep the optional field absent');
  for (const pendingMessageId of [undefined, null, 42, {}, '', 'unknown-user', 'koda-1', 'x'.repeat(129)]) {
    assert.equal(Object.hasOwn(normalizeChatHistory({ ...fixture(), pendingMessageId }), 'pendingMessageId'), false);
  }
  const longestId = 'x'.repeat(128);
  assert.equal(normalizeChatHistory({ ...withPendingId, messages: [{ id: longestId, role: 'user', text: 'User message' }], pendingMessageId: longestId }).pendingMessageId, longestId);
  for (const pendingRequest of [null, [], [{ role: 'assistant', content: 'not a user request' }], [{ role: 'system', content: 'invalid role' }]]) {
    assert.equal(Object.hasOwn(normalizeChatHistory({ ...withPendingId, pendingRequest }), 'pendingMessageId'), false);
  }
  const evictedPending = normalizeChatHistory({ ...withPendingId,
    messages: [withPendingId.messages[0], ...Array.from({ length: 200 }, (_, index) => ({ id: `later-${index}`, role: 'user', text: 'Later message' }))],
  });
  assert.equal(Object.hasOwn(evictedPending, 'pendingMessageId'), false, 'A pending ID outside the retained history is removed');
  const boundedAcks = normalizeChatHistory({ ...withPendingId,
    messages: Array.from({ length: 220 }, (_, index) => ({ id: `ack-${index}`, role: 'user', text: 'Message' })),
    syncedMessageIds: Array.from({ length: 220 }, (_, index) => `ack-${index}`),
  });
  assert.equal(boundedAcks.syncedMessageIds?.length, CHAT_HISTORY_MAX_MESSAGES);
  assert.equal(boundedAcks.syncedMessageIds?.[0], 'ack-20', 'Acknowledgements only cover retained IDs');

  const oversized = normalizeChatHistory({ ...fixture(),
    messages: Array.from({ length: 220 }, (_, index) => ({ id: String(index), role: index % 2 ? 'koda' : 'user', text: 'x'.repeat(5000) })),
    pendingRequest: Array.from({ length: 220 }, (_, index) => ({ role: index % 2 ? 'user' : 'assistant', content: 'x'.repeat(5000) })),
  });
  assert.equal(oversized.messages.length, CHAT_HISTORY_MAX_MESSAGES);
  assert.equal(oversized.messages[0].id, '20');
  assert.equal(oversized.messages[0].text.length, CHAT_HISTORY_MAX_USER_CHARS);
  assert.equal(oversized.messages[1].text.length, CHAT_HISTORY_MAX_ASSISTANT_CHARS);
  assert.equal(oversized.pendingRequest!.length, CHAT_HISTORY_MAX_MESSAGES);
  assert.equal(oversized.pendingRequest![0].content.length, CHAT_HISTORY_MAX_ASSISTANT_CHARS);
  assert.equal(oversized.pendingRequest![1].content.length, CHAT_HISTORY_MAX_USER_CHARS);
  assert.deepEqual(parseChatHistory(JSON.stringify(oversized)), oversized);

  const memory = memoryStorage();
  const store = createChatHistoryStore(memory);
  await assert.rejects(store.save('a', fixture()), /loaded/);
  assert.equal(memory.data.size, 0);
  for (const owner of owners) {
    assert.deepEqual(await store.load(owner), empty);
    await store.save(owner, fixture(String(owner)));
  }
  const reloaded = createChatHistoryStore(memory);
  for (const owner of owners) assert.deepEqual(await reloaded.load(owner), fixture(String(owner)));
  await store.load('pending-owner');
  await store.save('pending-owner', withPendingId);
  assert.deepEqual(await reloaded.load('pending-owner'), withPendingId, 'Pending message identity survives a new store instance');
  await store.load('ack-owner');
  await store.save('ack-owner', acknowledged);
  assert.deepEqual(await reloaded.load('ack-owner'), acknowledged);
  assert.equal((await reloaded.load('other-owner')).syncedMessageIds, undefined, 'Acknowledgements stay owner-scoped');
  await store.save('pending-owner', { ...withPendingId, pendingRequest: null });
  assert.equal(Object.hasOwn(await reloaded.load('pending-owner'), 'pendingMessageId'), false, 'Completing a request clears its identity on disk');
  memory.data.set(chatHistoryKey('corrupt'), '{broken');
  assert.deepEqual(await reloaded.load('corrupt'), empty);
  await reloaded.save('corrupt', fixture());
  assert.deepEqual(await reloaded.load('corrupt'), fixture());

  const readGate = deferred();
  const delayedRead = createChatHistoryStore({ getItem: async () => { await readGate.promise; return JSON.stringify(fixture('existing')); }, setItem: memory.setItem });
  const loading = delayedRead.load('a');
  await assert.rejects(delayedRead.save('a', fixture('erase')), /loaded/);
  readGate.resolve();
  assert.equal((await loading).messages[0].text, 'existing');

  const firstWrite = deferred();
  const started = deferred();
  const writes: string[] = [];
  let writeCount = 0;
  const ordered = createChatHistoryStore({ getItem: memory.getItem, setItem: async (key, value) => {
    writeCount += 1;
    if (writeCount === 1) { started.resolve(); await firstWrite.promise; }
    writes.push(parseChatHistory(value).messages[0].text);
    await memory.setItem(key, value);
  } });
  await ordered.load('ordered');
  await ordered.load('other');
  const first = ordered.save('ordered', fixture('first'));
  await started.promise;
  const secondSnapshot = fixture('second');
  const second = ordered.save('ordered', secondSnapshot);
  secondSnapshot.messages[0].text = 'mutated later';
  await ordered.save('other', fixture('independent'));
  assert.deepEqual(writes, ['independent'], 'Other owners need not wait for the blocked owner');
  const loadAfterWrites = ordered.load('ordered');
  firstWrite.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(writes, ['independent', 'first', 'second']);
  assert.equal((await loadAfterWrites).messages[0].text, 'second');

  let failRead = true;
  let failWrite = true;
  const failing: ChatHistoryStorage = {
    getItem: async (key) => { if (failRead) throw new Error('read unavailable'); return memory.getItem(key); },
    setItem: async (key, value) => { if (failWrite) { failWrite = false; throw new Error('quota'); } await memory.setItem(key, value); },
  };
  const recovering = createChatHistoryStore(failing);
  await assert.rejects(recovering.load('failure'), /read unavailable/);
  await assert.rejects(recovering.save('failure', fixture()), /loaded/);
  failRead = false;
  await recovering.load('failure');
  const failed = recovering.save('failure', fixture('failed'));
  const succeeded = recovering.save('failure', fixture('retry'));
  await assert.rejects(failed, /quota/);
  await succeeded;
  assert.equal((await recovering.load('failure')).messages[0].text, 'retry');
  failRead = true;
  await assert.rejects(recovering.load('failure'), /read unavailable/);
  await assert.rejects(recovering.save('failure', fixture('erase')), /loaded/);
  console.log('Chat history tests passed: normalization, isolation, reload, hydration, ordering, bounded data, failures.');
}

void main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
