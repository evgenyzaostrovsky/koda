import { ScoreTimeline } from './ScoreTimeline';
import type {ReactNode} from 'react';
import {Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import Svg,{Circle,Line,Path} from 'react-native-svg';
import {ArrowUpRight} from 'lucide-react-native';
import {ink,inkText,lime,line,muted,panel,text} from '../theme';
import type {KodaDay} from '../types';
import { scoreWeek } from '../widgetDesktop';
import { todayDateKey } from '../utils';

/** Only recorded completed days of the current SCORE version; no synthetic curve. */
export function ScoreHistoryChart({days,compact=false,showLatest=false}:{days:KodaDay[];compact?:boolean;showLatest?:boolean}){
 const rows=scoreWeek(days,todayDateKey(),14); const recorded=rows.filter(row=>row.status==='completed'||row.status==='legacy'); const shortHistory=recorded.length<4; const count=shortHistory&&!rows.slice(0,7).some(row=>row.status==='completed'||row.status==='legacy')?7:14; const latest=showLatest?rows.filter(row=>row.status==='completed').at(-1):undefined;
 return <View style={r.dark}><Text style={r.darkTitle}>Динамика SCORE · {count} дней</Text>{showLatest&&<View style={{gap:4}}><Text style={r.darkNumber}>{latest?Math.round(latest.value!):'—'}<Text style={r.darkUnit}>{latest?' /100':''}</Text></Text><Text style={r.darkMeta}>{latest?`Последний завершённый день · ${new Date(`${latest.date}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})}`:'Пока нет завершённых дней'}</Text></View>}{recorded.length?<><ScoreTimeline days={days} compact={compact||shortHistory} count={count} highlightLatest/><Text style={r.darkMeta}>Нажми на день, чтобы посмотреть итог.</Text></>:<Text style={r.darkMeta}>Заверши первый принятый план — здесь появится его результат.</Text>}</View>;
}

export function DateRibbon({value,today,onChange}:{value:string;today:string;onChange:(value:string)=>void}){
 const dates=Array.from({length:7},(_,i)=>{const d=new Date(`${today}T12:00:00`);d.setDate(d.getDate()+i-3);return {key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`,d};});
 return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={r.dates}>{dates.map(({key,d})=><Pressable key={key} accessibilityRole="button" accessibilityLabel={`Обзор дня ${d.toLocaleDateString('ru-RU')}`} accessibilityState={{selected:key===value}} onPress={()=>onChange(key)} style={[r.date,key===value&&{backgroundColor:lime,borderColor:lime}]}><Text style={[r.dateNumber,key===value&&{color:'#202810'}]}>{d.getDate()}</Text><Text style={[r.dateDay,key===value&&{color:'#3b461e'}]}>{d.toLocaleDateString('ru-RU',{weekday:'short'})}</Text>{key===today&&<View style={r.todayDot}/>}</Pressable>)}</ScrollView>;
}

export function AssistantTile({onPress,children}:{onPress:()=>void;children?:ReactNode}){
 return <Pressable accessibilityRole="button" accessibilityLabel="Обсудить день с помощником" onPress={onPress} style={r.assistant}><View style={r.heading}><Text style={r.assistantTitle}>Помощник</Text><View style={r.arrow}><ArrowUpRight size={16} color="#202810"/></View></View><Text style={r.assistantCopy}>{children??'Разложить сложное на посильные шаги. С чего начнём?'}</Text><Text style={r.assistantLink}>Открыть диалог</Text></Pressable>;
}
const r=StyleSheet.create({
 dark:{backgroundColor:ink,borderRadius:28,padding:22,gap:10,minHeight:0,overflow:'hidden'},heading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,flexWrap:'wrap'},darkTitle:{color:inkText,fontSize:16,fontWeight:'500'},darkMeta:{color:'#c0cab4',fontSize:12,lineHeight:18},darkPill:{borderWidth:1,borderColor:'#4b5947',paddingHorizontal:10,paddingVertical:5,borderRadius:99},darkNumber:{color:inkText,fontSize:40,fontWeight:'500',letterSpacing:-1.6},darkUnit:{color:'#c0cab4',fontSize:12,letterSpacing:0},
 dates:{gap:8,paddingVertical:8},date:{backgroundColor:panel,borderWidth:1,borderColor:line,borderRadius:28,minWidth:49,minHeight:64,alignItems:'center',justifyContent:'center',gap:6,paddingHorizontal:11},dateNumber:{color:text,fontSize:21,fontWeight:'500'},dateDay:{color:muted,fontSize:12},todayDot:{width:4,height:4,borderRadius:4,backgroundColor:'#53651d'},
 assistant:{backgroundColor:lime,borderRadius:28,padding:18,gap:14,minHeight:0,flex:1},assistantTitle:{color:'#202810',fontSize:15,fontWeight:'500',flex:1,minWidth:0},assistantCopy:{color:'#3b461e',fontSize:13,lineHeight:20},assistantLink:{color:'#202810',fontSize:12,fontWeight:'600'},arrow:{borderRadius:99,borderWidth:1,borderColor:'#a5b64a',width:28,height:28,alignItems:'center',justifyContent:'center'},
});
