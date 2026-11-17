import { normalizeSavedStudyPlan, planningDate, type StudyPlan } from '../../ai/studyPlanning';
import type { Goal, GoalAction, GoalMilestone } from './types';

const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item.length <= 2000);

/** Validate through the shared contract, but retain the saved calculated values.
 * Recalculation changes belong to acceptance, never to immutable draft hydration. */
export function normalizeGoalStudyPlan(value: unknown): StudyPlan | undefined {
  if (!record(value) || !integer(value.dailyMinutes, 5, 480) || !planningDate(value.startDate)
    || (value.deadline !== undefined && !planningDate(value.deadline))
    || !Array.isArray(value.studyDays) || !value.studyDays.length || value.studyDays.length > 7
    || !value.studyDays.every(day => integer(day, 0, 6)) || new Set(value.studyDays).size !== value.studyDays.length
    || !integer(value.availableMinutes) || !integer(value.totalMinutes) || !integer(value.shortfallMinutes)
    || !strings(value.assumptions) || !strings(value.warnings)
    || !Array.isArray(value.modules) || !value.modules.length || value.modules.length > 100) return undefined;
  const ids = new Set<string>();
  const modules: StudyPlan['modules'] = [];
  for (const item of value.modules) {
    if (!record(item) || typeof item.id !== 'string' || !item.id || item.id.length > 200 || ids.has(item.id)
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 200
      || !['completed', 'current', 'remaining'].includes(String(item.status))
      || !integer(item.estimatedMinutes, 0, 60000) || !integer(item.sessions, 0, 60000)
      || (item.availableFrom !== undefined && !planningDate(item.availableFrom))
      || (item.startDate !== undefined && !planningDate(item.startDate))
      || (item.endDate !== undefined && !planningDate(item.endDate))) return undefined;
    if (item.status !== 'completed' && (!item.estimatedMinutes || !item.sessions || !item.startDate || !item.endDate
      || String(item.startDate) > String(item.endDate) || String(item.startDate) < String(value.startDate)
      || (item.availableFrom && String(item.startDate) < String(item.availableFrom)))) return undefined;
    if (item.status === 'completed' && (item.estimatedMinutes !== 0 || item.sessions !== 0)) return undefined;
    ids.add(item.id);
    modules.push({ id: item.id, title: item.title, status: item.status as StudyPlan['modules'][number]['status'],
      estimatedMinutes: item.estimatedMinutes, sessions: item.sessions,
      ...(item.availableFrom !== undefined ? { availableFrom: item.availableFrom as string } : {}),
      ...(item.startDate !== undefined ? { startDate: item.startDate as string } : {}),
      ...(item.endDate !== undefined ? { endDate: item.endDate as string } : {}) });
  }
  if (modules.reduce((sum, module) => sum + module.estimatedMinutes, 0) !== value.totalMinutes) return undefined;
  if (!normalizeSavedStudyPlan(value)) return undefined;
  return { dailyMinutes: value.dailyMinutes, studyDays: [...value.studyDays] as number[], startDate: value.startDate as string,
    ...(value.deadline !== undefined ? { deadline: value.deadline as string } : {}),
    availableMinutes: value.availableMinutes, totalMinutes: value.totalMinutes, shortfallMinutes: value.shortfallMinutes,
    assumptions: [...value.assumptions], warnings: [...value.warnings], modules };
}

function hasDependencyCycle(actions: GoalAction[]): boolean {
  const byId = new Map(actions.map(action => [action.id, action]));
  const visiting = new Set<string>(), visited = new Set<string>();
  function visit(id: string): boolean {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    if ((byId.get(id)?.dependsOn ?? []).some(visit)) return true;
    visiting.delete(id); visited.add(id);
    return false;
  }
  return actions.some(action => visit(action.id));
}

/** Replay the full remaining curriculum, including work with no suggested exercise.
 * A module can share its first/last study day with a neighbouring module. */
function studyActionDates(plan: StudyPlan, actions: GoalAction[]): Map<string, string> {
  const dates = new Map<string, string>();
  const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
  let cursor = plan.startDate, used = 0;
  for (const module of plan.modules) {
    if (module.status === 'completed') continue;
    const start = [module.availableFrom ?? '', module.startDate ?? ''].sort().at(-1)!;
    if (start > cursor) { cursor = start; used = 0; }
    const slots: Array<{ date: string; minutes: number }> = [];
    let remaining = module.estimatedMinutes;
    while (remaining > 0) {
      if (!plan.studyDays.includes(new Date(`${cursor}T00:00:00Z`).getUTCDay()) || used >= plan.dailyMinutes) {
        cursor = nextDay(cursor); used = 0; continue;
      }
      const minutes = Math.min(remaining, plan.dailyMinutes - used);
      slots.push({ date: cursor, minutes });
      remaining -= minutes; used += minutes;
    }
    const pending = actions.filter(action => action.studyModuleId === module.id && action.status === 'pending' && !action.archivedAt)
      .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));
    // Never infer that a stored date is ours: a user may have explicitly chosen the same day.
    // Reserve known work on that day before placing new exercises around it.
    for (const action of pending) {
      if (!action.dueDate || !integer(action.estimatedMinutes, 1)) continue;
      const date = [action.dueDate, action.deferredUntil ?? '', module.startDate ?? ''].sort().at(-1)!;
      const slot = slots.find(item => item.date === date);
      if (slot) slot.minutes = Math.max(0, slot.minutes - action.estimatedMinutes);
    }
    let earliest = module.startDate ?? '';
    for (const action of pending) {
      if (action.dueDate) continue;
      if (!integer(action.estimatedMinutes, 1)) {
        // Legacy actions keep their unknown estimate and the previous start-day fallback.
        dates.set(action.id, module.startDate ?? '');
        continue;
      }
      const notBefore = action.deferredUntil && action.deferredUntil > earliest ? action.deferredUntil : earliest;
      const slot = slots.find(item => item.date >= notBefore && item.minutes >= action.estimatedMinutes!);
      if (!slot) throw new Error(`Действие «${action.title}» не помещается целиком в учебные дни модуля «${module.title}». Уточните длительность или разделите действие.`);
      dates.set(action.id, slot.date);
      slot.minutes -= action.estimatedMinutes;
      earliest = slot.date;
    }
  }
  return dates;
}

/** Pure explicit-acceptance boundary. Does not create calendar entries or advance a completion clock. */
export function applyGoalStudyPlan(goal: Goal, candidate: StudyPlan): Goal {
  const studyPlan = normalizeGoalStudyPlan(candidate);
  if (!studyPlan) throw new Error('Учебный план повреждён. Сформируйте предложение повторно.');
  if (goal.deletedAt) return goal;
  const removed = new Set(goal.syncMeta?.removed?.milestones ?? []);
  const milestones = [...goal.milestones];
  const moduleMilestones = new Map<string, GoalMilestone>();
  const modules = new Map(studyPlan.modules.map((module, index) => [module.id, { module, index }]));
  for (const [position, module] of studyPlan.modules.entries()) {
    const existing = milestones.find(milestone => milestone.studyModuleId === module.id);
    const id = existing?.id ?? `study:${goal.id}:${module.id}`;
    // Physical deletions remain permanent across stale drafts and reapplication.
    if (removed.has(id)) continue;
    const milestone: GoalMilestone = {
      ...(existing ?? { id, description: '', completedAt: null }),
      title: module.title, studyModuleId: module.id,
      ...(module.startDate ? { startDate: module.startDate } : {}),
      deadline: module.endDate ?? existing?.deadline ?? '',
      status: existing?.status === 'completed' || module.status === 'completed' ? 'completed'
        : existing?.status === 'in_progress' || module.status === 'current' ? 'in_progress' : 'not_started',
      position,
    };
    if (existing) milestones[milestones.indexOf(existing)] = milestone;
    else milestones.push(milestone);
    moduleMilestones.set(module.id, milestone);
  }
  // Keep unrelated/history milestones and all action identities, statuses and completion timestamps.
  const orderedMilestones = [...moduleMilestones.values(), ...milestones.filter(milestone => !moduleMilestones.has(milestone.studyModuleId ?? ''))]
    .map((milestone, position) => ({ ...milestone, position }));
  const actionDates = studyActionDates(studyPlan, goal.actions.filter(action => moduleMilestones.has(action.studyModuleId ?? '')));
  const actions = goal.actions.map(action => {
    const linked = action.studyModuleId ? modules.get(action.studyModuleId) : undefined;
    const milestone = action.studyModuleId ? moduleMilestones.get(action.studyModuleId) : undefined;
    if (!linked || !milestone) return { ...action };
    const plannedDate = action.dueDate || actionDates.get(action.id) || linked.module.startDate || '';
    const availableDate = action.dueDate ? linked.module.startDate : plannedDate;
    const deferredUntil = action.deferredUntil;
    return { ...action, milestoneId: milestone.id,
      // Preserve completion and all stored dates; new exercises use a whole available study session.
      ...(action.status === 'pending' && !action.archivedAt ? { dueDate: plannedDate,
        deferredUntil: deferredUntil && deferredUntil > (availableDate ?? '')
          ? deferredUntil : availableDate ?? deferredUntil } : {}),
    };
  }).sort((a, b) => (modules.get(a.studyModuleId ?? '')?.index ?? Number.MAX_SAFE_INTEGER)
    - (modules.get(b.studyModuleId ?? '')?.index ?? Number.MAX_SAFE_INTEGER) || a.position - b.position || a.id.localeCompare(b.id));
  let previousPending: string[] = [];
  for (const module of studyPlan.modules) {
    const pending = actions.filter(action => action.studyModuleId === module.id && action.status !== 'completed' && !action.archivedAt);
    for (const action of pending) {
      if (previousPending.length) action.dependsOn = [...new Set([...(action.dependsOn ?? []), ...previousPending])];
    }
    if (pending.length && module.status !== 'completed') previousPending = pending.map(action => action.id);
  }
  if (hasDependencyCycle(actions)) throw new Error('Порядок модулей конфликтует с зависимостями действий. Уточните зависимости перед применением плана.');
  return { ...goal, studyPlan, milestones: orderedMilestones, actions: actions.map((action, position) => ({ ...action, position })) };
}
