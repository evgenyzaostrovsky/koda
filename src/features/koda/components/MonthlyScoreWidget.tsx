import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Pressable, Text, View, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react-native';
import type { KodaDay } from '../types';
import { monthlyScoreSummary, monthlyScoreCoordinates } from '../dashboardMetrics';

export function MonthlyScoreWidget({days,date,onOpen}:{days:KodaDay[];date:string;onOpen:()=>void}) {
 const [month,setMonth]=useState(date.slice(0,7));
 const currentMonth=date.slice(0,7);
 const previousCurrentMonth=useRef(currentMonth);
 const [choosing,setChoosing]=useState(false);
 useEffect(()=>{
  const previousMonth=previousCurrentMonth.current;
  previousCurrentMonth.current=currentMonth;
  setMonth(selected=>selected===previousMonth?currentMonth:selected);
 },[currentMonth]);
 const gradient=useId().replace(/:/g,'');
 const {average,points}=useMemo(()=>monthlyScoreSummary(days,month),[days,month]);
 const label=new Date(`${month}-01T12:00:00`).toLocaleDateString('ru-RU',{month:'long'});
 const previous=()=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()-1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);};
 const next=()=>{const d=new Date(`${month}-01T12:00:00`);d.setMonth(d.getMonth()+1);setMonth(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);};
 const coords=useMemo(()=>monthlyScoreCoordinates(points,month),[points,month]);
 // Monotone cubic Hermite interpolation: smooth curves without overshooting neighbouring scores.
 const path=useMemo(()=>{const slopes=coords.slice(1).map((p,i)=>(p.y-coords[i].y)/(p.x-coords[i].x));const tangents=coords.map((_,i)=>i===0?(slopes[0]??0):i===coords.length-1?(slopes.at(-1)??0):slopes[i-1]*slopes[i]<=0?0:2/(1/slopes[i-1]+1/slopes[i]));return coords.map((p,i)=>{if(!i)return `M ${p.x} ${p.y}`;const a=coords[i-1],dx=(p.x-a.x)/3;return `C ${a.x+dx} ${a.y+tangents[i-1]*dx} ${p.x-dx} ${p.y-tangents[i]*dx} ${p.x} ${p.y}`;}).join(' ');},[coords]);
 const latest=coords.at(-1);
 const marker=latest;
 return <View style={s.root}>
  <Pressable accessibilityRole="button" accessibilityLabel="Открыть прогресс: KODA SCORE" onPress={onOpen}><Text style={s.title}>KODA SCORE</Text></Pressable>
  <Pressable accessibilityRole="button" accessibilityLabel={`Выбрать месяц SCORE: ${label} ${month.slice(0,4)}`} aria-expanded={choosing} onPress={()=>setChoosing(!choosing)} style={s.month}><Text style={s.monthText}>{label}</Text><ChevronDown color="#a2a79d" size={10}/></Pressable>
  {choosing&&<View style={s.picker}><Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц SCORE" onPress={previous} style={s.arrow}><ChevronLeft size={15} color="#ddd"/></Pressable><Text style={s.year}>{month.slice(0,4)}</Text><Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц SCORE" disabled={month>=date.slice(0,7)} onPress={next} style={s.arrow}><ChevronRight size={15} color={month>=date.slice(0,7)?'#555':'#ddd'}/></Pressable></View>}
  <View accessibilityRole="image" accessibilityLabel={`Средний SCORE за ${label}: ${average===null?'нет завершённых дней':average+' из 100'}. Плавный график: ${points.map(p=>`${p.date}: ${Math.round(p.value)}`).join(', ')||'нет завершённых дней'}`} style={s.chart}>
   <Svg width="100%" height="100%" viewBox="0 0 160 100" preserveAspectRatio="none">
    <Defs><LinearGradient id={gradient} x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor="#dce84e" stopOpacity=".35"/><Stop offset="1" stopColor="#dce84e" stopOpacity="0"/></LinearGradient></Defs>
    {coords.length>0&&<><Path d={`${path} L ${latest!.x} 100 L ${coords[0].x} 100 Z`} fill={`url(#${gradient})`}/><Path d={path} fill="none" stroke="#e2ed63" strokeWidth={2} strokeLinecap="round"/>{marker&&<Circle cx={marker.x} cy={marker.y} r={3.4} fill="#080b08" stroke="#fff" strokeWidth={1.6}/>}</>}
   </Svg>
   <View style={s.average}><Text style={s.averageCaption}>среднее</Text><Text accessibilityLabel={average===null?'За этот месяц нет завершённых дней':`Средний SCORE за ${label}: ${average} из 100`} style={s.averageText}>{average===null?'—':`${average}/100`}</Text></View>
  </View>
 </View>;
}
const s=StyleSheet.create({root:{flex:1,minWidth:0},title:{fontSize:12,lineHeight:16,fontWeight:'500',color:'#f4f5e9'},month:{alignSelf:'flex-start',flexDirection:'row',gap:3,alignItems:'center',minHeight:44},monthText:{fontSize:10,lineHeight:14,color:'#a2a79d'},value:{fontSize:30,lineHeight:34,color:'#e2ed63',letterSpacing:-1,marginTop:4},unit:{fontSize:12,letterSpacing:0,color:'#c6c9b8'},averageCaption:{fontSize:8,lineHeight:10,color:'#51584a'},average:{position:'absolute',top:-32,right:16,backgroundColor:'#fff',paddingHorizontal:7,paddingVertical:3,borderRadius:12},averageText:{fontSize:10,lineHeight:13,color:'#0c100a',fontWeight:'600'},chart:{height:94,marginHorizontal:-16,marginBottom:-16,marginTop:'auto'},picker:{position:'absolute',top:58,left:0,right:0,zIndex:5,flexDirection:'row',alignItems:'center',justifyContent:'space-between',backgroundColor:'#22261f',borderRadius:8},arrow:{height:44,width:44,alignItems:'center',justifyContent:'center'},year:{fontSize:10,color:'#b5b9aa'}});
