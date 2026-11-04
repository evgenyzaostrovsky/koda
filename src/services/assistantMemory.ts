import { normalizeAssistantMemoryContent, normalizeAssistantMemoryRow, type AssistantMemory } from '../ai/assistantMemory';

export type { AssistantMemory } from '../ai/assistantMemory';

const columns = 'id,user_id,content,created_at,updated_at';
const conflictMessage = 'Факт изменён или удалён на другом устройстве. Обновите память и повторите изменение.';

/** Injected client keeps regression tests local. No cache, guest store, or background write retry. */
export function createAssistantMemoryService(client: any) {
  async function requireOwner(expected?: string): Promise<string> {
    const { data, error } = await client.auth.getSession();
    const session = data?.session;
    if (error || !session?.access_token || !session.user?.id || session.user.is_anonymous === true) {
      throw new Error('Войдите в аккаунт, чтобы использовать память помощника.');
    }
    if (expected && session.user.id !== expected) throw new Error('Аккаунт изменился. Откройте память заново.');
    return session.user.id;
  }

  function checkId(id: string) {
    if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error('Некорректный идентификатор факта.');
  }

  async function resultRow(result: any, owner: string): Promise<AssistantMemory> {
    await requireOwner(owner);
    if (result.error) throw new Error('Не удалось сохранить память. Проверьте подключение и обновите список перед повтором.');
    if (!result.data) throw new Error(conflictMessage);
    return normalizeAssistantMemoryRow(result.data, owner);
  }

  return {
    async listAssistantMemories(): Promise<AssistantMemory[]> {
      const owner = await requireOwner();
      const memories: AssistantMemory[] = [];
      for (let offset = 0; offset < 10000; offset += 100) {
        const result = await client.from('assistant_memories').select(columns).eq('user_id', owner)
          .order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 99);
        await requireOwner(owner);
        if (result.error || !Array.isArray(result.data)) throw new Error('Не удалось загрузить память. Проверьте подключение.');
        memories.push(...result.data.map((row: unknown) => normalizeAssistantMemoryRow(row, owner)));
        if (result.data.length < 100) return memories;
      }
      throw new Error('Слишком много фактов. Не удалось загрузить полный список.');
    },
    async addAssistantMemory(content: string): Promise<AssistantMemory> {
      const normalized = normalizeAssistantMemoryContent(content);
      const owner = await requireOwner();
      // A failed/lost acknowledgement is not retried automatically: refresh before resubmitting.
      return resultRow(await client.from('assistant_memories').insert({ user_id: owner, content: normalized }).select(columns).single(), owner);
    },
    async updateAssistantMemory(id: string, content: string, updatedAt?: string): Promise<AssistantMemory> {
      checkId(id);
      const normalized = normalizeAssistantMemoryContent(content);
      const owner = await requireOwner();
      // Editors must supply their loaded revision; otherwise fetch one before the mutation.
      let revision = updatedAt;
      if (!revision) {
        const previous = await client.from('assistant_memories').select(columns).eq('user_id', owner).eq('id', id).maybeSingle();
        revision = (await resultRow(previous, owner)).updatedAt;
      }
      if (!Number.isFinite(Date.parse(revision))) throw new Error('Некорректная версия факта.');
      return resultRow(await client.from('assistant_memories').update({ content: normalized })
        .eq('user_id', owner).eq('id', id).eq('updated_at', revision).select(columns).maybeSingle(), owner);
    },
    async deleteAssistantMemory(id: string, updatedAt?: string): Promise<void> {
      checkId(id);
      const owner = await requireOwner();
      let query = client.from('assistant_memories').delete().eq('user_id', owner).eq('id', id);
      if (updatedAt) {
        if (!Number.isFinite(Date.parse(updatedAt))) throw new Error('Некорректная версия факта.');
        query = query.eq('updated_at', updatedAt);
      }
      const result = await query.select(columns).maybeSingle();
      await requireOwner(owner);
      if (result.error) throw new Error('Не удалось удалить факт. Проверьте подключение и обновите список.');
      if (result.data) normalizeAssistantMemoryRow(result.data, owner);
      else if (updatedAt) throw new Error(conflictMessage);
      // Without a revision, deleting an already absent row is idempotent.
    },
  };
}

async function service() {
  const { supabase } = await import('../lib/supabase');
  return createAssistantMemoryService(supabase);
}

export async function listAssistantMemories(): Promise<AssistantMemory[]> { return (await service()).listAssistantMemories(); }
export async function addAssistantMemory(content: string): Promise<AssistantMemory> { return (await service()).addAssistantMemory(content); }
export async function updateAssistantMemory(id: string, content: string, updatedAt?: string): Promise<AssistantMemory> { return (await service()).updateAssistantMemory(id, content, updatedAt); }
export async function deleteAssistantMemory(id: string, updatedAt?: string): Promise<void> { return (await service()).deleteAssistantMemory(id, updatedAt); }
