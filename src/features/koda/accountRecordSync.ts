/**
 * Account-owned, field-level records stored in user_app_state.profile.__kodaRecords.
 *
 * Integration: persist patches BEFORE acknowledging a local edit. Keep their
 * versions unchanged across retries/reloads. Capture only actual before/after
 * edits, never a diff from a newly pulled remote snapshot to a stale local list.
 * syncAccountRecordDomain([], loadLegacy) is also the initial/background pull.
 * loadLegacy must throw on failed reads; [] means a successful, empty response.
 * Only bootstrap from account-filtered legacy cloud rows, never a stale device
 * snapshot. Pending local edits are supplied separately as patches.
 * Acknowledge exactly the patches submitted (by accountRecordPatchKey); preserve
 * edits made during the request. Mirrors are optional, performed AFTER this CAS,
 * and must never become a fallback source after domain initialization.
 */
export type AccountRecordDomain = 'notes' | 'planner' | 'journal';
export type AccountRecordVersion = { counter: number; actor: string };
export type AccountRecordPatch = {
  ownerId: string;
  domain: AccountRecordDomain;
  id: string;
  version: AccountRecordVersion;
  set: Record<string, unknown>;
  unset: string[];
  deleted: boolean;
};
export type StoredAccountRecord = {
  value: { id: string } & Record<string, unknown>;
  fields: Record<string, AccountRecordVersion>;
  deleted: AccountRecordVersion | null;
};
export type AccountRecordSnapshot = {
  ownerId: string;
  domain: AccountRecordDomain;
  initialized: true;
  records: Record<string, StoredAccountRecord>;
};
type Namespace = {
  version: 1;
  ownerId: string;
  domains: Partial<Record<AccountRecordDomain, AccountRecordSnapshot>>;
};

const namespaceKey = '__kodaRecords';
const domains: AccountRecordDomain[] = ['notes', 'planner', 'journal'];
let lastCounter = 0;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const validVersion = (value: unknown): value is AccountRecordVersion => object(value)
  && Number.isSafeInteger(value.counter) && (value.counter as number) >= 0
  && typeof value.actor === 'string' && value.actor.length > 0;
const compareVersion = (a: AccountRecordVersion, b: AccountRecordVersion) => a.counter - b.counter
  || (a.actor < b.actor ? -1 : a.actor > b.actor ? 1 : 0);

function assertOwner(ownerId: string) {
  if (!ownerId) throw new Error('Record synchronization requires an account');
}

function readNamespace(profile: unknown, ownerId: string): Namespace | null {
  assertOwner(ownerId);
  if (!object(profile) || !own(profile, namespaceKey)) return null;
  const namespace = profile[namespaceKey];
  if (!object(namespace) || namespace.version !== 1 || namespace.ownerId !== ownerId || !object(namespace.domains)) {
    throw new Error('Invalid or foreign account record namespace');
  }
  return namespace as Namespace;
}

/** null means not yet migrated; an initialized empty snapshot is authoritative. */
export function readAccountRecordDomain(profile: unknown, ownerId: string, domain: AccountRecordDomain): AccountRecordSnapshot | null {
  const namespace = readNamespace(profile, ownerId);
  if (!namespace || !own(namespace.domains, domain)) return null;
  const snapshot = namespace.domains[domain];
  if (!object(snapshot) || snapshot.ownerId !== ownerId || snapshot.domain !== domain || snapshot.initialized !== true || !object(snapshot.records)) {
    throw new Error('Invalid account record snapshot');
  }
  for (const [id, entry] of Object.entries(snapshot.records)) {
    if (!object(entry) || !object(entry.value) || entry.value.id !== id || !object(entry.fields)
      || !(entry.deleted === null || validVersion(entry.deleted)) || !Object.values(entry.fields).every(validVersion)) {
      throw new Error('Invalid account record metadata');
    }
  }
  return clone(snapshot as AccountRecordSnapshot);
}

export function accountRecordValues<T extends { id: string }>(snapshot: AccountRecordSnapshot): T[] {
  return Object.values(snapshot.records).filter(entry => !entry.deleted).map(entry => clone(entry.value) as T);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
}

function maxCounter(snapshot?: AccountRecordSnapshot | null) {
  let result = 0;
  for (const entry of Object.values(snapshot?.records ?? {})) {
    result = Math.max(result, entry.deleted?.counter ?? 0, ...Object.values(entry.fields).map(version => version.counter));
  }
  return result;
}

/** actor must be a persisted unique device/install identifier. */
export function createAccountRecordPatches<T extends { id: string }>(
  ownerId: string,
  domain: AccountRecordDomain,
  before: readonly T[],
  after: readonly T[],
  actor: string,
  observed?: AccountRecordSnapshot | null,
  now = Date.now(),
): AccountRecordPatch[] {
  assertOwner(ownerId);
  if (!actor || !domains.includes(domain) || !Number.isSafeInteger(now) || now < 0) throw new Error('Invalid record edit identity');
  if (observed && (observed.ownerId !== ownerId || observed.domain !== domain)) throw new Error('Foreign observed record snapshot');
  const previous = new Map(before.map(record => [record.id, record]));
  const next = new Map(after.map(record => [record.id, record]));
  if (previous.size !== before.length || next.size !== after.length) throw new Error('Duplicate record identity');
  const patches: AccountRecordPatch[] = [];
  for (const id of new Set([...previous.keys(), ...next.keys()])) {
    if (!id) throw new Error('Missing record identity');
    const oldValue = previous.get(id) as Record<string, unknown> | undefined;
    const newValue = next.get(id) as Record<string, unknown> | undefined;
    const deleted = !newValue || Boolean(newValue.deletedAt);
    const set: Record<string, unknown> = {};
    const unset: string[] = [];
    if (!deleted) {
      for (const key of new Set([...Object.keys(oldValue ?? {}), ...Object.keys(newValue)])) {
        if (key === 'id') continue;
        if (stable(oldValue?.[key]) === stable(newValue[key])) continue;
        if (newValue[key] === undefined) unset.push(key);
        else Object.defineProperty(set, key, { value: clone(newValue[key]), enumerable: true, configurable: true, writable: true });
      }
    }
    if (deleted && oldValue?.deletedAt) continue;
    if (!deleted && oldValue && !Object.keys(set).length && !unset.length) continue;
    lastCounter = Math.max(lastCounter + 1, maxCounter(observed) + 1, now);
    if (!Number.isSafeInteger(lastCounter)) throw new Error('Record version exhausted');
    patches.push({ ownerId, domain, id, version: { counter: lastCounter, actor }, set, unset, deleted });
  }
  return patches;
}

export function accountRecordPatchKey(patch: AccountRecordPatch) {
  return JSON.stringify([patch.ownerId, patch.domain, patch.id, patch.version.counter, patch.version.actor]);
}

function assertPatch(patch: AccountRecordPatch, ownerId: string, domain: AccountRecordDomain) {
  if (patch.ownerId !== ownerId || patch.domain !== domain || !patch.id || !validVersion(patch.version)
    || !object(patch.set) || !Array.isArray(patch.unset) || !patch.unset.every(key => typeof key === 'string')
    || own(patch.set, 'id') || patch.unset.includes('id') || typeof patch.deleted !== 'boolean') {
    throw new Error('Invalid or foreign record patch');
  }
}

/** Pure optimistic projection. Deletion wins permanently, even over a newer edit. */
export function applyAccountRecordPatches(snapshot: AccountRecordSnapshot, patches: readonly AccountRecordPatch[]): AccountRecordSnapshot {
  const result = clone(snapshot);
  for (const patch of patches) {
    assertPatch(patch, snapshot.ownerId, snapshot.domain);
    const entry = own(result.records, patch.id) ? result.records[patch.id]
      : { value: { id: patch.id }, fields: {}, deleted: null } as StoredAccountRecord;
    if (patch.deleted) {
      if (!entry.deleted || compareVersion(patch.version, entry.deleted) > 0) entry.deleted = clone(patch.version);
    } else if (!entry.deleted) {
      for (const key of new Set([...Object.keys(patch.set), ...patch.unset])) {
        const previous = own(entry.fields, key) ? entry.fields[key] : null;
        if (previous && compareVersion(patch.version, previous) <= 0) continue;
        entry.fields = { ...entry.fields, [key]: clone(patch.version) };
        if (patch.unset.includes(key)) delete entry.value[key];
        else entry.value = { ...entry.value, [key]: clone(patch.set[key]) };
      }
    }
    result.records = { ...result.records, [patch.id]: entry };
  }
  return result;
}

function bootstrap<T extends { id: string }>(ownerId: string, domain: AccountRecordDomain, rows: readonly T[]): AccountRecordSnapshot {
  const records: Record<string, StoredAccountRecord> = {};
  for (const row of rows) {
    if (!row.id || own(records, row.id)) throw new Error('Invalid legacy record identity');
    const value = clone(row) as StoredAccountRecord['value'];
    const version = { counter: 0, actor: 'legacy' };
    Object.defineProperty(records, row.id, { enumerable: true, configurable: true, writable: true, value: {
      value,
      fields: Object.fromEntries(Object.keys(value).filter(key => key !== 'id').map(key => [key, version])),
      deleted: value.deletedAt ? version : null,
    } });
  }
  return { ownerId, domain, initialized: true, records };
}

/**
 * Account-filtered read + CAS. Never writes goals, habits, or other profile keys.
 * Throws on failed reads, exhausted conflicts, invalid metadata, or owner mismatch.
 * A failed/ambiguous write is safe to repeat with the identical persisted patches.
 */
export async function syncAccountRecordDomain<T extends { id: string }>(
  client: any,
  ownerId: string,
  domain: AccountRecordDomain,
  patches: readonly AccountRecordPatch[],
  loadLegacy: () => Promise<readonly T[]>,
  isCurrent?: () => boolean | Promise<boolean>,
): Promise<AccountRecordSnapshot> {
  assertOwner(ownerId);
  if (!domains.includes(domain)) throw new Error('Invalid record domain');
  patches.forEach(patch => assertPatch(patch, ownerId, domain));
  let legacy: AccountRecordSnapshot | undefined;
  const checkCurrent = async () => {
    if (isCurrent && !(await isCurrent())) throw new Error('Record synchronization account changed');
  };
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await checkCurrent();
    const current = await client.from('user_app_state').select('user_id, profile, updated_at').eq('user_id', ownerId).maybeSingle();
    await checkCurrent();
    if (current.error) throw current.error;
    if (current.data && current.data.user_id !== ownerId) throw new Error('Foreign account row');
    const profile = object(current.data?.profile) ? current.data.profile : {};
    const existing = readAccountRecordDomain(profile, ownerId, domain);
    if (!existing && !legacy) legacy = bootstrap(ownerId, domain, await loadLegacy());
    await checkCurrent();
    const next = applyAccountRecordPatches(existing ?? legacy!, patches);
    if (existing && stable(existing) === stable(next)) return next;
    const namespace = readNamespace(profile, ownerId) ?? { version: 1 as const, ownerId, domains: {} };
    const payload = {
      user_id: ownerId,
      profile: { ...profile, [namespaceKey]: { ...namespace, domains: { ...namespace.domains, [domain]: next } } },
      updated_at: new Date().toISOString(),
    };
    if (current.data && !current.data.updated_at) throw new Error('Account row has no CAS version');
    await checkCurrent();
    const result = current.data
      ? await client.from('user_app_state').update(payload).eq('user_id', ownerId).eq('updated_at', current.data.updated_at).select('user_id').maybeSingle()
      : await client.from('user_app_state').insert(payload).select('user_id').maybeSingle();
    if (result.error) {
      if (!current.data && result.error.code === '23505') continue;
      throw result.error;
    }
    if (result.data) return next;
  }
  throw new Error('Account records changed on another device; retry required');
}

/** Display-only baseline; never send it as a set of edits. */
export const bootstrapAccountRecords = bootstrap;

/** Validate a persisted account/domain snapshot without accepting foreign metadata. */
export function parseAccountRecordSnapshot(raw: unknown, ownerId: string, domain: AccountRecordDomain): AccountRecordSnapshot | null {
  if (raw === null || raw === undefined) return null;
  return readAccountRecordDomain({ [namespaceKey]: { version: 1, ownerId, domains: { [domain]: raw } } }, ownerId, domain);
}
