import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { advanceTimer, duration, initialTimer, restoreTimer, type PomodoroMode, type TimerState } from './pomodoroTimer';
import type { PomodoroSettings } from './types';

export function usePomodoroTimer(settings: PomodoroSettings, owner: string, ready: boolean, onPhase: () => void) {
  const key = `koda:timer:v1:${owner}`;
  const read = () => { try { return restoreTimer(window.localStorage.getItem(key), settings); } catch { return initialTimer(settings); } };
  const [state, setState] = useState<TimerState>(read);
  const current = useRef(state);
  const options = useRef(settings); options.current = settings;
  const phase = useRef(onPhase); phase.current = onPhase;
  function commit(next: TimerState, persist = true) {
    current.current = next; setState(next);
    if (persist) { try { window.localStorage.setItem(key, JSON.stringify(next)); } catch {} }
  }
  useEffect(() => {
    if (!ready) return;
    commit(advanceTimer(read(), options.current, Date.now()), false);
    function tick() {
      const before = current.current;
      const next = advanceTimer(before, options.current, Date.now());
      const changedPhase = next.endsAt !== before.endsAt;
      if (next.remainingSeconds !== before.remainingSeconds || changedPhase) commit(next, changedPhase);
      if (changedPhase) phase.current();
    }
    function storage(event: StorageEvent) { if (event.key === key) commit(advanceTimer(restoreTimer(event.newValue, options.current), options.current, Date.now()), false); }
    const interval = setInterval(tick, 500);
    if (typeof window !== 'undefined') { window.addEventListener('focus', tick); window.addEventListener('storage', storage); document.addEventListener('visibilitychange', tick); }
    return () => { clearInterval(interval); if (typeof window !== 'undefined') { window.removeEventListener('focus', tick); window.removeEventListener('storage', storage); document.removeEventListener('visibilitychange', tick); } };
  }, [key, ready]);
  useEffect(() => { if (ready && current.current.status === 'idle') commit({ ...current.current, remainingSeconds: duration(current.current.mode, settings) }); }, [ready, settings.workMinutes, settings.breakMinutes, settings.longBreakMinutes]);
  return { ...state,
    start: () => { const before = current.current; if (before.status === 'running') return; const seconds = before.remainingSeconds || duration(before.mode, settings); commit({ ...before, status: 'running', remainingSeconds: seconds, endsAt: Date.now() + seconds * 1000 }); },
    pause: () => { const next = advanceTimer(current.current, settings, Date.now()); commit({ ...next, status: 'paused', endsAt: null }); },
    reset: (mode: PomodoroMode = current.current.mode) => commit({ ...current.current, mode, status: 'idle', endsAt: null, remainingSeconds: duration(mode, settings) }),
  };
}
export type PomodoroController = ReturnType<typeof usePomodoroTimer>;

const TimerContext = createContext<PomodoroController | null>(null);
export function PomodoroProvider({ settings, owner, onPhase, children }: { settings: PomodoroSettings; owner: string; onPhase: () => void; children: ReactNode }) {
  const controller = usePomodoroTimer(settings, owner, true, onPhase);
  return createElement(TimerContext.Provider, { value: controller }, children);
}
export function usePomodoroController() {
  const controller = useContext(TimerContext);
  if (!controller) throw new Error('PomodoroProvider is required');
  return controller;
}
