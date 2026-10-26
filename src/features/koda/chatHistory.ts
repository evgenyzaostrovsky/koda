import type { ChatMessage } from './types';

export type ChatHistoryOwner = string | null | undefined;
export type ChatHistoryProvider = 'gemini' | 'openrouter' | 'yandex' | null;
export type ChatHistoryRequestMessage = { role: 'user' | 'assistant'; content: string };
export type ChatHistorySnapshot = {
  version: 1;
  messages: ChatMessage[];
  provider: ChatHistoryProvider;
  pendingRequest: ChatHistoryRequestMessage[] | null;
  pendingMessageId?: string;
  // Only retained message IDs confirmed by a successful cloud push/pull.
  syncedMessageIds?: string[];
};
export type ChatHistoryStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
};

export const CHAT_HISTORY_MAX_MESSAGES = 200;
export const CHAT_HISTORY_MAX_USER_CHARS = 2000;
export const CHAT_HISTORY_MAX_ASSISTANT_CHARS = 4000;
// Includes worst-case JSON escaping for both history and the pending request.
const MAX_RAW_CHARS = 12_000_000;

// JSON quoting is injective even for unusual owner IDs; guest never shares an account key.
export function chatHistoryKey(owner: ChatHistoryOwner): string {
  return `koda:chat-history:v1:${owner == null || owner === '' ? 'guest' : `user:${JSON.stringify(owner)}`}`;
}

function emptySnapshot(): ChatHistorySnapshot {
  return { version: 1, messages: [], provider: null, pendingRequest: null };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function normalizeChatCreatedAt(value: unknown): string | undefined {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : undefined;
}

function normalizePending(value: unknown): ChatHistoryRequestMessage[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const result: ChatHistoryRequestMessage[] = [];
  // Never silently skip a corrupt turn and replay a different conversation.
  for (const item of value.slice(-CHAT_HISTORY_MAX_MESSAGES)) {
    if (!record(item) || (item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string' || !item.content.trim()) return null;
    result.push({ role: item.role, content: item.content.slice(0, item.role === 'user' ? CHAT_HISTORY_MAX_USER_CHARS : CHAT_HISTORY_MAX_ASSISTANT_CHARS) });
  }
  return result[result.length - 1].role === 'user' ? result : null;
}

export function normalizeChatHistory(value: unknown): ChatHistorySnapshot {
  if (!record(value) || value.version !== 1) return emptySnapshot();
  const messages: ChatMessage[] = [];
  const seen = new Set<string>();
  if (Array.isArray(value.messages)) {
    // Retain the latest occurrence of duplicate IDs and the most recent bounded tail.
    for (const item of value.messages.slice(-CHAT_HISTORY_MAX_MESSAGES).reverse()) {
      if (!record(item) || typeof item.id !== 'string' || !item.id || item.id.length > 128 || seen.has(item.id) || (item.role !== 'user' && item.role !== 'koda') || typeof item.text !== 'string' || !item.text.trim()) continue;
      seen.add(item.id);
      const createdAt = normalizeChatCreatedAt(item.createdAt);
      messages.push({ id: item.id, role: item.role, text: item.text.slice(0, item.role === 'user' ? CHAT_HISTORY_MAX_USER_CHARS : CHAT_HISTORY_MAX_ASSISTANT_CHARS), ...(createdAt ? { createdAt } : {}) });
    }
    messages.reverse();
  }
  const provider = value.provider === 'gemini' || value.provider === 'openrouter' || value.provider === 'yandex' ? value.provider : null;
  const pendingRequest = normalizePending(value.pendingRequest);
  const pendingMessageId = pendingRequest && typeof value.pendingMessageId === 'string' && value.pendingMessageId.length <= 128
    && messages.some((message) => message.role === 'user' && message.id === value.pendingMessageId)
    ? value.pendingMessageId : undefined;
  const syncedIds = Array.isArray(value.syncedMessageIds)
    ? new Set(value.syncedMessageIds.filter((id): id is string => typeof id === 'string')) : null;
  return { version: 1, messages, provider, pendingRequest, ...(pendingMessageId ? { pendingMessageId } : {}),
    ...(syncedIds ? { syncedMessageIds: messages.filter(message => syncedIds.has(message.id)).map(message => message.id) } : {}) };
}

export function parseChatHistory(raw: string | null | undefined): ChatHistorySnapshot {
  if (!raw || raw.length > MAX_RAW_CHARS) return emptySnapshot();
  try {
    return normalizeChatHistory(JSON.parse(raw));
  } catch {
    return emptySnapshot();
  }
}

/** One shared instance per adapter. Operations are ordered per owner, not across devices/tabs. */
export function createChatHistoryStore(storage: ChatHistoryStorage) {
  const hydrated = new Set<string>();
  const queues = new Map<string, Promise<void>>();

  function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const result = (queues.get(key) ?? Promise.resolve()).then(operation);
    // Recover the queue after failures, while preserving rejection on the caller's promise.
    const tail = result.then(() => undefined, () => undefined);
    queues.set(key, tail);
    void tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
    return result;
  }

  return {
    load(owner: ChatHistoryOwner): Promise<ChatHistorySnapshot> {
      const key = chatHistoryKey(owner);
      hydrated.delete(key);
      return enqueue(key, async () => {
        const snapshot = parseChatHistory(await storage.getItem(key));
        hydrated.add(key);
        return snapshot;
      });
    },
    save(owner: ChatHistoryOwner, snapshot: ChatHistorySnapshot): Promise<void> {
      const key = chatHistoryKey(owner);
      if (!hydrated.has(key)) return Promise.reject(new Error('Chat history must be loaded before saving.'));
      // Capture at invocation time so later mutations cannot change an enqueued write.
      const serialized = JSON.stringify(normalizeChatHistory(snapshot));
      return enqueue(key, async () => { await storage.setItem(key, serialized); });
    },
  };
}
