import { useEffect, useMemo, useRef, useState } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Animated, Easing, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, Grid2X2, List, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import type { Goal, PlannerItem } from '../types';
import { getGoalDayEntries } from '../kodaScore';
import { upsertRoutineLog } from '../goalLogic';
import { isProjectedPlannerItem } from '../plannerProjections';
import { RoutineValueSheet, SectionTitle, type RoutineValueEditor } from '../components';
import { accent, faint, muted, panel, text } from '../theme';
import { styles } from '../styles';
import { getDaysInMonth, normalizeTimeValue, todayDateKey, uid } from '../utils';

const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const monthTitleNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const monthPickerNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const weekDays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
type PlannerViewMode = 'day' | 'month' | 'goals';
type MonthCellLayout = { date: string; height: number; width: number; x: number; y: number };
type MonthDragState = { itemId: string; x: number; y: number } | null;
type MonthTouchPoint = { clientX?: number; clientY?: number; pageX?: number; pageY?: number };
type MonthPointerEvent = {
  button?: number;
  buttons?: number;
  clientX?: number;
  clientY?: number;
  deltaY?: number;
  pageX?: number;
  pageY?: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
  touches?: ArrayLike<MonthTouchPoint>;
  changedTouches?: ArrayLike<MonthTouchPoint>;
};
type DesktopWheelEvent = {
  currentTarget?: unknown;
  nativeEvent?: {
    currentTarget?: unknown;
    deltaMode?: number;
    deltaY?: number;
    preventDefault?: () => void;
    stopPropagation?: () => void;
  };
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

export function PlannerScreen({
  goals,
  isDesktop = false,
  items,
  onAddItem,
  onDeleteItem,
  onGoalsChange,
  onMoveProjectedItemDate,
  onToggleProjectedItem,
  onToggleItem,
  onToggleSubtask,
  onUpdateItem,
  projectItems = [],
}: {
  goals: Goal[];
  isDesktop?: boolean;
  items: PlannerItem[];
  onAddItem: (item: Pick<PlannerItem, 'date' | 'time' | 'title'> & { subtasks?: PlannerItem['subtasks'] }) => void;
  onDeleteItem: (id: string) => void;
  onGoalsChange: (updater: (goals: Goal[]) => Goal[]) => void;
  onMoveProjectedItemDate?: (item: PlannerItem, date: string) => void;
  onToggleProjectedItem?: (item: PlannerItem) => void;
  onToggleItem: (id: string) => void;
  onToggleSubtask: (itemId: string, subtaskId: string) => void;
  onUpdateItem: (id: string, item: Pick<PlannerItem, 'date' | 'time' | 'title'> & { subtasks?: PlannerItem['subtasks'] }) => void;
  projectItems?: PlannerItem[];
}) {
  const [selectedDate, setSelectedDate] = useState(todayDateKey());
  const [viewMode, setViewMode] = useState<PlannerViewMode>('day');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTop, setPickerTop] = useState(138);
  const [visibleMonth, setVisibleMonth] = useState(() => dateFromKey(todayDateKey()));
  const [newPickerOpen, setNewPickerOpen] = useState(false);
  const [newPickerTop, setNewPickerTop] = useState(0);
  const [newVisibleMonth, setNewVisibleMonth] = useState(() => dateFromKey(todayDateKey()));
  const [newDate, setNewDate] = useState(todayDateKey());
  const [newTime, setNewTime] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newSubtasks, setNewSubtasks] = useState<NonNullable<PlannerItem['subtasks']>>([]);
  const [newSubtaskDraft, setNewSubtaskDraft] = useState('');
  const [newSubtaskOpen, setNewSubtaskOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PlannerItem | null>(null);
  const [editDate, setEditDate] = useState(todayDateKey());
  const [editTime, setEditTime] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editSubtasks, setEditSubtasks] = useState<NonNullable<PlannerItem['subtasks']>>([]);
  const [editSubtaskDraft, setEditSubtaskDraft] = useState('');
  const [editVisibleMonth, setEditVisibleMonth] = useState(() => dateFromKey(todayDateKey()));
  const [editPickerOpen, setEditPickerOpen] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<PlannerItem | null>(null);
  const [expandedSubtaskItemIds, setExpandedSubtaskItemIds] = useState<string[]>([]);
  const [goalRoutineEditor, setGoalRoutineEditor] = useState<RoutineValueEditor | null>(null);
  const [goalRoutineDraft, setGoalRoutineDraft] = useState('');
  const newTaskInputRef = useRef<TextInput | null>(null);
  const displayItems = useMemo(() => [...items, ...projectItems], [items, projectItems]);
  const selectedItems = useMemo(
    () => displayItems.filter((item) => item.date === selectedDate && !item.deletedAt).sort(comparePlannerItems),
    [displayItems, selectedDate],
  );
  const selectedTimedItems = selectedItems.filter((item) => Boolean(item.time));
  const selectedAllDayItems = selectedItems.filter((item) => !item.time);
  const selectedOpenCount = selectedItems.filter((item) => !item.done).length;
  const selectedDoneCount = selectedItems.length - selectedOpenCount;
  const selectedProgress = selectedItems.length ? Math.round((selectedDoneCount / selectedItems.length) * 100) : 0;
  const parsedNewItem = useMemo(() => parseQuickTaskInput(newTitle, newDate, newTime), [newDate, newTime, newTitle]);
  const canAddItem = Boolean(parsedNewItem);
  const canSaveEdit = canSubmitPlannerItem(editDate, editTime, editTitle);
  const goalGroups = useMemo(
    () => goals
      .map((goal) => ({ goal, entries: getGoalDayEntries(goal, selectedDate) }))
      .filter((group) => group.entries.length > 0),
    [goals, selectedDate],
  );

  useEffect(() => {
    if (!isDesktop || viewMode !== 'month' || typeof window === 'undefined' || typeof document === 'undefined') return;

    function collectScrollCandidates(start: EventTarget | null) {
      const candidates: HTMLElement[] = [];
      let node = start instanceof Element ? start : null;

      while (node) {
        const element = node as HTMLElement;
        if (element.scrollHeight > element.clientHeight + 1) candidates.push(element);
        node = node.parentElement;
      }

      [
        document.getElementById('planner-scroll-root'),
        document.getElementById('koda-desktop-workspace'),
        document.scrollingElement,
        document.documentElement,
        document.body,
      ].forEach((element) => {
        if (element instanceof HTMLElement && !candidates.includes(element)) candidates.push(element);
      });

      return candidates;
    }

    function handleNativeWheel(event: WheelEvent) {
      const candidates = collectScrollCandidates(event.target);
      const deltaUnit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1;
      const delta = event.deltaY * deltaUnit;
      let didScroll = false;

      candidates.forEach((element) => {
        const before = element.scrollTop;
        element.scrollTop += delta;
        if (element.scrollTop !== before) didScroll = true;
      });

      if (didScroll) {
        event.preventDefault();
        event.stopImmediatePropagation();
        event.stopPropagation();
      }
    }

    window.addEventListener('wheel', handleNativeWheel, { capture: true, passive: false });
    document.addEventListener('wheel', handleNativeWheel, { capture: true, passive: false });
    return () => {
      window.removeEventListener('wheel', handleNativeWheel, { capture: true });
      document.removeEventListener('wheel', handleNativeWheel, { capture: true });
    };
  }, [isDesktop, viewMode]);

  function setGoalRoutineValue(goalId: string, routineId: string, value: number) {
    onGoalsChange((items) => items.map((goal) => (
      goal.id === goalId ? { ...goal, routineLogs: upsertRoutineLog(goal.routineLogs, routineId, selectedDate, value) } : goal
    )));
  }

  function openGoalRoutineEditor(editor: RoutineValueEditor) {
    setGoalRoutineEditor(editor);
    setGoalRoutineDraft(String(editor.currentValue));
  }

  function saveGoalRoutineEditor() {
    if (!goalRoutineEditor) return;
    const value = Number(goalRoutineDraft);
    if (!Number.isFinite(value) || value < 0) return;

    setGoalRoutineValue(goalRoutineEditor.goalId, goalRoutineEditor.routineId, Math.round(value));
    setGoalRoutineEditor(null);
    setGoalRoutineDraft('');
  }

  function handleDesktopMonthWheel(event: DesktopWheelEvent) {
    if (!isDesktop || viewMode !== 'month') return;
    const nativeEvent = event.nativeEvent ?? {};
    const rawDelta = Number(nativeEvent.deltaY ?? 0);
    if (!rawDelta) return;

    const delta = rawDelta * (nativeEvent.deltaMode === 1 ? 16 : 1);
    const scrollNode = typeof document !== 'undefined' ? document.getElementById('planner-scroll-root') : null;
    const candidates = [nativeEvent.currentTarget, event.currentTarget, scrollNode];
    const target = candidates.find((item): item is HTMLElement => Boolean(item && typeof (item as HTMLElement).scrollTop === 'number'));
    if (!target) return;

    target.scrollTop += delta;
    nativeEvent.preventDefault?.();
    nativeEvent.stopPropagation?.();
    if ('preventDefault' in event) event.preventDefault?.();
    if ('stopPropagation' in event) event.stopPropagation?.();
  }

  function toggleGoalAction(goalId: string, actionId: string) {
    onGoalsChange((items) => items.map((goal) => (
      goal.id === goalId
        ? {
            ...goal,
            actions: goal.actions.map((action) =>
              action.id === actionId
                ? { ...action, status: action.status === 'completed' ? 'pending' : 'completed', completedAt: action.status === 'completed' ? null : new Date().toISOString() }
                : action,
            ),
          }
        : goal
    )));
  }

  function selectDate(dateKeyValue: string) {
    setSelectedDate(dateKeyValue);
    setNewDate(dateKeyValue);
    setPickerOpen(false);
  }

  function shiftSelectedDate(delta: number) {
    const nextDate = addDaysToKey(selectedDate, delta);
    setSelectedDate(nextDate);
    setNewDate(nextDate);
    setVisibleMonth(dateFromKey(nextDate));
  }

  function selectToday() {
    const today = todayDateKey();
    setSelectedDate(today);
    setNewDate(today);
    setVisibleMonth(dateFromKey(today));
  }

  function moveMonth(delta: number) {
    setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
  }

  function moveNewMonth(delta: number) {
    setNewVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
  }

  function moveVisibleMonth(delta: number) {
    setVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1));
  }

  function addItem() {
    const parsedItem = parseQuickTaskInput(newTitle, newDate, newTime);

    if (!parsedItem) return;

    onAddItem({ ...parsedItem, subtasks: newSubtasks });
    setSelectedDate(parsedItem.date);
    setVisibleMonth(dateFromKey(parsedItem.date));
    setNewDate(parsedItem.date);
    setNewTitle('');
    setNewSubtasks([]);
    setNewSubtaskDraft('');
    setNewSubtaskOpen(false);
    setNewTime('');
  }

  function addNewSubtask() {
    const title = newSubtaskDraft.trim();
    if (!title) return;

    setNewSubtasks((subtasks) => [...subtasks, { id: uid('subtask'), title, done: false }]);
    setNewSubtaskDraft('');
    setNewSubtaskOpen(true);
  }

  function removeNewSubtask(id: string) {
    setNewSubtasks((subtasks) => subtasks.filter((subtask) => subtask.id !== id));
  }

  function openEditItem(item: PlannerItem) {
    setEditingItem(item);
    setEditDate(item.date);
    setEditTime(item.time);
    setEditTitle(item.title);
    setEditSubtasks(item.subtasks ?? []);
    setEditSubtaskDraft('');
    setEditVisibleMonth(dateFromKey(item.date));
    setEditPickerOpen(false);
  }

  function closeEditItem() {
    setEditingItem(null);
    setEditPickerOpen(false);
  }

  function saveEditItem() {
    if (!editingItem) return;

    const trimmedTime = editTime.trim();
    const normalizedTime = trimmedTime ? normalizeTimeValue(trimmedTime) : '';
    const normalizedDate = normalizeDateKey(editDate);
    const title = editTitle.trim();

    if (!normalizedDate || normalizedTime === null || !title) return;

    onUpdateItem(editingItem.id, { date: normalizedDate, time: normalizedTime, title, subtasks: editSubtasks });
    setSelectedDate(normalizedDate);
    setVisibleMonth(dateFromKey(normalizedDate));
    closeEditItem();
  }

  function addEditSubtask() {
    const title = editSubtaskDraft.trim();
    if (!title) return;

    setEditSubtasks((subtasks) => [...subtasks, { id: uid('subtask'), title, done: false }]);
    setEditSubtaskDraft('');
  }

  function removeEditSubtask(id: string) {
    setEditSubtasks((subtasks) => subtasks.filter((subtask) => subtask.id !== id));
  }

  function toggleSubtasksVisible(id: string) {
    setExpandedSubtaskItemIds((ids) => (ids.includes(id) ? ids.filter((itemId) => itemId !== id) : [...ids, id]));
  }

  function confirmDeleteItem() {
    if (!deleteCandidate) return;
    onDeleteItem(deleteCandidate.id);
    setDeleteCandidate(null);
  }

  function movePlannerItemToDate(itemId: string, date: string) {
    const item = displayItems.find((plannerItem) => plannerItem.id === itemId);
    if (!item || item.date === date) return;

    if (isProjectedPlannerItem(item)) {
      onMoveProjectedItemDate?.(item, date);
      setSelectedDate(date);
      setNewDate(date);
      setVisibleMonth(dateFromKey(date));
      return;
    }

    onUpdateItem(item.id, {
      date,
      time: item.time,
      title: item.title,
      subtasks: item.subtasks ?? [],
    });
    setSelectedDate(date);
    setNewDate(date);
    setVisibleMonth(dateFromKey(date));
  }

  function updatePickerPosition(event: LayoutChangeEvent) {
    const { height, y } = event.nativeEvent.layout;
    setPickerTop(y + height + 6);
  }

  function updateNewPickerPosition(event: LayoutChangeEvent) {
    const { height, y } = event.nativeEvent.layout;
    setNewPickerTop(y + height + 6);
  }

  function focusNewTask() {
    setViewMode('day');
    setNewDate(selectedDate);
    requestAnimationFrame(() => newTaskInputRef.current?.focus());
  }

  function renderPlannerItem(item: PlannerItem, index: number, sourceItems: PlannerItem[]) {
    const projected = isProjectedPlannerItem(item);
    const toggleItem = () => {
      if (projected) {
        onToggleProjectedItem?.(item);
        return;
      }
      onToggleItem(item.id);
    };

    return (
      <View
        key={item.id}
        style={[
          styles.plannerTimelineItem,
          isDesktop && styles.plannerTimelineItemDesktop,
          isDesktop && index === sourceItems.length - 1 && styles.plannerTimelineItemDesktopLast,
          item.done && styles.plannerTimelineRowDone,
          item.done && index > 0 && !sourceItems[index - 1].done && styles.plannerCompletedFirstRow,
        ]}
      >
        <View style={styles.plannerTimelineRowInner}>
          <View style={styles.plannerTimelineCheckArea}>
            <Text style={styles.plannerTime}>{item.time || 'День'}</Text>
            {item.subtasks?.length ? (
              <Pressable onPress={() => toggleSubtasksVisible(item.id)} style={styles.plannerSubtaskArrowButton}>
                {expandedSubtaskItemIds.includes(item.id) ? (
                  <ChevronDown color={accent} size={14} />
                ) : (
                  <ChevronRight color={muted} size={14} />
                )}
              </Pressable>
            ) : (
              <View style={styles.plannerSubtaskArrowSpacer} />
            )}
            <Pressable onPress={toggleItem} style={styles.plannerStatusMark}>
              <Check color={item.done ? accent : muted} size={17} strokeWidth={2.4} />
            </Pressable>
          </View>
          <Pressable onPress={toggleItem} style={styles.plannerTitleArea}>
            <Text style={[styles.plannerTitle, item.done && styles.doneText]}>{item.title}</Text>
            {projected ? <Text style={styles.rowMeta}>Проект</Text> : null}
          </Pressable>
          {!projected ? (
            <View style={styles.plannerRowActions}>
              <Pressable onPress={() => openEditItem(item)} style={styles.plannerEditButton}>
                <Pencil color={muted} size={14} />
              </Pressable>
              <Pressable onPress={() => setDeleteCandidate(item)} style={styles.plannerEditButton}>
                <Trash2 color={muted} size={14} />
              </Pressable>
            </View>
          ) : null}
        </View>
        {item.subtasks?.length && expandedSubtaskItemIds.includes(item.id) ? (
          <View style={styles.plannerSubtaskList}>
            {item.subtasks.map((subtask) => (
              <Pressable key={subtask.id} onPress={() => onToggleSubtask(item.id, subtask.id)} style={styles.plannerSubtaskRow}>
                <View style={styles.plannerSubtaskBranch} />
                <View style={styles.plannerSubtaskStatusMark}>
                  <Check color={subtask.done ? accent : muted} size={13} strokeWidth={2.3} />
                </View>
                <Text style={[styles.plannerSubtaskText, subtask.done && styles.doneText]}>{subtask.title}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>
    );
  }

  const plannerDayAside = isDesktop ? (
    <View style={styles.desktopAside} testID="desktop-right-column">
      <View style={styles.desktopAsideCard}>
        <Text style={styles.desktopAsideTitle}>Быстрые действия</Text>
        <Pressable onPress={() => setNewTitle('Новая задача на сегодня')} style={styles.desktopAsideRow}>
          <Plus color={accent} size={16} />
          <Text style={styles.desktopAsideRowText}>Новая задача на сегодня</Text>
        </Pressable>
        <Pressable onPress={() => setNewTime('')} style={styles.desktopAsideRow}>
          <Calendar color={accent} size={15} />
          <Text style={styles.desktopAsideRowText}>Задача без времени</Text>
        </Pressable>
        <Pressable onPress={() => setNewSubtaskOpen(true)} style={styles.desktopAsideRow}>
          <List color={muted} size={15} />
          <Text style={styles.desktopAsideRowText}>Добавить подзадачу</Text>
        </Pressable>
      </View>
      <View style={styles.desktopAsideCard}>
        <Text style={styles.desktopAsideTitle}>Фокус дня</Text>
        <View style={styles.desktopFocusRow}>
          <View style={styles.desktopFocusRing}>
            <Text style={styles.desktopFocusNumber}>{selectedDoneCount}</Text>
          </View>
          <Text style={styles.desktopAsideMeta}>из {selectedItems.length} дел выполнено</Text>
        </View>
      </View>
      <View style={styles.desktopAsideCard}>
        <Text style={styles.desktopAsideTitle}>Ближайшие задачи</Text>
        {selectedItems.filter((item) => !item.done).slice(0, 4).map((item) => (
          <View key={`aside-${item.id}`} style={styles.desktopAsideRow}>
            <Text style={styles.plannerTime}>{item.time || 'День'}</Text>
            <Text numberOfLines={1} style={styles.desktopAsideRowText}>{item.title}</Text>
          </View>
        ))}
        {selectedItems.every((item) => item.done) ? <Text style={styles.desktopAsideMeta}>На выбранную дату всё спокойно.</Text> : null}
      </View>
      <View style={styles.desktopAsideCard}>
        <Text style={styles.desktopAsideTitle}>Прогресс дня</Text>
        <View style={styles.desktopProgressRow}>
          <Text style={styles.desktopProgressPercent}>{selectedProgress}%</Text>
          <View style={styles.desktopProgressTrack}>
            <View style={[styles.desktopProgressFill, { width: `${selectedProgress}%` }]} />
          </View>
        </View>
        <Text style={styles.desktopAsideMeta}>{selectedDoneCount} из {selectedItems.length} дел завершено</Text>
      </View>
    </View>
  ) : null;

  const plannerDateSelector = (
    <View style={[styles.plannerDateBlock, isDesktop && styles.plannerDesktopDateBlock]}>
      <View style={styles.plannerDateNavRow}>
        <Pressable onPress={() => shiftSelectedDate(-1)} style={[styles.plannerDateArrowButton, isDesktop && styles.plannerDesktopDateArrowButton]}>
          <ChevronLeft color={muted} size={18} />
        </Pressable>
        <Pressable onLayout={updatePickerPosition} onPress={() => setPickerOpen((open) => !open)} style={[styles.plannerDateButton, isDesktop && styles.plannerDesktopDateButton]}>
          <Calendar color={accent} size={16} />
          <Text style={styles.plannerDateText}>{formatFullDate(selectedDate)}</Text>
        </Pressable>
        <Pressable onPress={() => shiftSelectedDate(1)} style={[styles.plannerDateArrowButton, isDesktop && styles.plannerDesktopDateArrowButton]}>
          <ChevronRight color={muted} size={18} />
        </Pressable>
      </View>
      <View style={styles.plannerQuickDateRow}>
        <Pressable onPress={selectToday} style={[styles.plannerTodayButton, isDesktop && styles.plannerDesktopTodayButton, selectedDate === todayDateKey() && styles.plannerTodayButtonActive]}>
          <Text style={[styles.plannerTodayText, selectedDate === todayDateKey() && styles.plannerTodayTextActive]}>Сегодня</Text>
        </Pressable>
        <Text style={styles.rowMeta}>
          {selectedOpenCount ? `${selectedOpenCount} впереди` : 'Все спокойно'}
          {selectedDoneCount ? ` - ${selectedDoneCount} готово` : ''}
        </Text>
      </View>
    </View>
  );

  const plannerModeControl = (
    <View style={styles.plannerModeToggle}>
      <Pressable onPress={() => setViewMode('day')} style={[styles.plannerModeButton, viewMode === 'day' && styles.plannerModeButtonActive]}>
        <List color={viewMode === 'day' ? panel : muted} size={15} />
        <Text style={[styles.plannerModeText, viewMode === 'day' && styles.plannerModeTextActive]}>День</Text>
      </Pressable>
      <Pressable onPress={() => setViewMode('month')} style={[styles.plannerModeButton, viewMode === 'month' && styles.plannerModeButtonActive]}>
        <Grid2X2 color={viewMode === 'month' ? panel : muted} size={15} />
        <Text style={[styles.plannerModeText, viewMode === 'month' && styles.plannerModeTextActive]}>Месяц</Text>
      </Pressable>
      <Pressable onPress={() => setViewMode('goals')} style={[styles.plannerModeButton, viewMode === 'goals' && styles.plannerModeButtonActive]}>
        <Grid2X2 color={viewMode === 'goals' ? panel : muted} size={15} />
        <Text style={[styles.plannerModeText, viewMode === 'goals' && styles.plannerModeTextActive]}>Цели</Text>
      </Pressable>
    </View>
  );

  const plannerAlternateContent = viewMode === 'goals' ? (
    <PlannerGoalsView
      date={selectedDate}
      groups={goalGroups}
      onEditRoutine={openGoalRoutineEditor}
      onRoutineValue={setGoalRoutineValue}
      onToggleAction={toggleGoalAction}
    />
  ) : (
    <PlannerMonthView
      isDesktop={isDesktop}
      items={displayItems}
      moveMonth={moveVisibleMonth}
      onBack={() => setViewMode('day')}
      onSelectDate={(dateKeyValue) => {
        setSelectedDate(dateKeyValue);
        setNewDate(dateKeyValue);
        setVisibleMonth(dateFromKey(dateKeyValue));
      }}
      onMoveItemDate={movePlannerItemToDate}
      selectedDate={selectedDate}
      selectedItems={selectedItems}
      visibleMonth={visibleMonth}
    />
  );

  return (
    <View style={[styles.plannerScreenRoot, isDesktop && styles.plannerDesktopRoot]}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, isDesktop && styles.desktopPageScroll]}
        nativeID="planner-scroll-root"
        {...(isDesktop && viewMode === 'month' ? ({
          onWheel: handleDesktopMonthWheel,
          onWheelCapture: handleDesktopMonthWheel,
        } as Record<string, unknown>) : {})}
        showsVerticalScrollIndicator={false}
        style={isDesktop ? styles.desktopScreenScroll : undefined}
      >
      {viewMode !== 'day' && isDesktop ? (
        <View style={styles.plannerDesktopDayLayout} testID="desktop-page-columns">
          <View style={styles.plannerDesktopMainColumn} testID="desktop-main-column">
        <View style={styles.plannerDesktopHeader}>
          <SectionTitle title="Планнер" subtitle="День по времени, без лишнего шума" />
          <Pressable onPress={focusNewTask} style={styles.plannerDesktopHeaderAddButton}>
            <Plus color={panel} size={20} strokeWidth={2.8} />
          </Pressable>
        </View>
            {plannerModeControl}
            {plannerDateSelector}
            {plannerAlternateContent}
          </View>
          {plannerDayAside}
        </View>
      ) : viewMode !== 'day' ? plannerAlternateContent : (
      <View style={isDesktop ? styles.plannerDesktopDayLayout : undefined} testID={isDesktop ? 'desktop-page-columns' : undefined}>
      <View style={isDesktop ? styles.plannerDesktopMainColumn : undefined} testID={isDesktop ? 'desktop-main-column' : undefined}>
      {isDesktop ? (
        <View style={styles.plannerDesktopHeader}>
          <SectionTitle title="Планнер" subtitle="День по времени, без лишнего шума" />
          <Pressable onPress={focusNewTask} style={styles.plannerDesktopHeaderAddButton}>
            <Plus color={panel} size={20} strokeWidth={2.8} />
          </Pressable>
        </View>
      ) : null}
      {isDesktop ? plannerModeControl : null}
      {isDesktop ? plannerDateSelector : null}
      <View style={styles.plannerTimelineHeader}>
        <Text style={styles.plannerDayTitle}>{formatTimelineTitle(selectedDate)}</Text>
      </View>

      {isDesktop ? (
        <View style={styles.plannerDesktopTaskGroups}>
          {selectedTimedItems.length ? (
            <View style={styles.plannerDesktopTaskCard}>
              <View style={styles.plannerDesktopTaskCardHeader}>
                <View style={styles.plannerDesktopTaskCardTitleGroup}>
                  <Clock color={accent} size={16} />
                  <Text style={styles.plannerDesktopTaskCardTitle}>С делами по времени</Text>
                </View>
                <Text style={styles.plannerDesktopTaskBadge}>{selectedTimedItems.length}</Text>
              </View>
              <View style={[styles.plannerTimeline, styles.plannerTimelineDesktop]}>
                {selectedTimedItems.map((item, index) => renderPlannerItem(item, index, selectedTimedItems))}
              </View>
            </View>
          ) : null}

          {selectedAllDayItems.length ? (
            <View style={styles.plannerDesktopTaskCard}>
              <View style={styles.plannerDesktopTaskCardHeader}>
                <View style={styles.plannerDesktopTaskCardTitleGroup}>
                  <List color={accent} size={16} />
                  <Text style={styles.plannerDesktopTaskCardTitle}>Без времени</Text>
                </View>
                <Text style={styles.plannerDesktopTaskBadge}>{selectedAllDayItems.length}</Text>
              </View>
              <View style={[styles.plannerTimeline, styles.plannerTimelineDesktop]}>
                {selectedAllDayItems.map((item, index) => renderPlannerItem(item, index, selectedAllDayItems))}
              </View>
            </View>
          ) : null}

          {!selectedItems.length ? (
            <View style={styles.plannerEmptyTimeline}>
              <Text style={styles.rowMeta}>На эту дату пока ничего не запланировано.</Text>
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.plannerTimeline}>
          {selectedItems.length ? (
            selectedItems.map((item, index) => renderPlannerItem(item, index, selectedItems))
          ) : (
            <View style={styles.plannerEmptyTimeline}>
              <Text style={styles.rowMeta}>На эту дату пока ничего не запланировано.</Text>
            </View>
          )}
        </View>
      )}
      <View style={styles.plannerQuickAdd}>
        <Pressable onLayout={updateNewPickerPosition} onPress={() => setNewPickerOpen(true)} style={styles.plannerQuickDateButton}>
          <Calendar color={accent} size={14} />
          <Text style={styles.plannerDateTimeText}>{formatShortDateTime(newDate, newTime)}</Text>
        </Pressable>
        <View style={styles.plannerTaskInputRow}>
          <Plus color={accent} size={15} />
          <TextInput
            ref={newTaskInputRef}
            onChangeText={setNewTitle}
            onSubmitEditing={addItem}
            placeholder="Завтра 18:00 тренировка"
            placeholderTextColor={faint}
            style={styles.plannerTaskInput}
            value={newTitle}
          />
          <Pressable disabled={!canAddItem} onPress={addItem} style={[styles.plannerQuickAddButton, !canAddItem && styles.plannerQuickAddButtonDisabled]}>
            <Check color={panel} size={15} strokeWidth={3} />
          </Pressable>
        </View>
        {newSubtasks.length || newSubtaskOpen ? (
          <View style={styles.plannerEditSubtasksBox}>
            {newSubtasks.length ? (
              <View style={styles.plannerEditSubtasksList}>
                {newSubtasks.map((subtask) => (
                  <View key={subtask.id} style={styles.plannerEditSubtaskChip}>
                    <List color={muted} size={13} />
                    <Text numberOfLines={1} style={styles.plannerEditSubtaskText}>{subtask.title}</Text>
                    <Pressable onPress={() => removeNewSubtask(subtask.id)} style={styles.plannerEditSubtaskRemove}>
                      <X color={muted} size={13} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ) : null}
            <View style={styles.plannerSubtasksInputRow}>
              <List color={muted} size={14} />
              <TextInput
                onChangeText={setNewSubtaskDraft}
                onSubmitEditing={addNewSubtask}
                placeholder="Новая подзадача"
                placeholderTextColor={faint}
                style={styles.plannerTaskInput}
                value={newSubtaskDraft}
              />
              <Pressable disabled={!newSubtaskDraft.trim()} onPress={addNewSubtask} style={[styles.plannerQuickAddButton, !newSubtaskDraft.trim() && styles.plannerQuickAddButtonDisabled]}>
                <Plus color={panel} size={15} strokeWidth={3} />
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable onPress={() => setNewSubtaskOpen(true)} style={styles.plannerInlineAddButton}>
            <Plus color={accent} size={13} />
            <Text style={styles.plannerInlineAddText}>Добавить подзадачу</Text>
          </Pressable>
        )}
      </View>
      </View>
      {plannerDayAside}
      </View>
      )}

      </ScrollView>

      {pickerOpen ? (
        <>
          <Pressable onPress={() => setPickerOpen(false)} style={styles.plannerCalendarScrim} />
          <View style={[styles.plannerCalendarPopover, { top: pickerTop }]}>
            <DateTimePickerPopover
              items={displayItems}
              moveMonth={moveMonth}
              onSelectDate={selectDate}
              selectedDate={selectedDate}
              visibleMonth={visibleMonth}
            />
          </View>
        </>
      ) : null}

      {newPickerOpen ? (
        <>
          <Pressable onPress={() => setNewPickerOpen(false)} style={styles.plannerCalendarScrim} />
          <View style={[styles.plannerCalendarPopover, { top: newPickerTop }]}>
            <DateTimePickerPopover
              items={displayItems}
              moveMonth={moveNewMonth}
              onClearTime={() => setNewTime('')}
              onClose={() => setNewPickerOpen(false)}
              onSelectDate={(dateKeyValue) => {
                setNewDate(dateKeyValue);
                setNewVisibleMonth(dateFromKey(dateKeyValue));
              }}
              onTimeChange={setNewTime}
              selectedDate={newDate}
              selectedTime={newTime}
              showTime
              visibleMonth={newVisibleMonth}
            />
          </View>
        </>
      ) : null}

      {editingItem ? (
        <>
          <Pressable onPress={closeEditItem} style={styles.plannerCalendarScrim} />
          <View style={styles.plannerEditPopover}>
            <View style={styles.plannerEditCard}>
              <View style={styles.rowBetween}>
              <Text style={styles.cardLabel}>РЕДАКТИРОВАТЬ</Text>
                <Pressable onPress={closeEditItem} style={styles.plannerEditCloseButton}>
              <Text style={styles.rowMeta}>Закрыть</Text>
                </Pressable>
              </View>
              <Pressable onPress={() => setEditPickerOpen((open) => !open)} style={styles.plannerDateTimeButton}>
                <Calendar color={accent} size={16} />
                <Text style={styles.plannerDateTimeText}>{formatShortDateTime(editDate, editTime)}</Text>
              </Pressable>
              {editPickerOpen ? (
                <DateTimePickerPopover
                  compact
                  items={displayItems}
                  moveMonth={(delta) => setEditVisibleMonth((date) => new Date(date.getFullYear(), date.getMonth() + delta, 1))}
                  onClearTime={() => setEditTime('')}
                  onClose={() => setEditPickerOpen(false)}
                  onSelectDate={(dateKeyValue) => {
                    setEditDate(dateKeyValue);
                    setEditVisibleMonth(dateFromKey(dateKeyValue));
                  }}
                  onTimeChange={setEditTime}
                  selectedDate={editDate}
                  selectedTime={editTime}
                  showTime
                  visibleMonth={editVisibleMonth}
                />
              ) : null}
              <View style={styles.plannerTaskInputRow}>
                <Clock color={muted} size={15} />
                <TextInput
                  onChangeText={setEditTitle}
                  onSubmitEditing={saveEditItem}
              placeholder="Задача"
                  placeholderTextColor={faint}
                  style={styles.plannerTaskInput}
                  value={editTitle}
                />
              </View>
              <View style={styles.plannerEditSubtasksBox}>
                {editSubtasks.length ? (
                  <View style={styles.plannerEditSubtasksList}>
                    {editSubtasks.map((subtask) => (
                      <View key={subtask.id} style={styles.plannerEditSubtaskChip}>
                        <List color={muted} size={13} />
                        <Text numberOfLines={1} style={styles.plannerEditSubtaskText}>{subtask.title}</Text>
                        <Pressable onPress={() => removeEditSubtask(subtask.id)} style={styles.plannerEditSubtaskRemove}>
                          <X color={muted} size={13} />
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
                <View style={styles.plannerSubtasksInputRow}>
                  <List color={muted} size={14} />
                  <TextInput
                    onChangeText={setEditSubtaskDraft}
                    onSubmitEditing={addEditSubtask}
                placeholder="Новая подзадача"
                    placeholderTextColor={faint}
                    style={styles.plannerTaskInput}
                    value={editSubtaskDraft}
                  />
                  <Pressable disabled={!editSubtaskDraft.trim()} onPress={addEditSubtask} style={[styles.plannerQuickAddButton, !editSubtaskDraft.trim() && styles.plannerQuickAddButtonDisabled]}>
                    <Plus color={panel} size={15} strokeWidth={3} />
                  </Pressable>
                </View>
              </View>
              <Pressable disabled={!canSaveEdit} onPress={saveEditItem} style={[styles.notificationButton, !canSaveEdit && styles.notificationButtonDisabled]}>
          <Text style={styles.notificationButtonText}>Сохранить</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}

      {deleteCandidate ? (
        <>
          <Pressable onPress={() => setDeleteCandidate(null)} style={styles.plannerCalendarScrim} />
          <View style={styles.plannerConfirmPopover}>
            <View style={styles.plannerConfirmCard}>
          <Text style={styles.modalTitle}>Удалить дело?</Text>
              <Text style={styles.cardText}>{deleteCandidate.title}</Text>
              <View style={styles.plannerConfirmActions}>
                <Pressable onPress={() => setDeleteCandidate(null)} style={styles.plannerCancelButton}>
              <Text style={styles.rowMeta}>Отмена</Text>
                </Pressable>
                <Pressable onPress={confirmDeleteItem} style={styles.plannerDangerButton}>
              <Text style={styles.notificationButtonText}>Удалить</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </>
      ) : null}

      <RoutineValueSheet
        draft={goalRoutineDraft}
        editor={goalRoutineEditor}
        onChangeDraft={(value) => setGoalRoutineDraft(value.replace(/\D/g, '').slice(0, 5))}
        onClose={() => setGoalRoutineEditor(null)}
        onSave={saveGoalRoutineEditor}
        onSetDraft={(value) => setGoalRoutineDraft(String(value))}
      />
    </View>
  );
}

function PlannerGoalsView({
  date,
  groups,
  onEditRoutine,
  onRoutineValue,
  onToggleAction,
}: {
  date: string;
  groups: Array<{ goal: Goal; entries: ReturnType<typeof getGoalDayEntries> }>;
  onEditRoutine: (editor: RoutineValueEditor) => void;
  onRoutineValue: (goalId: string, routineId: string, value: number) => void;
  onToggleAction: (goalId: string, actionId: string) => void;
}) {
  return (
    <View style={styles.plannerTimeline}>
      <Text style={styles.plannerDayTitle}>Цели, {formatTimelineTitle(date).replace(/^Сегодня,?\s*/i, '')}</Text>
      {groups.length ? groups.map(({ goal, entries }) => (
        <View key={goal.id} style={styles.plannerTimelineItem}>
          <Text style={styles.plannerTitle}>{goal.title}</Text>
          {entries.map((entry) => entry.kind === 'routine' ? (
            <View key={entry.routine.id} style={styles.plannerTimelineRowInner}>
              <View style={styles.plannerTimelineCheckArea}>
                <Text style={styles.plannerTime}>{entry.currentValue}/{entry.targetValue}</Text>
                <View style={styles.plannerSubtaskArrowSpacer} />
                <Pressable onPress={() => onRoutineValue(goal.id, entry.routine.id, entry.currentValue >= entry.targetValue ? 0 : entry.targetValue)} style={styles.plannerStatusMark}>
                  <Check color={entry.currentValue >= entry.targetValue ? accent : muted} size={17} strokeWidth={2.4} />
                </Pressable>
              </View>
              <View style={styles.plannerTitleArea}>
                <Text style={styles.plannerTitle}>{entry.routine.title}</Text>
                <Text style={styles.rowMeta}>{entry.routine.metricType === 'minutes' ? 'минуты' : entry.routine.metricType === 'count' ? 'количество' : 'факт'}</Text>
              </View>
              <View style={styles.plannerRowActions}>
                {entry.routine.metricType === 'boolean' ? null : (
                  <Pressable
                    onPress={() => onEditRoutine({
                      currentValue: entry.currentValue,
                      goalId: goal.id,
                      metricLabel: entry.routine.metricType === 'minutes' ? 'минут' : 'шт',
                      routineId: entry.routine.id,
                      targetValue: entry.targetValue,
                      title: entry.routine.title,
                    })}
                    style={styles.plannerEditButton}
                  >
                    <Text style={styles.plannerInlineAddText}>заполнить</Text>
                  </Pressable>
                )}
              </View>
            </View>
          ) : (
            <Pressable key={entry.action.id} onPress={() => onToggleAction(goal.id, entry.action.id)} style={styles.plannerTimelineRowInner}>
              <View style={styles.plannerTimelineCheckArea}>
                <Text style={styles.plannerTime}>День</Text>
                <View style={styles.plannerSubtaskArrowSpacer} />
                <View style={styles.plannerStatusMark}>
                  <Check color={entry.action.status === 'completed' ? accent : muted} size={17} strokeWidth={2.4} />
                </View>
              </View>
              <View style={styles.plannerTitleArea}>
                <Text style={[styles.plannerTitle, entry.action.status === 'completed' && styles.doneText]}>{entry.action.title}</Text>
                <Text style={styles.rowMeta}>{entry.action.status === 'completed' ? 'Выполнено' : 'Не выполнено'}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      )) : (
        <View style={styles.plannerEmptyTimeline}>
      <Text style={styles.rowMeta}>На эту дату нет актуальных действий целей.</Text>
        </View>
      )}
    </View>
  );
}

function PlannerMonthView({
  isDesktop,
  items,
  moveMonth,
  onBack,
  onMoveItemDate,
  onSelectDate,
  selectedDate,
  selectedItems,
  visibleMonth,
}: {
  isDesktop: boolean;
  items: PlannerItem[];
  moveMonth: (delta: number) => void;
  onBack?: () => void;
  onMoveItemDate: (itemId: string, date: string) => void;
  onSelectDate: (date: string) => void;
  selectedDate: string;
  selectedItems: PlannerItem[];
  visibleMonth: Date;
}) {
  const [dragState, setDragState] = useState<MonthDragState>(null);
  const [hoverDate, setHoverDate] = useState<string | null>(null);
  const [cellLayouts, setCellLayouts] = useState<MonthCellLayout[]>([]);
  const [calendarHeight, setCalendarHeight] = useState(0);
  const [monthGestureState, setMonthGestureState] = useState<'idle' | 'dragging' | 'settling'>('idle');
  const dragGhostRef = useRef<HTMLElement | null>(null);
  const monthPanRef = useRef(new Animated.Value(0));
  const monthGestureRef = useRef({
    active: false,
    deltaY: 0,
    lastTime: 0,
    lastY: 0,
    startTime: 0,
    startX: 0,
    startY: 0,
    tracking: false,
  });
  const today = todayDateKey();

  useEffect(() => () => removeDragGhost(), []);

  useEffect(() => {
    if (!dragState || typeof window === 'undefined') return;

    function handlePointerMove(event: PointerEvent) {
      event.preventDefault();
      moveTaskDrag(event);
    }

    function handlePointerUp(event: PointerEvent) {
      event.preventDefault();
      finishTaskDrag(event);
    }

    function handleTouchMove(event: TouchEvent) {
      event.preventDefault();
      moveTaskDrag(event);
    }

    function handleTouchEnd(event: TouchEvent) {
      event.preventDefault();
      finishTaskDrag(event);
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: false });
    window.addEventListener('pointerup', handlePointerUp, { passive: false });
    window.addEventListener('pointercancel', handlePointerUp, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: false });
    window.addEventListener('touchcancel', handleTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [dragState, cellLayouts]);

  function updateCellLayout(date: string, event: LayoutChangeEvent) {
    const { height, width, x, y } = event.nativeEvent.layout;
    setCellLayouts((layouts) => [...layouts.filter((layout) => layout.date !== date), { date, height, width, x, y }]);
  }

  function eventPoint(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    const nativeEvent = ('nativeEvent' in event ? event.nativeEvent ?? {} : event) as MonthPointerEvent;
    const point = nativeEvent.touches?.[0] ?? nativeEvent.changedTouches?.[0] ?? nativeEvent;

    return {
      x: Number(point.clientX ?? point.pageX ?? 0),
      y: Number(point.clientY ?? point.pageY ?? 0),
    };
  }

  function findDateAt(x: number, y: number) {
    if (typeof document !== 'undefined' && document.elementFromPoint) {
      const element = document.elementFromPoint(x, y);
      const target = element?.closest?.('[id^="planner-month-day-"]');
      const id = target?.getAttribute?.('id') ?? '';
      const date = id.replace('planner-month-day-', '');
      if (normalizeDateKey(date)) return date;
    }

    const target = cellLayouts.find((layout) => (
      x >= layout.x &&
      x <= layout.x + layout.width &&
      y >= layout.y &&
      y <= layout.y + layout.height
    ));
    return target?.date ?? null;
  }

  function startTaskDrag(item: PlannerItem, event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    const nativeEvent = ('nativeEvent' in event ? event.nativeEvent ?? {} : event) as MonthPointerEvent;
    if (typeof nativeEvent.button === 'number' && nativeEvent.button !== 0) return;
    const { x, y } = eventPoint(event);
    setDragState({ itemId: item.id, x, y });
    setHoverDate(item.date);
    createDragGhost(monthTaskLabel(item), x, y);
    onSelectDate(item.date);
  }

  function moveTaskDrag(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    if (!dragState) return;
    const point = eventPoint(event);
    const x = point.x || dragState.x;
    const y = point.y || dragState.y;
    setDragState({ ...dragState, x, y });
    setHoverDate(findDateAt(x, y));
    moveDragGhost(x, y);
  }

  function finishTaskDrag(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    if (!dragState) return;
    const point = eventPoint(event);
    const targetDate = findDateAt(point.x || dragState.x, point.y || dragState.y);

    if (targetDate) onMoveItemDate(dragState.itemId, targetDate);
    setDragState(null);
    setHoverDate(null);
    removeDragGhost();
  }

  function createDragGhost(label: string, x: number, y: number) {
    if (typeof document === 'undefined') return;

    removeDragGhost();

    const ghost = document.createElement('div');
    ghost.textContent = label;
    const rootStyles = window.getComputedStyle(document.documentElement);
    const themeAccentBorder = rootStyles.getPropertyValue('--koda-accent-border').trim() || 'rgba(255, 106, 31, 0.72)';
    const themeAccentGlow = rootStyles.getPropertyValue('--koda-accent-glow').trim() || 'rgba(255, 106, 31, 0.24)';
    ghost.style.position = 'fixed';
    ghost.style.left = '0';
    ghost.style.top = '0';
    ghost.style.maxWidth = '220px';
    ghost.style.padding = '8px 10px';
    ghost.style.border = `1px solid ${themeAccentBorder}`;
    ghost.style.borderRadius = '8px';
    ghost.style.background = 'rgba(19, 19, 18, 0.96)';
    ghost.style.boxShadow = `0 10px 28px rgba(0, 0, 0, 0.38), 0 0 18px ${themeAccentGlow}`;
    ghost.style.color = '#f2f0ec';
    ghost.style.font = '600 12px system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
    ghost.style.lineHeight = '16px';
    ghost.style.overflow = 'hidden';
    ghost.style.pointerEvents = 'none';
    ghost.style.textOverflow = 'ellipsis';
    ghost.style.userSelect = 'none';
    ghost.style.whiteSpace = 'nowrap';
    ghost.style.zIndex = '99999';
    document.body.appendChild(ghost);
    dragGhostRef.current = ghost;
    moveDragGhost(x, y);
  }

  function moveDragGhost(x: number, y: number) {
    const ghost = dragGhostRef.current;
    if (!ghost) return;

    ghost.style.transform = `translate3d(${Math.round(x + 12)}px, ${Math.round(y + 12)}px, 0)`;
  }

  function removeDragGhost() {
    dragGhostRef.current?.remove();
    dragGhostRef.current = null;
  }

  function stopMonthEvent(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    const nativeEvent = ('nativeEvent' in event ? event.nativeEvent ?? {} : event) as MonthPointerEvent;
    nativeEvent.preventDefault?.();
    nativeEvent.stopPropagation?.();
    if ('preventDefault' in event) event.preventDefault?.();
    if ('stopPropagation' in event) event.stopPropagation?.();
  }

  function settleMonthGesture(delta: number) {
    if (isDesktop || monthGestureState === 'settling') return;
    const height = Math.max(calendarHeight, 260);
    const toValue = delta > 0 ? -height : height;
    setMonthGestureState('settling');
    Animated.timing(monthPanRef.current, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
      toValue,
      useNativeDriver: true,
    }).start(() => {
      moveMonth(delta);
      monthPanRef.current.setValue(0);
      setMonthGestureState('idle');
    });
  }

  function restoreMonthGesture() {
    setMonthGestureState('settling');
    Animated.timing(monthPanRef.current, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
      toValue: 0,
      useNativeDriver: true,
    }).start(() => {
      monthPanRef.current.setValue(0);
      setMonthGestureState('idle');
    });
  }

  function handleMobileCalendarWheel(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    if (isDesktop || dragState || monthGestureState !== 'idle') return;
    const nativeEvent = ('nativeEvent' in event ? event.nativeEvent ?? {} : event) as MonthPointerEvent;
    const deltaY = Number(nativeEvent.deltaY ?? 0);
    if (Math.abs(deltaY) < 36) return;

    stopMonthEvent(event);
    settleMonthGesture(deltaY > 0 ? 1 : -1);
  }

  function handleMobileMonthTouchStart(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    if (isDesktop || dragState || monthGestureState === 'settling') return;
    const point = eventPoint(event);
    const now = Date.now();
    monthGestureRef.current = {
      active: false,
      deltaY: 0,
      lastTime: now,
      lastY: point.y,
      startTime: now,
      startX: point.x,
      startY: point.y,
      tracking: true,
    };
  }

  function handleMobileMonthTouchMove(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    if (isDesktop || dragState || monthGestureState === 'settling' || !monthGestureRef.current.tracking) return;
    const point = eventPoint(event);
    const gesture = monthGestureRef.current;
    const dx = point.x - gesture.startX;
    const dy = point.y - gesture.startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    if (!gesture.active) {
      if (absX > 12 && absX > absY * 1.15) {
        gesture.tracking = false;
        return;
      }
      if (absY < 10 || absY < absX * 1.15) return;
      gesture.active = true;
      setMonthGestureState('dragging');
    }

    stopMonthEvent(event);
    const height = Math.max(calendarHeight, 260);
    const limitedDelta = Math.max(-height, Math.min(height, dy));
    gesture.deltaY = limitedDelta;
    gesture.lastY = point.y;
    gesture.lastTime = Date.now();
    monthPanRef.current.setValue(limitedDelta);
  }

  function handleMobileMonthTouchEnd(event: MonthPointerEvent | { nativeEvent?: Record<string, unknown> }) {
    if (isDesktop || dragState || !monthGestureRef.current.tracking) return;
    const gesture = monthGestureRef.current;
    monthGestureRef.current.tracking = false;

    if (!gesture.active) {
      monthPanRef.current.setValue(0);
      return;
    }

    stopMonthEvent(event);
    const elapsed = Math.max(1, gesture.lastTime - gesture.startTime);
    const velocity = (gesture.lastY - gesture.startY) / elapsed;
    const threshold = Math.max(72, Math.max(calendarHeight, 260) * 0.3);
    const shouldCommit = Math.abs(gesture.deltaY) >= threshold || Math.abs(velocity) >= 0.55;

    if (!shouldCommit) {
      restoreMonthGesture();
      return;
    }

    settleMonthGesture(gesture.deltaY < 0 || velocity < -0.55 ? 1 : -1);
  }

  function renderMonthCalendar(month: Date, measureHeight = false) {
    const monthWeeks = buildMonthWeeks(month);

    return (
      <View
        onLayout={measureHeight ? (event) => setCalendarHeight(event.nativeEvent.layout.height) : undefined}
        style={!isDesktop ? styles.plannerMobileMonthPane : undefined}
      >
        <View style={[styles.plannerMonthToolbar, !isDesktop && styles.plannerMobileMonthToolbar]}>
          {isDesktop ? (
            <Pressable onPress={() => moveMonth(-1)} style={styles.plannerMonthNavButton}>
              <ChevronLeft color={muted} size={20} />
            </Pressable>
          ) : null}
          <View style={styles.plannerMonthTitleBlock}>
            {isDesktop ? <Text style={styles.plannerMonthYear}>{month.getFullYear()}</Text> : null}
            <Text style={[styles.plannerMonthTitle, !isDesktop && styles.plannerMobileMonthTitle]}>{monthTitleNames[month.getMonth()]}</Text>
          </View>
          {isDesktop ? (
            <Pressable onPress={() => moveMonth(1)} style={styles.plannerMonthNavButton}>
              <ChevronRight color={muted} size={20} />
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.plannerMonthWeekHeader, !isDesktop && styles.plannerMobileMonthWeekHeader]}>
          {weekDays.map((day) => (
            <Text key={`month-week-${day}-${month.getFullYear()}-${month.getMonth()}`} style={[styles.plannerMonthWeekText, !isDesktop && styles.plannerMobileMonthWeekText]}>{day.slice(0, 1)}</Text>
          ))}
        </View>

        <View style={[styles.plannerMonthGrid, !isDesktop && styles.plannerMobileMonthGrid]}>
          {monthWeeks.map((week, weekIndex) => (
            <View key={`month-week-row-${month.getFullYear()}-${month.getMonth()}-${weekIndex}`} style={[styles.plannerMonthWeekRow, !isDesktop && styles.plannerMobileMonthWeekRow]}>
              {week.map((day, dayIndex) => {
                if (!day) return <View key={`month-blank-${month.getFullYear()}-${month.getMonth()}-${weekIndex}-${dayIndex}`} style={[styles.plannerMonthDayCell, !isDesktop && styles.plannerMobileMonthDayCell]} />;

                const dateKeyValue = toDateKey(day);
                const dayItems = items.filter((item) => item.date === dateKeyValue).sort(comparePlannerItems);
                const selected = dateKeyValue === selectedDate;
                const current = dateKeyValue === today;
                const moveTarget = hoverDate === dateKeyValue;

                return (
                  <Pressable
                    key={dateKeyValue}
                    nativeID={`planner-month-day-${dateKeyValue}`}
                    onLayout={(event) => updateCellLayout(dateKeyValue, event)}
                    onPress={() => onSelectDate(dateKeyValue)}
                    style={[styles.plannerMonthDayCell, !isDesktop && styles.plannerMobileMonthDayCell, moveTarget && styles.plannerMonthDayCellMoveTarget]}
                  >
                    <View style={[styles.plannerMonthDayNumberWrap, !isDesktop && styles.plannerMobileMonthDayNumberWrap, selected && styles.plannerMonthDayNumberSelected, current && !selected && styles.plannerMonthDayNumberToday]}>
                      <Text style={[styles.plannerMonthDayNumber, !isDesktop && styles.plannerMobileMonthDayNumber, selected && styles.plannerMonthDayNumberSelectedText]}>{day.getDate()}</Text>
                    </View>
                    <View style={[styles.plannerMonthTasks, !isDesktop && styles.plannerMobileMonthTasks]}>
                      {dayItems.slice(0, isDesktop ? 4 : 3).map((item, itemIndex) => (
                        <Pressable
                          key={`${item.id}-month-task`}
                          style={[
                            styles.plannerMonthTaskChip,
                            !isDesktop && (itemIndex === 0 ? styles.plannerMobileMonthTaskBar : styles.plannerMobileMonthTaskDot),
                            item.done && styles.plannerMonthTaskChipDone,
                            dragState?.itemId === item.id && styles.plannerMonthTaskChipMoving,
                          ]}
                          {...({
                            onPointerDown: (event: MonthPointerEvent) => startTaskDrag(item, event),
                            ...(!isDesktop ? { onTouchStart: (event: MonthPointerEvent) => startTaskDrag(item, event) } : {}),
                          } as Record<string, unknown>)}
                        >
                          {isDesktop ? <Text numberOfLines={1} style={[styles.plannerMonthTaskText, item.done && styles.doneText]}>
                            {item.time ? `${item.time} ` : ''}{item.title}
                          </Text> : null}
                        </Pressable>
                      ))}
                      {dayItems.length > (isDesktop ? 4 : 3) ? <Text style={[styles.plannerMonthMoreText, !isDesktop && styles.plannerMobileMonthMoreText]}>+{dayItems.length - (isDesktop ? 4 : 3)}</Text> : null}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    );
  }

  const monthStackHeight = Math.max(calendarHeight, 260);
  const previousMonth = addMonthsToDate(visibleMonth, -1);
  const nextMonth = addMonthsToDate(visibleMonth, 1);
  const previousTranslateY = monthPanRef.current.interpolate({
    extrapolate: 'clamp',
    inputRange: [-monthStackHeight, 0, monthStackHeight],
    outputRange: [-monthStackHeight * 2, -monthStackHeight, 0],
  });
  const nextTranslateY = monthPanRef.current.interpolate({
    extrapolate: 'clamp',
    inputRange: [-monthStackHeight, 0, monthStackHeight],
    outputRange: [0, monthStackHeight, monthStackHeight * 2],
  });

  return (
    <View
      style={[styles.plannerMonthView, !isDesktop && styles.plannerMobileMonthView, isDesktop && styles.plannerDesktopMonthView]}
    >
      <View style={isDesktop ? styles.plannerDesktopMonthCalendar : undefined}>
      {!isDesktop ? (
        <View style={styles.plannerMobileMonthTopBar}>
          <Pressable onPress={onBack} style={styles.plannerMobileMonthBackButton}>
            <ChevronLeft color={text} size={22} strokeWidth={2.7} />
            <Text style={styles.plannerMobileMonthBackText}>{visibleMonth.getFullYear()}</Text>
          </Pressable>
        </View>
      ) : null}
      {isDesktop ? (
        renderMonthCalendar(visibleMonth)
      ) : (
        <View
          style={[styles.plannerMobileMonthGestureArea, calendarHeight > 0 && { height: calendarHeight }]}
          {...({
            onTouchCancel: handleMobileMonthTouchEnd,
            onTouchEnd: handleMobileMonthTouchEnd,
            onTouchMove: handleMobileMonthTouchMove,
            onTouchStart: handleMobileMonthTouchStart,
            onWheel: handleMobileCalendarWheel,
          } as Record<string, unknown>)}
        >
          {calendarHeight > 0 ? (
            <>
              <Animated.View style={[styles.plannerMobileMonthPaneLayer, { transform: [{ translateY: previousTranslateY }] }]}>
                {renderMonthCalendar(previousMonth)}
              </Animated.View>
              <Animated.View style={[styles.plannerMobileMonthPaneLayer, { transform: [{ translateY: monthPanRef.current }] }]}>
                {renderMonthCalendar(visibleMonth)}
              </Animated.View>
              <Animated.View style={[styles.plannerMobileMonthPaneLayer, { transform: [{ translateY: nextTranslateY }] }]}>
                {renderMonthCalendar(nextMonth)}
              </Animated.View>
            </>
          ) : (
            renderMonthCalendar(visibleMonth, true)
          )}
        </View>
      )}
      </View>

      <View style={[styles.plannerMonthSelectedList, !isDesktop && styles.plannerMobileMonthSelectedList, isDesktop && styles.plannerDesktopMonthSelectedList]}>
        <View style={[styles.rowBetween, !isDesktop && styles.plannerMobileMonthSelectedHeader]}>
          <Text style={[styles.plannerDayTitle, !isDesktop && styles.plannerMobileMonthSelectedTitle]}>{formatTimelineTitle(selectedDate)}</Text>
          <Text style={styles.rowMeta}>{selectedItems.length ? `${selectedItems.length} дел` : 'пусто'}</Text>
        </View>
        {selectedItems.length ? (
          selectedItems.map((item) => (
            <Pressable
              key={`month-selected-${item.id}`}
              style={[styles.plannerMonthEventRow, !isDesktop && styles.plannerMobileMonthEventRow, dragState?.itemId === item.id && styles.plannerMonthEventRowMoving]}
              {...({
                onPointerDown: (event: MonthPointerEvent) => startTaskDrag(item, event),
                ...(!isDesktop ? { onTouchStart: (event: MonthPointerEvent) => startTaskDrag(item, event) } : {}),
              } as Record<string, unknown>)}
            >
              <View style={[styles.plannerStatusMark, !isDesktop && styles.plannerMobileMonthEventMark]}>
                {isDesktop ? (
                  <Check color={item.done ? accent : muted} size={17} strokeWidth={2.4} />
                ) : item.done ? (
                  <Check color={panel} size={12} strokeWidth={2.8} />
                ) : (
                  <Calendar color={panel} size={12} strokeWidth={2.4} />
                )}
              </View>
              <Text style={[styles.plannerMonthEventTitle, !isDesktop && styles.plannerMobileMonthEventTitle, item.done && styles.doneText]} numberOfLines={1}>{item.title}</Text>
              <Text style={[styles.rowMeta, !isDesktop && styles.plannerMobileMonthEventTime]}>{item.time || 'весь день'}</Text>
            </Pressable>
          ))
        ) : (
          <Text style={styles.rowMeta}>На эту дату пока ничего не запланировано.</Text>
        )}
        {isDesktop ? (
          <Pressable onPress={() => onSelectDate(selectedDate)} style={styles.notificationButton}>
          <Text style={styles.notificationButtonText}>Добавить задачу</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function comparePlannerItems(left: PlannerItem, right: PlannerItem) {
  if (left.done !== right.done) return left.done ? 1 : -1;
  if (!left.time && right.time) return -1;
  if (left.time && !right.time) return 1;
  return left.time.localeCompare(right.time);
}

function monthTaskLabel(item: PlannerItem) {
  return `${item.time ? `${item.time} ` : ''}${item.title}`.trim();
}

function addDaysToKey(value: string, delta: number) {
  const date = dateFromKey(value);
  date.setDate(date.getDate() + delta);
  return toDateKey(date);
}

function canSubmitPlannerItem(dateValue: string, timeValue: string, titleValue: string) {
  const trimmedTime = timeValue.trim();
  const normalizedTime = trimmedTime ? normalizeTimeValue(trimmedTime) : '';

  return Boolean(normalizeDateKey(dateValue) && normalizedTime !== null && titleValue.trim());
}

export function parseQuickTaskInput(titleValue: string, fallbackDate: string, fallbackTime: string): Pick<PlannerItem, 'date' | 'time' | 'title'> | null {
  const normalizedFallbackDate = normalizeDateKey(fallbackDate);
  const trimmedFallbackTime = fallbackTime.trim();
  const normalizedFallbackTime = trimmedFallbackTime ? normalizeTimeValue(trimmedFallbackTime) : '';
  if (!normalizedFallbackDate || normalizedFallbackTime === null) return null;

  let date = normalizedFallbackDate;
  let time = normalizedFallbackTime;
  let title = titleValue.trim();

  const relativeDate = parseRelativeDate(title, normalizedFallbackDate);
  if (relativeDate) {
    date = relativeDate.date;
    title = title.replace(relativeDate.match, ' ');
  }

  const explicitDate = parseExplicitDate(title, normalizedFallbackDate);
  if (explicitDate) {
    date = explicitDate.date;
    title = title.replace(explicitDate.match, ' ');
  }

  const explicitTime = parseExplicitTime(title);
  if (explicitTime) {
    time = explicitTime.time;
    title = title.replace(explicitTime.match, ' ');
  }

  title = cleanQuickTaskTitle(title);

  if (!title) return null;

  return { date, time, title };
}

function parseRelativeDate(value: string, fallbackDate: string) {
  const lowerValue = value.toLowerCase();
  const match = lowerValue.match(/(^|\s)(\u043f\u043e\u0441\u043b\u0435\u0437\u0430\u0432\u0442\u0440\u0430|\u0437\u0430\u0432\u0442\u0440\u0430|\u0441\u0435\u0433\u043e\u0434\u043d\u044f)(?=\s|$|[,.;:])/);
  if (!match) return null;

  const offsetByWord: Record<string, number> = { ['\u0441\u0435\u0433\u043e\u0434\u043d\u044f']: 0, ['\u0437\u0430\u0432\u0442\u0440\u0430']: 1, ['\u043f\u043e\u0441\u043b\u0435\u0437\u0430\u0432\u0442\u0440\u0430']: 2 };

  return {
    date: addDaysToKey(todayDateKey(), offsetByWord[match[2]] ?? 0),
    match: match[0],
  };
}

function parseExplicitDate(value: string, fallbackDate: string) {
  const match = value.match(/(^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$|[,.;:])/);
  if (!match) return null;

  const fallback = dateFromKey(fallbackDate);
  const day = Number(match[2]);
  const month = Number(match[3]);
  const rawYear = match[4];
  let year = rawYear ? Number(rawYear) : fallback.getFullYear();
  if (rawYear && rawYear.length === 2) year += 2000;

  let date = new Date(year, month - 1, day);
  if (!rawYear && date < dateFromKey(todayDateKey())) {
    date = new Date(year + 1, month - 1, day);
  }

  if (Number.isNaN(date.getTime()) || date.getDate() !== day || date.getMonth() !== month - 1) return null;

  return { date: toDateKey(date), match: match[0] };
}

function parseExplicitTime(value: string) {
  const withMinutes = value.match(/(^|\s)(?:в\s*)?(\d{1,2})[:.](\d{2})(?=\s|$|[,.;])/i);
  if (withMinutes) {
    const normalized = normalizeTimeValue(`${withMinutes[2]}:${withMinutes[3]}`);
    if (normalized) return { time: normalized, match: withMinutes[0] };
  }

  const hourOnly = value.match(/(^|\s)в\s*(\d{1,2})(?=\s|$|[,.;])/i);
  if (hourOnly) {
    const normalized = normalizeTimeValue(`${hourOnly[2]}:00`);
    if (normalized) return { time: normalized, match: hourOnly[0] };
  }

  return null;
}

function cleanQuickTaskTitle(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.;:вЂ“вЂ”-]+/, '')
    .replace(/[\s,.;:вЂ“вЂ”-]+$/, '')
    .trim();
}

function DateTimePickerPopover({
  compact,
  items,
  moveMonth,
  onClearTime,
  onClose,
  onSelectDate,
  onTimeChange,
  selectedDate,
  selectedTime = '',
  showTime,
  visibleMonth,
}: {
  compact?: boolean;
  items: PlannerItem[];
  moveMonth: (delta: number) => void;
  onClearTime?: () => void;
  onClose?: () => void;
  onSelectDate: (date: string) => void;
  onTimeChange?: (time: string) => void;
  selectedDate: string;
  selectedTime?: string;
  showTime?: boolean;
  visibleMonth: Date;
}) {
  const safeTime = selectedTime.trim();
  const [hours = '', minutes = ''] = safeTime ? safeTime.split(':') : ['', ''];

  function updateTime(nextHours: string, nextMinutes: string) {
    const hourValue = nextHours.replace(/\D/g, '').slice(0, 2);
    const minuteValue = nextMinutes.replace(/\D/g, '').slice(0, 2);
    const nextTime = hourValue || minuteValue ? `${hourValue}:${minuteValue || '00'}` : '';
    onTimeChange?.(nextTime);
  }

  return (
    <View style={[styles.plannerCalendarPanel, compact && styles.plannerCalendarPanelCompact]}>
      <View style={styles.calendarToolbar}>
        <Pressable onPress={() => moveMonth(-1)} style={styles.calendarArrowButton}>
          <ChevronLeft color={muted} size={18} />
        </Pressable>
        <Text style={styles.calendarPickerText}>{monthPickerNames[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}</Text>
        <Pressable onPress={() => moveMonth(1)} style={styles.calendarArrowButton}>
          <ChevronRight color={muted} size={18} />
        </Pressable>
      </View>
      <View style={styles.calendarWeekRow}>
        {weekDays.map((day) => (
          <Text key={day} style={[styles.calendarWeekText, compact && styles.plannerCalendarWeekTextCompact]}>{day}</Text>
        ))}
      </View>
      <View style={styles.plannerCalendarGrid}>
        {buildMonthWeeks(visibleMonth).map((week, weekIndex) => (
          <View key={`picker-week-${weekIndex}`} style={styles.plannerCalendarWeek}>
            {week.map((day, dayIndex) => {
              if (!day) return <View key={`blank-${weekIndex}-${dayIndex}`} style={[styles.plannerCalendarDayBlank, compact && styles.plannerCalendarDayBlankCompact]} />;

              const dateKeyValue = toDateKey(day);
              const active = dateKeyValue === selectedDate;
              const hasItems = items.some((item) => item.date === dateKeyValue);

              return (
                <Pressable key={dateKeyValue} onPress={() => onSelectDate(dateKeyValue)} style={[styles.plannerCalendarDay, compact && styles.plannerCalendarDayCompact, active && styles.plannerCalendarDayActive]}>
                  <Text style={[styles.plannerCalendarDayText, active && styles.plannerCalendarDayTextActive]}>{day.getDate()}</Text>
                  {hasItems ? <View style={[styles.plannerCalendarDot, active && styles.plannerCalendarDotActive]} /> : null}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
      {showTime ? (
        <View style={styles.plannerTimePickerPanel}>
          <Text style={styles.rowMeta}>Время</Text>
          <View style={styles.plannerTimePickerRow}>
            <TextInput
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={(value) => updateTime(value, minutes)}
              placeholder="--"
              placeholderTextColor={faint}
              style={styles.plannerTimePickerInput}
              value={hours}
            />
            <Text style={styles.plannerTimePickerColon}>:</Text>
            <TextInput
              keyboardType="number-pad"
              maxLength={2}
              onChangeText={(value) => updateTime(hours, value)}
              placeholder="--"
              placeholderTextColor={faint}
              style={styles.plannerTimePickerInput}
              value={minutes}
            />
            <Pressable onPress={onClearTime} style={styles.plannerTimeClearButton}>
          <Text style={styles.rowMeta}>Без времени</Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.plannerPickerDoneButton}>
        <Text style={styles.notificationButtonText}>Выбрать</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function buildCalendarDays(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const firstDay = new Date(year, monthIndex, 1);
  const mondayOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const blanks = Array.from<null>({ length: mondayOffset }).fill(null);
  const days = Array.from({ length: getDaysInMonth(year, monthIndex) }, (_, index) => new Date(year, monthIndex, index + 1));

  return [...blanks, ...days];
}

function buildMonthWeeks(month: Date) {
  const days = buildCalendarDays(month);
  const paddedDays = [...days];

  while (paddedDays.length % 7 !== 0) {
    paddedDays.push(null);
  }

  return Array.from({ length: paddedDays.length / 7 }, (_, index) => paddedDays.slice(index * 7, index * 7 + 7));
}

function addMonthsToDate(date: Date, delta: number) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function normalizeDateKey(value: string) {
  const match = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== Number(match[1]) || date.getMonth() !== Number(match[2]) - 1 || date.getDate() !== Number(match[3])) return null;

  return toDateKey(date);
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day || 1);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatTimelineTitle(value: string) {
  const today = todayDateKey();
  const date = dateFromKey(value);
  const prefix = value === today ? 'Сегодня' : capitalizeFirst(new Intl.DateTimeFormat('ru-RU', { weekday: 'long' }).format(date));

  return `${prefix}, ${date.getDate()} ${monthNames[date.getMonth()]}`;
}

function formatFullDate(value: string) {
  const date = dateFromKey(value);
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function formatShortDateTime(dateValue: string, timeValue: string) {
  const date = dateFromKey(dateValue);
  const dateText = `${date.getDate()} ${monthNames[date.getMonth()]}`;
  return timeValue ? `${dateText}, ${timeValue}` : `${dateText}, без времени`;
}

function capitalizeFirst(value: string) {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}


