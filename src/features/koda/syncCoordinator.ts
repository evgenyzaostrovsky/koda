import { mergeEmotionEntries } from './emotionJournal';
import { createGoalActionCopyBackup, mergeProjects, mergeStoredKodaState, normalizeStoredKodaState, type StoredKodaState } from './persistence';
import { mergePetState, parsePetState } from './petState';
import { mergeAutoPlans, parseAutoPlanState } from './autoPlan';
import { RequiredSyncDateError } from './syncDate';

/** Serializes snapshots and prevents an old acknowledgement from clearing newer edits. */
export class SyncCoordinator {
  private revisions = new Map<string, number>();
  private tail: Promise<unknown> = Promise.resolve();
  revision(domain: string) { return this.revisions.get(domain) ?? 0; }
  changed(domain: string) { this.revisions.set(domain, this.revision(domain) + 1); }
  current(domain: string, revision: number) { return this.revision(domain) === revision; }
  restorePending<T extends string>(persisted: T[], current: T[]): T[] {
    // Queue hydration can finish after a pull repaired a goal. Preserve changes
    // made by this account's coordinator, without importing another account's queue.
    return [...new Set([...persisted, ...current.filter(domain => this.revision(domain) > 0)])];
  }
  run(domain: string, revision: number, work: () => Promise<void>) {
    const next = this.tail.then(() => this.current(domain, revision) ? work() : undefined);
    this.tail = next.catch(() => undefined);
    return next;
  }
  schedule(domain: string, revision: number, work: () => Promise<void>, callbacks: {
    isPending: () => boolean;
    isActive: () => boolean;
    onSuccess: () => void;
    onError: (error: unknown) => void;
  }, delay = 650) {
    let cancelled = false;
    const relevant = () => callbacks.isActive() && callbacks.isPending() && this.current(domain, revision);
    const timeout = setTimeout(() => {
      void this.run(domain, revision, async () => {
        if (cancelled || !relevant()) return;
        try {
          await work();
          // Effect cleanup may mean a retry, not a new edit. Once work starts,
          // only the revision/account boundary decides whether it can acknowledge.
          if (relevant()) callbacks.onSuccess();
        } catch (error) {
          if (relevant()) callbacks.onError(error);
        }
      });
    }, delay);
    return () => { cancelled = true; clearTimeout(timeout); };
  }
}

export type SyncStage = 'snapshot' | 'goalMirror' | 'goals' | 'milestones' | 'actions' | 'routines' | 'routineLogs';
class SyncStageError extends Error {
  constructor(readonly stage: SyncStage, readonly original: unknown) { super('Synchronization stage failed'); }
}

export async function atSyncStage<T>(stage: SyncStage, work: () => PromiseLike<T>): Promise<T> {
  try { return await work(); }
  catch (error) { throw error instanceof SyncStageError ? error : new SyncStageError(stage, error); }
}

type SnapshotPhase = 'read' | 'merge' | 'write' | 'cas';
type SnapshotFailureKind = 'timeout' | 'network' | 'server' | 'local' | 'conflict';
const safeErrorCodes = ['23503', '23505', '23514', '42501', '42703', '42P01', '22P02', '22007', '22008', 'PGRST116', 'PGRST204', 'PGRST205', 'PGRST301'];
function safeErrorCode(error: unknown): string | undefined {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && safeErrorCodes.includes(code) ? code : undefined;
}

class SnapshotFailure extends Error {
  readonly kind: SnapshotFailureKind;
  readonly code?: string;
  constructor(readonly phase: SnapshotPhase, error: unknown, status?: number) {
    // Preserve rejection semantics for internal callers; UI only uses the finite labels below.
    super(error instanceof Error ? error.message : 'Snapshot operation failed');
    this.code = safeErrorCode(error);
    const value = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown; code?: unknown } : {};
    const message = typeof value.message === 'string' ? value.message : '';
    this.kind = phase === 'cas' ? 'conflict' : phase === 'merge' ? 'local'
      : value.name === 'AbortError' || value.name === 'TimeoutError' || value.code === 'ABORT_ERR' || /^(AbortError|TimeoutError):/.test(message) ? 'timeout'
      : status === 0 || value.name === 'NetworkError' || value.code === 'FETCH' || /^(TypeError: )?(Failed to fetch|Load failed|Network request failed|fetch failed)(?:$|[.:\s])/i.test(message) ? 'network'
      : (typeof status === 'number' && status >= 400) || (typeof value.code === 'string' && value.code.length > 0) ? 'server' : 'local';
  }
}

/** Never expose server messages, details, payloads or arbitrary error codes. */
export function syncFailureText(domain: string, error: unknown): string {
  const labels: Record<string, string> = { appState: 'данные приложения', planner: 'планнер', journal: 'дневник', notes: 'заметки', kodaDays: 'итоги дня' };
  const stages: Record<SyncStage, string> = { snapshot: 'данные приложения', goalMirror: 'цели', goals: 'цели', milestones: 'этапы целей', actions: 'шаги целей', routines: 'ритуалы целей', routineLogs: 'выполнение ритуалов' };
  const stage = error instanceof SyncStageError ? error.stage : undefined;
  const original = error instanceof SyncStageError ? error.original : error;
  if (original instanceof SnapshotFailure) {
    const phases: Record<SnapshotPhase, string> = { read: 'чтение снимка', merge: 'объединение снимка', write: 'запись снимка', cas: 'проверка версии (CAS)' };
    const kinds: Record<SnapshotFailureKind, string> = { timeout: 'тайм-аут или отмена запроса', network: 'ошибка сети', server: 'ошибка сервера', local: 'локальная ошибка', conflict: 'конфликт версий после 4 попыток' };
    const code = original.code ? ` (код ${original.code})` : '';
    return `Не удалось синхронизировать: ${phases[original.phase]} — ${kinds[original.kind]}${code}. Повторим автоматически.`;
  }
  const saved = domain === 'appState' && stage && stage !== 'snapshot' ? 'Снимок данных сохранён в облаке. ' : '';
  if (original instanceof RequiredSyncDateError) {
    const field = original.field === 'routineStart' ? 'дату начала ритуала' : 'дату выполнения ритуала';
    return `${saved}Для синхронизации укажите существующую ${field} с годом: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД.`;
  }
  const code = safeErrorCode(original);
  const suffix = code ? ` (код ${code})` : '';
  return `${saved}Не удалось синхронизировать: ${stage ? stages[stage] : labels[domain] ?? 'данные'}${suffix}. Повторим автоматически.`;
}

/** Merge against the latest row, retrying when another device wins the write. */
export async function writeAppStateSnapshot(client: any, userId: string, state: StoredKodaState) {
  let phase: SnapshotPhase = 'merge';
  let status: number | undefined;
  try {
    if (state.profile.pet && state.profile.pet.ownerId !== userId) throw new Error('Pet belongs to another account');
    if (state.profile.autoPlan && state.profile.autoPlan.ownerId !== userId) throw new Error('Auto plan belongs to another account');
    for (let attempt = 0; attempt < 4; attempt += 1) {
      // Selecting * also works on installations predating projects/koda_days.
      phase = 'read';
      status = undefined;
      const current = await client.from('user_app_state').select('*').eq('user_id', userId).maybeSingle();
      status = current.status;
      if (current.error) throw current.error;
      phase = 'merge';
      status = undefined;
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
          autoPlan: mergeAutoPlans(parseAutoPlanState(existingProfile.autoPlan, userId), parseAutoPlanState(state.profile.autoPlan, userId)),
          __kodaPomodoro: state.pomodoro,
          __kodaProjects: projects,
          __kodaDays: merged.kodaDays,
          __kodaActionCopy: createGoalActionCopyBackup(merged.goals, userId),
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
      phase = 'write';
      let result = await write();
      status = result.status;
      // A new account has no row from which to discover optional columns.
      if ((result.error?.code === '42703' || result.error?.code === 'PGRST204') && /projects|koda_days/i.test(result.error.message ?? '')) {
        delete payload.projects;
        delete payload.koda_days;
        status = undefined;
        result = await write();
        status = result.status;
      }
      if (result.error) {
        if (!current.data && result.error.code === '23505') continue;
        throw result.error;
      }
      if (result.data) return merged;
    }
    phase = 'cas';
    throw new Error('App state changed on another device; retry required');
  } catch (error) {
    throw new SnapshotFailure(phase, error, status);
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
