import { createElement, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions, type NativeSyntheticEvent, type LayoutChangeEvent, type NativeTouchEvent } from 'react-native';
import { ArrowLeft, ChevronLeft, ChevronRight, Plus } from 'lucide-react-native';
import type { PlannerItem } from '../types';
import { isProjectedPlannerItem } from '../plannerProjections';
import { accent, accentSoft, bg, line, muted, panel, text } from '../theme';

export type CalendarMode = 'day' | 'week' | 'month' | 'year';
type Props = {
  mode: CalendarMode;
  onModeChange: (mode: CalendarMode) => void;
  selectedDate: string;
  onSelectDate: (date: string) => void;
  items: PlannerItem[];
  onNewItem: (date: string, time: string) => void;
  onOpenItem: (item: PlannerItem) => void;
  onMoveItem?: (item: PlannerItem, date: string, time: string) => void;
  onOpenWorkspace?: () => void;
  syncText?: string;
  toolbarActions?: ReactNode;
};

const HOUR = 60;
const DAY_HOURS = 24;
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTH_NAMES = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const parseDate = (value: string) => {
  const parts = value.split('-').map(Number);
  return new Date(parts[0] || new Date().getFullYear(), (parts[1] || 1) - 1, parts[2] || 1);
};
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date: Date, days: number) => { const next = new Date(date); next.setDate(next.getDate() + days); return next; };
const mondayStart = (date: Date) => { const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()); start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); return start; };
const timeMinutes = (value: string) => {
  if (!value || !/^\d{1,2}:\d{2}$/.test(value)) return -1;
  const [h, m] = value.split(':').map(Number);
  return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : -1;
};
const dayTitle = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]}`;

export function PlannerCalendar({ mode, onModeChange, selectedDate, onSelectDate, items, onNewItem, onOpenItem, onMoveItem, onOpenWorkspace, syncText, toolbarActions }: Props) {
  const { width } = useWindowDimensions();
  const compact = width < 700;
  const selected = useMemo(() => parseDate(selectedDate), [selectedDate]);
  const [now, setNow] = useState(() => new Date());
  const today = dateKey(now);
  const [gridWidth, setGridWidth] = useState(0);
  const timelineRef = useRef<ScrollView>(null);
  const weekRef = useRef<ScrollView>(null);
  const weekHeaderRef = useRef<ScrollView>(null);
  const weekAllDayRef = useRef<ScrollView>(null);
  const weekColumnsRef = useRef<ScrollView>(null);
  const weekScrollOffset = useRef(0);
  const draggedItem = useRef<PlannerItem | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(id); }, []);
  useEffect(() => {
    if (mode !== 'day' && mode !== 'week') return;
    const hour = new Date().getHours();
    const target = hour >= 7 && hour < 21 ? Math.max(0, (hour - 1) * HOUR) : 8 * HOUR;
    const id = setTimeout(() => { timelineRef.current?.scrollTo({ y: target, animated: false }); weekRef.current?.scrollTo({ y: target, animated: false }); }, 80);
    return () => clearTimeout(id);
  }, [mode, selectedDate]);

  const visibleItems = useMemo(() => items.filter(item => !item.deletedAt), [items]);
  const weekStart = mondayStart(selected);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const monthStart = new Date(selected.getFullYear(), selected.getMonth(), 1);
  const monthGridStart = mondayStart(monthStart);
  const monthDates = Array.from({ length: 42 }, (_, i) => addDays(monthGridStart, i));
  const monthLabel = `${MONTH_NAMES[selected.getMonth()]} ${selected.getFullYear()}`;
  const title = mode === 'year' ? String(selected.getFullYear()) : mode === 'month' ? monthLabel : mode === 'week' ? `${dayTitle(weekDates[0])} — ${dayTitle(weekDates[6])} ${weekDates[0].getFullYear() === weekDates[6].getFullYear() ? weekDates[0].getFullYear() : `${weekDates[0].getFullYear()} — ${weekDates[6].getFullYear()}`}` : mode === 'day' ? `${dayTitle(selected)} ${selected.getFullYear()}` : monthLabel;

  const navigate = (direction: number) => {
    let next: Date;
    if (mode === 'year' || mode === 'month') {
      const targetYear = selected.getFullYear() + (mode === 'year' ? direction : 0);
      const targetMonth = selected.getMonth() + (mode === 'month' ? direction : 0);
      const first = new Date(targetYear, targetMonth, 1);
      next = new Date(targetYear, targetMonth, Math.min(selected.getDate(), new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()));
    } else next = addDays(selected, direction * (mode === 'week' ? 7 : 1));
    onSelectDate(dateKey(next));
  };
  const createAt = (date: Date, minute: number) => onNewItem(dateKey(date), `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
  const createAtNextSlot = () => {
    const current = new Date();
    const rounded = Math.ceil((current.getHours() * 60 + current.getMinutes()) / 30) * 30;
    createAt(rounded >= DAY_HOURS * HOUR ? addDays(selected, 1) : selected, rounded >= DAY_HOURS * HOUR ? 0 : rounded);
  };
  const currentMinute = now.getHours() * HOUR + now.getMinutes();
  const renderItem = (item: PlannerItem, compactCard = false) => {
    const pressable = <Pressable accessibilityRole="button" accessibilityLabel={`${item.time || 'Весь день'}: ${item.title}${item.done ? ', выполнено' : ''}${item.failed ? ', не выполнено' : ''}`} onPress={(event: any) => { event?.stopPropagation?.(); if (suppressClick.current) { suppressClick.current = false; return; } onOpenItem(item); }} style={({ pressed }) => [styles.event, compactCard && styles.monthEvent, item.done && styles.eventDone, item.failed && styles.eventFailed, pressed && styles.pressed]}>
      <Text style={[styles.eventTitle, compactCard && styles.monthEventTitle]} numberOfLines={1}>{item.title}</Text>{item.time ? <Text style={styles.eventTime} numberOfLines={1}>{item.time}</Text> : null}
    </Pressable>;
    if (Platform.OS !== 'web' || !onMoveItem || isProjectedPlannerItem(item) || compactCard) return pressable;
    return createElement('div' as any, {
      key: item.id,
      draggable: true,
      onDragStart: (event: any) => { draggedItem.current = item; event.dataTransfer?.setData?.('text/plain', item.id); },
      onDragEnd: () => { draggedItem.current = null; suppressClick.current = true; setTimeout(() => { suppressClick.current = false; }, 0); },
      style: { display: 'flex', flexDirection: 'column', minWidth: 0, width: '100%', height: '100%' },
    }, pressable);
  };

  const relativeSlotY = (event: any) => {
    const target = event?.currentTarget;
    const rect = target?.getBoundingClientRect?.();
    const native = event?.nativeEvent ?? event;
    if (rect) {
      if (Number.isFinite(native?.clientY)) return native.clientY - rect.top;
      const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
      if (Number.isFinite(native?.pageY)) return native.pageY - rect.top - scrollY;
    }
    return Number.isFinite(native?.locationY) ? native.locationY : 0;
  };
  const onSlotPress = (date: Date, hour: number, event: NativeSyntheticEvent<NativeTouchEvent>) => {
    createAt(date, hour * HOUR + (relativeSlotY(event) >= 30 ? 30 : 0));
  };
  const dayItems = (date: Date) => visibleItems.filter(item => item.date === dateKey(date)).sort((a, b) => timeMinutes(a.time || '') - timeMinutes(b.time || ''));
  const laneItems = (date: Date) => dayItems(date).filter(item => timeMinutes(item.time || '') >= 0).sort((a, b) => timeMinutes(a.time) - timeMinutes(b.time));
  const allDayItems = (date: Date) => dayItems(date).filter(item => timeMinutes(item.time || '') < 0);
  const placementsFor = (list: PlannerItem[]) => {
    const placements = new Map<string, { lane: number; count: number }>();
    const ordered = [...list].sort((a, b) => timeMinutes(a.time) - timeMinutes(b.time));
    let cluster: PlannerItem[] = [];
    let clusterEnd = -1;
    const flush = () => {
      if (!cluster.length) return;
      const laneEnds: number[] = [];
      const assigned: Array<{ item: PlannerItem; lane: number }> = [];
      cluster.forEach(item => {
        const start = timeMinutes(item.time);
        let lane = laneEnds.findIndex(end => end <= start);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = start + 43;
        assigned.push({ item, lane });
      });
      assigned.forEach(({ item, lane }) => placements.set(item.id, { lane, count: laneEnds.length }));
      cluster = [];
      clusterEnd = -1;
    };
    ordered.forEach(item => {
      const start = timeMinutes(item.time);
      if (cluster.length && start >= clusterEnd) flush();
      cluster.push(item);
      clusterEnd = Math.max(clusterEnd, start + 43);
    });
    flush();
    return placements;
  };
  const hourLabels = <View style={styles.timeLabels}>{Array.from({ length: DAY_HOURS }, (_, h) => <View key={h} style={[styles.hourLabel, { height: HOUR }]}><Text style={styles.hourText}>{`${String(h).padStart(2, '0')}:00`}</Text></View>)}</View>;
  const timeGrid = (date: Date, timelineWidth: number, list: PlannerItem[]) => <View style={{ width: timelineWidth, height: DAY_HOURS * HOUR, position: 'relative' }}>
    {Array.from({ length: DAY_HOURS }, (_, h) => {
      const pressable = <Pressable accessibilityRole="button" accessibilityLabel={`Создать задачу ${dateKey(date)} ${String(h).padStart(2, '0')}:00`} onPress={e => onSlotPress(date, h, e)} style={styles.hourSlot}><View pointerEvents="none" style={styles.halfHourLine} /></Pressable>;
      if (Platform.OS !== 'web') return <View key={h} style={{ position: 'absolute', left: 0, right: 0, top: h * HOUR, height: HOUR }}>{pressable}</View>;
      return createElement('div' as any, {
        key: h,
        onDragOver: (event: any) => event.preventDefault(),
        onDrop: (event: any) => {
          event.preventDefault();
          const dragged = draggedItem.current;
          if (dragged && !isProjectedPlannerItem(dragged) && onMoveItem) {
            const minute = h * HOUR + (relativeSlotY(event) >= 30 ? 30 : 0);
            onMoveItem(dragged, dateKey(date), `${String(Math.floor(minute / HOUR)).padStart(2, '0')}:${String(minute % HOUR).padStart(2, '0')}`);
          }
          draggedItem.current = null;
          suppressClick.current = true;
          setTimeout(() => { suppressClick.current = false; }, 150);
        },
        style: { display: 'flex', flexDirection: 'column', position: 'absolute', left: 0, right: 0, top: h * HOUR, height: HOUR },
      }, pressable);
    })}
    {(() => { const placements = placementsFor(list); return list.map(item => { const minute = timeMinutes(item.time); const { lane, count } = placements.get(item.id) ?? { lane: 0, count: 1 }; const inset = 3; return <View key={item.id} style={{ position: 'absolute', top: minute, left: `${(lane * 100) / count}%` as any, width: `${100 / count}%` as any, paddingHorizontal: count === 1 ? inset : 2, height: 43, zIndex: 2 }}>{renderItem(item)}</View>; }); })()}
    {dateKey(date) === dateKey(now) ? <View pointerEvents="none" style={[styles.nowLine, { top: currentMinute }]}><View style={styles.nowDot} /></View> : null}
  </View>;

  const onGridLayout = (event: LayoutChangeEvent) => setGridWidth(event.nativeEvent.layout.width);
  const syncWeekHorizontal = (from: 'header' | 'allDay' | 'columns', event: any) => {
    const x = event.nativeEvent.contentOffset.x;
    if (Math.abs(x - weekScrollOffset.current) < 1) return;
    weekScrollOffset.current = x;
    const source = from === 'header' ? weekHeaderRef : from === 'allDay' ? weekAllDayRef : weekColumnsRef;
    [weekHeaderRef, weekAllDayRef, weekColumnsRef].forEach(ref => { if (ref !== source) ref.current?.scrollTo({ x, animated: false }); });
  };
  const monthView = () => <View style={styles.monthWrap}>
    <View style={styles.weekdayHeaders}>{WEEKDAYS.map(day => <Text key={day} style={styles.weekdayText}>{day}</Text>)}</View>
    <View {...({ dataSet: { petSurface: 'planner-month' } } as any)} style={styles.monthGrid}>{monthDates.map(date => {
      const key = dateKey(date); const activeMonth = date.getMonth() === selected.getMonth(); const list = dayItems(date);
      return <Pressable key={key} accessibilityRole="button" accessibilityLabel={`${date.getDate()} ${MONTHS[date.getMonth()]}`} onPress={() => { onSelectDate(key); onModeChange('day'); }} style={[styles.monthCell, !activeMonth && styles.outsideCell, key === today && styles.todayCell]}>
        <View style={styles.monthDayHead}><Text style={[styles.monthDayNumber, key === today && styles.monthToday]}>{date.getDate()}</Text></View>
        {list.slice(0, compact ? 2 : 3).map(item => <View key={item.id}>{renderItem(item, true)}</View>)}
        {list.length > (compact ? 2 : 3) ? <Text style={styles.moreText}>+{list.length - (compact ? 2 : 3)} ещё</Text> : null}
      </Pressable>;
    })}</View>
  </View>;

  const yearView = () => <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGrid}>{Array.from({ length: 12 }, (_, month) => {
    const first = new Date(selected.getFullYear(), month, 1); const start = mondayStart(first); const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    return <View key={month} {...({ dataSet: { petSurface: `planner-year-month-${month}` } } as any)} style={[styles.miniMonth, compact && styles.miniMonthCompact]}><Pressable accessibilityRole="button" onPress={() => { const date = new Date(selected.getFullYear(), month, 1); onSelectDate(dateKey(date)); onModeChange('month'); }}><Text style={styles.miniMonthTitle}>{MONTH_NAMES[month]}</Text></Pressable><View style={styles.miniWeek}>{WEEKDAYS.map(d => <Text key={d} style={styles.miniWeekText}>{d[0]}</Text>)}</View><View style={styles.miniDays}>{days.map((date, i) => { const inMonth = date.getMonth() === month; const hasItems = visibleItems.some(item => item.date === dateKey(date)); return <Pressable key={i} disabled={!inMonth} accessibilityElementsHidden={!inMonth} importantForAccessibility={inMonth ? 'auto' : 'no-hide-descendants'} accessibilityRole={inMonth ? 'button' : undefined} accessibilityLabel={inMonth ? `${date.getDate()} ${MONTHS[month]}` : undefined} onPress={() => { onSelectDate(dateKey(date)); onModeChange('day'); }} style={styles.miniDay}><Text style={[styles.miniDayText, !inMonth && styles.miniOutside, dateKey(date) === today && styles.miniToday]}>{inMonth ? date.getDate() : ''}</Text>{inMonth && hasItems ? <View style={styles.miniEventDot} /> : null}</Pressable>; })}</View></View>;
  })}</ScrollView>;

  const dayTimeline = () => {
    const selectedList = laneItems(selected);
    const timelineW = Math.max(0, (gridWidth || width - 60) - 49);
    return <View {...({ dataSet: { petSurface: 'planner-day' } } as any)} style={styles.timelineArea} onLayout={onGridLayout}>
      <ScrollView ref={timelineRef} style={styles.timelineScroll} contentContainerStyle={{ minHeight: DAY_HOURS * HOUR }} showsVerticalScrollIndicator>
        <View style={styles.timelineRow}>{hourLabels}<View style={{ flex: 1, position: 'relative' }}>{timeGrid(selected, timelineW, selectedList)}</View></View>
      </ScrollView>
    </View>;
  };

  const weekTimeline = () => {
    const colWidth = compact ? 105 : Math.max(110, (width - 100) / 7);
    const all = weekDates.flatMap(date => allDayItems(date));
    return <View style={styles.weekArea}>
      <View style={styles.weekHeaderRow}><View style={styles.weekTimeCorner} /><ScrollView ref={weekHeaderRef} onScroll={e => syncWeekHorizontal('header', e)} scrollEventThrottle={16} horizontal showsHorizontalScrollIndicator={false} style={styles.weekHeaderScroll} contentContainerStyle={{ minWidth: colWidth * 7 }}><View style={{ flexDirection: 'row' }}>{weekDates.map(date => <Pressable key={dateKey(date)} accessibilityRole="button" onPress={() => { onSelectDate(dateKey(date)); onModeChange('day'); }} style={[styles.weekDayHead, { width: colWidth }]}><Text style={styles.weekHeaderName}>{WEEKDAYS[(date.getDay() + 6) % 7]}</Text><Text style={[styles.weekDateNumber, dateKey(date) === today && styles.weekDateToday]}>{date.getDate()}</Text></Pressable>)}</View></ScrollView></View>
      <View style={styles.allDayRow}><View style={styles.weekTimeCorner}><Text style={styles.allDayLabel}>весь день</Text></View><ScrollView ref={weekAllDayRef} onScroll={e => syncWeekHorizontal('allDay', e)} scrollEventThrottle={16} horizontal showsHorizontalScrollIndicator={false} style={styles.weekHeaderScroll} contentContainerStyle={{ minWidth: colWidth * 7 }}><View style={{ flexDirection: 'row' }}>{weekDates.map(date => <Pressable key={dateKey(date)} accessibilityRole="button" accessibilityLabel={`Создать задачу на ${date.getDate()} ${MONTHS[date.getMonth()]} без времени`} onPress={() => onNewItem(dateKey(date), '')} style={[styles.allDayCell, { width: colWidth }]}>{all.filter(i => i.date === dateKey(date)).map(item => renderItem(item, true))}</Pressable>)}</View></ScrollView></View>
      <View {...({ dataSet: { petSurface: 'planner-week' } } as any)} style={styles.weekGridRow}><ScrollView ref={weekRef} style={styles.weekTimeScroll} contentContainerStyle={{ height: DAY_HOURS * HOUR }}><View style={styles.weekTimelineRow}>{hourLabels}<ScrollView ref={weekColumnsRef} onScroll={e => syncWeekHorizontal('columns', e)} scrollEventThrottle={16} horizontal showsHorizontalScrollIndicator style={styles.weekColumnsScroll} contentContainerStyle={{ minWidth: colWidth * 7 }}><View style={{ flexDirection: 'row', height: DAY_HOURS * HOUR }}>{weekDates.map(date => <View key={dateKey(date)} style={[styles.weekColumn, { width: colWidth }]}>{timeGrid(date, colWidth, laneItems(date))}</View>)}</View></ScrollView></View></ScrollView></View>
    </View>;
  };

  return <View style={styles.root}>
    <View style={styles.toolbar}>
      {onOpenWorkspace ? <Pressable accessibilityRole="button" accessibilityLabel="На рабочий стол" onPress={onOpenWorkspace} style={styles.iconButton}><ArrowLeft size={17} color={muted} /></Pressable> : null}
      <View style={styles.navGroup}><Pressable accessibilityRole="button" accessibilityLabel="Предыдущий период" onPress={() => navigate(-1)} style={styles.navButton}><ChevronLeft size={18} color={text} /></Pressable><Pressable accessibilityRole="button" onPress={() => onSelectDate(today)} style={styles.todayButton}><Text style={styles.todayButtonText}>Сегодня</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Следующий период" onPress={() => navigate(1)} style={styles.navButton}><ChevronRight size={18} color={text} /></Pressable></View>
      <Text accessibilityRole="header" numberOfLines={1} style={styles.title}>{title}</Text>
      <View style={styles.modeGroup}>{(['day', 'week', 'month', 'year'] as CalendarMode[]).map((value, i) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: mode === value }} onPress={() => onModeChange(value)} style={[styles.modeButton, mode === value && styles.modeSelected, i === 0 && styles.modeLeft, i === 3 && styles.modeRight]}><Text style={[styles.modeText, mode === value && styles.modeTextSelected]}>{({ day: 'День', week: 'Неделя', month: 'Месяц', year: 'Год' })[value]}</Text></Pressable>)}</View>
      {toolbarActions ? <View style={styles.toolbarActions}>{toolbarActions}</View> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Новая задача" onPress={createAtNextSlot} style={styles.addButton}><Plus size={17} color="#fff" /></Pressable>
    </View>
    <View style={styles.calendarBody}>
      {mode === 'day' ? <><View style={styles.dateStrip}>{Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map(date => <Pressable key={dateKey(date)} accessibilityRole="button" accessibilityLabel={`${date.getDate()} ${MONTHS[date.getMonth()]}`} onPress={() => onSelectDate(dateKey(date))} style={styles.stripDate}><Text style={styles.stripWeekday}>{WEEKDAYS[(date.getDay() + 6) % 7]}</Text><Text style={[styles.stripNumber, dateKey(date) === selectedDate && styles.stripSelected]}>{date.getDate()}</Text></Pressable>)}</View><View style={styles.allDayRowDay}>{allDayItems(selected).map(item => renderItem(item, true))}</View>{dayTimeline()}</> : mode === 'week' ? weekTimeline() : mode === 'month' ? monthView() : yearView()}
    </View>
    {syncText ? <Text pointerEvents="none" numberOfLines={1} style={styles.syncFooter}>{syncText}</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: 0, backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 15, overflow: 'hidden' },
  calendarBody: { flex: 1, minHeight: 0 },
  toolbar: { minHeight: 58, paddingHorizontal: 12, paddingVertical: 5, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 9, borderBottomWidth: 1, borderColor: line, backgroundColor: bg },
  title: { fontSize: 18, fontWeight: '600', color: text, minWidth: 85, flexShrink: 1, marginLeft: 5 },
  syncFooter: { position: 'absolute', right: 10, bottom: 2, paddingHorizontal: 4, backgroundColor: panel, color: muted, fontSize: 10, textAlign: 'right' },
  navGroup: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  navButton: { width: 34, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  todayButton: { paddingHorizontal: 10, height: 32, borderRadius: 8, borderWidth: 1, borderColor: line, backgroundColor: panel, justifyContent: 'center' },
  todayButtonText: { color: text, fontSize: 12, fontWeight: '600' },
  iconButton: { width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  modeGroup: { flexDirection: 'row', alignItems: 'center', marginLeft: 'auto', borderWidth: 1, borderColor: line, borderRadius: 9, overflow: 'hidden' },
  toolbarActions: { flexDirection: 'row', alignItems: 'center' },
  modeButton: { minHeight: 32, paddingHorizontal: 10, justifyContent: 'center', borderRightWidth: 1, borderColor: line, backgroundColor: panel },
  modeLeft: {}, modeRight: { borderRightWidth: 0 }, modeSelected: { backgroundColor: accentSoft },
  modeText: { fontSize: 13, color: muted, fontWeight: '500' }, modeTextSelected: { color: accent, fontWeight: '700' },
  addButton: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: accent },
  dateStrip: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 8, borderBottomWidth: 1, borderColor: line, backgroundColor: panel },
  stripDate: { minWidth: 38, alignItems: 'center', gap: 4 }, stripWeekday: { fontSize: 10, color: muted }, stripNumber: { fontSize: 12, color: text, fontWeight: '600', minWidth: 24, height: 24, lineHeight: 24, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center', borderRadius: 12, overflow: 'hidden' }, stripSelected: { color: '#fff', backgroundColor: accent },
  allDayRowDay: { paddingHorizontal: 8, flexDirection: 'row', gap: 5, borderBottomWidth: 1, borderColor: line, minHeight: 0 },
  timelineArea: { flex: 1, minHeight: 0 }, timelineScroll: { flex: 1 }, timelineRow: { flexDirection: 'row', minHeight: DAY_HOURS * HOUR }, timeLabels: { width: 49, backgroundColor: panel }, hourLabel: { height: HOUR, borderTopWidth: StyleSheet.hairlineWidth, borderColor: line, alignItems: 'flex-end', paddingRight: 7, paddingTop: 2 }, hourText: { fontSize: 11, color: muted }, hourSlot: { flex: 1, borderTopWidth: StyleSheet.hairlineWidth, borderColor: line }, halfHourLine: { position: 'absolute', top: 30, left: 0, right: 0, borderTopWidth: StyleSheet.hairlineWidth, borderColor: line, opacity: .48 },
  event: { flex: 1, minWidth: 0, width: '100%', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: accentSoft, borderLeftWidth: 3, borderColor: accent, overflow: 'hidden' }, eventDone: { opacity: .52 }, eventFailed: { backgroundColor: 'rgba(196,72,62,.12)', borderColor: '#c4483e' }, eventTime: { fontSize: 11, color: accent, lineHeight: 13, fontWeight: '600' }, eventTitle: { fontSize: 13, color: text, lineHeight: 16, fontWeight: '600' }, monthEvent: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 15, paddingVertical: 1, paddingHorizontal: 4, borderRadius: 3, borderLeftWidth: 2 }, monthEventTitle: { fontSize: 10, lineHeight: 12, flexShrink: 1 }, pressed: { opacity: .72 },
  nowLine: { position: 'absolute', left: 0, right: 0, borderTopWidth: 2, borderColor: '#d85c52', zIndex: 4 }, nowDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#d85c52', position: 'absolute', left: -1, top: -4 },
  weekArea: { flex: 1, minHeight: 0 }, weekHeaderRow: { height: 52, flexDirection: 'row', borderBottomWidth: 1, borderColor: line }, weekTimeCorner: { width: 49, alignItems: 'center', justifyContent: 'center' }, weekHeaderScroll: { flex: 1 }, weekDayHead: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: line }, weekHeaderName: { flex: 0, color: muted, fontSize: 12, fontWeight: '600' }, weekDateNumber: { fontSize: 17, color: text, fontWeight: '600' }, weekDateToday: { color: '#fff', backgroundColor: accent, borderRadius: 12, overflow: 'hidden', width: 24, height: 24, lineHeight: 24, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center' }, allDayRow: { minHeight: 37, maxHeight: 80, flexDirection: 'row', borderBottomWidth: 1, borderColor: line }, allDayLabel: { fontSize: 8, color: muted }, allDayCell: { padding: 3, gap: 2, minHeight: 37, borderLeftWidth: StyleSheet.hairlineWidth, borderColor: line }, weekGridRow: { flex: 1, minHeight: 0 }, weekTimeScroll: { flex: 1 }, weekTimelineRow: { flexDirection: 'row', height: DAY_HOURS * HOUR }, weekColumnsScroll: { flex: 1 }, weekColumn: { borderLeftWidth: StyleSheet.hairlineWidth, borderColor: line },
  monthWrap: { flex: 1, minHeight: 0 }, weekdayHeaders: { height: 34, flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: line }, weekdayText: { color: muted, fontSize: 10, fontWeight: '600', textAlign: 'center', flex: 1 }, monthGrid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap' }, monthCell: { width: `${100 / 7}%` as any, height: `${100 / 6}%` as any, borderRightWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: line, padding: 4, gap: 2, backgroundColor: panel }, outsideCell: { backgroundColor: bg, opacity: .62 }, todayCell: { backgroundColor: accentSoft }, monthDayHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 1 }, monthDayNumber: { color: text, fontSize: 11, fontWeight: '500' }, monthToday: { color: '#fff', backgroundColor: accent, borderRadius: 12, width: 22, height: 22, lineHeight: 22, includeFontPadding: false, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden' }, todayNumber: { color: accent, fontWeight: '800' }, todayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: accent }, moreText: { fontSize: 8, color: muted, paddingLeft: 4 },
  yearScroll: { flex: 1 }, yearGrid: { padding: 16, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 15 }, miniMonth: { width: '31%' as any, minWidth: 190, maxWidth: 300, padding: 8 }, miniMonthCompact: { width: '47%' as any, minWidth: 0, maxWidth: '47%' as any }, miniMonthTitle: { fontSize: 14, color: text, fontWeight: '600', marginBottom: 7 }, miniWeek: { flexDirection: 'row' }, miniWeekText: { flex: 1, textAlign: 'center', color: muted, fontSize: 9 }, miniDays: { flexDirection: 'row', flexWrap: 'wrap' }, miniDay: { width: `${100 / 7}%` as any, height: 26, alignItems: 'center', justifyContent: 'center' }, miniDayText: { fontSize: 10, color: text }, miniOutside: { color: 'transparent' }, miniToday: { color: '#fff', overflow: 'hidden', borderRadius: 9, backgroundColor: accent, paddingHorizontal: 4 }, miniEventDot: { position: 'absolute', bottom: 1, width: 3, height: 3, borderRadius: 2, backgroundColor: accent },
});
