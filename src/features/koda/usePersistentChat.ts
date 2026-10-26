import AsyncStorage from '@react-native-async-storage/async-storage';
import {useEffect,useRef,useState} from 'react';
import {AppState} from 'react-native';
import {isSupabaseConfigured} from '../../config/env';
import {supabase} from '../../lib/supabase';
import {createSupabaseChatTransport} from './chatSync';
import {acknowledgeChatMessages,canAppendChatMessages,mergeCloudChat,stampLegacyChat} from './chatCloudState';
import {requestChat} from '../../services/kodaApi';
import {chatHistoryKey,createChatHistoryStore,CHAT_HISTORY_MAX_MESSAGES,type ChatHistorySnapshot} from './chatHistory';
import type {ChatMessage} from './types';
import {uid} from './utils';
const store=createChatHistoryStore(AsyncStorage);
const cloudTransport=createSupabaseChatTransport(supabase);
const greeting:ChatMessage={id:'koda-1',role:'koda',text:'Привет. Я рядом. Напиши цель, задачу или проблему — разложим на следующий шаг.'};
const empty=():ChatHistorySnapshot=>({version:1,messages:[],provider:null,pendingRequest:null});
type Recovery='load'|'save'|'request'|null;
export function usePersistentChat(userId?:string|null,isActive=true) {
  const key=chatHistoryKey(userId);
  const scope=useRef({key,epoch:0});
  if(scope.current.key!==key)scope.current={key,epoch:scope.current.epoch+1};
  const [loadedKey,setLoadedKey]=useState<string|null>(null);
  const [snapshot,setSnapshot]=useState<ChatHistorySnapshot>(empty);
  const current=useRef<ChatHistorySnapshot>(empty());
  const [busy,setBusy]=useState(false);
  const lock=useRef(false);
  const [error,setError]=useState<string|null>(null);
  const [recovery,setRecovery]=useState<Recovery>(null);
  const [saveStatus,setSaveStatus]=useState<'saved'|'saving'|'error'>('saved');
  const saveRevision=useRef(0);
  const durableSnapshot=useRef<string|null>(null);
  const cloudEnabled=Boolean(userId)&&isSupabaseConfigured();
  const [cloudStatus,setCloudStatus]=useState<'local'|'syncing'|'synced'|'offline'|'error'>('local');
  const [cloudError,setCloudError]=useState<string|null>(null);
  const cloudBusy=useRef(false);
  const cloudAgain=useRef(false);
  const cloudTrigger=useRef<()=>void>(()=>{});
  const recoveryRef=useRef<Recovery>(null);recoveryRef.current=recovery;
  const [loadAttempt,setLoadAttempt]=useState(0);
  const ready=loadedKey===key;
  const isCurrent=(epoch:number)=>scope.current.key===key&&scope.current.epoch===epoch;
  function publish(value:ChatHistorySnapshot){
    let bounded={...value,messages:value.messages.slice(-CHAT_HISTORY_MAX_MESSAGES)};
    if(bounded.syncedMessageIds)bounded=acknowledgeChatMessages(bounded,[]);
    current.current=bounded;setSnapshot(bounded);
  }
  useEffect(()=>{
    let active=true;
    const epoch=++scope.current.epoch;
    setLoadedKey(null);setError(null);setRecovery(null);setBusy(false);lock.current=false;setSaveStatus('saved');
    current.current=empty();durableSnapshot.current=null;setSnapshot(empty());cloudBusy.current=false;cloudAgain.current=false;setCloudError(null);setCloudStatus('local');
    store.load(userId).then(value=>{
      if(!active||!isCurrent(epoch))return;
      publish(value);durableSnapshot.current=JSON.stringify(value);setLoadedKey(key);
      if(value.pendingRequest){setRecovery('request');setError('Предыдущий ответ не был сохранён. Можно повторить запрос — автоматически он не отправлялся.');}
    }).catch(()=>{
      if(!active||!isCurrent(epoch))return;
      setRecovery('load');setError('Не удалось открыть историю. Повторите загрузку, чтобы не перезаписать сохранённый диалог.');
    });
    return()=>{active=false;scope.current.epoch++;};
  },[key,loadAttempt]);
  async function persist(value:ChatHistorySnapshot,epoch:number){
    const revision=++saveRevision.current;
    if(isCurrent(epoch))setSaveStatus('saving');
    try{
      await store.save(userId,value);
      if(isCurrent(epoch)){durableSnapshot.current=JSON.stringify(value);if(revision===saveRevision.current)setSaveStatus('saved');}
      return true;
    }
    catch{if(isCurrent(epoch)){setSaveStatus('error');setRecovery('save');setError('История пока не сохранена на устройстве. Не обновляйте страницу — попробуйте сохранить ещё раз.');}return false;}
  }
  async function request(messages:NonNullable<ChatHistorySnapshot['pendingRequest']>,transcript:ChatMessage[],pendingMessageId?:string) {
    if(!ready||lock.current)return;
    // Reserve the eventual reply before starting either a fresh or a recovered request.
    if(cloudEnabled&&!canAppendChatMessages({...current.current,messages:transcript},1))return;
    const epoch=scope.current.epoch;
    lock.current=true;setBusy(true);setError(null);setRecovery(null);
    const pending:ChatHistorySnapshot={...current.current,messages:transcript,pendingRequest:messages,pendingMessageId:pendingMessageId??[...transcript].reverse().find(m=>m.role==='user'&&m.text===messages[messages.length-1]?.content)?.id};
    publish(pending);
    try{
      if(!await persist(pending,epoch)||!isCurrent(epoch))return;
      cloudTrigger.current();
      const result=await requestChat(messages);
      if(!isCurrent(epoch))return;
      const replyId='reply-'+pending.pendingMessageId;
      const alreadyAnswered=current.current.messages.some(m=>m.id===replyId);
      const complete:ChatHistorySnapshot={...current.current,messages:alreadyAnswered?current.current.messages:[...current.current.messages,{id:replyId,role:'koda',text:result.reply,createdAt:new Date().toISOString()}],provider:alreadyAnswered?current.current.provider:result.provider,pendingRequest:null};
      delete complete.pendingMessageId;
      publish(complete);
      if(await persist(complete,epoch)&&isCurrent(epoch))cloudTrigger.current();
    }catch{
      if(isCurrent(epoch)&&current.current.pendingRequest&&current.current.pendingMessageId===pending.pendingMessageId){setRecovery('request');setError('Не удалось получить ответ. Сообщение сохранено в диалоге — можно повторить запрос.');}
    }finally{if(isCurrent(epoch)){lock.current=false;setBusy(false);}}
  }
  function send(text:string){
    const trimmed=text.trim();if(!trimmed||!ready||lock.current||recovery==='save')return false;
    // Do not accept a turn that could displace an unacknowledged user message or AI reply.
    if(cloudEnabled&&!canAppendChatMessages(current.current,2))return false;
    const transcript=[...current.current.messages,{id:uid('user'),role:'user' as const,text:trimmed,createdAt:new Date().toISOString()}];
    const messages=transcript.slice(-12).map(message=>({role:message.role==='user'?'user' as const:'assistant' as const,content:message.text}));
    void request(messages,transcript,transcript[transcript.length-1].id);
    return true;
  }
  async function retry(){
    if(lock.current)return;
    if(recovery==='load'){setLoadAttempt(value=>value+1);return;}
    if(recovery==='save'){
      const epoch=scope.current.epoch;lock.current=true;setBusy(true);setError(null);
      try{
        if(await persist(current.current,epoch)&&isCurrent(epoch)){
          if(current.current.pendingRequest){setRecovery('request');setError('Сообщение сохранено. Нажмите «Повторить», чтобы отправить запрос помощнику.');}
          else{setRecovery(null);setError(null);}
          cloudTrigger.current();
        }
      }finally{if(isCurrent(epoch)){lock.current=false;setBusy(false);}}
      return;
    }
    if(ready&&current.current.pendingRequest)void request(current.current.pendingRequest,current.current.messages,current.current.pendingMessageId);
  }
  async function syncCloud(){
    if(!cloudEnabled||!ready||!userId)return;
    if(cloudBusy.current){cloudAgain.current=true;return;}
    if(typeof navigator!=='undefined'&&navigator.onLine===false){setCloudStatus('offline');setCloudError(null);return;}
    const epoch=scope.current.epoch;
    cloudBusy.current=true;cloudAgain.current=false;setCloudStatus('syncing');setCloudError(null);
    async function acknowledge(ids:Iterable<string>){
      if(!isCurrent(epoch))return false;
      const acknowledged=acknowledgeChatMessages(current.current,ids);
      if(JSON.stringify(acknowledged)===JSON.stringify(current.current))return true;
      publish(acknowledged);
      if(!await persist(acknowledged,epoch)||!isCurrent(epoch)){
        if(isCurrent(epoch))setCloudStatus('error');
        return false;
      }
      return true;
    }
    async function apply(remote:Awaited<ReturnType<typeof cloudTransport.pull>>){
      if(!isCurrent(epoch))return null;
      const before=current.current;
      const merged=mergeCloudChat(stampLegacyChat(before),remote);
      const serialized=JSON.stringify(merged);
      if(serialized!==JSON.stringify(before))publish(merged);
      // A local send can be awaiting storage while pull completes. Only upload a durable snapshot.
      if(serialized!==durableSnapshot.current){
        if(!await persist(merged,epoch)||!isCurrent(epoch)){
          if(isCurrent(epoch))setCloudStatus('error');
          return null;
        }
      }
      if(before.pendingRequest&&!merged.pendingRequest&&recoveryRef.current==='request'){setRecovery(null);setError(null);}
      return merged;
    }
    try{
      let remote=await cloudTransport.pull(userId);
      if(!isCurrent(epoch))return;
      if(!await acknowledge(remote.messages.map(m=>m.id)))return;
      const known=new Set([...(current.current.syncedMessageIds??[]),...remote.messages.map(m=>m.id)]);
      // Upload local IDs before the bounded merge can evict them (including clock-skewed IDs).
      // Recheck after each await so messages added during sync get the same protection.
      while(true){
        const local=stampLegacyChat(current.current);
        const pending=local.messages.filter(m=>!known.has(m.id));
        if(!pending.length)break;
        const serialized=JSON.stringify(local);
        if(serialized!==JSON.stringify(current.current))publish(local);
        if(serialized!==durableSnapshot.current&&!await persist(local,epoch)){
          if(isCurrent(epoch))setCloudStatus('error');
          return;
        }
        if(!isCurrent(epoch))return;
        await cloudTransport.push(userId,pending,local.provider);
        if(!isCurrent(epoch))return;
        pending.forEach(message=>known.add(message.id));
        if(!await acknowledge(pending.map(message=>message.id)))return;
        remote=await cloudTransport.pull(userId);
        if(!isCurrent(epoch))return;
        remote.messages.forEach(message=>known.add(message.id));
        if(!await acknowledge(remote.messages.map(m=>m.id)))return;
      }
      if(!await apply(remote)||!isCurrent(epoch))return;
      if(isCurrent(epoch))setCloudStatus(typeof navigator!=='undefined'&&navigator.onLine===false?'offline':'synced');
    }catch{
      if(isCurrent(epoch)){
        const offline=typeof navigator!=='undefined'&&navigator.onLine===false;
        setCloudStatus(offline?'offline':'error');setCloudError(offline?null:'Не удалось синхронизировать историю. Сообщения остаются на этом устройстве.');
      }
    }finally{
      if(isCurrent(epoch)){
        cloudBusy.current=false;
        if(cloudAgain.current){cloudAgain.current=false;cloudTrigger.current();}
      }
    }
  }
  cloudTrigger.current=()=>{void syncCloud();};
  useEffect(()=>{
    if(!cloudEnabled||!ready||!isActive)return;
    cloudTrigger.current();
    const timer=setInterval(()=>cloudTrigger.current(),15000);
    const active=AppState.addEventListener('change',state=>{if(state==='active')cloudTrigger.current();});
    const online=()=>cloudTrigger.current();
    const offline=()=>{setCloudStatus('offline');setCloudError(null);};
    const visible=()=>{if(document.visibilityState==='visible')cloudTrigger.current();};
    if(typeof window!=='undefined'){window.addEventListener('online',online);window.addEventListener('offline',offline);}
    if(typeof document!=='undefined')document.addEventListener('visibilitychange',visible);
    return()=>{clearInterval(timer);active.remove();if(typeof window!=='undefined'){window.removeEventListener('online',online);window.removeEventListener('offline',offline);}if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visible);};
  },[key,ready,cloudEnabled,isActive]);
  const cloudLabel=cloudEnabled?(cloudStatus==='synced'?' · синхронизировано':cloudStatus==='syncing'?' · синхронизируется…':cloudStatus==='offline'?' · синхронизация после подключения':' · ожидает синхронизации'):'';
  const capacityBlocked=cloudEnabled&&ready&&!canAppendChatMessages(snapshot,2);
  return {
    chat:ready?[greeting,...snapshot.messages]:[greeting],
    provider:ready?snapshot.provider:null,busy:ready&&busy,ready,
    error,retry,send,cloudError,retrySync:()=>cloudTrigger.current(),
    retryLabel:recovery==='load'?'Повторить загрузку':recovery==='save'?'Повторить сохранение':'Повторить',
    inputDisabled:!ready||recovery==='save'||capacityBlocked,
    historyStatus:!ready?(recovery==='load'?'История не загружена':'Открываю историю…'):saveStatus==='saving'?'Сохраняю историю…':saveStatus==='error'?'Есть несохранённые сообщения':capacityBlocked?'Есть неотправленные сообщения. Подключитесь к сети и дождитесь синхронизации, чтобы продолжить.':`Сохранено на устройстве · последние ${CHAT_HISTORY_MAX_MESSAGES} сообщений${cloudLabel}`,
  };
}
