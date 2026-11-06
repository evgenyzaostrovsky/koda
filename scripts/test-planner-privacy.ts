import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { plannerOwnerKey, plannerRowsForAccount, resolvePlannerPull } from '../src/features/koda/plannerPrivacy';
import { parsePlannerItems } from '../src/features/koda/persistence';
import type { PlannerItem } from '../src/features/koda/types';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const item = (id: string, updatedAt = '2026-11-01T10:00:00Z'): PlannerItem => ({
  id, date: '2026-11-01', time: '', title: id, done: false, updatedAt,
});

function testClientRecovery() {
  const local = [item('kept'), item('deleted')];
  for (const pending of [false, true]) {
    for (const remote of [null, []]) {
      const recovered = resolvePlannerPull(local, remote, pending, ['deleted']);
      const expected = remote === null || pending ? [local[0]] : [];
      assert.deepEqual(recovered, expected, 'failed reads retain local edits; confirmed empty snapshots remove stale rows');
      const reloaded = parsePlannerItems(JSON.stringify(recovered));
      assert.deepEqual(resolvePlannerPull(reloaded, remote, pending, ['deleted']), recovered, 'reload cannot erase the retained copy');
    }
  }
  assert.deepEqual(resolvePlannerPull(null, [], false, []), [], 'a new account starts empty');
  const newer = { ...item('kept', '2026-11-01T11:00:00Z'), title: 'offline edit' };
  const merged = resolvePlannerPull([newer], [local[0], item('phone')], true, []);
  assert.equal(merged.find(row => row.id === 'kept')?.title, newer.title);
  assert.equal(merged.length, 2);
  const rows = plannerRowsForAccount(a, merged);
  assert.equal(rows.length, merged.length, 'one row per item, no guest mirrors');
  assert(rows.every(row => row.owner_key === `user:${a}`));
  assert.deepEqual(rows.map(row => row.id), merged.map(row => row.id), 'keep existing account/calendar IDs');
  assert.deepEqual(plannerRowsForAccount(a, merged), rows, 'retry keeps the same IDs and payload');
  assert.throws(() => plannerRowsForAccount('', merged), /requires an account/);
  assert.notEqual(plannerOwnerKey(a), plannerOwnerKey(b));
  assert.deepEqual(local, [item('kept'), item('deleted')], 'source snapshot remains untouched');
}

async function testPolicies() {
  const db = new PGlite();
  const denied = (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === '42501');
  const migration = await readFile('supabase/migrations/0018_private_legacy_storage.sql', 'utf8');
  try {
    // Minimal old journal schema; planner/push and their open policies use the real migrations.
    await db.exec(`create schema auth; create role anon; create role authenticated; create role service_role bypassrls;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to anon, authenticated, service_role;
      grant execute on function auth.uid() to anon, authenticated, service_role;
      create table public.journal_entries(id uuid primary key default gen_random_uuid(),user_id uuid not null,content text not null,entry_date date not null default current_date);
      alter table public.journal_entries enable row level security;`);
    for (const name of ['0003_public_single_user_journal', '0005_push_notifications', '0006_planner_events']) {
      await db.exec(await readFile(`supabase/migrations/${name}.sql`, 'utf8'));
    }
    await db.exec('grant all on public.journal_entries, public.planner_events, public.push_subscriptions to anon, authenticated;');
    await db.query(`insert into journal_entries(user_id,owner_key,content) values ($1,'default','A legacy own'),($2,$3,'B own'),(null,'default','unclaimed')`, [a, b, plannerOwnerKey(b)]);
    await db.query(`insert into planner_events(id,owner_key,event_date,title) values ('a',$1,current_date,'A'),('b',$2,current_date,'B'),('guest','calendar-legacy',current_date,'Guest'),('mirror','calendar-legacy',current_date,'Mirror')`, [plannerOwnerKey(a), plannerOwnerKey(b)]);
    await db.exec(`insert into push_subscriptions(endpoint,subscription) values ('https://push.fixture.invalid/one','{}');`);
    const snapshot = async () => Promise.all(['journal_entries', 'planner_events', 'push_subscriptions'].map(table => db.query(`select * from ${table} order by id`)));
    const before = await snapshot();
    await db.exec(migration);
    await db.exec(migration); // Safe to retry policy deployment; never transforms data.
    await db.exec(await readFile('supabase/migrations/0020_account_data_isolation_guards.sql', 'utf8'));
    assert.deepEqual(await snapshot(), before, 'migration preserves every legacy row and field');

    const asOwner = async (owner: string) => {
      await db.exec('reset role;set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    };
    const upsert = (id: string, owner: string, title: string) => db.query(`insert into planner_events(id,owner_key,event_date,title) values ($1,$2,current_date,$3) on conflict(id) do update set owner_key=excluded.owner_key,title=excluded.title`, [id, owner, title]);
    await asOwner(a);
    assert.deepEqual((await db.query('select title from planner_events')).rows, [{ title: 'A' }]);
    assert.deepEqual((await db.query('select content from journal_entries')).rows, [{ content: 'A legacy own' }]);
    await upsert('new', plannerOwnerKey(a), 'New');
    await upsert('new', plannerOwnerKey(a), 'New');
    assert.equal((await db.query('select * from planner_events')).rows.length, 2);
    await assert.rejects(upsert('forged', plannerOwnerKey(b), 'forged'), denied);
    await assert.rejects(upsert('b', plannerOwnerKey(a), 'take over'), denied);
    await assert.rejects(upsert('guest', plannerOwnerKey(a), 'claim guest'), denied);
    await assert.rejects(db.query('update planner_events set owner_key=$1 where id=$2', [plannerOwnerKey(b), 'a']), denied);
    await assert.rejects(db.query('update journal_entries set user_id=$1', [b]), denied);
    await assert.rejects(db.query("insert into journal_entries(user_id,owner_key,content) values ($1,'default','forged')", [b]), denied);
    assert.equal((await db.query("update planner_events set title='forged' where id='b' returning id")).rows.length, 0);
    assert.equal((await db.query("delete from planner_events where id='b' returning id")).rows.length, 0);
    assert.equal((await db.query('delete from journal_entries where user_id=$1 returning id', [b])).rows.length, 0);
    await db.query("update journal_entries set content='A edited' where user_id=$1", [a]);
    await db.exec("delete from planner_events where id='new';");

    await asOwner(b);
    assert.deepEqual((await db.query('select title from planner_events')).rows, [{ title: 'B' }]);
    assert.deepEqual((await db.query('select content from journal_entries')).rows, [{ content: 'B own' }]);
    await assert.rejects(upsert('a', plannerOwnerKey(b), 'take over A'), denied);
    await asOwner('');
    assert.equal((await db.query('select * from planner_events')).rows.length, 0);
    assert.equal((await db.query('select * from journal_entries')).rows.length, 0);
    await assert.rejects(upsert('empty-session', plannerOwnerKey(a), 'no session'), denied);

    for (const role of ['anon', 'authenticated']) {
      await db.exec(`reset role; set role ${role};`);
      for (const sql of ['select * from push_subscriptions', "insert into push_subscriptions(endpoint,subscription) values ('https://push.fixture.invalid/forged','{}')", "update push_subscriptions set enabled=false", 'delete from push_subscriptions']) {
        await assert.rejects(db.exec(sql), denied);
      }
    }
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.exec('select * from planner_events'), denied);
    await assert.rejects(db.exec('select * from journal_entries'), denied);
    await assert.rejects(upsert('anonymous', plannerOwnerKey(a), 'no token'), denied);
    await db.exec('reset role;set role service_role;');
    assert.equal((await db.query('select * from planner_events')).rows.length, 4, 'server retains access to legacy rows');
    assert.equal((await db.query('select * from journal_entries')).rows.length, 3);
    await db.exec('update push_subscriptions set enabled=false;');
    assert.deepEqual((await db.query('select enabled from push_subscriptions')).rows, [{ enabled: false }]);

    await db.exec('reset role;create policy unexpected_public on planner_events for select using(true);');
    await assert.rejects(db.exec(migration), /Unexpected legacy storage policy/);
    await db.exec('rollback;');
  } finally {
    await db.close();
  }
}

async function main() {
  testClientRecovery();
  await testPolicies();
  console.log('PASS planner privacy: local recovery/reload, canonical writes, real in-memory RLS, A/B isolation, legacy retention, push server-only, unexpected-policy refusal.');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
