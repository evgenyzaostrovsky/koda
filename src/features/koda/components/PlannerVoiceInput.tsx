import {useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,KeyboardAvoidingView,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Check,Mic,Square,Undo2,X} from 'lucide-react-native';
import {supabase} from '../../../lib/supabase';
import {env} from '../../../config/env';
import {accent,activeBg,activeText,line,muted,panel,panelSoft,text} from '../theme';

type PlannerTask={title:string;date:string;time:string};
type Props={ownerId?:string|null;onCreate:(requestId:string,tasks:PlannerTask[])=>Promise<void>;onUndo:(requestId:string)=>Promise<void>};
type Message={role:'user'|'assistant';content:string};
type VoiceResponse={transcript:string;reply:string;tasks:PlannerTask[];needsClarification:boolean};
const API_URL=env.kodaApiUrl.replace(/\/$/,'');
const MAX_AUDIO_BYTES=3*1024*1024;
const MAX_RECORDING_SECONDS=60;

function makeRequestId(){return globalThis.crypto?.randomUUID?.()??`planner-voice-${Date.now()}-${Math.random().toString(36).slice(2)}`;}
function currentPlannerContext(){const now=new Date();const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;return {today,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};}
function validResponse(value:unknown):value is VoiceResponse{
 if(!value||typeof value!=='object')return false;
 const result=value as Partial<VoiceResponse>;
 return typeof result.transcript==='string'&&typeof result.reply==='string'&&typeof result.needsClarification==='boolean'&&Array.isArray(result.tasks)&&result.tasks.every(task=>!!task&&typeof task.title==='string'&&typeof task.date==='string'&&typeof task.time==='string');
}
function blobBase64(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось прочитать запись.'));reader.onload=()=>{const result=String(reader.result??'');const comma=result.indexOf(',');resolve(comma>=0?result.slice(comma+1):result);};reader.readAsDataURL(blob);});}

export function PlannerVoiceInput({ownerId,onCreate,onUndo}:Props){
 const [open,setOpen]=useState(false),[draft,setDraft]=useState(''),[messages,setMessages]=useState<Message[]>([]);
 const [busy,setBusy]=useState(false),[recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
 const [speak,setSpeak]=useState(false),[savedRequestId,setSavedRequestId]=useState(''),[savedTasks,setSavedTasks]=useState<PlannerTask[]>([]),[pendingTasks,setPendingTasks]=useState<PlannerTask[]|null>(null);
 const epoch=useRef(0),inflight=useRef(false),startingRef=useRef(false),requestId=useRef(''),requestContext=useRef(currentPlannerContext()),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<BlobPart[]>([]),timer=useRef<ReturnType<typeof setInterval>|null>(null),recordingStarted=useRef(0),audioError=useRef(''),aborter=useRef<AbortController|null>(null),speakRef=useRef(false);
 speakRef.current=speak;

 const stopTimer=useCallback(()=>{if(timer.current){clearInterval(timer.current);timer.current=null;}},[]);
 const stopTracks=useCallback(()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;},[]);
 const clearAudio=useCallback(()=>{stopTimer();const current=recorder.current;recorder.current=null;if(current&&current.state!=='inactive'){current.ondataavailable=null;current.onstop=null;try{current.stop();}catch{}}stopTracks();chunks.current=[];setRecording(false);setSeconds(0);},[stopTimer,stopTracks]);
 const reset=useCallback(()=>{epoch.current++;aborter.current?.abort();aborter.current=null;inflight.current=false;startingRef.current=false;clearAudio();if(typeof window!=='undefined'&&'speechSynthesis'in window)window.speechSynthesis.cancel();setDraft('');setMessages([]);setBusy(false);setStarting(false);setError('');setSavedRequestId('');setSavedTasks([]);setPendingTasks(null);requestId.current='';requestContext.current=currentPlannerContext();},[clearAudio]);
 useEffect(()=>()=>reset(),[reset]);
 useEffect(()=>{reset();},[ownerId,reset]);

 function close(){reset();setOpen(false);}
 async function startRecording(){
  if(startingRef.current||recording||busy||pendingTasks)return;
  if(Platform.OS!=='web'||typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Запись голоса недоступна в этом браузере. Введи задачу текстом.');return;}
  startingRef.current=true;setStarting(true);setError('');const version=epoch.current;
  try{
   const media=await navigator.mediaDevices.getUserMedia({audio:true});
   if(version!==epoch.current||!open){media.getTracks().forEach(track=>track.stop());return;}
   stream.current=media;
   const mimeType=['audio/webm;codecs=opus','audio/webm','audio/mp4'].find(type=>MediaRecorder.isTypeSupported(type));
   const instance=new MediaRecorder(media,mimeType?{mimeType}:undefined);recorder.current=instance;chunks.current=[];audioError.current='';recordingStarted.current=Date.now();
   instance.ondataavailable=event=>{if(version!==epoch.current||!event.data.size)return;const total=chunks.current.reduce((sum,item)=>sum+(item instanceof Blob?item.size:0),0)+event.data.size;if(total>MAX_AUDIO_BYTES){audioError.current='Запись больше 3 МБ. Сделай короткую запись или введи задачу текстом.';if(instance.state==='recording')instance.stop();return;}chunks.current.push(event.data);};
   instance.onerror=()=>{if(version!==epoch.current)return;audioError.current='Не удалось записать аудио. Введи задачу текстом или попробуй ещё раз.';stopTimer();stopTracks();chunks.current=[];setRecording(false);setSeconds(0);setError(audioError.current);};
   instance.onstop=()=>{if(version!==epoch.current)return;stopTimer();stopTracks();setRecording(false);setSeconds(0);if(audioError.current){setError(audioError.current);chunks.current=[];}else{const duration=(Date.now()-recordingStarted.current)/1000;if(duration>MAX_RECORDING_SECONDS){setError('Запись длиннее 60 секунд. Запиши короче или введи задачу текстом.');chunks.current=[];}else if(chunks.current.length){const blob=new Blob(chunks.current,{type:instance.mimeType||'audio/webm'});if(blob.size>MAX_AUDIO_BYTES){setError('Запись больше 3 МБ. Сделай короткую запись или введи задачу текстом.');chunks.current=[];}else{void submit({audio:blob,mimeType:blob.type});}}}};
   instance.start(800);setRecording(true);timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-recordingStarted.current)/1000);setSeconds(elapsed);if(elapsed>=MAX_RECORDING_SECONDS-1&&instance.state==='recording')instance.stop();},250);
  }catch(e){if(version!==epoch.current)return;stopTracks();setRecording(false);setError(e instanceof DOMException&&e.name==='NotAllowedError'?'Нет доступа к микрофону. Разреши его в настройках браузера или введи задачу текстом.':'Не удалось включить микрофон. Введи задачу текстом.');}
  finally{if(version===epoch.current){startingRef.current=false;setStarting(false);}}
 }
 function stopRecording(){const current=recorder.current;if(current&&current.state==='recording'){current.requestData();current.stop();}else{clearAudio();}}

 async function submit(input:{text?:string;audio?:Blob;mimeType?:string}){
  const content=input.text?.trim();if(inflight.current||(!content&&!input.audio))return;
  if(messages.length>12){setError('Диалог стал длинным. Начни новую команду и укажи уточнённые дату и время.');return;}
  if(!ownerId){setError('Войди в аккаунт, чтобы добавить задачу.');return;}
  const version=epoch.current,owner=ownerId,controller=new AbortController();aborter.current=controller;inflight.current=true;setBusy(true);setError('');
  try{
   const {data,error:sessionError}=await supabase.auth.getSession();const session=data.session;
   if(sessionError||!session?.access_token||session.user.is_anonymous||session.user.id!==owner)throw new Error('Сессия аккаунта изменилась. Войди снова и повтори запрос.');
   if(version!==epoch.current||owner!==ownerId||controller.signal.aborted)return;
   const audioBase64=input.audio?await blobBase64(input.audio):undefined;
   if(version!==epoch.current||owner!==ownerId||controller.signal.aborted)return;
   const body=input.audio?{audioBase64,mimeType:input.mimeType??input.audio.type,...requestContext.current,messages}:{text:content,...requestContext.current,messages};
   const response=await fetch(`${API_URL}/api/planner-voice`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify(body)});
   if(version!==epoch.current||owner!==ownerId)return;
   if(!response.ok)throw new Error(response.status===401?'Сессия истекла. Войди снова и повтори запрос.':'Не удалось разобрать задачу. Проверь текст и попробуй ещё раз.');
   const result:unknown=await response.json();if(!validResponse(result))throw new Error('Помощник прислал неполный ответ. Попробуй повторить запрос.');
   if(version!==epoch.current||owner!==ownerId)return;
   const userContent=content??(result.transcript.trim()||'Голосовая запись');
   const nextMessages=[...messages,{role:'user' as const,content:userContent},{role:'assistant' as const,content:result.reply}];setMessages(nextMessages);
   if(result.transcript.trim()&&!content)setDraft(result.transcript.slice(0,2000));
   if(result.needsClarification&&speakRef.current&&typeof window!=='undefined'&&'speechSynthesis'in window){window.speechSynthesis.cancel();window.speechSynthesis.speak(new SpeechSynthesisUtterance(result.reply));}
   if(!result.needsClarification&&result.tasks.length){const stableId=requestId.current||makeRequestId();requestId.current=stableId;setPendingTasks(result.tasks);await onCreate(stableId,result.tasks);if(version!==epoch.current||owner!==ownerId)return;setSavedRequestId(stableId);setSavedTasks(result.tasks);requestId.current='';setPendingTasks(null);setDraft('');setMessages([]);if(speakRef.current&&typeof window!=='undefined'&&'speechSynthesis'in window){window.speechSynthesis.cancel();window.speechSynthesis.speak(new SpeechSynthesisUtterance(`Добавлено в планнер: ${result.tasks.map(task=>task.title).join('; ')}`));}}
   else if(result.needsClarification){setDraft('');}
   else if(result.tasks.length===0){setError('В ответе пока нет задач. Добавь деталей или уточни формулировку.');}
  }catch(e){if(version===epoch.current&&owner===ownerId&&!controller.signal.aborted)setError(e instanceof Error?e.message:'Не удалось добавить задачу. Попробуй ещё раз.');}
  finally{if(version===epoch.current){inflight.current=false;setBusy(false);aborter.current=null;}}
 }
 function sendText(){const value=draft.trim();if(!value)return;void submit({text:value});}
 async function retrySave(){if(!pendingTasks||!requestId.current||inflight.current)return;inflight.current=true;setBusy(true);setError('');const version=epoch.current,owner=ownerId;try{await onCreate(requestId.current,pendingTasks);if(version!==epoch.current||owner!==ownerId)return;setSavedRequestId(requestId.current);setSavedTasks(pendingTasks);requestId.current='';setPendingTasks(null);setDraft('');setMessages([]);if(speakRef.current&&typeof window!=='undefined'&&'speechSynthesis'in window){window.speechSynthesis.cancel();window.speechSynthesis.speak(new SpeechSynthesisUtterance(`Добавлено в планнер: ${pendingTasks.map(task=>task.title).join('; ')}`));}}catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Не удалось сохранить задачи. Повтори попытку.');}finally{if(version===epoch.current){inflight.current=false;setBusy(false);}}}
 async function undo(){if(savedRequestId&&inflight.current)return;const target=savedRequestId;if(!target)return;const version=epoch.current,owner=ownerId;inflight.current=true;setBusy(true);setError('');try{await onUndo(target);if(version===epoch.current&&owner===ownerId){setSavedRequestId('');setSavedTasks([]);setOpen(true);}}catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Не удалось отменить добавление. Повтори попытку.');}finally{if(version===epoch.current){inflight.current=false;setBusy(false);}}}

 return <>
  <Pressable accessibilityRole="button" accessibilityLabel="Создать задачу голосом" onPress={()=>{reset();setOpen(true);}} style={styles.toolbarButton}><Mic size={17} color={accent}/><Text style={styles.toolbarText}>Голосом</Text></Pressable>
  <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
   <View style={styles.backdrop}><KeyboardAvoidingView style={styles.keyboardAvoid} behavior={Platform.OS==='ios'?'padding':'height'}><View style={styles.modal}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalContent}>
     <View style={styles.header}><View style={{flex:1}}><Text style={styles.title}>Новая задача</Text><Text style={styles.hint}>Скажи или напиши, что нужно сделать</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Закрыть" onPress={close} style={styles.close}><X size={19} color={muted}/></Pressable></View>
     {!ownerId&&<Text style={styles.hint}>Войди в аккаунт, чтобы добавить задачу.</Text>}
     {messages.length>0&&<View style={styles.conversation}>{messages.slice(-6).map((message,index)=><View key={`${index}-${message.role}`} style={[styles.message,message.role==='user'?styles.userMessage:styles.assistantMessage]}><Text style={styles.messageLabel}>{message.role==='user'?'Ты':'KODA'}</Text><Text style={styles.messageText}>{message.content}</Text></View>)}</View>}
     {messages.length>0&&!busy&&!pendingTasks&&!savedRequestId&&<Pressable accessibilityRole="button" onPress={reset} style={styles.retry}><Text style={styles.retryText}>Начать новую команду</Text></Pressable>}
     {messages.length>12&&<Text style={styles.error}>Диалог стал длинным. Начни новую команду с уточнёнными датой и временем.</Text>}
     {savedRequestId?<>
      <View style={styles.success}><Check size={18} color={accent}/><Text style={styles.successText}>Добавлено в планнер</Text><Pressable accessibilityRole="button" disabled={busy} onPress={()=>void undo()} style={[styles.undo,busy&&styles.disabled]}><Undo2 size={16} color={accent}/><Text style={styles.undoText}>{busy?'Отмена…':'Отменить'}</Text></Pressable></View>
      <View style={styles.savedTasks}>{savedTasks.map((task,index)=><View key={`${task.title}-${index}`} style={styles.savedTask}><Text style={styles.savedTaskTitle}>{task.title}</Text><Text style={styles.savedTaskMeta}>{task.date}{task.time?` · ${task.time}`:''}</Text></View>)}</View>
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
     </>:<>
      <Text style={styles.audioNotice}>Если записать голос, аудио отправится в OpenAI для распознавания. Можно вместо этого ввести текст.</Text>
      <TextInput accessibilityLabel="Опиши задачу" multiline value={draft} onChangeText={setDraft} editable={!busy&&!pendingTasks} maxLength={2000} placeholder={messages.length?'Ответь на уточнение…':'Например: завтра в 15:00 позвонить в клинику'} placeholderTextColor={muted} style={styles.input}/>
      <View style={styles.controls}>
       {recording?<Pressable accessibilityRole="button" accessibilityLabel="Остановить запись" onPress={stopRecording} style={styles.recordButton}><Square size={17} color={activeText} fill={activeText}/><Text style={styles.primaryText}>Остановить · {seconds} сек</Text></Pressable>:<Pressable accessibilityRole="button" accessibilityLabel="Записать голосовую задачу" disabled={busy||starting||Boolean(pendingTasks)} onPress={()=>void startRecording()} style={[styles.recordButton,(busy||starting||pendingTasks)&&styles.disabled]}><Mic size={18} color={activeText}/><Text style={styles.primaryText}>{starting?'Подключаем микрофон…':'Записать голос'}</Text></Pressable>}
       <Pressable accessibilityRole="button" accessibilityLabel={messages.length?'Отправить уточнение':'Разобрать текст'} disabled={busy||recording||starting||Boolean(pendingTasks)||!draft.trim()||!ownerId} onPress={sendText} style={[styles.sendButton,(busy||recording||starting||pendingTasks||!draft.trim()||!ownerId)&&styles.disabled]}>{busy?<ActivityIndicator color={activeText}/>:<Text style={styles.primaryText}>{messages.length?'Ответить':'Разобрать'}</Text>}</Pressable>
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{checked:speak}} onPress={()=>setSpeak(value=>!value)} style={styles.speakOption}><View style={[styles.checkbox,speak&&styles.checkboxOn]}>{speak&&<Check size={13} color={activeText}/>}</View><Text style={styles.hint}>Озвучивать ответы KODA</Text></Pressable>
      {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
      {!!pendingTasks&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void retrySave()} style={styles.retry}><Text style={styles.retryText}>Повторить сохранение задач</Text></Pressable>}
     </>}
    </ScrollView>
   </View></KeyboardAvoidingView></View>
  </Modal>
 </>;
}

const styles=StyleSheet.create({toolbarButton:{minHeight:44,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:7,borderWidth:1,borderColor:line,borderRadius:12,paddingHorizontal:12},toolbarText:{color:accent,fontSize:13,fontWeight:'600'},backdrop:{flex:1,alignItems:'center',justifyContent:'center',padding:16,backgroundColor:'rgba(20,28,19,0.38)'},keyboardAvoid:{flex:1,width:'100%',alignItems:'center',justifyContent:'center'},modal:{width:'100%',maxWidth:460,maxHeight:'90%',borderRadius:20,borderWidth:1,borderColor:line,backgroundColor:panel,overflow:'hidden'},modalContent:{gap:14,padding:20},header:{flexDirection:'row',alignItems:'center',gap:10},title:{color:text,fontSize:19,fontWeight:'700'},hint:{color:muted,fontSize:13,lineHeight:19},audioNotice:{color:muted,fontSize:12,lineHeight:17},close:{width:44,height:44,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:panelSoft},input:{width:'100%',minHeight:92,maxHeight:180,borderWidth:1,borderColor:line,borderRadius:13,backgroundColor:panelSoft,color:text,padding:12,fontSize:15,textAlignVertical:'top'},controls:{flexDirection:'row',gap:10},recordButton:{minHeight:48,flex:1,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderRadius:12,backgroundColor:activeBg,paddingHorizontal:12},sendButton:{minHeight:48,minWidth:104,alignItems:'center',justifyContent:'center',borderRadius:12,backgroundColor:activeBg,paddingHorizontal:14},primaryText:{color:activeText,fontSize:13,fontWeight:'700'},disabled:{opacity:0.5},speakOption:{minHeight:44,flexDirection:'row',alignItems:'center',gap:9,alignSelf:'flex-start'},checkbox:{width:22,height:22,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:line,borderRadius:6},checkboxOn:{backgroundColor:activeBg,borderColor:accent},error:{color:'#a0352a',fontSize:13,lineHeight:19},conversation:{gap:8},message:{gap:3,padding:10,borderRadius:12},userMessage:{backgroundColor:panelSoft},assistantMessage:{backgroundColor:'#eef2e5'},messageLabel:{color:accent,fontSize:11,fontWeight:'700'},messageText:{color:text,fontSize:13,lineHeight:18},success:{minHeight:48,flexDirection:'row',alignItems:'center',gap:8},successText:{color:text,fontSize:14,fontWeight:'600',flex:1},savedTasks:{gap:8},savedTask:{gap:3,padding:10,borderWidth:1,borderColor:line,borderRadius:11,backgroundColor:panelSoft},savedTaskTitle:{color:text,fontSize:14,fontWeight:'600'},savedTaskMeta:{color:muted,fontSize:12},undo:{minHeight:44,flexDirection:'row',alignItems:'center',gap:6,paddingHorizontal:10,borderRadius:11,borderWidth:1,borderColor:line},undoText:{color:accent,fontSize:13,fontWeight:'600'},retry:{minHeight:44,alignItems:'center',justifyContent:'center',borderRadius:12,borderWidth:1,borderColor:line},retryText:{color:accent,fontSize:13,fontWeight:'600'}});
