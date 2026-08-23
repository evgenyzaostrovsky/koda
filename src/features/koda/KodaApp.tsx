import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { BarChart3, Bot, CalendarDays, CircleCheck, FileText, FolderKanban, ListChecks, NotebookText, PanelLeftClose, PanelLeftOpen, Plus, User, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, SafeAreaView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { isSupabaseConfigured } from '../../config/env';
import { supabase } from '../../lib/supabase';
import { Header } from './components';
import { DesktopShell } from './components/DesktopShell';
import { defaultHabitMonth, defaultHabitYear, defaultJournalEntry, initialGoals, initialHabits, journalMoodByName, journalMoodByValue, journalOwnerKey } from './constants';
import { calculateGoalProgress } from './goalLogic';
import { fromKodaDayRow, mergeKodaDaySources, toKodaDayRow } from './kodaDaySync';
import { defaultProfile, isJournalEntryWorthSyncing, journalDateKey, mergeJournalEntries, mergePlannerItems, mergeStoredKodaState, normalizeStoredKodaState, parseJournalEntries, parseNotes, parsePlannerItems, parseStoredKodaState, type StoredKodaState } from './persistence';
import { buildProjectPlannerItems } from './plannerProjections';
import { GoalsScreen } from './screens/GoalsScreen';
import { JournalScreen } from './screens/JournalScreen';
import { KodaScreen } from './screens/KodaScreen';
import { KodaDayScreen } from './screens/KodaDayScreen';
import { PlannerScreen, parseQuickTaskInput } from './screens/PlannerScreen';
import { NotesScreen } from './screens/NotesScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { styles } from './styles';
import { accent, applyKodaTheme, muted, panel, resolveKodaThemeId } from './theme';
import type { AccountInfo, ChatMessage, Goal, Habit, JournalEntry, KodaDay, Note, PlannerItem, ProfileState, Project, TabKey } from './types';
import { buildMonthDays, displayTimeValue, getCurrentWeekDates, getHabitMonthDays, monthKey, normalizeTimeValue, sleepDurationMinutes, todayDateKey, uid } from './utils';

function KodaMarkIcon({ active = false, size = 18 }: { active?: boolean; size?: number }) {
  const scale = size / 18;

  return (
    <View style={[styles.kodaMarkIcon, { height: size, width: size }]}> 
      <View
        style={[
          styles.kodaMarkIconBlade,
          styles.kodaMarkIconBladeBack,
          active && styles.kodaMarkIconBladeActive,
          {
            borderRadius: 3.8 * scale,
            height: 7.2 * scale,
            left: 1.7 * scale,
            top: 5.4 * scale,
            width: 14.6 * scale,
          },
        ]}
      />
      <View
        style={[
          styles.kodaMarkIconBlade,
          active && styles.kodaMarkIconBladeActive,
          {
            borderRadius: 3.8 * scale,
            height: 7.2 * scale,
            left: 1.7 * scale,
            top: 5.4 * scale,
            width: 14.6 * scale,
          },
        ]}
      />
    </View>
  );
}

const tabs: Array<{ key: TabKey; label: string; icon: (active: boolean) => ReactNode }> = [
  { key: 'planner', label: 'Планнер', icon: (active) => <CalendarDays color={active ? accent : muted} size={17} /> },
  { key: 'goals', label: 'Цели', icon: (active) => <CircleCheck color={active ? accent : muted} size={17} /> },
  { key: 'projects', label: 'Проекты', icon: (active) => <FolderKanban color={active ? accent : muted} size={17} /> },
  { key: 'notes', label: 'Заметки', icon: (active) => <NotebookText color={active ? accent : muted} size={17} /> },
  { key: 'journal', label: 'Дневник', icon: (active) => <FileText color={active ? accent : muted} size={17} /> },
  { key: 'habits', label: 'KODA', icon: (active) => <KodaMarkIcon active={active} size={18} /> },
  { key: 'progress', label: 'Прогресс', icon: (active) => <BarChart3 color={active ? accent : muted} size={17} /> },
  { key: 'profile', label: 'Профиль', icon: (active) => <User color={active ? accent : muted} size={17} /> },
  { key: 'koda', label: 'Помощник', icon: (active) => <Bot color={active ? accent : muted} size={17} /> },
];

const desktopTabLabels: Record<TabKey, string> = {
  planner: 'Планнер',
  goals: 'Цели',
  projects: 'Проекты',
  notes: 'Заметки',
  journal: 'Дневник',
  habits: 'KODA',
  progress: 'Прогресс',
  profile: 'Профиль',
  koda: 'Помощник',
};
const plannerStorageKey = 'koda:plannerItems:v1';
const journalStorageKey = 'koda:journalEntries:v1';
const notesStorageKey = 'koda:notes:v1';
const kodaStateStorageKey = 'koda:appState:v1';
const calendarKeyStorageKey = 'koda:calendarKey:v1';
const syncQueueStorageKey = 'koda:syncQueue:v1';
const desktopSidebarStorageKey = 'koda:desktopSidebarCollapsed:v1';
type CalendarSyncState = { count: number; message: string; status: 'idle' | 'syncing' | 'synced' | 'error' };
type SyncDomain = 'planner' | 'journal' | 'appState' | 'notes' | 'kodaDays';
const starterPlannerItemIds = new Set(['planner-1', 'planner-2', 'planner-3', 'planner-4', 'planner-5']);

export function KodaApp({ onSignOut, userId }: { onSignOut?: () => void; userId?: string | null }) {
  const [activeTab, setActiveTab] = useState<TabKey>('habits');
  const [desktopSidebarCollapsed, setDesktopSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { width } = useWindowDimensions();
  const isDesktopLayout = width >= 1040;
  const desktopSidebarWidth = desktopSidebarCollapsed ? 72 : 210;
  const desktopContentMaxWidth = 1360;
  const desktopContentPadding = 32;
  const desktopAvailableWidth = Math.max(0, width - desktopSidebarWidth);
  const desktopContentWidth = Math.min(desktopContentMaxWidth, desktopAvailableWidth);
  const desktopQuickAddRight = Math.max(
    desktopContentPadding,
    width - desktopSidebarWidth - ((desktopAvailableWidth - desktopContentWidth) / 2 + desktopContentWidth) + desktopContentPadding,
  );
  const [plannerItems, setPlannerItems] = useState<PlannerItem[]>([]);
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const [plannerLoadedStorageKey, setPlannerLoadedStorageKey] = useState('');
  const [calendarKey, setCalendarKey] = useState('');
  const [legacyCalendarKeys, setLegacyCalendarKeys] = useState<string[]>([]);
  const [calendarSync, setCalendarSync] = useState<CalendarSyncState>({ count: 0, message: 'Готовлю календарь...', status: 'idle' });
  const [deletedPlannerItemIds, setDeletedPlannerItemIds] = useState<string[]>([]);
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [projects, setProjects] = useState<Project[]>([]);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [kodaDays, setKodaDays] = useState<KodaDay[]>([]);
  const [appStateLoaded, setAppStateLoaded] = useState(false);
  const [appStateLoadedStorageKey, setAppStateLoadedStorageKey] = useState('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([defaultJournalEntry]);
  const [journalLoaded, setJournalLoaded] = useState(false);
  const [journalLoadedStorageKey, setJournalLoadedStorageKey] = useState('');
  const [activeJournalId, setActiveJournalId] = useState(defaultJournalEntry.id);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesLoadedStorageKey, setNotesLoadedStorageKey] = useState('');
  const [notesSaveState, setNotesSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [syncRetryToken, setSyncRetryToken] = useState(0);
  const [plannerPullToken, setPlannerPullToken] = useState(0);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [syncQueue, setSyncQueue] = useState<SyncDomain[]>([]);
  const [syncQueueLoaded, setSyncQueueLoaded] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddSubtasks, setQuickAddSubtasks] = useState<NonNullable<PlannerItem['subtasks']>>([]);
  const [quickAddSubtaskDraft, setQuickAddSubtaskDraft] = useState('');
  const [quickAddSubtaskOpen, setQuickAddSubtaskOpen] = useState(false);
  const [quickAddEditingSubtaskId, setQuickAddEditingSubtaskId] = useState<string | null>(null);
  const [quickAddEditingSubtaskTitle, setQuickAddEditingSubtaskTitle] = useState('');
  const [quickAddLastSubtaskTap, setQuickAddLastSubtaskTap] = useState<{ id: string; at: number } | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([
    { id: 'koda-1', role: 'koda', text: 'Привет. Я рядом. Напиши цель, задачу или проблему - разложим на следующий шаг.' },
  ]);

  const projectPlannerItems = useMemo(() => buildProjectPlannerItems(projects), [projects]);
  const plannerDayItems = useMemo(() => [...plannerItems, ...projectPlannerItems], [plannerItems, projectPlannerItems]);
  const completedTasks = plannerDayItems.filter((item) => item.done).length;
  const habitScore = habits.length
    ? Math.round((habits.flatMap((habit) => habit.doneDays).filter(Boolean).length / (habits.length * 7)) * 100)
    : 0;

  useEffect(() => {
    let active = true;

    async function loadAccountInfo() {
      if (!userId || !isSupabaseConfigured()) {
        if (active) setAccountInfo(null);
        return;
      }

      const { data } = await (supabase as any)
        .from('profiles')
        .select('name, username, created_at')
        .eq('id', userId)
        .maybeSingle();

      if (!active) return;

      setAccountInfo({
        name: String(data?.name || ''),
        username: String(data?.username || ''),
        createdAt: String(data?.created_at || ''),
      });
    }

    void loadAccountInfo().catch(() => {
      if (active) setAccountInfo(null);
    });

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    function retrySync() {
      setIsOnline(true);
      setSyncRetryToken((value) => value + 1);
      setPlannerPullToken((value) => value + 1);
    }

    function markOffline() {
      setIsOnline(false);
    }

    window.addEventListener('online', retrySync);
    window.addEventListener('offline', markOffline);

    return () => {
      window.removeEventListener('online', retrySync);
      window.removeEventListener('offline', markOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDesktopSidebarCollapsed(window.localStorage.getItem(desktopSidebarStorageKey) === '1');
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(desktopSidebarStorageKey, desktopSidebarCollapsed ? '1' : '0');
  }, [desktopSidebarCollapsed]);


  useEffect(() => {
    applyKodaTheme(resolveKodaThemeId(profile.themeId));
  }, [profile.themeId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    function pullPlannerWhenVisible() {
      if (document.visibilityState === 'visible' && (typeof navigator === 'undefined' || navigator.onLine)) {
        setPlannerPullToken((value) => value + 1);
      }
    }

    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && (typeof navigator === 'undefined' || navigator.onLine)) {
        setPlannerPullToken((value) => value + 1);
      }
    }, 15000);

    window.addEventListener('focus', pullPlannerWhenVisible);
    document.addEventListener('visibilitychange', pullPlannerWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', pullPlannerWhenVisible);
      document.removeEventListener('visibilitychange', pullPlannerWhenVisible);
    };
  }, []);

  useEffect(() => {
    setSyncQueueLoaded(false);
    const storageKey = scopedStorageKey(syncQueueStorageKey, userId);

    AsyncStorage.getItem(storageKey)
      .then((value) => {
        const parsed = parseSyncQueue(value);
        setSyncQueue(parsed);
        setSyncQueueLoaded(true);
      })
      .catch(() => {
        setSyncQueue([]);
        setSyncQueueLoaded(true);
      });
  }, [plannerPullToken, userId]);

  useEffect(() => {
    if (!syncQueueLoaded) return;
    const storageKey = scopedStorageKey(syncQueueStorageKey, userId);
    void AsyncStorage.setItem(storageKey, JSON.stringify(syncQueue));
  }, [syncQueue, syncQueueLoaded, userId]);

  useEffect(() => {
    let active = true;

    async function loadJournalEntry() {
      setJournalLoaded(false);
      setJournalLoadedStorageKey('');
      const storageKey = scopedStorageKey(journalStorageKey, userId);

      const storedValue = await AsyncStorage.getItem(storageKey);
      const storedQueue = parseSyncQueue(await AsyncStorage.getItem(scopedStorageKey(syncQueueStorageKey, userId)));
      const hasPendingJournalSync = storedQueue.includes('journal');
      const localEntries = parseJournalEntries(storedValue);

      if (localEntries && active) {
        const localEntriesWithToday = ensureTodayJournalEntry(localEntries);
        setJournalEntries(localEntriesWithToday);
        setActiveJournalId((currentId) =>
          localEntriesWithToday.some((entry) => entry.id === currentId) ? currentId : preferredJournalEntryId(localEntriesWithToday),
        );
      }

      if (!isSupabaseConfigured()) {
        if (active) {
          setJournalLoadedStorageKey(storageKey);
          setJournalLoaded(true);
        }
        return;
      }

      let query = (supabase as any)
        .from('journal_entries')
        .select('id, content, mood, sleep_start_time, wake_time, day_tags, created_at, updated_at')
        .order('updated_at', { ascending: false });

      query = userId ? query.eq('user_id', userId) : query.eq('owner_key', journalOwnerKey);

      const { data, error } = await query;

      if (!active) return;

      if (error) {
        setJournalLoadedStorageKey(storageKey);
        setJournalLoaded(true);
        return;
      }

      const rows: Array<Record<string, any>> = data ?? [];
      const entries = rows.map((item: Record<string, any>, index: number) => ({
          ...defaultJournalEntry,
          id: item.id,
          title: `Запись ${rows.length - index}`,
          text: item.content,
          sleepStart: displayTimeValue(item.sleep_start_time) || defaultJournalEntry.sleepStart,
          wakeTime: displayTimeValue(item.wake_time) || defaultJournalEntry.wakeTime,
          tags: item.day_tags,
          mood: item.mood && item.mood in journalMoodByName ? journalMoodByName[item.mood as keyof typeof journalMoodByName] : defaultJournalEntry.mood,
          createdAt: item.created_at || item.updated_at,
        }));

        const nextEntries = entries.length && hasPendingJournalSync && localEntries ? mergeJournalEntries(entries, localEntries) : entries;

        if (nextEntries.length) {
          const entriesWithToday = ensureTodayJournalEntry(nextEntries);
          setJournalEntries(entriesWithToday);
          setActiveJournalId((currentId) =>
            entriesWithToday.some((entry) => entry.id === currentId) ? currentId : preferredJournalEntryId(entriesWithToday),
          );
      } else if (!localEntries && userId) {
        setJournalEntries([{ ...defaultJournalEntry, id: uid('journal'), createdAt: new Date().toISOString() }]);
      }

      setJournalLoadedStorageKey(storageKey);
      setJournalLoaded(true);
    }

    void loadJournalEntry().catch(() => {
      if (active) {
        setJournalLoadedStorageKey(scopedStorageKey(journalStorageKey, userId));
        setJournalLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, [userId]);

  function applyStoredKodaState(state: StoredKodaState) {
    setGoals(state.goals);
    setProjects(state.projects);
    setHabits(state.habits);
    setKodaDays(state.kodaDays);
    setProfile(state.profile);
  }

  useEffect(() => {
    if (!appStateLoaded) return;
    const storageKey = scopedStorageKey(kodaStateStorageKey, userId);
    if (appStateLoadedStorageKey !== storageKey) return;

    const state: StoredKodaState = { goals, habits, kodaDays, profile, projects };
    void AsyncStorage.setItem(storageKey, JSON.stringify(state));

    if (!userId || !isSupabaseConfigured()) return;

    async function syncAppState() {
      const existingState = await (supabase as any)
        .from('user_app_state')
        .select('profile')
        .eq('user_id', userId)
        .maybeSingle();
      const existingProfile = isPlainObject(existingState.data?.profile) ? existingState.data.profile : {};
      const notesForProfile = existingProfile.__kodaNotes;
      const payload = {
        user_id: userId,
        goals,
        projects,
        habits,
        koda_days: kodaDays,
        profile: {
          ...existingProfile,
          ...profile,
          ...(notesForProfile ? { __kodaNotes: notesForProfile } : {}),
        },
        updated_at: new Date().toISOString(),
      };

      let { error } = await (supabase as any).from('user_app_state').upsert(payload, { onConflict: 'user_id' });

      if (appStateSchemaMissingJsonColumn(error?.message)) {
        const { koda_days: _kodaDays, projects: _projects, ...payloadWithoutJsonColumns } = payload;
        const retry = await (supabase as any).from('user_app_state').upsert(payloadWithoutJsonColumns, { onConflict: 'user_id' });
        error = retry.error;
      } else if (appStateSchemaMissingKodaDays(error?.message)) {
        const { koda_days: _kodaDays, ...payloadWithoutKodaDays } = payload;
        const retry = await (supabase as any).from('user_app_state').upsert(payloadWithoutKodaDays, { onConflict: 'user_id' });
        error = retry.error;
      }

      if (!error) {
        await syncGoalsToBackend(goals).catch(() => undefined);
        clearSyncQueued('appState');
      }
    }

    void syncAppState().catch(() => undefined);
  }, [appStateLoaded, appStateLoadedStorageKey, goals, habits, kodaDays, profile, projects, syncRetryToken, userId]);

  useEffect(() => {
    if (!appStateLoaded || !userId || !isSupabaseConfigured()) return;
    if (!syncQueue.includes('kodaDays')) return;

    async function syncKodaDays() {
      const rows = kodaDays.map((day) => toKodaDayRow(day, userId!));
      if (rows.length) {
        const { error } = await (supabase as any).from('koda_days').upsert(rows, { onConflict: 'user_id,local_date' });
        if (error) return;
      }
      clearSyncQueued('kodaDays');
    }

    void syncKodaDays().catch(() => undefined);
  }, [appStateLoaded, kodaDays, syncQueue, syncRetryToken, userId]);

  useEffect(() => {
    if (!journalLoaded) return;
    const storageKey = scopedStorageKey(journalStorageKey, userId);
    if (journalLoadedStorageKey !== storageKey) return;

    void AsyncStorage.setItem(storageKey, JSON.stringify(journalEntries));
  }, [journalEntries, journalLoaded, journalLoadedStorageKey, userId]);

  useEffect(() => {
    if (!journalLoaded || !isSupabaseConfigured()) return;

    async function syncJournalEntries() {
      for (const entry of journalEntries) {
        if (!isJournalEntryWorthSyncing(entry)) continue;
        try {
          await saveJournalToBackend(entry);
        } catch {
          return;
        }
      }
      clearSyncQueued('journal');
    }

    void syncJournalEntries();
  }, [journalEntries, journalLoaded, syncRetryToken, userId]);

  useEffect(() => {
    let active = true;

    async function loadNotes() {
      setNotesLoaded(false);
      setNotesLoadedStorageKey('');
      const storageKey = scopedStorageKey(notesStorageKey, userId);
      const storedValue = await AsyncStorage.getItem(storageKey);
      const storedQueue = parseSyncQueue(await AsyncStorage.getItem(scopedStorageKey(syncQueueStorageKey, userId)));
      const hasPendingNotesSync = storedQueue.includes('notes');
      const localNotes = parseNotes(storedValue);

      if (localNotes && active) setNotes([...localNotes].sort(compareNotesForApp));

      if (!userId || !isSupabaseConfigured()) {
        if (active) {
          setNotesLoadedStorageKey(storageKey);
          setNotesLoaded(true);
        }
        return;
      }

      const { data, error } = await (supabase as any)
        .from('notes')
        .select('id, user_id, title, content, pinned, created_at, updated_at, deleted_at')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false });

      if (!active) return;

      if (error) {
        const fallback = await (supabase as any)
          .from('user_app_state')
          .select('profile')
          .eq('user_id', userId)
          .maybeSingle();
        const embeddedNotes = parseEmbeddedNotes(fallback.data?.profile);
        if (!fallback.error && embeddedNotes) {
          const nextNotes = hasPendingNotesSync && localNotes
            ? mergeNotesIncludingDeleted(embeddedNotes, localNotes)
            : embeddedNotes.sort(compareNotesForApp);
          setNotes(nextNotes);
          void AsyncStorage.setItem(storageKey, JSON.stringify(nextNotes));
        }
        setNotesLoadedStorageKey(storageKey);
        setNotesLoaded(true);
        return;
      }

      const remoteNotes = parseRemoteNotes(data ?? []);
      const nextNotes = hasPendingNotesSync && localNotes ? mergeNotesIncludingDeleted(remoteNotes, localNotes) : remoteNotes.sort(compareNotesForApp);
      setNotes(nextNotes);
      void AsyncStorage.setItem(storageKey, JSON.stringify(nextNotes));
      setNotesLoadedStorageKey(storageKey);
      setNotesLoaded(true);
    }

    void loadNotes().catch(() => {
      if (active) {
        setNotesLoadedStorageKey(scopedStorageKey(notesStorageKey, userId));
        setNotesLoaded(true);
      }
    });

    return () => {
      active = false;
    };
  }, [plannerPullToken, userId]);

  useEffect(() => {
    if (!notesLoaded) return;
    const storageKey = scopedStorageKey(notesStorageKey, userId);
    if (notesLoadedStorageKey !== storageKey) return;

    setNotesSaveState('saving');
    void AsyncStorage.setItem(storageKey, JSON.stringify(notes));

    const timer = setTimeout(() => {
      if (!userId || !isSupabaseConfigured()) {
        setNotesSaveState('saved');
        return;
      }
      markSyncQueued('notes');
      setSyncRetryToken((value) => value + 1);
    }, 700);

    return () => clearTimeout(timer);
  }, [notes, notesLoaded, notesLoadedStorageKey, userId]);

  useEffect(() => {
    if (!notesLoaded || !userId || !isSupabaseConfigured()) return;

    async function syncNotes() {
      try {
        const rows = notes.map((note) => ({
          id: note.id,
          user_id: userId,
          title: note.title.trim() || 'Без названия',
          content: note.content,
          pinned: note.pinned,
          created_at: note.createdAt,
          updated_at: note.updatedAt,
          deleted_at: note.deletedAt,
        }));

        if (rows.length) {
          const { error } = await (supabase as any).from('notes').upsert(rows, { onConflict: 'id' });
          if (error) {
            const current = await (supabase as any)
              .from('user_app_state')
              .select('profile')
              .eq('user_id', userId)
              .maybeSingle();
            if (current.error) throw current.error;
            const currentProfile = isPlainObject(current.data?.profile) ? current.data.profile : {};
            const fallback = await (supabase as any).from('user_app_state').upsert({
              user_id: userId,
              profile: { ...currentProfile, __kodaNotes: notes },
              updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });
            if (fallback.error) throw fallback.error;
          }
        }

        clearSyncQueued('notes');
        setNotesSaveState('saved');
      } catch {
        markSyncQueued('notes');
      }
    }

    const timer = setTimeout(() => {
      void syncNotes();
    }, 900);

    return () => clearTimeout(timer);
  }, [notes, notesLoaded, syncRetryToken, userId]);

  useEffect(() => {
    let active = true;

    async function loadAccountState() {
      setAppStateLoaded(false);
      setAppStateLoadedStorageKey('');

      const storageKey = scopedStorageKey(kodaStateStorageKey, userId);

      try {
        const storedValue = await AsyncStorage.getItem(storageKey);
        const storedQueue = parseSyncQueue(await AsyncStorage.getItem(scopedStorageKey(syncQueueStorageKey, userId)));
        const storedState = parseStoredKodaState(storedValue);

        if (!userId) {
          if (storedState && active) applyStoredKodaState(storedState);
          if (active) {
            setAppStateLoadedStorageKey(storageKey);
            setAppStateLoaded(true);
          }
          return;
        }

        if (!isSupabaseConfigured()) {
          if (storedState && active) applyStoredKodaState(storedState);
          if (active) {
            setAppStateLoadedStorageKey(storageKey);
            setAppStateLoaded(true);
          }
          return;
        }

        let { data, error } = await (supabase as any)
          .from('user_app_state')
          .select('goals, projects, habits, koda_days, profile')
          .eq('user_id', userId)
          .maybeSingle();

        if (appStateSchemaMissingJsonColumn(error?.message)) {
          const retry = await (supabase as any)
            .from('user_app_state')
            .select('goals, habits, profile')
            .eq('user_id', userId)
            .maybeSingle();
          data = retry.data;
          error = retry.error;
        } else if (appStateSchemaMissingKodaDays(error?.message)) {
          const retry = await (supabase as any)
            .from('user_app_state')
            .select('goals, habits, profile')
            .eq('user_id', userId)
            .maybeSingle();
          data = retry.data;
          error = retry.error;
        }

        if (!active) return;

        const remoteState = !error && data ? normalizeStoredKodaState(data) : null;
        const remoteDaysResult = await (supabase as any)
          .from('koda_days')
          .select('*')
          .eq('user_id', userId)
          .order('local_date', { ascending: false });
        const canonicalRemoteDays: KodaDay[] = remoteDaysResult.error
          ? []
          : (remoteDaysResult.data ?? []).map((row: Record<string, unknown>) => fromKodaDayRow(row)).filter((day: KodaDay | null): day is KodaDay => Boolean(day));
        const localDays = storedState?.kodaDays ?? [];
        const localDayNeedsPush = localDays.some((localDay) => {
          const remoteDay = canonicalRemoteDays.find((candidate) => candidate.localDate === localDay.localDate);
          if (!remoteDay) return true;
          return new Date(localDay.updatedAt).getTime() > new Date(remoteDay.updatedAt).getTime();
        });
        if (localDayNeedsPush) markSyncQueued('kodaDays');

        if (remoteState) {
          const nextState = mergeStoredKodaState(remoteState, storedState);
          nextState.kodaDays = mergeKodaDaySources(canonicalRemoteDays, nextState.kodaDays);
          applyStoredKodaState(nextState);
          void AsyncStorage.setItem(storageKey, JSON.stringify(nextState));
        } else if (storedState) {
          const nextState = { ...storedState, kodaDays: mergeKodaDaySources(canonicalRemoteDays, storedState.kodaDays) };
          applyStoredKodaState(nextState);
          void AsyncStorage.setItem(storageKey, JSON.stringify(nextState));
        } else if (canonicalRemoteDays.length) {
          const nextState = normalizeStoredKodaState({ kodaDays: canonicalRemoteDays });
          if (nextState) applyStoredKodaState(nextState);
        }

        setAppStateLoadedStorageKey(storageKey);
        setAppStateLoaded(true);
      } catch {
        if (active) {
          setAppStateLoadedStorageKey(storageKey);
          setAppStateLoaded(true);
        }
      }
    }

    void loadAccountState();

    return () => {
      active = false;
    };
  }, [plannerPullToken, userId]);

  useEffect(() => {
    let active = true;

    async function loadPlannerItems() {
      try {
        setPlannerLoaded(false);
        setPlannerLoadedStorageKey('');
        const nextCalendarKey = userId ? accountOwnerKey(userId) : await getGuestCalendarKey();
        const userPlannerStorageKey = scopedStorageKey(plannerStorageKey, userId);
        const storedQueue = parseSyncQueue(await AsyncStorage.getItem(scopedStorageKey(syncQueueStorageKey, userId)));
        const hasPendingPlannerSync = storedQueue.includes('planner');
        const storedGuestCalendarKey = userId ? await AsyncStorage.getItem(calendarKeyStorageKey) : null;

        if (active) setCalendarKey(nextCalendarKey);
        if (active) setLegacyCalendarKeys(storedGuestCalendarKey && storedGuestCalendarKey !== nextCalendarKey ? [storedGuestCalendarKey] : []);

        const storedValue = await AsyncStorage.getItem(userPlannerStorageKey);
        const legacyStoredValue = userId && !storedValue ? await AsyncStorage.getItem(plannerStorageKey) : null;
        const localItems = stripStarterPlannerItems(parsePlannerItems(storedValue) ?? parsePlannerItems(legacyStoredValue));

        if (!userId && localItems && active) {
          setPlannerItems(localItems);
        }

        if (!isSupabaseConfigured()) {
          if (userId && active) setPlannerItems(localItems ?? []);
          if (active) setPlannerLoadedStorageKey(userPlannerStorageKey);
          return;
        }

        let plannerQuery = await (supabase as any)
          .from('planner_events')
          .select('id, event_date, event_time, title, done, subtasks, updated_at')
          .eq('owner_key', nextCalendarKey)
          .order('event_date', { ascending: true })
          .order('event_time', { ascending: true });

        if (plannerSchemaMissingSubtasks(plannerQuery.error?.message)) {
          plannerQuery = await (supabase as any)
            .from('planner_events')
            .select('id, event_date, event_time, title, done, updated_at')
            .eq('owner_key', nextCalendarKey)
            .order('event_date', { ascending: true })
            .order('event_time', { ascending: true });
        }

        if (plannerQuery.error) {
          setCalendarSync({
            count: 0,
            message: calendarSyncErrorMessage(plannerQuery.error.message),
            status: 'error',
          });
        }

        const remoteItems = stripStarterPlannerItems(Array.isArray(plannerQuery.data)
          ? plannerQuery.data.map((item: Record<string, unknown>) => ({
              id: String(item.id),
              date: String(item.event_date),
              time: item.event_time ? String(item.event_time).slice(0, 5) : '',
              title: String(item.title),
              done: Boolean(item.done),
              subtasks: parsePlannerSubtasks(item.subtasks),
              sourceType: 'planner' as const,
              sourceId: null,
              ownerId: null,
              updatedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
              deletedAt: null,
            }))
          : []) ?? [];

        if (!active) return;

        if (remoteItems.length) {
          setPlannerItems(hasPendingPlannerSync && localItems ? mergePlannerItems(remoteItems, localItems) : remoteItems);
        } else if (localItems && (!userId || hasPendingPlannerSync)) {
          setPlannerItems(localItems);
        } else if (userId) {
          setPlannerItems([]);
        }
        setPlannerLoadedStorageKey(userPlannerStorageKey);
      } catch {
        if (userId && active) setPlannerItems([]);
        if (active) setPlannerLoadedStorageKey(scopedStorageKey(plannerStorageKey, userId));
      } finally {
        if (active) setPlannerLoaded(true);
      }
    }

    void loadPlannerItems();

    return () => {
      active = false;
    };
  }, [plannerPullToken, userId]);

  async function syncGoalsToBackend(nextGoals: Goal[]) {
    if (!userId || !isSupabaseConfigured()) return;

    const accountGoals = nextGoals.filter((goal) => isUuid(goal.id));
    if (!accountGoals.length) return;

    const now = new Date().toISOString();
    const goalRows = accountGoals.map((goal, index) => ({
      id: goal.id,
      user_id: userId,
      title: goal.title,
      description: goal.desiredResult || null,
      desired_result: goal.desiredResult || null,
      deadline: goal.deadline || null,
      target_date: goal.deadline || null,
      priority: goal.priority,
      status: goal.status,
      progress: calculateGoalProgress(goal),
      sort_order: index,
      completed_at: goal.completedAt,
      archived_at: goal.archivedAt,
      updated_at: now,
    }));

    const { error: goalsError } = await (supabase as any).from('goals').upsert(goalRows, { onConflict: 'id' });
    if (goalsError) throw goalsError;

    const milestoneRows = accountGoals.flatMap((goal) =>
      goal.milestones.map((milestone) => ({
        id: milestone.id,
        goal_id: goal.id,
        user_id: userId,
        title: milestone.title,
        description: milestone.description || null,
        deadline: milestone.deadline || null,
        status: milestone.status,
        position: milestone.position,
        completed_at: milestone.completedAt,
        updated_at: now,
      })),
    );
    if (milestoneRows.length) {
      const { error } = await (supabase as any).from('goal_milestones').upsert(milestoneRows, { onConflict: 'id' });
      if (error) throw error;
    }

    const actionRows = accountGoals.flatMap((goal) =>
      goal.actions.map((action) => ({
        id: action.id,
        goal_id: goal.id,
        milestone_id: action.milestoneId,
        user_id: userId,
        title: action.title,
        description: action.description || null,
        due_date: action.dueDate || null,
        estimated_minutes: action.estimatedMinutes,
        importance: action.importance,
        status: action.status,
        position: action.position,
        completed_at: action.completedAt,
        updated_at: now,
      })),
    );
    if (actionRows.length) {
      const { error } = await (supabase as any).from('goal_actions').upsert(actionRows, { onConflict: 'id' });
      if (error) throw error;
    }

    const routineRows = accountGoals.flatMap((goal) =>
      goal.routines.map((routine) => ({
        id: routine.id,
        goal_id: goal.id,
        user_id: userId,
        title: routine.title,
        metric_type: routine.metricType,
        target_value: routine.targetValue,
        frequency_type: routine.frequencyType,
        weekdays: routine.weekdays,
        start_date: routine.startDate,
        end_date: routine.endDate || null,
        is_active: routine.isActive,
        updated_at: now,
      })),
    );
    if (routineRows.length) {
      const { error } = await (supabase as any).from('goal_routines').upsert(routineRows, { onConflict: 'id' });
      if (error) throw error;
    }

    const logRows = accountGoals.flatMap((goal) =>
      goal.routineLogs.map((log) => ({
        id: log.id,
        routine_id: log.routineId,
        goal_id: goal.id,
        user_id: userId,
        log_date: log.date,
        value: log.value,
        updated_at: log.updatedAt,
      })),
    );
    if (logRows.length) {
      const { error } = await (supabase as any).from('goal_routine_logs').upsert(logRows, { onConflict: 'routine_id,log_date' });
      if (error) throw error;
    }
  }

  async function getGuestCalendarKey() {
    const storedCalendarKey = await AsyncStorage.getItem(calendarKeyStorageKey);
    const nextCalendarKey = storedCalendarKey || uid('calendar');

    if (!storedCalendarKey) {
      await AsyncStorage.setItem(calendarKeyStorageKey, nextCalendarKey);
    }

    return nextCalendarKey;
  }

  function markSyncQueued(domain: SyncDomain) {
    setSyncQueue((items) => (items.includes(domain) ? items : [...items, domain]));
  }

  function clearSyncQueued(domain: SyncDomain) {
    setSyncQueue((items) => items.filter((item) => item !== domain));
  }

  useEffect(() => {
    if (!plannerLoaded) return;
    const userPlannerStorageKey = scopedStorageKey(plannerStorageKey, userId);
    if (plannerLoadedStorageKey !== userPlannerStorageKey) return;
    void AsyncStorage.setItem(userPlannerStorageKey, JSON.stringify(plannerItems));
  }, [plannerItems, plannerLoaded, plannerLoadedStorageKey, userId]);

  useEffect(() => {
    if (!plannerLoaded || !calendarKey || !isSupabaseConfigured()) return;

    async function syncPlannerItems() {
      setCalendarSync({ count: plannerItems.length, message: 'Синхронизирую планнер...', status: 'syncing' });

      try {
        const ownerKeys = [calendarKey, ...legacyCalendarKeys].filter((key, index, keys) => key && keys.indexOf(key) === index);
        const cleanPlannerItems = stripStarterPlannerItems(plannerItems) ?? [];
        const rows = ownerKeys.flatMap((ownerKey, ownerIndex) =>
          cleanPlannerItems.map((item) => ({
            id: ownerIndex === 0 ? item.id : `${ownerKey}:${item.id}`,
            owner_key: ownerKey,
            event_date: item.date,
            event_time: item.time || null,
            title: item.title,
            done: item.done,
            subtasks: item.subtasks ?? [],
            updated_at: item.updatedAt ?? new Date().toISOString(),
          })),
        );

        if (rows.length) {
          let { error } = await (supabase as any).from('planner_events').upsert(rows, { onConflict: 'id' });

          if (plannerSchemaMissingSubtasks(error?.message)) {
            const rowsWithoutSubtasks = rows.map(({ subtasks: _subtasks, ...row }) => row);
            const retry = await (supabase as any).from('planner_events').upsert(rowsWithoutSubtasks, { onConflict: 'id' });
            error = retry.error;
          }

          if (error) {
            throw error;
          }
        }

        const starterDeleteIds = ownerKeys.flatMap((ownerKey, ownerIndex) => Array.from(starterPlannerItemIds).map((id) => (ownerIndex === 0 ? id : `${ownerKey}:${id}`)));
        const deleteIds = ownerKeys.flatMap((ownerKey, ownerIndex) => deletedPlannerItemIds.map((id) => (ownerIndex === 0 ? id : `${ownerKey}:${id}`)));
        const allDeleteIds = [...new Set([...deleteIds, ...starterDeleteIds])];

        if (allDeleteIds.length) {
          const { error } = await (supabase as any).from('planner_events').delete().in('id', allDeleteIds);

          if (error) {
            throw error;
          }

          if (deletedPlannerItemIds.length) setDeletedPlannerItemIds([]);
        }

        setCalendarSync({
          count: cleanPlannerItems.length,
          message: cleanPlannerItems.length ? `${cleanPlannerItems.length} дел синхронизировано` : 'В планнере нет дел для календаря',
          status: 'synced',
        });
        clearSyncQueued('planner');
      } catch {
        setCalendarSync({
          count: 0,
          message: 'Не удалось синхронизировать. Проверь SQL planner_events в Supabase.',
          status: 'error',
        });
        // Planner must keep working locally even when remote calendar sync is unavailable.
      }
    }

    void syncPlannerItems();
  }, [calendarKey, deletedPlannerItemIds, legacyCalendarKeys, plannerItems, plannerLoaded, syncRetryToken]);

  function togglePlannerItem(id: string) {
    markSyncQueued('planner');
    const now = new Date().toISOString();
    setPlannerItems((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const done = !item.done;
        return { ...item, done, subtasks: item.subtasks?.map((subtask) => ({ ...subtask, done })), updatedAt: now };
      }),
    );
  }

  function addPlannerItem(item: Pick<PlannerItem, 'date' | 'time' | 'title'> & { subtasks?: PlannerItem['subtasks'] }) {
    const trimmed = item.title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    markSyncQueued('planner');
    setPlannerItems((items) => [{ id: uid('planner'), date: item.date, time: item.time, title: trimmed, done: false, subtasks: item.subtasks ?? [], sourceType: 'planner', sourceId: null, ownerId: null, updatedAt: now, deletedAt: null }, ...items]);
  }

  function submitQuickPlannerItem() {
    const parsed = parseQuickTaskInput(quickAddText, todayDateKey(), '');
    if (!parsed) return;

    addPlannerItem({ ...parsed, subtasks: quickAddSubtasks });
    setQuickAddText('');
    setQuickAddSubtasks([]);
    setQuickAddSubtaskDraft('');
    setQuickAddSubtaskOpen(false);
    setQuickAddEditingSubtaskId(null);
    setQuickAddEditingSubtaskTitle('');
    setQuickAddLastSubtaskTap(null);
    setQuickAddOpen(false);
    setActiveTab('planner');
  }

  function addQuickAddSubtask() {
    const title = quickAddSubtaskDraft.trim();
    if (!title) return;

    setQuickAddSubtasks((subtasks) => [...subtasks, { id: uid('subtask'), title, done: false }]);
    setQuickAddSubtaskDraft('');
    setQuickAddSubtaskOpen(true);
  }

  function removeQuickAddSubtask(id: string) {
    setQuickAddSubtasks((subtasks) => subtasks.filter((subtask) => subtask.id !== id));
    if (quickAddEditingSubtaskId === id) {
      setQuickAddEditingSubtaskId(null);
      setQuickAddEditingSubtaskTitle('');
    }
  }

  function startQuickAddSubtaskEdit(subtask: NonNullable<PlannerItem['subtasks']>[number]) {
    setQuickAddEditingSubtaskId(subtask.id);
    setQuickAddEditingSubtaskTitle(subtask.title);
  }

  function handleQuickAddSubtaskPress(subtask: NonNullable<PlannerItem['subtasks']>[number]) {
    const now = Date.now();
    if (quickAddLastSubtaskTap?.id === subtask.id && now - quickAddLastSubtaskTap.at < 360) {
      startQuickAddSubtaskEdit(subtask);
      setQuickAddLastSubtaskTap(null);
      return;
    }

    setQuickAddLastSubtaskTap({ id: subtask.id, at: now });
  }

  function saveQuickAddSubtaskEdit() {
    if (!quickAddEditingSubtaskId) return;
    const title = quickAddEditingSubtaskTitle.trim();
    if (!title) return;

    setQuickAddSubtasks((subtasks) => subtasks.map((subtask) => (subtask.id === quickAddEditingSubtaskId ? { ...subtask, title } : subtask)));
    setQuickAddEditingSubtaskId(null);
    setQuickAddEditingSubtaskTitle('');
  }

  function updatePlannerItem(id: string, item: Pick<PlannerItem, 'date' | 'time' | 'title'> & { subtasks?: PlannerItem['subtasks'] }) {
    const trimmed = item.title.trim();
    if (!trimmed) return;
    markSyncQueued('planner');
    setPlannerItems((items) => items.map((plannerItem) => (plannerItem.id === id ? { ...plannerItem, date: item.date, time: item.time, title: trimmed, subtasks: item.subtasks ?? [], updatedAt: new Date().toISOString() } : plannerItem)));
  }

  function togglePlannerSubtask(itemId: string, subtaskId: string) {
    markSyncQueued('planner');
    setPlannerItems((items) =>
      items.map((item) => {
        if (item.id !== itemId) return item;
        const subtasks = (item.subtasks ?? []).map((subtask) => (subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask));
        return { ...item, subtasks, done: subtasks.length ? subtasks.every((subtask) => subtask.done) : item.done, updatedAt: new Date().toISOString() };
      }),
    );
  }

  function deletePlannerItem(id: string) {
    markSyncQueued('planner');
    setPlannerItems((items) => items.filter((plannerItem) => plannerItem.id !== id));
    setDeletedPlannerItemIds((items) => (items.includes(id) ? items : [...items, id]));
  }

  function updateGoals(updater: (items: Goal[]) => Goal[]) {
    markSyncQueued('appState');
    setGoals(updater);
  }

  function updateKodaDays(updater: (items: KodaDay[]) => KodaDay[]) {
    markSyncQueued('kodaDays');
    setKodaDays((items) => {
      const nextKodaDays = updater(items);
      const storageKey = scopedStorageKey(kodaStateStorageKey, userId);
      if (appStateLoaded && appStateLoadedStorageKey === storageKey) {
        const state: StoredKodaState = { goals, habits, kodaDays: nextKodaDays, profile, projects };
        void AsyncStorage.setItem(storageKey, JSON.stringify(state));
      }
      return nextKodaDays;
    });
  }

  function updateProjects(updater: (items: Project[]) => Project[]) {
    markSyncQueued('appState');
    setProjects(updater);
  }

  function updateNotes(updater: (items: Note[]) => Note[]) {
    markSyncQueued('notes');
    setNotes((items) => updater(items).sort(compareNotesForApp));
  }

  function toggleProjectedPlannerItem(item: PlannerItem) {
    if (item.sourceType !== 'project' || !item.ownerId || !item.sourceId) return;

    const now = new Date().toISOString();
    updateProjects((items) =>
      items.map((project) => {
        if (project.id !== item.ownerId) return project;

        return {
          ...project,
          tasks: project.tasks.map((task) => {
            if (task.id !== item.sourceId) return task;
            const done = task.status !== 'done';
            return { ...task, status: done ? 'done' : 'todo', completedAt: done ? now : null, updatedAt: now };
          }),
          updatedAt: now,
        };
      }),
    );
  }

  function moveProjectedPlannerItemDate(item: PlannerItem, date: string) {
    if (item.sourceType !== 'project' || !item.ownerId || !item.sourceId) return;

    const now = new Date().toISOString();
    updateProjects((items) =>
      items.map((project) => {
        if (project.id !== item.ownerId) return project;

        return {
          ...project,
          tasks: project.tasks.map((task) => (task.id === item.sourceId ? { ...task, plannedDate: date, plannedTime: item.time, updatedAt: now } : task)),
          updatedAt: now,
        };
      }),
    );
  }

  function updateProfile(patch: Partial<ProfileState>) {
    markSyncQueued('appState');
    setProfile((currentProfile) => ({ ...currentProfile, ...patch }));
  }

  function addHabit(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    markSyncQueued('appState');
    const monthDays = buildMonthDays();
    setHabits((items) => [
      {
        id: uid('habit'),
        title: trimmed,
        target: 'Ежедневно',
        doneDays: [false, false, false, false, false, false, false],
        monthDays,
        monthHistory: { [monthKey(defaultHabitYear, defaultHabitMonth)]: monthDays },
      },
      ...items,
    ]);
  }

  function toggleHabitDay(id: string, dayIndex: number) {
    markSyncQueued('appState');
    const weekDate = getCurrentWeekDates()[dayIndex];
    if (!weekDate) return;

    const year = weekDate.getFullYear();
    const monthIndex = weekDate.getMonth();
    const monthDayIndex = weekDate.getDate() - 1;

    setHabits((items) =>
      items.map((habit) =>
        {
          if (habit.id !== id) return habit;

          const key = monthKey(year, monthIndex);
          const nextDays = getHabitMonthDays(habit, year, monthIndex).map((done, index) => (index === monthDayIndex ? !done : done));
          const isDefaultMonth = year === defaultHabitYear && monthIndex === defaultHabitMonth;

          return {
            ...habit,
            doneDays: habit.doneDays.map((done, index) => (index === dayIndex ? !done : done)),
            monthDays: isDefaultMonth ? nextDays : habit.monthDays,
            monthHistory: { ...habit.monthHistory, [key]: nextDays },
          };
        }
      ),
    );
  }

  function toggleHabitMonthDay(id: string, dayIndex: number, year: number, monthIndex: number) {
    markSyncQueued('appState');
    setHabits((items) =>
      items.map((habit) =>
        {
          if (habit.id !== id) return habit;

          const key = monthKey(year, monthIndex);
          const nextDays = getHabitMonthDays(habit, year, monthIndex).map((done, index) => (index === dayIndex ? !done : done));
          const isDefaultMonth = year === defaultHabitYear && monthIndex === defaultHabitMonth;

          return {
            ...habit,
            monthDays: isDefaultMonth ? nextDays : habit.monthDays,
            monthHistory: { ...habit.monthHistory, [key]: nextDays },
            doneDays: isDefaultMonth && dayIndex < 7 ? habit.doneDays.map((done, index) => (index === dayIndex ? !done : done)) : habit.doneDays,
          };
        }
      ),
    );
  }

  function updateHabit(id: string, patch: Pick<Habit, 'title' | 'target'>) {
    const title = patch.title.trim();
    const target = patch.target.trim();
    if (!title || !target) return;
    markSyncQueued('appState');
    setHabits((items) => items.map((habit) => (habit.id === id ? { ...habit, title, target } : habit)));
  }

  function deleteHabit(id: string) {
    markSyncQueued('appState');
    setHabits((items) => items.filter((habit) => habit.id !== id));
  }

  async function saveJournalToBackend(entry: JournalEntry) {
    if (!isSupabaseConfigured()) return;

    const payload = {
      content: entry.text,
      mood: journalMoodByValue[entry.mood],
      sleep_start_time: normalizeTimeValue(entry.sleepStart),
      wake_time: normalizeTimeValue(entry.wakeTime),
      sleep_duration_minutes: sleepDurationMinutes(entry.sleepStart, entry.wakeTime),
      day_tags: entry.tags,
    };

    if (entry.id.startsWith('journal-')) {
      const { data, error } = await (supabase as any)
        .from('journal_entries')
        .insert({
          owner_key: userId ? accountOwnerKey(userId) : journalOwnerKey,
          user_id: userId ?? null,
          entry_date: journalDateKey(entry),
          ...payload,
        })
        .select('id, created_at, updated_at')
        .single();

      if (!error && data?.id) {
        setJournalEntries((items) =>
          items.map((item) => (item.id === entry.id ? { ...item, id: data.id, createdAt: data.created_at || item.createdAt } : item)),
        );
        setActiveJournalId((currentId) => (currentId === entry.id ? data.id : currentId));
      }

      return;
    }

    const updateQuery = (supabase as any).from('journal_entries').update(payload).eq('id', entry.id);
    await (userId ? updateQuery.eq('user_id', userId) : updateQuery.eq('owner_key', journalOwnerKey));
  }

  function addJournalEntry() {
    const currentEntry = journalEntries.find((entry) => entry.id === activeJournalId) ?? journalEntries[0];
    if (!currentEntry?.text.trim()) return;
    markSyncQueued('journal');

    const now = new Date().toISOString();
    const nextEntry: JournalEntry = {
      ...defaultJournalEntry,
      id: uid('journal'),
      title: `Запись ${journalEntries.length + 1}`,
      createdAt: now,
    };

    setJournalEntries((items) => [nextEntry, ...items]);
    setActiveJournalId(nextEntry.id);
  }

  function updateJournal(patch: Partial<JournalEntry>) {
    markSyncQueued('journal');
    const currentEntry = journalEntries.find((entry) => entry.id === activeJournalId) ?? journalEntries[0];
    const nextEntry = { ...currentEntry, ...patch, createdAt: currentEntry.createdAt || new Date().toISOString() };
    setJournalEntries((items) => items.map((entry) => (entry.id === currentEntry.id ? nextEntry : entry)));
  }

  function deleteJournalEntry(id: string) {
    const fallbackEntry = { ...defaultJournalEntry, id: uid('journal'), createdAt: new Date().toISOString() };
    const remainingEntries = journalEntries.filter((entry) => entry.id !== id);
    const nextEntries = remainingEntries.length ? remainingEntries : [fallbackEntry];
    const nextActiveId = activeJournalId === id ? nextEntries[0].id : activeJournalId;

    markSyncQueued('journal');
    setJournalEntries(nextEntries);
    setActiveJournalId(nextActiveId);

    if (isSupabaseConfigured() && !id.startsWith('journal-')) {
      void (async () => {
        const deleteQuery = (supabase as any).from('journal_entries').delete().eq('id', id);
        await (userId ? deleteQuery.eq('user_id', userId) : deleteQuery.eq('owner_key', journalOwnerKey));
      })();
    }
  }

  function sendKodaMessage(textValue: string) {
    const trimmed = textValue.trim();
    if (!trimmed) return;
    setChat((items) => [
      ...items,
      { id: uid('user'), role: 'user', text: trimmed },
      { id: uid('koda'), role: 'koda', text: 'Принял. Следующий шаг: запиши это как конкретную задачу на сегодня или привяжи к цели.' },
    ]);
  }

  const screen = (() => {
    if (activeTab === 'planner') {
      return <PlannerScreen goals={goals} isDesktop={isDesktopLayout} items={plannerItems} onAddItem={addPlannerItem} onDeleteItem={deletePlannerItem} onGoalsChange={updateGoals} onMoveProjectedItemDate={moveProjectedPlannerItemDate} onToggleItem={togglePlannerItem} onToggleProjectedItem={toggleProjectedPlannerItem} onToggleSubtask={togglePlannerSubtask} onUpdateItem={updatePlannerItem} projectItems={projectPlannerItems} />;
    }
    if (activeTab === 'goals') {
      return <GoalsScreen goals={goals} isDesktop={isDesktopLayout} isOnline={isOnline} onGoalsChange={updateGoals} />;
    }
    if (activeTab === 'projects') {
      return <ProjectsScreen isDesktop={isDesktopLayout} onProjectsChange={updateProjects} projects={projects} />;
    }
    if (activeTab === 'notes') {
      return <NotesScreen isDesktop={isDesktopLayout} notes={notes} onNotesChange={updateNotes} saveState={notesSaveState} userId={userId ?? null} />;
    }
    if (activeTab === 'habits') {
      return (
        <KodaDayScreen
          goals={goals}
          isDesktop={isDesktopLayout}
          kodaDays={kodaDays}
          onGoalsChange={updateGoals}
          onKodaDaysChange={updateKodaDays}
          plannerItems={plannerDayItems}
        />
      );
    }
    if (activeTab === 'profile') {
      return <ProfileScreen accountInfo={accountInfo} calendarKey={calendarKey} calendarSync={calendarSync} habits={habits} isDesktop={isDesktopLayout} onProfileChange={updateProfile} onSignOut={onSignOut} plannerItems={plannerItems} profile={profile} />;
    }
    if (activeTab === 'journal') {
      const activeEntry = journalEntries.find((entry) => entry.id === activeJournalId) ?? journalEntries[0];

      return (
        <JournalScreen
          activeEntryId={activeEntry.id}
          canAddEntry={Boolean(activeEntry.text.trim())}
          entries={journalEntries}
          entry={activeEntry}
          isDesktop={isDesktopLayout}
          onAddEntry={addJournalEntry}
          onDeleteEntry={deleteJournalEntry}
          onSelectEntry={setActiveJournalId}
          onUpdate={updateJournal}
        />
      );
    }
    if (activeTab === 'progress') {
      return <ProgressScreen completedTasks={completedTasks} goals={goals} habitScore={habitScore} isDesktop={isDesktopLayout} totalTasks={plannerDayItems.length} />;
    }
    return <KodaScreen chat={chat} isDesktop={isDesktopLayout} onSend={sendKodaMessage} />;
  })();

  const syncReady = syncQueueLoaded && plannerLoaded && journalLoaded && appStateLoaded && notesLoaded;
  const visibleSyncQueue = syncReady ? syncQueue : [];
  const syncText = getSyncText(visibleSyncQueue, isOnline, syncReady);
  const quickAddPreview = parseQuickTaskInput(quickAddText, todayDateKey(), '');
  const desktopPrimaryTabs = tabs.slice(0, 5);
  const desktopSecondaryTabs = tabs.slice(5);
  const renderDesktopTab = (tab: (typeof tabs)[number]) => {
    const active = activeTab === tab.key;

    return (
      <Pressable
        key={tab.key}
        onPress={() => setActiveTab(tab.key)}
        style={[styles.desktopNavItem, active && styles.desktopNavItemActive, desktopSidebarCollapsed && styles.desktopNavItemCollapsed]}
        testID={`desktop-tab-${tab.key}`}
      >
        <View style={styles.desktopNavIcon}>{tab.icon(active)}</View>
        {!desktopSidebarCollapsed ? <Text style={[styles.desktopNavText, active && styles.desktopNavTextActive]}>{desktopTabLabels[tab.key]}</Text> : null}
      </Pressable>
    );
  };
  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <View style={[styles.stage, isDesktopLayout && styles.desktopStage]}>
        <View style={[styles.frame, isDesktopLayout && styles.desktopFrame]}>
          {isDesktopLayout ? (
            <DesktopShell
              globalNavigation={(
              <View style={[styles.desktopSidebar, desktopSidebarCollapsed && styles.desktopSidebarCollapsed]}>
                <View style={styles.desktopSidebarHeader}>
                  <View style={[styles.desktopLogoGroup, desktopSidebarCollapsed && styles.desktopLogoGroupCollapsed]}>
                    <View style={styles.desktopLogoMark}>
                      <View style={[styles.desktopLogoMarkBlade, styles.desktopLogoMarkBladeOne]} />
                      <View style={[styles.desktopLogoMarkBlade, styles.desktopLogoMarkBladeTwo]} />
                    </View>
                    {!desktopSidebarCollapsed ? <Text style={styles.desktopLogoWord}>KODA</Text> : null}
                  </View>
                  <Pressable onPress={() => setDesktopSidebarCollapsed((collapsed) => !collapsed)} style={styles.desktopSidebarToggle}>
                    {desktopSidebarCollapsed ? <PanelLeftOpen color={muted} size={16} /> : <PanelLeftClose color={muted} size={16} />}
                  </Pressable>
                </View>

                <View style={styles.desktopNavList}>
                  {desktopPrimaryTabs.map(renderDesktopTab)}
                  <View style={styles.desktopNavDivider} />
                  {desktopSecondaryTabs.map(renderDesktopTab)}
                </View>

                <View style={styles.desktopSidebarFooter}>
                  <View style={[styles.desktopSidebarStatus, desktopSidebarCollapsed && styles.desktopSidebarStatusCollapsed]}>
                    <View style={[styles.syncStripDot, isOnline && !visibleSyncQueue.length && styles.syncStripDotOk, !isOnline && styles.syncStripDotOffline]} />
                    {!desktopSidebarCollapsed ? <Text style={styles.desktopSyncText}>{syncText}</Text> : null}
                  </View>
                </View>
              </View>
              )}
              workspace={(
                <View nativeID="koda-desktop-workspace" style={styles.desktopWorkspace}>
                  <View style={styles.desktopContentGrid}>
                    <View style={styles.desktopContent}>{screen}</View>
                  </View>
                </View>
              )}
            />
          ) : (
            <>
              <Header hasPendingSync={Boolean(visibleSyncQueue.length)} isOnline={isOnline} onMenuPress={() => setMobileMenuOpen(true)} syncText={syncText} />
              <View style={styles.content}>{screen}</View>
            </>
          )}
        </View>
      </View>
      <Modal animationType="fade" transparent visible={!isDesktopLayout && mobileMenuOpen} onRequestClose={() => setMobileMenuOpen(false)}>
        <View style={styles.mobileDrawerOverlay}>
          <Pressable accessibilityLabel="Закрыть меню" onPress={() => setMobileMenuOpen(false)} style={styles.mobileDrawerScrim} />
          <View style={styles.mobileDrawer}>
            <View style={styles.mobileDrawerHeader}>
              <View style={styles.desktopLogoGroup}>
                <KodaMarkIcon active size={18} />
                <Text style={styles.desktopLogoWord}>KODA</Text>
              </View>
              <Pressable accessibilityLabel="Закрыть меню" onPress={() => setMobileMenuOpen(false)} style={styles.mobileDrawerClose}>
                <X color={muted} size={20} />
              </Pressable>
            </View>
            <View style={styles.mobileDrawerNavigation}>
              {tabs.map((tab) => {
                const active = activeTab === tab.key;
                return (
                  <Pressable
                    key={tab.key}
                    onPress={() => {
                      setActiveTab(tab.key);
                      setMobileMenuOpen(false);
                    }}
                    style={[styles.mobileDrawerItem, active && styles.mobileDrawerItemActive]}
                    testID={`mobile-menu-${tab.key}`}
                  >
                    <View style={styles.mobileDrawerIcon}>{tab.icon(active)}</View>
                    <Text style={[styles.mobileDrawerText, active && styles.mobileDrawerTextActive]}>{desktopTabLabels[tab.key]}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.mobileDrawerFooter}>
              <View style={[styles.syncStripDot, isOnline && !visibleSyncQueue.length && styles.syncStripDotOk, !isOnline && styles.syncStripDotOffline]} />
              <Text style={styles.desktopSyncText}>{syncText}</Text>
            </View>
          </View>
        </View>
      </Modal>
      <Modal animationType="fade" transparent visible={quickAddOpen} onRequestClose={() => setQuickAddOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.quickAddModalCard}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.cardLabel}>БЫСТРОЕ ДЕЛО</Text>
                <Text style={styles.modalTitle}>В планнер</Text>
              </View>
              <Pressable
                onPress={() => {
                  setQuickAddOpen(false);
                  setQuickAddSubtaskOpen(false);
                  setQuickAddSubtaskDraft('');
                }}
                style={styles.iconButton}
              >
                <X color={muted} size={18} />
              </Pressable>
            </View>
            <TextInput
              autoFocus
              onChangeText={setQuickAddText}
              onSubmitEditing={submitQuickPlannerItem}
              placeholder="Завтра 15:00 тренировка"
              placeholderTextColor={muted}
              style={styles.modalInput}
              value={quickAddText}
            />
            <Text style={styles.rowMeta}>
              {quickAddPreview ? `${quickAddPreview.date}${quickAddPreview.time ? ` · ${quickAddPreview.time}` : ' · без времени'} · ${quickAddPreview.title}` : 'Можно писать: сегодня, завтра, 15.08, 18:00'}
            </Text>
            {quickAddSubtasks.length || quickAddSubtaskOpen ? (
              <View style={styles.plannerEditSubtasksBox}>
                {quickAddSubtasks.length ? (
                  <View style={styles.plannerEditSubtasksList}>
                    {quickAddSubtasks.map((subtask) => (
                      <Pressable key={subtask.id} onPress={() => handleQuickAddSubtaskPress(subtask)} style={styles.plannerEditSubtaskChip}>
                        <ListChecks color={muted} size={13} />
                        {quickAddEditingSubtaskId === subtask.id ? (
                          <TextInput
                            autoFocus
                            onBlur={saveQuickAddSubtaskEdit}
                            onChangeText={setQuickAddEditingSubtaskTitle}
                            onSubmitEditing={saveQuickAddSubtaskEdit}
                            placeholder="Подзадача"
                            placeholderTextColor={muted}
                            style={styles.plannerEditSubtaskInput}
                            value={quickAddEditingSubtaskTitle}
                          />
                        ) : (
                          <Text numberOfLines={1} style={styles.plannerEditSubtaskText}>{subtask.title}</Text>
                        )}
                        <Pressable onPress={() => removeQuickAddSubtask(subtask.id)} style={styles.plannerEditSubtaskRemove}>
                          <X color={muted} size={13} />
                        </Pressable>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
                <View style={styles.plannerSubtasksInputRow}>
                  <ListChecks color={muted} size={14} />
                  <TextInput
                    onChangeText={setQuickAddSubtaskDraft}
                    onSubmitEditing={addQuickAddSubtask}
                    placeholder="Новая подзадача"
                    placeholderTextColor={muted}
                    style={styles.plannerTaskInput}
                    value={quickAddSubtaskDraft}
                  />
                  <Pressable disabled={!quickAddSubtaskDraft.trim()} onPress={addQuickAddSubtask} style={[styles.plannerQuickAddButton, !quickAddSubtaskDraft.trim() && styles.plannerQuickAddButtonDisabled]}>
                    <Plus color={panel} size={15} strokeWidth={3} />
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => setQuickAddSubtaskOpen(true)} style={styles.plannerInlineAddButton}>
                <Plus color={accent} size={13} />
                <Text style={styles.plannerInlineAddText}>Добавить подзадачу</Text>
              </Pressable>
            )}
            <Pressable disabled={!quickAddPreview} onPress={submitQuickPlannerItem} style={[styles.notificationButton, !quickAddPreview && styles.notificationButtonDisabled]}>
              <Text style={styles.notificationButtonText}>Добавить</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function scopedStorageKey(baseKey: string, userId?: string | null) {
  return userId ? `${baseKey}:${userId}` : baseKey;
}

function accountOwnerKey(userId: string) {
  return `user:${userId}`;
}

function calendarSyncErrorMessage(message: string) {
  if (message.includes('planner_events')) return 'Таблица planner_events не найдена. Запусти SQL в Supabase.';
  if (message.includes('event_time')) return 'Нужен SQL-патч для event_time, чтобы работали дела без времени.';
  if (plannerSchemaMissingSubtasks(message)) return 'Нужен SQL-патч для subtasks, чтобы синхронизировать подзадачи.';

  return 'Календарь пока не синхронизирован с Supabase.';
}

function plannerSchemaMissingSubtasks(message?: string | null) {
  return Boolean(message && message.toLowerCase().includes('subtasks'));
}

function appStateSchemaMissingKodaDays(message?: string | null) {
  return Boolean(message && message.toLowerCase().includes('koda_days'));
}

function appStateSchemaMissingJsonColumn(message?: string | null) {
  if (!message) return false;
  const normalized = message.toLowerCase();
  return normalized.includes('koda_days') || normalized.includes('projects');
}

function parseSyncQueue(value: string | null): SyncDomain[] {
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is SyncDomain => item === 'planner' || item === 'journal' || item === 'appState' || item === 'notes' || item === 'kodaDays');
  } catch {
    return [];
  }
}

function parseRemoteNotes(value: unknown): Note[] {
  if (!Array.isArray(value)) return [];

  return value.map((item) => {
    const row = item as Record<string, unknown>;
    const content = parseRemoteNoteDocument(row.content);
    if (!content) return null;

    return {
      id: String(row.id),
      userId: typeof row.user_id === 'string' ? row.user_id : null,
      title: typeof row.title === 'string' ? row.title : 'Без названия',
      content,
      pinned: Boolean(row.pinned),
      createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
      updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
      deletedAt: typeof row.deleted_at === 'string' ? row.deleted_at : null,
    } satisfies Note;
  }).filter((note): note is Note => Boolean(note));
}

function isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function parseEmbeddedNotes(profileValue: unknown): Note[] | null {
  if (!isPlainObject(profileValue) || !Array.isArray(profileValue.__kodaNotes)) return null;
  return parseNotes(JSON.stringify(profileValue.__kodaNotes));
}

function parseRemoteNoteDocument(value: unknown): Note['content'] | null {
  const parsed = typeof value === 'string' ? safeJsonParse(value) : value;
  if (!parsed || typeof parsed !== 'object') return null;
  const doc = parsed as Note['content'];
  if (doc.type !== 'doc' || !Array.isArray(doc.content)) return null;
  return doc;
}

function safeJsonParse(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function mergeNotesIncludingDeleted(remoteNotes: Note[], localNotes: Note[]) {
  const itemsById = new Map<string, Note>();
  for (const note of remoteNotes) itemsById.set(note.id, note);
  for (const note of localNotes) {
    const existing = itemsById.get(note.id);
    if (!existing || noteTimeValue(note.updatedAt) >= noteTimeValue(existing.updatedAt)) {
      itemsById.set(note.id, note);
    }
  }
  return Array.from(itemsById.values()).sort(compareNotesForApp);
}

function compareNotesForApp(first: Note, second: Note) {
  if (first.pinned !== second.pinned) return first.pinned ? -1 : 1;
  return noteTimeValue(second.updatedAt) - noteTimeValue(first.updatedAt);
}

function noteTimeValue(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function stripStarterPlannerItems(items: PlannerItem[] | null) {
  if (!items) return null;

  return items.filter((item) => !starterPlannerItemIds.has(item.id));
}

function ensureTodayJournalEntry(entries: JournalEntry[]) {
  const today = todayDateKey();
  if (entries.some((entry) => journalDateKey(entry) === today)) {
    return entries;
  }

  return [{ ...defaultJournalEntry, id: uid('journal'), createdAt: new Date().toISOString() }, ...entries];
}

function preferredJournalEntryId(entries: JournalEntry[]) {
  const today = todayDateKey();
  const todayEntry = entries.find((entry) => journalDateKey(entry) === today);

  return todayEntry?.id ?? entries[0]?.id ?? defaultJournalEntry.id;
}

function getSyncText(queue: SyncDomain[], online: boolean, ready = true) {
  if (!ready && online) return 'Синхронизация...';
  if (!online && queue.length) return `${queue.length} изменений ждут интернет`;
  if (!online) return 'Офлайн: новые данные сохранятся на телефоне';
  if (queue.length) return `${queue.length} изменений в очереди синка`;

  return 'Синхронизировано';
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function parsePlannerSubtasks(value: unknown): PlannerItem['subtasks'] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const subtask = item as { id?: unknown; title?: unknown; done?: unknown };
      if (typeof subtask.id !== 'string' || typeof subtask.title !== 'string') return null;
      return { id: subtask.id, title: subtask.title, done: Boolean(subtask.done) };
    })
    .filter((item): item is NonNullable<PlannerItem['subtasks']>[number] => Boolean(item));
}


