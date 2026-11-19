import {GoalCompletionPrompt,type CompletionMessage} from './GoalCompletionPrompt';
import type {Goal} from '../types';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {MessageCircle,Paperclip,Send,X} from 'lucide-react-native';
import {requestChat} from '../../../services/kodaApi';
import {assertDiscussionCapacity,goalDiscussionContext,normalizeGoalDiscussion,validateDiscussionMaterial,type GoalDiscussionData} from '../goalDiscussion';
import {uid} from '../utils';
import {accent,activeBg,activeText,line,muted,panel,text} from '../theme';
import { useDictationBusy, VoiceTextInput } from './VoiceTextInput';

type Props={completionGoal?:Goal;onCompleteAction?:(goalId:string,actionId:string,message:CompletionMessage)=>void;userId?:string|null;goalId?:string;title:string;desiredResult?:string;planningContext?:string;value?:GoalDiscussionData;onChange:(recipe:(data:GoalDiscussionData)=>GoalDiscussionData)=>void;onSuggest:()=>void;hideSuggest?:boolean;disabled?:boolean;onDictationBusyChange?:(busy:boolean)=>void};
export function GoalDiscussion({completionGoal,onCompleteAction,userId,goalId,title,desiredResult,planningContext,value,onChange,onSuggest,hideSuggest,disabled,onDictationBusyChange}:Props){
 const [expanded,setExpanded]=useState(false),[draft,setDraft]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const dictation=useDictationBusy();
 useEffect(()=>{onDictationBusyChange?.(dictation.busy);return()=>onDictationBusyChange?.(false);},[dictation.busy,onDictationBusyChange]);
 const data=normalizeGoalDiscussion(value),epoch=useRef(0),inflight=useRef(false);
 const latest=useRef({data,title,desiredResult,planningContext,userId,goalId});latest.current={data,title,desiredResult,planningContext,userId,goalId};
 useEffect(()=>{epoch.current++;inflight.current=false;setBusy(false);setError('');setDraft('');return()=>{epoch.current++;};},[userId,goalId]);
 function change(recipe:(data:GoalDiscussionData)=>GoalDiscussionData){const next=normalizeGoalDiscussion(recipe(latest.current.data));if(JSON.stringify(next).length>JSON.stringify(latest.current.data).length)assertDiscussionCapacity(next);latest.current={...latest.current,data:next};onChange(current=>recipe(normalizeGoalDiscussion(current)));}
 function remove(id:string){change(current=>normalizeGoalDiscussion({...current,removedIds:[...current.removedIds,id]}));}
 async function send(retry=false){
  const content=retry?data.messages.at(-1)?.content:draft.trim();
  if(!userId||!content||inflight.current||disabled||dictation.busy)return;
  const owner=userId,requestEpoch=epoch.current,sourceTitle=title,sourceResult=desiredResult,sourcePlanningContext=planningContext,sourceMaterials=JSON.stringify(data.materials);
  const message={id:uid('goal-chat'),role:'user' as const,content:content.slice(0,2000),at:new Date().toISOString()};
  const messages=retry?data.messages:[...data.messages,message];
  if(!retry){try{assertDiscussionCapacity({...data,messages:[...messages,{id:'reserved-reply',role:'assistant',content:'я'.repeat(4000),at:new Date().toISOString()}]});change(current=>({...current,messages:[...current.messages,message]}));setDraft('');}catch(e){setError(e instanceof Error?e.message:'Не удалось сохранить сообщение.');return;}}
  inflight.current=true;setBusy(true);setError('');
  try{
   const reply=await requestChat(messages.map(({role,content})=>({role,content})),{contextScope:{kind:'goal',...(goalId?{goalId}:{})},goalTitle:[title,desiredResult].filter(Boolean).join(' · '),discussionContext:goalDiscussionContext({...data,messages},sourcePlanningContext)});
   if(requestEpoch!==epoch.current||owner!==latest.current.userId)return;
   if(sourceTitle!==latest.current.title||sourceResult!==latest.current.desiredResult||sourcePlanningContext!==latest.current.planningContext||sourceMaterials!==JSON.stringify(latest.current.data.materials)||JSON.stringify(normalizeGoalDiscussion({messages}).messages)!==JSON.stringify(normalizeGoalDiscussion(latest.current.data).messages)){setError('Контекст изменился. Отправь сообщение ещё раз с актуальными материалами.');return;}
   const answer={id:uid('goal-reply'),role:'assistant' as const,content:reply.reply,at:new Date().toISOString()};
   change(current=>({...current,messages:[...current.messages,answer]}));
  }catch{if(requestEpoch===epoch.current)setError('Ответ не получен. Сообщение осталось в беседе; можно повторить запрос.');}
  finally{if(requestEpoch===epoch.current){inflight.current=false;setBusy(false);}}
 }
 function attach(){
  if(Platform.OS!=='web'||typeof document==='undefined'){setError('Вставь программу курса текстом в сообщение. Загрузка файла доступна в веб-версии.');return;}
  const input=document.createElement('input');input.type='file';input.accept='.txt,.md,.csv,.json';
  const version=epoch.current,owner=userId;
  input.onchange=()=>{const file=input.files?.[0];if(!file)return;void(async()=>{try{
   if(file.size>64000)throw new Error('Файл слишком большой. Выбери текстовую программу курса до 64 КБ.');
   const content=await file.text();if(version!==epoch.current||owner!==latest.current.userId)return;
   validateDiscussionMaterial(file.name,content,latest.current.data);
   const material={id:uid('goal-material'),name:file.name,content,at:new Date().toISOString()};
   change(current=>{validateDiscussionMaterial(file.name,content,current);return {...current,materials:[...current.materials,material]};});setError('');
  }catch(e){if(version===epoch.current)setError(e instanceof Error?e.message:'Не удалось прочитать файл.');}})();};input.click();
 }
 return <View style={styles.box}>
  <Pressable accessibilityRole="button" accessibilityState={{expanded}} onPress={()=>setExpanded(x=>!x)} style={styles.toggle}><MessageCircle size={17} color={accent}/><Text style={styles.heading}>{expanded?'Обсуждение с KODA':'Обсудить с KODA'}{data.messages.length?` · ${data.messages.length}`:''}</Text><Text style={styles.hint}>{expanded?'Свернуть':'Открыть чат'}</Text></Pressable>
  {expanded&&<View style={styles.body}>
   <Text style={styles.hint}>Добавь важные детали о цели или задай вопрос о плане. Беседа и материалы помогут учесть контекст; их можно очистить.</Text>
   {data.materials.map(material=><View key={material.id} style={styles.row}><Paperclip size={15} color={muted}/><Text style={[styles.hint,{flex:1}]}>{material.name} · {material.content.length} символов</Text><Pressable accessibilityRole="button" accessibilityLabel={`Удалить материал ${material.name}`} disabled={busy} onPress={()=>remove(material.id)} style={styles.icon}><X size={16} color={muted}/></Pressable></View>)}
   {data.messages.length>12&&<Text style={styles.hint}>Показаны последние 12 сообщений. Для ответа используется недавняя беседа и материалы.</Text>}
   {data.messages.slice(-12).map(message=><View key={message.id} style={styles.message}><View style={styles.row}><Text style={styles.label}>{message.role==='user'?'Ты':'KODA'}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Удалить сообщение: ${message.content.slice(0,40)}`} disabled={busy} onPress={()=>remove(message.id)} style={styles.icon}><X size={14} color={muted}/></Pressable></View><Text selectable style={styles.copy}>{message.content}</Text></View>)}
   {completionGoal&&<GoalCompletionPrompt goals={[completionGoal]} message={data.messages.findLast(message=>message.role==='user')} onConfirm={onCompleteAction} disabled={busy||disabled||!userId}/>}
   {!userId&&<Text style={styles.hint}>Войди в аккаунт, чтобы общаться с помощником.</Text>}
   <VoiceTextInput accessibilityLabel="Сообщение о текущей цели" scopeKey={`${userId ?? ''}:${goalId ?? 'general'}`} onDictationBusyChange={dictation.bind('draft')} multiline value={draft} onChangeText={setDraft} editable={!busy&&!disabled&&Boolean(userId)} maxLength={2000} placeholder="Добавь важные детали или задай вопрос о плане" placeholderTextColor={muted} style={styles.input}/>
   <View style={styles.row}><Pressable accessibilityRole="button" disabled={busy||disabled} onPress={attach} style={styles.action}><Paperclip size={16} color={accent}/><Text style={styles.hint}>Материалы</Text></Pressable><Text style={[styles.hint,{flex:1}]}>TXT, MD, CSV, JSON · до 16 тыс. знаков</Text><Pressable accessibilityRole="button" accessibilityLabel="Отправить сообщение" disabled={busy||disabled||dictation.busy||!userId||!draft.trim()} onPress={()=>void send()} style={[styles.send,(!userId||busy||dictation.busy||!draft.trim())&&{opacity:0.5}]}>{busy?<ActivityIndicator color={activeText}/>:<Send size={18} color={activeText}/>}</Pressable></View>
   {!!error&&<Text accessibilityRole="alert" style={styles.hint}>{error}</Text>}
   {!!error&&data.messages.at(-1)?.role==='user'&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void send(true)} style={styles.action}><Text style={styles.heading}>Повторить запрос</Text></Pressable>}
   {!!data.messages.length&&<View style={styles.row}>{!hideSuggest&&<Pressable accessibilityRole="button" disabled={busy||disabled} onPress={onSuggest} style={styles.action}><Text style={styles.heading}>Составить план</Text></Pressable>}<Pressable accessibilityRole="button" disabled={busy} onPress={()=>change(current=>normalizeGoalDiscussion({...current,removedIds:[...current.removedIds,...current.messages.map(m=>m.id)]}))} style={styles.action}><Text style={styles.hint}>Очистить беседу</Text></Pressable></View>}
   <Text style={styles.hint}>План учтёт эту беседу и добавленные материалы. Перед добавлением его можно проверить.</Text>
  </View>}
 </View>;
}
const styles=StyleSheet.create({box:{borderColor:line,borderWidth:1,borderRadius:18,backgroundColor:panel},toggle:{flexDirection:'row',alignItems:'center',gap:8,minHeight:44,paddingHorizontal:10},heading:{color:accent,fontSize:12,fontWeight:'600',flexShrink:1},hint:{color:muted,fontSize:11,lineHeight:16},body:{padding:10,gap:8},row:{flexDirection:'row',alignItems:'center',gap:6,flexWrap:'wrap'},message:{borderTopWidth:1,borderColor:line,paddingTop:4},label:{color:muted,fontSize:11,fontWeight:'600',flex:1},copy:{color:text,fontSize:13,lineHeight:19},icon:{width:44,height:44,alignItems:'center',justifyContent:'center'},input:{minHeight:72,maxHeight:160,borderWidth:1,borderColor:line,borderRadius:14,padding:10,color:text,fontSize:13,textAlignVertical:'top'},send:{width:44,height:44,borderRadius:14,backgroundColor:activeBg,alignItems:'center',justifyContent:'center'},action:{minHeight:44,flexDirection:'row',alignItems:'center',gap:5,paddingHorizontal:4}});
