/** Serializes snapshots and prevents an old acknowledgement from clearing newer edits. */
export class SyncCoordinator {
  private revisions = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  revision(domain: string) { return this.revisions.get(domain) ?? 0; }
  changed(domain: string) { this.revisions.set(domain, this.revision(domain) + 1); }
  current(domain: string, revision: number) { return this.revision(domain) === revision; }
  run(domain: string, revision: number, work: () => Promise<void>) {
    const next = this.tail.then(() => this.current(domain, revision) ? work() : undefined);
    this.tail = next.catch(() => undefined);
    return next;
  }
}

export function parseDeletedIds(raw: string | null): string[] {
  try { const value = JSON.parse(raw ?? '[]'); return Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []; }
  catch { return []; }
}

export async function journalRowId(owner: string, localId: string) {
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(localId)) return localId;
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${owner}:${localId}`));
  const hex = Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
