import { useEffect, useMemo, useState } from 'react';
import { parseQuickTaskInput } from '../quickTaskInput';
export { parseQuickTaskInput } from '../quickTaskInput';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Calendar, Check, ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react-native';
import type { PlannerItem, TabKey, ThemeId } from '../types';
import { isProjectedPlannerItem } from '../plannerProjections';
import { PlannerCalendar, type CalendarMode } from '../components/PlannerCalendar';
import { accent, activeText, faint, line, muted, panel, text } from '../theme';
import { styles } from '../styles';
import { getDaysInMonth, normalizeTimeValue, todayDateKey, uid } from '../utils';

const monthNames = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const monthPickerNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const weekDays = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];

type Props = {
  initialFocus?: PlannerItem | null;
  isDesktop?: boolean;
  items: PlannerItem[];
  onAddItem: (item: Pick<PlannerItem, 'date' | 'time' | 'title'> & { subtasks?: PlannerItem['subtasks'] }) => void;
  onDeleteItem: (id: string) => void;
  onMoveProjectedItemDate?: (item: PlannerItem, date: string) => void;
  onToggleProjectedItem?: (item: PlannerItem) => void;
  onToggleItem: (id: string) => void;
  onSetItemFailed: (id: string, failed: boolean) => void;
  onToggleSubtask: (itemId: string, subtaskId: string) => void;
  onUpdateItem: (id: string, item: Pick<PlannerItem, 'date' | 'time' | 'title'> & { subtasks?: PlannerItem['subtasks'] }) => void;
  projectItems?: PlannerItem[];
  themeId?: ThemeId;
  onThemeChange?: (id: ThemeId) => void;
  onOpenSection?: (tab: TabKey) => void;
  onOpenWorkspace?: () => void;
  syncText?: string;
};

export function PlannerScreen({ initialFocus, isDesktop = false, items, projectItems = [], onAddItem, onDeleteItem, onMoveProjectedItemDate, onToggleProjectedItem, onToggleItem, onSetItemFailed, onToggleSubtask, onUpdateItem, onOpenSection, onOpenWorkspace, syncText }: Props) {
  const [selectedDate, setSelectedDate] = useState(normalizeDateKey(initialFocus?.date ?? '') ?? todayDateKey());
  const [mode, setMode] = useState<CalendarMode>(initialFocus ? 'day' : isDesktop ? 'week' : 'day');
  useEffect(() => {
    const focusDate = normalizeDateKey(initialFocus?.date ?? '');
    if (focusDate) { setSelectedDate(focusDate); setMode('day'); }
  }, [initialFocus?.id, initialFocus?.date]);
  const [editor, setEditor] = useState<{ item: PlannerItem | null } | null>(null);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayDateKey());
  const [time, setTime] = useState('');
  const [subtasks, setSubtasks] = useState<NonNullable<PlannerItem['subtasks']>>([]);
  const [subtaskDraft, setSubtaskDraft] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(() => dateFromKey(todayDateKey()));
  const [deleteCandidate, setDeleteCandidate] = useState<PlannerItem | null>(null);
  const displayItems = useMemo(() => [...items, ...projectItems].filter(item => !item.deletedAt), [items, projectItems]);
  const projected = Boolean(editor?.item && isProjectedPlannerItem(editor.item));
  const parsedNewItem = parseQuickTaskInput(title, date, time);
  const valid = projected ? Boolean(normalizeDateKey(date)) : editor?.item ? canSubmitPlannerItem(date, time, title) : Boolean(parsedNewItem);

  function openEditor(item: PlannerItem | null, nextDate = selectedDate, nextTime = '') {
    setTitle(item?.title ?? '');
    setDate(item?.date ?? nextDate);
    setTime(item?.time ?? nextTime);
    setSubtasks(item?.subtasks?.map(subtask => ({ ...subtask })) ?? []);
    setSubtaskDraft('');
    setPickerMonth(dateFromKey(item?.date ?? nextDate));
    setPickerOpen(false);
    setEditor({ item });
  }

  function saveEditor(syncSubtaskStatus = true) {
    if (!editor || !valid) return false;
    const item = editor.item;
    if (item && isProjectedPlannerItem(item)) {
      if (item.date !== date) onMoveProjectedItemDate?.(item, date);
      setSelectedDate(date);
    } else {
      const value = item ? { date, time: time.trim() ? normalizeTimeValue(time)! : '', title: title.trim() } : parsedNewItem!;
      const draft = subtaskDraft.trim();
      const nextSubtasks = draft ? [...subtasks, { id: uid('subtask'), title: draft, done: false }] : subtasks;
      if (item) {
        // Use the existing subtask handler so completing all subtasks still completes the task.
        const changed = syncSubtaskStatus ? nextSubtasks.filter(subtask => item.subtasks?.some(original => original.id === subtask.id && original.done !== subtask.done)) : [];
        onUpdateItem(item.id, { ...value, subtasks: nextSubtasks.map(subtask => changed.some(entry => entry.id === subtask.id) ? { ...subtask, done: !subtask.done } : subtask) });
        changed.forEach(subtask => onToggleSubtask(item.id, subtask.id));
      } else onAddItem({ ...value, subtasks: nextSubtasks });
      setSelectedDate(value.date);
    }
    setEditor(null);
    return true;
  }

  function toggleCompletion() {
    const item = editor?.item;
    if (!item || !saveEditor(false)) return;
    if (isProjectedPlannerItem(item)) onToggleProjectedItem?.(item);
    else onToggleItem(item.id);
  }

  function addSubtask() {
    if (!subtaskDraft.trim()) return;
    setSubtasks(previous => [...previous, { id: uid('subtask'), title: subtaskDraft.trim(), done: false }]);
    setSubtaskDraft('');
  }

  return (
    <View style={{ flex: 1, minHeight: 0, width: '100%' }}>
      <PlannerCalendar
        mode={mode}
        onModeChange={setMode}
        selectedDate={selectedDate}
        onSelectDate={setSelectedDate}
        items={displayItems}
        onNewItem={(nextDate, nextTime) => openEditor(null, nextDate, nextTime)}
        onOpenItem={item => openEditor(item)}
        onMoveItem={(item, nextDate, nextTime) => {
          if (isProjectedPlannerItem(item)) onMoveProjectedItemDate?.(item, nextDate);
          else onUpdateItem(item.id, { date: nextDate, time: nextTime, title: item.title, subtasks: item.subtasks ?? [] });
        }}
        onOpenWorkspace={onOpenWorkspace}
        syncText={syncText}
      />
      <Modal transparent animationType="fade" visible={Boolean(editor)} onRequestClose={() => setEditor(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.3)' }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Закрыть задачу" onPress={() => setEditor(null)} style={{ position: 'absolute', inset: 0 }} />
          <View style={{ width: '100%', maxWidth: 460, maxHeight: '92%', backgroundColor: panel, borderRadius: 20, borderWidth: 1, borderColor: line, overflow: 'hidden' }}>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
              <View style={styles.rowBetween}>
                <Text style={{ color: text, fontSize: 18, fontWeight: '700' }}>{projected ? 'Задача проекта' : editor?.item ? 'Задача' : 'Новая задача'}</Text>
                <Pressable accessibilityRole="button" accessibilityLabel="Закрыть редактор" onPress={() => setEditor(null)} style={styles.iconButton}><X color={muted} size={19} /></Pressable>
              </View>
              <TextInput autoFocus={!projected} editable={!projected} accessibilityLabel="Название задачи" placeholder="Название задачи" placeholderTextColor={faint} value={title} onChangeText={setTitle} onSubmitEditing={() => saveEditor()} style={[styles.modalInput, { fontSize: 18 }]} />
              <Pressable accessibilityRole="button" accessibilityLabel="Изменить дату и время" onPress={() => setPickerOpen(open => !open)} style={[styles.plannerDateTimeButton, { minHeight: 44 }]}>
                <Calendar color={accent} size={17} /><Text style={styles.plannerDateTimeText}>{formatShortDateTime(date, time)}</Text>
              </Pressable>
              {pickerOpen ? <DateTimePickerPopover compact items={displayItems} moveMonth={delta => setPickerMonth(month => addMonthsToDate(month, delta))} onClearTime={() => setTime('')} onClose={() => setPickerOpen(false)} onSelectDate={nextDate => { setDate(nextDate); setPickerMonth(dateFromKey(nextDate)); }} onTimeChange={setTime} selectedDate={date} selectedTime={time} showTime={!projected} visibleMonth={pickerMonth} /> : null}
              {!projected ? <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Text style={[styles.rowMeta, { flex: 1 }]}>Время</Text>
                  <TextInput accessibilityLabel="Время задачи" placeholder="Без времени" placeholderTextColor={faint} value={time} onChangeText={setTime} maxLength={5} style={[styles.modalInput, { width: 120, minHeight: 40, textAlign: 'center' }]} />
                  {time ? <Pressable accessibilityRole="button" accessibilityLabel="Убрать время" onPress={() => setTime('')} style={styles.iconButton}><X color={muted} size={16} /></Pressable> : null}
                </View>
                {subtasks.map(subtask => <View key={subtask.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: subtask.done }} accessibilityLabel={subtask.title} onPress={() => setSubtasks(previous => previous.map(entry => entry.id === subtask.id ? { ...entry, done: !entry.done } : entry))} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 }}>
                    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: subtask.done ? accent : line, backgroundColor: subtask.done ? accent : panel, alignItems: 'center', justifyContent: 'center' }}>{subtask.done ? <Check color={activeText} size={14} /> : null}</View>
                    <Text style={[styles.plannerTitle, { flex: 1 }, subtask.done && styles.doneText]}>{subtask.title}</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Удалить подзадачу ${subtask.title}`} onPress={() => setSubtasks(previous => previous.filter(entry => entry.id !== subtask.id))} style={styles.iconButton}><X color={muted} size={16} /></Pressable>
                </View>)}
                <View style={styles.plannerTaskInputRow}>
                  <TextInput accessibilityLabel="Новая подзадача" placeholder="Добавить подзадачу" placeholderTextColor={faint} value={subtaskDraft} onChangeText={setSubtaskDraft} onSubmitEditing={addSubtask} style={styles.plannerTaskInput} />
                  <Pressable accessibilityRole="button" accessibilityLabel="Добавить подзадачу" disabled={!subtaskDraft.trim()} onPress={addSubtask} style={styles.iconButton}><Plus color={subtaskDraft.trim() ? accent : faint} size={18} /></Pressable>
                </View>
              </> : <Pressable accessibilityRole="button" onPress={() => { setEditor(null); onOpenSection?.('projects'); }}><Text style={{ color: accent }}>Открыть проект</Text></Pressable>}
              <Pressable accessibilityRole="button" disabled={!valid} onPress={() => saveEditor()} style={[styles.notificationButton, !valid && styles.notificationButtonDisabled]}><Text style={styles.notificationButtonText}>{editor?.item ? 'Сохранить' : 'Добавить'}</Text></Pressable>
              {editor?.item ? <View style={{ borderTopWidth: 1, borderColor: line, paddingTop: 8, gap: 4 }}>
                <Pressable accessibilityRole="button" disabled={!valid} onPress={toggleCompletion} style={styles.taskContextAction}><Check color={accent} size={18} /><Text style={styles.plannerTitle}>{editor.item.done ? 'Вернуть в работу' : 'Отметить выполненной'}</Text></Pressable>
                {!projected ? <>
                  <Pressable accessibilityRole="button" onPress={() => { const item = editor.item!; if (saveEditor()) onSetItemFailed(item.id, !item.failed); }} style={styles.taskContextAction}><X color={muted} size={18} /><Text style={styles.plannerTitle}>{editor.item.failed ? 'Снять отметку невыполнения' : 'Отметить невыполненной'}</Text></Pressable>
                  <Pressable accessibilityRole="button" onPress={() => { setDeleteCandidate(editor.item); setEditor(null); }} style={styles.taskContextAction}><Trash2 color="#b64242" size={17} /><Text style={{ color: '#b64242' }}>Удалить задачу</Text></Pressable>
                </> : null}
              </View> : null}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <Modal transparent animationType="fade" visible={Boolean(deleteCandidate)} onRequestClose={() => setDeleteCandidate(null)}>
        <View style={styles.modalOverlay}><View style={[styles.plannerConfirmCard, { maxWidth: 400, width: '100%' }]}>
          <Text style={styles.modalTitle}>Удалить задачу?</Text><Text style={styles.cardText}>{deleteCandidate?.title}</Text>
          <View style={styles.plannerConfirmActions}>
            <Pressable accessibilityRole="button" onPress={() => setDeleteCandidate(null)} style={styles.plannerCancelButton}><Text style={styles.rowMeta}>Отмена</Text></Pressable>
            <Pressable accessibilityRole="button" onPress={() => { if (deleteCandidate) onDeleteItem(deleteCandidate.id); setDeleteCandidate(null); }} style={styles.plannerDangerButton}><Text style={styles.notificationButtonText}>Удалить</Text></Pressable>
          </View>
        </View></View>
      </Modal>
    </View>
  );
}

function canSubmitPlannerItem(dateValue: string, timeValue: string, titleValue: string) {
  const trimmedTime = timeValue.trim();
  const normalizedTime = trimmedTime ? normalizeTimeValue(trimmedTime) : '';

  return Boolean(normalizeDateKey(dateValue) && normalizedTime !== null && titleValue.trim());
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
        <Pressable accessibilityRole="button" accessibilityLabel="Предыдущий месяц в выборе даты" onPress={() => moveMonth(-1)} style={styles.calendarArrowButton}>
          <ChevronLeft color={muted} size={18} />
        </Pressable>
        <Text style={styles.calendarPickerText}>{monthPickerNames[visibleMonth.getMonth()]} {visibleMonth.getFullYear()}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Следующий месяц в выборе даты" onPress={() => moveMonth(1)} style={styles.calendarArrowButton}>
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
                <Pressable key={dateKeyValue} accessibilityRole="button" accessibilityLabel={formatFullDate(dateKeyValue)} accessibilityState={{ selected: active }} onPress={() => onSelectDate(dateKeyValue)} style={[styles.plannerCalendarDay, compact && styles.plannerCalendarDayCompact, active && styles.plannerCalendarDayActive]}>
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
              accessibilityLabel="Часы"
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
              accessibilityLabel="Минуты"
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

function formatFullDate(value: string) {
  const date = dateFromKey(value);
  return `${date.getDate()} ${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

function formatShortDateTime(dateValue: string, timeValue: string) {
  const date = dateFromKey(dateValue);
  const dateText = `${date.getDate()} ${monthNames[date.getMonth()]}`;
  return timeValue ? `${dateText}, ${timeValue}` : `${dateText}, без времени`;
}

