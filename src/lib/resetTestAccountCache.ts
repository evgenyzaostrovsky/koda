type Storage = {
  getAllKeys(): Promise<readonly string[]>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

/** Explicit, local-development maintenance. Never clears auth or another owner. */
export async function resetTestAccountCache(storage: Storage, owner: string, target: string | undefined, revision: string | undefined) {
  if (!target || !revision || owner !== target) return;
  const marker = `koda:test-reset:${owner}:${revision}`;
  if (await storage.getItem(marker)) return;
  const keys = (await storage.getAllKeys()).filter(key =>
    key.startsWith('koda:') && !key.startsWith('koda:test-reset:') &&
    (key.endsWith(`:${owner}`) || key === `koda:chat-history:v1:user:${JSON.stringify(owner)}`)
  );
  for (const key of keys) await storage.removeItem(key);
  await storage.setItem(marker, 'done');
}
