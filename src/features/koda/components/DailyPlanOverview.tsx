import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ArrowUpRight, Clock3 } from 'lucide-react-native';
import { scoreWeek } from '../widgetDesktop';
import { weeklyScoreSummary } from '../dashboardMetrics';
import type { KodaDay } from '../types';
import { activeText, ink, inkText, lime, muted, panel, text } from '../theme';

export type DailyPlanOverviewProps = {
  date: string;
  status: 'proposal' | 'active' | 'completed';
  leadTitle: string;
  leadStep: string;
  items: { key: string; title: string; minutes: number; done: boolean }[];
  availableMinutes: number;
  plannedMinutes: number;
  totalCount: number;
  completedCount: number;
  score: number | null;
  hasConflicts: boolean;
  minimumLabel?: string;
  days: KodaDay[];
  selectedDate: string;
  selectedDateCount: number;
  timer: { remainingSeconds: number; status: string; mode: string };
  onOpenPlan: () => void;
  onPrimary: () => void;
  primaryLabel: string;
  primaryDisabled?: boolean;
  onEdit: () => void;
  onOpenCalendar: () => void;
  onOpenHistory: () => void;
  onOpenTimer: () => void;
  onDiscussDay: () => void;
  error?: string;
};

const GAP = 12;

export function DailyPlanOverview(props: DailyPlanOverviewProps) {
  const { width: windowWidth } = useWindowDimensions();
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const compact = windowWidth < 900;
  const weekly = weeklyScoreSummary(props.days, props.date);
  const width = measuredWidth || Math.max(0, windowWidth - 32);
  const double = Math.max(0, (width - GAP) / 2);
  const quarter = Math.max(0, (width - GAP * 3) / 4);
  const planWidth = compact ? width : Math.max(0, (width - GAP) * 2 / 3);
  const scoreWidth = compact ? double : Math.max(0, width - planWidth - GAP);
  const smallWidth = compact ? double : quarter;

  return (
    <View style={s.root} onLayout={event => setMeasuredWidth(value => value === event.nativeEvent.layout.width ? value : event.nativeEvent.layout.width)}>
      <View style={s.header}>
        <Text accessibilityRole="header" style={s.pageTitle}>Мой день</Text>
        <Text numberOfLines={1} style={s.date}>{formatDate(props.date)}</Text>
      </View>
      <View style={s.grid}>
        <View style={[s.card, s.plan, compact && s.planCompact, { width: planWidth }]}>
          <View style={[s.planTop, compact && s.planTopCompact]}>
            <View style={s.statusPill}>
              <View style={[s.statusDot, props.hasConflicts && s.conflictDot]} />
              <Text numberOfLines={1} style={s.statusText}>{getStatusText(props.status, props.hasConflicts)}</Text>
            </View>
            <Action label="Открыть полный план" title="Открыть план" onPress={props.onOpenPlan} tone="primary" />
          </View>
          <Text numberOfLines={1} style={[s.leadTitle, compact && s.leadTitleCompact]}>{props.leadTitle}</Text>
          <Text numberOfLines={1} style={[s.leadStep, compact && s.leadStepCompact]}>{props.leadStep}</Text>
          {!compact ? <View style={s.planMeta}>
            <Text numberOfLines={1} style={s.planMetaText}>
              {props.status === 'proposal'
                ? `${props.availableMinutes} мин доступно · ${props.plannedMinutes} мин в предложении`
                : `${props.completedCount} из ${props.totalCount} действий · ${props.availableMinutes} мин доступно`}
            </Text>
          </View> : null}
          <View style={s.tasks} accessibilityLabel="Ближайшие действия">
            {props.items.slice(0, compact ? 2 : 3).map(item => (
              <View key={item.key} style={[s.taskRow, compact && s.taskRowCompact]}>
                <View style={[s.checkbox, item.done && s.checkboxDone]}>
                  {item.done ? <Text style={s.checkMark}>✓</Text> : null}
                </View>
                <Text numberOfLines={1} style={[s.taskTitle, item.done && s.taskDone]}>{item.title}</Text>
                <Text style={s.taskMinutes}>{item.minutes} мин</Text>
              </View>
            ))}
            {!props.items.length ? <Text numberOfLines={2} style={s.emptyPlan}>Добавьте небольшой шаг или измените доступное время.</Text> : null}
          </View>
          <View style={s.planFoot}>
            <Text numberOfLines={1} style={s.minimum}>{props.hasConflicts ? 'Есть расхождения в плане' : props.minimumLabel || 'Можно идти в своём темпе'}</Text>
            <View style={s.planActions}>
              {props.status !== 'completed' ? <Action label="Подстроить план" title="Изменить" onPress={props.onEdit} tone="lime" /> : null}
              <Action label={props.primaryLabel} title={props.primaryLabel} onPress={props.onPrimary} disabled={props.primaryDisabled} tone="primary" />
            </View>
          </View>
          {props.error ? <Text accessibilityRole="alert" numberOfLines={2} style={s.error}>{props.error}</Text> : null}
        </View>

        <View style={[s.card, s.scoreCard, compact && s.scoreCardCompact, { width: scoreWidth }]}>
          <View style={s.cardHeader}>
            <Text style={s.darkTitle}>SCORE за 7 дней</Text>
            <Action label="Открыть историю SCORE" title="История" onPress={props.onOpenHistory} tone="dark" />
          </View>
          <View style={s.scoreValueRow}>
            <Text style={s.scoreValue}>{weekly.average === null ? '—' : weekly.average}</Text>
            {weekly.average !== null ? <Text style={s.scoreUnit}>/ 100</Text> : null}
          </View>
          <Text numberOfLines={1} style={s.darkMeta}>
            {weekly.completedCount
              ? `Среднее · дней: ${weekly.completedCount}`
              : 'После первого завершённого дня появится итог'}
          </Text>
          <ScoreMiniChart days={props.days} date={props.date} compact={compact} />
          {props.status === 'completed' ? <Text numberOfLines={1} style={s.darkCaption}>{props.score === null ? 'Сегодня · без оценки' : `Сегодня · ${Math.round(props.score)} SCORE`}</Text> : null}
        </View>

        <Pressable accessibilityRole="button" accessibilityLabel="Открыть календарь и дела выбранной даты" onPress={props.onOpenCalendar} style={({ pressed }) => [s.card, s.lightCard, s.calendarCard, { width: smallWidth }, pressed && s.pressedCard]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Календарь</Text>
            <ArrowUpRight size={18} color="#3e501b" aria-hidden />
          </View>
          <Text numberOfLines={1} style={s.calendarDate}>{formatDate(props.selectedDate)}</Text>
          <Text numberOfLines={1} style={s.cardMeta}>{props.selectedDateCount} {pluralCount(props.selectedDateCount)} в планнере</Text>
          <Text numberOfLines={1} style={s.cardMeta}>{props.selectedDate === props.date ? 'Сегодня' : 'Выбранная дата'}</Text>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Открыть общий таймер фокуса" onPress={props.onOpenTimer} style={({ pressed }) => [s.card, s.lightCard, s.focusCard, { width: smallWidth }, pressed && s.pressedCard]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Фокус</Text>
            <Clock3 size={18} color="#3e501b" aria-hidden />
          </View>
          <Text style={s.timerValue}>{formatTimer(props.timer.remainingSeconds)}</Text>
          <Text numberOfLines={1} style={s.cardMeta}>{timerStatus(props.timer.status, props.timer.mode)}</Text>
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Открыть историю завершённых дней" onPress={props.onOpenHistory} style={({ pressed }) => [s.card, s.lightCard, s.historyCard, { width: smallWidth }, pressed && s.pressedCard]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>История дня</Text>
            <ArrowUpRight size={18} color="#3e501b" aria-hidden />
          </View>
          <LatestDay days={props.days} />
        </Pressable>

        <Pressable accessibilityRole="button" accessibilityLabel="Обсудить день с помощником" onPress={props.onDiscussDay} style={({ pressed }) => [s.card, s.assistant, compact && s.assistantCompact, { width: compact ? width : quarter }, pressed && s.pressedCard]}>
          <View style={s.cardHeader}>
            <Text style={s.assistantTitle}>Помощник</Text>
            <ArrowUpRight size={18} color="#202810" aria-hidden />
          </View>
          <Text numberOfLines={1} style={s.assistantCopy}>Подстроить план под силы? Контекст дня попадёт в черновик.</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Action({ label, title, onPress, tone, disabled }: { label: string; title: string; onPress: () => void; tone: 'light' | 'lime' | 'dark' | 'primary'; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [s.action, tone === 'dark' && s.darkAction, tone === 'lime' && s.limeAction, tone === 'primary' && s.primaryAction, disabled && s.disabledAction, pressed && !disabled && s.pressedAction]}
    >
      <Text numberOfLines={1} style={[s.actionText, tone === 'dark' && s.darkActionText, tone === 'primary' && s.primaryActionText]}>{title}</Text>
    </Pressable>
  );
}

function ScoreMiniChart({ days, date, compact }: { days: KodaDay[]; date: string; compact: boolean }) {
  const rows = scoreWeek(days, date, 7);
  const points = rows.map((row, index) => ({ x: 8 + index * 31, y: 37 - Math.max(0, Math.min(100, row.value ?? 0)) * 0.27, row }));
  const segments: typeof points[] = [];
  for (const point of points) {
    if (point.row.value === null) continue;
    const previous = points[points.indexOf(point) - 1];
    if (!previous || previous.row.value === null) segments.push([]);
    segments.at(-1)?.push(point);
  }
  const description = points.some(point => point.row.value !== null)
    ? 'Завершённые дни текущей формулы за неделю. Пропущенные дни не представлены нулём.'
    : 'Пока нет завершённых дней с оценкой текущей формулы.';
  return (
    <View style={s.chartBox}>
      {points.some(point => point.row.value !== null) ? (
        <Svg width="100%" height={compact ? 24 : 45} viewBox="0 0 194 45" preserveAspectRatio="none" accessible accessibilityLabel={description}>
          {segments.map((segment, index) => {
            const path = segment.map((point, pointIndex) => { if(!pointIndex)return `M${point.x},${point.y}`; const before=segment[pointIndex-1], mid=(before.x+point.x)/2;return `C${mid},${before.y} ${mid},${point.y} ${point.x},${point.y}`; }).join(' ');
            return <Path key={index} d={path} fill="none" stroke={lime} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />;
          })}
          {points.filter(point => point.row.value !== null).map(point => <Circle key={point.row.date} cx={point.x} cy={point.y} r={point.row.date === date ? 3.5 : 2.5} fill={lime} />)}
        </Svg>
      ) : <Text numberOfLines={2} style={s.chartEmpty}>{description}</Text>}
    </View>
  );
}

function LatestDay({ days }: { days: KodaDay[] }) {
  const latest = [...days].filter(day => day.status === 'completed').sort((a, b) => b.localDate.localeCompare(a.localDate))[0];
  if (!latest) return <Text numberOfLines={2} style={s.historyEmpty}>Завершённые дни появятся здесь.</Text>;
  const value = latest.scoreVersion === 3 && typeof latest.totalScore === 'number' && Number.isFinite(latest.totalScore)
    ? `${Math.round(latest.totalScore)} SCORE`
    : latest.totalScore === null ? 'Без оценки' : 'Итог по прежней формуле';
  return (
    <View style={s.latestBlock}>
      <Text numberOfLines={1} style={s.latestValue}>{value}</Text>
      <Text numberOfLines={1} style={s.cardMeta}>{formatDate(latest.localDate)} · сохранённый итог</Text>
    </View>
  );
}

function getStatusText(status: DailyPlanOverviewProps['status'], conflict: boolean) {
  if (conflict) return 'Нужно сверить план';
  if (status === 'proposal') return 'Можно начать с малого';
  if (status === 'completed') return 'Итог сохранён';
  return 'План принят';
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatTimer(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}

function timerStatus(status: string, mode: string) {
  const isBreak = mode === 'break' || mode === 'longBreak';
  if (status === 'running') return isBreak ? 'Перерыв идёт' : 'Сессия идёт';
  if (status === 'paused') return 'На паузе';
  return isBreak ? 'Готов к перерыву' : 'Сессия не запущена';
}

function pluralCount(count: number, one = 'дело', few = 'дела', many = 'дел') {
  const mod100 = count % 100;
  if (mod100 >= 11 && mod100 <= 14) return many;
  const mod10 = count % 10;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

const s = StyleSheet.create({
  root: { width: '100%', maxWidth: 1040, alignSelf: 'center', minWidth: 0, gap: 10 },
  header: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  pageTitle: { color: text, fontSize: 24, lineHeight: 30, letterSpacing: -0.7, fontWeight: '600' },
  date: { color: muted, fontSize: 13, lineHeight: 18, flexShrink: 1, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, alignItems: 'stretch' },
  card: { minWidth: 0, overflow: 'hidden', borderRadius: 24 },
  plan: { minHeight: 206, padding: 16, backgroundColor: lime, justifyContent: 'space-between', gap: 4 },
  planCompact: { minHeight: 204, padding: 12, gap: 2 },
  planTop: { minHeight: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  planTopCompact: { minHeight: 34 },
  statusPill: { minHeight: 32, maxWidth: '62%', borderRadius: 99, borderWidth: 1, borderColor: '#87994a', paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 7 },
  statusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#42551e' },
  conflictDot: { backgroundColor: '#7b3d23' },
  statusText: { color: '#33451d', fontSize: 12, lineHeight: 16, fontWeight: '500', flexShrink: 1 },
  leadTitle: { color: '#202810', fontSize: 21, lineHeight: 25, letterSpacing: -0.6, fontWeight: '600', marginTop: 1 },
  leadTitleCompact: { fontSize: 19, lineHeight: 22, marginTop: 0 },
  leadStep: { color: '#33451d', fontSize: 14, lineHeight: 19, fontWeight: '500' },
  leadStepCompact: { fontSize: 13, lineHeight: 16 },
  planMeta: { minHeight: 20, justifyContent: 'center' },
  planMetaText: { color: '#394923', fontSize: 12, lineHeight: 16 },
  tasks: { minHeight: 0, flex: 1, justifyContent: 'center', paddingVertical: 2 },
  taskRow: { minHeight: 30, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#b6c95c' },
  taskRowCompact: { minHeight: 25, gap: 6 },
  checkbox: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#526426', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#526426' },
  checkMark: { color: '#f8f9f1', fontSize: 12, lineHeight: 14, fontWeight: '700' },
  taskTitle: { color: '#202810', fontSize: 13, lineHeight: 17, flex: 1, minWidth: 0 },
  taskDone: { color: '#465333' },
  taskMinutes: { color: '#394923', fontSize: 12, lineHeight: 16 },
  emptyPlan: { color: '#33451d', fontSize: 13, lineHeight: 18 },
  planFoot: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  minimum: { color: '#33451d', fontSize: 12, lineHeight: 16, flex: 1, minWidth: 0 },
  planActions: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  action: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' },
  actionText: { color: '#3e501b', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  limeAction: { backgroundColor: 'rgba(248,249,241,.42)' },
  primaryAction: { backgroundColor: ink, paddingHorizontal: 13 },
  primaryActionText: { color: inkText },
  darkAction: { backgroundColor: 'rgba(228,245,106,.12)' },
  darkActionText: { color: lime },
  disabledAction: { opacity: 0.48 },
  pressedAction: { opacity: 0.78 },
  error: { color: '#733b25', fontSize: 12, lineHeight: 16 },
  scoreCard: { minHeight: 206, backgroundColor: ink, padding: 16, justifyContent: 'space-between', gap: 3 },
  scoreCardCompact: { minHeight: 144, padding: 12, gap: 1 },
  cardHeader: { minHeight: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  darkTitle: { color: inkText, fontSize: 14, lineHeight: 19, fontWeight: '600', flexShrink: 1 },
  scoreValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 2 },
  scoreValue: { color: inkText, fontSize: 34, lineHeight: 40, fontWeight: '500', letterSpacing: -1.4 },
  scoreUnit: { color: '#d3ddca', fontSize: 12, lineHeight: 16 },
  darkMeta: { color: '#d3ddca', fontSize: 12, lineHeight: 16 },
  chartBox: { minHeight: 24, justifyContent: 'center', marginVertical: 1 },
  chartEmpty: { color: '#d3ddca', fontSize: 12, lineHeight: 16 },
  darkCaption: { color: '#d3ddca', fontSize: 12, lineHeight: 16, flex: 1, minWidth: 0 },
  lightCard: { minHeight: 150, padding: 14, backgroundColor: panel, justifyContent: 'space-between', gap: 4 },
  calendarCard: { minHeight: 130, padding: 12 },
  focusCard: { minHeight: 112, padding: 12 },
  historyCard: { minHeight: 112, padding: 12 },
  pressedCard: { opacity: 0.82 },
  cardTitle: { color: text, fontSize: 14, lineHeight: 19, fontWeight: '600', flexShrink: 1 },
  cardMeta: { color: muted, fontSize: 12, lineHeight: 17 },
  calendarDate: { color: text, fontSize: 18, lineHeight: 23, letterSpacing: -0.35, fontWeight: '500' },
  timerValue: { color: text, fontSize: 27, lineHeight: 32, fontWeight: '500', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  latestBlock: { justifyContent: 'space-between', flex: 1, gap: 2 },
  latestValue: { color: text, fontSize: 20, lineHeight: 26, fontWeight: '500', letterSpacing: -0.45 },
  historyEmpty: { color: muted, fontSize: 12, lineHeight: 17, marginTop: 4 },
  assistant: { minHeight: 150, padding: 14, backgroundColor: lime, justifyContent: 'space-between', gap: 4 },
  assistantCompact: { minHeight: 90, padding: 12, gap: 0 },
  assistantTitle: { color: '#202810', fontSize: 14, lineHeight: 19, fontWeight: '600' },
  assistantCopy: { color: '#33451d', fontSize: 13, lineHeight: 18 },
});

