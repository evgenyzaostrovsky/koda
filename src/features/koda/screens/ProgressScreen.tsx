import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { calculateGoalProgress } from '../goalLogic';
import type { Goal } from '../types';
import { Card, ProgressLine, SectionTitle } from '../components';
import { styles } from '../styles';
import { DesktopPageLayout } from '../components/DesktopShell';

export function ProgressScreen({
  completedTasks,
  goals,
  habitScore,
  isDesktop = false,
  totalTasks,
}: {
  completedTasks: number;
  goals: Goal[];
  habitScore: number;
  isDesktop?: boolean;
  totalTasks: number;
}) {
  const taskScore = totalTasks ? Math.round((completedTasks / totalTasks) * 100) : 0;
  const goalScore = goals.length ? Math.round(goals.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / goals.length) : 0;
  const combinedScore = Math.round((taskScore + goalScore + habitScore) / 3);
  const activeGoals = goals.filter((goal) => goal.status === 'active');

  const main = (
    <View style={local.main}>
      <SectionTitle title="Прогресс" subtitle="Статистика и динамика" />
      <View style={local.metrics}>
        <ProgressMetric label="Задачи" value={`${completedTasks} / ${totalTasks}`} progress={taskScore} />
        <ProgressMetric label="Цели" value={`${goalScore}%`} progress={goalScore} />
        <ProgressMetric label="Привычки" value={`${habitScore}%`} progress={habitScore} />
      </View>
      <View style={local.scorePanel}>
        <View style={local.scoreLead}>
          <Text style={styles.cardLabel}>KODA SCORE</Text>
          <Text style={local.score}>{combinedScore}%</Text>
          <Text style={styles.rowMeta}>Текущий срез по фактическим задачам, активным целям и привычкам.</Text>
        </View>
        <View style={local.breakdown}>
          <BreakdownRow label="Задачи" value={taskScore} />
          <BreakdownRow label="Цели" value={goalScore} />
          <BreakdownRow label="Привычки" value={habitScore} />
        </View>
      </View>
      <Card>
        <Text style={styles.cardLabel}>АКТИВНЫЙ КОНТУР</Text>
        <Text style={local.sectionValue}>{activeGoals.length} активных целей</Text>
        <Text style={styles.rowMeta}>{totalTasks ? `${totalTasks - completedTasks} задач ещё требуют внимания.` : 'На сегодня задач в планнере нет.'}</Text>
      </Card>
    </View>
  );
  const right = (
    <View style={local.aside}>
      <Text style={local.asideTitle}>Сейчас</Text>
      <Card>
        <Text style={styles.cardLabel}>БЛИЖАЙШИЙ РЫЧАГ</Text>
        <Text style={styles.cardText}>{taskScore <= goalScore && taskScore <= habitScore ? 'Закрой следующую задачу из планнера.' : goalScore <= habitScore ? 'Продвинь действие активной цели.' : 'Отметь следующую привычку.'}</Text>
      </Card>
      <Card>
        <Text style={styles.cardLabel}>О ДАННЫХ</Text>
        <Text style={styles.rowMeta}>История динамики появится здесь после накопления завершённых дней. Сейчас показан честный текущий срез.</Text>
      </Card>
    </View>
  );

  if (isDesktop) {
    return <DesktopPageLayout main={main} right={right} />;
  }

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {main}
      {right}
    </ScrollView>
  );
}

function ProgressMetric({ label, progress, value }: { label: string; progress: number; value: string }) {
  return <View style={local.metric}><Text style={styles.cardLabel}>{label.toUpperCase()}</Text><Text style={local.metricValue}>{value}</Text><ProgressLine value={progress} /></View>;
}

function BreakdownRow({ label, value }: { label: string; value: number }) {
  return <View style={local.breakdownRow}><View style={local.breakdownLabel}><Text style={styles.cardText}>{label}</Text><Text style={styles.rowMeta}>{value}%</Text></View><ProgressLine value={value} /></View>;
}

const local = StyleSheet.create({
  main: { gap: 14, minWidth: 0 },
  metrics: { flexDirection: 'row', gap: 12, minWidth: 0 },
  metric: { borderColor: '#303230', borderRadius: 10, borderWidth: 1, flex: 1, gap: 9, minWidth: 0, padding: 16 },
  metricValue: { color: '#f2f2ef', fontSize: 24, fontWeight: '300', lineHeight: 30 },
  scorePanel: { backgroundColor: '#111211', borderColor: '#303230', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 32, minHeight: 220, padding: 24 },
  scoreLead: { flex: 0.8, gap: 10, justifyContent: 'center', minWidth: 0 },
  score: { color: '#f2f2ef', fontSize: 62, fontWeight: '300', lineHeight: 68 },
  breakdown: { flex: 1.2, gap: 22, justifyContent: 'center', minWidth: 0 },
  breakdownRow: { gap: 8 },
  breakdownLabel: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionValue: { color: '#f2f2ef', fontSize: 20, lineHeight: 26, marginVertical: 8 },
  aside: { gap: 12 },
  asideTitle: { color: '#f2f2ef', fontSize: 18, lineHeight: 24 },
});
