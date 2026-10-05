import { RightPanel } from '../components/RightPanel';
import { useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { emotionGroups, type EmotionEntry } from '../emotionJournal';
import { accent, accentSoft, line, muted, panel, text } from '../theme';
import { uid } from '../utils';

function localDateTime(value = new Date().toISOString()) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function parseEmotionDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value.replace(' ', 'T'));
  return Number.isFinite(date.getTime()) && localDateTime(date.toISOString()) === value ? date.toISOString() : null;
}

export function EmotionJournal({ entries, onSave, onBack, isDesktop = false }: { isDesktop?: boolean; entries: EmotionEntry[]; onSave: (entry: EmotionEntry) => void; onBack: () => void }) {
  const scroll = useRef<ScrollView>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(() => localDateTime());
  const [event, setEvent] = useState('');
  const [group, setGroup] = useState('');
  const [emotion, setEmotion] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const preview = entries.find(entry => entry.id === previewId && !entry.deletedAt);
  function closePreview() { setPreviewId(null); setDeleteId(null); }
  const visible = entries.filter(entry => !entry.deletedAt);
  function clear() { setEditingId(null); setDate(localDateTime()); setEvent(''); setGroup(''); setEmotion(''); setAction(''); setSearch(''); }
  function save() {
    const occurredAt = parseEmotionDate(date);
    if (!occurredAt) { setMessage('Укажите дату и время в формате ГГГГ-ММ-ДД ЧЧ:ММ.'); return; }
    if (!event.trim() || !emotion || !action.trim()) { setMessage('Опишите событие, выберите чувство и укажите действие.'); return; }
    onSave({ id: editingId ?? uid('emotion'), occurredAt, event: event.trim(), group, emotion, action: action.trim(), updatedAt: new Date().toISOString() });
    clear(); setMessage('Запись сохранена в истории.');
  }
  const button = (label: string, onPress: () => void, selected = false) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={[s.chip, selected && s.selected]}><Text style={{ color: selected ? accent : text }}>{label}</Text></Pressable>;
  return <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={s.page}>
    <View style={[s.layout, isDesktop && s.desktopLayout]}>
    <View style={[s.main, isDesktop && s.desktopMain]}>
    <View style={s.row}>{button('← Обычный дневник', onBack)}<Text style={s.heading}>Эмоциональный дневник</Text></View>
    <Text style={s.hint}>Событие → чувство → действие. Можно начать с общего чувства и выбрать более точное из таблицы.</Text>
    <View style={s.card}>
      <Text style={s.heading}>{editingId ? 'Редактирование записи' : 'Новая запись'}</Text>
      <Text style={s.label}>Дата и время события</Text>
      <TextInput accessibilityLabel="Дата и время события" value={date} onChangeText={setDate} placeholder="ГГГГ-ММ-ДД ЧЧ:ММ" placeholderTextColor={muted} style={s.input} />
      <Text style={s.label}>1. Что произошло?</Text>
      <TextInput accessibilityLabel="Событие" multiline value={event} onChangeText={setEvent} placeholder="Опишите ситуацию" placeholderTextColor={muted} style={[s.input, s.multiline]} />
      <Text style={s.label}>2. Что я почувствовал(а)?</Text>
      <View style={s.row}>{Object.keys(emotionGroups).map(name => button(name, () => { setGroup(name); setEmotion(''); setSearch(''); }, group === name))}</View>
      {group ? <>
        <TextInput accessibilityLabel="Поиск чувства" value={search} onChangeText={setSearch} placeholder="Найти более точное чувство" placeholderTextColor={muted} style={s.input} />
        <View style={s.row}>
          {['Гнев', 'Страх', 'Грусть', 'Радость', 'Любовь'].includes(group) ? button(`Пока только ${group.toLowerCase()}`, () => setEmotion(group), emotion === group) : null}
          {emotionGroups[group].filter(name => name.toLocaleLowerCase('ru').includes(search.toLocaleLowerCase('ru'))).map(name => button(name, () => setEmotion(name), emotion === name))}
        </View>
      </> : null}
      {emotion ? <Text style={{ color: accent }}>Выбрано: {group} → {emotion}</Text> : null}
      <Text style={s.label}>3. Что я сделал(а)?</Text>
      <TextInput accessibilityLabel="Действие" multiline value={action} onChangeText={setAction} placeholder="Как вы отреагировали? Можно написать «ничего не сделал(а)»." placeholderTextColor={muted} style={[s.input, s.multiline]} />
      <View style={s.row}>{button('Сохранить запись', save, true)}{editingId ? button('Отменить редактирование', () => { clear(); setMessage(''); }) : null}</View>
      {message ? <Text accessibilityLiveRegion="polite" style={s.hint}>{message}</Text> : null}
    </View>
    </View>
    <RightPanel enabled={isDesktop}>
    <View style={[s.history, isDesktop && s.desktopHistory]}>
    <Text style={s.heading}>История · {visible.length}</Text>
    {!visible.length ? <Text style={s.hint}>Здесь появятся сохранённые записи. В один день можно добавить несколько событий.</Text> : null}
    <View style={s.historyList}>
      {visible.map(entry => <Pressable key={entry.id} accessibilityRole="button" accessibilityLabel={`Открыть запись: ${entry.event}`} onPress={() => { setDeleteId(null); setPreviewId(entry.id); }} style={s.historyRow}>
        <Text style={s.historyDate}>{new Date(entry.occurredAt).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={s.historyEvent}>{entry.event.replace(/\s+/g, ' ')}</Text>
        <Text style={s.hint}>›</Text>
      </Pressable>)}
    </View>
    </View>
    </RightPanel>
    </View>
    <Modal transparent animationType="fade" visible={Boolean(preview)} onRequestClose={closePreview}>
      <View style={s.overlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Закрыть запись" onPress={closePreview} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
        {preview ? <View accessibilityViewIsModal style={s.popup}>
          <View style={s.popupHeader}><Text style={s.heading}>Запись дневника</Text>{button('Закрыть', closePreview)}</View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.popupContent}>
      <Text style={s.hint}>{new Date(preview.occurredAt).toLocaleString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</Text>
      <Text style={s.label}>Событие</Text><Text style={s.body}>{preview.event}</Text>
      <Text style={s.label}>Чувство</Text><Text style={{ color: accent }}>{preview.group === preview.emotion ? preview.emotion : `${preview.group} → ${preview.emotion}`}</Text>
      <Text style={s.label}>Действие</Text><Text style={s.body}>{preview.action}</Text>
      <View style={s.row}>{button('Редактировать', () => { closePreview(); scroll.current?.scrollTo({ y: 0, animated: true }); setEditingId(preview.id); setDate(localDateTime(preview.occurredAt)); setEvent(preview.event); setGroup(preview.group); setEmotion(preview.emotion); setAction(preview.action); setSearch(''); setMessage('Запись открыта в форме выше.'); })}{button('Удалить', () => setDeleteId(preview.id))}</View>
      {deleteId === preview.id ? <View style={s.row}><Text style={s.hint}>Удалить эту запись?</Text>{button('Да, удалить', () => { const now = new Date().toISOString(); onSave({ ...preview, deletedAt: now, updatedAt: now }); closePreview(); if (editingId === preview.id) clear(); })}{button('Отмена', () => setDeleteId(null))}</View> : null}

          </ScrollView>
        </View> : null}
      </View>
    </Modal>
  </ScrollView>;
}

const s = StyleSheet.create({
  layout: { gap: 18 },
  desktopLayout: { flexDirection: 'row', alignItems: 'flex-start', gap: 0 },
  main: { flex: 1, minWidth: 0, gap: 18 },
  desktopMain: { maxWidth: 860, marginRight: 'auto' },
  history: { gap: 14 },
  desktopHistory: { width: 282, borderLeftWidth: 1, borderLeftColor: line, paddingLeft: 20 },
  historyList: { borderWidth: 1, borderColor: line, borderRadius: 10, overflow: 'hidden' },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line, backgroundColor: panel },
  historyDate: { color: muted, fontSize: 13, flexShrink: 0 },
  historyEvent: { color: text, fontSize: 15, flex: 1, minWidth: 0 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  popup: { backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 14, width: '100%', maxWidth: 600, maxHeight: '85%', overflow: 'hidden' },
  popupHeader: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: 18, borderBottomWidth: 1, borderBottomColor: line },
  popupContent: { padding: 18, gap: 12 },
  page: { padding: 20, gap: 18, paddingBottom: 60 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  heading: { color: text, fontSize: 22, fontWeight: '600' },
  hint: { color: muted, fontSize: 14, lineHeight: 21 },
  body: { color: text, fontSize: 16, lineHeight: 24 },
  label: { color: text, fontWeight: '600', fontSize: 15, marginTop: 8 },
  card: { backgroundColor: panel, borderColor: line, borderWidth: 1, borderRadius: 14, padding: 18, gap: 12 },
  input: { color: text, borderWidth: 1, borderColor: line, borderRadius: 8, padding: 12, fontSize: 16, lineHeight: 24, minHeight: 48 },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  chip: { paddingHorizontal: 14, paddingVertical: 11, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: line, borderRadius: 9 },
  selected: { borderColor: accent, backgroundColor: accentSoft },
});
