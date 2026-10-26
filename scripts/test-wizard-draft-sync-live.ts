import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import dotenv from 'dotenv';
import {createClient} from '@supabase/supabase-js';
import {createSupabaseWizardDraftTransport,emptyWizardSyncState,normalizeWizardDraft,stageWizardDraft,syncWizardDraft,wizardSyncView,resolveWizardConflict,mergeWizardRevisions} from '../src/features/koda/wizardDraftSync';

async function main(){
  assert.equal(process.env.KODA_WIZARD_LIVE_TEST,'1','Explicit test-account writes opt-in required');
  dotenv.config({path:'.env.local',quiet:true});dotenv.config({quiet:true});
  const accounts=JSON.parse(await readFile('.env.chat-sync.local','utf8'));
  const client=()=>createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!,process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const clients=[client(),client(),client(),client()];const owners:string[]=[];
  for(let i=0;i<clients.length;i++){
    const result=await clients[i].auth.signInWithPassword(accounts[i<2?0:1]);assert.equal(result.error,null);assert(result.data.user);owners.push(result.data.user.id);
  }
  assert.equal(owners[0],owners[1]);assert.notEqual(owners[0],owners[2]);
  const transports=clients.map(createSupabaseWizardDraftTransport);
  const run='wizard-live-'+randomBytes(6).toString('hex');
  const draft=(label:string)=>normalizeWizardDraft({version:1,step:0,wish:`Тестовый черновик ${label}`,goalTitle:`Тестовая цель ${label}`,desiredResult:'Тестовый результат',deadline:'',priority:'important',directions:[],clarificationQuestions:['Что хочется изменить?','Как заметишь результат?'],clarificationAnswers:[`Ответ ${label}`,'']})!;
  // Dedicated account fixture history may contain earlier synthetic runs. A merge
  // revision starts this run while preserving every earlier immutable snapshot.
  async function start(index:number,label:string){
    let state=mergeWizardRevisions(emptyWizardSyncState(owners[index]),await transports[index].pull(owners[index]));
    const view=wizardSyncView(state);
    if(view.kind==='conflict')state=resolveWizardConflict(state,view.heads[0].id,run+`-resolve-${index}`);
    return syncWizardDraft(stageWizardDraft(state,draft(label),run+`-root-${index}`),transports[index]);
  }
  let a=await start(0,'A'),b=await start(2,'B');
  let a2=await syncWizardDraft(emptyWizardSyncState(owners[1]),transports[1]);
  assert.deepEqual(wizardSyncView(a2).draft?.clarificationAnswers,['Ответ A','']);
  assert.equal(wizardSyncView(b).draft?.clarificationAnswers[0],'Ответ B');
  const aPayload=wizardSyncView(a).draft!;
  a=stageWizardDraft(a,{...aPayload,clarificationAnswers:['Первое устройство','']},run+'-device1');
  a2=stageWizardDraft(a2,{...aPayload,clarificationAnswers:['Второе устройство','Второй ответ']},run+'-device2');
  [a,a2]=await Promise.all([syncWizardDraft(a,transports[0]),syncWizardDraft(a2,transports[1])]);
  a=await syncWizardDraft(a,transports[0]);
  let view=wizardSyncView(a);assert.equal(view.kind,'conflict');assert.equal(view.heads.length,2);
  const saved=new Set(view.heads.map(head=>head.draft?.clarificationAnswers[0]));assert(saved.has('Первое устройство')&&saved.has('Второе устройство'));
  const selected=view.heads.find(head=>head.draft?.clarificationAnswers[0]==='Второе устройство')!;
  a=resolveWizardConflict(a,selected.id,run+'-chosen');a=await syncWizardDraft(a,transports[0]);
  a2=await syncWizardDraft(a2,transports[1]);assert.equal(wizardSyncView(a2).kind,'draft');assert.equal(wizardSyncView(a2).draft?.clarificationAnswers[1],'Второй ответ');
  // Retry an immutable row, then refuse changing content under the same ID.
  const latest=a.revisions.find(revision=>revision.id===run+'-chosen')!;
  await transports[1].push(owners[1],latest);await transports[1].push(owners[1],latest);
  const count=await clients[0].from('goal_wizard_drafts').select('revision_id').eq('revision_id',latest.id).eq('user_id',owners[0]);assert.equal(count.data?.length,1);
  await assert.rejects(transports[1].push(owners[1],{...latest,draft:draft('collision')}),/collision/);
  // Offline device edits from its previous head while another device completes.
  const offline=stageWizardDraft(a2,{...wizardSyncView(a2).draft!,clarificationAnswers:['Старое устройство офлайн','']},run+'-offline');
  a=await syncWizardDraft(stageWizardDraft(a,null,run+'-completed'),transports[0]);assert.equal(wizardSyncView(a).kind,'deleted');
  a=await syncWizardDraft(offline,transports[0]);view=wizardSyncView(a);assert.equal(view.kind,'conflict');assert(view.heads.some(head=>head.draft===null));
  const deleted=view.heads.find(head=>head.draft===null)!;
  a=await syncWizardDraft(resolveWizardConflict(a,deleted.id,run+'-keep-completed'),transports[0]);assert.equal(wizardSyncView(a).kind,'deleted');
  console.log('PASS hosted wizard: two devices, exact Q/A restore, concurrent whole versions, explicit resolution, stable retries, offline/delete conflict');
  for(const [index,foreign] of [[0,owners[2]],[2,owners[0]]] as const){
    const read=await clients[index].from('goal_wizard_drafts').select('revision_id').eq('user_id',foreign);assert.equal(read.error,null);assert.deepEqual(read.data,[]);
    const insert=await clients[index].from('goal_wizard_drafts').insert({user_id:foreign,revision_id:run+'-forged',parent_ids:[],draft:draft('forged')});assert.equal(insert.error?.code,'42501');
    await assert.rejects(transports[index].pull(foreign),/account/);
  }
  assert.equal((await client().from('goal_wizard_drafts').select('revision_id').limit(1)).error?.code,'42501');
  assert.equal((await clients[0].from('goal_wizard_drafts').update({draft:draft('overwrite')}).eq('user_id',owners[0])).error?.code,'42501');
  assert.equal((await clients[0].from('goal_wizard_drafts').delete().eq('user_id',owners[0])).error?.code,'42501');
  assert.equal(wizardSyncView(await syncWizardDraft(b,transports[2])).draft?.clarificationAnswers[0],'Ответ B');
  console.log('PASS hosted wizard RLS: real JWTs isolate two accounts; foreign/anonymous reads, foreign inserts, updates and deletes denied');
  // Leave small synthetic fixtures so UI sessions can verify remote hydration.
  a=await syncWizardDraft(stageWizardDraft(a,draft('A — браузер'),run+'-browser-a'),transports[0]);
  b=await syncWizardDraft(stageWizardDraft(b,draft('B — браузер'),run+'-browser-b'),transports[2]);
  await writeFile('.tmp/wizard-sync-live-result.json',JSON.stringify({run,passed:true,checks:['two-device','questions-answers','concurrent-conflict','tombstone','RLS-two-accounts'],owners:owners.filter((_,i)=>i===0||i===2)},null,2));
  for(const c of clients)await c.auth.signOut({scope:'local'});
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Wizard live test failed');process.exitCode=1;});
