import { defaultJournalEntry, initialGoals, initialHabits } from './constants';
import { normalizeGoal } from './goalLogic';
import type { Goal, Habit, JournalEntry, KodaDay, Note, NoteBlock, NoteDocument, PlannerItem, ProfileState, Project, ThemeId } from './types';
import { todayDateKey } from './utils';

export type StoredKodaState = { goals: Goal[]; habits: Habit[]; kodaDays: KodaDay[]; profile: ProfileState; projects: Project[] };

export const defaultProfile: ProfileState = {
  themeId: 'koda-dark',
  version: '',
  daysLeft: '',
  level: '',
  streak: '',
  xp: '',
  values: '',
  futureSelf: '',
  focus: '',
  milestone: '',
};

export function parsePlannerItems(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return isPlannerItemList(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function isPlannerItemList(value: unknown): value is PlannerItem[] {
  return Array.isArray(value) && value.every((item) => (
    item &&
    typeof item === 'object' &&
    typeof (item as PlannerItem).id === 'string' &&
    typeof (item as PlannerItem).date === 'string' &&
    typeof (item as PlannerItem).time === 'string' &&
    typeof (item as PlannerItem).title === 'string' &&
    typeof (item as PlannerItem).done === 'boolean' &&
    ((item as PlannerItem).subtasks === undefined || isPlannerSubtaskList((item as PlannerItem).subtasks)) &&
    ((item as PlannerItem).sourceType === undefined || isPlannerSourceType((item as PlannerItem).sourceType)) &&
    ((item as PlannerItem).sourceId === undefined || (item as PlannerItem).sourceId === null || typeof (item as PlannerItem).sourceId === 'string') &&
    ((item as PlannerItem).ownerId === undefined || (item as PlannerItem).ownerId === null || typeof (item as PlannerItem).ownerId === 'string') &&
    ((item as PlannerItem).updatedAt === undefined || typeof (item as PlannerItem).updatedAt === 'string') &&
    ((item as PlannerItem).deletedAt === undefined || (item as PlannerItem).deletedAt === null || typeof (item as PlannerItem).deletedAt === 'string') &&
    ((item as PlannerItem).goalId === undefined || (item as PlannerItem).goalId === null || typeof (item as PlannerItem).goalId === 'string') &&
    ((item as PlannerItem).milestoneId === undefined || (item as PlannerItem).milestoneId === null || typeof (item as PlannerItem).milestoneId === 'string') &&
    ((item as PlannerItem).goalActionId === undefined || (item as PlannerItem).goalActionId === null || typeof (item as PlannerItem).goalActionId === 'string')
  ));
}

function isPlannerSubtaskList(value: unknown) {
  return Array.isArray(value) && value.every((subtask) => (
    subtask &&
    typeof subtask === 'object' &&
    typeof (subtask as { id?: unknown }).id === 'string' &&
    typeof (subtask as { title?: unknown }).title === 'string' &&
    typeof (subtask as { done?: unknown }).done === 'boolean'
  ));
}

export function mergePlannerItems(remoteItems: PlannerItem[], localItems: PlannerItem[]) {
  return mergeByUpdatedAt(remoteItems, localItems);
}

export function parseJournalEntries(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return isJournalEntryList(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeJournalEntries(remoteEntries: JournalEntry[], localEntries: JournalEntry[]) {
  return mergeJournalEntriesByFreshness(remoteEntries, localEntries).sort((first, second) => journalEntryTime(second) - journalEntryTime(first));
}

export function parseNotes(value: string | null) {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value);
    return isNoteList(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function mergeNotes(remoteNotes: Note[], localNotes: Note[]) {
  return mergeByUpdatedAt(remoteNotes, localNotes)
    .filter((note) => !note.deletedAt)
    .sort(compareNotes);
}

export function mergeStoredKodaState(remoteState: StoredKodaState, localState: StoredKodaState | null): StoredKodaState {
  if (!localState) return remoteState;

  return {
    goals: mergeByUpdatedAt(remoteState.goals, localState.goals),
    habits: localState.habits.length ? localState.habits : remoteState.habits,
    kodaDays: mergeKodaDays(remoteState.kodaDays, localState.kodaDays),
    profile: isProfileEmpty(localState.profile) ? remoteState.profile : localState.profile,
    projects: mergeProjects(remoteState.projects, localState.projects),
  };
}

export function isJournalEntryWorthSyncing(entry: JournalEntry) {
  return (
    Boolean(entry.text.trim()) ||
    entry.tags.length > 0 ||
    entry.sleepStart !== defaultJournalEntry.sleepStart ||
    entry.wakeTime !== defaultJournalEntry.wakeTime ||
    entry.mood !== defaultJournalEntry.mood
  );
}

export function journalDateKey(entry: JournalEntry) {
  const createdAt = new Date(entry.createdAt);
  if (Number.isNaN(createdAt.getTime())) return todayDateKey();

  const year = createdAt.getFullYear();
  const month = String(createdAt.getMonth() + 1).padStart(2, '0');
  const day = String(createdAt.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function parseStoredKodaState(value: string | null) {
  if (!value) return null;

  try {
    return normalizeStoredKodaState(JSON.parse(value));
  } catch {
    return null;
  }
}

export function normalizeStoredKodaState(value: unknown): StoredKodaState | null {
  if (!value || typeof value !== 'object') return null;

  const state = value as Partial<StoredKodaState> & { koda_days?: unknown };
  const goals = normalizeGoalList(state.goals) ?? initialGoals;
  const habits = isHabitList(state.habits) ? state.habits : initialHabits;
  const rawKodaDays = state.kodaDays ?? state.koda_days;
  const kodaDays = isKodaDayList(rawKodaDays) ? rawKodaDays : [];
  const profile = normalizeProfileState(state.profile);
  const projects = normalizeProjectList(state.projects) ?? [];

  return { goals, habits, kodaDays, profile, projects };
}

function mergeById<T extends { id: string }>(remoteItems: T[], localItems: T[]) {
  const itemsById = new Map<string, T>();

  for (const item of remoteItems) {
    itemsById.set(item.id, item);
  }

  for (const item of localItems) {
    itemsById.set(item.id, item);
  }

  return Array.from(itemsById.values());
}

function mergeByUpdatedAt<T extends { id: string; updatedAt?: string }>(remoteItems: T[], localItems: T[]) {
  const itemsById = new Map<string, T>();

  for (const item of remoteItems) {
    itemsById.set(item.id, item);
  }

  for (const item of localItems) {
    const existing = itemsById.get(item.id);
    if (!existing || timeValue(item.updatedAt) >= timeValue(existing.updatedAt)) {
      itemsById.set(item.id, item);
    }
  }

  return Array.from(itemsById.values());
}

function mergeProjects(remoteProjects: Project[], localProjects: Project[]) {
  const projectsById = new Map<string, Project>();

  for (const project of remoteProjects) {
    projectsById.set(project.id, project);
  }

  for (const project of localProjects) {
    const existing = projectsById.get(project.id);
    if (!existing) {
      projectsById.set(project.id, project);
      continue;
    }

    const newerProject = timeValue(project.updatedAt) >= timeValue(existing.updatedAt) ? project : existing;
    projectsById.set(project.id, {
      ...newerProject,
      tasks: mergeByUpdatedAt(existing.tasks, project.tasks),
    });
  }

  return Array.from(projectsById.values());
}

export function mergeKodaDays(remoteDays: KodaDay[], localDays: KodaDay[]) {
  const daysByKey = new Map<string, KodaDay>();

  for (const day of remoteDays) {
    daysByKey.set(day.localDate || day.id, day);
  }

  for (const day of localDays) {
    const key = day.localDate || day.id;
    const existing = daysByKey.get(key);
    if (!existing || timeValue(day.updatedAt) >= timeValue(existing.updatedAt)) {
      daysByKey.set(key, day);
    }
  }

  return Array.from(daysByKey.values()).sort((first, second) => second.localDate.localeCompare(first.localDate));
}

function timeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function isProfileEmpty(profile: ProfileState) {
  return profile.themeId === defaultProfile.themeId && !profile.version && !profile.daysLeft && !profile.level && !profile.streak && !profile.xp && !profile.values && !profile.futureSelf && !profile.focus && !profile.milestone;
}

function normalizeProfileState(value: unknown): ProfileState {
  if (!isProfileState(value)) return defaultProfile;
  return { ...defaultProfile, ...value, themeId: normalizeThemeId((value as Partial<ProfileState>).themeId) };
}

function normalizeThemeId(value: unknown): ThemeId {
  return value === 'reference-dark' ? 'reference-dark' : 'koda-dark';
}

function mergeJournalEntriesByFreshness(remoteEntries: JournalEntry[], localEntries: JournalEntry[]) {
  const itemsById = new Map<string, JournalEntry>();

  for (const item of remoteEntries) {
    itemsById.set(item.id, item);
  }

  for (const item of localEntries) {
    const existing = itemsById.get(item.id);
    if (!existing || journalEntryTime(item) >= journalEntryTime(existing)) {
      itemsById.set(item.id, item);
    }
  }

  return Array.from(itemsById.values());
}

function isJournalEntryList(value: unknown): value is JournalEntry[] {
  return Array.isArray(value) && value.every((item) => (
    item &&
    typeof item === 'object' &&
    typeof (item as JournalEntry).id === 'string' &&
    typeof (item as JournalEntry).title === 'string' &&
    typeof (item as JournalEntry).text === 'string' &&
    typeof (item as JournalEntry).sleepStart === 'string' &&
    typeof (item as JournalEntry).wakeTime === 'string' &&
    Array.isArray((item as JournalEntry).tags) &&
    typeof (item as JournalEntry).mood === 'number' &&
    typeof (item as JournalEntry).createdAt === 'string'
  ));
}

function journalEntryTime(entry: JournalEntry) {
  const createdAt = new Date(entry.createdAt);
  return Number.isNaN(createdAt.getTime()) ? 0 : createdAt.getTime();
}

function normalizeGoalList(value: unknown): Goal[] | null {
  if (!Array.isArray(value)) return null;
  const goals = value.map(normalizeGoal).filter((item): item is Goal => Boolean(item));
  return goals.length || value.length === 0 ? goals : null;
}

function isHabitList(value: unknown): value is Habit[] {
  return Array.isArray(value) && value.every((item) => (
    item &&
    typeof item === 'object' &&
    typeof (item as Habit).id === 'string' &&
    typeof (item as Habit).title === 'string' &&
    typeof (item as Habit).target === 'string' &&
    Array.isArray((item as Habit).doneDays) &&
    Array.isArray((item as Habit).monthDays) &&
    typeof (item as Habit).monthHistory === 'object'
  ));
}

function isPlannerSourceType(value: unknown) {
  return value === 'planner' || value === 'goal' || value === 'project' || value === 'recurring';
}

function isNoteList(value: unknown): value is Note[] {
  return Array.isArray(value) && value.every(isNote);
}

function isNote(value: unknown): value is Note {
  if (!value || typeof value !== 'object') return false;
  const note = value as Note;

  return (
    typeof note.id === 'string' &&
    (note.userId === null || typeof note.userId === 'string') &&
    typeof note.title === 'string' &&
    isNoteDocument(note.content) &&
    typeof note.pinned === 'boolean' &&
    typeof note.createdAt === 'string' &&
    typeof note.updatedAt === 'string' &&
    (note.deletedAt === null || typeof note.deletedAt === 'string')
  );
}

function isNoteDocument(value: unknown): value is NoteDocument {
  if (!value || typeof value !== 'object') return false;
  const doc = value as NoteDocument;
  return doc.type === 'doc' && Array.isArray(doc.content) && doc.content.every(isNoteBlock);
}

function isNoteBlock(value: unknown): value is NoteBlock {
  if (!value || typeof value !== 'object') return false;
  const block = value as NoteBlock;
  const validType = (
    block.type === 'paragraph' ||
    block.type === 'heading1' ||
    block.type === 'heading2' ||
    block.type === 'heading3' ||
    block.type === 'bullet' ||
    block.type === 'numbered' ||
    block.type === 'checklist' ||
    block.type === 'quote' ||
    block.type === 'code' ||
    block.type === 'divider' ||
    block.type === 'toggle'
  );

  return (
    typeof block.id === 'string' &&
    validType &&
    typeof block.text === 'string' &&
    (block.checked === undefined || typeof block.checked === 'boolean') &&
    (block.collapsed === undefined || typeof block.collapsed === 'boolean') &&
    (block.children === undefined || (Array.isArray(block.children) && block.children.every(isNoteBlock)))
  );
}

function compareNotes(first: Note, second: Note) {
  if (first.pinned !== second.pinned) return first.pinned ? -1 : 1;
  return timeValue(second.updatedAt) - timeValue(first.updatedAt);
}

function isKodaDayList(value: unknown): value is KodaDay[] {
  return Array.isArray(value) && value.every((item) => (
    item &&
    typeof item === 'object' &&
    typeof (item as KodaDay).id === 'string' &&
    typeof (item as KodaDay).localDate === 'string' &&
    typeof (item as KodaDay).timezone === 'string' &&
    ((item as KodaDay).status === 'not_started' || (item as KodaDay).status === 'active' || (item as KodaDay).status === 'completed') &&
    ((item as KodaDay).startedAt === null || typeof (item as KodaDay).startedAt === 'string') &&
    ((item as KodaDay).finishedAt === null || typeof (item as KodaDay).finishedAt === 'string') &&
    typeof (item as KodaDay).plannerScore === 'number' &&
    ((item as KodaDay).totalScore === null || typeof (item as KodaDay).totalScore === 'number')
  ));
}

function normalizeProjectList(value: unknown): Project[] | null {
  if (!Array.isArray(value)) return null;
  const projects = value.map(normalizeProject).filter((project): project is Project => Boolean(project));
  return projects.length || value.length === 0 ? projects : null;
}

function normalizeProject(value: unknown): Project | null {
  if (!value || typeof value !== 'object') return null;

  const project = value as Project;
  if (
    typeof project.id !== 'string' ||
    typeof project.title !== 'string' ||
    typeof project.description !== 'string' ||
    (project.status !== 'active' && project.status !== 'completed' && project.status !== 'archived') ||
    !Array.isArray(project.tasks) ||
    typeof project.createdAt !== 'string' ||
    typeof project.updatedAt !== 'string' ||
    (project.completedAt !== null && typeof project.completedAt !== 'string')
  ) {
    return null;
  }

  return {
    ...project,
    tasks: project.tasks.map(normalizeProjectTask).filter((task): task is Project['tasks'][number] => Boolean(task)),
  };
}

function normalizeProjectTask(value: unknown): Project['tasks'][number] | null {
  if (!value || typeof value !== 'object') return null;

  const task = value as Project['tasks'][number];
  if (
    typeof task.id !== 'string' ||
    typeof task.title !== 'string' ||
    typeof task.description !== 'string' ||
    typeof task.cost !== 'string' ||
    (task.status !== 'todo' && task.status !== 'done') ||
    typeof task.createdAt !== 'string' ||
    typeof task.updatedAt !== 'string' ||
    (task.completedAt !== null && typeof task.completedAt !== 'string')
  ) {
    return null;
  }

  return {
    ...task,
    plannedDate: typeof task.plannedDate === 'string' ? task.plannedDate : '',
    plannedTime: typeof task.plannedTime === 'string' ? task.plannedTime : '',
    deletedAt: typeof task.deletedAt === 'string' ? task.deletedAt : null,
  };
}

function isProfileState(value: unknown): value is ProfileState {
  if (!value || typeof value !== 'object') return false;

  const profile = value as ProfileState;

  return (
    typeof profile.version === 'string' &&
    typeof profile.daysLeft === 'string' &&
    typeof profile.level === 'string' &&
    typeof profile.streak === 'string' &&
    typeof profile.xp === 'string' &&
    typeof profile.values === 'string' &&
    typeof profile.futureSelf === 'string' &&
    typeof profile.focus === 'string' &&
    typeof profile.milestone === 'string' &&
    (profile.themeId === undefined || profile.themeId === 'koda-dark' || profile.themeId === 'reference-dark')
  );
}
