import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Pause, Play, RotateCcw, Volume2 } from 'lucide-react-native';
import { ProgressLine, SectionTitle } from '../components';
import { accent, accentBorder, accentFaint, faint, line, muted, panel, panelSoft, text } from '../theme';
import type { PomodoroSettings, PomodoroSoundId } from '../types';

type PomodoroMode = 'work' | 'break' | 'longBreak';
type TimerStatus = 'idle' | 'running' | 'paused';

const soundOptions: Array<{ id: PomodoroSoundId; label: string; description: string }> = [
  { id: 'pulse', label: 'Тёплый', description: 'мягкий низкий chime' },
  { id: 'bell', label: 'Кристалл', description: 'чистый воздушный звон' },
  { id: 'signal', label: 'Фокус', description: 'заметный, но спокойный сигнал' },
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
  const statusRef = useRef(status);
  const modeRef = useRef(mode);

  const totalSeconds = getModeMinutes(mode, settings) * 60;
  const elapsedSeconds = Math.max(0, totalSeconds - remainingSeconds);
  const progress = totalSeconds ? Math.min(100, Math.round((elapsedSeconds / totalSeconds) * 100)) : 0;
  const nextModeLabel = mode === 'work' ? nextBreakLabel(completedWorkSessions + 1, settings) : 'Работа';

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
      <View style={local.soundList}>
        {soundOptions.map((option) => {
          const active = settings.soundId === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => {
                onSettingsChange({ soundId: option.id });
                previewSound(option.id);
              }}
              style={[local.soundRow, active && local.soundRowActive]}
            >
              <View style={[local.soundDot, active && local.soundDotActive]} />
              <View style={local.soundText}>
                <Text style={local.soundTitle}>{option.label}</Text>
                <Text style={local.soundMeta}>{option.description}</Text>
              </View>
            </Pressable>
          );
        })}
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
  const master = context.createGain();
  const filter = context.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(soundId === 'bell' ? 5200 : 3600, now);
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

function tone(frequency: number, offset: number, duration: number, gain: number, type: OscillatorType = 'sine', attack = 0.018, detune?: number): ToneStep {
  return { attack, detune, duration, frequency, gain, offset, type };
}

function soundSequence(soundId: PomodoroSoundId, event: 'end' | 'start'): ToneStep[] {
  if (soundId === 'bell') {
    return event === 'end'
      ? [
          tone(784, 0, 0.72, 0.11),
          tone(1175, 0.03, 0.64, 0.055),
          tone(1568, 0.08, 0.48, 0.03),
        ]
      : [
          tone(587, 0, 0.44, 0.075),
          tone(880, 0.12, 0.5, 0.07),
          tone(1319, 0.2, 0.42, 0.035),
        ];
  }

  if (soundId === 'signal') {
    return event === 'end'
      ? [
          tone(440, 0, 0.34, 0.09, 'triangle'),
          tone(660, 0.11, 0.42, 0.075, 'triangle'),
          tone(880, 0.27, 0.36, 0.052, 'sine'),
          tone(220, 0, 0.62, 0.035, 'sine'),
        ]
      : [
          tone(392, 0, 0.28, 0.07, 'triangle'),
          tone(523.25, 0.15, 0.32, 0.07, 'triangle'),
          tone(659.25, 0.3, 0.32, 0.05, 'sine'),
        ];
  }

  return event === 'end'
    ? [
        tone(261.63, 0, 0.74, 0.075),
        tone(392, 0.04, 0.68, 0.06),
        tone(523.25, 0.16, 0.52, 0.045),
        tone(130.81, 0, 0.82, 0.03, 'triangle'),
      ]
    : [
        tone(329.63, 0, 0.44, 0.055),
        tone(493.88, 0.08, 0.5, 0.055),
        tone(659.25, 0.22, 0.42, 0.038),
      ];
}

const local: Record<string, any> = {
  controls: { flexDirection: 'row', gap: 10 },
  desktopLayout: { alignSelf: 'center', flexDirection: 'row', gap: 24, maxWidth: 1120, width: '100%' },
  desktopScroll: { paddingBottom: 72, paddingTop: 8 },
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
  soundList: { gap: 8 },
  soundMeta: { color: faint, fontSize: 12, lineHeight: 16 },
  soundRow: {
    alignItems: 'center',
    backgroundColor: panelSoft,
    borderColor: line,
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    outlineStyle: 'none',
    paddingHorizontal: 12,
  },
  soundRowActive: { borderColor: accentBorder },
  soundText: { flex: 1, gap: 2 },
  soundTitle: { color: text, fontSize: 14, fontWeight: '700', lineHeight: 18 },
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
