import {Pressable,Text,View} from 'react-native';
import type {Goal} from '../types';
import {findAccountCompletionCandidates} from '../goalCompletion';
import {accent,line,muted,panel,text} from '../theme';

export type CompletionMessage = {role:string;content:string};
export function GoalCompletionPrompt({goals,message,onConfirm,disabled=false}:{goals:Goal[];message?:CompletionMessage;onConfirm?:(goalId:string,actionId:string,message:CompletionMessage)=>void;disabled?:boolean}) {
  if(!message||!onConfirm)return null;
  const candidate=findAccountCompletionCandidates(goals,message)[0];
  if(!candidate)return null;
  const goal=goals.find(item=>item.id===candidate.goalId)!;
  return <View style={{padding:12,gap:6,borderWidth:1,borderColor:line,borderRadius:18,backgroundColor:panel}}>
    <Text style={{color:text,fontSize:13,fontWeight:'600'}}>Сохранить выполнение?</Text>
    <Text style={{color:text,fontSize:13}}>{candidate.action.title}</Text>
    <Text style={{color:muted,fontSize:11}}>{goal.title} · отметка обновит цель и связанные дела планнера.</Text>
    <Pressable accessibilityRole="button" accessibilityLabel={`Отметить выполненным: ${candidate.action.title}`} disabled={disabled} onPress={()=>onConfirm(candidate.goalId,candidate.action.id,message)} style={{minHeight:44,justifyContent:'center',opacity:disabled?0.5:1}}><Text style={{color:accent,fontSize:13,fontWeight:'700'}}>Отметить выполненным</Text></Pressable>
  </View>;
}
