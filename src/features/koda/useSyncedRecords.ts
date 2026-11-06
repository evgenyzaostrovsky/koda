import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { isSupabaseConfigured } from '../../config/env';
import { supabase } from '../../lib/supabase';
import { loadLegacyRecords, mirrorAccountRecords, normalizeLegacyJournal, type RecordDomain } from './accountRecordLegacy';
import { bootstrapAccountRecords, parseAccountRecordSnapshot, createAccountRecordPatches, applyAccountRecordPatches, accountRecordValues, accountRecordPatchKey, syncAccountRecordDomain, type AccountRecordSnapshot, type AccountRecordPatch } from './accountRecordSync';
import type { JournalEntry } from './types';
import { uid } from './utils';

type Item = { id: string };
type Options = { owner?: string | null; domain: RecordDomain; legacyKey: string; legacyDeletedKey?: string; pullToken: number; retryToken: number; online: boolean };

/** A persisted operation queue belongs to one mounted account and one record domain. */
export function useSyncedRecords<T extends Item>(options: Options) {
  const { owner, domain, legacyKey, legacyDeletedKey, pullToken, retryToken, online } = options;
  const identity = owner ?? 'guest';
  const key = `koda:records:v2:${identity}:${domain}`;
  const [items, setItems] = useState<T[]>([]);
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [generation, setGeneration] = useState(0);
  const [recovery, setRecovery] = useState<T[] | null>(null);
  const legacyRecovery = useRef<T[] | null>(null);
  const [cloudReady, setCloudReady] = useState(false);
  const state = useRef<AccountRecordSnapshot | null>(null);
  const patches = useRef<AccountRecordPatch[]>([]), actor = useRef(uid('record-device'));
  const active = useRef(true), loading = useRef(false), syncing = useRef(false);
  const persistChain = useRef<Promise<void>>(Promise.resolve());
  const scope = useRef({ key, epoch: 0 });
  if (scope.current.key !== key) {
    scope.current = { key, epoch: scope.current.epoch + 1 };
    state.current = null; patches.current = []; legacyRecovery.current = null;
    actor.current = uid('record-device'); loading.current = false; syncing.current = false;
  }
  const epoch = scope.current.epoch;
  const isCurrent = () => active.current && scope.current.epoch === epoch;
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const scoped = (base: string) => owner ? `${base}:${owner}` : base;
  function publish() { if (isCurrent() && state.current) { setItems(accountRecordValues<T>(state.current)); setPending(patches.current.length > 0); } }
  function persist() {
    if (!isCurrent()) return Promise.reject(new Error('Account changed'));
    const serialized = JSON.stringify({ snapshot: state.current, patches: patches.current, actor: actor.current, recovery: legacyRecovery.current });
    const write = persistChain.current.catch(() => {}).then(() => AsyncStorage.setItem(key, serialized));
    persistChain.current = write;
    return write;
  }
  function update(updater: (current: T[]) => T[]) {
    if (!isCurrent() || !state.current || legacyRecovery.current) return;
    const before = accountRecordValues<T>(state.current);
    const edits = createAccountRecordPatches(identity, domain, before, updater(before), actor.current, state.current);
    if (!edits.length) return;
    patches.current = [...patches.current, ...edits];
    state.current = applyAccountRecordPatches(state.current, edits);
    publish();
    void persist().catch(() => { if (isCurrent()) setError('Не удалось сохранить изменения на устройстве.'); });
    setGeneration(value => value + 1);
  }
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (state.current && ready) return;
      loading.current = true;
      let hydrated = Boolean(state.current);
      try {
        // A failed local save is retriable without replacing in-memory edits
        // with the older disk document. Retry tokens also retry failed reads.
        if (state.current) {
          await persist();
          if (!cancelled && isCurrent()) { publish(); setReady(true); }
          return;
        }
        setReady(false); setCloudReady(false); setRecovery(null); setPending(false); setItems([]); setError('');
        const [saved, legacyRaw, queueRaw, deletedRaw] = await Promise.all([
          AsyncStorage.getItem(key), AsyncStorage.getItem(scoped(legacyKey)), AsyncStorage.getItem(scoped('koda:syncQueue:v1')),
          legacyDeletedKey ? AsyncStorage.getItem(scoped(legacyDeletedKey)) : Promise.resolve(null),
        ]);
        if (cancelled || !isCurrent()) return;
        if (saved) {
          const parsed = JSON.parse(saved);
          state.current = parseAccountRecordSnapshot(parsed.snapshot, identity, domain);
          if (!state.current) throw new Error('Invalid stored record snapshot');
          actor.current = parsed.actor || actor.current;
          patches.current = Array.isArray(parsed.patches) ? parsed.patches : [];
          legacyRecovery.current = Array.isArray(parsed.recovery) ? parsed.recovery : null;
          setRecovery(legacyRecovery.current);
          state.current = applyAccountRecordPatches(state.current, patches.current);
        } else {
          const legacy = JSON.parse(legacyRaw || '[]');
          let records: Item[] = Array.isArray(legacy) ? legacy : [];
          if (owner && domain === 'journal') records = await normalizeLegacyJournal(owner, records as JournalEntry[]);
          if (cancelled || !isCurrent()) return;
          state.current = bootstrapAccountRecords(identity, domain, records);
          const queue = JSON.parse(queueRaw || '[]');
          const deleted = JSON.parse(deletedRaw || '[]');
          if (!Array.isArray(queue) || !Array.isArray(deleted) || !deleted.every(id => typeof id === 'string')) throw new Error('Invalid legacy queue');
          if (queue.includes(domain) && records.length) { legacyRecovery.current = records as T[]; setRecovery(records as T[]); }
          if (deleted.length) {
            const ids = owner && domain === 'journal' ? (await normalizeLegacyJournal(owner, deleted.map((id: string) => ({ id })) as JournalEntry[])).map(item => item.id) : deleted;
            if (cancelled || !isCurrent()) return;
            patches.current.push(...createAccountRecordPatches(identity, domain, ids.map((id: string) => ({ id })), [], actor.current, state.current));
          }
          state.current = applyAccountRecordPatches(state.current, patches.current);
        }
        if (cancelled || !isCurrent()) return;
        hydrated = true;
        publish(); await persist();
        if (!cancelled && isCurrent()) setReady(true);
      } catch {
        if (!cancelled && isCurrent()) {
          // Do not rewrite a malformed disk document on retry using partially
          // hydrated references. Valid in-memory edits survive a save failure.
          if (!hydrated) { state.current = null; patches.current = []; legacyRecovery.current = null; }
          setError('Не удалось прочитать или сохранить данные устройства. Повторим попытку.');
        }
      }
      finally { if (isCurrent()) loading.current = false; }
    }
    void load();
    return () => { cancelled = true; };
  }, [key, retryToken]);

  useEffect(() => {
    if (!ready || !owner || !online || !isSupabaseConfigured() || syncing.current || loading.current) return;
    const sent = [...patches.current];
    const sentKeys = new Set(sent.map(accountRecordPatchKey));
    syncing.current = true;
    let acknowledged = false;
    async function accountIsCurrent() {
      if (!isCurrent()) return false;
      const session = await supabase.auth.getSession();
      return isCurrent() && !session.error && session.data.session?.user.id === owner;
    }
    async function sync() {
      try {
        // Retry the actual local write, not an already rejected promise. The
        // serialized queue must be durable before any request can acknowledge it.
        await persist();
        if (!(await accountIsCurrent())) throw new Error('Account changed');
        const saved = await syncAccountRecordDomain(supabase, owner!, domain, sent, () => loadLegacyRecords(supabase, owner!, domain), accountIsCurrent);
        if (!(await accountIsCurrent())) return;
        // Mirrors never feed an initialized domain. Keep the sent queue until all writes succeed.
        if (sent.length) {
          await mirrorAccountRecords(supabase, owner!, domain, accountRecordValues(saved) as any[], Object.entries(saved.records).filter(([, value]) => value.deleted).map(([id]) => id), accountIsCurrent);
        }
        if (!(await accountIsCurrent())) return;
        patches.current = patches.current.filter(patch => !sentKeys.has(accountRecordPatchKey(patch)));
        state.current = applyAccountRecordPatches(saved, patches.current);
        acknowledged = true;
        await persist();
        if (isCurrent()) { setCloudReady(true); setError(''); publish(); }
      } catch {
        if (isCurrent()) {
          // If local acknowledgement failed, retain the exact idempotent edits
          // for retry, including edits made while acknowledgement was saving.
          if (acknowledged) {
            const byKey = new Map([...sent, ...patches.current].map(patch => [accountRecordPatchKey(patch), patch]));
            patches.current = [...byKey.values()];
          }
          setPending(patches.current.length > 0);
          setError('Не удалось завершить синхронизацию или запись на устройстве. Повторим попытку.');
        }
      }
      finally {
        if (isCurrent()) {
          syncing.current = false;
          if (patches.current.some(patch => !sentKeys.has(accountRecordPatchKey(patch)))) setGeneration(value => value + 1);
        }
      }
    }
    void sync();
  }, [key, ready, generation, retryToken, pullToken, online]);
  function recover(useLocal: boolean) {
    if (!isCurrent() || !state.current || !cloudReady || !legacyRecovery.current) return;
    const before = accountRecordValues<T>(state.current);
    const recovered = legacyRecovery.current;
    if (useLocal) {
      const byId = new Map(before.map(item => [item.id,item]));
      for (const item of recovered) if (!state.current.records[item.id]?.deleted) byId.set(item.id,item);
      const edits = createAccountRecordPatches(identity, domain, before, [...byId.values()], actor.current, state.current);
      patches.current.push(...edits); state.current = applyAccountRecordPatches(state.current, edits);
    }
    legacyRecovery.current = null; setRecovery(null); publish();
    void persist().catch(() => { if (isCurrent()) setError('Не удалось сохранить выбор на устройстве.'); });
    setGeneration(value => value + 1);
  }
  const belongs = state.current?.ownerId === identity && state.current?.domain === domain;
  return { items: belongs ? items : [], update, ready: belongs && ready, pending: belongs && pending, error, recovery: belongs ? recovery : null, cloudReady: belongs && cloudReady, recover };
}
