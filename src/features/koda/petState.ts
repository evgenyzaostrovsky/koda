import type { Goal, Habit, PlannerItem, Project } from './types';

/** All clocks are UTC instants. Call mutations only from explicit user actions, never hydration.
 * Retrying an action must reuse its id and at. State belongs inside the account-scoped profile.
 * Rewards are absolute registers per source, not increments; feeding is an immutable spend.
 */
export type PetSpecies = 'cat' | 'fox' | 'bunny';
export type PetColor = 'mint' | 'peach' | 'lavender' | 'sky';
export type PetAccessory = 'none' | 'scarf' | 'bow' | 'crown';
export type PetAppearance = { name: string; species: PetSpecies; color: PetColor; accessory: PetAccessory };
export type PetEditOptions = { at?: string; id?: string };
export type PetBirth = { id: string; parentId: string | null; at: string };
export type PetReward = { key: string; id: string; at: string; earnedAt: string | null; done: boolean; revision: number };
export type PetFeed = { id: string; generationId: string; at: string };
export type PetSettings = { id: string; at: string; revision: number; value: PetAppearance };
export type PetState = {
  schemaVersion: 1; ownerId: string | null; births: PetBirth[];
  rewards: PetReward[]; feeds: PetFeed[]; settings: PetSettings[];
};
export type PetSources = { goals: readonly Goal[]; habits: readonly Habit[]; plannerItems: readonly PlannerItem[]; projects: readonly Project[] };
export type PetView = PetAppearance & {
  status: 'unadopted' | 'happy' | 'hungry' | 'starving' | 'dead';
  alive: boolean; hunger: number; food: number; lifetimeEarned: number; level: number;
  generationId: string | null; generation: number; bornAt: string | null;
  lastFedAt: string | null; diesAt: string | null; acceptedFeedIds: string[]; rejectedFeedIds: string[];
  canFeed: boolean; unlockedSpecies: PetSpecies[]; unlockedAccessories: PetAccessory[];
};
export const PET_STARVATION_MS = 7 * 24 * 60 * 60 * 1000;
export const PET_FULLNESS_MS = 2 * 24 * 60 * 60 * 1000;
export const PET_FEED_AMOUNT = 35;
export const PET_SPECIES: { id: PetSpecies; label: string; unlockAt: number }[] = [
  { id: 'cat', label: 'Котёнок', unlockAt: 0 }, { id: 'fox', label: 'Лисёнок', unlockAt: 5 }, { id: 'bunny', label: 'Зайчонок', unlockAt: 12 },
];
export const PET_COLORS: { id: PetColor; label: string; hex: string }[] = [
  { id: 'mint', label: 'Мята', hex: '#A4CDBC' }, { id: 'peach', label: 'Персик', hex: '#E9B79C' },
  { id: 'lavender', label: 'Лаванда', hex: '#BCACD8' }, { id: 'sky', label: 'Небо', hex: '#9CC7DB' },
];
export const PET_ACCESSORIES: { id: PetAccessory; label: string; unlockAt: number }[] = [
  { id: 'none', label: 'Без украшения', unlockAt: 0 }, { id: 'scarf', label: 'Шарфик', unlockAt: 3 },
  { id: 'bow', label: 'Бантик', unlockAt: 8 }, { id: 'crown', label: 'Корона', unlockAt: 20 },
];
const DEFAULT_APPEARANCE: PetAppearance = { name: 'Кода', species: 'cat', color: 'mint', accessory: 'none' };

export function createPetState(ownerId: string | null): PetState {
  return { schemaVersion: 1, ownerId, births: [], rewards: [], feeds: [], settings: [] };
}

/** Missing/corrupt data stays unadopted; opening the app must never create a pet. */
export function parsePetState(value: unknown, expectedOwner?: string | null): PetState | undefined {
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    if (!object(raw) || raw.schemaVersion !== 1 || !(raw.ownerId === null || text(raw.ownerId)) ||
      (expectedOwner !== undefined && raw.ownerId !== expectedOwner) ||
      !Array.isArray(raw.births) || !Array.isArray(raw.rewards) || !Array.isArray(raw.feeds) || !Array.isArray(raw.settings)) return;
    if (!raw.births.every((v: unknown) => object(v) && text(v.id) && instant(v.at) && (v.parentId === null || text(v.parentId))) ||
      !raw.rewards.every((v: unknown) => object(v) && text(v.key) && text(v.id) && instant(v.at) && (instant(v.earnedAt) || (v.earnedAt === null && v.done === false)) &&
        typeof v.done === 'boolean' && revision(v.revision)) ||
      !raw.feeds.every((v: unknown) => object(v) && text(v.id) && text(v.generationId) && instant(v.at)) ||
      !raw.settings.every((v: unknown) => object(v) && text(v.id) && instant(v.at) && revision(v.revision) && validAppearance(v.value))) return;
    const state = cloneJson(raw) as PetState;
    if (!state.births.length && (state.rewards.length || state.feeds.length || state.settings.length)) return;
    // Invalid references/cycles must not create arbitrary extra lives.
    const birthIds = new Set(state.births.map(b => b.id));
    if (birthIds.size !== state.births.length || state.births.some(b => b.parentId !== null && (!birthIds.has(b.parentId) || b.parentId === b.id)) ||
      state.feeds.some(f => !birthIds.has(f.generationId))) return;
    for (const birth of state.births) {
      const visited = new Set<string>(); let current: PetBirth | undefined = birth;
      while (current) {
        if (visited.has(current.id)) return;
        visited.add(current.id);
        const parent: PetBirth | undefined = state.births.find(b => b.id === current!.parentId);
        if (parent && ms(parent.at) > ms(current.at)) return;
        current = parent;
      }
    }
    return canonical(state);
  } catch { return; }
}

/** Union independent events, merge absolute source registers. Account mismatch is an error. */
export function mergePetState(a: PetState | undefined | null, b: PetState | undefined | null): PetState | undefined {
  if (!a && !b) return;
  if (!a) return canonical(b!);
  if (!b) return canonical(a);
  if (a.ownerId !== b.ownerId) throw new Error('Cannot merge pets from different accounts');
  return canonical({ ...a, births: union(a.births, b.births), feeds: union(a.feeds, b.feeds),
    settings: union(a.settings, b.settings), rewards: [...a.rewards, ...b.rewards] });
}

export function adoptPet(state: PetState | undefined | null, ownerId: string | null,
  options: PetEditOptions & Partial<PetAppearance> = {}): PetState {
  const current = state ?? createPetState(ownerId);
  if (current.ownerId !== ownerId) throw new Error('Pet belongs to another account');
  if (current.births.length) return current;
  const op = operation(options);
  const born = canonical({ ...current, births: [{ id: op.id, parentId: null, at: op.at }] });
  return customizePet(born, options, { ...op, id: `${op.id}:appearance` });
}

/** Every source supplies at most one credit over all lives; undo removes it, redo restores it. */
export function recordPetReward(state: PetState, key: string, done: boolean, options: PetEditOptions = {}): PetState {
  if (!state.births.length) return state;
  if (!text(key)) throw new Error('Pet reward requires a stable source key');
  const old = resolvedRewards(state.rewards).find(r => r.key === key);
  const op = operation(options);
  const replay = state.rewards.find(r => r.id === op.id);
  if (replay) {
    if (replay.key !== key || replay.done !== done || replay.at !== op.at) throw new Error('Pet operation id reused');
    return state;
  }
  if (old?.done === done) return state;
  if (ms(op.at) < earliestBirth(state)) return state;
  // Local causal edits outrank an earlier device clock; the original credit date remains fixed.
  const reward: PetReward = { key, id: op.id, at: op.at,
    earnedAt: old?.earnedAt ?? (done ? op.at : null), done, revision: (old?.revision ?? 0) + 1 };
  return canonical({ ...state, rewards: [...state.rewards, reward] });
}

/** Explicit before/after source edits only. Missing/deleted/moved sources preserve earned history.
 * Old dates cannot earn a new credit, but an already credited day can still be undone or restored.
 * A routine earns once when its daily target is met; changing its target is not completion.
 */
export function recordPetSourceChanges(state: PetState | undefined, before: PetSources, after: PetSources,
  options: PetEditOptions & { localDate?: string } = {}): PetState | undefined {
  if (!state?.births.length) return state;
  const op = operation(options);
  const date = options.localDate ?? localDate(op.at);
  const creditedKeys = new Set(state.rewards.filter(reward => reward.earnedAt !== null).map(reward => reward.key));
  const first = sourceFacts(before, date, creditedKeys), second = sourceFacts(after, date, creditedKeys);
  let next = state;
  const changes = new Map<string, Set<boolean>>();
  for (const [representation, fact] of second) {
    const previous = first.get(representation);
    if (!previous || previous.key !== fact.key || previous.done === fact.done) continue;
    const values = changes.get(fact.key) ?? new Set<boolean>();
    values.add(fact.done); changes.set(fact.key, values);
  }
  for (const [key, values] of changes) {
    if (values.size !== 1) continue; // Contradictory explicit edits require a later unambiguous correction.
    next = recordPetReward(next, key, [...values][0], { at: op.at, id: JSON.stringify([op.id, key]) });
  }
  return next;
}

export function feedPet(state: PetState, options: PetEditOptions = {}): PetState {
  const op = operation(options);
  const existing = state.feeds.find(f => f.id === op.id);
  if (existing) { if (existing.at !== op.at) throw new Error('Pet operation id reused'); return state; }
  const view = getPetView(state, op.at);
  if (!view.canFeed || !view.generationId) return state;
  return canonical({ ...state, feeds: [...state.feeds, { ...op, generationId: view.generationId }] });
}

export function rebirthPet(state: PetState, options: PetEditOptions = {}): PetState {
  const op = operation(options);
  const existing = state.births.find(b => b.id === op.id);
  if (existing) { if (existing.at !== op.at) throw new Error('Pet operation id reused'); return state; }
  const view = getPetView(state, op.at);
  if (view.status !== 'dead' || !view.generationId) return state;
  return canonical({ ...state, births: [...state.births, { ...op, parentId: view.generationId }] });
}

export function customizePet(state: PetState, patch: Partial<PetAppearance>, options: PetEditOptions = {}): PetState {
  const op = operation(options);
  const view = getPetView(state, op.at);
  if (!view.generationId) return state;
  const value: PetAppearance = { name: (patch.name ?? view.name).trim().slice(0, 32) || DEFAULT_APPEARANCE.name,
    species: patch.species ?? view.species, color: patch.color ?? view.color, accessory: patch.accessory ?? view.accessory };
  if (!validAppearance(value) || !view.unlockedSpecies.includes(value.species) || !view.unlockedAccessories.includes(value.accessory)) return state;
  const existing = state.settings.find(s => s.id === op.id);
  if (existing) { if (existing.at !== op.at || JSON.stringify(existing.value) !== JSON.stringify(value)) throw new Error('Pet operation id reused'); return state; }
  return canonical({ ...state, settings: [...state.settings, { ...op, revision: Math.max(0, ...state.settings.map(s => s.revision)) + 1, value }] });
}

/** Pure replay; no hunger ticks, food regeneration, visit rewards or permanent death writes.
 * Concurrent spends are ordered by (UTC time, id). A losing/offline spend consumes no credit.
 * Undo can invalidate a previously paid meal: the display is always derived from current facts.
 */
export function getPetView(state: PetState | undefined | null, now: number | string | Date = Date.now()): PetView {
  const time = typeof now === 'number' ? now : now instanceof Date ? now.getTime() : ms(now);
  if (!Number.isFinite(time)) throw new Error('Pet view requires a valid time');
  // Filter operations BEFORE resolving registers: a future redo may carry an old earnedAt.
  const rewardEvents = (state?.rewards ?? []).filter(r => ms(r.at) <= time);
  const rewards = resolvedRewards(rewardEvents).filter(r => r.done && r.earnedAt !== null && ms(r.earnedAt) <= time);
  const currentCreditKeys = new Set(rewards.map(reward => reward.key));
  const earned = rewards.length;
  const unlockedSpecies = PET_SPECIES.filter(s => earned >= s.unlockAt).map(s => s.id);
  const unlockedAccessories = PET_ACCESSORIES.filter(s => earned >= s.unlockAt).map(s => s.id);
  const settings = [...(state?.settings ?? [])].filter(s => ms(s.at) <= time).sort(compareRegister).at(-1)?.value ?? DEFAULT_APPEARANCE;
  const appearance = { ...settings, species: unlockedSpecies.includes(settings.species) ? settings.species : 'cat' as PetSpecies,
    accessory: unlockedAccessories.includes(settings.accessory) ? settings.accessory : 'none' as PetAccessory };
  const base: PetView = { ...appearance, status: 'unadopted', alive: false, hunger: 0, food: earned, lifetimeEarned: earned,
    level: 1 + Math.floor(earned / 5), generationId: null, generation: 0, bornAt: null, lastFedAt: null, diesAt: null,
    acceptedFeedIds: [], rejectedFeedIds: [], canFeed: false, unlockedSpecies, unlockedAccessories };
  const root = [...(state?.births ?? [])].filter(b => b.parentId === null && ms(b.at) <= time).sort(compareTime)[0];
  if (!root || !state) return base;
  let birth = root, generation = 1, fullness = 100, lastClock = ms(root.at), lastMeal = ms(root.at);
  const spentCreditKeys = new Set<string>();
  const events = [
    ...state.births.filter(b => b.parentId !== null).map(b => ({ ...b, kind: 'birth' as const })),
    ...state.feeds.map(f => ({ ...f, kind: 'feed' as const })),
  ].filter(e => ms(e.at) >= ms(root.at) && ms(e.at) <= time).sort((a, b) => compareTime(a, b) || compareText(a.kind, b.kind));
  for (const event of events) {
    const at = ms(event.at);
    if (event.kind === 'birth') {
      if (event.parentId !== birth.id || at < lastMeal + PET_STARVATION_MS) continue;
      birth = event; generation += 1; fullness = 100; lastClock = at; lastMeal = at;
    } else {
      // A credit must be valid both now (undo revokes meals) and at this meal's timestamp.
      // Tracking actual keys prevents an earlier meal from consuming a different credit's slot.
      const available = resolvedRewards(rewardEvents.filter(reward => ms(reward.at) <= at))
        .filter(reward => reward.done && reward.earnedAt !== null && ms(reward.earnedAt) <= at &&
          currentCreditKeys.has(reward.key) && !spentCreditKeys.has(reward.key))
        .sort((a, b) => ms(a.earnedAt) - ms(b.earnedAt) || compareText(a.key, b.key))[0];
      const hunger = Math.max(0, fullness - (at - lastClock) * 100 / PET_FULLNESS_MS);
      if (event.generationId !== birth.id || at >= lastMeal + PET_STARVATION_MS || !available || hunger >= 99.5) {
        base.rejectedFeedIds.push(event.id); continue;
      }
      spentCreditKeys.add(available.key); fullness = Math.min(100, hunger + PET_FEED_AMOUNT); lastClock = at; lastMeal = at;
      base.acceptedFeedIds.push(event.id);
    }
  }
  const dead = time >= lastMeal + PET_STARVATION_MS;
  const hunger = Math.max(0, Math.min(100, fullness - Math.max(0, time - lastClock) * 100 / PET_FULLNESS_MS));
  const food = Math.max(0, earned - spentCreditKeys.size);
  return { ...base, status: dead ? 'dead' : hunger > 50 ? 'happy' : hunger > 0 ? 'hungry' : 'starving', alive: !dead,
    hunger: Math.round(hunger), food, generationId: birth.id, generation, bornAt: birth.at,
    lastFedAt: new Date(lastMeal).toISOString(), diesAt: new Date(lastMeal + PET_STARVATION_MS).toISOString(),
    canFeed: !dead && food > 0 && hunger < 99.5 };
}

function sourceFacts(sources: PetSources, date: string, creditedKeys: ReadonlySet<string>) {
  const facts = new Map<string, { key: string; done: boolean }>();
  const knownDates = new Set([date]);
  for (const key of creditedKeys) {
    try {
      const parts = JSON.parse(key);
      if (Array.isArray(parts) && (parts[0] === 'habit' || parts[0] === 'routine') && typeof parts.at(-1) === 'string') knownDates.add(parts.at(-1));
    } catch { /* Direct API callers may use other stable key formats. */ }
  }
  for (const item of sources.plannerItems) {
    if (item.deletedAt) continue;
    const key = item.goalId && item.goalActionId ? JSON.stringify(['action', item.goalId, item.goalActionId])
      : item.sourceType === 'project' && item.ownerId && item.sourceId ? JSON.stringify(['project', item.ownerId, item.sourceId])
        : item.sourceType === 'recurring' && item.sourceId ? JSON.stringify(['habit', item.sourceId, item.date])
          : JSON.stringify(['planner', item.id]);
    if (item.sourceType === 'recurring' && item.date !== date && !creditedKeys.has(key)) continue;
    facts.set(JSON.stringify(['planner-representation', item.id]), { key, done: item.done && !item.failed });
  }
  for (const project of sources.projects) {
    if (project.status === 'archived') continue;
    for (const task of project.tasks) if (!task.deletedAt) {
      const key = JSON.stringify(['project', project.id, task.id]);
      facts.set(key, { key, done: task.status === 'done' });
    }
  }
  for (const goal of sources.goals) {
    if (goal.archivedAt || goal.status === 'archived') continue;
    for (const action of goal.actions) if (!action.archivedAt) {
      const key = JSON.stringify(['action', goal.id, action.id]);
      facts.set(key, { key, done: action.status === 'completed' });
    }
    for (const routine of goal.routines) {
      for (const factDate of knownDates) {
        const key = JSON.stringify(['routine', goal.id, routine.id, factDate]);
        if (factDate !== date && !creditedKeys.has(key)) continue;
        const value = Math.max(0, ...goal.routineLogs.filter(l => l.routineId === routine.id && l.date === factDate).map(l => l.value));
        const representation = JSON.stringify(['routine-register', goal.id, routine.id, factDate, routine.metricType, routine.targetValue]);
        facts.set(representation, { key, done: value >= Math.max(1, routine.targetValue) });
      }
    }
  }
  for (const habit of sources.habits) {
    if (habit.deletedAt || habit.archivedAt) continue;
    for (const factDate of knownDates) {
      const key = JSON.stringify(['habit', habit.id, factDate]);
      if (factDate !== date && !creditedKeys.has(key)) continue;
      const day = Number(factDate.slice(8)) - 1;
      const done = habit.dayEdits?.[factDate]?.done ?? habit.monthHistory?.[factDate.slice(0, 7)]?.[day] ?? false;
      facts.set(key, { key, done: Boolean(done) });
    }
  }
  return facts;
}

function canonical(state: PetState): PetState {
  return { schemaVersion: 1, ownerId: state.ownerId, births: union([], state.births).sort(compareTime),
    rewards: union([], state.rewards).sort((a, b) => compareText(a.key, b.key) || compareRegister(a, b)),
    feeds: union([], state.feeds).sort(compareTime), settings: union([], state.settings).sort(compareRegister) };
}
function resolvedRewards(events: readonly PetReward[]): PetReward[] {
  const rewards = new Map<string, PetReward>();
  for (const reward of events) {
    const previous = rewards.get(reward.key);
    if (!previous) { rewards.set(reward.key, { ...reward }); continue; }
    if (previous.id === reward.id && (previous.done !== reward.done || previous.at !== reward.at || previous.revision !== reward.revision)) throw new Error('Pet reward operation id reused');
    // Concurrent unseen corrections revoke rather than mint food; a later causal redo has a higher revision.
    const winner = previous.revision - reward.revision || Number(reward.done) - Number(previous.done) || compareTime(previous, reward);
    const dates = [previous.earnedAt, reward.earnedAt].filter((value): value is string => value !== null);
    rewards.set(reward.key, { ...(winner >= 0 ? previous : reward), earnedAt: dates.length ? new Date(Math.min(...dates.map(ms))).toISOString() : null });
  }
  return [...rewards.values()].sort((a, b) => compareText(a.key, b.key));
}
function union<T extends { id: string }>(a: readonly T[], b: readonly T[]): T[] {
  const result = new Map<string, T>();
  for (const value of [...a, ...b]) {
    const old = result.get(value.id);
    if (old && stable(old) !== stable(value)) throw new Error('Pet event id reused with different contents');
    result.set(value.id, cloneJson(value));
  }
  return [...result.values()];
}
/** Persisted records contain only JSON data; no structuredClone/Hermes polyfill is required. */
function cloneJson<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort(compareText).map(k => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  return JSON.stringify(value);
}
function compareText(a: string, b: string) { return a < b ? -1 : a > b ? 1 : 0; }
function compareTime(a: { at: string; id: string }, b: { at: string; id: string }) { return ms(a.at) - ms(b.at) || compareText(a.id, b.id); }
function compareRegister(a: { revision: number; at: string; id: string }, b: { revision: number; at: string; id: string }) { return a.revision - b.revision || compareTime(a, b); }
function ms(value: string | undefined | null) { return value ? Date.parse(value) : 0; }
function object(v: unknown): v is Record<string, any> { return Boolean(v) && typeof v === 'object' && !Array.isArray(v); }
function text(v: unknown): v is string { return typeof v === 'string' && v.trim().length > 0 && v.length <= 1024; }
function instant(v: unknown): v is string { return typeof v === 'string' && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v; }
function revision(v: unknown): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v > 0; }
function validAppearance(v: unknown): v is PetAppearance {
  return object(v) && text(v.name) && v.name.length <= 32 && PET_SPECIES.some(s => s.id === v.species) &&
    PET_COLORS.some(c => c.id === v.color) && PET_ACCESSORIES.some(a => a.id === v.accessory);
}
function operation(options: PetEditOptions) {
  const at = options.at ?? new Date().toISOString();
  if (!Number.isFinite(Date.parse(at))) throw new Error('Invalid pet action timestamp');
  const id = options.id ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `pet-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  if (!text(id)) throw new Error('Invalid pet action identifier');
  return { at: new Date(at).toISOString(), id };
}
function earliestBirth(state: PetState) { return Math.min(...state.births.map(b => ms(b.at))); }
function localDate(at: string) { const d = new Date(at); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
