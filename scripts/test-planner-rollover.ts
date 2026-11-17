import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { rolloverUntimedPlannerItems } from '../src/features/koda/plannerRollover';
import { accountRecordValues, applyAccountRecordPatches, bootstrapAccountRecords, createAccountRecordPatches, parseAccountRecordSnapshot } from '../src/features/koda/accountRecordSync';
import { todayDateKey } from '../src/features/koda/utils';
import type { PlannerItem } from '../src/features/koda/types';

const today = '2026-11-17', stamp = '2026-11-17T08:00:00.000Z';
const task = (id: string, patch: Partial<PlannerItem> = {}): PlannerItem => ({
  id, title: id, date: '2026-11-16', time: '', done: false, sourceType: 'planner', ...patch,
});

if (process.argv.includes('--timezone-child')) {
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(value?: string | number) { super(value ?? '2026-11-17T00:30:00.000Z'); }
  }
  globalThis.Date = FixedDate as DateConstructor;
  const localToday = todayDateKey();
  assert.equal(localToday, process.env.TZ === 'America/Los_Angeles' ? '2026-11-16' : today);
  assert.equal(rolloverUntimedPlannerItems([task('past', { date: '2026-11-15' })], localToday, stamp)[0].date, localToday);
  assert.equal(rolloverUntimedPlannerItems([task('current', { date: localToday })], localToday, stamp)[0].updatedAt, undefined);
} else {
  const original = [task('old', { date: '2024-02-29', subtasks: [{ id: 'sub', title: 'Keep progress', done: true }] }),
    task('legacy', { sourceType: undefined }), task('whitespace', { time: '  ' }),
    task('done', { done: true }), task('failed', { failed: true }), task('deleted', { deletedAt: stamp }),
    task('timed', { time: '00:00' }), task('future', { date: '2026-11-18' }), task('today', { date: today }),
    task('undated', { date: '' }), task('invalid', { date: '2026-02-31' }),
    task('project', { sourceType: 'project' }), task('goal', { sourceType: 'goal' }),
    task('recurring', { sourceType: 'recurring' }), task('linked-legacy', { goalId: 'goal' })];
  const before = structuredClone(original);
  const moved = rolloverUntimedPlannerItems(original, today, stamp);
  assert.deepEqual(original, before, 'does not mutate caller records or nested subtasks');
  assert.deepEqual(moved.map(row => row.id), original.map(row => row.id), 'same IDs, order and count');
  for (let i = 0; i < 3; i++) assert.deepEqual(moved[i], { ...original[i], date: today, updatedAt: stamp });
  for (let i = 3; i < original.length; i++) assert.equal(moved[i], original[i], original[i].id);
  assert.equal(rolloverUntimedPlannerItems(moved, today, 'later'), moved, 'repeated render/pull produces no additional edit');
  assert.equal(rolloverUntimedPlannerItems(original, '2026-02-31', stamp), original);
  assert.equal(rolloverUntimedPlannerItems(moved, '2026-11-16', stamp), moved, 'clock/timezone rollback never moves tasks backward');
  assert.equal(rolloverUntimedPlannerItems([task('year', { date: '2026-12-31' })], '2027-01-01', stamp)[0].date, '2027-01-01');

  const source = [task('shared')];
  const snapshot = bootstrapAccountRecords('a', 'planner', source);
  const patches = createAccountRecordPatches('a', 'planner', source, rolloverUntimedPlannerItems(source, today, stamp), 'offline-device', snapshot, 100);
  assert.equal(patches.length, 1);
  assert.deepEqual(Object.keys(patches[0].set).sort(), ['date', 'updatedAt'], 'automatic edit never rewrites completion/title/subtasks');
  assert.deepEqual(patches[0].unset, []);
  const rolled = applyAccountRecordPatches(snapshot, patches);
  assert.deepEqual(applyAccountRecordPatches(rolled, patches), rolled, 'same queued operation retries idempotently');
  const persisted = JSON.parse(JSON.stringify({ snapshot: rolled, patches }));
  const reloaded = parseAccountRecordSnapshot(persisted.snapshot, 'a', 'planner')!;
  const reloadedItems = accountRecordValues<PlannerItem>(applyAccountRecordPatches(reloaded, persisted.patches));
  assert.deepEqual(createAccountRecordPatches('a', 'planner', reloadedItems, rolloverUntimedPlannerItems(reloadedItems, today, stamp), 'reload', reloaded, 101), []);
  assert.throws(() => parseAccountRecordSnapshot(persisted.snapshot, 'b', 'planner'), /Invalid/, 'another account cannot hydrate this queue');
  assert.throws(() => applyAccountRecordPatches(bootstrapAccountRecords('b', 'planner', source), patches), /foreign/);

  for (const field of ['done', 'failed'] as const) {
    const completion = createAccountRecordPatches('a', 'planner', source, [{ ...source[0], [field]: true }], 'other-device', snapshot, 102);
    for (const edits of [[...patches, ...completion], [...completion, ...patches]]) {
      const merged = accountRecordValues<PlannerItem>(applyAccountRecordPatches(snapshot, edits));
      assert.equal(merged[0][field], true, 'offline carry-forward cannot reopen completed/failed work');
      assert.equal(rolloverUntimedPlannerItems(merged, '2026-11-18', stamp), merged);
    }
  }
  const deletion = createAccountRecordPatches('a', 'planner', source, [], 'other-device', snapshot, 103);
  for (const edits of [[...patches, ...deletion], [...deletion, ...patches]]) {
    const merged = applyAccountRecordPatches(snapshot, edits);
    assert.deepEqual(accountRecordValues(merged), [], 'deleted tasks never reappear');
    assert.ok(merged.records.shared.deleted, 'tombstone survives rollover');
  }
  const reschedule = createAccountRecordPatches('a', 'planner', source, [{ ...source[0], date: '2026-12-01' }], 'other-device', rolled, 1);
  for (const edits of [[...patches, ...reschedule], [...reschedule, ...patches]]) {
    const merged = accountRecordValues<PlannerItem>(applyAccountRecordPatches(snapshot, edits));
    assert.equal(merged[0].date, '2026-12-01', 'causally newer scheduling wins even with a slow device clock');
    assert.equal(rolloverUntimedPlannerItems(merged, today, stamp), merged);
  }
  for (const timezone of ['Europe/Moscow', 'America/Los_Angeles']) {
    const child = spawnSync(process.execPath, ['--import', 'tsx', resolve('scripts/test-planner-rollover.ts'), '--timezone-child'], { env: { ...process.env, TZ: timezone }, encoding: 'utf8' });
    assert.equal(child.status, 0, `${timezone}: ${child.stdout}\n${child.stderr}`);
  }
  console.log('planner rollover: eligibility, identity, idempotence, offline reload, account isolation, concurrent completion/deletion/rescheduling and local dates PASS');
}
