import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { SyncCoordinator, atSyncStage, syncFailureText, journalRowId, parseDeletedIds, writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import { normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { normalizeGoal, calculateGoalProgress } from '../src/features/koda/goalLogic';
import { kodaDayId } from '../src/features/koda/kodaDaySync';
import { visibleGoals } from '../src/features/koda/goalDeletion';
import { toNullableSqlDate, toLegacySqlDate, toRequiredSqlDate, RequiredSyncDateError } from '../src/features/koda/syncDate';
import type { Project } from '../src/features/koda/types';

// In-memory PostgREST boundary: optional columns, version checks and insert races.
class AppStateBackend {
  rows = new Map<string, Record<string, any>>();
  modern = false;
  offline = false;
  writes = 0;
  conflicts = 0;
  beforeWrite?: () => void;
  from(table: string) {
    assert.equal(table, 'user_app_state');
    let operation = 'read';
    let payload: Record<string, any> = {};
    const filters: Record<string, unknown> = {};
    const query = {
      select: (_columns: string) => query,
      eq: (key: string, value: unknown) => { filters[key] = value; return query; },
      update: (value: Record<string, any>) => { operation = 'update'; payload = value; return query; },
      insert: (value: Record<string, any>) => { operation = 'insert'; payload = value; return query; },
      maybeSingle: async () => {
        if (this.offline) return { data: null, error: { code: 'FETCH', message: 'offline' } };
        const userId = String(filters.user_id ?? payload.user_id);
        if (operation === 'read') return { data: structuredClone(this.rows.get(userId) ?? null), error: null };
        if (!this.modern && ('projects' in payload || 'koda_days' in payload)) {
          return { data: null, error: { code: 'PGRST204', message: 'projects column missing from schema cache' } };
        }
        this.beforeWrite?.();
        const existing = this.rows.get(userId);
        if (operation === 'insert' && existing) {
          this.conflicts += 1;
          return { data: null, error: { code: '23505', message: 'duplicate key' } };
        }
        if (operation === 'update' && (!existing || existing.updated_at !== filters.updated_at)) {
          this.conflicts += 1;
          return { data: null, error: null };
        }
        this.writes += 1;
        this.rows.set(userId, structuredClone({ ...existing, ...payload, updated_at: `server-version-${this.writes}` }));
        return { data: { user_id: userId }, error: null };
      },
    };
    return query;
  }
}

function project(id: string, updatedAt = '2026-10-17T10:00:00Z'): Project {
  return { id, title: id, description: '', status: 'active', tasks: [], createdAt: updatedAt, updatedAt, completedAt: null };
}

async function testProjectSync() {
  const backend = new AppStateBackend();
  const desktop = normalizeStoredKodaState({ projects: [project('desktop')] })!;
  await writeAppStateSnapshot(backend, 'one', desktop);
  assert.equal(backend.rows.get('one')?.projects, undefined);
  assert.deepEqual(normalizeStoredKodaState(backend.rows.get('one'))!.projects, desktop.projects,
    'a phone must receive projects even without the projects column');
  const phone = normalizeStoredKodaState({ projects: [project('phone')] })!;
  await writeAppStateSnapshot(backend, 'one', phone);
  assert.deepEqual(normalizeStoredKodaState(backend.rows.get('one'))!.projects.map(item => item.id), ['desktop', 'phone']);

  // An old app falsely cleared its queue; its local snapshot must remain usable.
  const recovered = parseStoredKodaState(JSON.stringify(desktop))!;
  await writeAppStateSnapshot(backend, 'recovered', recovered);
  assert.equal(normalizeStoredKodaState(backend.rows.get('recovered'))!.projects[0].id, 'desktop');
  await writeAppStateSnapshot(backend, 'other-account', phone);
  assert.equal(normalizeStoredKodaState(backend.rows.get('other-account'))!.projects.length, 1);

  backend.offline = true;
  await assert.rejects(writeAppStateSnapshot(backend, 'one', desktop));
  backend.offline = false;
  await writeAppStateSnapshot(backend, 'one', desktop);
  await writeAppStateSnapshot(backend, 'one', desktop);
  assert.equal(normalizeStoredKodaState(backend.rows.get('one'))!.projects.length, 2, 'retry is idempotent');

  backend.modern = true;
  backend.rows.get('one')!.projects = []; // migration default cannot hide compatibility data
  backend.rows.get('one')!.koda_days = [];
  await writeAppStateSnapshot(backend, 'one', desktop);
  assert.equal(backend.rows.get('one')!.projects.length, 2);

  // Both devices read the same version before either writes.
  await Promise.all([
    writeAppStateSnapshot(backend, 'one', normalizeStoredKodaState({ projects: [project('A')] })!),
    writeAppStateSnapshot(backend, 'one', normalizeStoredKodaState({ projects: [project('B')] })!),
  ]);
  assert.ok(backend.conflicts > 0, 'the test must exercise a real stale version');
  assert.deepEqual(backend.rows.get('one')!.projects.map((item: Project) => item.id).sort(), ['A', 'B', 'desktop', 'phone']);
  await Promise.all([writeAppStateSnapshot(backend, 'new', desktop), writeAppStateSnapshot(backend, 'new', phone)]);
  assert.equal(normalizeStoredKodaState(backend.rows.get('new'))!.projects.length, 2, 'concurrent first insert retries');

  const oldProject = project('shared');
  oldProject.tasks = [{ id: 'task', title: 'Task', description: '', cost: '', status: 'todo', createdAt: oldProject.createdAt,
    updatedAt: oldProject.updatedAt, completedAt: null, plannedDate: '', plannedTime: '', deletedAt: null }];
  const archived = { ...oldProject, status: 'archived' as const, updatedAt: '2026-10-17T11:00:00Z',
    tasks: [{ ...oldProject.tasks[0], updatedAt: '2026-10-17T11:00:00Z', deletedAt: '2026-10-17T11:00:00Z' }] };
  await writeAppStateSnapshot(backend, 'history', normalizeStoredKodaState({ projects: [archived] })!);
  backend.rows.get('history')!.profile.__kodaNotes = ['latest note'];
  const stale = normalizeStoredKodaState({ projects: [oldProject] })!;
  await writeAppStateSnapshot(backend, 'history', stale);
  const history = normalizeStoredKodaState(backend.rows.get('history'))!;
  assert.equal(history.projects[0].status, 'archived');
  assert.equal(history.projects[0].tasks[0].deletedAt, archived.updatedAt);
  assert.deepEqual(backend.rows.get('history')!.profile.__kodaNotes, ['latest note']);

  backend.beforeWrite = () => { backend.rows.get('history')!.updated_at = `competing-${backend.conflicts}`; };
  await assert.rejects(writeAppStateSnapshot(backend, 'history', stale), /retry required/);
  console.log('Projects: legacy schema, reload, migration, account isolation, offline retries, concurrent writes and tombstones PASS');
}

async function testScheduledSync() {
  const coordinator = new SyncCoordinator();
  let pending = true, active = true, successes = 0, failures = 0, writes = 0;
  const callbacks = {
    isPending: () => pending, isActive: () => active,
    onSuccess: () => { successes++; pending = false; }, onError: () => { failures++; },
  };
  const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
  const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
  const started = gate(), finish = gate();
  const cancel = coordinator.schedule('appState', 0, async () => { writes++; started.release(); await finish.promise; }, callbacks, 0);
  await started.promise;
  // Model multiple retry-effect cleanups while the original request is in flight.
  cancel();
  const retry = coordinator.schedule('appState', 0, async () => { writes++; }, callbacks, 0);
  await tick(); retry();
  coordinator.schedule('appState', 0, async () => { writes++; }, callbacks, 0);
  await tick(); finish.release(); await tick();
  assert.equal(successes, 1, 'retry cleanup cannot suppress acknowledgement of an unchanged revision');
  assert.equal(writes, 1, 'queued retries skip an already acknowledged domain');

  pending = true;
  const editStarted = gate(), editFinish = gate();
  coordinator.schedule('appState', 0, async () => { editStarted.release(); await editFinish.promise; }, callbacks, 0);
  await editStarted.promise; coordinator.changed('appState'); editFinish.release(); await tick();
  assert.equal(successes, 1, 'an old successful response cannot clear a newer edit');
  assert.equal(pending, true);
  const failureStarted = gate(), failureFinish = gate();
  coordinator.schedule('appState', 1, async () => { failureStarted.release(); await failureFinish.promise; throw new Error('old'); }, callbacks, 0);
  await failureStarted.promise; coordinator.changed('appState'); failureFinish.release(); await tick();
  assert.equal(failures, 0, 'an old failure cannot replace the current revision status');

  const cancelBeforeStart = coordinator.schedule('appState', 2, async () => { writes++; }, callbacks, 0);
  cancelBeforeStart(); await tick(); assert.equal(writes, 1);
  const accountStarted = gate(), accountFinish = gate();
  coordinator.schedule('appState', 2, async () => { accountStarted.release(); await accountFinish.promise; }, callbacks, 0);
  await accountStarted.promise; active = false; accountFinish.release(); await tick();
  assert.equal(successes, 1, 'unmounted accounts cannot acknowledge');
  active = true;

  let savedSnapshot = false, failureText = '';
  coordinator.schedule('appState', 2, async () => {
    savedSnapshot = true;
    await atSyncStage('goalMirror', () => atSyncStage('actions', async () => {
      throw { code: '23503', message: 'SECRET token', details: 'PRIVATE payload' };
    }));
  }, { ...callbacks, onError: error => { failures++; failureText = syncFailureText('appState', error); } }, 0);
  await tick();
  assert.equal(savedSnapshot, true); assert.equal(pending, true); assert.equal(failures, 1);
  assert.match(failureText, /Снимок данных сохранён в облаке/);
  assert.match(failureText, /шаги целей.*23503/);
  assert.doesNotMatch(failureText, /SECRET|PRIVATE/);
  const snapshotError = await atSyncStage('snapshot', async () => { throw { code: 'SECRET', message: 'PRIVATE' }; }).catch(error => error);
  const snapshotText = syncFailureText('appState', snapshotError);
  assert.doesNotMatch(snapshotText, /сохранён|SECRET|PRIVATE/);
  assert.match(syncFailureText('notes', new Error('PRIVATE')), /заметки/);
  coordinator.schedule('appState', 2, async () => {}, callbacks, 0);
  await tick(); assert.equal(successes, 2); assert.equal(pending, false);
  console.log('Scheduled sync: retry cleanup, duplicate attempts, revisions, unmount, failed mirror and safe stage errors PASS');
}

async function testGoalDatePayloads() {
  const invalid = ['31.09', 'Ноябрь 2026', 'пока не получу оффер', '2026-02-30', '2026-04-31', '2026-13-01', '2026-00-01', '2026-01-00', '1900-02-29', '0000-01-01', '2026-1-01', ' 2026-11-05', '2026-11-05T00:00:00Z', '', null, undefined, 20261105];
  for (const value of invalid) assert.equal(toNullableSqlDate(value), null, String(value));
  for (const value of ['2026-11-05', '2024-02-29', '2000-02-29', '0001-01-01', '9999-12-31']) assert.equal(toNullableSqlDate(value), value);
  for (const [legacy, iso] of [['01.08.2026', '2026-08-01'], ['29.02.2024', '2024-02-29'], ['2026-08-01', '2026-08-01']]) {
    assert.equal(toLegacySqlDate(legacy), iso);
    assert.equal(toRequiredSqlDate(legacy, 'routineStart'), iso);
    assert.equal(toRequiredSqlDate(legacy, 'routineLog'), iso);
  }
  for (const value of ['01.08', '31.09.2026', '29.02.2026', '01.08.0000', '1.8.2026', '2026-02-30', '']) {
    assert.equal(toLegacySqlDate(value), null);
    assert.throws(() => toRequiredSqlDate(value, 'routineStart'), RequiredSyncDateError);
    assert.throws(() => toRequiredSqlDate(value, 'routineLog'), RequiredSyncDateError);
  }

  // Execute the actual nested app writer against an in-memory PostgREST boundary,
  // so a missed field in KodaApp cannot pass through helper-only coverage.
  const source = ts.createSourceFile('KodaApp.tsx', readFileSync(new URL('../src/features/koda/KodaApp.tsx', import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let writer: ts.FunctionDeclaration | undefined;
  const find = (node: ts.Node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'syncGoalsToBackend') writer = node;
    ts.forEachChild(node, find);
  };
  find(source); assert.ok(writer);
  const js = ts.transpileModule(writer.getText(source), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const payloads = new Map<string, Record<string, any>[]>();
  const client = { from: (table: string) => ({ upsert: async (rows: Record<string, any>[]) => {
    for (const row of rows) for (const field of ['deadline', 'target_date', 'due_date', 'start_date', 'end_date', 'log_date']) {
      if (field in row) assert.equal(row[field], toNullableSqlDate(row[field]), `${table}.${field} must be a valid SQL DATE or null`);
    }
    payloads.set(table, structuredClone(rows)); return { error: null };
  } }) };
  const syncGoals = new Function('userId', 'isSupabaseConfigured', 'supabase', 'isUuid', 'kodaDayId', 'calculateGoalProgress', 'atSyncStage', 'toNullableSqlDate', 'toRequiredSqlDate', 'visibleGoals', `${js}; return syncGoalsToBackend;`)(
    'owner', () => true, client, (value: string) => /^[0-9a-f-]{36}$/.test(value), kodaDayId, calculateGoalProgress, atSyncStage, toNullableSqlDate, toRequiredSqlDate, visibleGoals,
  );
  const deadlines = ['31.09', 'Ноябрь 2026', 'пока не получу оффер', '2026-02-30', '2026-11-05'];
  const goals = deadlines.map((deadline, index) => normalizeGoal({
    id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`, title: 'Fixture', deadline,
    milestones: [{ id: `milestone-${index}`, title: 'Fixture milestone', deadline }],
    actions: [{ id: `action-${index}`, title: 'Fixture action', dueDate: deadline }],
    routines: [{ id: `routine-${index}`, title: 'Fixture routine', startDate: '2026-11-01', endDate: deadline }],
  })!);
  const state = normalizeStoredKodaState({ goals })!;
  const before = JSON.stringify(state);
  const backend = new AppStateBackend();
  await writeAppStateSnapshot(backend, 'owner', state);
  await syncGoals(state.goals);
  assert.equal(JSON.stringify(state), before, 'mirror serialization must not alter the UI/source snapshot');
  assert.deepEqual(backend.rows.get('owner')!.goals, state.goals, 'snapshot retains every original free-form deadline');
  for (const [table, field] of [['goals', 'deadline'], ['goals', 'target_date'], ['goal_milestones', 'deadline'], ['goal_actions', 'due_date'], ['goal_routines', 'end_date']]) {
    assert.deepEqual(payloads.get(table)!.map(row => row[field]), [null, null, null, null, '2026-11-05'], `${table}.${field}`);
  }
  const legacyState = structuredClone(state);
  legacyState.goals[0].routines[0].startDate = '01.08.2026';
  legacyState.goals[0].routineLogs = [{ id: 'legacy-log', routineId: 'routine-0', date: '02.08.2026', value: 1, createdAt: '2026-08-02T00:00:00Z', updatedAt: '2026-08-02T00:00:00Z' }];
  const legacyBefore = JSON.stringify(legacyState);
  await writeAppStateSnapshot(backend, 'legacy-owner', legacyState);
  await syncGoals(legacyState.goals);
  assert.equal(payloads.get('goal_routines')![0].start_date, '2026-08-01');
  assert.equal(payloads.get('goal_routine_logs')![0].log_date, '2026-08-02');
  assert.equal(JSON.stringify(legacyState), legacyBefore);
  assert.deepEqual(backend.rows.get('legacy-owner')!.goals, legacyState.goals);

  for (const field of ['routineStart', 'routineLog'] as const) {
    const incomplete = structuredClone(legacyState);
    if (field === 'routineStart') incomplete.goals[0].routines[0].startDate = '01.08';
    else incomplete.goals[0].routineLogs[0].date = '02.08';
    payloads.clear();
    let acknowledged = false, text = '';
    const coordinator = new SyncCoordinator();
    await new Promise<void>(resolve => {
      coordinator.schedule('appState', 0, async () => {
        await atSyncStage('snapshot', () => writeAppStateSnapshot(backend, `incomplete-${field}`, incomplete));
        await atSyncStage('goalMirror', () => syncGoals(incomplete.goals));
      }, {
        isActive: () => true, isPending: () => true,
        onSuccess: () => { acknowledged = true; resolve(); },
        onError: error => { text = syncFailureText('appState', error); resolve(); },
      }, 0);
    });
    assert.equal(acknowledged, false, 'missing year cannot silently clear pending');
    assert.match(text, /Снимок данных сохранён в облаке/);
    assert.match(text, field === 'routineStart' ? /дату начала ритуала с годом/ : /дату выполнения ритуала с годом/);
    assert.equal(payloads.has(field === 'routineStart' ? 'goal_routines' : 'goal_routine_logs'), false, 'invalid required dates never reach upsert/defaults');
    assert.deepEqual(backend.rows.get(`incomplete-${field}`)!.goals, incomplete.goals);
  }
  console.log('SQL DATE mirror: free-form/invalid deadlines become null, valid dates survive, original snapshot is unchanged PASS');
  console.log('Required dates: complete legacy dates convert, missing/invalid years keep pending with a precise safe error, snapshots preserved PASS');
}

async function testSnapshotDiagnostics() {
  const state = normalizeStoredKodaState({})!;
  const row = { ...structuredClone(state), user_id: 'owner', updated_at: 'v1' };
  type Reply = { data: unknown; error: unknown; status?: number };
  function backend(reply?: (phase: 'read' | 'write') => Reply | undefined) {
    const calls: string[] = [];
    return { calls, from() {
      let phase: 'read' | 'write' = 'read';
      const query = { select: () => query, eq: () => query,
        update: () => { phase = 'write'; return query; }, insert: () => { phase = 'write'; return query; },
        maybeSingle: async () => {
          calls.push(phase);
          return reply?.(phase) ?? { data: phase === 'read' ? structuredClone(row) : { user_id: 'owner' }, error: null, status: 200 };
        },
      };
      return query;
    } };
  }
  async function failure(client: ReturnType<typeof backend>, snapshot = state) {
    try { await atSyncStage('snapshot', () => writeAppStateSnapshot(client, 'owner', snapshot)); }
    catch (error) {
      const text = syncFailureText('appState', error);
      assert.doesNotMatch(text, /SECRET|PRIVATE|token=|stack|https:\/\/|сохранён в облаке/);
      return text;
    }
    assert.fail('Expected a failed snapshot');
  }
  const abort = Object.assign(new Error('SECRET token=PRIVATE'), { name: 'AbortError' });
  const timeout = await failure(backend(phase => { if (phase === 'read') throw abort; }));
  assert.match(timeout, /чтение снимка — тайм-аут или отмена запроса/);
  const wrappedAbort = await failure(backend(phase => phase === 'write' ? { data: null, error: { code: '', message: 'AbortError: SECRET token=PRIVATE', details: 'stack PRIVATE' }, status: 0 } : undefined));
  assert.match(wrappedAbort, /запись снимка — тайм-аут или отмена запроса/);
  const network = await failure(backend(phase => phase === 'read' ? { data: null, error: { code: '', message: 'TypeError: Load failed PRIVATE' }, status: 0 } : undefined));
  assert.match(network, /чтение снимка — ошибка сети/);
  const safari = await failure(backend(phase => { if (phase === 'write') throw new TypeError('Load failed SECRET'); }));
  assert.match(safari, /запись снимка — ошибка сети/);
  const server = await failure(backend(phase => phase === 'write' ? { data: null, error: { code: '42501', message: 'SECRET', details: 'PRIVATE' }, status: 403 } : undefined));
  assert.match(server, /запись снимка — ошибка сервера \(код 42501\)/);
  const unsafeCode = await failure(backend(phase => phase === 'read' ? { data: null, error: { code: 'PRIVATE', message: 'SECRET' }, status: 500 } : undefined));
  assert.match(unsafeCode, /чтение снимка — ошибка сервера/);
  const localClient = backend();
  const malformed = structuredClone(state);
  Object.defineProperty(malformed, 'projects', { get() { throw new TypeError('SECRET local payload'); } });
  const local = await failure(localClient, malformed);
  assert.match(local, /объединение снимка — локальная ошибка/);
  assert.deepEqual(localClient.calls, ['read'], 'merge errors never attempt a write');
  const conflictClient = backend(phase => phase === 'write' ? { data: null, error: null, status: 200 } : undefined);
  const conflict = await failure(conflictClient);
  assert.match(conflict, /проверка версии \(CAS\) — конфликт версий после 4 попыток/);
  assert.deepEqual(conflictClient.calls, Array.from({ length: 4 }, () => ['read', 'write']).flat(), 'CAS retry count is unchanged');
  let writes = 0;
  const fallback = await failure(backend(phase => {
    if (phase === 'read') return { data: null, error: null, status: 200 };
    if (++writes === 1) return { data: null, error: { code: 'PGRST204', message: 'projects missing SECRET' }, status: 400 };
    throw new TypeError('Load failed PRIVATE');
  }));
  assert.match(fallback, /запись снимка — ошибка сети/);
  assert.equal(writes, 2, 'optional-column retry remains enabled and reports its own failure');
  console.log('Snapshot diagnostics: read/merge/write/CAS, abort/network/server/local, fallback retry and secret-free output PASS');
}

async function main() {
  const coordinator = new SyncCoordinator();
  coordinator.changed('appState');
  assert.deepEqual(coordinator.restorePending(['journal'], ['appState']), ['journal', 'appState'],
    'Late queue hydration preserves goals repaired while local queue was loading');
  assert.deepEqual(coordinator.restorePending([], ['appState']), ['appState'],
    'Failed queue read cannot discard a newly recovered goal');
  assert.deepEqual(new SyncCoordinator().restorePending(['notes'], ['appState']), ['notes'],
    'A new account does not inherit the previous account pending state');
  const events: string[] = [];
  let finish!: () => void;
  const gate = new Promise<void>(resolve => { finish = resolve; });
  const first = coordinator.run('planner', 0, async () => {
    events.push('old start');
    await gate;
    // An old response must not acknowledge a newer edit.
    if (coordinator.current('planner', 0)) events.push('old acknowledged');
    events.push('old end');
  });
  await Promise.resolve();
  const stale = coordinator.run('planner', 0, async () => { events.push('stale queued write'); });
  coordinator.changed('planner');
  const latest = coordinator.run('planner', 1, async () => { events.push('latest'); });
  assert.deepEqual(events, ['old start']);
  finish();
  await Promise.all([first, stale, latest]);
  assert.deepEqual(events, ['old start', 'old end', 'latest']);
  await assert.rejects(coordinator.run('journal', 0, async () => { throw new Error('offline'); }));
  await coordinator.run('notes', 0, async () => { events.push('recovered'); });
  assert.equal(events.at(-1), 'recovered');
  const id = await journalRowId('account:one', 'journal-local-123');
  assert.match(id, /^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-a[a-f0-9]{3}-[a-f0-9]{12}$/);
  assert.equal(await journalRowId('account:one', 'journal-local-123'), id);
  assert.equal(await journalRowId('account:one', id), id);
  assert.notEqual(await journalRowId('account:two', 'journal-local-123'), id);
  assert.deepEqual(parseDeletedIds(JSON.stringify(['one', null, 4, 'two'])), ['one', 'two']);
  assert.deepEqual(parseDeletedIds('broken'), []);
  await testProjectSync();
  await testScheduledSync();
  await testGoalDatePayloads();
  await testSnapshotDiagnostics();
  console.log('Sync: serial writes, stale responses, recovery, idempotent journal retries and deletion persistence PASS');
}
void main();
