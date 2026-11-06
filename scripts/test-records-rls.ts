import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

async function main() {
  const db = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
  try {
    await db.exec(`create schema auth; create role authenticated; create role anon;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      create table public.profiles(id uuid primary key);
      create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=clock_timestamp(); return new; end; $$;
      grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
    await db.exec(await readFile('supabase/migrations/0008_user_app_state.sql','utf8'));
    await db.query('insert into profiles(id) values ($1),($2)',[a,b]);
    await db.exec('grant select,insert,update,delete on user_app_state to authenticated,anon');
    const profile = (owner:string) => JSON.stringify({__kodaRecords:{version:1,ownerId:owner,domains:{journal:{ownerId:owner,domain:'journal',initialized:true,records:{private:{value:{id:'private',text:`secret-${owner}`},fields:{},deleted:null}}}}}});
    await db.query('insert into user_app_state(user_id,profile) values ($1,$2),($3,$4)',[a,profile(a),b,profile(b)]);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
    const rows = await db.query<{user_id:string;profile:any}>('select user_id,profile from user_app_state');
    assert.equal(rows.rows.length,1); assert.equal(rows.rows[0].user_id,a); assert.ok(!JSON.stringify(rows.rows).includes(`secret-${b}`));
    assert.equal((await db.query('update user_app_state set profile=$1 where user_id=$2 returning user_id',[profile(a),b])).rows.length,0);
    assert.equal((await db.query('delete from user_app_state where user_id=$1 returning user_id',[b])).rows.length,0);
    await assert.rejects(db.query('insert into user_app_state(user_id,profile) values ($1,$2) on conflict(user_id) do update set profile=excluded.profile',[b,profile(a)]));
    await db.query('update user_app_state set profile=$1 where user_id=$2',[profile(a),a]);
    await db.exec('reset role; set role anon');
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await db.query('select * from user_app_state')).rows.length,0);
    console.log('PASS record storage RLS: real migration, journal namespace private to owner, foreign read/update/delete/upsert denied, anonymous isolation');
  } finally { await db.close(); }
}
main().catch(error=>{console.error(error);process.exitCode=1});
