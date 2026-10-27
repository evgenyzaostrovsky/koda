import { mergeEmotionEntries } from './emotionJournal';
import { mergeProjects, mergeStoredKodaState, normalizeStoredKodaState, type StoredKodaState } from './persistence';
import { mergePetState, parsePetState } from './petState';

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

/** Merge against the latest row, retrying when another device wins the write. */
export async function writeAppStateSnapshot(client: any, userId: string, state: StoredKodaState) {
  if (state.profile.pet && state.profile.pet.ownerId !== userId) throw new Error('Pet belongs to another account');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    // Selecting * also works on installations predating projects/koda_days.
    const current = await client.from('user_app_state').select('*').eq('user_id', userId).maybeSingle();
    if (current.error) throw current.error;
    const remote = normalizeStoredKodaState(current.data);
    const existingProfile = current.data?.profile && typeof current.data.profile === 'object' ? current.data.profile : {};
    const projects = mergeProjects(remote?.projects ?? [], state.projects);
    const merged = remote ? mergeStoredKodaState(remote, state) : state;
    const payload: Record<string, unknown> = {
      user_id: userId,
      goals: merged.goals,
      habits: merged.habits,
      projects,
      koda_days: merged.kodaDays,
      profile: {
        ...existingProfile,
        ...state.profile,
        emotionEntries: mergeEmotionEntries(existingProfile.emotionEntries, state.profile.emotionEntries),
        pet: mergePetState(parsePetState(existingProfile.pet, userId), state.profile.pet),
        __kodaPomodoro: state.pomodoro,
        __kodaProjects: projects,
        __kodaDays: merged.kodaDays,
        ...(existingProfile.__kodaNotes ? { __kodaNotes: existingProfile.__kodaNotes } : {}),
      },
      updated_at: new Date().toISOString(),
    };
    if (current.data) {
      if (!Object.hasOwn(current.data, 'projects')) delete payload.projects;
      if (!Object.hasOwn(current.data, 'koda_days')) delete payload.koda_days;
    }
    const write = () => current.data
      ? client.from('user_app_state').update(payload).eq('user_id', userId)
        .eq('updated_at', current.data.updated_at).select('user_id').maybeSingle()
      : client.from('user_app_state').insert(payload).select('user_id').maybeSingle();
    let result = await write();
    // A new account has no row from which to discover optional columns.
    if ((result.error?.code === '42703' || result.error?.code === 'PGRST204') && /projects|koda_days/i.test(result.error.message ?? '')) {
      delete payload.projects;
      delete payload.koda_days;
      result = await write();
    }
    if (result.error) {
      if (!current.data && result.error.code === '23505') continue;
      throw result.error;
    }
    if (result.data) return;
  }
  throw new Error('App state changed on another device; retry required');
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
