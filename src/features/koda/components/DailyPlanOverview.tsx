import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { ArrowUpRight, Clock3 } from 'lucide-react-native';
import { scoreWeek } from '../widgetDesktop';
import { weeklyScoreSummary } from '../dashboardMetrics';
import type { KodaDay } from '../types';
import { ink, inkText, lime, muted, panel, text } from '../theme';

export type DailyPlanOverviewProps = {
  date: string;
  status: 'proposal' | 'active' | 'completed';
  leadTitle: string;
  leadStep: string;
  items: { key: string; title: string; minutes: number; done: boolean; canComplete?: boolean }[];
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
  onItemPress?: (key: string) => void;
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
        <View {...({dataSet:{petSurface:'day-plan'}} as any)} style={[s.card, s.plan, compact && s.planCompact, { width: planWidth }]}>
          <View style={[s.planTop, compact && s.planTopCompact]}>
            <View style={s.statusPill}>
              <View style={[s.statusDot, props.hasConflicts && s.conflictDot]} />
              <Text numberOfLines={1} style={s.statusText}>{getStatusText(props.status, props.hasConflicts)}</Text>
            </View>
            <Text numberOfLines={1} style={s.planMetaText}>
              {props.status === 'proposal'
                ? `${props.plannedMinutes} мин в плане`
                : props.status === 'active'
                  ? `${props.completedCount} из ${props.totalCount} выполнено`
                  : 'Результат дня'}
            </Text>
          </View>
          <View style={s.tasks} accessibilityLabel="Ближайшие действия">
            {props.items.map(item => {
              const locked = props.status === 'completed';
              const actionable = !!props.onItemPress && !locked && !(item.canComplete && item.done);
              const supportsCompletion = !!item.canComplete;
              return <Pressable key={item.key} accessibilityRole="button"
                accessibilityLabel={supportsCompletion ? `${item.done ? 'Выполнено' : 'Отметить выполненным'}: ${item.title}` : `Подробнее: ${item.title}`}
                accessibilityState={{ disabled: !actionable }} disabled={!actionable}
                onPress={() => props.onItemPress?.(item.key)}
                style={({ pressed }) => [s.taskRow, compact && s.taskRowCompact, pressed && actionable && s.taskPressed]}>
                {supportsCompletion ? <View style={[s.checkbox, item.done && s.checkboxDone]}>
                  {item.done ? <Text style={s.checkMark}>✓</Text> : null}
                </View> : null}
                <Text style={[s.taskTitle, item.done && s.taskDone]}>{item.title}</Text>
                {item.minutes > 0 ? <Text style={s.taskMinutes}>{item.minutes} мин</Text> : null}
                {!supportsCompletion && actionable ? <Text style={s.taskDetails}>Подробнее</Text> : null}
              </Pressable>;
            })}
            {!props.items.length ? <Text numberOfLines={2} style={s.emptyPlan}>Добавьте небольшой шаг или измените доступное время.</Text> : null}
          </View>
          <View style={s.planFoot}>
            <View style={s.planActions}>
              {props.status !== 'completed' ? <Action label="Изменить план" title="Изменить план" onPress={props.onEdit} tone="lime" /> : null}
              <Action label={props.primaryLabel} title={props.primaryLabel} onPress={props.onPrimary} disabled={props.primaryDisabled} tone="primary" />
            </View>
          </View>
          {props.error ? <Text accessibilityRole="alert" numberOfLines={2} style={s.error}>{props.error}</Text> : null}
        </View>

        <Pressable {...({dataSet:{petSurface:'day-score'}} as any)} accessibilityRole="button" accessibilityLabel="Открыть историю SCORE за 7 дней" onPress={props.onOpenHistory} style={({ pressed }) => [s.card, s.scoreCard, compact && s.scoreCardCompact, { width: scoreWidth }, pressed && s.pressedCard]}>
          <View style={s.cardHeader}>
            <Text style={s.darkTitle}>SCORE · 7 дней</Text>
            <ArrowUpRight size={18} color={lime} aria-hidden />
          </View>
          <View style={s.scoreValueRow}>
            <Text style={s.scoreValue}>{weekly.average === null ? '—' : weekly.average}</Text>
            {weekly.average !== null ? <Text style={s.scoreUnit}>/ 100</Text> : null}
          </View>
          <Text numberOfLines={1} style={s.darkMeta}>
            {weekly.completedCount
              ? `Среднее · дней: ${weekly.completedCount}`
              : 'Нет завершённых дней'}
          </Text>
          <ScoreMiniChart days={props.days} date={props.date} compact={compact} />
          {props.status === 'completed' ? <Text numberOfLines={1} style={s.darkCaption}>{props.score === null ? 'Сегодня · без оценки' : `Сегодня · ${Math.round(props.score)} SCORE`}</Text> : null}
        </Pressable>

        <Pressable {...({dataSet:{petSurface:'day-focus'}} as any)} accessibilityRole="button" accessibilityLabel="Открыть общий таймер фокуса" onPress={props.onOpenTimer} style={({ pressed }) => [s.card, s.lightCard, s.focusCard, { width: smallWidth }, pressed && s.pressedCard]}>
          <View style={s.cardHeader}>
            <Text style={s.cardTitle}>Фокус</Text>
            <Clock3 size={18} color="#3e501b" aria-hidden />
          </View>
          <Text style={s.timerValue}>{formatTimer(props.timer.remainingSeconds)}</Text>
          <Text numberOfLines={1} style={s.cardMeta}>{timerStatus(props.timer.status, props.timer.mode)}</Text>
        </Pressable>

        <Pressable {...({dataSet:{petSurface:'day-assistant'}} as any)} accessibilityRole="button" accessibilityLabel="Попросить помощника помочь с днём" onPress={props.onDiscussDay} style={({ pressed }) => [s.card, s.assistant, compact && s.assistantCompact, { width: compact ? width : quarter }, pressed && s.pressedCard]}>
          <View style={s.cardHeader}>
            <Text style={s.assistantTitle}>Помощь с днём</Text>
            <ArrowUpRight size={18} color="#202810" aria-hidden />
          </View>
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
      ) : <View accessibilityLabel={description} style={s.chartEmpty} />}
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

const s = StyleSheet.create({
  root: { width: '100%', maxWidth: 1040, alignSelf: 'center', minWidth: 0 },
  header: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  pageTitle: { color: text, fontSize: 22, lineHeight: 28, letterSpacing: -0.6, fontWeight: '600' },
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
  planMetaText: { color: '#394923', fontSize: 12, lineHeight: 16, flexShrink: 1, textAlign: 'right' },
  tasks: { minHeight: 0, flex: 1, justifyContent: 'center', paddingVertical: 2 },
  taskRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#b6c95c' },
  taskRowCompact: { minHeight: 44, gap: 6 },
  taskPressed: { opacity: 0.72 },
  checkbox: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: '#526426', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: '#526426' },
  checkMark: { color: '#f8f9f1', fontSize: 12, lineHeight: 14, fontWeight: '700' },
  taskTitle: { color: '#202810', fontSize: 13, lineHeight: 18, flex: 1, minWidth: 0, flexWrap: 'wrap' },
  taskDone: { color: '#465333' },
  taskMinutes: { color: '#394923', fontSize: 12, lineHeight: 16 },
  taskDetails: { color: '#3e501b', fontSize: 12, lineHeight: 16, fontWeight: '600' },
  emptyPlan: { color: '#33451d', fontSize: 13, lineHeight: 18 },
  planFoot: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
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
  chartEmpty: { minHeight: 24 },
  darkCaption: { color: '#d3ddca', fontSize: 12, lineHeight: 16, flex: 1, minWidth: 0 },
  lightCard: { minHeight: 150, padding: 14, backgroundColor: panel, justifyContent: 'space-between', gap: 4 },
  focusCard: { minHeight: 112, padding: 12 },
  pressedCard: { opacity: 0.82 },
  cardTitle: { color: text, fontSize: 14, lineHeight: 19, fontWeight: '600', flexShrink: 1 },
  cardMeta: { color: muted, fontSize: 12, lineHeight: 17 },
  timerValue: { color: text, fontSize: 27, lineHeight: 32, fontWeight: '500', letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  assistant: { minHeight: 60, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: lime, justifyContent: 'center', gap: 4 },
  assistantCompact: { minHeight: 60, padding: 8, gap: 0 },
  assistantTitle: { color: '#202810', fontSize: 14, lineHeight: 19, fontWeight: '600' },
});

