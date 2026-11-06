import { SectionSheet } from '../components/SectionOverview';
import { ProgressLine } from '../components';
import { nextRoadmapAction } from '../components/goalPresentation';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { calculateGoalProgress } from '../goalLogic';
import type { Goal, KodaDay } from '../types';
import {ArrowLeft,ArrowUpRight} from 'lucide-react-native';
import {ScoreTimeline} from '../components/ScoreTimeline';
import { ScoreHistoryChart } from '../components/RoadmapUI';
import { line, muted, text, ink, inkText, panel, panelSoft } from '../theme';
import { BentoPage, SectionHeader } from '../components/Bento';
import { weeklyScoreSummary } from '../dashboardMetrics';
import { todayDateKey } from '../utils';

export function ProgressScreen({
  onOpenWorkspace,
  completedTasks,
  goals,
  habitScore,
  totalTasks,
  kodaDays = [],
}: {
  onOpenWorkspace?:()=>void;
  completedTasks: number;
  goals: Goal[];
  habitScore: number;
  isDesktop?: boolean;
  totalTasks: number;
  kodaDays?: KodaDay[];
}) {
  const wide=useWindowDimensions().width>=900;
  const [detail,setDetail]=useState<'score'|'goals'|'planner'|'habits'|null>(null);
  const visibleGoals = goals.filter(goal => !goal.archivedAt);
  const activeGoals = visibleGoals.filter(goal => goal.status === 'active');
  const goalScore = activeGoals.length ? Math.round(activeGoals.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / activeGoals.length) : 0;
  const scoreSummary = weeklyScoreSummary(kodaDays, todayDateKey());

  return <>
    <BentoPage maxWidth={1100} contentStyle={{gap:16}}>
      {onOpenWorkspace&&<Pressable accessibilityRole="button" onPress={onOpenWorkspace} style={{flexDirection:'row',alignItems:'center',gap:7,minHeight:36,alignSelf:'flex-start'}}><ArrowLeft size={16} color={muted}/><Text style={local.noteText}>Рабочий стол</Text></Pressable>}
      <SectionHeader title="Прогресс" subtitle="Твои результаты без лишних цифр" action={<View style={{borderRadius:22,padding:10,backgroundColor:panel}}><Text style={local.noteText}>Последние 7 дней</Text></View>}/>
      <View style={{flexDirection:wide?'row':'column',gap:14,alignItems:'stretch'}}>
        <View {...({dataSet:{petSurface:'progress-score'}} as any)} style={{flex:wide?0.9:undefined,backgroundColor:ink,borderRadius:28,padding:24,gap:18,minWidth:0}}>
          <View style={{flexDirection:'row',alignItems:'center',gap:8,justifyContent:'space-between'}}><Text style={{color:inkText,fontSize:12,fontWeight:'700'}}>SCORE · СРЕДНЕЕ</Text><Text style={{color:'#c4cebb',fontSize:11}}>{scoreSummary.completedCount} завершённых дней</Text></View>
          <Text style={{color:inkText,fontSize:42,fontWeight:'600'}}>{scoreSummary.average===null?'—':scoreSummary.average}<Text style={{fontSize:14,color:'#c4cebb'}}>{scoreSummary.average===null?'':' / 100'}</Text></Text>
          {scoreSummary.completedCount?<ScoreTimeline days={kodaDays} count={7}/>:<Text style={{color:'#c4cebb',fontSize:14,lineHeight:21,paddingVertical:24}}>Заверши первый принятый план дня — здесь появится его результат.</Text>}
          <Text style={{color:'#c4cebb',fontSize:12,lineHeight:18}}>SCORE отражает выполнение плана дня. Прогресс целей и привычек считается отдельно.</Text>
          <Pressable accessibilityRole="button" onPress={()=>setDetail('score')} style={{minHeight:36,flexDirection:'row',gap:8,alignItems:'center'}}><Text style={{color:inkText,fontSize:13}}>Вся динамика</Text><ArrowUpRight size={16} color={inkText}/></Pressable>
        </View>
        <View style={{flex:wide?1.1:undefined,minWidth:0,gap:14}}>
          <View style={{flexDirection:'row',flexWrap:'wrap',gap:14}}>
            <Pressable accessibilityRole="button" accessibilityLabel="Открыть прогресс целей" onPress={()=>setDetail('goals')} style={[local.bubble,{backgroundColor:'#e8ff55'}]}>
              <Text style={[local.label,{color:'#435b31'}]}>ЦЕЛИ В РАБОТЕ</Text><Text style={[local.value,{color:'#263c19'}]}>{activeGoals.length?`${goalScore}%`:'—'}</Text><Text style={[local.noteText,{color:'#435b31'}]}>{activeGoals.length?`${activeGoals.length} активных целей`:'Пока нет активных целей'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Посмотреть сводку дел" onPress={()=>setDetail('planner')} style={local.bubble}><Text style={local.label}>ПЛАННЕР</Text><Text style={local.value}>{completedTasks} / {totalTasks}</Text><Text style={local.noteText}>Выполнено в текущем списке</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Посмотреть сводку привычек" onPress={()=>setDetail('habits')} style={[local.bubble,{backgroundColor:panelSoft}]}><Text style={local.label}>ПРИВЫЧКИ · 7 ДНЕЙ</Text><Text style={local.value}>{habitScore}%</Text><Text style={local.noteText}>Запланированных отметок</Text></Pressable>
            <View style={local.bubble}><Text style={local.label}>КАК ЧИТАТЬ</Text><Text style={[local.noteText,{marginTop:8}]}>У каждого блока свой источник: план дня, действия целей, дела календаря и привычки.</Text></View>
          </View>
        </View>
      </View>
    </BentoPage>
    <SectionSheet visible={detail!==null} title={detail==='score'?'Динамика SCORE':detail==='goals'?'Прогресс целей':detail==='planner'?'Дела планнера':'Привычки'} onClose={()=>setDetail(null)}>
      {detail==='score'?<><ScoreHistoryChart days={kodaDays} compact showLatest/><Text style={local.noteText}>SCORE отражает выполнение принятого плана дня. Цели и привычки считаются отдельно.</Text></>:null}
      {detail==='goals'?activeGoals.length?activeGoals.map(goal=>{const progress=calculateGoalProgress(goal),next=nextRoadmapAction(goal);return <View key={goal.id} style={local.goalRow}><View style={local.goalHeading}><Text style={local.goalTitle}>{goal.title}</Text><Text style={local.goalProgress}>{progress}%</Text></View><ProgressLine value={progress}/><Text style={local.goalNext}>{next.action?`Следующее действие · ${next.action.title}`:next.current?`На этапе «${next.current.title}» пока нет доступного действия`:'Следующее действие пока не задано'}</Text></View>}):<Text style={local.noteText}>Пока нет активных целей.</Text>:null}
      {detail==='planner'?<Text style={local.noteText}>{totalTasks?`${completedTasks} из ${totalTasks} дел планнера выполнено.`:'В планнере пока нет дел.'}</Text>:null}
      {detail==='habits'?<Text style={local.noteText}>За последние 7 дней выполнено {habitScore}% запланированных привычек. Отметки и история доступны в разделе «Привычки».</Text>:null}
    </SectionSheet>
  </>;
}

const local = StyleSheet.create({
  bubble:{flexGrow:1,flexBasis:'45%',minWidth:135,borderRadius:24,backgroundColor:panel,padding:20,gap:12},
  label:{color:muted,fontSize:11,fontWeight:'700',letterSpacing:.4},
  value:{color:text,fontSize:30,fontWeight:'600'},
  goalRow:{borderTopColor:line,borderTopWidth:1,gap:8,paddingTop:12},
  goalHeading:{alignItems:'flex-start',flexDirection:'row',gap:8,justifyContent:'space-between'},
  goalTitle:{color:text,flex:1,fontSize:14,fontWeight:'600',lineHeight:19},
  goalProgress:{color:text,fontSize:14,fontWeight:'600',lineHeight:19},
  goalNext:{color:muted,fontSize:13,lineHeight:18},
  noteText:{color:muted,fontSize:13,lineHeight:19,maxWidth:720},
});
