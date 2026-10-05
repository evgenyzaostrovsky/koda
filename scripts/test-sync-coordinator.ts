import assert from 'node:assert/strict';
import { SyncCoordinator, journalRowId, parseDeletedIds } from '../src/features/koda/syncCoordinator';

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
  console.log('Sync: serial writes, stale responses, recovery, idempotent journal retries and deletion persistence PASS');
}
void main();
