import { EmotionJournal } from './EmotionJournal';
import type { EmotionEntry } from '../emotionJournal';
import { RightPanel } from '../components/RightPanel';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Clock, Plus, Smile, Tags, Trash2, X } from 'lucide-react-native';
import type { JournalEntry, JournalMood } from '../types';
import { dayTagOptions, defaultJournalEntry } from '../constants';
import { sleepDurationMinutes } from '../utils';
import { SectionTitle } from '../components';
import { BentoCard, bentoWidths, SectionHeader } from '../components/Bento';
import { accent, activeText, faint, muted, text as textColor } from '../theme';
import { styles } from '../styles';

const hours = Array.from({ length: 24 }, (_, index) => index);
const compactJournalCard = { padding: 16, gap: 12 } as const;
const minutes = Array.from({ length: 60 }, (_, index) => index);
const sleepWheelItemStep = 38;
const journalOverviewStyles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20 },
  wrap: { alignSelf: 'center', gap: 16, maxWidth: 620, width: '100%' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  card: { gap: 12 },
  text: { color: textColor, fontSize: 15, lineHeight: 22 },
  meta: { gap: 6 },
  metaText: { color: muted, fontSize: 13, lineHeight: 18 },
  footer: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingTop: 4 },
});

function sleepDurationLabel(sleepStart: string, wakeTime: string) {
  const duration = sleepDurationMinutes(sleepStart, wakeTime);
  if (duration === null) return '—';

  const hours = Math.floor(duration / 60);
  const minutes = duration % 60;

  return `${hours} ч ${minutes.toString().padStart(2, '0')} мин`;
}

function journalEntryLabel(entry: JournalEntry, index: number) {
  if (!entry.createdAt) return index === 0 ? 'Новая' : `Запись ${index + 1}`;

  const createdAt = new Date(entry.createdAt);
  if (Number.isNaN(createdAt.getTime())) return `Запись ${index + 1}`;

  return createdAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function journalEntryDateLabel(entry: JournalEntry) {
  if (!entry.createdAt) return 'Сегодня';

  const createdAt = new Date(entry.createdAt);
  if (Number.isNaN(createdAt.getTime())) return 'Сегодня';

  return createdAt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function journalEntryPreview(entry: JournalEntry) {
  const cleanText = entry.text.trim().replace(/\s+/g, ' ');
  if (!cleanText) return 'Без текста';

  return cleanText.length > 42 ? `${cleanText.slice(0, 42)}...` : cleanText;
}

function isVisibleHistoryEntry(entry: JournalEntry) {
  return (
    Boolean(entry.text.trim()) ||
    entry.tags.length > 0 ||
    entry.sleepStart !== defaultJournalEntry.sleepStart ||
    entry.wakeTime !== defaultJournalEntry.wakeTime ||
    entry.mood !== defaultJournalEntry.mood
  );
}

export function JournalScreen({
  activeEntryId,
  canAddEntry,
  entries,
  entry,
  isDesktop = false,
  onAddEntry,
  onDeleteEntry,
  onSelectEntry,
  onUpdate,
  emotionEntries,
  onSaveEmotion,
}: {
  emotionEntries: EmotionEntry[];
  onSaveEmotion: (entry: EmotionEntry) => void;
  activeEntryId: string;
  canAddEntry: boolean;
  entries: JournalEntry[];
  entry: JournalEntry;
  isDesktop?: boolean;
  onAddEntry: () => void;
  onDeleteEntry: (id: string) => void;
  onSelectEntry: (id: string) => void;
  onUpdate: (patch: Partial<JournalEntry>) => void;
}) {
  const [emotionalMode, setEmotionalMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
  const [hoveredDeleteEntryId, setHoveredDeleteEntryId] = useState<string | null>(null);
  const [previewEntryId, setPreviewEntryId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [sleepOpen, setSleepOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [moodOpen, setMoodOpen] = useState(false);
  const sleepDuration = sleepDurationLabel(entry.sleepStart, entry.wakeTime);
  const previewEntry = entries.find((item) => item.id === previewEntryId) ?? null;
  const isCurrentEntry = entry.id === entries[0]?.id;
  const hasSleepData = entry.sleepStart !== defaultJournalEntry.sleepStart || entry.wakeTime !== defaultJournalEntry.wakeTime;
  const hasTags = entry.tags.length > 0;
  const hasMoodData = entry.mood !== defaultJournalEntry.mood;
  const historyEntries = entries.filter(isVisibleHistoryEntry);

  useEffect(() => {
    setSleepOpen(entry.sleepStart !== defaultJournalEntry.sleepStart || entry.wakeTime !== defaultJournalEntry.wakeTime);
    setTagsOpen(entry.tags.length > 0);
    setMoodOpen(entry.mood !== defaultJournalEntry.mood);
  }, [entry.id]);

  function toggleTag(tag: string) {
    const nextTags = entry.tags.includes(tag) ? entry.tags.filter((item) => item !== tag) : [...entry.tags, tag];
    onUpdate({ tags: nextTags });
  }

  function requestDeleteEntry(id: string, event?: { stopPropagation?: () => void }) {
    event?.stopPropagation?.();
    setDeleteEntryId(id);
  }

  function confirmDeleteEntry() {
    if (!deleteEntryId) return;
    onDeleteEntry(deleteEntryId);
    if (previewEntryId === deleteEntryId) setPreviewEntryId(null);
    setDeleteEntryId(null);
  }

  if (emotionalMode) return <EmotionJournal isDesktop={isDesktop} entries={emotionEntries} onSave={onSaveEmotion} onBack={() => setEmotionalMode(false)} />;
  return (
    <ScrollView contentContainerStyle={[styles.scrollContent, isDesktop && styles.desktopPageScroll, !editorOpen && journalOverviewStyles.scroll, { alignSelf: 'center', maxWidth: bentoWidths.journal, width: '100%' }]} showsVerticalScrollIndicator={false}>
      {!editorOpen ? <View style={journalOverviewStyles.wrap}>
        <SectionHeader title="Дневник" subtitle={journalEntryDateLabel(entry)} action={<View style={journalOverviewStyles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.journalHistoryButton}><Text style={styles.journalHistoryText}>История</Text></Pressable>
          <Pressable accessibilityRole="button" onPress={() => setEmotionalMode(true)} style={styles.journalHistoryButton}><Text style={styles.journalHistoryText}>Эмоции</Text></Pressable>
        </View>} />
        <BentoCard tone="light" style={journalOverviewStyles.card}>
          <Text style={styles.cardLabel}>МЫСЛИ ДНЯ</Text>
          <Text numberOfLines={3} style={journalOverviewStyles.text}>{entry.text.trim() || 'Запись пока пустая.'}</Text>
          {(hasSleepData || hasMoodData || hasTags) ? <View style={journalOverviewStyles.meta}>
            {hasSleepData ? <Text style={journalOverviewStyles.metaText}>Сон {entry.sleepStart} – {entry.wakeTime} · {sleepDuration}</Text> : null}
            {hasMoodData ? <Text style={journalOverviewStyles.metaText}>Настроение {entry.mood} / 5</Text> : null}
            {hasTags ? <Text numberOfLines={1} style={journalOverviewStyles.metaText}>Метки: {entry.tags.join(', ')}</Text> : null}
          </View> : <Text style={styles.rowMeta}>Сон, метки и настроение можно добавить в записи.</Text>}
          <View style={journalOverviewStyles.footer}>
            <Pressable accessibilityRole="button" onPress={() => setEditorOpen(true)} style={styles.saveButton}><Text style={styles.saveButtonText}>{entry.text.trim() ? 'Открыть дневник' : 'Заполнить запись'}</Text></Pressable>
            {!isCurrentEntry ? <Pressable accessibilityRole="button" onPress={() => { onSelectEntry(entries[0]?.id ?? activeEntryId); setEditorOpen(true); }} style={styles.journalHistoryButton}><Text style={styles.journalHistoryText}>Сегодня</Text></Pressable> : null}
          </View>
        </BentoCard>
        {historyEntries.length ? <Text style={styles.rowMeta}>Записей в истории: {historyEntries.length}</Text> : null}
      </View> : null}
      {editorOpen && !isDesktop ? <View style={styles.journalHeader}>
        <SectionTitle title="Дневник" subtitle="Сон, настроение, мысли" />
        <View style={styles.journalHeaderActions}>
          <Pressable accessibilityRole="button" onPress={() => setEditorOpen(false)} style={styles.journalHistoryButton}><Text style={styles.journalHistoryText}>Обзор</Text></Pressable>
          {!isCurrentEntry ? (
            <Pressable accessibilityRole="button" onPress={() => onSelectEntry(entries[0]?.id ?? activeEntryId)} style={styles.journalReturnButton}>
              <Text style={styles.journalReturnText}>Новая запись</Text>
            </Pressable>
          ) : null}
          <Pressable accessibilityRole="button" onPress={() => setHistoryOpen(true)} style={styles.journalHistoryButton}>
            <Text style={styles.journalHistoryText}>История</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setEmotionalMode(true)} style={styles.journalHistoryButton}>
            <Text style={styles.journalHistoryText}>Эмоции</Text>
          </Pressable>
        </View>
      </View> : null}
      <Modal animationType="fade" transparent visible={historyOpen} onRequestClose={() => setHistoryOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.historyModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.cardLabel}>ДНЕВНИК</Text>
                <Text style={styles.modalTitle}>История</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Закрыть историю дневника" onPress={() => setHistoryOpen(false)} style={styles.iconButton}>
                <X color={muted} size={18} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.historyList} showsVerticalScrollIndicator={false}>
              {historyEntries.map((item, index) => {
                const active = item.id === activeEntryId;

                return (
                  <Pressable accessibilityRole="button"
                    key={item.id}
                    onPress={() => setPreviewEntryId(item.id)}
                    style={[styles.historyRow, active && styles.historyRowActive]}
                  >
                    <Text style={[styles.historyDate, active && styles.historyTextActive]}>{journalEntryDateLabel(item)}</Text>
                    <Text style={[styles.historyTime, active && styles.historyTextActive]}>{journalEntryLabel(item, index)}</Text>
                    <Text numberOfLines={1} style={[styles.historyPreview, active && styles.historyTextActive]}>
                      {journalEntryPreview(item)}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Удалить запись дневника ${journalEntryDateLabel(item)}`}
                      onHoverIn={() => setHoveredDeleteEntryId(item.id)}
                      onHoverOut={() => setHoveredDeleteEntryId((current) => (current === item.id ? null : current))}
                      onPress={(event) => requestDeleteEntry(item.id, event)}
                      style={[styles.journalHistoryDeleteButton, hoveredDeleteEntryId === item.id && styles.journalHistoryDeleteButtonHover]}
                    >
                      <Trash2 color={hoveredDeleteEntryId === item.id ? accent : active ? activeText : muted} size={13} />
                    </Pressable>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" transparent visible={Boolean(previewEntry)} onRequestClose={() => setPreviewEntryId(null)}>
        <View style={styles.modalOverlay}>
          {previewEntry ? (
            <View style={styles.historyPreviewModalCard}>
              <View style={styles.modalHeader}>
                <View>
                  <Text style={styles.cardLabel}>ДНЕВНИК</Text>
                <Text style={styles.modalTitle}>История</Text>
                </View>
                <Pressable accessibilityRole="button" accessibilityLabel="Закрыть запись дневника" onPress={() => setPreviewEntryId(null)} style={styles.iconButton}>
                  <X color={muted} size={18} />
                </Pressable>
              </View>

              <ScrollView contentContainerStyle={styles.historyPreviewContent} showsVerticalScrollIndicator={false}>
                <View>
                  <Text style={styles.cardLabel}>МЫСЛИ</Text>
                  <Text style={styles.historyPreviewText}>{previewEntry.text.trim() || 'Без текста'}</Text>
                </View>

                <View style={styles.historyPreviewStats}>
                  <View style={styles.historyPreviewStat}>
                    <Text style={styles.rowMeta}>Отбой</Text>
                    <Text style={styles.sleepValue}>{previewEntry.sleepStart}</Text>
                  </View>
                  <View style={styles.historyPreviewStat}>
                    <Text style={styles.rowMeta}>Подъем</Text>
                    <Text style={styles.sleepValue}>{previewEntry.wakeTime}</Text>
                  </View>
                  <View style={styles.historyPreviewStat}>
                    <Text style={styles.rowMeta}>Сон</Text>
                    <Text style={styles.sleepValue}>{sleepDurationLabel(previewEntry.sleepStart, previewEntry.wakeTime)}</Text>
                  </View>
                </View>

                <View>
                  <Text style={styles.cardLabel}>МЕТКИ</Text>
                  <Text style={styles.historyPreviewMeta}>{previewEntry.tags.length ? previewEntry.tags.join(', ') : 'Без меток'}</Text>
                </View>

                <View>
                  <Text style={styles.cardLabel}>НАСТРОЕНИЕ</Text>
                  <Text style={styles.historyPreviewMeta}>{previewEntry.mood} / 5</Text>
                </View>
              </ScrollView>

              <View style={styles.modalActions}>
                <Pressable accessibilityRole="button" onPress={() => setPreviewEntryId(null)} style={styles.deleteButton}>
                  <Text style={styles.deleteButtonText}>Назад</Text>
                </Pressable>
                <Pressable accessibilityRole="button"
                  onPress={() => {
                    onSelectEntry(previewEntry.id);
                    setEditorOpen(true);
                    setPreviewEntryId(null);
                    setHistoryOpen(false);
                  }}
                  style={styles.saveButton}
                >
                  <Text style={styles.saveButtonText}>Открыть</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
      <Modal animationType="fade" transparent visible={Boolean(deleteEntryId)} onRequestClose={() => setDeleteEntryId(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.quickAddModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.cardLabel}>ДНЕВНИК</Text>
                <Text style={styles.modalTitle}>Подтвердить удаление?</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Отменить удаление записи" onPress={() => setDeleteEntryId(null)} style={styles.modalCloseButton}>
                <X color={muted} size={18} />
              </Pressable>
            </View>
            <Text style={styles.rowMeta}>Запись исчезнет из истории.</Text>
            <View style={styles.plannerConfirmActions}>
              <Pressable accessibilityRole="button" onPress={() => setDeleteEntryId(null)} style={styles.plannerCancelButton}>
                <Text style={styles.plannerCancelText}>Нет</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={confirmDeleteEntry} style={styles.plannerDeleteButton}>
                <Text style={styles.plannerDeleteText}>Да, удалить</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      {editorOpen ? <View style={isDesktop ? [styles.journalDesktopLayout, { alignSelf: 'center', gap: 24, maxWidth: bentoWidths.journal, width: '100%' }] : undefined} testID={isDesktop ? 'desktop-page-columns' : undefined}>
        <View style={isDesktop ? [styles.journalDesktopMain, { maxWidth: bentoWidths.journal, width: '100%', gap:12 }] : {gap:12}} testID={isDesktop ? 'desktop-main-column' : undefined}>
      {isDesktop ? (
        <View style={styles.journalHeader}>
          <SectionTitle title="Дневник" subtitle="Сон, настроение, мысли" />
          <View style={styles.journalHeaderActions}>
            <Pressable accessibilityRole="button" onPress={() => setEditorOpen(false)} style={styles.journalHistoryButton}><Text style={styles.journalHistoryText}>Обзор</Text></Pressable>
            {!isCurrentEntry ? (
              <Pressable accessibilityRole="button" onPress={() => onSelectEntry(entries[0]?.id ?? activeEntryId)} style={styles.journalReturnButton}>
                <Text style={styles.journalReturnText}>Новая запись</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Открыть историю дневника" onPress={() => setHistoryOpen(true)} style={styles.journalHistoryButton}>
              <Text style={styles.journalHistoryText}>История</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setEmotionalMode(true)} style={styles.journalHistoryButton}>
              <Text style={styles.journalHistoryText}>Эмоции</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
      <Text style={[styles.rowMeta, { fontSize: 13, lineHeight: 18 }]}>{journalEntryDateLabel(entry)}</Text>
      {isCurrentEntry ? (
        <BentoCard tone="light">
          <Text style={styles.cardLabel}>МЫСЛИ ДНЯ</Text>
          <TextInput
            accessibilityLabel="Мысли дня"
            multiline
            onChangeText={(value) => onUpdate({ text: value })}
            placeholder="Запиши свои мысли..."
            placeholderTextColor={faint}
            style={styles.largeTextArea}
            value={entry.text}
          />
        </BentoCard>
      ) : (
        <BentoCard tone="light" style={{gap:16}}>
          <Text style={styles.cardLabel}>МЫСЛИ ДНЯ</Text>
          <Text style={styles.journalReadonlyText}>{entry.text.trim() || 'Без текста'}</Text>
        </BentoCard>
      )}
      {!isCurrentEntry ? (
        <View style={styles.journalReadonlyMetaGrid}>
          {hasSleepData ? (
            <View style={styles.journalReadonlyMetaSection}>
              <Text style={styles.journalReadonlyMetaText}>Сон: {entry.sleepStart} - {entry.wakeTime} · {sleepDuration}</Text>
            </View>
          ) : null}
          {hasTags ? (
            <View style={styles.journalReadonlyMetaSection}>
              <Text style={styles.journalReadonlyMetaText}>Метки: {entry.tags.join(', ')}</Text>
            </View>
          ) : null}
          {hasMoodData ? (
            <View style={styles.journalReadonlyMetaSection}>
              <Text style={styles.journalReadonlyMetaText}>Настроение: {entry.mood} / 5</Text>
            </View>
          ) : null}
        </View>
      ) : sleepOpen || tagsOpen || moodOpen ? null : (
        <View style={styles.journalOptionalActions}>
          <JournalOptionButton icon={<Clock color={muted} size={13} />} label="Добавить сон" onPress={() => setSleepOpen(true)} />
          <JournalOptionButton icon={<Tags color={muted} size={13} />} label="Добавить метки" onPress={() => setTagsOpen(true)} />
          <JournalOptionButton icon={<Smile color={muted} size={13} />} label="Добавить настроение" onPress={() => setMoodOpen(true)} />
        </View>
      )}
      {isCurrentEntry && sleepOpen ? (
        <BentoCard tone="soft" style={compactJournalCard}>
          <View style={styles.cardLabelRow}>
            <Clock color={muted} size={13} />
            <Text style={styles.cardLabel}>СОН</Text>
          </View>
          <View style={styles.sleepChipRow}>
            <SleepTimeField label="Отбой" onChange={(value) => onUpdate({ sleepStart: value })} value={entry.sleepStart} />
            <SleepTimeField label="Подъем" onChange={(value) => onUpdate({ wakeTime: value })} value={entry.wakeTime} />
            <View style={styles.sleepInfoChip}>
              <Text style={styles.rowMeta}>Длительность</Text>
              <Text style={styles.sleepValue}>{sleepDuration}</Text>
            </View>
          </View>
        </BentoCard>
      ) : null}
      {isCurrentEntry && tagsOpen ? (
        <BentoCard tone="soft" style={compactJournalCard}>
          <View style={styles.cardLabelRow}>
            <Tags color={muted} size={13} />
            <Text style={styles.cardLabel}>МЕТКИ ДНЯ</Text>
          </View>
          <View style={styles.tagGrid}>
            {dayTagOptions.map((tag) => {
              const active = entry.tags.includes(tag);

              return (
                <Pressable accessibilityRole="button" key={tag} onPress={() => toggleTag(tag)} style={[styles.tagChip, active && styles.tagChipActive]}>
                  <Text style={[styles.tagText, active && styles.tagTextActive]}>{tag}</Text>
                </Pressable>
              );
            })}
          </View>
        </BentoCard>
      ) : null}
      {isCurrentEntry && moodOpen ? (
        <BentoCard tone="soft" style={compactJournalCard}>
          <Text style={styles.cardLabel}>НАСТРОЕНИЕ</Text>
          <View style={styles.moodRow}>
            {[1, 2, 3, 4, 5].map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityLabel={`Настроение: ${value} из 5`}
                accessibilityState={{ selected: entry.mood === value }}
                onPress={() => onUpdate({ mood: value as JournalMood })}
                style={[styles.moodButton, entry.mood === value && styles.moodButtonActive]}
              >
                <Text style={[styles.moodText, entry.mood === value && styles.moodTextActive]}>{value}</Text>
              </Pressable>
            ))}
          </View>
        </BentoCard>
      ) : null}
      {isCurrentEntry && (sleepOpen || tagsOpen || moodOpen) && !(sleepOpen && tagsOpen && moodOpen) ? (
        <View style={styles.journalOptionalActions}>
          {sleepOpen ? null : <JournalOptionButton icon={<Clock color={muted} size={13} />} label="Добавить сон" onPress={() => setSleepOpen(true)} />}
          {tagsOpen ? null : <JournalOptionButton icon={<Tags color={muted} size={13} />} label="Добавить метки" onPress={() => setTagsOpen(true)} />}
          {moodOpen ? null : <JournalOptionButton icon={<Smile color={muted} size={13} />} label="Добавить настроение" onPress={() => setMoodOpen(true)} />}
        </View>
      ) : null}
      {isCurrentEntry ? (
        <Pressable accessibilityRole="button" disabled={!canAddEntry} onPress={onAddEntry} style={[styles.journalBottomAddButton, !canAddEntry && styles.journalBottomAddButtonDisabled]}>
          <Plus color={activeText} size={15} strokeWidth={2.8} />
          <Text style={styles.journalBottomAddText}>Добавить запись</Text>
        </Pressable>
      ) : null}
        </View>
        {isDesktop ? (
          <RightPanel enabled={isDesktop}><View style={styles.journalDesktopAside} testID="desktop-right-column">
            <View style={styles.desktopAsideHeader}>
              <Text style={styles.desktopAsideTitle}>История</Text>
              <Text style={styles.rowMeta}>{historyEntries.length}</Text>
            </View>
            <ScrollView contentContainerStyle={styles.journalDesktopHistoryList} showsVerticalScrollIndicator={false}>
              {historyEntries.map((item, index) => (
                <Pressable accessibilityRole="button" key={item.id} onPress={() => onSelectEntry(item.id)} style={[styles.journalDesktopHistoryRow, item.id === activeEntryId && styles.journalDesktopHistoryRowActive]}>
                  <Text style={styles.historyDate}>{journalEntryDateLabel(item)}</Text>
                  <Text style={styles.historyTime}>{journalEntryLabel(item, index)}</Text>
                  <Text numberOfLines={2} style={styles.historyPreview}>{journalEntryPreview(item)}</Text>
                </Pressable>
              ))}
            </ScrollView>
          </View></RightPanel>
        ) : null}
      </View> : null}
    </ScrollView>
  );
}

function JournalOptionButton({ icon, label, onPress }: { icon: ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.journalOptionButton}>
      <Plus color={muted} size={13} />
      {icon}
      <Text style={styles.journalOptionText}>{label}</Text>
    </Pressable>
  );
}

export function SleepTimeField({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerVersion, setPickerVersion] = useState(0);
  const [draftHour, setDraftHour] = useState(() => parseTimePart(value, 'hour'));
  const [draftMinute, setDraftMinute] = useState(() => parseTimePart(value, 'minute'));

  function openPicker() {
    setDraftHour(parseTimePart(value, 'hour'));
    setDraftMinute(parseTimePart(value, 'minute'));
    setPickerVersion((version) => version + 1);
    setPickerOpen(true);
  }

  function saveTime() {
    onChange(formatTimeValue(draftHour, draftMinute));
    setPickerOpen(false);
  }

  return (
    <>
    <Pressable accessibilityRole="button" onPress={openPicker} style={styles.sleepInputChip}>
      <Text style={styles.rowMeta}>{label}</Text>
      <Text style={styles.sleepValue}>{value || '00:00'}</Text>
    </Pressable>
    <Modal animationType="fade" transparent visible={pickerOpen} onRequestClose={() => setPickerOpen(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.sleepPickerCard}>
          <View style={styles.modalHeader}>
            <View>
              <Text style={styles.cardLabel}>{label}</Text>
              <Text style={styles.modalTitle}>{formatTimeValue(draftHour, draftMinute)}</Text>
            </View>
            <Pressable accessibilityRole="button" onPress={() => setPickerOpen(false)} style={styles.iconButton}>
              <X color={muted} size={18} />
            </Pressable>
          </View>

          <View style={styles.sleepWheel}>
            <View pointerEvents="none" style={styles.sleepWheelSelection} />
            <TimeWheelColumn items={hours} resetKey={pickerVersion} value={draftHour} onChange={setDraftHour} />
            <Text style={styles.sleepWheelColon}>:</Text>
            <TimeWheelColumn items={minutes} resetKey={pickerVersion} value={draftMinute} onChange={setDraftMinute} />
          </View>

          <View style={styles.modalActions}>
            <Pressable accessibilityRole="button" onPress={() => setPickerOpen(false)} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>Закрыть</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={saveTime} style={styles.saveButton}>
              <Text style={styles.saveButtonText}>Выбрать</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

function TimeWheelColumn({ items, onChange, resetKey, value }: { items: number[]; onChange: (value: number) => void; resetKey: number; value: number }) {
  const scrollRef = useRef<ScrollView | null>(null);
  const selectedRef = useRef(value);

  useEffect(() => {
    scrollRef.current?.scrollTo({ animated: false, y: value * sleepWheelItemStep });
    selectedRef.current = value;
  }, [resetKey]);

  function getCenteredIndex(event: NativeSyntheticEvent<NativeScrollEvent>) {
    return Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.y / sleepWheelItemStep)));
  }

  function updateCenteredItem(event: NativeSyntheticEvent<NativeScrollEvent>) {
    const index = getCenteredIndex(event);
    const nextValue = items[index];

    if (nextValue === selectedRef.current) return;

    selectedRef.current = nextValue;
    onChange(nextValue);
  }

  return (
    <View style={styles.sleepWheelColumnShell}>
      <ScrollView
        contentContainerStyle={styles.sleepWheelColumnContent}
        decelerationRate="fast"
        onScroll={updateCenteredItem}
        ref={scrollRef}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        snapToInterval={sleepWheelItemStep}
        style={styles.sleepWheelColumn}
      >
        {items.map((item) => (
          <Pressable accessibilityRole="button"
            key={item}
            onPress={() => {
              selectedRef.current = item;
              onChange(item);
              scrollRef.current?.scrollTo({ animated: true, y: items.indexOf(item) * sleepWheelItemStep });
            }}
            style={styles.sleepWheelItem}
          >
            <Text style={styles.sleepWheelText}>{item.toString().padStart(2, '0')}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function parseTimePart(value: string, part: 'hour' | 'minute') {
  const [rawHour = '0', rawMinute = '0'] = value.split(':');
  const numberValue = Number(part === 'hour' ? rawHour : rawMinute);
  const max = part === 'hour' ? 23 : 59;

  if (!Number.isFinite(numberValue)) return 0;

  return Math.max(0, Math.min(max, Math.trunc(numberValue)));
}

function formatTimeValue(hour: number, minute: number) {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

