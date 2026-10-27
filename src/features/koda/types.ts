import type { Database } from '../../types/database';

export type TabKey = 'planner' | 'goals' | 'projects' | 'notes' | 'habits' | 'day' | 'routines' | 'timer' | 'profile' | 'journal' | 'progress' | 'koda';
export type ThemeId = 'calm-light' | 'calm-dark' | 'calm-sky-light' | 'calm-sky-dark' | 'calm-lavender-light' | 'calm-lavender-dark';
export type AccountInfo = { name: string; username: string; createdAt: string };
export type GoalStatus = 'active' | 'paused' | 'completed' | 'archived';
export type GoalPriority = 'main' | 'important' | 'supporting';
export type GoalMilestoneStatus = 'not_started' | 'in_progress' | 'completed';
export type GoalActionStatus = 'pending' | 'completed';
export type GoalActionImportance = 'normal' | 'key';
export type GoalRoutineMetricType = 'boolean' | 'minutes' | 'count';
export type GoalRoutineFrequencyType = 'daily' | 'weekly' | 'monthly' | 'selected_weekdays';

export type GoalMilestone = {
  id: string;
  title: string;
  description: string;
  deadline: string;
  status: GoalMilestoneStatus;
  position: number;
  completedAt: string | null;
};

export type GoalAction = {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  estimatedMinutes: number | null;
  importance: GoalActionImportance;
  milestoneId: string | null;
  status: GoalActionStatus;
  position: number;
  completedAt: string | null;
  archivedAt?: string | null;
  deferredUntil?: string;
  dependsOn?: string[];
};

export type GoalRoutine = {
  id: string;
  title: string;
  metricType: GoalRoutineMetricType;
  targetValue: number;
  frequencyType: GoalRoutineFrequencyType;
  weekdays: number[];
  startDate: string;
  endDate: string;
  isActive: boolean;
};

export type GoalRoutineLog = {
  id: string;
  routineId: string;
  date: string;
  value: number;
  createdAt: string;
  updatedAt: string;
};

export type KodaDayStatus = 'not_started' | 'active' | 'completed';
export type KodaDayClassification = 'strike' | 'pace' | 'minimum' | 'sabotage' | 'unclassified';
export type KodaDay = {
  id: string;
  localDate: string;
  timezone: string;
  status: KodaDayStatus;
  startedAt: string | null;
  finishedAt: string | null;
  goalScore: number | null;
  plannerScore: number;
  totalScore: number | null;
  classification: KodaDayClassification;
  scoreVersion: number;
  summary: string;
  focusLoss: string;
  nextRecommendation: string;
  goalsSnapshot: unknown;
  plannerSnapshot: unknown;
  calculationSnapshot: unknown;
  createdAt: string;
  updatedAt: string;
  plan?: import('./dayPlan').DayPlanState;
};

export type OpenWindowDirection = {
  id: string;
  title: string;
  position: number;
  actionIds: string[];
  routineIds: string[];
  archivedAt: string | null;
};
export type OpenWindowChange = {
  id: string;
  at: string;
  label: string;
  directions: OpenWindowDirection[];
  actionsSnapshot?: GoalAction[];
  routinesSnapshot?: GoalRoutine[];
};
export type OpenWindow = {
  version: 1;
  directions: OpenWindowDirection[];
  history: OpenWindowChange[];
  conflicts?: OpenWindowChange[];
};

export type Goal = {
  id: string;
  title: string;
  desiredResult: string;
  planningContext?: string;
  roadmapClarifications?: import('./goalRoadmapClarifications').RoadmapClarifications;
  deadline: string;
  priority: GoalPriority;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  archivedAt: string | null;
  milestones: GoalMilestone[];
  actions: GoalAction[];
  routines: GoalRoutine[];
  routineLogs: GoalRoutineLog[];
  openWindow?: OpenWindow;
};
/** Local civil day events; a resume on a day makes that day scheduled again. */
export type HabitPauseEdit = { paused: boolean; at: string; id: string };
export type Habit = { id: string; title: string; target: string; doneDays: boolean[]; monthDays: boolean[]; monthHistory: Record<string, boolean[]>; icon?: string; color?: string; frequency?: 'daily' | 'weekdays'; weekdays?: number[]; isActive?: boolean; createdDate?: string; archivedAt?: string | null; pauseEdits?: Record<string, HabitPauseEdit>; metadataUpdatedAt?: string; updatedAt?: string; deletedAt?: string | null; dayEdits?: Record<string, {done:boolean;at:string;id:string}> };
export type Task = { id: string; title: string; detail: string; done: boolean };
export type PlannerSubtask = { id: string; title: string; done: boolean };
export type PlannerSourceType = 'planner' | 'goal' | 'project' | 'recurring';
export type PlannerItem = {
  id: string;
  date: string;
  time: string;
  title: string;
  done: boolean;
  failed?: boolean;
  subtasks?: PlannerSubtask[];
  sourceType?: PlannerSourceType;
  sourceId?: string | null;
  ownerId?: string | null;
  updatedAt?: string;
  deletedAt?: string | null;
  goalId?: string | null;
  milestoneId?: string | null;
  goalActionId?: string | null;
};
export type ProjectTaskStatus = 'todo' | 'done';
export type ProjectTask = {
  id: string;
  title: string;
  description: string;
  cost: string;
  status: ProjectTaskStatus;
  plannedDate: string;
  plannedTime: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
};
export type Project = {
  id: string;
  title: string;
  description: string;
  status: 'active' | 'completed' | 'archived';
  tasks: ProjectTask[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};
export type NoteBlockType = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bullet' | 'numbered' | 'checklist' | 'quote' | 'code' | 'divider' | 'toggle';
export type NoteInlineMark = 'bold' | 'italic' | 'strike' | 'code' | 'link';
export type NoteBlock = {
  id: string;
  type: NoteBlockType;
  text: string;
  checked?: boolean;
  collapsed?: boolean;
  children?: NoteBlock[];
};
export type NoteDocument = {
  type: 'doc';
  content: NoteBlock[];
};
export type Note = {
  id: string;
  userId: string | null;
  title: string;
  content: NoteDocument;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
export type JournalMood = 1 | 2 | 3 | 4 | 5;
export type JournalMoodName = Database['public']['Enums']['journal_mood'];
export type JournalEntry = {
  id: string;
  title: string;
  text: string;
  sleepStart: string;
  wakeTime: string;
  tags: string[];
  mood: JournalMood;
  createdAt: string;
};
export type ChatMessage = { id: string; role: 'user' | 'koda'; text: string; createdAt?: string };
export type PomodoroSoundId =
  | 'aurora'
  | 'bell'
  | 'bloom'
  | 'breeze'
  | 'deep'
  | 'ember'
  | 'focus'
  | 'glass'
  | 'horizon'
  | 'pulse'
  | 'signal'
  | 'soft'
  | 'spark'
  | 'temple'
  | 'zen';
export type PomodoroSettings = {
  workMinutes: number;
  breakMinutes: number;
  longBreakMinutes: number;
  sessionsBeforeLongBreak: number;
  soundId: PomodoroSoundId;
};
export type ProfileState = {
  pet?: import('./petState').PetState;
  emotionEntries?: import('./emotionJournal').EmotionEntry[];
  themeId: ThemeId;
  version: string;
  daysLeft: string;
  level: string;
  streak: string;
  xp: string;
  values: string;
  futureSelf: string;
  focus: string;
  milestone: string;
};
