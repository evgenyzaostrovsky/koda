import { NotebookPen, Sparkles, Target } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useMemo } from 'react';
import { calculateGoalProgress } from '../goalLogic';
import { weeklyScoreSummary } from '../dashboardMetrics';
import type { Goal, JournalEntry, KodaDay } from '../types';
import { accent, activeBg, activeText, line, muted, panelSoft, text } from '../theme';

export function AssistantWidget({ lastReply, onOpen, onPrompt }: { lastReply?: string; onOpen: () => void; onPrompt: (text: string) => void }) {
  return <View style={s.root}>
    <Pressable accessibilityRole="button" accessibilityLabel="Открыть помощника KODA" onPress={onOpen} style={s.heading}>
      <View style={s.icon}><Sparkles size={17} color={accent} /></View>
      <Text style={s.title}>Помощник</Text>
    </Pressable>
    <Text numberOfLines={2} style={s.reply}>{lastReply?.trim() || 'Выбери, с чего начать — или расскажи, что сейчас мешает.'}</Text>
    <View style={s.actions}>
      <Pressable accessibilityRole="button" onPress={() => onPrompt('Помоги выбрать один следующий шаг на сегодня.')} style={s.actionPrimary}><Text numberOfLines={1} style={s.actionPrimaryText}>Выбрать следующий шаг</Text></Pressable>
      <Pressable accessibilityRole="button" onPress={() => onPrompt('Помоги спокойно разобрать перегрузку и выбрать, что можно отложить.')} style={s.actionSecondary}><Text numberOfLines={1} style={s.actionText}>Разобрать перегрузку</Text></Pressable>
    </View>
  </View>;
}

export function JournalWidget({ entries, onOpen }: { entries: JournalEntry[]; onOpen: (id?: string) => void }) {
  const latest = useMemo(() => entries.filter(entry => entry.text.trim()).sort((a,b) => b.createdAt.localeCompare(a.createdAt))[0], [entries]);
  const excerpt = latest?.text.trim().replace(/\s+/g, ' ');
  const date = latest ? new Date(latest.createdAt) : null;
  const dateLabel = date && !Number.isNaN(date.getTime())
    ? date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
    : '';
  return <View style={s.root}>
    <Pressable accessibilityRole="button" accessibilityLabel="Открыть дневник" onPress={() => onOpen(latest?.id)} style={s.heading}>
      <View style={s.icon}><NotebookPen size={17} color={accent} /></View>
      <Text style={s.title}>Дневник</Text>
    </Pressable>
    {latest ? <>
      <Text style={s.date}>{dateLabel}</Text>
      <Text numberOfLines={3} style={s.journalExcerpt}>{excerpt}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Открыть последнюю запись дневника" onPress={() => onOpen(latest.id)} style={s.openButton}><Text style={s.openText}>Открыть запись</Text></Pressable>
    </> : <>
      <Text style={s.empty}>Здесь появится запись, когда захочешь сохранить мысли.</Text>
      <Pressable accessibilityRole="button" onPress={() => onOpen()} style={s.openButton}><Text style={s.openText}>Написать запись</Text></Pressable>
    </>}
  </View>;
}

export function ProgressWidget({ days, goals, date, onOpen }: { days: KodaDay[]; goals: Goal[]; date: string; onOpen: () => void }) {
  const week = useMemo(() => weeklyScoreSummary(days, date), [days, date]);
  const activeGoals = useMemo(() => goals.filter(goal => goal.status === 'active' && !goal.archivedAt), [goals]);
  const goalProgress = useMemo(() => activeGoals.length
    ? Math.round(activeGoals.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / activeGoals.length)
    : null, [activeGoals]);
  return <View style={s.root}>
    <Pressable accessibilityRole="button" accessibilityLabel="Открыть прогресс за неделю и по активным целям" onPress={onOpen} style={s.heading}>
      <View style={s.icon}><Target size={17} color={accent} /></View>
      <Text style={s.title}>Прогресс</Text>
    </Pressable>
    <View style={s.weekBlock}>
      <Text style={s.metricLabel}>SCORE за 7 дней</Text>
      <Text style={s.weekValue}>{week.average === null ? '—' : `${week.average}/100`}</Text>
      <Text style={s.detail}>{week.completedCount ? `Завершённых дней: ${week.completedCount}` : 'Пока нет завершённых дней'}</Text>
    </View>
    <View style={s.goalBlock}>
      <View style={s.goalHeading}><Text style={s.metricLabel}>Активные цели</Text><Text style={s.goalCount}>{activeGoals.length}</Text></View>
      {goalProgress === null ? <Text style={s.detail}>Пока нет целей в работе</Text> : <>
        <View accessibilityRole="progressbar" accessibilityLabel={`Средний прогресс активных целей: ${goalProgress}%`} accessibilityValue={{ min: 0, max: 100, now: goalProgress }} style={s.track}><View style={[s.fill, { width: `${goalProgress}%` }]} /></View>
        <Text style={s.detail}>Средний прогресс · {goalProgress}%</Text>
      </>}
    </View>
  </View>;
}

const s = StyleSheet.create({
  root: { flex: 1, minWidth: 0, gap: 10 },
  heading: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 44, alignSelf: 'flex-start' },
  icon: { alignItems: 'center', backgroundColor: panelSoft, borderRadius: 13, height: 30, justifyContent: 'center', width: 30 },
  title: { color: text, fontSize: 16, fontWeight: '600', lineHeight: 21 },
  reply: { color: muted, fontSize: 13, lineHeight: 18, minHeight: 36 },
  actions: { gap: 6, marginTop: 'auto' },
  actionPrimary: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 14, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  actionPrimaryText: { color: activeText, fontSize: 12, fontWeight: '600' },
  actionSecondary: { alignItems: 'center', borderColor: line, borderRadius: 14, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  actionText: { color: text, fontSize: 12, fontWeight: '500' },
  date: { color: muted, fontSize: 12, lineHeight: 17 },
  journalExcerpt: { color: text, fontSize: 14, lineHeight: 20, minHeight: 60 },
  empty: { color: muted, flex: 1, fontSize: 13, lineHeight: 19 },
  openButton: { alignItems: 'center', alignSelf: 'flex-start', justifyContent: 'center', marginTop: 'auto', minHeight: 44, paddingHorizontal: 4 },
  openText: { color: accent, fontSize: 13, fontWeight: '600' },
  weekBlock: { borderBottomColor: line, borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: 9 },
  metricLabel: { color: muted, fontSize: 12, fontWeight: '500', lineHeight: 16 },
  weekValue: { color: text, fontSize: 27, fontWeight: '600', letterSpacing: -0.7, lineHeight: 32 },
  detail: { color: muted, fontSize: 12, lineHeight: 17 },
  goalBlock: { gap: 4 },
  goalHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  goalCount: { color: text, fontSize: 14, fontWeight: '600' },
  track: { backgroundColor: panelSoft, borderRadius: 99, height: 7, overflow: 'hidden' },
  fill: { backgroundColor: activeBg, borderRadius: 99, height: '100%' },
});
