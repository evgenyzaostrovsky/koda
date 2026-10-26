import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';

async function main(){
  assert.equal(process.env.KODA_CHAT_LIVE_TEST,'1','Explicit live verification opt-in required');
  dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
  const accounts=JSON.parse(await readFile('.env.chat-sync.local','utf8'));
  const markers=['ОФЛАЙН-ПРОКСИ-21:','ACK-ПОТЕРЯ-21:','ФИНАЛ-ОФЛАЙН-21:'];
  for(let index=0;index<2;index++){
    const client=createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
    const auth=await client.auth.signInWithPassword(accounts[index]);assert.equal(auth.error,null);assert(auth.data.user);
    const result=await client.from('chat_messages').select('message_id,text').eq('user_id',auth.data.user.id).eq('role','user');
    assert.equal(result.error,null);
    const messages:Array<{message_id:string;text:string}>=result.data??[];
    for(const marker of markers){
      const rows:Array<{message_id:string;text:string}>=messages.filter(row=>row.text.startsWith(marker));
      assert.equal(rows.length,index===0?1:0,`Account ${index}, ${marker}: incorrect count`);
      assert.equal(new Set(rows.map(row=>row.message_id)).size,rows.length);
    }
    await client.auth.signOut({scope:'local'});
  }
  console.log('PASS hosted verification: offline and dropped-ACK markers exist exactly once in A, zero times in B.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Hosted verification failed');process.exitCode=1;});
