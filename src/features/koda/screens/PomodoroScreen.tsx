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
  { id: 'deep', label: 'Глубина', description: 'низкий спокойный удар' },
  { id: 'ember', label: 'Уголь', description: 'тёплый плотный тон' },
  { id: 'focus', label: 'Импульс', description: 'короткий стартовый толчок' },
  { id: 'glass', label: 'Стекло', description: 'деликатный высокий звон' },
  { id: 'horizon', label: 'Горизонт', description: 'широкий мягкий аккорд' },
  { id: 'soft', label: 'Софт', description: 'самый ненавязчивый вариант' },
  { id: 'spark', label: 'Искра', description: 'быстрый чистый сигнал' },
  { id: 'temple', label: 'Чаша', description: 'глубокая протяжная тарелка' },
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

  playSoundDesign(context, soundId, event);
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

function tone(frequency: number, offset: number, duration: number, gain: number, type: OscillatorType = 'sine', attack = 0.018, detune?: number): ToneStep {
  return { attack, detune, duration, frequency, gain, offset, type };
}

function playSoundDesign(context: AudioContext, soundId: PomodoroSoundId, event: 'end' | 'start') {
  if (soundId === 'temple') {
    playSingingBowl(context, event);
    return;
  }
  if (soundId === 'breeze') {
    playNoiseSweep(context, event, 'soft');
    playTones(context, [tone(440, 0.08, 0.52, 0.028), tone(660, 0.22, 0.44, 0.022)], 4600, 0.58);
    return;
  }
  if (soundId === 'deep') {
    playDeepHit(context, event);
    return;
  }
  if (soundId === 'spark') {
    playTones(context, [tone(1175, 0, 0.12, 0.048, 'triangle'), tone(1760, 0.055, 0.11, 0.03, 'sine'), tone(2349, 0.11, 0.1, 0.018, 'sine')], 7200, 0.78);
    return;
  }
  if (soundId === 'focus') {
    playNoiseSweep(context, event, 'tick');
    playTones(context, [tone(196, 0, 0.13, 0.06, 'square', 0.006), tone(392, 0.11, 0.19, 0.045, 'triangle')], 2600, 0.72);
    return;
  }

  const patterns: Record<Exclude<PomodoroSoundId, 'breeze' | 'deep' | 'focus' | 'spark' | 'temple'>, ToneStep[]> = {
    aurora: [tone(293.66, 0, 0.7, 0.038), tone(440, 0.16, 0.72, 0.034), tone(587.33, 0.34, 0.62, 0.026)],
    bell: [tone(880, 0, 0.66, 0.05), tone(1320, 0.025, 0.58, 0.032), tone(1760, 0.08, 0.4, 0.018)],
    bloom: [tone(261.63, 0, 0.62, 0.052, 'triangle'), tone(329.63, 0.06, 0.6, 0.04), tone(392, 0.12, 0.54, 0.034)],
    ember: [tone(164.81, 0, 0.34, 0.07, 'sawtooth', 0.01), tone(247, 0.08, 0.36, 0.044, 'triangle'), tone(329.63, 0.18, 0.28, 0.026)],
    glass: [tone(1046.5, 0, 0.82, 0.032), tone(1568, 0.04, 0.74, 0.024), tone(2093, 0.12, 0.46, 0.014)],
    horizon: [tone(220, 0, 0.9, 0.04), tone(293.66, 0, 0.9, 0.034), tone(440, 0.2, 0.7, 0.027), tone(587.33, 0.38, 0.52, 0.018)],
    pulse: [tone(220, 0, 0.18, 0.052, 'triangle'), tone(220, 0.24, 0.2, 0.044, 'triangle'), tone(440, 0.31, 0.22, 0.024)],
    signal: [tone(523.25, 0, 0.16, 0.054, 'triangle'), tone(659.25, 0.18, 0.16, 0.054, 'triangle'), tone(783.99, 0.36, 0.24, 0.042, 'triangle')],
    soft: [tone(329.63, 0, 0.55, 0.03), tone(493.88, 0.13, 0.52, 0.022)],
    zen: [tone(392, 0, 0.58, 0.04), tone(293.66, 0.18, 0.68, 0.034), tone(196, 0.34, 0.88, 0.024)],
  };

  const shift = event === 'end' ? 0.92 : 1;
  const pattern = patterns[soundId as keyof typeof patterns] ?? patterns.pulse;
  playTones(
    context,
    pattern.map((step) => ({ ...step, duration: event === 'end' ? step.duration * 1.25 : step.duration, frequency: step.frequency * shift })),
    soundId === 'glass' || soundId === 'bell' ? 6200 : 3600,
    event === 'end' ? 0.86 : 0.68,
  );
}

function playTones(context: AudioContext, steps: ToneStep[], filterFrequency: number, masterGainValue: number) {
  const now = context.currentTime;
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(filterFrequency, now);
  filter.Q.setValueAtTime(0.7, now);
  master.connect(filter);
  filter.connect(context.destination);
  master.gain.setValueAtTime(masterGainValue, now);

  steps.forEach((item) => {
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

function playSingingBowl(context: AudioContext, event: 'end' | 'start') {
  const base = event === 'end' ? 108 : 132;
  const duration = event === 'end' ? 3.6 : 1.85;
  playTones(
    context,
    [
      tone(base, 0, duration, 0.09, 'sine', 0.035, -7),
      tone(base * 2.01, 0.015, duration * 0.92, 0.052, 'sine', 0.04, 5),
      tone(base * 2.72, 0.04, duration * 0.76, 0.034, 'triangle', 0.05, -4),
      tone(base * 4.08, 0.12, duration * 0.58, 0.018, 'sine', 0.06, 6),
    ],
    2400,
    0.92,
  );
}

function playDeepHit(context: AudioContext, event: 'end' | 'start') {
  const base = event === 'end' ? 76 : 98;
  playTones(context, [tone(base, 0, 1.4, 0.11, 'triangle', 0.012), tone(base * 1.5, 0.045, 0.82, 0.044), tone(base * 2.02, 0.13, 0.58, 0.022)], 1800, 0.88);
  playNoiseSweep(context, event, 'thump');
}

function playNoiseSweep(context: AudioContext, event: 'end' | 'start', kind: 'soft' | 'thump' | 'tick') {
  const now = context.currentTime;
  const duration = kind === 'soft' ? 0.52 : kind === 'thump' ? 0.18 : 0.045;
  const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < sampleCount; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / sampleCount);
  }

  const source = context.createBufferSource();
  const gain = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = kind === 'thump' ? 'lowpass' : 'bandpass';
  filter.frequency.setValueAtTime(kind === 'soft' ? (event === 'end' ? 900 : 1400) : kind === 'thump' ? 180 : 2600, now);
  filter.Q.setValueAtTime(kind === 'tick' ? 3.2 : 0.9, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(kind === 'tick' ? 0.035 : 0.055, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  source.buffer = buffer;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(context.destination);
  source.start(now);
  source.stop(now + duration + 0.02);
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
