import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {createSupabaseFetch} from '../src/lib/supabaseFetch';
import {signOutDevice} from '../src/lib/signOutDevice';

async function main(){
  const base='https://fixture.invalid';
  const fail:typeof fetch=async()=>{throw new TypeError('offline fixture');};
  const wrapped=createSupabaseFetch(fail);
  await assert.rejects(wrapped(base+'/auth/v1/logout?scope=local',{method:'POST'}),/offline fixture/);
  for(const [url,method] of [[base+'/auth/v1/logout?scope=global','POST'],[base+'/auth/v1/token','POST'],[base+'/rest/v1/chat_messages','POST'],['https://foreign.invalid/auth/v1/logout?scope=local','POST'],[base+'/auth/v1/logout?scope=local','GET']]){
    await assert.rejects(wrapped(url,{method}),/offline fixture/);
  }
  const serverFailure=createSupabaseFetch(async()=>new Response(null,{status:503}));
  assert.equal((await serverFailure(base+'/auth/v1/logout?scope=local',{method:'POST'})).status,503);
  assert.equal((await serverFailure(base+'/rest/v1/chat_messages')).status,503);
  const storage=new Map<string,string>();
  const exp=Math.floor(Date.now()/1000)+3600;
  const jwt=[{alg:'HS256',typ:'JWT'},{sub:'11111111-1111-4111-8111-111111111111',exp},'fixture'].map(v=>Buffer.from(typeof v==='string'?v:JSON.stringify(v)).toString('base64url')).join('.');
  const user={id:'11111111-1111-4111-8111-111111111111',aud:'authenticated',role:'authenticated',email:'synthetic@example.invalid',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};
  let logoutFailures=0,refreshFailures=0;
  const fake:typeof fetch=async(input)=>{
    if(String(input).includes('grant_type=password'))return new Response(JSON.stringify({access_token:jwt,refresh_token:'fixture-refresh',token_type:'bearer',expires_in:3600,user}),{headers:{'Content-Type':'application/json'}});
    if(String(input).includes('/logout'))logoutFailures++;
    if(String(input).includes('grant_type=refresh_token'))refreshFailures++;
    throw new TypeError('offline fixture');
  };
  const client=createClient(base,'fixture-key',{global:{fetch:createSupabaseFetch(fake)},auth:{storageKey:'fixture-auth',storage:{getItem:async k=>storage.get(k)??null,setItem:async(k,v)=>{storage.set(k,v);},removeItem:async k=>{storage.delete(k);}},persistSession:true,autoRefreshToken:false,detectSessionInUrl:false}});
  assert.equal((await client.auth.signInWithPassword({email:user.email,password:'fixture-password'})).error,null);
  assert.equal((await client.auth.getSession()).data.session?.user.id,user.id);
  const authEvents:string[]=[];
  const {data:listener}=client.auth.onAuthStateChange(event=>{authEvents.push(event);});
  await signOutDevice(client,{removeItem:async k=>{storage.delete(k);}},'fixture-auth');
  assert.equal((await client.auth.getSession()).data.session,null);
  assert.equal(storage.has('fixture-auth'),false);
  assert(logoutFailures>0,'The SDK logout failure must actually be exercised');
  assert(authEvents.includes('SIGNED_OUT'));listener.subscription.unsubscribe();
  // An expired cached token must not prevent local logout when refresh is offline.
  assert.equal((await client.auth.signInWithPassword({email:user.email,password:'fixture-password'})).error,null);
  const cached=JSON.parse(storage.get('fixture-auth')!);cached.expires_at=1;storage.set('fixture-auth',JSON.stringify(cached));
  await signOutDevice(client,{removeItem:async k=>{storage.delete(k);}},'fixture-auth');
  assert.equal((await client.auth.getSession()).data.session,null);
  assert(refreshFailures>0,'The expired-token refresh failure must actually be exercised');
  console.log('PASS offline auth: fresh and expired SDK sessions/storage cleared; SIGNED_OUT emitted; network failures remain failures.');
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Offline auth test failed');process.exitCode=1;});
