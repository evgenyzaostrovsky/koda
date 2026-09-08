import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ChevronDown, Pause, Play, RotateCcw, Volume2 } from 'lucide-react-native';
import { ProgressLine, SectionTitle } from '../components';
import { accent, accentBorder, accentFaint, faint, line, muted, panel, panelSoft, text } from '../theme';
import type { PomodoroSettings, PomodoroSoundId } from '../types';

type PomodoroMode = 'work' | 'break' | 'longBreak';
type TimerStatus = 'idle' | 'running' | 'paused';

const soundOptions: Array<{ id: PomodoroSoundId; label: string; description: string }> = [
  { id: 'pulse', label: 'Тёплый', description: 'мягкий низкий chime' },
  { id: 'bell', label: 'Кристалл', description: 'чистый воздушный звон' },
  { id: 'signal', label: 'Фокус', description: 'заметный, но спокойный сигнал' },
  { id: 'aurora', label: 'Аврора', description: 'светлый подъём без резкости' },
  { id: 'bloom', label: 'Блум', description: 'мягкое мажорное созвучие' },
  { id: 'breeze', label: 'Бриз', description: 'тихий воздушный сигнал' },
  { id: 'deep', label: 'Глубина', description: 'низкий спокойный gong' },
  { id: 'ember', label: 'Уголь', description: 'тёплый плотный тон' },
  { id: 'focus', label: 'Импульс', description: 'короткий стартовый толчок' },
  { id: 'glass', label: 'Стекло', description: 'деликатный высокий звон' },
  { id: 'horizon', label: 'Горизонт', description: 'широкий мягкий аккорд' },
  { id: 'soft', label: 'Софт', description: 'самый ненавязчивый вариант' },
  { id: 'spark', label: 'Искра', description: 'быстрый чистый сигнал' },
  { id: 'temple', label: 'Темпл', description: 'медитативный gong' },
  { id: 'zen', label: 'Дзен', description: 'спокойное завершение цикла' },
];

export function PomodoroScreen({
  isDesktop = false,
  onSettingsChange,
  settings,
}: {
  isDesktop?: boolean;
  onSettingsChange: (patch: Partial<PomodoroSettings>) => void;
  settings: PomodoroSettings;
}) {
  const [mode, setMode] = useState<PomodoroMode>('work');
  const [status, setStatus] = useState<TimerStatus>('idle');
  const [remainingSeconds, setRemainingSeconds] = useState(settings.workMinutes * 60);
  const [completedWorkSessions, setCompletedWorkSessions] = useState(0);
  const [soundReady, setSoundReady] = useState(false);
  const [soundMenuOpen, setSoundMenuOpen] = useState(false);
  const statusRef = useRef(status);
  const modeRef = useRef(mode);

  const totalSeconds = getModeMinutes(mode, settings) * 60;
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const progress = totalSeconds ? Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100)) : 0;
  const nextModeLabel = mode === 'work' ? nextBreakLabel(completedWorkSessions + 1, settings) : 'Работа';
  const selectedSound = soundOptions.find((option) => option.id === settings.soundId) ?? soundOptions[0];

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    if (status === 'running') return;
    setRemainingSeconds(getModeMinutes(mode, settings) * 60);
  }, [mode, settings, status]);

  useEffect(() => {
    if (status !== 'running' || typeof window === 'undefined') return undefined;

    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => {
        if (current > 1) return current - 1;
        window.setTimeout(() => completePhase(), 0);
        return 0;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [status, mode, settings, completedWorkSessions]);

  function startTimer() {
    unlockSound();
    if (remainingSeconds <= 0) setRemainingSeconds(getModeMinutes(mode, settings) * 60);
    setStatus('running');
    playPomodoroSound(settings.soundId, 'start');
  }

  function pauseTimer() {
    setStatus('paused');
  }

  function resetTimer(nextMode: PomodoroMode = mode) {
    setMode(nextMode);
    setStatus('idle');
    setRemainingSeconds(getModeMinutes(nextMode, settings) * 60);
  }

  function completePhase() {
    if (statusRef.current !== 'running') return;
    const currentMode = modeRef.current;
    playPomodoroSound(settings.soundId, 'end');

    if (currentMode === 'work') {
      const nextCompletedSessions = completedWorkSessions + 1;
      const nextMode: PomodoroMode = shouldUseLongBreak(nextCompletedSessions, settings) ? 'longBreak' : 'break';
      setCompletedWorkSessions(nextCompletedSessions);
      setMode(nextMode);
      setRemainingSeconds(getModeMinutes(nextMode, settings) * 60);
      setStatus('running');
      scheduleSoundStart(settings.soundId);
      return;
    }

    setMode('work');
    setRemainingSeconds(settings.workMinutes * 60);
    setStatus('running');
    scheduleSoundStart(settings.soundId);
  }

  function unlockSound() {
    setSoundReady(true);
    void getAudioContext()?.resume?.();
  }

  function previewSound(soundId = settings.soundId) {
    unlockSound();
    playPomodoroSound(soundId, 'start');
  }

  function updateMinutes(key: keyof Pick<PomodoroSettings, 'breakMinutes' | 'longBreakMinutes' | 'sessionsBeforeLongBreak' | 'workMinutes'>, value: string) {
    const numeric = Number(value.replace(/[^\d]/g, ''));
    if (!Number.isFinite(numeric)) return;
    const limits = key === 'sessionsBeforeLongBreak' ? [2, 12] : [1, 180];
    onSettingsChange({ [key]: Math.min(limits[1], Math.max(limits[0], numeric || limits[0])) });
  }

  const settingsPanel = (
    <View style={local.panel}>
      <Text style={local.panelTitle}>Настройки</Text>
      <View style={local.settingsGrid}>
        <TimerField label="Работа" value={settings.workMinutes} onChange={(value) => updateMinutes('workMinutes', value)} suffix="мин" />
        <TimerField label="Отдых" value={settings.breakMinutes} onChange={(value) => updateMinutes('breakMinutes', value)} suffix="мин" />
        <TimerField label="Длинный отдых" value={settings.longBreakMinutes} onChange={(value) => updateMinutes('longBreakMinutes', value)} suffix="мин" />
        <TimerField label="После циклов" value={settings.sessionsBeforeLongBreak} onChange={(value) => updateMinutes('sessionsBeforeLongBreak', value)} suffix="раз" />
      </View>
    </View>
  );

  const soundsPanel = (
    <View style={local.panel}>
      <View style={local.panelHeaderRow}>
        <Text style={local.panelTitle}>Звук</Text>
        <Pressable onPress={() => previewSound()} style={local.textButton}>
          <Volume2 color={accent} size={15} />
          <Text style={local.textButtonText}>Прослушать</Text>
        </Pressable>
      </View>
      <View style={local.dropdown}>
        <Pressable onPress={() => setSoundMenuOpen((value) => !value)} style={local.dropdownButton}>
          <View style={local.soundText}>
            <Text style={local.soundTitle}>{selectedSound.label}</Text>
            <Text style={local.soundMeta}>{selectedSound.description}</Text>
          </View>
          <ChevronDown color={muted} size={17} />
        </Pressable>
        {soundMenuOpen ? (
          <View style={local.dropdownMenu}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={local.dropdownScroll}>
              {soundOptions.map((option) => {
                const active = settings.soundId === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() => {
                      onSettingsChange({ soundId: option.id });
                      setSoundMenuOpen(false);
                      previewSound(option.id);
                    }}
                    style={[local.dropdownOption, active && local.dropdownOptionActive]}
                  >
                    <View style={[local.soundDot, active && local.soundDotActive]} />
                    <View style={local.soundText}>
                      <Text style={[local.soundTitle, active && local.soundTitleActive]}>{option.label}</Text>
                      <Text style={local.soundMeta}>{option.description}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}
      </View>
      <Text style={local.hint}>{soundReady ? 'Звук готов.' : 'На iPhone звук включится после первого нажатия на таймер.'}</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[local.scroll, isDesktop && local.desktopScroll]} showsVerticalScrollIndicator={false}>
      <View style={isDesktop ? local.desktopLayout : undefined}>
        <View style={isDesktop ? local.mainColumn : undefined}>
          <SectionTitle title="Таймер" subtitle="Помодорро без лишнего шума" />
          <View style={local.hero}>
            <View style={local.heroTop}>
              <View>
                <Text style={local.kicker}>{modeLabel(mode)}</Text>
                <Text style={local.nextText}>Дальше: {nextModeLabel}</Text>
              </View>
              <Text style={local.sessionText}>{completedWorkSessions} фокус-сессий</Text>
            </View>

            <View style={local.timerFace}>
              <Text style={local.timerText}>{formatDuration(remainingSeconds)}</Text>
              <Text style={local.timerMeta}>{statusLabel(status)}</Text>
            </View>

            <ProgressLine value={progress} />

            <View style={local.controls}>
              {status === 'running' ? (
                <Pressable onPress={pauseTimer} style={local.primaryControl}>
                  <Pause color={panel} size={20} fill={panel} />
                  <Text style={local.primaryControlText}>Пауза</Text>
                </Pressable>
              ) : (
                <Pressable onPress={startTimer} style={local.primaryControl}>
                  <Play color={panel} size={20} fill={panel} />
                  <Text style={local.primaryControlText}>{status === 'paused' ? 'Продолжить' : 'Начать'}</Text>
                </Pressable>
              )}
              <Pressable onPress={() => resetTimer()} style={local.secondaryControl}>
                <RotateCcw color={muted} size={18} />
                <Text style={local.secondaryControlText}>Сброс</Text>
              </Pressable>
            </View>

            <View style={local.modeSwitch}>
              {(['work', 'break', 'longBreak'] as PomodoroMode[]).map((item) => (
                <Pressable key={item} onPress={() => resetTimer(item)} style={[local.modeButton, mode === item && local.modeButtonActive]}>
                  <Text style={[local.modeButtonText, mode === item && local.modeButtonTextActive]}>{modeLabel(item)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={isDesktop ? local.sideColumn : undefined}>
          {settingsPanel}
          {soundsPanel}
          <View style={local.panel}>
            <Text style={local.panelTitle}>Как работает</Text>
            <Text style={local.hint}>Таймер автоматически переключает работу и отдых. Длинный отдых включается после заданного числа фокус-сессий.</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

function TimerField({ label, onChange, suffix, value }: { label: string; onChange: (value: string) => void; suffix: string; value: number }) {
  return (
    <View style={local.timerField}>
      <Text style={local.fieldLabel}>{label}</Text>
      <View style={local.fieldRow}>
        <TextInput
          inputMode="numeric"
          keyboardType="number-pad"
          onChangeText={onChange}
          placeholderTextColor={faint}
          style={local.fieldInput}
          value={String(value)}
        />
        <Text style={local.fieldSuffix}>{suffix}</Text>
      </View>
    </View>
  );
}

function getModeMinutes(mode: PomodoroMode, settings: PomodoroSettings) {
  if (mode === 'break') return settings.breakMinutes;
  if (mode === 'longBreak') return settings.longBreakMinutes;
  return settings.workMinutes;
}

function shouldUseLongBreak(completedSessions: number, settings: PomodoroSettings) {
  return completedSessions > 0 && completedSessions % settings.sessionsBeforeLongBreak === 0;
}

function nextBreakLabel(nextCompletedSessions: number, settings: PomodoroSettings) {
  return shouldUseLongBreak(nextCompletedSessions, settings) ? 'Длинный отдых' : 'Отдых';
}

function modeLabel(mode: PomodoroMode) {
  if (mode === 'break') return 'Отдых';
  if (mode === 'longBreak') return 'Длинный отдых';
  return 'Работа';
}

function statusLabel(status: TimerStatus) {
  if (status === 'running') return 'идёт сейчас';
  if (status === 'paused') return 'на паузе';
  return 'готов';
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextCtor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextCtor) return null;
  const kodaWindow = window as Window & { __kodaPomodoroAudio?: AudioContext };
  kodaWindow.__kodaPomodoroAudio ??= new AudioContextCtor();
  return kodaWindow.__kodaPomodoroAudio;
}

function playPomodoroSound(soundId: PomodoroSoundId, event: 'end' | 'start') {
  const context = getAudioContext();
  if (!context) return;

  const now = context.currentTime;
  const profile = soundProfiles[soundId] ?? soundProfiles.pulse;
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(profile.filter, now);
  filter.Q.setValueAtTime(0.7, now);
  master.connect(filter);
  filter.connect(context.destination);
  master.gain.setValueAtTime(event === 'end' ? 0.86 : 0.68, now);

  const sequence = soundSequence(soundId, event);
  sequence.forEach((item) => {
    const start = now + item.offset;
    const voiceGain = context.createGain();
    const oscillator = context.createOscillator();
    oscillator.connect(voiceGain);
    voiceGain.connect(master);
    oscillator.type = item.type;
    oscillator.frequency.setValueAtTime(item.frequency, start);
    if (item.detune) oscillator.detune.setValueAtTime(item.detune, start);
    voiceGain.gain.setValueAtTime(0.0001, start);
    voiceGain.gain.exponentialRampToValueAtTime(item.gain, start + item.attack);
    voiceGain.gain.exponentialRampToValueAtTime(0.0001, start + item.duration);
    oscillator.start(start);
    oscillator.stop(start + item.duration + 0.04);
  });
}

function scheduleSoundStart(soundId: PomodoroSoundId) {
  if (typeof window === 'undefined') return;
  window.setTimeout(() => playPomodoroSound(soundId, 'start'), 420);
}

type ToneStep = {
  attack: number;
  detune?: number;
  duration: number;
  frequency: number;
  gain: number;
  offset: number;
  type: OscillatorType;
};

type SoundProfile = {
  base: number;
  endShift?: number;
  filter: number;
  gains: [number, number, number, number];
  intervals: [number, number, number, number];
  name: PomodoroSoundId;
  startShift?: number;
  type: OscillatorType;
};

const soundProfiles: Record<PomodoroSoundId, SoundProfile> = {
  aurora: { base: 349.23, filter: 4800, gains: [0.052, 0.048, 0.036, 0.018], intervals: [1, 1.25, 1.5, 2], name: 'aurora', type: 'sine' },
  bell: { base: 587.33, filter: 5600, gains: [0.075, 0.054, 0.034, 0.016], intervals: [1, 1.5, 2, 2.67], name: 'bell', type: 'sine' },
  bloom: { base: 293.66, filter: 4200, gains: [0.064, 0.056, 0.04, 0.022], intervals: [1, 1.26, 1.5, 2], name: 'bloom', type: 'triangle' },
  breeze: { base: 440, filter: 5000, gains: [0.044, 0.036, 0.026, 0.012], intervals: [1, 1.33, 1.78, 2.37], name: 'breeze', type: 'sine' },
  deep: { base: 164.81, filter: 2600, gains: [0.078, 0.052, 0.026, 0.018], intervals: [1, 1.5, 2, 0.5], name: 'deep', type: 'triangle' },
  ember: { base: 220, filter: 3300, gains: [0.074, 0.052, 0.036, 0.02], intervals: [1, 1.2, 1.5, 2], name: 'ember', type: 'triangle' },
  focus: { base: 392, filter: 3800, gains: [0.072, 0.058, 0.046, 0.018], intervals: [1, 1.33, 1.68, 2], name: 'focus', type: 'triangle' },
  glass: { base: 659.25, filter: 6200, gains: [0.05, 0.038, 0.028, 0.012], intervals: [1, 1.5, 2, 2.5], name: 'glass', type: 'sine' },
  horizon: { base: 246.94, filter: 3900, gains: [0.066, 0.052, 0.038, 0.022], intervals: [1, 1.33, 1.5, 2], name: 'horizon', type: 'sine' },
  pulse: { base: 329.63, filter: 3600, gains: [0.055, 0.055, 0.038, 0.018], intervals: [1, 1.5, 2, 0.5], name: 'pulse', type: 'sine' },
  signal: { base: 392, filter: 4100, gains: [0.07, 0.07, 0.05, 0.02], intervals: [1, 1.33, 1.68, 0.56], name: 'signal', type: 'triangle' },
  soft: { base: 261.63, filter: 3000, gains: [0.04, 0.034, 0.026, 0.014], intervals: [1, 1.25, 1.5, 2], name: 'soft', type: 'sine' },
  spark: { base: 523.25, filter: 5800, gains: [0.058, 0.046, 0.036, 0.012], intervals: [1, 1.5, 2, 2.25], name: 'spark', type: 'triangle' },
  temple: { base: 196, filter: 2800, gains: [0.082, 0.052, 0.03, 0.02], intervals: [1, 1.5, 2, 0.5], name: 'temple', type: 'sine' },
  zen: { base: 220, filter: 3200, gains: [0.056, 0.048, 0.032, 0.018], intervals: [1, 1.33, 1.78, 0.5], name: 'zen', type: 'sine' },
};

function tone(frequency: number, offset: number, duration: number, gain: number, type: OscillatorType = 'sine', attack = 0.018, detune?: number): ToneStep {
  return { attack, detune, duration, frequency, gain, offset, type };
}

function soundSequence(soundId: PomodoroSoundId, event: 'end' | 'start'): ToneStep[] {
  const profile = soundProfiles[soundId] ?? soundProfiles.pulse;
  const shift = event === 'end' ? profile.endShift ?? 1.18 : profile.startShift ?? 1;
  const duration = event === 'end' ? 0.72 : 0.46;
  const spacing = event === 'end' ? 0.095 : 0.13;

  return profile.intervals.map((interval, index) =>
    tone(
      profile.base * interval * shift,
      index * spacing,
      Math.max(0.28, duration - index * 0.055),
      profile.gains[index],
      index === 3 && profile.type === 'triangle' ? 'sine' : profile.type,
      index === 0 ? 0.022 : 0.016,
      index % 2 === 0 ? -3 : 3,
    ),
  );
}

const local: Record<string, any> = {
  controls: { flexDirection: 'row', gap: 10 },
  desktopLayout: { alignSelf: 'center', flexDirection: 'row', gap: 24, maxWidth: 1120, width: '100%' },
  desktopScroll: { paddingBottom: 72, paddingTop: 8 },
  dropdown: { gap: 8 },
  dropdownButton: {
    alignItems: 'center',
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 56,
    outlineStyle: 'none',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  dropdownMenu: {
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  dropdownOption: {
    alignItems: 'center',
    borderBottomColor: line,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    outlineStyle: 'none',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownOptionActive: { backgroundColor: accentFaint },
  dropdownScroll: { maxHeight: 360 },
  fieldInput: {
    color: text,
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
    minHeight: 42,
    outlineStyle: 'none',
    padding: 0,
  },
  fieldLabel: { color: muted, fontSize: 11, letterSpacing: 2, lineHeight: 15, textTransform: 'uppercase' },
  fieldRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  fieldSuffix: { color: faint, fontSize: 12 },
  hero: {
    backgroundColor: panel,
    borderColor: line,
    borderRadius: 10,
    borderWidth: 1,
    gap: 18,
    padding: 18,
  },
  heroTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  hint: { color: muted, fontSize: 12, lineHeight: 18 },
  kicker: { color: accent, fontSize: 12, fontWeight: '800', letterSpacing: 2, lineHeight: 16, textTransform: 'uppercase' },
  mainColumn: { flex: 1, gap: 18, minWidth: 0 },
  modeButton: {
    alignItems: 'center',
    borderColor: line,
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  modeButtonActive: { backgroundColor: accentFaint, borderColor: accentBorder },
  modeButtonText: { color: muted, fontSize: 12, fontWeight: '700' },
  modeButtonTextActive: { color: accent },
  modeSwitch: { flexDirection: 'row', gap: 8 },
  nextText: { color: muted, fontSize: 13, lineHeight: 18, marginTop: 4 },
  panel: {
    backgroundColor: panel,
    borderColor: line,
    borderRadius: 10,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  panelHeaderRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  panelTitle: { color: text, fontSize: 18, fontWeight: '700', lineHeight: 23 },
  primaryControl: {
    alignItems: 'center',
    backgroundColor: accent,
    borderRadius: 10,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    outlineStyle: 'none',
  },
  primaryControlText: { color: panel, fontSize: 15, fontWeight: '900' },
  scroll: { gap: 18, paddingBottom: 104 },
  secondaryControl: {
    alignItems: 'center',
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 52,
    outlineStyle: 'none',
    paddingHorizontal: 16,
  },
  secondaryControlText: { color: muted, fontSize: 13, fontWeight: '800' },
  sessionText: { color: faint, fontSize: 12, lineHeight: 17, textAlign: 'right' },
  settingsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  sideColumn: { gap: 14, width: 330 },
  soundDot: { borderColor: line, borderRadius: 999, borderWidth: 1, height: 14, width: 14 },
  soundDotActive: { backgroundColor: accent, borderColor: accent },
  soundMeta: { color: faint, fontSize: 12, lineHeight: 16 },
  soundText: { flex: 1, gap: 2 },
  soundTitle: { color: text, fontSize: 14, fontWeight: '700', lineHeight: 18 },
  soundTitleActive: { color: accent },
  textButton: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 34, outlineStyle: 'none' },
  textButtonText: { color: accent, fontSize: 12, fontWeight: '800' },
  timerFace: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
  timerField: {
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    flexBasis: '47%',
    flexGrow: 1,
    gap: 5,
    minWidth: 128,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  timerMeta: { color: muted, fontSize: 13, lineHeight: 18, marginTop: 6 },
  timerText: { color: text, fontSize: 72, fontWeight: '300', letterSpacing: 0, lineHeight: 82 },
};
