import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
async function main(){
 const db=new PGlite();
 const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
 try {
  await db.exec(`create schema auth; create role authenticated; create role anon;
   create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
   grant usage on schema auth to authenticated,anon;
   create table public.journal_entries(id text primary key,user_id uuid,owner_key text,content text);
   create table public.planner_events(id text primary key,owner_key text,title text);
   grant all on public.journal_entries,public.planner_events to authenticated,anon;
   create policy legacy_public on public.journal_entries for all using(true) with check(true);
   create policy legacy_public on public.planner_events for all using(true) with check(true);`);
  await db.query('insert into journal_entries values ($1,$2,$3,$4),($5,$6,$7,$8),($9,null,$10,$11)', ['a',a,'default','A','b',b,'default','B','guest','default','legacy']);
  await db.query('insert into planner_events values ($1,$2,$3),($4,$5,$6),($7,$8,$9)', ['a','user:'+a,'A','b','user:'+b,'B','guest','calendar-guest','legacy']);
  const sql=await readFile('supabase/migrations/0020_account_data_isolation_guards.sql','utf8');
  await db.exec(sql); await db.exec(sql);
  async function owner(id:string){await db.exec('reset role;set role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
  const denied=(e:unknown)=>Boolean(e&&typeof e==='object'&&'code' in e&&e.code==='42501');
  for (const [self,other,id] of [[a,b,'a'],[b,a,'b']]) {
   await owner(self);
   for (const table of ['journal_entries','planner_events']) {
    assert.deepEqual((await db.query(`select id from ${table}`)).rows,[{id}]);
    assert.equal((await db.query(`delete from ${table} where id <> $1 returning id`,[id])).rows.length,0);
   }
   await assert.rejects(db.query('insert into journal_entries values ($1,$2,$3,$4)',['forged',other,'default','bad']),denied);
   await assert.rejects(db.query('insert into planner_events values ($1,$2,$3)',['forged','user:'+other,'bad']),denied);
   await assert.rejects(db.query('update journal_entries set user_id=$1 where id=$2',[other,id]),denied);
   await assert.rejects(db.query('update planner_events set owner_key=$1 where id=$2',['user:'+other,id]),denied);
  }
  await db.exec('reset role;set role anon;');await db.query("select set_config('request.jwt.claim.sub','',false)");
  for (const table of ['journal_entries','planner_events']) assert.equal((await db.query(`select id from ${table}`)).rows.length,0);
  await db.exec('reset role;');
  for (const table of ['journal_entries','planner_events']) assert.equal((await db.query(`select id from ${table}`)).rows.length,3);
  console.log('PASS: actual SQL, A/B isolation, forged writes/owner changes rejected, guest private, all original rows preserved, repeatable migration');
 } finally {await db.close();}
}
void main().catch(e=>{console.error(e);process.exitCode=1;});
