import assert from 'node:assert/strict';
import { SyncCoordinator, journalRowId, parseDeletedIds, writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import { normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
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

async function main() {
  const coordinator = new SyncCoordinator();
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
  console.log('Sync: serial writes, stale responses, recovery, idempotent journal retries and deletion persistence PASS');
}
void main();
