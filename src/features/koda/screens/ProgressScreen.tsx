import { SectionOverview, SectionSheet } from '../components/SectionOverview';
import { ProgressLine } from '../components';
import { nextRoadmapAction } from '../components/goalPresentation';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { calculateGoalProgress } from '../goalLogic';
import type { Goal, KodaDay } from '../types';
import { styles } from '../styles';
import { ScoreHistoryChart } from '../components/RoadmapUI';
import { line, muted, text } from '../theme';
import { BentoCard, BentoGrid, BentoPage, MetricCard, SectionHeader } from '../components/Bento';
import { weeklyScoreSummary } from '../dashboardMetrics';
import { todayDateKey } from '../utils';

export function ProgressScreen({
  completedTasks,
  goals,
  habitScore,
  totalTasks,
  kodaDays = [],
}: {
  completedTasks: number;
  goals: Goal[];
  habitScore: number;
  isDesktop?: boolean;
  totalTasks: number;
  kodaDays?: KodaDay[];
}) {
  const [detail,setDetail]=useState<'score'|'goals'|'planner'|'habits'|null>(null);
  const visibleGoals = goals.filter(goal => !goal.archivedAt);
  const activeGoals = visibleGoals.filter(goal => goal.status === 'active');
  const goalScore = activeGoals.length ? Math.round(activeGoals.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / activeGoals.length) : 0;
  const scoreSummary = weeklyScoreSummary(kodaDays, todayDateKey());

  return <>
    <SectionOverview title="Прогресс" tiles={[
      {key:'score',title:'SCORE за 7 дней',value:scoreSummary.average===null?'—':`${scoreSummary.average} / 100`,detail:scoreSummary.completedCount?`Завершённых дней: ${scoreSummary.completedCount}`:'После первого завершённого плана',action:'Открыть динамику SCORE',tone:'dark',onPress:()=>setDetail('score')},
      {key:'goals',title:'Цели в работе',value:activeGoals.length?`${goalScore}%`:'Нет активных целей',detail:activeGoals[0]?.title||'Прогресс появится после добавления действий',action:'Открыть прогресс целей',tone:'lime',onPress:()=>setDetail('goals')},
      {key:'planner',title:'Дела планнера',value:`${completedTasks} / ${totalTasks}`,detail:'Отмечено выполненными в текущем списке',action:'Посмотреть сводку дел',onPress:()=>setDetail('planner')},
      {key:'habits',title:'Привычки',value:`${habitScore}%`,detail:'Выполнение за последние 7 дней',action:'Посмотреть сводку привычек',onPress:()=>setDetail('habits')},
    ]}/>
    <SectionSheet visible={detail!==null} title={detail==='score'?'Динамика SCORE':detail==='goals'?'Прогресс целей':detail==='planner'?'Дела планнера':'Привычки'} onClose={()=>setDetail(null)}>
      {detail==='score'?<><ScoreHistoryChart days={kodaDays} compact showLatest/><Text style={local.noteText}>SCORE отражает выполнение принятого плана дня. Цели и привычки считаются отдельно.</Text></>:null}
      {detail==='goals'?activeGoals.length?activeGoals.map(goal=>{const progress=calculateGoalProgress(goal),next=nextRoadmapAction(goal);return <View key={goal.id} style={local.goalRow}><View style={local.goalHeading}><Text style={local.goalTitle}>{goal.title}</Text><Text style={local.goalProgress}>{progress}%</Text></View><ProgressLine value={progress}/><Text style={local.goalNext}>{next.action?`Следующее действие · ${next.action.title}`:next.current?`На этапе «${next.current.title}» пока нет доступного действия`:'Следующее действие пока не задано'}</Text></View>}):<Text style={local.noteText}>Пока нет активных целей.</Text>:null}
      {detail==='planner'?<Text style={local.noteText}>{totalTasks?`${completedTasks} из ${totalTasks} дел планнера выполнено.`:'В планнере пока нет дел.'}</Text>:null}
      {detail==='habits'?<Text style={local.noteText}>За последние 7 дней выполнено {habitScore}% запланированных привычек. Отметки и история доступны в разделе «Привычки».</Text>:null}
    </SectionSheet>
  </>;
}

const local = StyleSheet.create({
  page: { alignSelf: 'center', flexGrow: 1, gap: 20, maxWidth: 1040, padding: 20, width: '100%' },
  overview: { alignItems: 'stretch' },
  chartSpan: { minWidth: 0, gap: 20 },
  metricStack: { gap: 12, minWidth: 0,alignSelf:'flex-start' },
  metric: { gap: 6, minHeight: 0, padding: 16 },
  goalsCard: { gap: 12 },
  goalsHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  headingCopy: { gap: 2 },
  sectionTitle: { color: text, fontSize: 19, fontWeight: '600', lineHeight: 25 },
  goalList: { gap: 10 },
  goalRow: { borderTopColor: line, borderTopWidth: 1, gap: 8, paddingTop: 12 },
  goalHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  goalTitle: { color: text, flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  goalProgress: { color: text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  goalNext: { color: muted, fontSize: 13, lineHeight: 18 },
  plannerSummary: { borderTopColor: line, borderTopWidth: 1, marginTop: 4, paddingTop: 12 },
  showAllButton: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  showAllText: { color: text, fontSize: 13, fontWeight: '700' },
  scoreNote: { gap: 6,paddingHorizontal:4 },
  noteLabel: { color: muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  noteText: { color: muted, fontSize: 13, lineHeight: 19, maxWidth: 720 },
});
