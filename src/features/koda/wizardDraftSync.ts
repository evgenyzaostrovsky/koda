import { restoreWizardClarifications } from './wizardDraft';

export type WizardDraftPayload = {
  version: 1;
  step: number;
  wish: string;
  goalTitle: string;
  desiredResult: string;
  deadline: string;
  priority: 'main' | 'important' | 'supporting';
  directions: Array<{ id: string; title: string; actions: string[] }>;
  clarificationQuestions: string[];
  clarificationAnswers: string[];
};
export type WizardRevision = { id: string; parentIds: string[]; draft: WizardDraftPayload | null };
export type WizardSyncState = { version: 1; owner: string; revisions: WizardRevision[]; outbox: string[] };
export type WizardDraftTransport = {
  pull(owner: string): Promise<WizardRevision[]>;
  push(owner: string, revision: WizardRevision): Promise<void>;
};
export type WizardSyncView = {
  kind: 'empty' | 'draft' | 'deleted' | 'conflict';
  draft: WizardDraftPayload | null;
  heads: WizardRevision[];
};

const MAX_PARENTS = 256;
const MAX_REVISIONS = 10000;
const PAGE_SIZE = 200;
const ownerPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireOwnerId(owner: string): void {
  if (typeof owner !== 'string' || !ownerPattern.test(owner)) throw new Error('Wizard sync requires an authenticated account UUID.');
}
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;
}
function text(value: unknown, limit: number): string {
  return typeof value === 'string' ? value.slice(0, limit) : '';
}

/** Local payload migration/bounds. Does not trim answers or fill in any AI content. */
export function normalizeWizardDraft(value: unknown): WizardDraftPayload | null {
  if (!record(value) || value.version !== 1 || typeof value.wish !== 'string') return null;
  return {
    version: 1,
    step: typeof value.step === 'number' && Number.isFinite(value.step) ? Math.max(0, Math.min(4, Math.floor(value.step))) : 0,
    wish: text(value.wish, 4000),
    goalTitle: text(value.goalTitle ?? value.wish, 300),
    desiredResult: text(value.desiredResult, 4000),
    deadline: text(value.deadline, 32),
    priority: value.priority === 'main' || value.priority === 'supporting' ? value.priority : 'important',
    directions: (Array.isArray(value.directions) ? value.directions : []).slice(0, 8).map((item, index) => ({
      id: record(item) && validId(item.id) ? item.id : `restored-direction-${index}`,
      title: record(item) ? text(item.title, 300) : '',
      actions: record(item) && Array.isArray(item.actions) ? item.actions.slice(0, 8).map((action) => text(action, 300)) : [],
    })),
    ...restoreWizardClarifications(value),
  };
}

// Object property order is irrelevant; arrays (in particular Q/A positions) are not.
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function normalizeRevision(value: unknown): WizardRevision {
  if (!record(value) || !validId(value.id) || !Array.isArray(value.parentIds) || value.parentIds.length > MAX_PARENTS || !value.parentIds.every(validId)) {
    throw new Error('Invalid wizard draft revision.');
  }
  const parentIds = [...new Set(value.parentIds as string[])].sort();
  if (parentIds.length !== value.parentIds.length || parentIds.includes(value.id)) throw new Error('Invalid wizard draft ancestry.');
  const draft = value.draft === null ? null : normalizeWizardDraft(value.draft);
  // A remote/cached revision is immutable: do not silently repair its payload.
  if (value.draft !== null && (!draft || stableJson(draft) !== stableJson(value.draft))) throw new Error('Invalid wizard draft payload.');
  return { id: value.id, parentIds, draft };
}
function sameRevision(left: WizardRevision, right: WizardRevision): boolean {
  return stableJson(left) === stableJson(right);
}
function revisionUnion(local: WizardRevision[], incoming: WizardRevision[]): WizardRevision[] {
  const byId = new Map<string, WizardRevision>();
  for (const candidate of [...local, ...incoming]) {
    const revision = normalizeRevision(candidate);
    const existing = byId.get(revision.id);
    if (existing && !sameRevision(existing, revision)) throw new Error('Wizard revision ID collision: different content must not overwrite history.');
    byId.set(revision.id, revision);
  }
  if (byId.size > MAX_REVISIONS) throw new Error('Wizard history exceeds the supported limit; local draft retained.');
  // Kahn ordering validates the complete DAG without recursive stack growth.
  const children = new Map<string, string[]>();
  const remaining = new Map<string, number>();
  const ready: string[] = [];
  for (const revision of byId.values()) {
    remaining.set(revision.id, revision.parentIds.length);
    if (!revision.parentIds.length) ready.push(revision.id);
    for (const parent of revision.parentIds) {
      if (!byId.has(parent)) throw new Error('Incomplete wizard history: missing parent.');
      children.set(parent, [...(children.get(parent) ?? []), revision.id]);
    }
  }
  const ordered: WizardRevision[] = [];
  for (let cursor = 0; cursor < ready.length; cursor += 1) {
    const id = ready[cursor];
    ordered.push(byId.get(id)!);
    for (const child of children.get(id) ?? []) {
      const count = remaining.get(child)! - 1;
      remaining.set(child, count);
      if (count === 0) ready.push(child);
    }
  }
  if (ordered.length !== byId.size) throw new Error('Invalid wizard history cycle.');
  return ordered;
}

export function emptyWizardSyncState(owner: string): WizardSyncState {
  requireOwnerId(owner);
  return { version: 1, owner, revisions: [], outbox: [] };
}
export function parseWizardSyncState(raw: string | null, owner: string): WizardSyncState {
  const empty = emptyWizardSyncState(owner);
  if (raw === null) return empty;
  const value: unknown = JSON.parse(raw);
  if (!record(value) || value.version !== 1 || value.owner !== owner || !Array.isArray(value.revisions) || !Array.isArray(value.outbox)) {
    throw new Error('Invalid wizard sync state or account mismatch.');
  }
  const revisions = revisionUnion([], value.revisions as WizardRevision[]);
  const ids = new Set(revisions.map((item) => item.id));
  if (!value.outbox.every((id) => validId(id) && ids.has(id))) throw new Error('Invalid wizard outbox.');
  return { version: 1, owner, revisions, outbox: [...new Set(value.outbox as string[])] };
}
export function wizardSyncView(state: WizardSyncState): WizardSyncView {
  const parents = new Set(state.revisions.flatMap((item) => item.parentIds));
  const heads = state.revisions.filter((item) => !parents.has(item.id)).sort((a, b) => a.id.localeCompare(b.id));
  if (!heads.length) return { kind: 'empty', draft: null, heads };
  if (heads.length > 1) return { kind: 'conflict', draft: null, heads };
  return { kind: heads[0].draft === null ? 'deleted' : 'draft', draft: heads[0].draft, heads };
}
function append(state: WizardSyncState, draft: WizardDraftPayload | null, id: string, parents: string[]): WizardSyncState {
  requireOwnerId(state.owner);
  const revision = normalizeRevision({ id, parentIds: parents, draft });
  const existing = state.revisions.find((item) => item.id === id);
  if (existing) {
    if (!sameRevision(existing, revision)) throw new Error('Wizard revision ID already exists.');
    return state;
  }
  return { ...state, revisions: revisionUnion(state.revisions, [revision]), outbox: [...state.outbox, id] };
}
export function stageWizardDraft(state: WizardSyncState, draft: WizardDraftPayload | null, id: string): WizardSyncState {
  const view = wizardSyncView(state);
  if (view.kind === 'conflict') throw new Error('Resolve the wizard draft conflict before making a new revision.');
  if (view.heads.length && stableJson(view.draft) === stableJson(draft)) return state;
  return append(state, draft, id, view.heads.map((item) => item.id));
}
export function mergeWizardRevisions(state: WizardSyncState, remote: WizardRevision[]): WizardSyncState {
  requireOwnerId(state.owner);
  const revisions = revisionUnion(state.revisions, remote);
  const acknowledged = new Set(remote.map((item) => item.id));
  return { ...state, revisions, outbox: state.outbox.filter((id) => !acknowledged.has(id)) };
}
export function resolveWizardConflict(state: WizardSyncState, selectedId: string, newId: string): WizardSyncState {
  const view = wizardSyncView(state);
  const selected = view.heads.find((item) => item.id === selectedId);
  if (view.kind !== 'conflict' || !selected) throw new Error('Select a current wizard conflict version.');
  return append(state, selected.draft, newId, view.heads.map((item) => item.id));
}
export async function syncWizardDraft(state: WizardSyncState, transport: WizardDraftTransport): Promise<WizardSyncState> {
  let next = mergeWizardRevisions(state, await transport.pull(state.owner));
  const pending = new Set(next.outbox);
  for (const revision of next.revisions) {
    if (!pending.has(revision.id)) continue;
    await transport.push(state.owner, revision);
    next = { ...next, outbox: next.outbox.filter((id) => id !== revision.id) };
  }
  // Observe competing inserts that occurred while our immutable snapshots were uploaded.
  return mergeWizardRevisions(next, await transport.pull(state.owner));
}

/** Structural client keeps this adapter testable without production credentials or networking. */
export function createSupabaseWizardDraftTransport(client: any): WizardDraftTransport {
  async function requireSession(owner: string): Promise<void> {
    requireOwnerId(owner);
    const result = await client.auth.getSession();
    if (result.error) throw result.error;
    if (result.data?.session?.user?.id !== owner || result.data?.session?.user?.is_anonymous === true) throw new Error('Wizard sync account changed or is anonymous.');
  }
  function fromRow(row: unknown, owner: string): WizardRevision {
    if (!record(row) || row.user_id !== owner) throw new Error('Wizard draft belongs to another account.');
    return normalizeRevision({ id: row.revision_id, parentIds: row.parent_ids, draft: row.draft });
  }
  return {
    async pull(owner) {
      await requireSession(owner);
      const revisions: WizardRevision[] = [];
      // UUID/string order is stable under append-only inserts; a final refresh can discover
      // an insertion before the current page. Missing ancestry fails closed, never clears local data.
      for (let offset = 0; ; offset += PAGE_SIZE) {
        await requireSession(owner);
        const result = await client.from('goal_wizard_drafts')
          .select('user_id,revision_id,parent_ids,draft,created_at')
          .eq('user_id', owner).order('revision_id', { ascending: true }).range(offset, offset + PAGE_SIZE - 1);
        if (result.error) throw result.error;
        await requireSession(owner);
        if (!Array.isArray(result.data)) throw new Error('Invalid wizard history response.');
        revisions.push(...result.data.map((row: unknown) => fromRow(row, owner)));
        if (revisions.length > MAX_REVISIONS) throw new Error('Wizard history exceeds the supported limit; local draft retained.');
        if (result.data.length < PAGE_SIZE) break;
      }
      return revisionUnion([], revisions);
    },
    async push(owner, candidate) {
      await requireSession(owner);
      const revision = normalizeRevision(candidate);
      const result = await client.from('goal_wizard_drafts').upsert({
        user_id: owner, revision_id: revision.id, parent_ids: revision.parentIds, draft: revision.draft,
      }, { onConflict: 'user_id,revision_id', ignoreDuplicates: true });
      if (result.error) throw result.error;
      await requireSession(owner);
      // A duplicate ID is only a successful retry if its immutable content is identical.
      const existing = await client.from('goal_wizard_drafts')
        .select('user_id,revision_id,parent_ids,draft,created_at')
        .eq('user_id', owner).eq('revision_id', revision.id).maybeSingle();
      if (existing.error) throw existing.error;
      await requireSession(owner);
      const saved = fromRow(existing.data, owner);
      if (!sameRevision(saved, revision)) throw new Error('Wizard revision ID collision in cloud history.');
    },
  };
}
