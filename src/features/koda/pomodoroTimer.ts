import type { PomodoroSettings } from './types';
export type PomodoroMode = 'work' | 'break' | 'longBreak';
export type TimerState = { mode: PomodoroMode; status: 'idle' | 'running' | 'paused'; remainingSeconds: number; endsAt: number | null; completedWorkSessions: number };
export function duration(mode: PomodoroMode, settings: PomodoroSettings) {
  return (mode === 'work' ? settings.workMinutes : mode === 'break' ? settings.breakMinutes : settings.longBreakMinutes) * 60;
}
export function initialTimer(settings: PomodoroSettings): TimerState {
  return { mode: 'work', status: 'idle', remainingSeconds: duration('work', settings), endsAt: null, completedWorkSessions: 0 };
}
export function restoreTimer(raw: string | null, settings: PomodoroSettings): TimerState {
  try {
    const value = JSON.parse(raw ?? 'null');
    if (value && ['work', 'break', 'longBreak'].includes(value.mode) && ['idle', 'running', 'paused'].includes(value.status) && Number.isFinite(value.remainingSeconds) && value.remainingSeconds >= 0 && Number.isInteger(value.completedWorkSessions) && value.completedWorkSessions >= 0 && (value.status !== 'running' || (Number.isFinite(value.endsAt) && value.endsAt > 0))) return value;
  } catch {}
  return initialTimer(settings);
}
export function advanceTimer(state: TimerState, settings: PomodoroSettings, now: number): TimerState {
  if (state.status !== 'running' || state.endsAt === null) return state;
  let next = { ...state };
  const count = Math.max(2, settings.sessionsBeforeLongBreak);
  const cycleMs = (settings.workMinutes * count + settings.breakMinutes * (count - 1) + settings.longBreakMinutes) * 60000;
  const cycles = Math.max(0, Math.floor((now - next.endsAt!) / cycleMs));
  if (cycles) { next.endsAt! += cycles * cycleMs; next.completedWorkSessions += cycles * count; }
  while (now >= next.endsAt!) {
    if (next.mode === 'work') {
      next.completedWorkSessions++;
      next.mode = next.completedWorkSessions % count === 0 ? 'longBreak' : 'break';
    } else next.mode = 'work';
    next.endsAt! += Math.max(1, duration(next.mode, settings)) * 1000;
  }
  next.remainingSeconds = Math.max(0, Math.ceil((next.endsAt! - now) / 1000));
  return next;
}
