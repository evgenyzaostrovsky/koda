import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ChevronLeft, ChevronRight, Edit3, Trash2, X } from 'lucide-react-native';
import type { Habit } from '../types';
import { defaultHabitMonth, defaultHabitYear, monthNames } from '../constants';
import { getCurrentWeekDates, getCurrentWeekHabitDays, getHabitMonthDays } from '../utils';
import { Card, InlineAdd, SectionTitle } from '../components';
import { accent, faint, muted, text } from '../theme';
import { styles } from '../styles';

export function HabitsScreen({
  habits,
  onAddHabit,
  onDeleteHabit,
  onToggleDay,
  onToggleMonthDay,
  onUpdateHabit,
}: {
  habits: Habit[];
  onAddHabit: (title: string) => void;
  onDeleteHabit: (id: string) => void;
  onToggleDay: (id: string, dayIndex: number) => void;
  onToggleMonthDay: (id: string, dayIndex: number, year: number, monthIndex: number) => void;
  onUpdateHabit: (id: string, patch: Pick<Habit, 'title' | 'target'>) => void;
}) {
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const selectedHabit = habits.find((habit) => habit.id === selectedHabitId) ?? null;

  return (
    <ScrollView contentContainerStyle={styles.scrollContent} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
      <SectionTitle title="Трекер привычек" subtitle="20 - 26 мая" />
      <View style={styles.weekRow}>
        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day, index) => (
          <View key={day} style={[styles.dayPill, index === 1 && styles.dayPillActive]}>
            <Text style={[styles.dayText, index === 1 && styles.dayTextActive]}>{day}</Text>
          </View>
        ))}
      </View>
      <View style={styles.list}>
        {habits.map((habit) => {
          const weekDates = getCurrentWeekDates();
          const weekDoneDays = getCurrentWeekHabitDays(habit);

          return (
            <Card key={habit.id}>
              <View style={styles.habitHeader}>
                <Pressable onPress={() => setSelectedHabitId(habit.id)} style={styles.habitInfo} testID={`open-habit-${habit.id}`}>
                  <Text style={styles.rowTitle}>{habit.title}</Text>
                  <Text style={styles.rowMeta}>{habit.target}</Text>
                </Pressable>
                <View style={styles.habitActions}>
                  <Pressable onPress={() => setSelectedHabitId(habit.id)} style={styles.iconButton} testID={`edit-habit-${habit.id}`}>
                    <Edit3 color={accent} size={15} />
                  </Pressable>
                  <Pressable onPress={() => onDeleteHabit(habit.id)} style={styles.iconButton} testID={`delete-habit-${habit.id}`}>
                    <Trash2 color={muted} size={15} />
                  </Pressable>
                </View>
              </View>
              <View style={styles.habitWeekRow}>
                {weekDates.map((date, index) => {
                  const done = weekDoneDays[index];

                  return (
                    <Pressable key={`${habit.id}-${date.toISOString()}`} onPress={() => onToggleDay(habit.id, index)} style={styles.habitWeekCell}>
                      <Text style={[styles.habitWeekDate, done && styles.habitWeekDateDone]}>{date.getDate()}</Text>
                      <View style={[styles.habitDot, done && styles.habitDotDone]} />
                    </Pressable>
                  );
                })}
              </View>
            </Card>
          );
        })}
      </View>
      <InlineAdd buttonLabel="Привычка" onSubmit={onAddHabit} placeholder="Новая привычка" />
      <HabitDetailsModal
        habit={selectedHabit}
        onClose={() => setSelectedHabitId(null)}
        onDelete={(id) => {
          onDeleteHabit(id);
          setSelectedHabitId(null);
        }}
        onToggleMonthDay={onToggleMonthDay}
        onUpdate={onUpdateHabit}
      />
    </ScrollView>
  );
}

export function HabitDetailsModal({
  habit,
  onClose,
  onDelete,
  onToggleMonthDay,
  onUpdate,
}: {
  habit: Habit | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  onToggleMonthDay: (id: string, dayIndex: number, year: number, monthIndex: number) => void;
  onUpdate: (id: string, patch: Pick<Habit, 'title' | 'target'>) => void;
}) {
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [displayMonth, setDisplayMonth] = useState(defaultHabitMonth);
  const [displayYear, setDisplayYear] = useState(defaultHabitYear);

  useEffect(() => {
    setTitle(habit?.title ?? '');
    setTarget(habit?.target ?? '');
  }, [habit?.id, habit?.target, habit?.title]);

  if (!habit) return null;

  const currentHabit = habit;
  const visibleMonthDays = getHabitMonthDays(currentHabit, displayYear, displayMonth);
  const completedDays = visibleMonthDays.filter(Boolean).length;
  const canSave = Boolean(title.trim() && target.trim());

  function save() {
    if (!canSave) return;
    onUpdate(currentHabit.id, { title: title.trim(), target: target.trim() });
    onClose();
  }

  function shiftMonth(delta: number) {
    const nextDate = new Date(displayYear, displayMonth + delta, 1);
    setDisplayMonth(nextDate.getMonth());
    setDisplayYear(nextDate.getFullYear());
  }

  function shiftYear(delta: number) {
    setDisplayYear((year) => year + delta);
  }

  return (
    <Modal animationType="fade" transparent visible={Boolean(habit)} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.cardLabel}>ПРИВЫЧКА</Text>
              <Text style={styles.modalTitle}>{title.trim() || habit.title}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <X color={text} size={17} />
            </Pressable>
          </View>

          <View style={styles.modalFields}>
            <TextInput
              onChangeText={setTitle}
              placeholder="Название привычки"
              placeholderTextColor={faint}
              style={styles.modalInput}
              value={title}
            />
            <TextInput
              onChangeText={setTarget}
              placeholder="Цель или частота"
              placeholderTextColor={faint}
              style={styles.modalInput}
              value={target}
            />
          </View>

          <View style={styles.calendarToolbar}>
            <View style={styles.calendarStepper}>
              <Pressable onPress={() => shiftMonth(-1)} style={styles.calendarArrowButton} testID="habit-prev-month">
                <ChevronLeft color={muted} size={15} />
              </Pressable>
              <Text style={styles.calendarPickerText}>{monthNames[displayMonth]}</Text>
              <Pressable onPress={() => shiftMonth(1)} style={styles.calendarArrowButton} testID="habit-next-month">
                <ChevronRight color={muted} size={15} />
              </Pressable>
            </View>
            <View style={styles.calendarStepper}>
              <Pressable onPress={() => shiftYear(-1)} style={styles.calendarArrowButton} testID="habit-prev-year">
                <ChevronLeft color={muted} size={15} />
              </Pressable>
              <Text style={styles.calendarPickerText}>{displayYear}</Text>
              <Pressable onPress={() => shiftYear(1)} style={styles.calendarArrowButton} testID="habit-next-year">
                <ChevronRight color={muted} size={15} />
              </Pressable>
            </View>
          </View>

          <View style={styles.rowBetween}>
            <Text style={styles.cardLabel}>КАЛЕНДАРЬ</Text>
            <Text style={styles.rowMeta}>{completedDays} / {visibleMonthDays.length} выполнено</Text>
          </View>

          <View style={styles.calendarWeekRow}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => (
              <Text key={day} style={styles.calendarWeekText}>{day}</Text>
            ))}
          </View>
          <View style={styles.calendarGrid}>
            {visibleMonthDays.map((done, index) => (
              <Pressable
                key={`${habit.id}-${displayYear}-${displayMonth}-${index}`}
                onPress={() => onToggleMonthDay(habit.id, index, displayYear, displayMonth)}
                style={[styles.calendarDay, done && styles.calendarDayDone]}
              >
                <Text style={[styles.calendarDayText, done && styles.calendarDayTextDone]}>{index + 1}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.modalActions}>
            <Pressable onPress={() => onDelete(habit.id)} style={styles.deleteButton}>
              <Trash2 color={muted} size={15} />
              <Text style={styles.deleteButtonText}>Удалить</Text>
            </Pressable>
            <Pressable disabled={!canSave} onPress={save} style={[styles.saveButton, !canSave && styles.saveButtonDisabled]} testID="habit-save">
              <Text style={styles.saveButtonText}>Сохранить</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

