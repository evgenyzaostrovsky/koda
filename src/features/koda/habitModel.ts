import type { Habit, HabitPauseEdit } from './types';
import { defaultHabitMonth, defaultHabitYear } from './constants';
import { getHabitMonthDays, monthKey, todayDateKey } from './utils';

/** Stable persisted keys. Legacy emoji values remain valid and are never rewritten. */
export const HABIT_ICONS = [
  { key: 'graduation', label: 'Учёба', emoji: '🎓' }, { key: 'dumbbell', label: 'Спорт', emoji: '🏃' },
  { key: 'book', label: 'Чтение', emoji: '📚' }, { key: 'droplet', label: 'Вода', emoji: '💧' },
  { key: 'moon', label: 'Сон', emoji: '🌙' }, { key: 'walk', label: 'Прогулка', emoji: '🚶' },
  { key: 'meditation', label: 'Медитация', emoji: '🧘' }, { key: 'food', label: 'Питание', emoji: '🥗' },
  { key: 'leaf', label: 'Забота о себе', emoji: '🌿' }, { key: 'laptop', label: 'Работа', emoji: '💻' },
  { key: 'other', label: 'Другое', emoji: '✨' },
] as const;

/** Weekdays use JavaScript's calendar convention: Sunday = 0, Monday = 1. */
export function habitMetadata(habit: Partial<Habit>): {
  icon: string; frequency: 'daily' | 'weekdays'; weekdays: number[]; isActive: boolean;
  createdDate: string | undefined; color?: string; archivedAt?: string | null;
} {
  const frequency = habit.frequency === 'weekdays' ? 'weekdays' as const : 'daily' as const;
  const weekdays = Array.isArray(habit.weekdays)
    ? [...new Set(habit.weekdays.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))].sort((a, b) => a - b)
    : [1, 2, 3, 4, 5];
  return {
    icon: typeof habit.icon === 'string' && habit.icon.trim() ? habit.icon.trim() : '✨',
    frequency, weekdays, isActive: typeof habit.isActive === 'boolean' ? habit.isActive : true,
    createdDate: typeof habit.createdDate === 'string' && isHabitDateKey(habit.createdDate) ? habit.createdDate : undefined,
    ...(typeof habit.color === 'string' && /^#[0-9a-f]{6}$/i.test(habit.color) ? { color: habit.color.toLowerCase() } : {}),
    ...(habit.archivedAt === null ? { archivedAt: null } : typeof habit.archivedAt === 'string' && Number.isFinite(Date.parse(habit.archivedAt))
      ? { archivedAt: new Date(habit.archivedAt).toISOString() } : {}),
  };
}

/** Keep absent legacy fields absent; sanitize supplied metadata without changing calendar facts. */
export function normalizeHabitMetadata(habit: Habit): Habit {
  const metadata = habitMetadata(habit);
  const normalized = { ...habit,
    ...(habit.icon !== undefined ? { icon: metadata.icon } : {}),
    ...(habit.frequency !== undefined ? { frequency: metadata.frequency } : {}),
    ...(habit.weekdays !== undefined ? { weekdays: metadata.weekdays } : {}),
    ...(habit.isActive !== undefined ? { isActive: metadata.isActive } : {}),
    ...(habit.createdDate !== undefined ? { createdDate: metadata.createdDate } : {}),
    ...(habit.color !== undefined ? { color: metadata.color } : {}),
    ...(habit.archivedAt !== undefined ? { archivedAt: metadata.archivedAt } : {}),
    ...(habit.pauseEdits !== undefined ? { pauseEdits: normalizeHabitPauseEdits(habit.pauseEdits) } : {}),
  };
  // JSON drops undefined properties; omit them here as well for stable reload/merge equality.
  if (!metadata.createdDate) delete normalized.createdDate;
  if (!metadata.color) delete normalized.color;
  if (metadata.archivedAt === undefined) delete normalized.archivedAt;
  return normalized;
}

export function habitIcon(habit: Habit) {
  const value = habitMetadata(habit).icon;
  return HABIT_ICONS.find(icon => icon.key === value)?.emoji ?? value;
}

export function normalizeHabitPauseEdits(value: Habit['pauseEdits']): Record<string, HabitPauseEdit> {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(Object.entries(value).filter(([date, edit]) => isHabitDateKey(date) && edit &&
    typeof edit.paused === 'boolean' && typeof edit.id === 'string' && edit.id &&
    typeof edit.at === 'string' && Number.isFinite(Date.parse(edit.at)))
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([date, edit]) => [date, { paused: edit.paused, at: new Date(edit.at).toISOString(), id: edit.id }]));
}

/** Only recorded pauses count historically. No dates are invented for legacy inactive habits. */
export function habitPausedOn(habit: Habit, dateKey: string): boolean {
  return Object.entries(normalizeHabitPauseEdits(habit.pauseEdits)).filter(([date]) => date <= dateKey).at(-1)?.[1].paused ?? false;
}

export function isHabitDateKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T12:00:00Z`)) &&
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

/** The caller supplies a local civil date key, never a UTC date derived from an instant. */
export function habitIsDue(habit: Habit, dateKey: string): boolean {
  if (!isHabitDateKey(dateKey) || habit.deletedAt || habit.archivedAt) return false;
  const metadata = habitMetadata(habit);
  if (!metadata.isActive || habitPausedOn(habit, dateKey) || (metadata.createdDate && dateKey < metadata.createdDate)) return false;
  return metadata.frequency === 'daily' || metadata.weekdays.includes(new Date(`${dateKey}T12:00:00Z`).getUTCDay());
}

/** Read actual dated facts. An undated weekly mirror cannot prove completion on this date. */
export function habitDoneOn(habit: Habit, dateKey: string): boolean {
  if (!isHabitDateKey(dateKey)) return false;
  const edit = habit.dayEdits?.[dateKey];
  if (edit && typeof edit.done === 'boolean' && typeof edit.id === 'string' && edit.id &&
    typeof edit.at === 'string' && Number.isFinite(Date.parse(edit.at))) return edit.done;
  const [year, month, day] = dateKey.split('-').map(Number);
  return getHabitMonthDays(habit, year, month - 1)[day - 1] === true;
}

/** Consecutive scheduled completions; an unfinished reference day has not broken the streak yet.
 * Scheduling uses current weekdays; historical schedule changes are not recorded. Recorded
 * pause days are skipped. Legacy inactive habits without a dated pause still return zero.
 */
export function habitStreak(habit: Habit, dateKey: string): number {
  if (!isHabitDateKey(dateKey) || habit.deletedAt || habit.archivedAt ||
    (!habitMetadata(habit).isActive && !Object.keys(normalizeHabitPauseEdits(habit.pauseEdits)).length)) return 0;
  const metadata = habitMetadata(habit);
  if (metadata.frequency === 'weekdays' && !metadata.weekdays.length) return 0;
  const datedMonths = Object.keys(habit.monthHistory ?? {}).filter(key => isHabitDateKey(`${key}-01`));
  datedMonths.push(monthKey(defaultHabitYear, defaultHabitMonth));
  const dates = [...datedMonths.map(key => `${key}-01`), ...Object.keys(habit.dayEdits ?? {}).filter(isHabitDateKey)].sort();
  const earliest = metadata.createdDate && metadata.createdDate > dates[0] ? metadata.createdDate : dates[0];
  let cursor = dateKey;
  let streak = 0;
  while (cursor >= earliest) {
    if (!habitPausedOn(habit, cursor) && (metadata.frequency === 'daily' ||
      metadata.weekdays.includes(new Date(`${cursor}T12:00:00Z`).getUTCDay()))) {
      if (habitDoneOn(habit, cursor)) streak++;
      else if (cursor !== dateKey) break;
    }
    // UTC here performs calendar arithmetic on a date key, not timezone conversion of an instant.
    const previous = new Date(`${cursor}T12:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() - 1);
    cursor = previous.toISOString().slice(0, 10);
  }
  return streak;
}

export type CreateHabitOptions = Partial<Pick<Habit, 'id' | 'target' | 'icon' | 'color' | 'frequency' | 'weekdays' | 'isActive' | 'createdDate'>>;
export function createHabit(title: string, options: CreateHabitOptions = {}): Habit {
  if (!title.trim()) throw new Error('Habit title is required');
  const metadata = habitMetadata(options);
  return {
    id: options.id ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID()
      : `habit-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`),
    title: title.trim(), target: options.target ?? (metadata.frequency === 'daily' ? 'Каждый день' : 'По дням недели'),
    ...metadata, createdDate: metadata.createdDate ?? todayDateKey(),
    doneDays: Array(7).fill(false), monthDays: Array(31).fill(false), monthHistory: {},
  };
}
