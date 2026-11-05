import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, ChevronDown, Clock3, Pause, Play, Sparkles, X } from 'lucide-react-native';
import { accent, accentFaint, activeBg, activeText, line, lineStrong, muted, panel, panelSoft, text } from '../theme';

type AutoPlanSettings = { enabled: boolean; dailyMinutes: number };

type Props = {
  userId?: string | null;
  enabled: boolean;
  dailyMinutes: number;
  busy: boolean;
  error?: string;
  statusText?: string;
  onSave: (settings: AutoPlanSettings) => Promise<void>;
  onRun: () => Promise<void>;
};

const minuteOptions = [30, 60, 120];

export function AutoPlanControl({ userId, enabled, dailyMinutes, busy, error, statusText, onSave, onRun }: Props) {
  const [open, setOpen] = useState(false);
  const [draftEnabled, setDraftEnabled] = useState(enabled);
  const [draftMinutes, setDraftMinutes] = useState(dailyMinutes);
  const [localError, setLocalError] = useState('');
  const [action, setAction] = useState<'save' | 'run' | null>(null);
  const actionLock = useRef(false);
  const signedIn = Boolean(userId);
  const working = busy || action !== null;

  useEffect(() => {
    setOpen(false);
    setDraftEnabled(enabled);
    setDraftMinutes(dailyMinutes);
    setLocalError('');
    actionLock.current = false;
    setAction(null);
  }, [userId]);

  function openSettings() {
    setDraftEnabled(enabled);
    setDraftMinutes(dailyMinutes);
    setLocalError('');
    setOpen(true);
  }

  async function save() {
    if (!signedIn || working || actionLock.current) return;
    actionLock.current = true;
    setAction('save');
    setLocalError('');
    try {
      await onSave({ enabled: draftEnabled, dailyMinutes: draftMinutes });
      setOpen(false);
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Не удалось сохранить настройки. Попробуйте ещё раз.');
    } finally {
      actionLock.current = false;
      setAction(null);
    }
  }

  async function run() {
    if (!signedIn || working || actionLock.current) return;
    actionLock.current = true;
    setAction('run');
    setLocalError('');
    try {
      await onRun();
    } catch (reason) {
      setLocalError(reason instanceof Error ? reason.message : 'Не удалось собрать план. Попробуйте ещё раз.');
    } finally {
      actionLock.current = false;
      setAction(null);
    }
  }

  const shownError = localError || error;

  return <>
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Автоплан, ${enabled ? 'включён' : 'выключен'}. Открыть настройки`}
      accessibilityState={{ expanded: open, disabled: false }}
      onPress={openSettings}
      style={({ pressed }) => [s.trigger, enabled && s.triggerEnabled, pressed && s.pressed]}
    >
      <Sparkles size={15} color={enabled ? activeText : muted} />
      <Text style={[s.triggerText, enabled && s.triggerTextEnabled]}>Автоплан</Text>
      <View style={[s.stateDot, enabled && s.stateDotEnabled]} />
      <ChevronDown size={14} color={enabled ? activeText : muted} />
    </Pressable>

    <Modal transparent visible={open} animationType="fade" onRequestClose={() => !working && setOpen(false)}>
      <View style={s.overlay}>
        <View accessibilityViewIsModal style={s.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator contentContainerStyle={s.content}>
          <View style={s.heading}>
            <View style={s.titleWrap}>
              <Text accessibilityRole="header" style={s.title}>Автоплан</Text>
              <Text style={s.subtitle}>{enabled ? 'Настройки действуют для ваших главных целей' : 'Помогает распределить следующие шаги по дням'}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть настройки автоплана" disabled={working} onPress={() => setOpen(false)} style={s.close}>
              <X size={19} color={muted} />
            </Pressable>
          </View>

          {!signedIn ? <View accessibilityRole="alert" style={s.loginNotice}>
            <Text style={s.loginTitle}>Войдите, чтобы пользоваться автопланом</Text>
            <Text style={s.body}>Настройки и план сохраняются в вашем аккаунте. После входа вы сможете включить автоплан и собрать дела на сегодня.</Text>
          </View> : <>
            <View style={s.section}>
              <Text style={s.label}>Автоматическое продолжение</Text>
              <View style={s.toggleRow}>
                <View style={s.toggleCopy}>
                  <Text style={s.optionTitle}>{draftEnabled ? 'Автоплан включён' : 'Автоплан на паузе'}</Text>
                  <Text style={s.caption}>Можно изменить в любое время</Text>
                </View>
                <Pressable
                  accessibilityRole="switch"
                  accessibilityLabel="Автоматическое продолжение автоплана"
                  accessibilityState={{ checked: draftEnabled, disabled: working }}
                  disabled={working}
                  onPress={() => setDraftEnabled(value => !value)}
                  style={[s.toggle, draftEnabled && s.toggleOn, working && s.disabled]}
                >
                  <View style={[s.toggleKnob, draftEnabled && s.toggleKnobOn]} />
                </Pressable>
              </View>
            </View>

            <View style={s.section}>
              <View style={s.labelRow}><Clock3 size={14} color={muted} /><Text style={s.label}>Лимит на день</Text></View>
              <View style={s.minutesRow}>
                {minuteOptions.map(minutes => {
                  const selected = draftMinutes === minutes;
                  return <Pressable key={minutes} accessibilityRole="radio" accessibilityState={{ selected, disabled: working }} disabled={working} onPress={() => setDraftMinutes(minutes)} style={[s.minuteChoice, selected && s.minuteChoiceSelected, working && s.disabled]}>
                    {selected && <Check size={14} color={accent} />}
                    <Text style={[s.minuteText, selected && s.minuteTextSelected]}>{minutes} мин</Text>
                  </Pressable>;
                })}
              </View>
            </View>

            <View style={s.explainer}>
              <Text style={s.explainerTitle}>Как работает автоплан</Text>
              <Text style={s.body}>• До одного действия для каждой главной цели в пределах дневного лимита.</Text>
              <Text style={s.body}>• Задачи без назначенного времени; встречи автоплан не трогает.</Text>
              <Text style={s.body}>• Незавершённые задачи переносятся, а следующий шаг появляется на следующий день после выполнения.</Text>
              <Text style={s.body}>• Пока остались незавершённые шаги, новые не добавляются. Если время действия не указано, считаем его за 20 минут.</Text>
            </View>

            {statusText ? <Text accessibilityLiveRegion="polite" style={s.status}>{statusText}</Text> : null}
            {shownError ? <Text accessibilityRole="alert" style={s.error}>{shownError}</Text> : null}

            <View style={s.actions}>
              <Pressable accessibilityRole="button" disabled={working} onPress={() => void run()} style={[s.runButton, working && s.disabled]}>
                {action === 'run' ? <ActivityIndicator size="small" color={activeText} /> : <Play size={15} color={activeText} fill={activeText} />}
                <Text style={s.runText}>Собрать сегодня</Text>
              </Pressable>
              <Pressable accessibilityRole="button" disabled={working} onPress={() => void save()} style={[s.saveButton, working && s.disabled]}>
                {action === 'save' ? <ActivityIndicator size="small" color={text} /> : draftEnabled ? <Check size={16} color={text} /> : <Pause size={15} color={text} />}
                <Text style={s.saveText}>{draftEnabled ? 'Сохранить' : 'Сохранить паузу'}</Text>
              </Pressable>
            </View>
          </>}
          </ScrollView>
        </View>
      </View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  trigger: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: line, backgroundColor: panel },
  triggerEnabled: { borderColor: 'var(--koda-accent-border, #a3b467)', backgroundColor: activeBg },
  triggerText: { color: text, fontSize: 12, fontWeight: '600' }, triggerTextEnabled: { color: activeText },
  stateDot: { width: 6, height: 6, borderRadius: 4, backgroundColor: muted }, stateDotEnabled: { backgroundColor: accent },
  pressed: { opacity: .78 }, overlay: { flex: 1, padding: 16, backgroundColor: 'rgba(17,24,18,.46)', alignItems: 'center', justifyContent: 'center' },
  sheet: { width: '100%', maxWidth: 440, maxHeight: '92%', borderRadius: 22, borderWidth: 1, borderColor: line, backgroundColor: panel, overflow: 'hidden' },
  content: { padding: 18, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, titleWrap: { flex: 1, gap: 3 }, title: { color: text, fontSize: 20, lineHeight: 26, fontWeight: '700', letterSpacing: -.3 }, subtitle: { color: muted, fontSize: 12, lineHeight: 17 },
  close: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: -7, marginRight: -7, borderRadius: 20 },
  section: { gap: 8 }, label: { color: muted, fontSize: 12, fontWeight: '600' }, labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleRow: { minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: line, borderRadius: 14, backgroundColor: panelSoft }, toggleCopy: { flex: 1, gap: 2 }, optionTitle: { color: text, fontSize: 13, fontWeight: '600' }, caption: { color: muted, fontSize: 11, lineHeight: 15 },
  toggle: { width: 46, height: 28, justifyContent: 'center', padding: 3, borderRadius: 99, backgroundColor: lineStrong }, toggleOn: { backgroundColor: accent }, toggleKnob: { width: 22, height: 22, borderRadius: 99, backgroundColor: panel, alignSelf: 'flex-start' }, toggleKnobOn: { alignSelf: 'flex-end' },
  minutesRow: { flexDirection: 'row', gap: 7 }, minuteChoice: { minHeight: 40, flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: line, borderRadius: 12, backgroundColor: panelSoft }, minuteChoiceSelected: { borderColor: 'var(--koda-accent-border, #a3b467)', backgroundColor: accentFaint }, minuteText: { color: text, fontSize: 12, fontWeight: '600' }, minuteTextSelected: { color: accent }, disabled: { opacity: .55 },
  explainer: { gap: 5, padding: 12, borderRadius: 14, backgroundColor: panelSoft }, explainerTitle: { color: text, fontSize: 12, fontWeight: '700', marginBottom: 1 }, body: { color: muted, fontSize: 12, lineHeight: 17 }, status: { color: muted, fontSize: 12, lineHeight: 17 }, error: { color: '#b42318', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, runButton: { minHeight: 44, flex: 1, minWidth: 150, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, backgroundColor: activeBg, paddingHorizontal: 12 }, runText: { color: activeText, fontSize: 12, fontWeight: '700' }, saveButton: { minHeight: 44, flex: 1, minWidth: 132, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 13, borderWidth: 1, borderColor: line, backgroundColor: panel, paddingHorizontal: 12 }, saveText: { color: text, fontSize: 12, fontWeight: '700' },
  loginNotice: { gap: 7, padding: 14, borderRadius: 14, backgroundColor: panelSoft }, loginTitle: { color: text, fontSize: 14, lineHeight: 19, fontWeight: '700' },
});
