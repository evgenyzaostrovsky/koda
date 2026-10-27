import assert from 'node:assert/strict';
import { adoptPet, createPetState, customizePet, feedPet, getPetView, mergePetState, parsePetState,
  PET_STARVATION_MS, rebirthPet, recordPetReward, recordPetSourceChanges, type PetSources, type PetState } from '../src/features/koda/petState';
import { defaultProfile, mergeStoredKodaState, normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Goal, Habit, PlannerItem, Project } from '../src/features/koda/types';

const epoch = Date.parse('2026-10-20T12:00:00.000Z');
const hour = 3600_000, day = 24 * hour;
const at = (offset = 0) => new Date(epoch + offset).toISOString();
const op = (id: string, offset = 0) => ({ id, at: at(offset) });
const fresh = () => adoptPet(undefined, 'one', { ...op('born'), name: 'Тест' });
const credit = (state: PetState, key: string, offset = hour) => recordPetReward(state, key, true, op(`earn:${key}`, offset));
const sources = (patch: Partial<PetSources> = {}): PetSources => ({ goals: [], projects: [], habits: [], plannerItems: [], ...patch });

function testDomain() {
  assert.equal(getPetView(undefined, at()).status, 'unadopted');
  assert.equal(getPetView(createPetState('one'), at()).status, 'unadopted');
  assert.equal(recordPetSourceChanges(undefined, sources(), sources()), undefined);
  let pet = fresh();
  assert.equal(getPetView(pet, at()).hunger, 100);
  assert.equal(getPetView(pet, at()).food, 0, 'adoption does not mint task rewards');
  assert.equal(getPetView(pet, at()).name, 'Тест');
  assert.equal(adoptPet(pet, 'one', op('extra-life', day)), pet);
  assert.equal(getPetView(pet, at(day)).hunger, 50);
  assert.equal(getPetView(pet, at(2 * day)).status, 'starving');
  assert.equal(getPetView(pet, at(PET_STARVATION_MS - 1)).alive, true);
  assert.equal(getPetView(pet, at(PET_STARVATION_MS)).status, 'dead');
  assert.equal(getPetView(pet, at(-day)).status, 'unadopted');
  assert.equal(feedPet(pet, op('empty-meal', day)), pet);
  pet = credit(pet, 'task');
  assert.equal(getPetView(pet, at(day)).food, 1);
  assert.equal(recordPetReward(pet, 'task', true, op('retry-different-id', 2 * hour)), pet);
  const fed = feedPet(pet, op('meal', day));
  assert.equal(getPetView(fed, at(day)).food, 0);
  assert.equal(getPetView(fed, at(day)).hunger, 85);
  assert.deepEqual(feedPet(fed, op('meal', day)), fed);
  assert.equal(getPetView(fed, at(8 * day)).status, 'dead');
  const undo = recordPetReward(fed, 'task', false, op('undo', day + hour));
  assert.equal(getPetView(undo, at(day + hour)).food, 0);
  assert.deepEqual(getPetView(undo, at(day + hour)).rejectedFeedIds, ['meal']);
  assert.deepEqual(recordPetReward(undo, 'task', true, op('earn:task', hour)), undo, 'retry of an old earning cannot erase later undo');
  const redo = recordPetReward(undo, 'task', true, op('redo', day + 2 * hour));
  assert.equal(getPetView(redo, at(day + 2 * hour)).food, 0, 'redo restores the same already spent credit');
  assert.equal(getPetView(redo, at(day + 2 * hour)).lifetimeEarned, 1);
  assert.throws(() => recordPetReward(redo, 'task', false, op('redo', day + 2 * hour)), /reused/);
  assert.deepEqual(parsePetState(JSON.stringify(redo)), redo);
  assert.equal(parsePetState(redo, 'two'), undefined);
  assert.equal(parsePetState('{bad'), undefined);
  assert.equal(parsePetState({ ...redo, feeds: [{ ...redo.feeds[0], generationId: 'missing' }] }), undefined);
  assert.equal(parsePetState({ ...redo, rewards: [{ ...redo.rewards[0], revision: NaN }] }), undefined);
  assert.throws(() => mergePetState(redo, createPetState('two')), /accounts/);
  assert.equal(getPetView(credit(fresh(), 'future', day), at(hour)).food, 0, 'future clock evidence is not spendable now');

  // Independent credits union, duplicate source credits collapse, merge laws hold in every direction.
  const a = credit(credit(fresh(), 'shared'), 'a', 2 * hour);
  const b = recordPetReward(credit(fresh(), 'b', 2 * hour), 'shared', true, op('other-shared', 3 * hour));
  const merged = mergePetState(a, b)!;
  assert.equal(getPetView(merged, at(day)).food, 3);
  assert.deepEqual(mergePetState(a, b), mergePetState(b, a));
  assert.deepEqual(mergePetState(merged, merged), merged);
  assert.deepEqual(mergePetState(mergePetState(a, b), redo), mergePetState(a, mergePetState(b, redo)));
  const canceled = recordPetReward(merged, 'shared', false, op('skewed-undo', hour));
  assert.equal(getPetView(mergePetState(canceled, b), at(day)).food, 2, 'causal revision wins even with an earlier clock');
  const unseenUndo = recordPetReward(fresh(), 'unseen-task', false, op('unseen-undo', hour));
  const delayedEarn = credit(fresh(), 'unseen-task', 2 * hour);
  const undoMerged = mergePetState(unseenUndo, delayedEarn)!;
  assert.equal(getPetView(undoMerged, at(day)).food, 0, 'a correction without the earning snapshot leaves a tombstone and defeats concurrent delayed earnings');
  assert.deepEqual(mergePetState(delayedEarn, unseenUndo), undoMerged);
  assert.equal(getPetView(recordPetReward(undoMerged, 'unseen-task', true, op('causal-redo', 3 * hour)), at(day)).food, 1);
  assert.equal(parsePetState(unseenUndo)!.rewards[0].earnedAt, null);

  const onlyOne = credit(fresh(), 'one-credit');
  const spendA = feedPet(onlyOne, op('A', day));
  const spendB = feedPet(onlyOne, op('B', day));
  const both = mergePetState(spendB, spendA)!;
  assert.deepEqual(getPetView(both, at(day)).acceptedFeedIds, ['A']);
  assert.deepEqual(getPetView(both, at(day)).rejectedFeedIds, ['B']);
  assert.equal(getPetView(both, at(day)).food, 0);
  assert.deepEqual(mergePetState(spendA, spendB), both);
  const independentMeals = mergePetState(feedPet(credit(fresh(), 'alpha'), op('meal-a', day)), feedPet(credit(fresh(), 'beta'), op('meal-b', day)))!;
  assert.equal(getPetView(independentMeals, at(day)).acceptedFeedIds.length, 2);
  assert.equal(getPetView(independentMeals, at(day)).hunger, 100);
  assert.equal(getPetView(independentMeals, at(day)).food, 0);

  let unlocked = fresh();
  for (let i = 0; i < 20; i++) unlocked = credit(unlocked, `task-${i}`);
  unlocked = customizePet(unlocked, { species: 'bunny', accessory: 'crown', color: 'lavender', name: 'Луна' }, op('look', day));
  assert.equal(getPetView(unlocked, at(day)).species, 'bunny');
  assert.equal(rebirthPet(unlocked, op('too-early', day)), unlocked);
  const reborn = rebirthPet(unlocked, op('reborn', 8 * day));
  assert.equal(getPetView(reborn, at(8 * day)).generation, 2);
  assert.equal(getPetView(reborn, at(8 * day)).hunger, 100);
  assert.equal(getPetView(reborn, at(8 * day)).food, 20);
  assert.equal(getPetView(reborn, at(8 * day)).accessory, 'crown');
  assert.deepEqual(rebirthPet(reborn, op('reborn', 8 * day)), reborn);
  assert.equal(feedPet(unlocked, op('feed-dead', 8 * day)), unlocked);
  const competing = mergePetState(rebirthPet(unlocked, op('A', 8 * day)), rebirthPet(unlocked, op('B', 8 * day)))!;
  assert.equal(getPetView(competing, at(8 * day)).generation, 2, 'concurrent rebirth gives one new life');
  assert.equal(getPetView(competing, at(8 * day)).generationId, 'A');
  const delayedMeal = feedPet(unlocked, op('offline-meal', 6 * day));
  const recovered = mergePetState(reborn, delayedMeal)!;
  assert.equal(getPetView(recovered, at(8 * day)).generation, 1, 'late real feeding can prove the previous pet did not die');
  assert.equal(getPetView(recovered, at(8 * day)).status, 'starving');
  const full = credit(fresh(), 'already-earned', 0);
  assert.equal(feedPet(full, op('full', 0)), full, 'no spending when full');
  assert.equal(customizePet(fresh(), { species: 'bunny' }, op('locked', hour)).settings.length, 1);
  console.log('Pet domain: adoption, hunger/death, rewards/undo/retry, clock ordering, merge laws, competing spends and rebirth PASS');
}

function testSources() {
  const task: PlannerItem = { id: 'task', title: 'Work', date: '2026-10-20', time: '', done: false };
  const done = { ...task, done: true };
  const options = { ...op('source-edit', hour), localDate: '2026-10-20' };
  const pet = recordPetSourceChanges(fresh(), sources({ plannerItems: [task] }), sources({ plannerItems: [done] }), options)!;
  assert.equal(getPetView(pet, at(day)).food, 1);
  assert.deepEqual(recordPetSourceChanges(pet, sources({ plannerItems: [task] }), sources({ plannerItems: [done] }), options), pet);
  assert.equal(recordPetSourceChanges(fresh(), sources(), sources({ plannerItems: [done] }), options)!.rewards.length, 0, 'new/hydrated completed records do not generate retroactive credit');
  assert.deepEqual(recordPetSourceChanges(pet, sources({ plannerItems: [done] }), sources(), options), pet, 'deletion preserves history');
  assert.deepEqual(recordPetSourceChanges(pet, sources({ plannerItems: [done] }), sources({ plannerItems: [{ ...done, date: '2026-10-21' }] }), options), pet);
  const canceled = recordPetSourceChanges(pet, sources({ plannerItems: [done] }), sources({ plannerItems: [task] }), { ...op('source-undo', 2 * hour), localDate: '2026-10-20' })!;
  assert.equal(getPetView(canceled, at(day)).food, 0);
  const failed = { ...task, failed: true };
  const afterFailed = recordPetSourceChanges(pet, sources({ plannerItems: [done] }), sources({ plannerItems: [failed] }), { ...op('failed', 2 * hour), localDate: '2026-10-20' })!;
  assert.equal(getPetView(afterFailed, at(day)).food, 0, 'marking completed work failed revokes its reward');
  assert.equal(recordPetSourceChanges(fresh(), sources({ plannerItems: [failed] }), sources({ plannerItems: [task] }), options)!.rewards.length, 0, 'clearing failed without completion creates no food');
  const doneAgain = recordPetSourceChanges(afterFailed, sources({ plannerItems: [failed] }), sources({ plannerItems: [done] }), { ...op('done-again', 3 * hour), localDate: '2026-10-20' })!;
  assert.equal(getPetView(doneAgain, at(day)).food, 1);
  const habit: Habit = { id: 'habit', title: 'Walk', target: '', doneDays: [], monthDays: [], monthHistory: { '2026-10': Array(31).fill(false) } };
  const habitDone = { ...habit, dayEdits: { '2026-10-20': { done: true, at: at(hour), id: 'habit-edit' } } };
  const habitPet = recordPetSourceChanges(fresh(), sources({ habits: [habit] }), sources({ habits: [habitDone] }), options)!;
  assert.equal(getPetView(habitPet, at(day)).food, 1);
  const nextDay = { ...op('yesterday-undo', day + hour), localDate: '2026-10-21' };
  const historicalUndo = recordPetSourceChanges(habitPet, sources({ habits: [habitDone] }), sources({ habits: [habit] }), nextDay)!;
  assert.equal(getPetView(historicalUndo, at(day + hour)).food, 0, 'undoing yesterday must revoke yesterday’s already earned credit');
  const historicalRedo = recordPetSourceChanges(historicalUndo, sources({ habits: [habit] }), sources({ habits: [habitDone] }), { ...nextDay, id: 'yesterday-redo' })!;
  assert.equal(getPetView(historicalRedo, at(day + hour)).food, 1, 'restoring yesterday restores its single original credit');
  assert.equal(getPetView(mergePetState(historicalUndo, habitPet), at(day + hour)).food, 0, 'stale sync cannot restore historical undo');
  const oldDate = { ...habit, dayEdits: { '2026-10-19': { done: true, at: at(hour), id: 'old-date' } } };
  assert.equal(recordPetSourceChanges(fresh(), sources({ habits: [habit] }), sources({ habits: [oldDate] }), options)!.rewards.length, 0);
  const project: Project = { id: 'p', title: '', description: '', status: 'active', createdAt: at(), updatedAt: at(), completedAt: null,
    tasks: [{ id: 'pt', title: '', description: '', cost: '', status: 'todo', plannedDate: '2026-10-20', plannedTime: '', createdAt: at(), updatedAt: at(), completedAt: null, deletedAt: null }] };
  const projectDone: Project = { ...project, tasks: [{ ...project.tasks[0], status: 'done' }] };
  const projection = { ...task, id: 'projection', sourceType: 'project' as const, ownerId: 'p', sourceId: 'pt' };
  const projectPet = recordPetSourceChanges(fresh(), sources({ projects: [project], plannerItems: [projection] }), sources({ projects: [projectDone], plannerItems: [{ ...projection, done: true }] }), options)!;
  assert.equal(getPetView(projectPet, at(day)).food, 1, 'canonical project task and its projection count once');
  const projectionOnly = recordPetSourceChanges(fresh(), sources({ projects: [project], plannerItems: [projection] }), sources({ projects: [project], plannerItems: [{ ...projection, done: true }] }), options)!;
  assert.equal(getPetView(projectionOnly, at(day)).food, 1, 'an unchanged source mirror must not suppress an explicit projection edit');
  const goal: Goal = { id: 'g', title: '', desiredResult: '', deadline: '', priority: 'main', status: 'active', createdAt: at(), updatedAt: at(), completedAt: null, archivedAt: null,
    milestones: [], actions: [], routines: [{ id: 'routine', title: '', metricType: 'count', targetValue: 3, frequencyType: 'daily', weekdays: [], startDate: '', endDate: '', isActive: true }], routineLogs: [] };
  const logged: Goal = { ...goal, routineLogs: [{ id: 'log', routineId: 'routine', date: '2026-10-20', value: 3, createdAt: at(hour), updatedAt: at(hour) }] };
  const routinePet = recordPetSourceChanges(fresh(), sources({ goals: [goal] }), sources({ goals: [logged] }), options)!;
  assert.equal(getPetView(routinePet, at(day)).food, 1);
  assert.equal(recordPetSourceChanges(fresh(), sources({ goals: [goal] }), sources({ goals: [{ ...logged, routineLogs: [{ ...logged.routineLogs[0], value: 2 }] }] }), options)!.rewards.length, 0);
  const partial = { ...logged, routineLogs: [{ ...logged.routineLogs[0], value: 2 }] };
  const lowerTarget = { ...partial, routines: [{ ...goal.routines[0], targetValue: 2 }] };
  assert.equal(recordPetSourceChanges(fresh(), sources({ goals: [partial] }), sources({ goals: [lowerTarget] }), options)!.rewards.length, 0, 'lowering the routine target does not perform work');
  const higherTarget = { ...logged, routines: [{ ...goal.routines[0], targetValue: 5 }] };
  assert.deepEqual(recordPetSourceChanges(routinePet, sources({ goals: [logged] }), sources({ goals: [higherTarget] }), options), routinePet, 'changing a target preserves historical completion');
  assert.equal(getPetView(recordPetSourceChanges(routinePet, sources({ goals: [logged] }), sources({ goals: [goal] }), nextDay), at(day + hour)).food, 0, 'historical routine correction revokes its reward');
  console.log('Pet sources: explicit transitions, no history import, dated habits, deletion/moves, projection deduplication and routine targets PASS');
}

function testTemporalRewards() {
  const earned = credit(fresh(), 'temporal', hour);
  const undone = recordPetReward(earned, 'temporal', false, op('temporal-undo', 2 * hour));
  const redone = recordPetReward(undone, 'temporal', true, op('temporal-redo', 4 * hour));
  assert.equal(getPetView(redone, at(1.5 * hour)).food, 1, 'future undo cannot revoke a credit before its timestamp');
  assert.equal(getPetView(redone, at(3 * hour)).food, 0, 'future redo carrying an earlier earnedAt cannot create food now');
  assert.equal(getPetView(redone, at(4 * hour)).food, 1);
  assert.equal(feedPet(redone, op('unfunded-now', 3 * hour)), redone, 'future redo cannot fund a new meal now');

  // An offline device saw the original reward but missed the undo at +2h.
  const staleMeal = feedPet(earned, op('stale-meal', 3 * hour));
  const combined = mergePetState(redone, staleMeal)!;
  assert.deepEqual(getPetView(combined, at(3 * hour)).acceptedFeedIds, []);
  assert.deepEqual(getPetView(combined, at(5 * hour)).rejectedFeedIds, ['stale-meal'], 'later redo cannot retroactively fund a meal during the undone interval');
  assert.equal(getPetView(combined, at(5 * hour)).food, 1);
  const actualMeal = feedPet(combined, op('after-redo-meal', 5 * hour));
  assert.deepEqual(getPetView(actualMeal, at(5 * hour)).acceptedFeedIds, ['after-redo-meal']);
  assert.equal(getPetView(actualMeal, at(5 * hour)).food, 0);

  const beforeUndoMeal = feedPet(earned, op('before-undo-meal', 1.5 * hour));
  const restoredMeal = mergePetState(redone, beforeUndoMeal)!;
  assert.deepEqual(getPetView(restoredMeal, at(3 * hour)).rejectedFeedIds, ['before-undo-meal'], 'current undo retains the intended meal revocation');
  assert.deepEqual(getPetView(restoredMeal, at(5 * hour)).acceptedFeedIds, ['before-undo-meal'], 'redo restores an originally valid spent credit, not an extra portion');
  assert.equal(getPetView(restoredMeal, at(5 * hour)).food, 0);

  // At +3h only B was available; at +5h A is restored. Both may pay exactly once.
  const twoCredits = credit(redone, 'second-temporal', 2.5 * hour);
  const duringUndo = feedPet(twoCredits, op('meal-from-B', 3 * hour));
  const afterRedo = feedPet(duringUndo, op('meal-from-A', 5 * hour));
  assert.deepEqual(getPetView(afterRedo, at(5 * hour)).acceptedFeedIds, ['meal-from-B', 'meal-from-A']);
  assert.equal(getPetView(afterRedo, at(5 * hour)).food, 0);
  assert.deepEqual(getPetView(parsePetState(JSON.stringify(afterRedo)), at(5 * hour)), getPetView(afterRedo, at(5 * hour)));
  assert.deepEqual(getPetView(mergePetState(staleMeal, redone), at(5 * hour)), getPetView(combined, at(5 * hour)));
  console.log('Pet time: future undo/redo isolation, as-of meal funding, undo revocation and credit identity accounting PASS');
}

function testWithoutStructuredClone() {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'structuredClone');
  try {
    Object.defineProperty(globalThis, 'structuredClone', { value: undefined, configurable: true });
    const pet = credit(fresh(), 'native');
    assert.deepEqual(parsePetState(JSON.stringify(pet)), pet);
    const merged = mergePetState(pet, credit(fresh(), 'other'))!;
    assert.equal(getPetView(feedPet(merged, op('native-feed', day)), at(day)).food, 1);
    const parsed = parsePetState(pet)!;
    parsed.births[0].id = 'mutated-copy';
    assert.equal(pet.births[0].id, 'born', 'JSON clones detach all mutable input');
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'structuredClone', descriptor);
    else delete (globalThis as { structuredClone?: unknown }).structuredClone;
  }
  console.log('Pet runtime: adoption, load, merge and feed without structuredClone PASS');
}

class Backend {
  rows = new Map<string, any>(); offline = false; writes = 0; conflicts = 0; beforeWrite?: () => void;
  from(table: string) {
    assert.equal(table, 'user_app_state');
    let action = 'read', payload: any; const filters: any = {};
    const query = {
      select: (_: string) => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (value: any) => { action = 'update'; payload = value; return query; },
      insert: (value: any) => { action = 'insert'; payload = value; return query; },
      maybeSingle: async () => {
        if (this.offline) return { error: { message: 'offline' }, data: null };
        const owner = filters.user_id ?? payload.user_id;
        if (action === 'read') return { error: null, data: structuredClone(this.rows.get(owner) ?? null) };
        this.beforeWrite?.();
        const old = this.rows.get(owner);
        if (action === 'insert' && old) { this.conflicts++; return { data: null, error: { code: '23505' } }; }
        if (action === 'update' && old?.updated_at !== filters.updated_at) { this.conflicts++; return { data: null, error: null }; }
        this.rows.set(owner, structuredClone({ ...old, ...payload, updated_at: `version-${++this.writes}` }));
        return { data: { user_id: owner }, error: null };
      },
    };
    return query;
  }
}
function snapshot(pet?: PetState) { return normalizeStoredKodaState({ goals: [], habits: [], kodaDays: [], projects: [], profile: { ...defaultProfile, pet } })!; }
async function testPersistence() {
  const a = credit(fresh(), 'a'), b = credit(fresh(), 'b');
  assert.deepEqual(parseStoredKodaState(JSON.stringify(snapshot(a)))!.profile.pet, a);
  assert.equal(snapshot().profile.pet, undefined);
  assert.equal(Object.hasOwn(snapshot().profile, 'pet'), false, 'legacy profiles keep their exact property shape');
  assert.equal(Object.hasOwn(mergeStoredKodaState(snapshot(), snapshot()).profile, 'pet'), false, 'merging legacy profiles must not add pet:undefined');
  for (const invalid of [undefined, null, {}, { schemaVersion: 999 }, 'broken']) {
    const input = { ...defaultProfile, pet: invalid };
    const normalized = normalizeStoredKodaState({ profile: input })!;
    assert.equal(Object.hasOwn(normalized.profile, 'pet'), false, 'invalid pet input is omitted, not preserved or set to undefined');
    assert.equal(Object.hasOwn(input, 'pet'), true, 'normalization does not mutate the supplied profile');
    assert.equal(Object.hasOwn(mergeStoredKodaState(snapshot(), normalized).profile, 'pet'), false);
    assert.deepEqual(parseStoredKodaState(JSON.stringify(normalized))!.profile, normalized.profile, 'legacy/invalid pet profile shape survives save/reload');
  }
  const merged = mergeStoredKodaState(snapshot(a), snapshot(b));
  assert.equal(getPetView(merged.profile.pet, at(day)).food, 2);
  assert.deepEqual(mergeStoredKodaState(snapshot(), snapshot(a)).profile.pet, a, 'old client without pet cannot remove it');
  const backend = new Backend();
  await Promise.all([writeAppStateSnapshot(backend, 'one', snapshot(a)), writeAppStateSnapshot(backend, 'one', snapshot(b))]);
  assert.ok(backend.conflicts > 0);
  assert.equal(getPetView(normalizeStoredKodaState(backend.rows.get('one'))!.profile.pet, at(day)).food, 2);
  await writeAppStateSnapshot(backend, 'one', snapshot());
  assert.equal(getPetView(normalizeStoredKodaState(backend.rows.get('one'))!.profile.pet, at(day)).food, 2);
  backend.offline = true;
  await assert.rejects(writeAppStateSnapshot(backend, 'one', snapshot(a)));
  backend.offline = false;
  await writeAppStateSnapshot(backend, 'one', snapshot(a));
  await writeAppStateSnapshot(backend, 'one', snapshot(a));
  assert.equal(getPetView(normalizeStoredKodaState(backend.rows.get('one'))!.profile.pet, at(day)).food, 2);
  const other = adoptPet(undefined, 'two', op('other-birth'));
  assert.equal(normalizeStoredKodaState({ ...snapshot(other), user_id: 'one' })!.profile.pet, undefined, 'cloud row owner rejects a foreign embedded pet');
  assert.equal(Object.hasOwn(normalizeStoredKodaState({ ...snapshot(other), user_id: 'one' })!.profile, 'pet'), false, 'rejecting a foreign pet omits its property entirely');
  await writeAppStateSnapshot(backend, 'two', snapshot(other));
  assert.equal(getPetView(normalizeStoredKodaState(backend.rows.get('two'))!.profile.pet, at(day)).food, 0);
  await assert.rejects(writeAppStateSnapshot(backend, 'two', snapshot(a)), /another account/);
  backend.beforeWrite = () => { backend.rows.get('one').updated_at = `competitor-${backend.conflicts}`; };
  await assert.rejects(writeAppStateSnapshot(backend, 'one', snapshot(a)), /retry required/);
  console.log('Pet persistence: JSON reload, normalization, stale clients, CAS insert race, offline retry, exhaustion and account isolation PASS');
}
testDomain(); testSources(); testTemporalRewards(); testWithoutStructuredClone(); void testPersistence();
