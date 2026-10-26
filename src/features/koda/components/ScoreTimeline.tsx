import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import type { KodaDay } from '../types';
import { scoreWeek } from '../widgetDesktop';
import { todayDateKey } from '../utils';
import { inkText, lime } from '../theme';

export function ScoreTimeline({days,compact=false,count=7,date=todayDateKey(),highlightLatest=false}:{days:KodaDay[];compact?:boolean;count?:number;date?:string;highlightLatest?:boolean}) {
 const rows=scoreWeek(days,date,count);
 const [selected,setSelected]=useState<string|null>(null);
 const latest=rows.filter(r=>r.value!==null).at(-1)?.date;
 const active=selected??(highlightLatest?latest:undefined);
 const item=selected?rows.find(r=>r.date===selected):undefined;
 const width=280,height=80,pad=12;
 const points=rows.map((row,i)=>({row,x:pad+(width-pad*2)*i/Math.max(1,rows.length-1),y:8+60*(1-Math.max(0,Math.min(100,row.value??0))/100)}));
 const segments:typeof points[]=[];
 for(const p of points){if(p.row.value===null)continue;const previous=points[points.indexOf(p)-1];if(!previous||previous.row.value===null)segments.push([]);segments.at(-1)!.push(p);}
 return <View style={{gap:4}}><View style={{height:compact?72:136,position:'relative'}}>
  <Svg pointerEvents="none" width="100%" height={compact?50:108} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
   <Defs><LinearGradient id="score-area" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#dff46b" stopOpacity=".22"/><Stop offset="1" stopColor="#dff46b" stopOpacity="0"/></LinearGradient></Defs>
   {segments.map((segment,i)=>{const d=segment.map((p,n)=>`${n?'L':'M'}${p.x},${p.y}`).join(' ');return <ChartSegment key={i} d={d} first={segment[0]} last={segment.at(-1)!}/>;})}
   {points.filter(p=>p.row.value!==null).map(p=><Circle key={p.row.date} cx={p.x} cy={p.y} r={p.row.date===active?4.5:2} fill={p.row.date===active?'#111a14':'#e4f56a'} stroke={p.row.date===active?'#fff':'#e4f56a'} strokeWidth={p.row.date===active?2:0}/>)}
  </Svg>
  <View style={s.targets}>{rows.map(row=><Pressable key={row.date} accessibilityRole="button" accessibilityLabel={`${row.date}: ${row.value===null?(row.status==='active'?'День в процессе':'Без итога'):`${Math.round(row.value)} SCORE`}`} aria-pressed={selected===row.date} onPress={()=>setSelected(selected===row.date?null:row.date)} style={s.target}><Text style={[s.label,row.date===active&&{color:lime}]}>{count<=7?new Date(`${row.date}T12:00:00`).toLocaleDateString('ru-RU',{weekday:'short'}):row.date.slice(8)}</Text></Pressable>)}</View>
 </View>{item&&<Text style={s.detail}>{new Date(`${item.date}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'short'})} · {item.value!==null?`${Math.round(item.value)} /100`:item.status==='active'?'день ещё в работе':item.status==='legacy'?'прежняя формула':'нет завершённого плана'}</Text>}</View>;
}
function ChartSegment({d,first,last}:{d:string;first:{x:number;y:number};last:{x:number;y:number}}){return <><Path d={`${d} L${last.x},80 L${first.x},80 Z`} fill="url(#score-area)"/><Path d={d} stroke="#e4f56a" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round"/></>;}
const s=StyleSheet.create({targets:{position:'absolute',inset:0,flexDirection:'row'},target:{flex:1,minWidth:0,justifyContent:'flex-end',alignItems:'center',paddingBottom:2},label:{fontSize:11,lineHeight:18,color:'#b9c7b6'},detail:{fontSize:12,lineHeight:18,color:inkText}});
