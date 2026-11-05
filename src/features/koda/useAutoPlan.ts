import { useEffect, useMemo, useState } from 'react';
import { advanceAutoPlan, applyAutoPlanProgress, buildAutoPlanItems, configureAutoPlan, moveAutoPlanAssignment, parseAutoPlanState, recordAutoPlanCompletion, type AutoPlanState } from './autoPlan';
import type { Goal, PlannerItem } from './types';
import { uid } from './utils';

export function autoPlanLocalDate(timezone: string, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

type Props = {
  ownerId?: string | null; state?: AutoPlanState; ready: boolean; goals: Goal[]; manualItems: PlannerItem[];
  onChange: (updater: (state: AutoPlanState | undefined) => AutoPlanState) => void;
};

export function useAutoPlan({ ownerId, state: rawState, ready, goals, manualItems, onChange }: Props) {
  const state = useMemo(() => ownerId ? parseAutoPlanState(rawState, ownerId) : undefined, [rawState, ownerId]);
  const timezone = state?.settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setClock(Date.now()), 30_000); return () => clearInterval(timer); }, []);
  const date = autoPlanLocalDate(timezone, new Date(clock));
  useEffect(() => {
    if (!ready || !ownerId || !state?.settings.enabled) return;
    const next = advanceAutoPlan(state, goals, manualItems, date, new Date().toISOString());
    if (JSON.stringify(next) !== JSON.stringify(state)) {
      onChange(current => advanceAutoPlan(parseAutoPlanState(current, ownerId) ?? state, goals, manualItems, date, new Date().toISOString()));
    }
  }, [ready, ownerId, state, goals, manualItems, date]);
  const items = useMemo(() => ready ? buildAutoPlanItems(state, goals, date) : [], [ready, state, goals, date]);
  const displayGoals = useMemo(() => applyAutoPlanProgress(state, goals), [state, goals]);
  function requireReady() { if (!ownerId || !ready) throw new Error('Дождитесь загрузки данных аккаунта.'); }
  async function save(settings: { enabled: boolean; dailyMinutes: number }) {
    requireReady();
    const at = new Date().toISOString(), operationId = uid('autoplan-settings');
    onChange(current => {
      const configured = configureAutoPlan(parseAutoPlanState(current, ownerId!), ownerId!, { ...settings, timezone }, at, operationId);
      return advanceAutoPlan(configured, goals, manualItems, autoPlanLocalDate(timezone), at);
    });
  }
  async function run() {
    requireReady();
    if (!state?.settings.enabled) throw new Error('Сначала включите автоплан и сохраните настройки.');
    onChange(current => advanceAutoPlan(parseAutoPlanState(current, ownerId!) ?? state, goals, manualItems, autoPlanLocalDate(timezone), new Date().toISOString()));
  }
  function complete(item: PlannerItem, done: boolean) {
    if (!ownerId || !ready || !state || item.ownerId !== ownerId || !item.sourceId) return;
    const at = new Date().toISOString(), operationId = uid('autoplan-completion');
    onChange(current => recordAutoPlanCompletion(parseAutoPlanState(current, ownerId) ?? state, item.sourceId!, done, autoPlanLocalDate(timezone), at, operationId));
  }
  function move(item: PlannerItem, nextDate: string) {
    if (!ownerId || !ready || !state || item.ownerId !== ownerId || !item.sourceId) return;
    const at = new Date().toISOString(), operationId = uid('autoplan-move');
    onChange(current => moveAutoPlanAssignment(parseAutoPlanState(current, ownerId) ?? state, item.sourceId!, nextDate, at, operationId));
  }
  const today = state?.days.find(day => day.date === date);
  const blocked = today?.blocked ?? [];
  const oversized = blocked.filter(item => item.reason === 'exceeds_daily_limit').map(item => {
    const goal = goals.find(goal => goal.id === item.goalId);
    return `${goal?.actions.find(action => action.id === item.actionId)?.title || 'Шаг цели'} (${item.estimatedMinutes} мин)`;
  });
  const statusText = !state?.settings.enabled ? 'Автоплан выключен. Включение действует только для этого аккаунта.'
    : !goals.some(goal => goal.priority === 'main' && goal.status === 'active') ? 'Выберите главную активную цель в разделе «Цели».'
    : oversized.length ? `Ожидают разбивки на меньшие действия: ${oversized.join('; ')}. Они сохранены в цели и не потеряются.`
    : `На сегодня: ${items.filter(item => item.date === date).length} шагов. Следующая порция — после выполнения, на новый день.${today?.assignmentIds.length && today.dailyMinutes !== state.settings.dailyMinutes ? ` Сегодня сохраняется прежний лимит ${today.dailyMinutes} мин; новый действует со следующего дня.` : ''}`;
  return { items, displayGoals, complete, move, control: { userId: ownerId, enabled: state?.settings.enabled ?? false, dailyMinutes: state?.settings.dailyMinutes ?? 120, busy: !ready && Boolean(ownerId), statusText, onSave: save, onRun: run } };
}
