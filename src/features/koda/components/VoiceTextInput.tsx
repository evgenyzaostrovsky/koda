import {forwardRef,useCallback,useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,StyleSheet,Text,TextInput,View, type TextInputProps} from 'react-native';
import {Mic,Square,X} from 'lucide-react-native';
import {env} from '../../../config/env';
import {supabase} from '../../../lib/supabase';
import {accent,muted,panelSoft} from '../theme';

const API_URL=env.kodaApiUrl.replace(/\/$/,'');
const MAX_AUDIO_BYTES=3*1024*1024;
const MAX_SECONDS=59;
type Props=TextInputProps&{scopeKey?:string|number;onDictationBusyChange?:(active:boolean)=>void};

export function useDictationBusy(){
 const [keys,setKeys]=useState<Set<string>>(()=>new Set());
 const callbacks=useRef(new Map<string,(active:boolean)=>void>());
 const bind=useCallback((key:string)=>{
  let callback=callbacks.current.get(key);
  if(!callback){callback=active=>setKeys(current=>{if(current.has(key)===active)return current;const next=new Set(current);if(active)next.add(key);else next.delete(key);return next;});callbacks.current.set(key,callback);}
  return callback;
 },[]);
 return {busy:keys.size>0,bind};
}

function getContext(){const now=new Date();return {today:`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`,timezone:Intl.DateTimeFormat().resolvedOptions().timeZone};}
function fileBase64(blob:Blob):Promise<string>{return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('Не удалось прочитать аудиозапись.'));reader.onload=()=>{const value=String(reader.result??'');const comma=value.indexOf(',');resolve(comma<0?value:value.slice(comma+1));};reader.readAsDataURL(blob);});}

export const VoiceTextInput=forwardRef<TextInput,Props>(function VoiceTextInput(props,ref){
 const {style,onChangeText,value,defaultValue,editable=true,secureTextEntry,keyboardType,inputMode,maxLength,scopeKey,onDictationBusyChange,...inputProps}=props;
 const initial=String(value??defaultValue??'');
 const latestText=useRef(initial);latestText.current=String(value??latestText.current);
 const onChangeRef=useRef(onChangeText);onChangeRef.current=onChangeText;
 const maxLengthRef=useRef(maxLength);maxLengthRef.current=maxLength;
 const [recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[sending,setSending]=useState(false),[seconds,setSeconds]=useState(0),[error,setError]=useState(''),[heard,setHeard]=useState(false),[pending,setPending]=useState('');
 const pendingRef=useRef('');
 const busyCallbackRef=useRef(onDictationBusyChange);busyCallbackRef.current=onDictationBusyChange;
 const reportedBusy=useRef(false);
 const reportBusy=useCallback((active:boolean)=>{if(reportedBusy.current===active)return;reportedBusy.current=active;busyCallbackRef.current?.(active);},[]);
 const epoch=useRef(0),busy=useRef(false),recorder=useRef<MediaRecorder|null>(null),stream=useRef<MediaStream|null>(null),chunks=useRef<BlobPart[]>([]),timer=useRef<ReturnType<typeof setInterval>|null>(null),aborter=useRef<AbortController|null>(null),userId=useRef(''),audioError=useRef(''),startedAt=useRef(0),mounted=useRef(true);
 const unsupportedField=Boolean(secureTextEntry)||editable===false||keyboardType==='numeric'||keyboardType==='number-pad'||keyboardType==='decimal-pad'||keyboardType==='phone-pad'||inputMode==='numeric'||inputMode==='decimal';
 const stopTracks=useCallback(()=>{stream.current?.getTracks().forEach(track=>track.stop());stream.current=null;},[]);
 const clearTimer=useCallback(()=>{if(timer.current){clearInterval(timer.current);timer.current=null;}},[]);
 const clearPending=useCallback(()=>{pendingRef.current='';if(mounted.current)setPending('');},[]);
 const cancel=useCallback(()=>{epoch.current++;aborter.current?.abort();aborter.current=null;busy.current=false;clearTimer();const r=recorder.current;recorder.current=null;if(r&&r.state!=='inactive'){r.ondataavailable=null;r.onstop=null;r.onerror=null;try{r.stop();}catch{}}stopTracks();chunks.current=[];clearPending();reportBusy(false);if(mounted.current){setRecording(false);setStarting(false);setSending(false);setSeconds(0);}},[clearPending,clearTimer,reportBusy,stopTracks]);
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;cancel();};},[cancel]);
 useEffect(()=>{if(editable===false)cancel();},[cancel,editable]);
 const previousScope=useRef(scopeKey);
 useEffect(()=>{if(previousScope.current!==scopeKey){previousScope.current=scopeKey;cancel();setError('');}},[cancel,scopeKey]);
 useEffect(()=>{const {data}=supabase.auth.onAuthStateChange((_event,session)=>{if(userId.current&&session?.user.id!==userId.current)cancel();});return()=>data.subscription.unsubscribe();},[cancel]);

 const start=async()=>{
  if(busy.current||unsupportedField||pendingRef.current)return;
  if(Platform.OS!=='web'||typeof navigator==='undefined'||!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined'){setError('Запись доступна в браузере с разрешённым микрофоном.');return;}
  busy.current=true;reportBusy(true);setStarting(true);setError('');const version=epoch.current;
  try{
   const {data,error:authError}=await supabase.auth.getSession();const session=data.session;
   if(authError||!session?.access_token||session.user.is_anonymous)throw new Error('Войди в аккаунт, чтобы расшифровать голос.');
   if(version!==epoch.current)return;userId.current=session.user.id;
   const media=await navigator.mediaDevices.getUserMedia({audio:true});
   if(version!==epoch.current){media.getTracks().forEach(track=>track.stop());return;}
   stream.current=media;
   const mimeType=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(type=>MediaRecorder.isTypeSupported(type));
   const instance=new MediaRecorder(media,mimeType?{mimeType}:undefined);recorder.current=instance;chunks.current=[];audioError.current='';startedAt.current=Date.now();setHeard(true);setStarting(false);setRecording(true);
   const finish=()=>{if(recorder.current!==instance||version!==epoch.current)return;clearTimer();stopTracks();recorder.current=null;setRecording(false);setSeconds(0);if(audioError.current){setError(audioError.current);chunks.current=[];busy.current=false;reportBusy(false);return;}const blob=new Blob(chunks.current,{type:instance.mimeType||'audio/webm'});chunks.current=[];if(Date.now()-startedAt.current>MAX_SECONDS*1000){setError('Запись ограничена 59 секундами.');busy.current=false;reportBusy(false);return;}if(!blob.size){setError('Пустая запись. Попробуй ещё раз.');busy.current=false;reportBusy(false);return;}if(blob.size>MAX_AUDIO_BYTES){setError('Запись превышает 3 МБ. Запиши короче.');busy.current=false;reportBusy(false);return;}void transcribe(blob,version,session.user.id,session.access_token);};
   instance.ondataavailable=event=>{if(version!==epoch.current||recorder.current!==instance||!event.data.size)return;const size=chunks.current.reduce((total,chunk)=>total+(chunk instanceof Blob?chunk.size:0),0)+event.data.size;if(size>MAX_AUDIO_BYTES){audioError.current='Запись превышает 3 МБ. Запиши короче.';if(instance.state==='recording')instance.stop();return;}chunks.current.push(event.data);};
   instance.onerror=()=>{if(version!==epoch.current)return;audioError.current='Не удалось записать аудио.';if(instance.state!=='inactive')try{instance.stop();}catch{finish();}else finish();};
   instance.onstop=finish;instance.start(500);timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-startedAt.current)/1000);if(mounted.current)setSeconds(elapsed);if(elapsed>=58&&instance.state==='recording'){instance.requestData();instance.stop();}},250);
  }catch(e){if(version===epoch.current){stopTracks();busy.current=false;reportBusy(false);setRecording(false);setStarting(false);setError(e instanceof Error&&e.name==='NotAllowedError'?'Нет доступа к микрофону. Разреши его в браузере.':e instanceof Error?e.message:'Не удалось включить микрофон.');}}
 };
 const transcribe=async(blob:Blob,version:number,owner:string,token:string)=>{
  const controller=new AbortController();aborter.current=controller;setSending(true);
  try{
   const audioBase64=await fileBase64(blob);if(version!==epoch.current||controller.signal.aborted)return;
   const {data,error:sessionError}=await supabase.auth.getSession();if(version!==epoch.current||controller.signal.aborted)return;if(sessionError||!data.session||data.session.user.id!==owner||!data.session.access_token)throw new Error('Сессия аккаунта изменилась. Войди снова.');
   const timeout=setTimeout(()=>controller.abort(),60_000);
   try{
   const response=await fetch(`${API_URL}/api/planner-voice`,{method:'POST',signal:controller.signal,headers:{'Content-Type':'application/json',Authorization:`Bearer ${data.session.access_token||token}`},body:JSON.stringify({mode:'transcribe',audioBase64,mimeType:blob.type,...getContext()})});
   if(version!==epoch.current||controller.signal.aborted)return;if(!response.ok)throw new Error(response.status===401?'Сессия истекла. Войди снова.':'Не удалось распознать речь. Попробуй ещё раз.');
   const result:unknown=await response.json();if(version!==epoch.current||controller.signal.aborted)return;if(!result||typeof result!=='object'||typeof (result as {transcript?:unknown}).transcript!=='string')throw new Error('Сервис прислал некорректный текст.');
   const transcript=(result as {transcript:string}).transcript.trim();if(!transcript)throw new Error('Речь не распознана. Попробуй ещё раз.');
   const live=await supabase.auth.getSession();if(version!==epoch.current||controller.signal.aborted||live.data.session?.user.id!==owner) return;
   const current=latestText.current;const addition=current&&!/\s$/.test(current)?` ${transcript}`:transcript;const limit=maxLengthRef.current??Number.POSITIVE_INFINITY;
   if(current.length+addition.length>limit){pendingRef.current=transcript;setPending(transcript);reportBusy(true);setError(`Расшифровка целиком не помещается: нужно освободить ${current.length+addition.length-limit} символов (лимит ${limit}).`);return;}
   const next=current+addition;latestText.current=next;onChangeRef.current?.(next);
   }finally{clearTimeout(timeout);}
  }catch(e){if(version===epoch.current)setError(controller.signal.aborted?'Не удалось распознать речь за отведённое время. Попробуй ещё раз.':e instanceof Error?e.message:'Не удалось расшифровать запись.');}
  finally{if(version===epoch.current){aborter.current=null;busy.current=false;setSending(false);reportBusy(Boolean(pendingRef.current));}}
 };
 const applyPending=()=>{const transcript=pendingRef.current;if(!transcript)return;const current=latestText.current;const addition=current&&!/\s$/.test(current)?` ${transcript}`:transcript;const limit=maxLengthRef.current??Number.POSITIVE_INFINITY;if(current.length+addition.length>limit){setError(`Расшифровка целиком не помещается: нужно освободить ${current.length+addition.length-limit} символов (лимит ${limit}).`);return;}latestText.current=current+addition;onChangeRef.current?.(latestText.current);clearPending();reportBusy(false);setError('');};
 const stop=()=>{const current=recorder.current;if(current&&current.state==='recording'){current.requestData();current.stop();}};
 const flattened=StyleSheet.flatten(style)??{};
 const {flex:outerFlex,flexGrow:outerGrow,flexShrink:outerShrink,width:outerWidth,minWidth,maxWidth,alignSelf,margin,marginTop,marginRight,marginBottom,marginLeft,marginHorizontal,marginVertical,...fieldStyle}=flattened;
 if(unsupportedField)return <TextInput {...inputProps} ref={ref} style={style} value={value} defaultValue={defaultValue} maxLength={maxLength} editable={editable} secureTextEntry={secureTextEntry} keyboardType={keyboardType} inputMode={inputMode} onChangeText={next=>{latestText.current=next;onChangeText?.(next);}}/>;
 return <View style={[styles.root,{flex:outerFlex,flexGrow:outerGrow,flexShrink:outerShrink,width:outerWidth,minWidth,maxWidth,alignSelf,margin,marginTop,marginRight,marginBottom,marginLeft,marginHorizontal,marginVertical}]}>
  <TextInput {...inputProps} ref={ref} keyboardType={keyboardType} inputMode={inputMode} style={[fieldStyle,styles.field,{paddingRight:Math.max(Number(fieldStyle.paddingRight)||0,42)}]} value={value} defaultValue={defaultValue} maxLength={maxLength} editable={editable} onChangeText={next=>{latestText.current=next;onChangeRef.current?.(next);}} onSubmitEditing={event=>{if(!reportedBusy.current)inputProps.onSubmitEditing?.(event);}} />
  <Pressable accessibilityRole="button" accessibilityLabel={recording?'Остановить запись':'Надиктовать текст'} accessibilityState={{disabled:starting||sending||Boolean(pending)}} disabled={starting||sending||Boolean(pending)} onPress={()=>recording?stop():void start()} style={styles.mic}>
   {starting||sending?<ActivityIndicator size="small" color={accent}/>:recording?<Square size={15} color={accent} fill={accent}/>:<Mic size={17} color={accent}/>}
  </Pressable>
  {(recording||starting||sending||Boolean(error)||Boolean(pending))&&<View style={styles.status}>{recording||starting||sending?<View style={styles.statusRow}><Text style={styles.hint}>{starting?'Подключаем микрофон…':sending?'Расшифровываем…':`Запись ${seconds} сек`}</Text><Pressable accessibilityRole="button" accessibilityLabel="Отменить запись и распознавание" onPress={cancel} style={styles.cancel}><Text style={styles.cancelText}>Отмена</Text></Pressable></View>:null}{recording||starting||sending?<Text style={styles.notice}>{heard?'Аудио отправится в OpenAI для распознавания.':' '}</Text>:null}{recording?<Text style={styles.hint}>Нажми ■, чтобы остановить запись.</Text>:null}{pending?<><Text style={styles.hint}>Проверь и отредактируй полный распознанный текст:</Text><TextInput accessibilityLabel="Черновик распознанного текста" value={pending} multiline onChangeText={next=>{if(!next){clearPending();reportBusy(false);setError('');return;}pendingRef.current=next;setPending(next);}} style={styles.draft}/><View style={styles.statusRow}><Pressable accessibilityRole="button" accessibilityLabel="Вставить распознанный текст" onPress={applyPending} style={styles.cancel}><Text style={styles.cancelText}>Вставить текст</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Удалить черновик распознавания" onPress={()=>{clearPending();reportBusy(false);setError('');}} style={styles.cancel}><Text style={styles.cancelText}>Удалить</Text></Pressable></View></>:null}{error?<View style={styles.errorRow}><Text accessibilityRole="alert" style={styles.error}>{error}</Text><Pressable accessibilityRole="button" accessibilityLabel="Скрыть сообщение" onPress={()=>setError('')} style={styles.dismiss}><X size={14} color={muted}/></Pressable></View>:null}</View>}
 </View>;
});

const styles=StyleSheet.create({root:{position:'relative'},field:{},mic:{position:'absolute',right:5,top:5,width:34,height:34,alignItems:'center',justifyContent:'center',borderRadius:10,backgroundColor:panelSoft},status:{gap:2,marginTop:4},statusRow:{minHeight:26,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},hint:{color:muted,fontSize:11,lineHeight:15},notice:{color:muted,fontSize:10,lineHeight:14},cancel:{minHeight:30,justifyContent:'center',paddingHorizontal:8},cancelText:{color:accent,fontSize:11,fontWeight:'600'},draft:{minHeight:54,maxHeight:140,borderWidth:1,borderColor:panelSoft,borderRadius:8,padding:8,color:accent,fontSize:13},errorRow:{flexDirection:'row',alignItems:'center',gap:6},error:{flex:1,color:'#a0352a',fontSize:11,lineHeight:15},dismiss:{width:28,height:28,alignItems:'center',justifyContent:'center'}});
