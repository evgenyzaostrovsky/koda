import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
async function main(){
  const db=new PGlite();
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  try{
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);create role anon;create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
    await db.query('insert into auth.users(id) values ($1),($2)',[a,b]);
    await db.exec(await readFile('supabase/migrations/0016_chat_messages.sql','utf8'));
    async function asOwner(owner:string){await db.exec('reset role;set role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);}
    async function insert(owner:string,text:string){return db.query(`insert into public.chat_messages(user_id,message_id,role,text) values($1,'same-id','user',$2) on conflict(user_id,message_id) do nothing`,[owner,text]);}
    const denied=(error:unknown)=>Boolean(error&&typeof error==='object'&&'code'in error&&(error as {code:string}).code==='42501');
    await asOwner(a);await insert(a,'A original');await insert(a,'A retry changed');
    assert.deepEqual((await db.query('select text from public.chat_messages')).rows,[{text:'A original'}]);
    await assert.rejects(insert(b,'forged B'),denied);
    assert.equal((await db.query('select * from public.chat_messages where user_id=$1',[b])).rows.length,0);
    await assert.rejects(db.query("update public.chat_messages set text='edited'"),denied);
    await assert.rejects(db.query('delete from public.chat_messages'),denied);
    await asOwner(b);assert.equal((await db.query('select * from public.chat_messages')).rows.length,0);
    await insert(b,'B own same ID');
    assert.deepEqual((await db.query('select text from public.chat_messages')).rows,[{text:'B own same ID'}]);
    await assert.rejects(insert(a,'forged A'),denied);
    await asOwner(a);assert.deepEqual((await db.query('select text from public.chat_messages')).rows,[{text:'A original'}]);
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    assert.equal((await db.query('select * from public.chat_messages')).rows.length,0);
    await assert.rejects(insert(a,'missing identity'),denied);
    await db.exec('reset role;set role anon;');
    await assert.rejects(db.query('select * from public.chat_messages'),denied);
    await assert.rejects(insert(a,'anonymous'),denied);
    await db.exec('reset role;');
    assert.equal((await db.query<{count:number}>('select count(*)::int as count from public.chat_messages')).rows[0].count,2);
    console.log('Chat SQL (in-memory PostgreSQL): actual migration, immutable dedupe, A/B same-ID isolation, cross-owner denial, anon/empty identity denial, denied update/delete PASS');
  }finally{await db.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
