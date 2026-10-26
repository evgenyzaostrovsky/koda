import {
  CHAT_HISTORY_MAX_MESSAGES,
  normalizeChatCreatedAt,
  normalizeChatHistory,
  type ChatHistoryOwner,
  type ChatHistoryProvider,
} from './chatHistory';
import type { ChatMessage } from './types';

export type ChatSyncSnapshot = { messages: ChatMessage[]; provider: ChatHistoryProvider };
export type ChatTransport = {
  push(owner: ChatHistoryOwner, messages: ChatMessage[], provider?: ChatHistoryProvider): Promise<void>;
  pull(owner: ChatHistoryOwner): Promise<ChatSyncSnapshot>;
};

// Stable fallback: legacy messages must not acquire a newer timestamp on each retry/device.
const LEGACY_CREATED_AT = '1970-01-01T00:00:00.000Z';
function compareMessages(a: ChatMessage, b: ChatMessage): number {
  const aTime = a.createdAt ?? LEGACY_CREATED_AT;
  const bTime = b.createdAt ?? LEGACY_CREATED_AT;
  return aTime < bTime ? -1 : aTime > bTime ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function normalizeMessages(messages: unknown): ChatMessage[] {
  if (!Array.isArray(messages)) return [];
  const byId = new Map<string, ChatMessage>();
  for (const value of messages) {
    const message = normalizeChatHistory({ version: 1, messages: [value] }).messages[0];
    if (message) byId.set(message.id, message);
  }
  return [...byId.values()];
}

/** Remote rows are immutable/canonical; unsynced local IDs survive the union. */
export function mergeChatMessages(local: ChatMessage[], remote: ChatMessage[]): ChatMessage[] {
  const byId = new Map<string, ChatMessage>();
  for (const message of [...normalizeMessages(local), ...normalizeMessages(remote)]) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessages).slice(-CHAT_HISTORY_MAX_MESSAGES);
}

function providerValue(value: unknown): ChatHistoryProvider {
  return value === 'gemini' || value === 'openrouter' || value === 'yandex' ? value : null;
}

/** Structural client keeps tests independent of Supabase/network/runtime configuration. */
export function createSupabaseChatTransport(client: any): ChatTransport {
  async function requireOwner(owner: string): Promise<void> {
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    if (result.data?.session?.user?.id !== owner) throw new Error('Chat sync account changed.');
  }

  return {
    async push(owner, messages, provider = null) {
      if (!owner) return;
      await requireOwner(owner);
      const normalized = normalizeMessages(messages).sort(compareMessages);
      const latestReply = [...normalized].reverse().find((message) => message.role === 'koda');
      const rows = normalized.map((message) => ({
        user_id: owner,
        message_id: message.id,
        role: message.role,
        text: message.text,
        created_at: message.createdAt ?? LEGACY_CREATED_AT,
        provider: message.id === latestReply?.id ? providerValue(provider) : null,
      }));
      if (!rows.length) return;
      // The insert payload scopes every row to owner. RLS verifies the live JWT owner.
      const result = await client.from('chat_messages').upsert(rows, {
        onConflict: 'user_id,message_id', ignoreDuplicates: true,
      });
      if (result.error) throw result.error;
      await requireOwner(owner);
    },
    async pull(owner) {
      if (!owner) return { messages: [], provider: null };
      await requireOwner(owner);
      const result = await client.from('chat_messages')
        .select('user_id,message_id,role,text,created_at,provider')
        .eq('user_id', owner)
        .order('created_at', { ascending: false })
        .order('message_id', { ascending: false })
        .limit(CHAT_HISTORY_MAX_MESSAGES);
      if (result.error) throw result.error;
      await requireOwner(owner);
      if (!Array.isArray(result.data)) throw new Error('Invalid chat history response.');
      const providers = new Map<string, ChatHistoryProvider>();
      const messages: ChatMessage[] = [];
      for (const row of result.data) {
        // Fail closed rather than returning any data if a transport violates owner isolation.
        if (!row || row.user_id !== owner) throw new Error('Chat history belongs to another account.');
        const createdAt = normalizeChatCreatedAt(row.created_at);
        if (!createdAt) throw new Error('Invalid chat message timestamp.');
        const normalized = normalizeMessages([{ id: row.message_id, role: row.role, text: row.text, createdAt }]);
        if (!normalized.length) throw new Error('Invalid chat message.');
        messages.push(normalized[0]);
        providers.set(normalized[0].id, providerValue(row.provider));
      }
      messages.sort(compareMessages);
      const latestProvider = [...messages].reverse().find((message) => message.role === 'koda' && providers.get(message.id));
      return { messages, provider: latestProvider ? providers.get(latestProvider.id)! : null };
    },
  };
}
