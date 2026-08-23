import assert from 'node:assert/strict';
import { kodaDayId, mergeKodaDaySources, toKodaDayRow } from '../src/features/koda/kodaDaySync';
import type { KodaDay, KodaDayStatus } from '../src/features/koda/types';

function day(status: KodaDayStatus, updatedAt: string, id = 'legacy-device-id'): KodaDay {
  return {
    id,
    localDate: '2026-08-13',
    timezone: 'Europe/Moscow',
    status,
    startedAt: status === 'not_started' ? null : '2026-08-13T06:00:00.000Z',
    finishedAt: status === 'completed' ? '2026-08-13T18:00:00.000Z' : null,
    goalScore: null,
    plannerScore: 0,
    totalScore: null,
    classification: 'unclassified',
    scoreVersion: 1,
    summary: '',
    focusLoss: '',
    nextRecommendation: '',
    goalsSnapshot: [],
    plannerSnapshot: [],
    calculationSnapshot: null,
    createdAt: '2026-08-13T06:00:00.000Z',
    updatedAt,
  };
}

const old = '2026-08-13T06:00:00.000Z';
const fresh = '2026-08-13T07:00:00.000Z';

assert.equal(mergeKodaDaySources([day('active', fresh)], [day('not_started', old)])[0].status, 'active');
assert.equal(mergeKodaDaySources([day('not_started', old)], [day('active', fresh)])[0].status, 'active');
assert.equal(mergeKodaDaySources([day('completed', fresh)], [day('active', old)])[0].status, 'completed');
assert.equal(mergeKodaDaySources([day('active', fresh, 'remote')], [day('active', old, 'local')]).length, 1);

const userId = '8e319d08-407d-4e49-a0cb-4d0dca08ccfb';
const firstId = kodaDayId(userId, '2026-08-13');
const retryId = kodaDayId(userId, '2026-08-13');
assert.equal(firstId, retryId);
assert.match(firstId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-a[0-9a-f]{3}-[0-9a-f]{12}$/);
assert.equal(toKodaDayRow(day('active', fresh), userId).id, firstId);

const offlineLocal = day('active', fresh);
const afterReconnect = mergeKodaDaySources([], [offlineLocal]);
assert.equal(afterReconnect[0].status, 'active');
assert.equal(toKodaDayRow(afterReconnect[0], userId).status, 'active');

console.log('koda day sync tests passed');
