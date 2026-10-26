import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runInNewContext} from 'node:vm';
import ts from 'typescript';
import * as history from '../src/features/koda/chatHistory';
import * as cloudState from '../src/features/koda/chatCloudState';
import type {ChatSyncSnapshot} from '../src/features/koda/chatSync';
import type {usePersistentChat} from '../src/features/koda/usePersistentChat';

function deferred<T>() {
  let resolve!: (value:T)=>void;
  let reject!: (error:Error)=>void;
  const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
  return {promise,resolve,reject};
}
type Result=ReturnType<typeof usePersistentChat>;
type Reply={reply:string;provider:'yandex'};
const source=ts.transpileModule(readFileSync(resolve('src/features/koda/usePersistentChat.ts'),'utf8'),{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true},
}).outputText;
let messageIdentity=0;

// Execute the actual hook with deterministic React effect/state scheduling and local adapters.
// This exercises async orchestration; it is not a DOM/browser or React renderer test.
function harness(options:{cloud?:boolean;owner?:string;data?:Map<string,string>}={}) {
  const data=options.data??new Map<string,string>();
  const slots:any[]=[];
  let cursor=0,scheduled=false,disposed=false,owner=options.owner??'a',result!:Result;
  let effects:Array<()=>void>=[];
  const cleanups=new Map<number,()=>void>();
  const events=new Map<string,Set<()=>void>>();
  const timers=new Map<number,()=>void>();
  const network={onLine:true};
  const requests:Array<ReturnType<typeof deferred<Reply>>> = [];
  const pushes:Array<{owner:string;snapshot:ChatSyncSnapshot}>=[];
  const remote=new Map<string,ChatSyncSnapshot>();
  let writeGate:ReturnType<typeof deferred<void>>|null=null,failWrites=false;
  let pullGate:ReturnType<typeof deferred<void>>|null=null;
  let pushFailure:'before'|'after'|null=null;
  let serial=0;
  const queueRender=()=>{
    if(scheduled||disposed)return;
    scheduled=true;
    queueMicrotask(()=>{scheduled=false;if(!disposed)render();});
  };
  const react={
    useState(initial:any){
      const index=cursor++;
      if(!(index in slots))slots[index]=typeof initial==='function'?initial():initial;
      return [slots[index],(value:any)=>{
        const next=typeof value==='function'?value(slots[index]):value;
        if(!Object.is(next,slots[index])){slots[index]=next;queueRender();}
      }];
    },
    useRef(initial:any){const index=cursor++;return slots[index]??(slots[index]={current:initial});},
    useEffect(effect:()=>void|(()=>void),deps:unknown[]){
      const index=cursor++,previous=slots[index] as unknown[]|undefined;
      if(!previous||deps.some((dep,i)=>!Object.is(dep,previous[i]))){
        slots[index]=deps;
        effects.push(()=>{cleanups.get(index)?.();const cleanup=effect();if(cleanup)cleanups.set(index,cleanup);else cleanups.delete(index);});
      }
    },
  };
  const storage={
    async getItem(key:string){return data.get(key)??null;},
    async setItem(key:string,value:string){
      if(writeGate)await writeGate.promise;
      if(failWrites)throw new Error('fixture disk failure');
      data.set(key,value);
    },
  };
  const transport={
    async pull(id:string){
      if(pullGate)await pullGate.promise;
      if(!network.onLine)throw new Error('fixture offline');
      return remote.get(id)??{messages:[],provider:null};
    },
    async push(id:string,messages:ChatSyncSnapshot['messages'],provider:ChatSyncSnapshot['provider']){
      if(!network.onLine)throw new Error('fixture offline');
      if(pushFailure==='before')throw new Error('fixture rejected push');
      const saved=history.parseChatHistory(data.get(history.chatHistoryKey(id)));
      assert.ok(messages.every(message=>saved.messages.some(item=>item.id===message.id)), 'Cloud push must follow local durable storage');
      pushes.push({owner:id,snapshot:{messages,provider}});
      remote.set(id,{messages:cloudState.mergeCloudChat({...saved,messages:remote.get(id)?.messages??[]},{messages,provider}).messages,provider});
      if(pushFailure==='after')throw new Error('fixture lost acknowledgement after commit');
    },
  };
  const modules:Record<string,unknown>={
    react,'@react-native-async-storage/async-storage':storage,
    'react-native':{AppState:{addEventListener:()=>({remove(){}})}},
    '../../config/env':{isSupabaseConfigured:()=>Boolean(options.cloud)},
    '../../lib/supabase':{supabase:{}},
    './chatSync':{createSupabaseChatTransport:()=>transport},
    './chatCloudState':cloudState,'./chatHistory':history,
    '../../services/kodaApi':{requestChat:()=>{const request=deferred<Reply>();requests.push(request);return request.promise;}},
    './utils':{uid:()=>`user-test-${++messageIdentity}`},
  };
  const exported:{usePersistentChat?:typeof usePersistentChat}={};
  runInNewContext(source,{
    exports:exported,require:(id:string)=>{assert.ok(id in modules,`Unexpected dependency ${id}`);return modules[id];},
    navigator:network,
    window:{addEventListener:(name:string,callback:()=>void)=>{if(!events.has(name))events.set(name,new Set());events.get(name)!.add(callback);},removeEventListener:(name:string,callback:()=>void)=>events.get(name)?.delete(callback)},
    setInterval:(callback:()=>void)=>{const id=++serial;timers.set(id,callback);return id;},clearInterval:(id:number)=>timers.delete(id),
  });
  function render(){cursor=0;effects=[];result=exported.usePersistentChat!(owner);const pending=effects;effects=[];pending.forEach(effect=>effect());}
  render();
  return {
    data,requests,remote,pushes,get value(){return result;},
    setOwner(value:string){owner=value;render();},
    setOnline(value:boolean){network.onLine=value;events.get(value?'online':'offline')?.forEach(callback=>callback());},
    blockWrites(){writeGate=deferred<void>();return ()=>{const gate=writeGate;writeGate=null;gate?.resolve();};},
    failWrites(value:boolean){failWrites=value;},
    failPush(value:'before'|'after'|null){pushFailure=value;},
    blockPull(){pullGate=deferred<void>();return ()=>{const gate=pullGate;pullGate=null;gate?.resolve();};},
    dispose(){disposed=true;cleanups.forEach(cleanup=>cleanup());},
  };
}
const flush=()=>new Promise<void>(done=>setImmediate(done));
function saved(h:ReturnType<typeof harness>,owner='a'){return history.parseChatHistory(h.data.get(history.chatHistoryKey(owner)));}

async function main(){
  const h=harness();await flush();
  const unblock=h.blockWrites();h.value.send('persist before API');await flush();
  assert.equal(h.requests.length,0);assert.match(h.value.historyStatus,/Сохраняю/);
  unblock();await flush();assert.equal(h.requests.length,1);assert.equal(saved(h).pendingRequest?.[0].content,'persist before API');
  h.requests[0].reject(new Error('offline'));await flush();assert.ok(saved(h).pendingRequest);assert.match(h.value.error!,/Сообщение сохранено/);
  const storage=h.data;h.dispose();
  const reload=harness({data:storage});await flush();assert.equal(reload.requests.length,0,'Reload must not auto-send AI');assert.equal(reload.value.chat.length,2);
  await reload.value.retry();await flush();reload.requests[0].resolve({reply:'Recovered',provider:'yandex'});await flush();
  assert.equal(saved(reload).messages.filter(m=>m.role==='user').length,1);assert.equal(saved(reload).messages.filter(m=>m.role==='koda').length,1);assert.equal(saved(reload).pendingRequest,null);reload.dispose();

  const late=harness();await flush();late.value.send('owner A');await flush();late.setOwner('b');await flush();
  late.requests[0].resolve({reply:'A secret reply',provider:'yandex'});await flush();
  assert.equal(late.value.chat.length,1);assert.equal(saved(late,'b').messages.length,0);assert.ok(saved(late,'a').pendingRequest);
  late.setOwner('a');await flush();assert.equal(late.value.chat[1].text,'owner A');assert.equal(late.value.busy,false);late.dispose();

  const user={id:'original',role:'user' as const,text:'Original question',createdAt:'2026-10-21T10:00:00.000Z'};
  const pending:history.ChatHistorySnapshot={version:1,messages:[user],provider:null,pendingRequest:[{role:'user',content:user.text}],pendingMessageId:user.id};
  const merged=harness({cloud:true,data:new Map([[history.chatHistoryKey('a'),JSON.stringify(pending)]])});
  merged.remote.set('a',{messages:[user,{...user,id:'other-device',text:'Newer device question',createdAt:'2026-10-21T10:01:00.000Z'}],provider:null});
  await flush();await merged.value.retry();await flush();merged.requests[0].resolve({reply:'Original answer',provider:'yandex'});await flush();
  assert.ok(saved(merged).messages.some(m=>m.id==='reply-original'));
  assert.ok(!saved(merged).messages.some(m=>m.id==='reply-other-device'),'Retry must keep the original message identity after remote additions');
  assert.match(merged.value.historyStatus,/синхронизировано/);
  merged.setOnline(false);await flush();assert.match(merged.value.historyStatus,/после подключения/);
  merged.value.send('Saved offline');await flush();assert.equal(saved(merged).messages.at(-1)?.text,'Saved offline');
  merged.requests.at(-1)!.reject(new Error('offline'));await flush();merged.setOnline(true);await flush();
  assert.ok(merged.remote.get('a')?.messages.some(m=>m.text==='Saved offline'));assert.match(merged.value.historyStatus,/синхронизировано/);merged.dispose();

  const canonical=harness({cloud:true});await flush();canonical.value.send('Pending on another device');await flush();
  const message=saved(canonical).messages[0];
  canonical.remote.set('a',{messages:[message,{id:`reply-${message.id}`,role:'koda',text:'Canonical remote reply',createdAt:new Date(Date.now()+1000).toISOString()}],provider:'yandex'});
  canonical.value.retrySync();await flush();canonical.requests[0].reject(new Error('late API failure'));await flush();
  assert.equal(canonical.value.error,null,'Late API failure must not revive an already completed pending request');assert.equal(saved(canonical).pendingRequest,null);canonical.dispose();

  const race=harness({cloud:true});await flush();
  const releasePull=race.blockPull();race.value.retrySync();await flush();
  const releaseWrite=race.blockWrites();race.value.send('Concurrent pending save');await flush();releasePull();await flush();
  assert.equal(race.pushes.length,0);assert.equal(race.requests.length,0);assert.match(race.value.historyStatus,/Сохраняю/);
  releaseWrite();await flush();assert.equal(race.requests.length,1);assert.ok(race.pushes.some(push=>push.snapshot.messages.some(m=>m.text==='Concurrent pending save')));
  race.requests[0].resolve({reply:'Complete',provider:'yandex'});await flush();race.dispose();

  const skewed=harness({cloud:true,data:new Map([[history.chatHistoryKey('a'),JSON.stringify(pending)]])});
  skewed.remote.set('a',{messages:Array.from({length:200},(_,index)=>({...user,id:`remote-${index}`,createdAt:new Date(Date.parse('2030-01-01T00:00:00Z')+index).toISOString()})),provider:null});
  await flush();
  assert.ok(skewed.pushes.some(push=>push.snapshot.messages.some(m=>m.id===user.id)),'An older unsynced local ID must upload before a full newer remote history can evict it');
  assert.equal(saved(skewed).messages.length,200);
  assert.equal(saved(skewed).pendingMessageId,user.id,'An unanswered turn must remain identifiable after the bounded merge and reload');
  const finishOfflinePull=skewed.blockPull();skewed.value.retrySync();await flush();skewed.setOnline(false);finishOfflinePull();await flush();
  assert.match(skewed.value.historyStatus,/после подключения/);assert.equal(skewed.value.cloudError,null);skewed.dispose();

  const disk=harness();await flush();disk.failWrites(true);disk.value.send('disk failure');await flush();assert.equal(disk.requests.length,0);assert.equal(disk.value.inputDisabled,true);
  disk.failWrites(false);await disk.value.retry();await flush();assert.equal(disk.requests.length,0);assert.ok(saved(disk).pendingRequest);disk.dispose();

  const full=harness({cloud:true});full.setOnline(false);await flush();
  const accepted:string[]=[];
  for(let index=0;index<205;index++){
    const text=`Offline accepted ${index}`;
    if(full.value.send(text)){
      accepted.push(text);await flush();full.requests.at(-1)!.reject(new Error('offline'));await flush();
    }
  }
  assert.equal(accepted.length,199,'Reserve one remaining slot for the pending AI reply');
  assert.equal(saved(full).messages.length,199);
  assert.deepEqual(saved(full).messages.map(m=>m.text),accepted,'Every accepted offline message survives more than 200 send attempts');
  assert.equal(full.value.inputDisabled,true);assert.match(full.value.historyStatus,/Есть неотправленные сообщения/);
  const fullStorage=full.data;full.dispose();
  const fullReload=harness({cloud:true,data:fullStorage});fullReload.setOnline(false);await flush();
  assert.equal(fullReload.value.send('Rejected after reload'),false);
  await fullReload.value.retry();await flush();fullReload.requests[0].resolve({reply:'Reserved reply slot',provider:'yandex'});await flush();
  assert.equal(saved(fullReload).messages.length,200);assert.deepEqual(saved(fullReload).messages.slice(0,199).map(m=>m.text),accepted);
  assert.equal(fullReload.value.send('Still rejected'),false);
  fullReload.failPush('after');fullReload.setOnline(true);await flush();
  assert.equal(saved(fullReload).syncedMessageIds?.length??0,0,'Lost push acknowledgement cannot mark local messages synced');
  assert.equal(fullReload.value.inputDisabled,true);
  fullReload.failPush(null);fullReload.value.retrySync();await flush();
  assert.equal(saved(fullReload).syncedMessageIds?.length,200);assert.equal(fullReload.value.inputDisabled,false,'Confirmed synchronization releases backpressure');
  const ackStorage=fullReload.data;fullReload.dispose();
  const ackReload=harness({cloud:true,data:ackStorage});ackReload.setOnline(false);await flush();
  assert.equal(ackReload.value.inputDisabled,false,'Persisted acknowledgements allow bounded history to stay usable offline');
  assert.equal(ackReload.value.send('Accepted after prior synchronization'),true);await flush();
  ackReload.requests[0].resolve({reply:'Another safe reply',provider:'yandex'});await flush();
  assert.equal(saved(ackReload).messages.length,200);assert.equal(saved(ackReload).syncedMessageIds?.length,198);ackReload.dispose();

  const legacyFull:history.ChatHistorySnapshot={version:1,messages:Array.from({length:200},(_,index)=>({...user,id:`legacy-${index}`,text:`Legacy ${index}`})),provider:null,pendingRequest:[{role:'user',content:'Legacy 199'}],pendingMessageId:'legacy-199'};
  const retryFull=harness({cloud:true,data:new Map([[history.chatHistoryKey('a'),JSON.stringify(legacyFull)]])});retryFull.setOnline(false);await flush();
  await retryFull.value.retry();await flush();assert.equal(retryFull.requests.length,0,'A legacy full unacknowledged history cannot lose a message to a retry reply');assert.equal(saved(retryFull).messages.length,200);retryFull.dispose();
  const guest=harness({cloud:true,owner:'',data:new Map([[history.chatHistoryKey(''),JSON.stringify(legacyFull)]])});guest.setOnline(false);await flush();
  assert.equal(guest.value.send('Guest retains bounded history'),true);await flush();guest.requests[0].reject(new Error('offline'));await flush();assert.equal(saved(guest,'').messages.length,200);guest.dispose();
  console.log('Chat offline hook PASS: durable-before-API/push, failed-write recovery, reload, owner isolation, pending identity, late canonical completion, offline/online, concurrent cloud/local save, upload before bounded merge eviction.');
  console.log('Chat backpressure PASS: 205 offline attempts preserve all accepted messages, reserved reply capacity, rejected retry at full legacy capacity, lost-ACK recovery, persisted bounded acknowledgements, guest retention.');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
