import { ProgressLine } from '../components';
import { nextRoadmapAction } from '../components/goalPresentation';
import { StyleSheet, Text, View, useWindowDimensions, type ViewStyle } from 'react-native';
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
  const narrow=useWindowDimensions().width<760;
  const visibleGoals = goals.filter(goal => !goal.archivedAt);
  const activeGoals = visibleGoals.filter(goal => goal.status === 'active');
  const goalScore = activeGoals.length ? Math.round(activeGoals.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / activeGoals.length) : 0;
  const scoreSummary = weeklyScoreSummary(kodaDays, todayDateKey());

  return <BentoPage maxWidth={960} contentStyle={local.page}>
    <SectionHeader title="Прогресс" subtitle="Динамика SCORE и движение по твоим планам" />

    <BentoGrid columns={3} style={local.overview}>
      <View style={[local.chartSpan, { gridColumn: 'span 2' } as unknown as ViewStyle]}><ScoreHistoryChart days={kodaDays} compact showLatest /><View style={local.scoreNote}><Text style={local.noteText}>{scoreSummary.average===null?'За последние 7 дней пока нет завершённых планов.':`Средний SCORE за последние 7 дней · ${scoreSummary.average}/100 · ${scoreSummary.completedCount} ${scoreSummary.completedCount===1?'день':'дней'}.`}</Text><Text style={local.noteText}>SCORE оценивает выполнение принятого плана дня. Прогресс целей и привычек показан отдельно и не входит в SCORE.</Text></View></View>
      <View style={[local.metricStack,narrow&&{flexDirection:'row',flexWrap:'wrap',gap:8}]} >
        <MetricCard label="Дела планнера" value={`${completedTasks} / ${totalTasks}`} detail="всего отмечено" tone="light" valueSize={22} style={[local.metric,narrow&&{flex:1,minWidth:90,padding:12}]}/>
        <MetricCard label="Цели в работе" value={`${goalScore}%`} detail={`${activeGoals.length} активных · среднее`} tone="soft" valueSize={24} style={[local.metric,narrow&&{flex:1,minWidth:90,padding:12}]}/>
        <MetricCard label="Привычки" value={`${habitScore}%`} detail="за последние 7 дней" tone="lime" valueSize={24} style={[local.metric,narrow&&{flex:1,minWidth:90,padding:12}]}/>
      </View>
    </BentoGrid>

    <BentoCard tone="light" style={local.goalsCard}>
      <View style={local.goalsHeading}>
        <View style={local.headingCopy}><Text style={local.sectionTitle}>Активные цели</Text><Text style={styles.rowMeta}>{activeGoals.length ? `В работе: ${activeGoals.length}` : 'Пока нет активных целей.'}</Text></View>
      </View>
      {activeGoals.length ? <View style={local.goalList}>{activeGoals.map(goal => {
        const progress = calculateGoalProgress(goal);
        const next = nextRoadmapAction(goal);
        return <View key={goal.id} style={local.goalRow}>
          <View style={local.goalHeading}><Text style={local.goalTitle}>{goal.title}</Text><Text style={local.goalProgress}>{progress}%</Text></View>
          <ProgressLine value={progress} />
          <Text style={local.goalNext}>{next.action ? `Следующее действие · ${next.action.title}` : next.current ? `На этапе «${next.current.title}» пока нет доступного действия` : 'Следующее действие пока не задано'}</Text>
        </View>;
      })}</View> : null}
      <Text style={[styles.rowMeta, local.plannerSummary]}>{totalTasks ? `${completedTasks} из ${totalTasks} дел планнера выполнено.` : 'В планнере пока нет дел.'}</Text>
    </BentoCard>

  </BentoPage>;
}

const local = StyleSheet.create({
  page: { alignSelf: 'center', gap: 20, maxWidth: 960, padding: 20, width: '100%' },
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
  scoreNote: { gap: 6,paddingHorizontal:4 },
  noteLabel: { color: muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  noteText: { color: muted, fontSize: 13, lineHeight: 19, maxWidth: 720 },
});
