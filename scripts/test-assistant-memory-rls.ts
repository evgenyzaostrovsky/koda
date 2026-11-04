import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const a = '11111111-1111-4111-8111-111111111111';
const b = '22222222-2222-4222-8222-222222222222';
const hasCode = (code: string) => (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);

async function main() {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema auth;
      create table auth.users(id uuid primary key);
      create role anon;
      create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create function auth.jwt() returns jsonb language sql stable as $$
        select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
      $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid(), auth.jwt() to authenticated, anon;
    `);
    await db.query('insert into auth.users(id) values ($1), ($2)', [a, b]);
    await db.exec(await readFile(new URL('../supabase/migrations/0019_assistant_memories.sql', import.meta.url), 'utf8'));

    async function asOwner(owner: string, anonymous = false) {
      await db.exec('reset role; set role authenticated;');
      await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [owner, JSON.stringify({ sub: owner, is_anonymous: anonymous })]);
    }
    async function insert(owner: string, content: string) {
      return db.query<{ id: string; content: string; revision: string }>(
        'insert into public.assistant_memories(user_id, content) values ($1, $2) returning id, content, updated_at::text as revision', [owner, content],
      );
    }
    const denied = hasCode('42501');

    await asOwner(a);
    const aRow = (await insert(a, 'Первый факт A')).rows[0];
    assert.ok(aRow.id);
    assert.deepEqual((await db.query('select content from public.assistant_memories')).rows, [{ content: 'Первый факт A' }]);
    await assert.rejects(insert(b, 'Подделка владельца B'), denied);
    await assert.rejects(db.query('update public.assistant_memories set user_id = $1 where id = $2', [b, aRow.id]), denied);
    await assert.rejects(db.query('update public.assistant_memories set id = $1 where id = $2', [b, aRow.id]), denied);
    await assert.rejects(db.query("update public.assistant_memories set updated_at = now() where id = $1", [aRow.id]), denied);
    await assert.rejects(db.query("update public.assistant_memories set created_at = now() where id = $1", [aRow.id]), denied);
    await assert.rejects(insert(a, ''), hasCode('23514'));
    await assert.rejects(insert(a, '   '), hasCode('23514'));
    await assert.rejects(insert(a, 'a'.repeat(1001)), hasCode('23514'));
    const unicode = (await insert(a, '💡'.repeat(1000))).rows[0];
    assert.equal((await db.query('delete from public.assistant_memories where id = $1 returning id', [unicode.id])).rows.length, 1);

    await asOwner(b);
    assert.equal((await db.query('select * from public.assistant_memories')).rows.length, 0);
    assert.equal((await db.query('select * from public.assistant_memories where id = $1', [aRow.id])).rows.length, 0);
    assert.equal((await db.query("update public.assistant_memories set content = 'Чужая правка' where id = $1 returning id", [aRow.id])).rows.length, 0);
    assert.equal((await db.query('delete from public.assistant_memories where id = $1 returning id', [aRow.id])).rows.length, 0);
    await assert.rejects(insert(a, 'Подделка владельца A'), denied);
    const bRow = (await insert(b, 'Первый факт B')).rows[0];

    await asOwner(a);
    assert.deepEqual((await db.query('select content from public.assistant_memories')).rows, [{ content: 'Первый факт A' }]);
    assert.equal((await db.query('select * from public.assistant_memories where id = $1', [bRow.id])).rows.length, 0);
    assert.equal((await db.query("update public.assistant_memories set content = 'Чужая правка' where id = $1 returning id", [bRow.id])).rows.length, 0);
    assert.equal((await db.query('delete from public.assistant_memories where id = $1 returning id', [bRow.id])).rows.length, 0);
    const edited = (await db.query<{ revision: string }>(
      "update public.assistant_memories set content = 'Новый факт A' where id = $1 and updated_at = $2::timestamptz returning updated_at::text as revision", [aRow.id, aRow.revision],
    )).rows[0];
    assert.ok(edited);
    assert.notEqual(edited.revision, aRow.revision, 'server trigger advances the optimistic revision');
    assert.equal((await db.query(
      "update public.assistant_memories set content = 'Устаревший факт A' where id = $1 and updated_at = $2::timestamptz returning id", [aRow.id, aRow.revision],
    )).rows.length, 0, 'stale-device update cannot overwrite a newer version');
    assert.equal((await db.query('delete from public.assistant_memories where id = $1 and updated_at = $2::timestamptz returning id', [aRow.id, aRow.revision])).rows.length, 0);
    assert.deepEqual((await db.query('select content from public.assistant_memories')).rows, [{ content: 'Новый факт A' }]);

    // Supabase anonymous auth uses the authenticated SQL role: its JWT flag must still deny access.
    await asOwner(a, true);
    assert.equal((await db.query('select * from public.assistant_memories')).rows.length, 0);
    await assert.rejects(insert(a, 'Анонимная авторизация'), denied);
    assert.equal((await db.query("update public.assistant_memories set content = 'anonymous edit' returning id")).rows.length, 0);
    assert.equal((await db.query('delete from public.assistant_memories returning id')).rows.length, 0);

    await asOwner('');
    assert.equal((await db.query('select * from public.assistant_memories')).rows.length, 0);
    await assert.rejects(insert(a, 'Нет identity'), denied);
    await db.exec('reset role; set role anon;');
    await assert.rejects(db.query('select * from public.assistant_memories'), denied);
    await assert.rejects(insert(a, 'Нет сессии'), denied);
    await assert.rejects(db.query("update public.assistant_memories set content = 'anon edit'"), denied);
    await assert.rejects(db.query('delete from public.assistant_memories'), denied);

    await asOwner(a);
    assert.equal((await db.query('delete from public.assistant_memories where id = $1 and updated_at = $2::timestamptz returning id', [aRow.id, edited.revision])).rows.length, 1);
    assert.equal((await db.query('select * from public.assistant_memories')).rows.length, 0);
    assert.equal((await db.query("update public.assistant_memories set content = 'Воскресший факт' where id = $1 returning id", [aRow.id])).rows.length, 0);
    await asOwner(b);
    assert.deepEqual((await db.query('select content from public.assistant_memories')).rows, [{ content: 'Первый факт B' }]);
    assert.equal((await db.query('delete from public.assistant_memories where id = $1 returning id', [bRow.id])).rows.length, 1);
    await db.exec('reset role;');
    assert.equal((await db.query<{ count: number }>('select count(*)::int as count from public.assistant_memories')).rows[0].count, 0);
    console.log('Assistant memory SQL: actual 0019 migration, owner CRUD, bidirectional A/B isolation, forged owners/immutable fields denied, anon/anonymous-auth/empty identity denied, content constraints, optimistic update/delete conflict and deletion PASS (PGlite only).');
  } finally {
    await db.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
