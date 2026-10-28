import { habitIsDue, habitDoneOn } from './habitModel';
import { adoptPet, customizePet, feedPet, getPetView, rebirthPet, recordPetSourceChanges, type PetAccessory, type PetSpecies, type PetState } from './petState';
import { type PetPose } from './components/PetCompanion';
import { PetWanderer } from './components/PetWanderer';
import { PetRoom } from './screens/PetRoom';
import { WidgetDesktop } from './screens/WidgetDesktop';
import { HabitsScreen } from './screens/HabitsScreen';
import { WidgetShell, useWidgetLayout, type DesktopSearchResult } from './components/WidgetShell';
import { getCurrentPlanVersion, recordPlanProgress, type PlanItemScore } from './dayPlan';
import { syncDayPlanProgress } from './dayPlanSync';
import { upsertRoutineLog } from './goalLogic';
import { usePersistentChat } from './usePersistentChat';
import { accountDisplayName } from './components/WorkspaceIdentity';
import { mergeEmotionEntries, type EmotionEntry } from './emotionJournal';
import { SyncCoordinator, parseDeletedIds, journalRowId, writeAppStateSnapshot } from './syncCoordinator';
import { RightPanelProvider } from './components/RightPanel';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { ListChecks, Plus, X } from 'lucide-react-native';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Modal, Pressable, SafeAreaView, ScrollView, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { isSupabaseConfigured } from '../../config/env';
import { supabase } from '../../lib/supabase';
import { defaultHabitMonth, defaultHabitYear, defaultJournalEntry, initialGoals, initialHabits, journalMoodByName, journalMoodByValue, journalOwnerKey } from './constants';
import { calculateGoalProgress } from './goalLogic';
import { autoFinalizeExpiredKodaDays, fromKodaDayRow, kodaDayId, mergeKodaDaySources, toKodaDayRow } from './kodaDaySync';
import { defaultPomodoroSettings, defaultProfile, isJournalEntryWorthSyncing, journalDateKey, mergeJournalEntries, mergePlannerItems, mergeStoredKodaState, normalizeStoredKodaState, parseJournalEntries, parseNotes, parsePlannerItems, parseStoredKodaState, type StoredKodaState } from './persistence';
import { buildHabitPlannerItems, buildProjectPlannerItems } from './plannerProjections';
import { syncExplicitSourceChanges } from './dayPlanSync';
import { recordHabitEdits } from './habitSync';
import { GoalsScreen } from './screens/GoalsScreen';
import { JournalScreen } from './screens/JournalScreen';
import { KodaScreen } from './screens/KodaScreen';
import { DailyPlanScreen } from './screens/DailyPlanScreen';
import { PlannerScreen } from './screens/PlannerScreen';
import { parseQuickTaskInput } from './quickTaskInput';
import { goalOverviewItems, isPlannerDate } from './plannerOverview';
import { NotesScreen } from './screens/NotesScreen';
import { PomodoroProvider } from './usePomodoroTimer';
import { PomodoroScreen, playPomodoroSound } from './screens/PomodoroScreen';
import { ProjectsScreen } from './screens/ProjectsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { ProgressScreen } from './screens/ProgressScreen';
import { styles } from './styles';
import { accent, applyKodaTheme, muted, panel, resolveKodaThemeId } from './theme';
import type { AccountInfo, Goal, Habit, JournalEntry, KodaDay, Note, PlannerItem, PomodoroSettings, ProfileState, Project, TabKey } from './types';
import { buildMonthDays, displayTimeValue, getCurrentWeekDates, getHabitMonthDays, monthKey, normalizeTimeValue, sleepDurationMinutes, todayDateKey, uid } from './utils';

const desktopTabLabels: Record<TabKey, string> = {
  planner: 'Планнер',
  goals: 'Цели',
  projects: 'Проекты',
  notes: 'Заметки',
  journal: 'Дневник',
  habits: 'Рабочий стол',
  day: 'Мой день',
  routines: 'Привычки',
  timer: 'Таймер',
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
const journalDeletedStorageKey = 'koda:journalDeleted:v1';
const plannerDeletedStorageKey = 'koda:plannerDeleted:v1';
type CalendarSyncState = { count: number; message: string; status: 'idle' | 'syncing' | 'synced' | 'error' };
type SyncDomain = 'planner' | 'journal' | 'appState' | 'notes' | 'kodaDays';
const starterPlannerItemIds = new Set(['planner-1', 'planner-2', 'planner-3', 'planner-4', 'planner-5']);

export function KodaApp({ onSignOut, userId }: { onSignOut?: () => void; userId?: string | null }) {
  const [petRoomOpen, setPetRoomOpen] = useState(false);
  const [petClock, setPetClock] = useState(() => Date.now());
  const [petCelebrating, setPetCelebrating] = useState(false);
  useEffect(() => {
    if (!petCelebrating) return;
    const timeout = setTimeout(() => setPetCelebrating(false), 2500);
    return () => clearTimeout(timeout);
  }, [petCelebrating]);
  useEffect(() => {
    const refresh = () => setPetClock(Date.now());
    const timer = setInterval(refresh, 60_000);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', refresh);
    return () => { clearInterval(timer); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const [activeTab, setActiveTabState] = useState<TabKey>(() => sectionFromHash());
  function setActiveTab(tab: TabKey) {
    setActiveTabState(tab);
    if (typeof window !== 'undefined' && window.location.hash !== `#${tab}`) window.location.hash = tab;
  }
  useEffect(() => {
    const navigate = () => {setActiveTabState(sectionFromHash());setFocusedPlannerItem(plannerFocusFromHash());};
    if (typeof window !== 'undefined') window.addEventListener('hashchange', navigate);
    return () => { if (typeof window !== 'undefined') window.removeEventListener('hashchange', navigate); };
  }, []);
  const desktopLayout = useWidgetLayout(userId ?? null);
  const [localDate, setLocalDate] = useState(todayDateKey());
  useEffect(() => { const interval=setInterval(()=>setLocalDate(todayDateKey()),30000); return ()=>clearInterval(interval); }, []);
  const [focusedPlannerItem,setFocusedPlannerItem] = useState<PlannerItem|null>(()=>plannerFocusFromHash());
  function openPlannerItem(item:PlannerItem){setFocusedPlannerItem(item);setActiveTabState('planner');if(typeof window!=='undefined'){const query=new URLSearchParams({date:item.date,item:item.id,title:item.title,type:item.sourceType??'planner'});window.location.hash=`planner?${query}`;}}
  const [focusedNoteId, setFocusedNoteId] = useState<string | null>(null);

  const [assistantDraft,setAssistantDraft]=useState('');
  const [chatComposer, setChatComposer] = useState<{ownerId:string|null;text:string}>({ownerId:userId??null,text:''});
  useEffect(()=>setAssistantDraft(''),[userId]);
  const { width } = useWindowDimensions();
  const isDesktopLayout = width >= 1040;
  const [plannerItems, setPlannerItems] = useState<PlannerItem[]>([]);
  const [plannerLoaded, setPlannerLoaded] = useState(false);
  const [plannerLoadedStorageKey, setPlannerLoadedStorageKey] = useState('');
  const [calendarKey, setCalendarKey] = useState('');
  const [legacyCalendarKeys, setLegacyCalendarKeys] = useState<string[]>([]);
  const [calendarSync, setCalendarSync] = useState<CalendarSyncState>({ count: 0, message: 'Готовлю календарь...', status: 'idle' });
  const [deletedJournalItemIds, setDeletedJournalItemIds] = useState<string[]>([]);
  const [deletedPlannerItemIds, setDeletedPlannerItemIds] = useState<string[]>([]);
  const [goals, setGoals] = useState<Goal[]>(initialGoals);
  const [projects, setProjects] = useState<Project[]>([]);
  const [habits, setHabits] = useState<Habit[]>(initialHabits);
  const [kodaDays, setKodaDays] = useState<KodaDay[]>([]);
  const [focusedGoalId, setFocusedGoalId] = useState<string | null>(null);
  const editSources = useRef<{goals:Goal[]; plannerItems:PlannerItem[]; projects:Project[]; habits:Habit[]}|null>(null);
  useLayoutEffect(() => { editSources.current = { goals, plannerItems, projects, habits }; }, [goals, plannerItems, projects, habits, userId]);
  const [appStateLoaded, setAppStateLoaded] = useState(false);
  const [appStateLoadedStorageKey, setAppStateLoadedStorageKey] = useState('');
  const [initialStateReadyKey, setInitialStateReadyKey] = useState('');
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([defaultJournalEntry]);
  const [journalLoaded, setJournalLoaded] = useState(false);
  const [journalLoadedStorageKey, setJournalLoadedStorageKey] = useState('');
  const [activeJournalId, setActiveJournalId] = useState(defaultJournalEntry.id);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [notesLoadedStorageKey, setNotesLoadedStorageKey] = useState('');
  const [notesSaveState, setNotesSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pomodoro, setPomodoro] = useState<PomodoroSettings>(defaultPomodoroSettings);
  const [profile, setProfile] = useState<ProfileState>(defaultProfile);
  const [accountInfo, setAccountInfo] = useState<AccountInfo | null>(null);
  const [syncRetryToken, setSyncRetryToken] = useState(0);
  const [plannerPullToken, setPlannerPullToken] = useState(0);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [syncQueue, setSyncQueue] = useState<SyncDomain[]>([]);
  const [syncQueueLoaded, setSyncQueueLoaded] = useState(false);
  const syncCoordinator = useMemo(() => new SyncCoordinator(), [userId]);
  const syncedJournalPayloads = useMemo(() => new Map<string, string>(), [userId]);
  const pendingSync = useRef(syncQueue);
  pendingSync.current = syncQueue;
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddText, setQuickAddText] = useState('');
  const [quickAddSubtasks, setQuickAddSubtasks] = useState<NonNullable<PlannerItem['subtasks']>>([]);
  const [quickAddSubtaskDraft, setQuickAddSubtaskDraft] = useState('');
  const [quickAddSubtaskOpen, setQuickAddSubtaskOpen] = useState(false);
  const [quickAddEditingSubtaskId, setQuickAddEditingSubtaskId] = useState<string | null>(null);
  const [quickAddEditingSubtaskTitle, setQuickAddEditingSubtaskTitle] = useState('');
  const [quickAddLastSubtaskTap, setQuickAddLastSubtaskTap] = useState<{ id: string; at: number } | null>(null);
  const savedChat=usePersistentChat(userId,activeTab==='koda');

  const projectPlannerItems = useMemo(() => buildProjectPlannerItems(projects), [projects]);
  const plannerDayItems = useMemo(() => [...plannerItems, ...projectPlannerItems], [plannerItems, projectPlannerItems]);
  const completedTasks = plannerDayItems.filter((item) => !item.deletedAt && item.done).length;
  const visibleHabits = habits.filter(habit=>!habit.deletedAt && !habit.archivedAt);
  const habitWeek = Array.from({length:7},(_,i)=>{const d=new Date();d.setDate(d.getDate()-i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
  const habitOpportunities = visibleHabits.flatMap(habit=>habitWeek.filter(date=>habitIsDue(habit,date)).map(date=>habitDoneOn(habit,date)));
  const habitScore = habitOpportunities.length ? Math.round(100*habitOpportunities.filter(Boolean).length/habitOpportunities.length) : 0;

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

  useLayoutEffect(() => {
    if (!appStateLoaded || appStateLoadedStorageKey !== scopedStorageKey(kodaStateStorageKey, userId)) return;
    applyKodaTheme(resolveKodaThemeId(profile.themeId));
    setInitialStateReadyKey(appStateLoadedStorageKey);
  }, [appStateLoaded, appStateLoadedStorageKey, profile.themeId, userId]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    function pullPlannerWhenVisible() {
      if (document.visibilityState === 'visible' && (typeof navigator === 'undefined' || navigator.onLine)) {
        setPlannerPullToken((value) => value + 1);
        if (pendingSync.current.length) setSyncRetryToken((value) => value + 1);
      }
    }

    const interval = window.setInterval(pullPlannerWhenVisible, 60000);
    const retryInterval = window.setInterval(() => {
      if (document.visibilityState === 'visible' && navigator.onLine && pendingSync.current.length) {
        setSyncRetryToken(value => value + 1);
      }
    }, 15000);

    window.addEventListener('focus', pullPlannerWhenVisible);
    document.addEventListener('visibilitychange', pullPlannerWhenVisible);

    return () => {
      window.clearInterval(interval);
      window.clearInterval(retryInterval);
      window.removeEventListener('focus', pullPlannerWhenVisible);
      document.removeEventListener('visibilitychange', pullPlannerWhenVisible);
    };
  }, []);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured()) return undefined;

    const channel = (supabase as any)
      .channel(`koda-cross-device:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_app_state', filter: `user_id=eq.${userId}` }, () => {
        setPlannerPullToken((value) => value + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'koda_days', filter: `user_id=eq.${userId}` }, () => {
        setPlannerPullToken((value) => value + 1);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'planner_events' }, () => {
        setPlannerPullToken((value) => value + 1);
      })
      .subscribe();

    return () => {
      void (supabase as any).removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setPlannerPullToken(value => value + 1);
      if (pendingSync.current.length) setSyncRetryToken(value => value + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let active = true;
    setSyncQueueLoaded(false);
    const storageKey = scopedStorageKey(syncQueueStorageKey, userId);

    Promise.all([AsyncStorage.getItem(storageKey), AsyncStorage.getItem(scopedStorageKey(plannerDeletedStorageKey, userId)), AsyncStorage.getItem(scopedStorageKey(journalDeletedStorageKey, userId))])
      .then(([value, deleted, journalDeleted]) => {
        if (!active) return;
        const parsed = parseSyncQueue(value);
        const deletedIds = parseDeletedIds(deleted);
        setDeletedPlannerItemIds(deletedIds);
        const journalDeletedIds = parseDeletedIds(journalDeleted);
        setDeletedJournalItemIds(journalDeletedIds);
        if (journalDeletedIds.length && !parsed.includes('journal')) parsed.push('journal');
        setSyncQueue(deletedIds.length ? [...new Set<SyncDomain>([...parsed, 'planner'])] : parsed);
        setSyncQueueLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setSyncQueue([]);
        setSyncQueueLoaded(true);
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (syncQueueLoaded) void AsyncStorage.setItem(scopedStorageKey(plannerDeletedStorageKey, userId), JSON.stringify(deletedPlannerItemIds));
  }, [deletedPlannerItemIds, syncQueueLoaded, userId]);

  useEffect(() => {
    if (!syncQueueLoaded) return;
    const storageKey = scopedStorageKey(syncQueueStorageKey, userId);
    void AsyncStorage.setItem(storageKey, JSON.stringify(syncQueue));
  }, [syncQueue, syncQueueLoaded, userId]);

  useEffect(() => {
    let active = true;

    async function loadJournalEntry() {
      const storageKey = scopedStorageKey(journalStorageKey, userId);
      const revision = syncCoordinator.revision('journal');
      const background = journalLoadedStorageKey === storageKey;
      if (background && pendingSync.current.includes('journal')) return;
      if (!background) { setJournalLoaded(false); setJournalLoadedStorageKey(''); }

      const storedValue = await AsyncStorage.getItem(storageKey);
      const storedQueue = parseSyncQueue(await AsyncStorage.getItem(scopedStorageKey(syncQueueStorageKey, userId)));
      const hasPendingJournalSync = storedQueue.includes('journal');
      const deletedIds = parseDeletedIds(await AsyncStorage.getItem(scopedStorageKey(journalDeletedStorageKey, userId)));
      const localEntries = parseJournalEntries(storedValue)?.filter(item => !deletedIds.includes(item.id)) ?? null;

      if (localEntries && active && !background) {
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
      if (!syncCoordinator.current('journal', revision)) { setJournalLoadedStorageKey(storageKey); setJournalLoaded(true); return; }

      if (error) {
        setJournalLoadedStorageKey(storageKey);
        setJournalLoaded(true);
        return;
      }

      const deletedRowIds = await Promise.all(deletedIds.map(id => journalRowId(userId ? accountOwnerKey(userId) : journalOwnerKey, id)));
      if (!active) return;
      if (!syncCoordinator.current('journal', revision)) { setJournalLoadedStorageKey(storageKey); setJournalLoaded(true); return; }
      const rows: Array<Record<string, any>> = (data ?? []).filter((item: { id: string }) => !deletedRowIds.includes(item.id));
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

        const normalizedLocalEntries = hasPendingJournalSync && localEntries
          ? await Promise.all(localEntries.map(async entry => ({ ...entry, id: await journalRowId(userId ? accountOwnerKey(userId) : journalOwnerKey, entry.id) })))
          : null;
        if (!active) return;
        if (!syncCoordinator.current('journal', revision)) { setJournalLoadedStorageKey(storageKey); setJournalLoaded(true); return; }
        const nextEntries = normalizedLocalEntries ? mergeJournalEntries(entries, normalizedLocalEntries) : entries;

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
    setPomodoro(state.pomodoro);
    setProfile(state.profile);
  }

  useEffect(() => {
    if (!appStateLoaded || !plannerLoaded) return undefined;

    function closeExpiredDays() {
      setKodaDays((days) => {
        const nextDays = autoFinalizeExpiredKodaDays(days, goals, plannerItems);
        if (nextDays === days) return days;

        markSyncQueued('kodaDays');
        markSyncQueued('appState');
        const storageKey = scopedStorageKey(kodaStateStorageKey, userId);
        if (appStateLoadedStorageKey === storageKey) {
          const state: StoredKodaState = { goals, habits, kodaDays: nextDays, pomodoro, profile, projects };
          void AsyncStorage.setItem(storageKey, JSON.stringify(state));
        }
        return nextDays;
      });
    }

    closeExpiredDays();
    const interval = setInterval(closeExpiredDays, 60_000);
    const handleVisibility = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') closeExpiredDays();
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      clearInterval(interval);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [appStateLoaded, appStateLoadedStorageKey, goals, habits, plannerItems, plannerLoaded, pomodoro, profile, projects, userId]);

  useEffect(() => {
    if (!appStateLoaded) return;
    const storageKey = scopedStorageKey(kodaStateStorageKey, userId);
    if (appStateLoadedStorageKey !== storageKey) return;

    const state: StoredKodaState = { goals, habits, kodaDays, pomodoro, profile, projects };
    void AsyncStorage.setItem(storageKey, JSON.stringify(state));

    if (!userId || !isSupabaseConfigured()) return;

    async function syncAppState() {
      await writeAppStateSnapshot(supabase, userId!, state);
      await syncGoalsToBackend(goals);
    }

    return scheduleDomainSync('appState', syncAppState);
  }, [appStateLoaded, appStateLoadedStorageKey, goals, habits, kodaDays, pomodoro, profile, projects, syncRetryToken, userId, syncQueueLoaded, isOnline, syncQueue, syncCoordinator]);

  useEffect(() => {
    if (!appStateLoaded || !userId || !isSupabaseConfigured()) return;
    if (!syncQueue.includes('kodaDays')) return;

    async function syncKodaDays() {
      const rows = kodaDays.map((day) => toKodaDayRow(day, userId!));
      if (rows.length) {
        const { error } = await (supabase as any).from('koda_days').upsert(rows, { onConflict: 'user_id,local_date' });
        if (error) throw error;
      }

    }

    return scheduleDomainSync('kodaDays', syncKodaDays);
  }, [appStateLoaded, kodaDays, syncQueue, syncRetryToken, userId, syncQueueLoaded, isOnline, syncCoordinator]);

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
        } catch (error) {
          throw error;
        }
      }
      for (const id of deletedJournalItemIds) {
        const rowId = await journalRowId(userId ? accountOwnerKey(userId) : journalOwnerKey, id);
        const query = (supabase as any).from('journal_entries').delete().eq('id', rowId);
        const { error } = await (userId ? query.eq('user_id', userId) : query.eq('owner_key', journalOwnerKey));
        if (error) throw error;
      }
      setDeletedJournalItemIds(ids => ids.filter(id => !deletedJournalItemIds.includes(id)));
    }

    return scheduleDomainSync('journal', syncJournalEntries);
  }, [journalEntries, journalLoaded, syncRetryToken, userId, syncQueueLoaded, isOnline, syncQueue, deletedJournalItemIds, syncCoordinator]);

  useEffect(() => {
    let active = true;

    async function loadNotes() {
      const storageKey = scopedStorageKey(notesStorageKey, userId);
      const revision = syncCoordinator.revision('notes');
      const background = notesLoadedStorageKey === storageKey;
      if (background && pendingSync.current.includes('notes')) return;
      if (!background) { setNotesLoaded(false); setNotesLoadedStorageKey(''); }
      const storedValue = await AsyncStorage.getItem(storageKey);
      const storedQueue = parseSyncQueue(await AsyncStorage.getItem(scopedStorageKey(syncQueueStorageKey, userId)));
      const hasPendingNotesSync = storedQueue.includes('notes');
      const localNotes = parseNotes(storedValue);

      if (localNotes && active && !background) setNotes([...localNotes].sort(compareNotesForApp));

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
        if (!active) return;
        if (!syncCoordinator.current('notes', revision)) { setNotesLoadedStorageKey(storageKey); setNotesLoaded(true); return; }
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
      if (!syncCoordinator.current('notes', revision)) { setNotesLoadedStorageKey(storageKey); setNotesLoaded(true); return; }
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
    let active = true;
    void AsyncStorage.setItem(storageKey, JSON.stringify(notes))
      .then(() => { if (active) setNotesSaveState('saved'); })
      .catch(() => { if (active) setNotesSaveState('idle'); });
    return () => { active = false; };
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


      } catch (error) {
        throw error;
      }
    }

    return scheduleDomainSync('notes', syncNotes);
  }, [notes, notesLoaded, syncRetryToken, userId, syncQueueLoaded, isOnline, syncQueue, syncCoordinator]);

  useEffect(() => {
    let active = true;

    async function loadAccountState() {
      const storageKey = scopedStorageKey(kodaStateStorageKey, userId);
      const revision = syncCoordinator.revision('appState');
      const dayRevision = syncCoordinator.revision('kodaDays');
      const background = appStateLoadedStorageKey === storageKey;
      if (background && (pendingSync.current.includes('appState') || pendingSync.current.includes('kodaDays'))) return;
      if (!background) { setAppStateLoaded(false); setAppStateLoadedStorageKey(''); }

      try {
        const storedValue = await AsyncStorage.getItem(storageKey);
        const storedState = parseStoredKodaState(storedValue);
        if (active && storedState && initialStateReadyKey !== storageKey) {
          applyStoredKodaState(storedState);
          setAppStateLoadedStorageKey(storageKey);
          setAppStateLoaded(true);
        }
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          if (active) { setAppStateLoadedStorageKey(storageKey); setAppStateLoaded(true); }
          return;
        }

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

        const { data, error } = await (supabase as any)
          .from('user_app_state')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle();

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
        if (!active) return;
        if (!syncCoordinator.current('appState', revision) || !syncCoordinator.current('kodaDays', dayRevision)) { setAppStateLoadedStorageKey(storageKey); setAppStateLoaded(true); return; }
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
          // Recover projects previously acknowledged by the lossy schema fallback.
          if (JSON.stringify(nextState.projects) !== JSON.stringify(remoteState.projects)) markSyncQueued('appState');
          void AsyncStorage.setItem(storageKey, JSON.stringify(nextState));
        } else if (storedState) {
          const nextState = { ...storedState, kodaDays: mergeKodaDaySources(canonicalRemoteDays, storedState.kodaDays) };
          applyStoredKodaState(nextState);
          if (!error && storedState.projects.length) markSyncQueued('appState');
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
      const revision = syncCoordinator.revision('planner');
      try {
        const nextCalendarKey = userId ? accountOwnerKey(userId) : await getGuestCalendarKey();
        const userPlannerStorageKey = scopedStorageKey(plannerStorageKey, userId);
        const background = plannerLoadedStorageKey === userPlannerStorageKey;
        if (background && pendingSync.current.includes('planner')) return;
        if (!background) { setPlannerLoaded(false); setPlannerLoadedStorageKey(''); }
        const deletedIds = parseDeletedIds(await AsyncStorage.getItem(scopedStorageKey(plannerDeletedStorageKey, userId)));
        const storedQueue = parseSyncQueue(await AsyncStorage.getItem(scopedStorageKey(syncQueueStorageKey, userId)));
        const hasPendingPlannerSync = storedQueue.includes('planner');
        const storedGuestCalendarKey = userId ? await AsyncStorage.getItem(calendarKeyStorageKey) : null;

        if (active) setCalendarKey(nextCalendarKey);
        if (active) setLegacyCalendarKeys(storedGuestCalendarKey && storedGuestCalendarKey !== nextCalendarKey ? [storedGuestCalendarKey] : []);

        const storedValue = await AsyncStorage.getItem(userPlannerStorageKey);
        const legacyStoredValue = userId && !storedValue ? await AsyncStorage.getItem(plannerStorageKey) : null;
        const localItems = stripStarterPlannerItems(parsePlannerItems(storedValue) ?? parsePlannerItems(legacyStoredValue))?.filter(item => !deletedIds.includes(item.id));

        if (localItems && active && !background) {
          setPlannerItems(localItems);
        }

        if (!isSupabaseConfigured()) {
          if (userId && active) setPlannerItems(localItems ?? []);
          if (active) setPlannerLoadedStorageKey(userPlannerStorageKey);
          return;
        }

        let plannerQuery = await (supabase as any)
          .from('planner_events')
          .select('id, event_date, event_time, title, done, failed, subtasks, updated_at')
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
          if (active) { setPlannerLoadedStorageKey(userPlannerStorageKey); }
          setCalendarSync({
            count: 0,
            message: calendarSyncErrorMessage(plannerQuery.error.message),
            status: 'error',
          });
          return;
        }

        const remoteItems = stripStarterPlannerItems(Array.isArray(plannerQuery.data)
          ? plannerQuery.data.map((item: Record<string, unknown>) => ({
              id: String(item.id),
              date: String(item.event_date),
              time: item.event_time ? String(item.event_time).slice(0, 5) : '',
              title: String(item.title),
              done: Boolean(item.done),
              failed: Boolean(item.failed),
              subtasks: parsePlannerSubtasks(item.subtasks),
              sourceType: 'planner' as const,
              sourceId: null,
              ownerId: null,
              updatedAt: typeof item.updated_at === 'string' ? item.updated_at : undefined,
              deletedAt: null,
            }))
          : []) ?? [];

        if (!active) return;
        if (!syncCoordinator.current('planner', revision)) { setPlannerLoadedStorageKey(userPlannerStorageKey); return; }

        if (remoteItems.length) {
          setPlannerItems((hasPendingPlannerSync && localItems ? mergePlannerItems(remoteItems, localItems) : remoteItems).filter(item => !deletedIds.includes(item.id)));
        } else if (localItems && (!userId || hasPendingPlannerSync)) {
          setPlannerItems(localItems);
        } else if (userId) {
          setPlannerItems([]);
        }
        setPlannerLoadedStorageKey(userPlannerStorageKey);
      } catch {
        // Keep the last local copy when the network is unavailable.
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
    const entityId = (id: string) => isUuid(id) ? id : kodaDayId(userId!, `entity:${id}`);
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
        id: entityId(milestone.id),
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
        id: entityId(action.id),
        goal_id: goal.id,
        milestone_id: action.milestoneId ? entityId(action.milestoneId) : null,
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
        id: entityId(routine.id),
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
        id: entityId(log.id),
        routine_id: entityId(log.routineId),
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
    syncCoordinator.changed(domain);
    pendingSync.current = [...new Set([...pendingSync.current, domain])];
    setSyncQueue((items) => (items.includes(domain) ? items : [...items, domain]));
  }

  function scheduleDomainSync(domain: SyncDomain, work: () => Promise<void>) {
    if (!syncQueueLoaded || !pendingSync.current.includes(domain) || !isOnline) return;
    const revision = syncCoordinator.revision(domain);
    let cancelled = false;
    const timeout = setTimeout(() => {
      void syncCoordinator.run(domain, revision, async () => {
        if (cancelled) return;
        await work();
        if (!cancelled && syncCoordinator.current(domain, revision)) clearSyncQueued(domain);
      }).catch(() => undefined);
    }, 650);
    return () => { cancelled = true; clearTimeout(timeout); };
  }

  useEffect(() => {
    if (syncQueueLoaded) void AsyncStorage.setItem(scopedStorageKey(journalDeletedStorageKey, userId), JSON.stringify(deletedJournalItemIds));
  }, [deletedJournalItemIds, syncQueueLoaded, userId]);

  function clearSyncQueued(domain: SyncDomain) {
    pendingSync.current = pendingSync.current.filter(item => item !== domain);
    setSyncQueue((items) => items.filter((item) => item !== domain));
    if (domain === 'appState') setPlannerPullToken(value => value + 1);
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
            failed: Boolean(item.failed),
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

          if (deletedPlannerItemIds.length) setDeletedPlannerItemIds(ids => ids.filter(id => !deletedPlannerItemIds.includes(id)));
        }

        setCalendarSync({
          count: cleanPlannerItems.length,
          message: cleanPlannerItems.length ? `${cleanPlannerItems.length} дел синхронизировано` : 'В планнере нет дел для календаря',
          status: 'synced',
        });

      } catch (error) {
        setCalendarSync({
          count: 0,
          message: 'Не удалось синхронизировать. Проверь SQL planner_events в Supabase.',
          status: 'error',
        });
        throw error;
      }
    }

    return scheduleDomainSync('planner', syncPlannerItems);
  }, [calendarKey, deletedPlannerItemIds, legacyCalendarKeys, plannerItems, plannerLoaded, syncRetryToken, syncQueueLoaded, isOnline, syncQueue, syncCoordinator]);

  function togglePlannerItem(id: string) {
    markSyncQueued('planner');
    const now = new Date().toISOString();
    updatePlannerSources((items) =>
      items.map((item) => {
        if (item.id !== id) return item;
        const done = !item.done;
        return { ...item, done, failed: false, subtasks: item.subtasks?.map((subtask) => ({ ...subtask, done })), updatedAt: now };
      }),
    );
  }

  function addPlannerItem(item: Pick<PlannerItem, 'date' | 'time' | 'title'> & { subtasks?: PlannerItem['subtasks'] }) {
    const trimmed = item.title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    markSyncQueued('planner');
    const created: PlannerItem = { id: uid('planner'), date: item.date, time: item.time, title: trimmed, done: false, subtasks: item.subtasks ?? [], sourceType: 'planner', sourceId: null, ownerId: null, updatedAt: now, deletedAt: null };
    setPlannerItems((items) => [created, ...items]);
    return created;
  }

  function setPlannerItemFailed(id: string, failed: boolean) {
    markSyncQueued('planner');
    updatePlannerSources((items) => items.map((item) => item.id === id
      ? { ...item, failed, done: false, updatedAt: new Date().toISOString() }
      : item));
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
    updatePlannerSources((items) =>
      items.map((item) => {
        if (item.id !== itemId) return item;
        const subtasks = (item.subtasks ?? []).map((subtask) => (subtask.id === subtaskId ? { ...subtask, done: !subtask.done } : subtask));
        return { ...item, subtasks, failed: false, done: subtasks.length ? subtasks.every((subtask) => subtask.done) : item.done, updatedAt: new Date().toISOString() };
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
    const next = updater(editSources.current?.goals ?? goals);
    commitExplicitSources({ goals: next });
    setGoals(next);
  }

  function commitExplicitSources(patch: Partial<{goals:Goal[];plannerItems:PlannerItem[];projects:Project[];habits:Habit[]}>) {
    const previous = editSources.current ?? { goals, plannerItems, projects, habits };
    const next = { ...previous, ...patch };
    editSources.current = next;
    const date = todayDateKey();
    if (profile.pet && profile.pet.ownerId === (userId ?? null)) {
      const event = { at: new Date().toISOString(), id: uid('pet-work'), localDate: date };
      markSyncQueued('appState');
      setProfile(current => {
        if (!current.pet || current.pet.ownerId !== (userId ?? null)) return current;
        const pet = recordPetSourceChanges(current.pet, previous, next, event);
        return pet === current.pet ? current : { ...current, pet };
      });
      setPetClock(Date.now());
    }
    const before = [...previous.plannerItems,...buildProjectPlannerItems(previous.projects),...buildHabitPlannerItems(previous.habits,date)];
    const after = [...next.plannerItems,...buildProjectPlannerItems(next.projects),...buildHabitPlannerItems(next.habits,date)];
    if (!kodaDays.some(d=>d.status==='active'&&d.plan)) return;
    updateKodaDays(days=>days.map(d=> {
      if (!d.plan || d.status!=='active') return d;
      const imported = syncDayPlanProgress(d.plan, previous.goals, before);
      const plan = syncExplicitSourceChanges(imported,previous.goals,next.goals,before,after);
      return plan===d.plan?d:{...d,plan,updatedAt:new Date().toISOString()};
    }));
  }

  function updatePlannerSources(updater:(items:PlannerItem[])=>PlannerItem[]) {
    const next=updater(editSources.current?.plannerItems??plannerItems);
    commitExplicitSources({plannerItems:next});
    setPlannerItems(next);
  }

  function updateHabitSources(updater:(items:Habit[])=>Habit[]) {
    markSyncQueued('appState');
    const previous=editSources.current?.habits??habits;
    const next=recordHabitEdits(previous,updater(previous));
    commitExplicitSources({habits:next});
    setHabits(next);
  }

  function updateKodaDays(updater: (items: KodaDay[]) => KodaDay[]) {
    markSyncQueued('kodaDays');
    markSyncQueued('appState');
    setKodaDays((items) => {
      const nextKodaDays = updater(items);
      const storageKey = scopedStorageKey(kodaStateStorageKey, userId);
      if (appStateLoaded && appStateLoadedStorageKey === storageKey) {
        const sources = editSources.current;
        const state: StoredKodaState = { goals: sources?.goals ?? goals, habits: sources?.habits ?? habits, kodaDays: nextKodaDays, pomodoro, profile, projects: sources?.projects ?? projects };
        void AsyncStorage.setItem(storageKey, JSON.stringify(state));
      }
      return nextKodaDays;
    });
  }

  function updateProjects(updater: (items: Project[]) => Project[]) {
    markSyncQueued('appState');
    const next=updater(editSources.current?.projects??projects);
    commitExplicitSources({projects:next});
    setProjects(next);
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

  function saveEmotionEntry(entry: EmotionEntry) {
    markSyncQueued('appState');
    setProfile(current => ({ ...current, emotionEntries: mergeEmotionEntries(current.emotionEntries, [entry]) }));
  }

  function updateProfile(patch: Partial<ProfileState>) {
    markSyncQueued('appState');
    setProfile((currentProfile) => ({ ...currentProfile, ...patch }));
  }

  function updatePomodoro(patch: Partial<PomodoroSettings>) {
    markSyncQueued('appState');
    setPomodoro((currentSettings) => ({ ...currentSettings, ...patch }));
  }

  function addHabit(title: string) {
    const trimmed = title.trim();
    if (!trimmed) return;
    markSyncQueued('appState');
    const monthDays = buildMonthDays();
    updateHabitSources((items) => [
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

    updateHabitSources((items) =>
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
    updateHabitSources((items) =>
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
    updateHabitSources((items) => items.map((habit) => (habit.id === id ? { ...habit, title, target } : habit)));
  }

  function deleteHabit(id: string) {
    markSyncQueued('appState');
    updateHabitSources((items) => items.filter((habit) => habit.id !== id));
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

    const owner = userId ? accountOwnerKey(userId) : journalOwnerKey;
    const id = await journalRowId(owner, entry.id);
    const signature = JSON.stringify(payload);
    if (syncedJournalPayloads.get(id) === signature) return;
    const { error } = await (supabase as any).from('journal_entries').upsert({
      id, owner_key: owner, user_id: userId ?? null, entry_date: journalDateKey(entry),
      ...payload, ...(entry.createdAt ? { created_at: entry.createdAt } : {}),
    }, { onConflict: 'id' });
    if (error) throw error;
    syncedJournalPayloads.set(id, signature);
    if (entry.id !== id) {
      setJournalEntries(items => items.map(item => item.id === entry.id ? { ...item, id } : item));
      setActiveJournalId(current => current === entry.id ? id : current);
    }
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

    setDeletedJournalItemIds(ids => ids.includes(id) ? ids : [...ids, id]);
  }


  function toggleHabitToday(id: string) {
    const now = new Date();
    toggleHabitMonthDay(id, now.getDate()-1, now.getFullYear(), now.getMonth());
  }
  function progressFromWidget(item: PlanItemScore, value: number) {
    const date = todayDateKey();
    const now = new Date().toISOString();
    const day = kodaDays.find(d=>d.localDate===date);
    if (!day?.plan || day.status !== 'active') return;
    const current = getCurrentPlanVersion(day.plan);
    updateKodaDays(days=>days.map(d=>d.id===day.id && d.status==='active' && d.plan ? {...d,plan:recordPlanProgress(d.plan,item.sourceKey,value,uid('completion'),{at:now,versionId:current.id}),updatedAt:now}:d));
    if (item.source.kind==='action') updateGoals(gs=>gs.map(g=>g.id===item.source.goalId?{...g,actions:g.actions.map(a=>a.id===item.source.id?{...a,status:value>=item.targetValue?'completed':'pending',completedAt:value>=item.targetValue?now:null}:a),updatedAt:now}:g));
    else if (item.source.kind==='routine') updateGoals(gs=>gs.map(g=>g.id===item.source.goalId?{...g,routineLogs:upsertRoutineLog(g.routineLogs,item.source.id,date,value),updatedAt:now}:g));
    else {
      const source=[...plannerDayItems,...buildHabitPlannerItems(habits,date)].find(p=>p.id===item.source.plannerId||p.id===item.source.id);
      if (source && source.done!==(value>=item.targetValue)) {
        if(source.id.startsWith('habit:')&&source.sourceId) toggleHabitToday(source.sourceId);
        else if(source.sourceType&&source.sourceType!=='planner')toggleProjectedPlannerItem(source);
        else togglePlannerItem(source.id);
      }
    }
  }
  const widgetItems=[...plannerDayItems,...buildHabitPlannerItems(habits,localDate)];
  const overviewItems=[...plannerDayItems,...goalOverviewItems(goals,localDate)];
  useEffect(() => {
    if (!appStateLoaded || !plannerLoaded || appStateLoadedStorageKey !== scopedStorageKey(kodaStateStorageKey,userId)) return;
    const day=kodaDays.find(d=>d.localDate===localDate&&d.status==='active'&&d.plan);
    if (!day?.plan) return;
    const sourcePlan=day.plan;
    const synced=syncDayPlanProgress(sourcePlan,goals,widgetItems);
    if (synced===sourcePlan) return;
    updateKodaDays(days=>days.map(d=>d.id===day.id&&d.status==='active'&&d.plan===sourcePlan?{...d,plan:synced,updatedAt:new Date().toISOString()}:d));
  }, [goals,habits,plannerDayItems,kodaDays,localDate,appStateLoaded,plannerLoaded,appStateLoadedStorageKey,userId]);
  const searchResults: DesktopSearchResult[] = [
    ...goals.filter(g=>!g.archivedAt).map(g=>({id:`goal:${g.id}`,title:g.title,kind:'Цель',open:()=>{setFocusedGoalId(g.id);setActiveTab('goals');}})),
    ...notes.filter(n=>!n.deletedAt).map(n=>({id:`note:${n.id}`,title:n.title,kind:'Заметка',open:()=>{setFocusedNoteId(n.id);setActiveTab('notes');}})),
    ...plannerDayItems.filter(p=>!p.deletedAt).map(p=>({id:`planner:${p.id}`,title:p.title,kind:'Дело',open:()=>setActiveTab('planner')})),
    ...projects.filter(p=>p.status!=='archived').map(p=>({id:`project:${p.id}`,title:p.title,kind:'Проект',open:()=>setActiveTab('projects')})),
  ];
  const screen = (() => {
    if (activeTab === 'habits') return <WidgetDesktop journalEntries={journalEntries} lastAssistantReply={[...savedChat.chat].reverse().find(message=>message.role==='koda')?.text} onAssistantPrompt={prompt=>{setAssistantDraft(prompt);setActiveTab('koda');}} onJournal={id=>{if(id)setActiveJournalId(id);setActiveTab('journal');}} timerSettings={pomodoro} goals={goals} habits={habits} days={kodaDays} notes={notes} projects={projects} items={widgetItems} overviewItems={overviewItems} onPlannerItem={openPlannerItem} onQuickAdd={()=>setQuickAddOpen(true)} layout={desktopLayout.layout} onLayout={desktopLayout.change} layoutReady={desktopLayout.ready} onOpen={setActiveTab} onGoal={id=>{setFocusedGoalId(id);setActiveTab('goals');}} onNote={id=>{setFocusedNoteId(id);setActiveTab('notes');}} onToggleHabit={toggleHabitToday} onProgress={progressFromWidget} />;
    if (activeTab === 'routines') return <HabitsScreen habits={habits} onHabitsChange={updateHabitSources} onToggleToday={toggleHabitToday} />;

    if (activeTab === 'planner') {
      return <PlannerScreen initialFocus={focusedPlannerItem} themeId={profile.themeId} onThemeChange={themeId => updateProfile({ themeId })} onOpenSection={setActiveTab} goals={goals} isDesktop={isDesktopLayout} items={plannerItems} onSetItemFailed={setPlannerItemFailed} onAddItem={addPlannerItem} onDeleteItem={deletePlannerItem} onGoalsChange={updateGoals} onMoveProjectedItemDate={moveProjectedPlannerItemDate} onToggleItem={togglePlannerItem} onToggleProjectedItem={toggleProjectedPlannerItem} onToggleSubtask={togglePlannerSubtask} onUpdateItem={updatePlannerItem} projectItems={projectPlannerItems} projectNames={Object.fromEntries(projects.map(project=>[project.id,project.title]))} />;
    }
    if (activeTab === 'goals') {
      return <GoalsScreen goals={goals} hasCloudSync={Boolean(userId) && isSupabaseConfigured()} isDesktop={isDesktopLayout} isOnline={isOnline} onGoalsChange={updateGoals} userId={userId} initialGoalId={focusedGoalId} />;
    }
    if (activeTab === 'projects') {
      return <ProjectsScreen isDesktop={isDesktopLayout} onProjectsChange={updateProjects} projects={projects} />;
    }
    if (activeTab === 'notes') {
      return <NotesScreen isDesktop={isDesktopLayout} notes={notes} onNotesChange={updateNotes} saveState={notesSaveState} userId={userId ?? null} initialNoteId={focusedNoteId} />;
    }
    if (activeTab === 'day') {
      return (
        <DailyPlanScreen
          goals={goals}
          isDesktop={isDesktopLayout}
          kodaDays={kodaDays}
          onGoalsChange={updateGoals}
          onKodaDaysChange={updateKodaDays}
          plannerItems={[...plannerDayItems,...buildHabitPlannerItems(habits,todayDateKey())]}
          userId={userId}
          onOpenSection={setActiveTab}
          onDiscussDay={context=>{setAssistantDraft(context);setActiveTab('koda');}}
          onOpenGoal={(id)=>{setFocusedGoalId(id);setActiveTab('goals');}}
          onAddItem={(title)=>addPlannerItem({title,date:todayDateKey(),time:''})??null}
          onTogglePlannerItem={(item) => {
            if (item.id.startsWith('habit:') && item.sourceId) { const now = new Date(); toggleHabitMonthDay(item.sourceId, now.getDate()-1, now.getFullYear(), now.getMonth()); }
            else if (item.sourceType && item.sourceType !== 'planner') toggleProjectedPlannerItem(item);
            else togglePlannerItem(item.id);
          }}
        />
      );
    }
    if (activeTab === 'timer') {
      return <PomodoroScreen isDesktop={isDesktopLayout} onSettingsChange={updatePomodoro} settings={pomodoro} />;
    }
    if (activeTab === 'profile') {
      return <ProfileScreen accountInfo={accountInfo} calendarKey={calendarKey} calendarSync={calendarSync} habits={habits.filter(h=>!h.deletedAt)} isDesktop={isDesktopLayout} onProfileChange={updateProfile} onSignOut={onSignOut} plannerItems={plannerItems} profile={profile} />;
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
          emotionEntries={profile.emotionEntries ?? []}
          onSaveEmotion={saveEmotionEntry}
        />
      );
    }
    if (activeTab === 'progress') {
      return <ProgressScreen completedTasks={completedTasks} goals={goals} habitScore={habitScore} isDesktop={isDesktopLayout} totalTasks={plannerDayItems.filter(item=>!item.deletedAt).length} kodaDays={kodaDays} />;
    }
    return <KodaScreen key={userId || 'guest'} chat={savedChat.chat} composerValue={chatComposer.ownerId===(userId??null)?chatComposer.text:''} onComposerChange={(value)=>setChatComposer({ownerId:userId??null,text:value})} initialDraft={assistantDraft} onDraftConsumed={()=>setAssistantDraft('')} isDesktop={isDesktopLayout} onSend={savedChat.send} isSending={savedChat.busy} error={savedChat.error} provider={savedChat.provider} onRetry={savedChat.retry} retryLabel={savedChat.retryLabel} inputDisabled={savedChat.inputDisabled} historyStatus={savedChat.historyStatus} syncError={savedChat.cloudError} onSyncRetry={savedChat.retrySync} />;
  })();

  const syncReady = syncQueueLoaded && plannerLoaded && journalLoaded && appStateLoaded && notesLoaded;
  const visibleSyncQueue = syncReady ? syncQueue : [];
  const hasCloudSync = Boolean(userId) && isSupabaseConfigured();
  const syncText = getSyncText(visibleSyncQueue, isOnline, syncReady, hasCloudSync);
  const petState = profile.pet?.ownerId === (userId ?? null) ? profile.pet : undefined;
  const petView = getPetView(petState, petClock);
  // Earlier releases used «Кода» as the default; retain the stored value while displaying the new name.
  const petDisplayName = petView.name === 'Кода' ? 'Кодик' : petView.name;
  const petLife = petView.status === 'unadopted' ? 'egg' : petView.status === 'dead' ? 'dead' : 'alive';
  const petPose: PetPose = petView.status === 'dead' ? 'emotions_06' : petCelebrating ? 'celebration_01' : petView.status === 'starving' ? 'care_moods_03' : petView.status === 'hungry' ? 'emotions_07' : petView.species === 'bunny' ? 'celebration_01' : petView.species === 'fox' ? 'poses_04' : 'poses_01';
  const petLooks = [
    {id:'cat',name:'Спокойный',description:'Питомец дома'},
    {id:'fox',name:'Улыбка',description:'Открывается за 5 действий'},
    {id:'bunny',name:'Радостный',description:'Открывается за 12 действий'},
  ].filter(item => petView.unlockedSpecies.includes(item.id as PetSpecies));
  const petRoomItems = [
    {id:'none',name:'Без украшений',description:'Свободное место'},
    {id:'scarf',name:'Мягкая подушка',description:'За 3 действия'},
    {id:'bow',name:'Растение',description:'За 8 действий'},
    {id:'crown',name:'Фонарик',description:'За 20 действий'},
  ].filter(item => petView.unlockedAccessories.includes(item.id as PetAccessory));
  const petArtifacts = [
    {id:'first',name:'Первый шаг',description:'За первое выполненное действие',at:1},
    {id:'five',name:'Росток',description:'За 5 выполненных действий',at:5},
    {id:'fifteen',name:'Звезда пути',description:'За 15 выполненных действий',at:15},
    {id:'thirty',name:'Дерево заботы',description:'За 30 выполненных действий',at:30},
  ].filter(item=>petView.lifetimeEarned>=item.at);
  const nextPetUnlock = [
    {at:1,name:'Первый шаг'}, {at:3,name:'Мягкая подушка'}, {at:5,name:'Улыбка'},
    {at:8,name:'Растение'}, {at:12,name:'Радостный образ'}, {at:15,name:'Звезда пути'},
    {at:20,name:'Фонарик'}, {at:30,name:'Дерево заботы'},
  ].find(item => petView.lifetimeEarned < item.at);
  function changePet(change: (state: PetState | undefined, operation: {id:string;at:string}) => PetState | undefined) {
    const operation = { id: uid('pet-event'), at: new Date().toISOString() };
    markSyncQueued('appState');
    setProfile(current => {
      const existing = current.pet?.ownerId === (userId ?? null) ? current.pet : undefined;
      const pet = change(existing, operation);
      return pet === existing ? current : { ...current, pet };
    });
    setPetClock(Date.now());
  }
  const quickAddPreview = parseQuickTaskInput(quickAddText, todayDateKey(), '');
  if (initialStateReadyKey !== scopedStorageKey(kodaStateStorageKey, userId)) {
    return <SafeAreaView style={[styles.safe, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator color={accent} /></SafeAreaView>;
  }
  return (
    <PomodoroProvider settings={pomodoro} owner={userId ?? 'guest'} onPhase={() => playPomodoroSound(pomodoro.soundId, 'end')}>
    <SafeAreaView style={styles.safe}>
      <StatusBar style={resolveKodaThemeId(profile.themeId).endsWith('dark') ? 'light' : 'dark'} />
      <WidgetShell key={userId ?? 'guest'} home={activeTab==='habits'} title={desktopTabLabels[activeTab]} name={accountDisplayName(accountInfo)} syncText={syncText} onHome={()=>setActiveTab('habits')} onNavigate={setActiveTab} onAdd={()=>setQuickAddOpen(true)} onProfile={()=>setActiveTab('profile')} layout={desktopLayout.layout} onLayout={desktopLayout.change} layoutError={desktopLayout.error} layoutReady={desktopLayout.ready} searchResults={searchResults}>
        {activeTab==='habits'?screen:<View style={{flex:1,minHeight:0,paddingHorizontal:isDesktopLayout?24:16,paddingBottom:12}}><RightPanelProvider key={activeTab} compact>{screen}</RightPanelProvider></View>}
      </WidgetShell>
      {!petRoomOpen && !quickAddOpen && <PetWanderer name={petDisplayName} state={petLife} pose={petPose} onPress={()=>setPetRoomOpen(true)} />}
      <Modal visible={petRoomOpen} animationType="fade" onRequestClose={()=>setPetRoomOpen(false)}>
        <SafeAreaView style={styles.safe}>
          <PetRoom pet={{name:petDisplayName,state:petLife,hunger:100-petView.hunger,pose:petPose}} food={petView.food} canFeed={petView.canFeed} lifeDeadline={petView.diesAt ?? undefined} earnedActions={petView.lifetimeEarned} nextUnlockText={nextPetUnlock ? `Следующее: ${nextPetUnlock.name} · ${petView.lifetimeEarned} из ${nextPetUnlock.at} действий` : undefined} artifacts={petArtifacts} cosmetics={petLooks} roomUpgrades={petRoomItems} equippedCosmeticId={petView.species} equippedUpgradeIds={[petView.accessory]}
            onClose={()=>setPetRoomOpen(false)} onAdopt={()=>changePet((state,op)=>adoptPet(state,userId??null,op))} onFeed={()=>{if(petView.canFeed)setPetCelebrating(true);changePet((state,op)=>state?feedPet(state,op):state);}} onRebirth={()=>changePet((state,op)=>state?rebirthPet(state,op):state)}
            onRename={name=>changePet((state,op)=>state?customizePet(state,{name},op):state)} onSelectCosmetic={id=>changePet((state,op)=>state?customizePet(state,{species:id as PetSpecies},op):state)} onSelectUpgrade={id=>changePet((state,op)=>state?customizePet(state,{accessory:id as PetAccessory},op):state)} />
        </SafeAreaView>
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
                accessibilityRole="button" accessibilityLabel="Закрыть быстрое добавление"
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
              accessibilityLabel="Быстрое дело"
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
              <Pressable accessibilityRole="button" onPress={() => setQuickAddSubtaskOpen(true)} style={styles.plannerInlineAddButton}>
                <Plus color={accent} size={13} />
                <Text style={styles.plannerInlineAddText}>Добавить подзадачу</Text>
              </Pressable>
            )}
            <Pressable accessibilityRole="button" accessibilityLabel="Добавить дело в планнер" disabled={!quickAddPreview} onPress={submitQuickPlannerItem} style={[styles.notificationButton, !quickAddPreview && styles.notificationButtonDisabled]}>
              <Text style={styles.notificationButtonText}>Добавить</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
    </PomodoroProvider>
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

function getSyncText(queue: SyncDomain[], online: boolean, ready = true, hasCloudSync = true) {
  if (!hasCloudSync) return 'Сохранено на устройстве';
  if (!ready && online) return 'Синхронизация...';
  if (!online && queue.length) return 'Изменения ждут подключения к интернету';
  if (!online) return 'Офлайн: новые данные сохранятся на телефоне';
  if (queue.length) return 'Изменения ждут синхронизации';

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

function sectionFromHash(): TabKey {
  if (typeof window === 'undefined') return 'habits';
  const raw=window.location.hash.replace(/^#\/?/,'').split('?')[0];
  const allowed:TabKey[]=['habits','day','routines','planner','goals','projects','notes','journal','timer','progress','koda','profile'];
  return allowed.includes(raw as TabKey)?raw as TabKey:'habits';
}

function plannerFocusFromHash():PlannerItem|null {
  if(typeof window==='undefined'||!window.location.hash.startsWith('#planner?'))return null;
  const query=new URLSearchParams(window.location.hash.split('?')[1]);const date=query.get('date')??'';const id=query.get('item')??'';
  if(!id||!isPlannerDate(date))return null;
  const rawType=query.get('type');const sourceType=rawType==='goal'||rawType==='project'||rawType==='recurring'?rawType:'planner';
  return {id,date,time:'',title:query.get('title')??'',done:false,sourceType};
}
