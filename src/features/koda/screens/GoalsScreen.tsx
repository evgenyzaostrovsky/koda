import { currentGoalMilestone, nextAvailableGoalAction, nextRoadmapAction } from '../components/goalPresentation';
import { RightPanel } from '../components/RightPanel';
import { BentoCard, BentoGrid, BentoPage, FloatingCardAction, EmptyStateCard, MetricCard, SectionHeader } from '../components/Bento';
import { ArrowLeft, Check, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import {
  calculateGoalProgress,
  calculateMilestoneProgress,
  createGoal,
  createGoalAction,
  createGoalRoutine,
  createMilestone,
  formatDateLong,
  goalDeadlineLabel,
  nextGoalPriorityGoals,
  routineLogValue,
  sortGoalActions,
  todayActionCandidates,
  upsertRoutineLog,
  type GoalDraft,
} from '../goalLogic';
import type { Goal, GoalAction, GoalMilestone, GoalPriority, GoalRoutine, GoalRoutineFrequencyType, GoalRoutineMetricType } from '../types';
import { todayDateKey } from '../utils';
import { ProgressLine } from '../components';
import { GoalMatrix } from '../components/GoalMatrix';
import { GoalRoadmap } from '../components/GoalRoadmap';
import { GoalStructureAssistant } from '../components/GoalStructureAssistant';
import { GoalWizard, removeGoalWizardDraft } from '../components/GoalWizard';
import { accent, accentBorder, accentFaint, activeBg, activeText, faint, line, muted, panel, panelSoft, text } from '../theme';
import { getActiveRoadmapClarifications, updateRoadmapAnswer } from '../goalRoadmapClarifications';

type GoalsChange = (updater: (goals: Goal[]) => Goal[]) => void;
type AddKind = 'milestone' | 'action' | 'routine';

const priorityLabels: Record<GoalPriority, string> = {
  main: 'главная',
  important: 'важная',
  supporting: 'поддерживающая',
};

const metricLabels: Record<GoalRoutineMetricType, string> = {
  boolean: 'факт',
  minutes: 'минуты',
  count: 'количество',
};

const frequencyLabels: Record<GoalRoutineFrequencyType, string> = {
  daily: 'каждый день',
  weekly: 'в неделю',
  monthly: 'в месяц',
  selected_weekdays: 'по дням',
};
const weekDays = [
  { label: 'ПН', value: 1 },
  { label: 'ВТ', value: 2 },
  { label: 'СР', value: 3 },
  { label: 'ЧТ', value: 4 },
  { label: 'ПТ', value: 5 },
  { label: 'СБ', value: 6 },
  { label: 'ВС', value: 7 },
];
const workDays = [1, 2, 3, 4, 5];
const weekendDays = [6, 7];

export function GoalsScreen({ goals, onGoalsChange, isDesktop = false, isOnline, userId, hasCloudSync = Boolean(userId), initialGoalId }: { goals: Goal[]; onGoalsChange: GoalsChange; isDesktop?: boolean; isOnline: boolean; hasCloudSync?: boolean; userId?: string | null; initialGoalId?: string | null }) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const lastInitialGoalId = useRef<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [legacyCreateOpen, setLegacyCreateOpen] = useState(false);
  const [confirmMainGoal, setConfirmMainGoal] = useState<Goal | null>(null);
  const pendingWizardDraftKey=useRef<string|null>(null);

  const visibleGoals = goals.filter((goal) => showCompleted ? goal.status==='completed' : goal.status === 'active' || goal.status === 'paused');
  const sortedGoals = [...visibleGoals].sort((first, second) => {
    if (first.priority !== second.priority) return first.priority === 'main' ? -1 : second.priority === 'main' ? 1 : 0;
    return second.updatedAt.localeCompare(first.updatedAt);
  });
  const selectedGoal = goals.find((goal) => goal.id === selectedGoalId) ?? null;
  const activeGoals = goals.filter((goal) => goal.status === 'active');
  const averageProgress = activeGoals.length ? Math.round(activeGoals.reduce((sum, goal) => sum + calculateGoalProgress(goal), 0) / activeGoals.length) : 0;
  const todayCandidates = goals.flatMap((goal) => {
    const today = todayActionCandidates(goal);
    return [
      ...today.routines.map((routine) => `${goal.title}: ${routine.title}`),
      ...today.actions.map((action) => `${goal.title}: ${action.title}`),
    ];
  });

  useEffect(() => {
    if (!initialGoalId) { lastInitialGoalId.current = null; return; }
    if (lastInitialGoalId.current === initialGoalId || !goals.some((goal) => goal.id === initialGoalId)) return;
    lastInitialGoalId.current = initialGoalId;
    setSelectedGoalId(initialGoalId);
  }, [goals, initialGoalId]);

  function saveGoalRecord(nextGoal: Goal) {
    if (nextGoal.priority === 'main' && goals.some((goal) => goal.priority === 'main' && goal.status === 'active')) {
      setConfirmMainGoal(nextGoal);
      return false;
    }

    onGoalsChange((items) => [nextGoal, ...items]);
    setSelectedGoalId(nextGoal.id);
    return true;
  }

  function saveWizardGoal(nextGoal:Goal){
    pendingWizardDraftKey.current=`koda:goal-wizard:v1:${userId||'guest'}`;
    const saved=saveGoalRecord(nextGoal);
    if(saved)pendingWizardDraftKey.current=null;
    return saved;
  }

  function saveGoal(draft: GoalDraft) {
    pendingWizardDraftKey.current=null;
    saveGoalRecord(createGoal(draft));
  }

  function confirmMainGoalSave() {
    if (!confirmMainGoal) return;
    const nextGoal = confirmMainGoal;
    onGoalsChange((items) => [nextGoal, ...nextGoalPriorityGoals(items, nextGoal)]);
    if(pendingWizardDraftKey.current)void removeGoalWizardDraft(pendingWizardDraftKey.current).catch(()=>undefined);
    pendingWizardDraftKey.current=null;
    setConfirmMainGoal(null);
    setSelectedGoalId(nextGoal.id);
  }

  if (selectedGoal) {
    return (
      <>
        <GoalDetails goal={selectedGoal} goals={sortedGoals} hasCloudSync={hasCloudSync} isDesktop={isDesktop} isOnline={isOnline} onBack={() => { setSelectedGoalId(null); setLibraryOpen(true); }} onCreate={() => setCreateOpen(true)} onGoalsChange={onGoalsChange} onSelect={setSelectedGoalId} />
        <GoalWizard open={createOpen} userId={userId} onClose={() => setCreateOpen(false)} onSave={saveWizardGoal} />
        <CreateGoalFlow open={legacyCreateOpen} onClose={() => setLegacyCreateOpen(false)} onSave={saveGoal} />
        <ConfirmSheet title="Сделать цель главной?" text="Предыдущая главная цель станет важной. Одновременно активной главной может быть только одна." visible={Boolean(confirmMainGoal)} onCancel={() => setConfirmMainGoal(null)} onConfirm={confirmMainGoalSave} />
      </>
    );
  }

  if (!libraryOpen) {
    const previewGoals = sortedGoals.slice(0, 2);
    return (
      <BentoPage maxWidth={960} scroll={false} style={local.screen} contentStyle={local.pageContent}>
        <View style={local.overviewWrap}>
          <SectionHeader title="Цели" subtitle={!hasCloudSync ? 'Сохранено на устройстве' : isOnline ? 'Синхронизируется с аккаунтом' : 'Офлайн: изменения сохранятся локально'} action={<Pressable accessibilityRole="button" accessibilityLabel="Создать цель" onPress={() => setCreateOpen(true)} style={local.roundAccentButton}><Plus color={activeText} size={20} strokeWidth={3} /></Pressable>} />
          {previewGoals.length ? <BentoCard tone={previewGoals[0].priority === 'main' ? 'lime' : 'light'} style={local.overviewCard}>
            <View style={local.overviewStats}>
              <View><Text style={local.goalMeta}>Активные</Text><Text style={local.overviewValue}>{activeGoals.length}</Text></View>
              <View><Text style={local.goalMeta}>Средний прогресс</Text><Text style={local.overviewValue}>{activeGoals.length ? `${averageProgress}%` : '—'}</Text></View>
            </View>
            <View style={local.divider} />
            <Text style={local.miniLabel}>{showCompleted ? 'Завершённые цели' : 'Ближайшие цели'}</Text>
            {previewGoals.map((goal) => <Pressable accessibilityRole="button" accessibilityLabel={`Открыть цель: ${goal.title}`} key={goal.id} onPress={() => setSelectedGoalId(goal.id)} style={local.overviewGoalRow}>
              <View style={local.flexText}><Text numberOfLines={1} style={local.goalTitle}>{goal.title}</Text><Text numberOfLines={1} style={local.goalMeta}>{nextAvailableGoalAction(goal)?.title ?? 'Следующий шаг не задан'}</Text></View>
              <Text style={local.overviewProgress}>{calculateGoalProgress(goal)}%</Text>
            </Pressable>)}
            <View style={local.overviewActions}>
              <Pressable accessibilityRole="button" onPress={() => setSelectedGoalId(previewGoals[0].id)} style={local.primaryButton}><Text style={local.primaryButtonText}>{showCompleted ? 'Открыть цель' : 'Продолжить цель'}</Text></Pressable>
              <Pressable accessibilityRole="button" onPress={() => setLibraryOpen(true)} style={local.overviewTextButton}><Text style={local.secondaryButtonText}>{showCompleted ? 'Список целей' : `Все цели${sortedGoals.length > 2 ? ` · ${sortedGoals.length}` : ''}`}</Text></Pressable>
            </View>
            {!showCompleted && goals.some(goal => goal.status === 'completed') ? <Pressable accessibilityRole="button" onPress={() => setShowCompleted(true)} style={local.overviewTextButton}><Text style={local.secondaryButtonText}>Завершённые · {goals.filter(goal => goal.status === 'completed').length}</Text></Pressable> : null}
          </BentoCard> : goals.some(goal => goal.status === 'completed') ? <EmptyStateCard title="Сейчас нет активных целей" description="Завершённые цели доступны в списке." action={<Pressable accessibilityRole="button" onPress={() => setShowCompleted(true)} style={local.primaryButton}><Text style={local.primaryButtonText}>Завершённые цели</Text></Pressable>} /> : <EmptyStateCard title="Куда ты хочешь прийти?" description="Создай первую цель и добавь действия, которые будут двигать тебя к ней." action={<Pressable accessibilityRole="button" onPress={() => setCreateOpen(true)} style={local.primaryButton}><Text style={local.primaryButtonText}>Создать цель</Text></Pressable>} />}
        </View>
        <GoalWizard open={createOpen} userId={userId} onClose={() => setCreateOpen(false)} onSave={saveWizardGoal} />
        <CreateGoalFlow open={legacyCreateOpen} onClose={() => setLegacyCreateOpen(false)} onSave={saveGoal} />
        <ConfirmSheet title="Сделать цель главной?" text="Предыдущая главная цель станет важной. Одновременно активной главной может быть только одна." visible={Boolean(confirmMainGoal)} onCancel={() => setConfirmMainGoal(null)} onConfirm={confirmMainGoalSave} />
      </BentoPage>
    );
  }

  return (
    <BentoPage maxWidth={960} scroll={false} style={local.screen} contentStyle={local.pageContent}>
      <View style={local.topRow}>
        <SectionHeader title="Цели" subtitle={!hasCloudSync ? 'Сохранено на устройстве' : isOnline ? 'Синхронизируется с аккаунтом' : 'Офлайн: изменения сохранятся локально'} action={<View style={local.overviewActions}>
          <Pressable accessibilityRole="button" onPress={() => setLibraryOpen(false)} style={local.overviewTextButton}><Text style={local.secondaryButtonText}>Обзор</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Создать цель" onPress={() => setCreateOpen(true)} style={local.roundAccentButton}><Plus color={activeText} size={20} strokeWidth={3} /></Pressable>
        </View>} />
      </View>
      <Pressable accessibilityRole="button" onPress={() => setLegacyCreateOpen(true)} style={local.legacyFormButton}>
        <Text style={local.secondaryButtonText}>Классическая форма</Text>
      </Pressable>
      {goals.some(goal=>goal.status==='completed')&&<View style={local.detailTabs}><Pressable accessibilityRole="button" accessibilityState={{selected:!showCompleted}} onPress={()=>setShowCompleted(false)} style={[local.detailTab,!showCompleted&&local.detailTabActive]}><Text style={local.detailTabText}>В работе</Text></Pressable><Pressable accessibilityRole="button" accessibilityState={{selected:showCompleted}} onPress={()=>setShowCompleted(true)} style={[local.detailTab,showCompleted&&local.detailTabActive]}><Text style={local.detailTabText}>Завершённые</Text></Pressable></View>}

      <ScrollView contentContainerStyle={[local.scrollContent, isDesktop && local.desktopScrollContent]} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        <View style={isDesktop ? local.desktopLayout : undefined}>
          <View style={isDesktop ? local.desktopMainColumn : undefined}>
            {!sortedGoals.length ? (
              <View style={local.emptyComposition}>
              <EmptyStateCard title="Куда ты хочешь прийти?" description="Создай первую цель и добавь действия, которые будут двигать тебя к ней." action={<Pressable accessibilityRole="button" onPress={() => setCreateOpen(true)} style={local.primaryButton}><Text style={local.primaryButtonText}>Создать цель</Text></Pressable>} />
              <BentoCard tone="soft"><View accessibilityLabel="Пример последовательности, это не данные цели" style={local.exampleRoadmap}>
                  <Text style={local.exampleRoadmapLabel}>Пример пути · это не данные цели</Text>
                  <View style={local.exampleRoadmapStep}><Text style={local.exampleRoadmapNumber}>1</Text><Text style={local.exampleRoadmapText}>Определить желаемый результат</Text></View>
                  <View style={local.exampleRoadmapStep}><Text style={local.exampleRoadmapNumber}>2</Text><Text style={local.exampleRoadmapText}>Выбрать одно направление</Text></View>
                  <View style={local.exampleRoadmapStep}><Text style={local.exampleRoadmapNumber}>3</Text><Text style={local.exampleRoadmapText}>Записать первый посильный шаг</Text></View>
                </View></BentoCard>
                <Pressable accessibilityRole="button" onPress={() => setLegacyCreateOpen(true)} style={local.legacyFormButton}>
                  <Text style={local.secondaryButtonText}>Классическая форма</Text>
                </Pressable>
              </View>
            ) : (
              <BentoGrid columns={sortedGoals.length > 1 ? 2 : 1} style={local.goalGrid}>
                {sortedGoals.map((goal, index) => (
                  <GoalCard key={goal.id} desktop={isDesktop} goal={goal} featured={index === 0 && goal.priority === 'main'} onPress={() => setSelectedGoalId(goal.id)} />
                ))}
              </BentoGrid>
            )}
          </View>
          {isDesktop ? (
            <RightPanel enabled={isDesktop}><View style={local.desktopAside}>
              <BentoCard tone="soft" style={local.desktopInfoCard}>
                <Text style={local.blockTitle}>В работе</Text>
                <MetricCard label="Средний прогресс" value={`${averageProgress}%`} detail={`${activeGoals.length} активных целей`} tone="soft" />
                <View style={local.divider} />
                <Text style={local.goalMeta}>{goals.filter((goal) => goal.status === 'paused').length} на паузе · {sortedGoals.length} видимых целей</Text>
              </BentoCard>
              <BentoCard tone="light" style={local.desktopInfoCard}>
                <Text style={local.blockTitle}>Ближайшие действия</Text>
                {todayCandidates.slice(0, 5).map((item) => <Text key={item} style={local.previewLine}>{item}</Text>)}
                {!todayCandidates.length ? <Text style={local.goalMeta}>На сегодня действий по целям нет.</Text> : null}
              </BentoCard>
              <BentoCard tone="light" style={local.desktopInfoCard}>
                <Text style={local.blockTitle}>Без следующего шага</Text>
                {activeGoals.filter((goal) => !goal.actions.some((action) => action.status !== 'completed' && !action.archivedAt)).slice(0, 4).map((goal) => (
                  <Text key={goal.id} style={local.previewLine}>{goal.title}</Text>
                ))}
              </BentoCard>
            </View></RightPanel>
          ) : null}
        </View>
      </ScrollView>

      <GoalWizard open={createOpen} userId={userId} onClose={() => setCreateOpen(false)} onSave={saveWizardGoal} />
      <CreateGoalFlow open={legacyCreateOpen} onClose={() => setLegacyCreateOpen(false)} onSave={saveGoal} />
      <ConfirmSheet
        title="Сделать цель главной?"
        text="Предыдущая главная цель станет важной. Одновременно активной главной может быть только одна."
        visible={Boolean(confirmMainGoal)}
        onCancel={() => setConfirmMainGoal(null)}
        onConfirm={confirmMainGoalSave}
      />
    </BentoPage>
  );
}

function GoalCard({ desktop, goal, featured, onPress }: { desktop?: boolean; goal: Goal; featured: boolean; onPress: () => void }) {
  const progress = calculateGoalProgress(goal);
  const today = todayActionCandidates(goal);
  const standaloneActions = goal.actions.filter((action) => !action.milestoneId && !action.archivedAt).sort(sortGoalActions);
  const nextAction = nextAvailableGoalAction(goal);

  return (
    <BentoCard tone={featured ? 'lime' : 'light'} style={local.goalCardShell}>
    <Pressable accessibilityRole="button" accessibilityLabel={goal.title} onPress={onPress} style={[local.goalCard, desktop && local.goalCardDesktop, featured && local.goalCardFeatured, desktop && featured && local.goalCardDesktopFeatured]}>
      <View style={local.cardHeader}>
        <View style={local.flexText}>
          <Text style={local.goalTitle}>{goal.title}</Text>
          <Text style={local.goalMeta}>{goal.desiredResult || 'Результат пока не задан'}</Text>
          <Text style={local.goalMeta}>{goal.deadline ? `Срок ${goalDeadlineLabel(goal.deadline)}` : 'Без срока'} · {goal.status === 'paused' ? 'на паузе' : priorityLabels[goal.priority]}</Text>
        </View>
        <Text style={local.progressNumber}>{progress}%</Text>
      </View>
      <ProgressLine value={progress} />
      {featured ? (
        <View style={local.todayPreview}>
          <Text style={local.miniLabel}>Сегодня</Text>
          {today.routines.slice(0, 2).map((routine) => (
            <Text key={routine.id} style={local.previewLine}>
              {routine.title}: {routineLogValue(goal, routine.id)} из {routine.targetValue} {routine.metricType === 'minutes' ? 'мин' : ''}
            </Text>
          ))}
          {today.actions.slice(0, 2).map((action) => (
            <Text key={action.id} style={local.previewLine}>{action.title}</Text>
          ))}
        </View>
      ) : (
        <View style={local.cardFooter}>
          <Text style={local.goalMeta}>{nextAction ? nextAction.title : 'следующий шаг не задан'}</Text>
          <Text style={local.statusPill}>{goal.status === 'paused' ? 'пауза' : priorityLabels[goal.priority]}</Text>
        </View>
      )}
    </Pressable>
    </BentoCard>
  );
}

function GoalDetails({ goal, goals, isDesktop = false, isOnline, hasCloudSync = true, onBack, onCreate, onGoalsChange, onSelect }: { goal: Goal; goals: Goal[]; isDesktop?: boolean; isOnline: boolean; hasCloudSync?: boolean; onBack: () => void; onCreate: () => void; onGoalsChange: GoalsChange; onSelect: (id: string) => void }) {
  const narrow = useWindowDimensions().width < 760;
  const [structureOpen,setStructureOpen]=useState(false);
  const [detailTab, setDetailTab] = useState<'roadmap' | 'actions' | 'matrix' | 'context'>('roadmap');
  useEffect(()=>{setStructureOpen(false);},[goal.id]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [manageStages, setManageStages] = useState(false);
  const [focusRoadmapStageId, setFocusRoadmapStageId] = useState<string | null>(null);
  const [focusDirectionId,setFocusDirectionId]=useState<string|null>(null);
  const [stageDraftOpen, setStageDraftOpen] = useState(false);
  const [stageDraft, setStageDraft] = useState('');
  const [editingStageId, setEditingStageId] = useState<string | null>(null);
  const [editingStageTitle, setEditingStageTitle] = useState('');
  const [removingStageId, setRemovingStageId] = useState<string | null>(null);
  const [deleteGoalOpen, setDeleteGoalOpen] = useState(false);
  const progress = calculateGoalProgress(goal);
  const today = todayActionCandidates(goal);
  const standaloneActions = goal.actions.filter((action) => !action.milestoneId && !action.archivedAt).sort(sortGoalActions);
  const roadmapNext = nextRoadmapAction(goal);
  const nextAction = roadmapNext.action;

  function updateGoal(recipe: (goal: Goal) => Goal) {
    onGoalsChange((items) => items.map((item) => (item.id === goal.id ? { ...recipe(item), updatedAt: new Date().toISOString() } : item)));
  }

  const roadmapDirections=[...(goal.openWindow?.directions??[])].filter(direction=>!direction.archivedAt&&direction.title.trim()).sort((a,b)=>a.position-b.position);
  const currentMilestone = goal.status==='completed' ? undefined : currentGoalMilestone(goal);
  const actionDirection = nextAction ? roadmapDirections.find((direction) => direction.actionIds.includes(nextAction.id)) : undefined;
  const actionMilestone = nextAction?.milestoneId ? goal.milestones.find((milestone) => milestone.id === nextAction.milestoneId) : undefined;
  const currentStage = currentMilestone?.title;
  const nextActionLocation = actionMilestone ? `этапа «${actionMilestone.title}»` : actionDirection ? `направления «${actionDirection.title}»` : 'действий вне этапа';

  function deleteGoal() {
    onGoalsChange((items) => items.filter((item) => item.id !== goal.id));
    setDeleteGoalOpen(false);
    onBack();
  }

  function addRoadmapStage() {
    const title = stageDraft.trim();
    if (!title) return;
    updateGoal((item) => ({ ...item, milestones: [...item.milestones, createMilestone(title, '', '', item.milestones.length)] }));
    setStageDraft('');
    setStageDraftOpen(false);
  }

  function saveRoadmapStageTitle() {
    const title = editingStageTitle.trim();
    if (!editingStageId || !title) return;
    updateGoal((item) => ({ ...item, milestones: item.milestones.map((stage) => stage.id === editingStageId ? { ...stage, title } : stage) }));
    setEditingStageId(null);
    setEditingStageTitle('');
  }

  function moveRoadmapStage(stageId: string, offset: -1 | 1) {
    updateGoal((item) => {
      const ordered = [...item.milestones].sort((a, b) => a.position - b.position);
      const index = ordered.findIndex((stage) => stage.id === stageId);
      const target = index + offset;
      if (index < 0 || target < 0 || target >= ordered.length) return item;
      [ordered[index], ordered[target]] = [ordered[target], ordered[index]];
      return { ...item, milestones: ordered.map((stage, position) => ({ ...stage, position })) };
    });
  }

  function setRoadmapStageStatus(stageId: string, status: GoalMilestone['status']) {
    updateGoal((item) => ({ ...item, milestones: item.milestones.map((stage) => stage.id === stageId ? { ...stage, status, completedAt: status === 'completed' ? stage.completedAt ?? new Date().toISOString() : null } : stage) }));
  }

  function removeRoadmapStage(stageId: string) {
    updateGoal((item) => ({
      ...item,
      milestones: item.milestones.filter((stage) => stage.id !== stageId).map((stage, position) => ({ ...stage, position })),
      actions: item.actions.map((action) => action.milestoneId === stageId ? { ...action, milestoneId: null } : action),
    }));
    setRemovingStageId(null);
  }

  return (
    <BentoPage maxWidth={960} scroll={false} style={local.screen} contentStyle={local.detailPage}>
      <View style={local.detailsHeader}>
        <Pressable accessibilityRole="button" accessibilityLabel="К списку целей" onPress={onBack} style={local.iconButton}>
          <ArrowLeft color={text} size={19} />
        </Pressable>
        <Text style={local.detailsTitle}>Все цели</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Действия с целью" accessibilityState={{ expanded: menuOpen }} aria-expanded={menuOpen} onPress={() => setMenuOpen((value) => !value)} style={local.iconButton}>
          <MoreHorizontal color={text} size={19} />
        </Pressable>
      </View>
      {menuOpen ? (
        <View style={local.inlineMenu}>
          <MenuButton label={goal.status === 'paused' ? 'Возобновить' : 'Пауза'} onPress={() => updateGoal((item) => ({ ...item, status: item.status === 'paused' ? 'active' : 'paused' }))} />
          <MenuButton label="Завершить" onPress={() => updateGoal((item) => ({ ...item, status: 'completed', completedAt: new Date().toISOString() }))} />
          <MenuButton label="Архив" onPress={() => updateGoal((item) => ({ ...item, status: 'archived', archivedAt: new Date().toISOString() }))} />
          <MenuButton label="Удалить" danger onPress={() => setDeleteGoalOpen(true)} />
        </View>
      ) : null}

      <ScrollView contentContainerStyle={[local.scrollContent, isDesktop && local.desktopScrollContent]} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        <View style={isDesktop ? local.desktopDetailsLayout : undefined} testID={isDesktop ? 'desktop-page-columns' : undefined}>
          <View style={isDesktop ? local.desktopMainColumn : undefined} testID={isDesktop ? 'desktop-main-column' : undefined}>
            <BentoGrid columns={3} style={[local.goalHeroGrid,narrow&&local.goalHeroGridMobile]}>
              <BentoCard testID="goal-hero" tone="lime" variant="top-right" action={<FloatingCardAction label="Открыть контекст цели" onPress={()=>setDetailTab('context')}/>} style={[{gridColumn:'span 2'} as any,narrow&&local.goalHeroMobile]}>
                <Text style={{fontSize:isDesktop?34:28,lineHeight:isDesktop?40:34,fontWeight:'500',letterSpacing:-0.8,color:'#263c19',paddingRight:narrow?0:88}}>{goal.title}</Text>
                <Text style={{fontSize:14,lineHeight:21,color:'#435b31',paddingRight:narrow?0:88}}>{goal.desiredResult || 'Результат пока не задан'}</Text>
                {goal.status==='completed'&&<Text style={{fontSize:15,lineHeight:22,color:'#263c19'}}>Цель завершена</Text>}
                <View style={{flexDirection:'row',alignItems:'center',gap:14}}><View accessibilityRole="progressbar" accessibilityValue={{min:0,max:100,now:progress}} style={{flex:1,height:8,borderRadius:8,backgroundColor:'#f5ffd0',overflow:'hidden'}}><View style={{height:8,width:`${progress}%`,backgroundColor:'#263c19',borderRadius:8}}/></View><Text style={{fontSize:30,lineHeight:38,color:'#263c19'}}>{progress}%</Text></View>
                {currentStage&&<Text style={{fontSize:15,lineHeight:22,color:'#263c19'}}>Сейчас: {currentStage}</Text>}
                {nextAction&&<Pressable accessibilityRole="button" accessibilityLabel={`Открыть следующий шаг: ${nextAction.title}`} onPress={()=>{if(actionMilestone){setFocusRoadmapStageId(actionMilestone.id);setDetailTab('roadmap')}else if(actionDirection){setFocusDirectionId(actionDirection.id);setDetailTab('matrix')}else setDetailTab('actions')}} style={{minHeight:48,paddingVertical:10,justifyContent:'center',borderTopWidth:1,borderTopColor:'#adca43',gap:4}}><Text style={{color:'#435b31',fontSize:12}}>{roadmapNext.fromOtherStage?`Шаг из ${nextActionLocation}`:'Следующий шаг'}</Text><Text style={{color:'#263c19',fontSize:16,lineHeight:23}}>{nextAction.title}</Text></Pressable>}
                {!nextAction&&currentMilestone?<Pressable accessibilityRole="button" onPress={()=>{setDetailTab('actions');setAddKind('action')}} style={{minHeight:48,paddingVertical:10,justifyContent:'center',borderTopWidth:1,borderTopColor:'#adca43'}}><Text style={{color:'#263c19',fontSize:15}}>Добавить действие к этапу «{currentMilestone.title}»</Text></Pressable>:null}
              </BentoCard>
              <BentoCard tone="soft" style={[local.factPanel,narrow&&local.factPanelMobile]}>
                <View style={local.factGrid}>
                  <View style={local.factCell}><Text style={local.factLabel}>Срок</Text><Text numberOfLines={2} style={local.factValue}>{goal.deadline?formatDateLong(goal.deadline):'Без срока'}</Text></View>
                  <View style={local.factCell}><Text style={local.factLabel}>Приоритет</Text><Text numberOfLines={1} style={local.factValue}>{priorityLabels[goal.priority]}</Text></View>
                  <View style={local.factCell}><Text style={local.factLabel}>Статус</Text><Text numberOfLines={1} style={local.factValue}>{goal.status==='completed'?'Завершена':goal.status==='paused'?'Пауза':'Активна'}</Text></View>
                  <View style={local.factCell}><Text style={local.factLabel}>Этапы</Text><Text numberOfLines={1} style={local.factValue}>{goal.milestones.filter(stage=>calculateMilestoneProgress(stage,goal.actions)===100).length} из {goal.milestones.length}</Text></View>
                </View>
              </BentoCard>
            </BentoGrid>

            <View style={local.detailTabs} accessibilityRole="tablist">
              {([
                ['roadmap', 'Путь'], ['actions', 'Действия'], ['matrix', '8 направлений'], ['context', 'Контекст'],
              ] as const).map(([key, label]) => (
                <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: detailTab === key }} onPress={() => setDetailTab(key)} style={[local.detailTab, detailTab === key && local.detailTabActive]}>
                  <Text style={[local.detailTabText, detailTab === key && local.detailTabTextActive]}>{label}</Text>
                </Pressable>
              ))}
            </View>
            <GoalStructureAssistant key={goal.id} open={structureOpen} goal={goal} onClose={()=>setStructureOpen(false)} onUpdateGoal={updateGoal}/>

            {detailTab === 'roadmap' ? (
              <View style={local.tabContent}>
                <View style={local.blockHeadingRow}>
                  <View style={local.flexText}><Text style={local.blockTitle}>Этапы пути</Text><Text style={local.goalMeta}>Продвигайся по одному понятному этапу за раз.</Text></View>
                  <View style={local.roadmapActions}>{goal.milestones.length>0&&<Pressable accessibilityRole="button" aria-expanded={manageStages} onPress={()=>setManageStages(value=>!value)} style={local.roadmapOutlineButton}><Text style={local.roadmapOutlineText}>{manageStages?'Готово':'Настроить этапы'}</Text></Pressable>}<Pressable accessibilityRole="button" onPress={() => setStageDraftOpen((value) => !value)} style={local.roadmapButton}><Text style={local.roadmapButtonText}>{stageDraftOpen ? 'Скрыть форму' : 'Добавить этап'}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setStructureOpen(true)} style={local.roadmapOutlineButton}><Text style={local.roadmapOutlineText}>Собрать с помощником</Text></Pressable></View>
                </View>
                {stageDraftOpen ? <View style={local.stageEditor}><TextInput accessibilityLabel="Название нового этапа" value={stageDraft} onChangeText={setStageDraft} placeholder="Например, подготовить портфолио" placeholderTextColor={faint} style={local.stageInput} onSubmitEditing={addRoadmapStage}/><Pressable accessibilityRole="button" disabled={!stageDraft.trim()} onPress={addRoadmapStage} style={[local.stageSave, !stageDraft.trim() && local.stageDisabled]}><Text style={local.stageSaveText}>Добавить</Text></Pressable></View> : null}
                {roadmapDirections.length>0&&<BentoCard tone="soft"><View style={local.blockHeadingRow}><View style={local.flexText}><Text style={local.blockTitle}>ОТАНИ · направления цели</Text><Text style={local.goalMeta}>{roadmapDirections.length} направлений · отдельное представление вариантов и действий</Text></View><Pressable accessibilityRole="button" onPress={()=>setDetailTab('matrix')} style={local.roadmapOutlineButton}><Text style={local.roadmapOutlineText}>Открыть ОТАНИ</Text></Pressable></View></BentoCard>}
                {goal.milestones.length ? <>
                  <GoalRoadmap milestones={goal.milestones} actions={goal.actions} currentMilestoneId={currentMilestone?.id} focusMilestoneId={focusRoadmapStageId} manage={manageStages}
                    onAddAction={()=>{setDetailTab('actions');setAddKind('action');}}
                    onToggleAction={(actionId)=>toggleAction(goal,actionId,updateGoal)}
                    onUpdateMilestone={(id,patch)=>updateGoal(item=>({...item,milestones:item.milestones.map(stage=>stage.id===id?{...stage,...patch}:stage)}))}
                    renderManageActions={(milestone,index,ordered)=>{
                      const attachedCount=goal.actions.filter(action=>action.milestoneId===milestone.id).length;
                      return <>
                        {editingStageId===milestone.id?<View style={local.stageEditor}><TextInput accessibilityLabel="Название этапа" value={editingStageTitle} onChangeText={setEditingStageTitle} style={local.stageInput} autoFocus/><Pressable accessibilityRole="button" disabled={!editingStageTitle.trim()} onPress={saveRoadmapStageTitle} style={[local.stageSave,!editingStageTitle.trim()&&local.stageDisabled]}><Text style={local.stageSaveText}>Сохранить</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>setEditingStageId(null)} style={local.stageCancel}><Text style={local.stageCancelText}>Отмена</Text></Pressable></View>:null}
                        <View style={local.stageTools}><Text style={local.stageToolsLabel}>Порядок и статус</Text><View style={local.stageToolButtons}>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Переместить этап ${index+1} вверх`} disabled={index===0} onPress={()=>moveRoadmapStage(milestone.id,-1)} style={[local.stageToolButton,index===0&&local.stageDisabled]}><Text style={local.stageToolText}>↑</Text></Pressable>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Переместить этап ${index+1} вниз`} disabled={index===ordered.length-1} onPress={()=>moveRoadmapStage(milestone.id,1)} style={[local.stageToolButton,index===ordered.length-1&&local.stageDisabled]}><Text style={local.stageToolText}>↓</Text></Pressable>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Переименовать этап ${milestone.title}`} onPress={()=>{setEditingStageId(milestone.id);setEditingStageTitle(milestone.title)}} style={local.stageToolButton}><Pencil color={accent} size={16}/></Pressable>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Удалить этап ${milestone.title}`} onPress={()=>setRemovingStageId(removingStageId===milestone.id?null:milestone.id)} style={local.stageToolButton}><Trash2 color={muted} size={16}/></Pressable>
                        </View></View>
                        {removingStageId===milestone.id?<View style={local.removeStageNote}><Text style={local.stageCancelText}>{attachedCount?`${attachedCount} действий будут сняты с этого этапа и останутся в списке действий.`:'Этап будет удалён.'}</Text><View style={local.stageToolButtons}><Pressable accessibilityRole="button" onPress={()=>setRemovingStageId(null)} style={local.stageCancel}><Text style={local.stageCancelText}>Оставить</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>removeRoadmapStage(milestone.id)} style={local.removeStageButton}><Text style={local.removeStageText}>Удалить этап</Text></Pressable></View></View>:null}
                        <View style={local.stageStatusRow}><Text style={local.stageToolsLabel}>Статус</Text><View style={local.stageToolButtons}>{([['not_started','Впереди'],['in_progress','В процессе'],['completed','Готово']] as const).map(([status,label])=><Pressable key={status} accessibilityRole="button" accessibilityState={{selected:milestone.status===status}} aria-pressed={milestone.status===status} onPress={()=>setRoadmapStageStatus(milestone.id,status)} style={[local.statusChoice,milestone.status===status&&local.statusChoiceActive]}><Text style={[local.statusChoiceText,milestone.status===status&&local.statusChoiceTextActive]}>{label}</Text></Pressable>)}</View></View>
                      </>;
                    }}/>
                </> : (
                  <View accessibilityLabel="Пример этапов пути, не сохранённый в цели" style={local.exampleRoadmap}>
                    <Text style={local.roadmapEmptyTitle}>Путь пока не собран</Text>
                    <Text style={local.exampleRoadmapLabel}>Пример для ориентира · это не данные цели</Text>
                    <View style={local.exampleRoadmapStep}><Text style={local.exampleRoadmapNumber}>1</Text><Text style={local.exampleRoadmapText}>Уточнить желаемый результат</Text></View>
                    <View style={local.exampleRoadmapStep}><Text style={local.exampleRoadmapNumber}>2</Text><Text style={local.exampleRoadmapText}>Разбить путь на этапы</Text></View>
                    <View style={local.exampleRoadmapStep}><Text style={local.exampleRoadmapNumber}>3</Text><Text style={local.exampleRoadmapText}>Выбрать ближайшее действие</Text></View>
                    <Text style={local.roadmapEmptyHint}>Добавь этап или собери маршрут с помощником.</Text>
                  </View>
                )}
              </View>
            ) : null}

            {detailTab === 'actions' ? (
              <View style={local.tabContent}>
                <Text style={local.blockTitle}>Что можно сделать сейчас</Text>
                <View style={local.compactList}>
                  {!today.routines.length && !today.actions.length ? <EmptyLine text="На сегодня нет обязательных действий." /> : null}
                  {today.routines.map((routine) => <RoutineTodayRow key={routine.id} goal={goal} routine={routine} onUpdateGoal={updateGoal} />)}
                  {today.actions.map((action) => <ActionRow key={action.id} action={action} onToggle={() => toggleAction(goal, action.id, updateGoal)} />)}
                </View>
                <SectionBlock title="Регулярные действия" empty={!goal.routines.length ? 'Регулярные действия пока не добавлены.' : ''}>{goal.routines.map((routine) => <RoutineRow key={routine.id} goal={goal} routine={routine} onUpdateGoal={updateGoal} />)}</SectionBlock>
                <SectionBlock title="Разовые действия" empty={!standaloneActions.length ? 'Разовые действия пока не добавлены.' : ''}>{standaloneActions.map((action) => <ActionRow key={action.id} action={action} onToggle={() => toggleAction(goal, action.id, updateGoal)} />)}</SectionBlock>
                <View style={local.addChoices}><ChoiceButton label="Добавить этап" onPress={() => setAddKind('milestone')} /><ChoiceButton label="Разовое действие" onPress={() => setAddKind('action')} /><ChoiceButton label="Регулярное действие" onPress={() => setAddKind('routine')} /></View>
              </View>
            ) : null}

            {detailTab === 'matrix' ? <View style={local.tabContent}><Text style={local.blockTitle}>Возможные пути к цели</Text><Text style={local.goalMeta}>Сохраняй варианты на будущее и выбирай следующий шаг, когда будешь готов.</Text><GoalMatrix initialDirectionId={focusDirectionId} goal={goal} isDesktop={isDesktop} onUpdateGoal={updateGoal} onRequestAI={() => setStructureOpen(true)} /></View> : null}

            {detailTab === 'context' ? (
              <View style={local.tabContent}>
                <View style={local.block}><Text style={local.blockTitle}>Точка старта</Text><Text style={local.goalMeta}>Сохрани то, что уже известно о ситуации. Это можно обновлять по мере продвижения.</Text><TextInput accessibilityLabel="Текущая ситуация и отправная точка" multiline value={goal.planningContext ?? ''} onChangeText={(value) => updateGoal((item) => ({ ...item, planningContext: value.slice(0, 2000) }))} placeholder="Что уже сделано? Что у тебя есть сейчас?" placeholderTextColor={faint} style={local.contextInput} /></View>
                <View style={local.block}><View style={local.blockHeadingRow}><View style={local.flexText}><Text style={local.blockTitle}>Уточнения к плану</Text><Text style={local.goalMeta}>Ответы сохраняются вместе с целью и доступны для редактирования.</Text></View><Pressable accessibilityRole="button" onPress={() => setStructureOpen(true)} style={local.roadmapButton}><Text style={local.roadmapButtonText}>Открыть помощник</Text></Pressable></View>
                  {getActiveRoadmapClarifications(goal).map((item, index) => <View key={item.id} style={local.contextAnswer}><Text style={local.contextQuestion}>{index + 1}. {item.question}</Text><TextInput accessibilityLabel={`Ответ ${index + 1} к плану`} multiline value={item.answer} onChangeText={(value) => updateGoal((current) => updateRoadmapAnswer(current, item.id, value, new Date().toISOString()))} placeholder="Добавь ответ или оставь пустым" placeholderTextColor={faint} style={local.contextAnswerInput} /></View>)}
                  {!getActiveRoadmapClarifications(goal).length ? <EmptyLine text="Сохранённых вопросов пока нет. Помощник уточнит детали при сборке пути." /> : null}
                </View>
              </View>
            ) : null}
          </View>
          <RightPanel enabled={isDesktop}><View style={isDesktop ? local.desktopAside : undefined} testID={isDesktop ? 'desktop-right-column' : undefined}>
            {isDesktop ? (
              <View style={local.goalNavigation}>
                <View style={local.navigationHeader}>
                  <Text style={local.blockTitle}>Цели</Text>
                  <Pressable accessibilityRole="button" accessibilityLabel="Создать цель" onPress={onCreate} style={local.navigationAdd}><Plus color={accent} size={16} /></Pressable>
                </View>
                {goals.map((item) => (
                  <Pressable accessibilityRole="button" accessibilityLabel={item.title} accessibilityState={{ selected: item.id === goal.id }} aria-current={item.id === goal.id ? 'page' : undefined} key={item.id} onPress={() => onSelect(item.id)} style={[local.navigationRow, item.id === goal.id && local.navigationRowActive]}>
                    <Text numberOfLines={1} style={[local.navigationText, item.id === goal.id && local.navigationTextActive]}>{item.title}</Text>
                    <Text style={local.goalMeta}>{calculateGoalProgress(item)}%</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View></RightPanel>
        </View>
      </ScrollView>

      <AddGoalItemSheet goal={goal} kind={addKind} defaultMilestoneId={currentMilestone?.id} onClose={() => setAddKind(null)} onUpdateGoal={updateGoal} />
      <ConfirmSheet title="Удалить цель?" text="Все этапы, действия и история выполнения этой цели исчезнут." visible={deleteGoalOpen} onCancel={() => setDeleteGoalOpen(false)} onConfirm={deleteGoal} destructive />
    </BentoPage>
  );
}

function RoutineTodayRow({ goal, routine, onUpdateGoal }: { goal: Goal; routine: GoalRoutine; onUpdateGoal: (recipe: (goal: Goal) => Goal) => void }) {
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const date = todayDateKey();
  const value = routineLogValue(goal, routine.id, date);
  const done = value >= routine.targetValue;

  function addValue(amount: number) {
    onUpdateGoal((item) => ({ ...item, routineLogs: upsertRoutineLog(item.routineLogs, routine.id, date, value + amount) }));
    setTimeSheetOpen(false);
  }

  function markDone() {
    onUpdateGoal((item) => ({ ...item, routineLogs: upsertRoutineLog(item.routineLogs, routine.id, date, done ? 0 : routine.targetValue) }));
  }

  return (
    <View style={local.todayRow}>
      <View style={local.flexText}>
        <Text style={[local.actionTitle, done && local.doneText]}>{routine.title}</Text>
        <Text style={local.goalMeta}>{value} / {routine.targetValue} {routine.metricType === 'minutes' ? 'минут' : routine.metricType === 'count' ? 'шт' : 'раз'}</Text>
      </View>
      <Pressable onPress={() => setEditOpen(true)} style={local.todayEditButton}>
        <Pencil color={muted} size={13} />
      </Pressable>
      {routine.metricType === 'minutes' ? <InlineAction label="+ время" onPress={() => setTimeSheetOpen(true)} /> : null}
      <InlineAction active={done} label="Готово" onPress={markDone} />
      <TimeAddSheet visible={timeSheetOpen} onClose={() => setTimeSheetOpen(false)} onAdd={addValue} />
      <EditRoutineSheet
        onDelete={() => setDeleteOpen(true)}
        routine={routine}
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={(nextRoutine) => {
          onUpdateGoal((item) => ({
            ...item,
            routines: item.routines.map((candidate) => (candidate.id === routine.id ? nextRoutine : candidate)),
          }));
          setEditOpen(false);
        }}
      />
      <ConfirmSheet
        destructive
        title="Удалить регулярное действие?"
        text="Само действие и история его выполнения исчезнут."
        visible={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          onUpdateGoal((item) => ({
            ...item,
            routineLogs: item.routineLogs.filter((log) => log.routineId !== routine.id),
            routines: item.routines.filter((candidate) => candidate.id !== routine.id),
          }));
          setDeleteOpen(false);
          setEditOpen(false);
        }}
      />
    </View>
  );
}

function MilestoneItem({ milestone, actions, onUpdateGoal }: { milestone: GoalMilestone; actions: GoalAction[]; onUpdateGoal: (recipe: (goal: Goal) => Goal) => void }) {
  const [open, setOpen] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState('');
  const progress = calculateMilestoneProgress(milestone, actions);
  const ownActions = actions.filter((action) => action.milestoneId === milestone.id && !action.archivedAt).sort(sortGoalActions);
  const completedActions = ownActions.filter((action) => action.status === 'completed').length;
  const milestoneMeta = ownActions.length
    ? `${completedActions} из ${ownActions.length} действий`
    : milestone.status === 'completed'
      ? 'завершён'
      : 'действий нет';

  function toggleComplete() {
    const completed = milestone.status === 'completed';
    onUpdateGoal((goal) => ({
      ...goal,
      milestones: goal.milestones.map((item) =>
        item.id === milestone.id
          ? { ...item, status: completed ? 'in_progress' : 'completed', completedAt: completed ? null : new Date().toISOString() }
          : item,
      ),
    }));
  }

  function addActionToMilestone() {
    const title = newActionTitle.trim();
    if (!title) return;

    onUpdateGoal((goal) => ({
      ...goal,
      actions: [...goal.actions, createGoalAction({ milestoneId: milestone.id, position: goal.actions.length, title })],
      milestones: goal.milestones.map((item) => (item.id === milestone.id && item.status === 'not_started' ? { ...item, status: 'in_progress' } : item)),
    }));
    setNewActionTitle('');
  }

  function toggleMilestoneAction(actionId: string) {
    onUpdateGoal((goal) => ({
      ...goal,
      actions: goal.actions.map((action) =>
        action.id === actionId
          ? { ...action, status: action.status === 'completed' ? 'pending' : 'completed', completedAt: action.status === 'completed' ? null : new Date().toISOString() }
          : action,
      ),
    }));
  }

  return (
    <View style={local.sectionItem}>
        <Pressable accessibilityRole="button" accessibilityLabel={milestone.title} accessibilityState={{ expanded: open }} aria-expanded={open} onPress={() => setOpen((value) => !value)} style={local.cardHeader}>
        <View style={local.flexText}>
          <Text style={local.actionTitle}>{milestone.title}</Text>
          <Text style={local.goalMeta}>{progress}% · {milestoneMeta}</Text>
        </View>
        <ChevronRight color={muted} size={18} />
      </Pressable>
      <ProgressLine value={progress} />
      {open ? (
        <View style={local.nestedList}>
          {ownActions.length ? (
            ownActions.map((action) => (
              <Pressable key={action.id} onPress={() => toggleMilestoneAction(action.id)} style={local.milestoneActionRow}>
                <Check color={action.status === 'completed' ? accent : muted} size={14} strokeWidth={2.4} />
                <Text style={[local.previewLine, action.status === 'completed' && local.doneText]}>{action.title}</Text>
              </Pressable>
            ))
          ) : (
            <Text style={local.emptyLine}>В этом этапе пока нет действий.</Text>
          )}
          <View style={local.inlineInputRow}>
            <TextInput
              onChangeText={setNewActionTitle}
              onSubmitEditing={addActionToMilestone}
              placeholder="Добавить действие в этап"
              placeholderTextColor={faint}
              style={local.inlineInput}
              value={newActionTitle}
            />
            <Pressable disabled={!newActionTitle.trim()} onPress={addActionToMilestone} style={[local.inlinePlusButton, !newActionTitle.trim() && local.disabledButton]}>
              <Plus color={activeText} size={15} strokeWidth={3} />
            </Pressable>
          </View>
          {progress === 100 && milestone.status !== 'completed' ? <TinyButton label="Завершить этап" onPress={toggleComplete} /> : null}
        </View>
      ) : null}
    </View>
  );
}

function RoutineRow({ goal, routine, onUpdateGoal }: { goal: Goal; routine: GoalRoutine; onUpdateGoal: (recipe: (goal: Goal) => Goal) => void }) {
  const [editOpen, setEditOpen] = useState(false);
  const [timeSheetOpen, setTimeSheetOpen] = useState(false);
  const [valueSheetOpen, setValueSheetOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const value = routineLogValue(goal, routine.id);

  function setTodayValue(nextValue: number) {
    onUpdateGoal((item) => ({ ...item, routineLogs: upsertRoutineLog(item.routineLogs, routine.id, todayDateKey(), nextValue) }));
  }

  return (
    <View style={local.sectionItem}>
      <View style={local.cardHeader}>
        <View style={local.flexText}>
          <Text style={local.actionTitle}>{routine.title}</Text>
          <Text style={local.goalMeta}>{routine.targetValue} {metricLabels[routine.metricType]} · {routineFrequencyLabel(routine)}</Text>
          <Text style={local.goalMeta}>Сегодня: {value} / {routine.targetValue}</Text>
        </View>
        <Pressable onPress={() => setEditOpen(true)} style={local.tinyIconButton}>
          <Pencil color={muted} size={13} />
        </Pressable>
      </View>
      <View style={local.routineControls}>
        {routine.metricType === 'count' ? (
          <>
            {value > 0 ? <InlineAction label="-1" onPress={() => setTodayValue(value - 1)} /> : null}
            <InlineAction label="+1" onPress={() => setTodayValue(value + 1)} />
          </>
        ) : null}
        {routine.metricType === 'minutes' ? <InlineAction label="+ время" onPress={() => setTimeSheetOpen(true)} /> : null}
        {routine.metricType === 'boolean' ? <InlineAction active={value > 0} label={value > 0 ? 'Снять' : 'Готово'} onPress={() => setTodayValue(value > 0 ? 0 : routine.targetValue)} /> : null}
        <InlineAction label="значение" onPress={() => setValueSheetOpen(true)} />
        {value > 0 ? <InlineAction label="сброс" onPress={() => setTodayValue(0)} /> : null}
      </View>
      <TimeAddSheet visible={timeSheetOpen} onClose={() => setTimeSheetOpen(false)} onAdd={(amount) => {
        setTodayValue(value + amount);
        setTimeSheetOpen(false);
      }} />
      <RoutineValueSheet
        metricType={routine.metricType}
        targetValue={routine.targetValue}
        value={value}
        visible={valueSheetOpen}
        onClose={() => setValueSheetOpen(false)}
        onSave={(nextValue) => {
          setTodayValue(nextValue);
          setValueSheetOpen(false);
        }}
      />
      <EditRoutineSheet
        onDelete={() => setDeleteOpen(true)}
        routine={routine}
        visible={editOpen}
        onClose={() => setEditOpen(false)}
        onSave={(nextRoutine) => {
          onUpdateGoal((item) => ({
            ...item,
            routines: item.routines.map((candidate) => (candidate.id === routine.id ? nextRoutine : candidate)),
          }));
          setEditOpen(false);
        }}
      />
      <ConfirmSheet
        destructive
        title="Удалить регулярное действие?"
        text="Само действие и история его выполнения исчезнут."
        visible={deleteOpen}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => {
          onUpdateGoal((item) => ({
            ...item,
            routineLogs: item.routineLogs.filter((log) => log.routineId !== routine.id),
            routines: item.routines.filter((candidate) => candidate.id !== routine.id),
          }));
          setDeleteOpen(false);
          setEditOpen(false);
        }}
      />
    </View>
  );
}

function ActionRow({ action, onToggle }: { action: GoalAction; onToggle: () => void }) {
  const done = action.status === 'completed';
  return (
    <Pressable accessibilityRole="checkbox" accessibilityLabel={action.title} accessibilityState={{checked:done}} aria-checked={done} onPress={onToggle} style={[local.actionRow, done && local.actionRowDone]}>
      <View style={[local.checkCircle, done && local.checkCircleDone]}>{done ? <Check color={activeText} size={13} strokeWidth={3} /> : null}</View>
      <View style={local.flexText}>
        <Text style={[local.actionTitle, done && local.doneText]}>{action.title}</Text>
        {action.dueDate || action.estimatedMinutes ? <Text style={local.goalMeta}>{action.dueDate ? formatDateLong(action.dueDate) : ''}{action.estimatedMinutes ? ` · ${action.estimatedMinutes} мин` : ''}</Text> : null}
      </View>
    </Pressable>
  );
}

function CreateGoalFlow({ open, onClose, onSave }: { open: boolean; onClose: () => void; onSave: (draft: GoalDraft) => void }) {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<GoalDraft>({ title: '', desiredResult: '', deadline: '', priority: 'important' });
  const steps = [
    { title: 'Чего ты хочешь достичь?', placeholder: 'Например, стать Data Analyst', key: 'title' as const },
    { title: 'Как ты поймёшь, что цель достигнута?', placeholder: 'Получил оффер Data Analyst...', key: 'desiredResult' as const },
    { title: 'К какому сроку?', placeholder: '2027-03-01 или оставь пустым', key: 'deadline' as const },
  ];
  const current = steps[step];

  function close() {
    setStep(0);
    setDraft({ title: '', desiredResult: '', deadline: '', priority: 'important' });
    onClose();
  }

  function next() {
    if (step === 0 && !draft.title.trim()) return;
    if (step < 3) {
      setStep((value) => value + 1);
      return;
    }
    onSave(draft);
    close();
  }

  function back() {
    setStep((value) => Math.max(0, value - 1));
  }

  return (
    <Modal animationType="slide" transparent visible={open} onRequestClose={close}>
      <View style={local.modalOverlay}>
        <View style={local.sheet}>
          <View style={local.cardHeader}>
            <Text style={local.sheetTitle}>Новая цель</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть создание цели" onPress={close} style={local.iconButton}><X color={text} size={18} /></Pressable>
          </View>
          {step < 3 && current ? (
            <>
              <Text style={local.prompt}>{current.title}</Text>
              <TextInput
                accessibilityLabel={current.title}
                autoFocus
                inputMode={current.key === 'deadline' ? 'numeric' : 'text'}
                onChangeText={(value) => setDraft((item) => ({ ...item, [current.key]: value }))}
                onSubmitEditing={next}
                placeholder={current.placeholder}
                placeholderTextColor={faint}
                style={local.input}
                value={draft[current.key]}
              />
            </>
          ) : (
            <>
              <Text style={local.prompt}>Насколько эта цель сейчас важна?</Text>
              <View style={local.segmentRow}>
                {(['main', 'important', 'supporting'] as GoalPriority[]).map((priority) => (
                  <Pressable accessibilityRole="button" accessibilityState={{selected:draft.priority===priority}} key={priority} onPress={() => setDraft((item) => ({ ...item, priority }))} style={[local.segment, draft.priority === priority && local.segmentActive]}>
                    <Text style={[local.segmentText, draft.priority === priority && local.segmentTextActive]}>{priorityLabels[priority]}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={local.goalMeta}>Первый этап или действие добавим на странице цели.</Text>
            </>
          )}
          <View style={local.formActions}>
            {step > 0 ? (
              <Pressable accessibilityRole="button" onPress={back} style={local.secondaryButton}>
                <Text style={local.secondaryButtonText}>Назад</Text>
              </Pressable>
            ) : null}
            <Pressable accessibilityRole="button" accessibilityState={{disabled:step===0&&!draft.title.trim()}} disabled={step === 0 && !draft.title.trim()} onPress={next} style={[local.primaryButton, local.formPrimaryButton, step === 0 && !draft.title.trim() && local.disabledButton]}>
              <Text style={local.primaryButtonText}>{step < 3 ? 'Дальше' : 'Создать цель'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddGoalItemSheet({ goal, kind, defaultMilestoneId, onClose, onUpdateGoal }: { goal: Goal; kind: AddKind | null; defaultMilestoneId?: string; onClose: () => void; onUpdateGoal: (recipe: (goal: Goal) => Goal) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [metricType, setMetricType] = useState<GoalRoutineMetricType>('minutes');
  const [frequencyType, setFrequencyType] = useState<GoalRoutineFrequencyType>('daily');
  const [weekdays, setWeekdays] = useState<number[]>(workDays);
  const [targetValue, setTargetValue] = useState('60');
  const milestoneOptions = useMemo(() => goal.milestones, [goal.milestones]);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  useEffect(()=>{ if(kind==='action')setMilestoneId(defaultMilestoneId??null); },[kind,defaultMilestoneId]);

  function reset() {
    setTitle('');
    setDate('');
    setMetricType('minutes');
    setFrequencyType('daily');
    setWeekdays(workDays);
    setTargetValue('60');
    setMilestoneId(null);
    onClose();
  }

  function selectSchedule(kind: 'daily' | 'workdays' | 'weekends' | 'custom' | 'weekly' | 'monthly') {
    if (kind === 'daily' || kind === 'weekly' || kind === 'monthly') {
      setFrequencyType(kind);
      return;
    }

    setFrequencyType('selected_weekdays');
    setWeekdays(kind === 'workdays' ? workDays : kind === 'weekends' ? weekendDays : weekdays.length ? weekdays : [1]);
  }

  function toggleWeekday(day: number) {
    setWeekdays((items) => {
      const next = items.includes(day) ? items.filter((item) => item !== day) : [...items, day].sort((a, b) => a - b);
      return next.length ? next : items;
    });
    setFrequencyType('selected_weekdays');
  }

  function save() {
    const trimmed = title.trim();
    if (!trimmed || !kind) return;
    onUpdateGoal((item) => {
      if (kind === 'milestone') {
        return { ...item, milestones: [...item.milestones, createMilestone(trimmed, '', date, item.milestones.length)] };
      }
      if (kind === 'action') {
        return { ...item, actions: [...item.actions, createGoalAction({ title: trimmed, dueDate: date, milestoneId, position: item.actions.length })] };
      }
      return {
        ...item,
        routines: [
          ...item.routines,
            createGoalRoutine({
              title: trimmed,
              metricType,
              targetValue: Number(targetValue) || 1,
              frequencyType,
              weekdays: frequencyType === 'selected_weekdays' ? weekdays : [],
              startDate: date || todayDateKey(),
            }),
        ],
      };
    });
    reset();
  }

  return (
    <Modal animationType="slide" transparent visible={Boolean(kind)} onRequestClose={reset}>
      <View style={local.modalOverlay}>
        <View style={local.sheet}>
          <View style={local.cardHeader}>
            <Text style={local.sheetTitle}>{kind === 'milestone' ? 'Новый этап' : kind === 'routine' ? 'Регулярное действие' : 'Разовое действие'}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть добавление элемента" onPress={reset} style={local.iconButton}><X color={text} size={18} /></Pressable>
          </View>
          <TextInput autoFocus onChangeText={setTitle} onSubmitEditing={save} placeholder="Название" placeholderTextColor={faint} style={local.input} value={title} />
          <TextInput onChangeText={setDate} placeholder={kind === 'routine' ? 'Дата старта: 2026-07-30' : 'Срок: 2026-07-30'} placeholderTextColor={faint} style={local.input} value={date} />
          {kind === 'action' && milestoneOptions.length ? (
            <View style={[local.segmentRow,{flexWrap:'wrap'}]}>
              <Pressable accessibilityRole="button" accessibilityState={{selected:!milestoneId}} onPress={() => setMilestoneId(null)} style={[local.segment,{flexBasis:110}, !milestoneId && local.segmentActive]}><Text style={[local.segmentText, !milestoneId && local.segmentTextActive]}>без этапа</Text></Pressable>
              {milestoneOptions.map((milestone) => (
                <Pressable key={milestone.id} accessibilityRole="button" accessibilityLabel={`Этап действия: ${milestone.title}`} accessibilityState={{selected:milestoneId===milestone.id}} onPress={() => setMilestoneId(milestone.id)} style={[local.segment,{flexBasis:110}, milestoneId === milestone.id && local.segmentActive]}>
                  <Text numberOfLines={1} style={[local.segmentText, milestoneId === milestone.id && local.segmentTextActive]}>{milestone.title}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {kind === 'routine' ? (
            <>
              <View style={local.segmentRow}>
                {(['boolean', 'minutes', 'count'] as GoalRoutineMetricType[]).map((type) => (
                  <Pressable key={type} onPress={() => setMetricType(type)} style={[local.segment, metricType === type && local.segmentActive]}>
                    <Text style={[local.segmentText, metricType === type && local.segmentTextActive]}>{metricLabels[type]}</Text>
                  </Pressable>
                ))}
              </View>
              <TextInput inputMode="numeric" onChangeText={setTargetValue} placeholder="Цель периода" placeholderTextColor={faint} style={local.input} value={targetValue} />
              <View style={local.segmentRow}>
                <ScheduleButton active={frequencyType === 'daily'} label="каждый день" onPress={() => selectSchedule('daily')} />
                <ScheduleButton active={frequencyType === 'selected_weekdays' && sameDays(weekdays, workDays)} label="будни" onPress={() => selectSchedule('workdays')} />
                <ScheduleButton active={frequencyType === 'selected_weekdays' && sameDays(weekdays, weekendDays)} label="выходные" onPress={() => selectSchedule('weekends')} />
                <ScheduleButton active={frequencyType === 'selected_weekdays' && !sameDays(weekdays, workDays) && !sameDays(weekdays, weekendDays)} label="дни недели" onPress={() => selectSchedule('custom')} />
                <ScheduleButton active={frequencyType === 'weekly'} label="в неделю" onPress={() => selectSchedule('weekly')} />
                <ScheduleButton active={frequencyType === 'monthly'} label="в месяц" onPress={() => selectSchedule('monthly')} />
              </View>
              {frequencyType === 'selected_weekdays' ? <WeekdayPicker selected={weekdays} onToggle={toggleWeekday} /> : null}
            </>
          ) : null}
          <Pressable disabled={!title.trim()} onPress={save} style={[local.primaryButton, !title.trim() && local.disabledButton]}>
            <Text style={local.primaryButtonText}>Добавить</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

function EditRoutineSheet({
  onClose,
  onDelete,
  onSave,
  routine,
  visible,
}: {
  onClose: () => void;
  onDelete: () => void;
  onSave: (routine: GoalRoutine) => void;
  routine: GoalRoutine;
  visible: boolean;
}) {
  const [title, setTitle] = useState(routine.title);
  const [metricType, setMetricType] = useState<GoalRoutineMetricType>(routine.metricType);
  const [frequencyType, setFrequencyType] = useState<GoalRoutineFrequencyType>(routine.frequencyType);
  const [weekdays, setWeekdays] = useState<number[]>(routine.weekdays.length ? routine.weekdays : workDays);
  const [targetValue, setTargetValue] = useState(String(routine.targetValue));

  function selectSchedule(kind: 'daily' | 'workdays' | 'weekends' | 'custom' | 'weekly' | 'monthly') {
    if (kind === 'daily' || kind === 'weekly' || kind === 'monthly') {
      setFrequencyType(kind);
      return;
    }

    setFrequencyType('selected_weekdays');
    setWeekdays(kind === 'workdays' ? workDays : kind === 'weekends' ? weekendDays : weekdays.length ? weekdays : [1]);
  }

  function toggleWeekday(day: number) {
    setWeekdays((items) => {
      const next = items.includes(day) ? items.filter((item) => item !== day) : [...items, day].sort((a, b) => a - b);
      return next.length ? next : items;
    });
    setFrequencyType('selected_weekdays');
  }

  function save() {
    const trimmed = title.trim();
    const parsedTarget = Number(targetValue);
    if (!trimmed || !Number.isFinite(parsedTarget) || parsedTarget <= 0) return;

    onSave({
      ...routine,
      frequencyType,
      metricType,
      targetValue: parsedTarget,
      title: trimmed,
      weekdays: frequencyType === 'selected_weekdays' ? weekdays : [],
    });
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={local.confirmOverlay}>
        <View style={local.confirmCard}>
          <View style={local.cardHeader}>
            <Text style={local.sheetTitle}>Редактировать</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть редактирование" onPress={onClose} style={local.iconButton}><X color={text} size={18} /></Pressable>
          </View>
          <TextInput autoFocus onChangeText={setTitle} onSubmitEditing={save} placeholder="Название" placeholderTextColor={faint} style={local.input} value={title} />
          <View style={local.segmentRow}>
            {(['boolean', 'minutes', 'count'] as GoalRoutineMetricType[]).map((type) => (
              <Pressable key={type} onPress={() => setMetricType(type)} style={[local.segment, metricType === type && local.segmentActive]}>
                <Text style={[local.segmentText, metricType === type && local.segmentTextActive]}>{metricLabels[type]}</Text>
              </Pressable>
            ))}
          </View>
          <TextInput inputMode="numeric" onChangeText={setTargetValue} onSubmitEditing={save} placeholder="Цель периода" placeholderTextColor={faint} style={local.input} value={targetValue} />
          <View style={local.segmentRow}>
            <ScheduleButton active={frequencyType === 'daily'} label="каждый день" onPress={() => selectSchedule('daily')} />
            <ScheduleButton active={frequencyType === 'selected_weekdays' && sameDays(weekdays, workDays)} label="будни" onPress={() => selectSchedule('workdays')} />
            <ScheduleButton active={frequencyType === 'selected_weekdays' && sameDays(weekdays, weekendDays)} label="выходные" onPress={() => selectSchedule('weekends')} />
            <ScheduleButton active={frequencyType === 'selected_weekdays' && !sameDays(weekdays, workDays) && !sameDays(weekdays, weekendDays)} label="дни недели" onPress={() => selectSchedule('custom')} />
            <ScheduleButton active={frequencyType === 'weekly'} label="в неделю" onPress={() => selectSchedule('weekly')} />
            <ScheduleButton active={frequencyType === 'monthly'} label="в месяц" onPress={() => selectSchedule('monthly')} />
          </View>
          {frequencyType === 'selected_weekdays' ? <WeekdayPicker selected={weekdays} onToggle={toggleWeekday} /> : null}
          <View style={local.confirmActions}>
            <Pressable onPress={onDelete} style={[local.secondaryButton, local.deleteOutlineButton]}><Text style={local.deleteOutlineText}>Удалить</Text></Pressable>
            <Pressable onPress={onClose} style={local.secondaryButton}><Text style={local.secondaryButtonText}>Отмена</Text></Pressable>
            <Pressable disabled={!title.trim() || !(Number(targetValue) > 0)} onPress={save} style={[local.primaryButton, (!title.trim() || !(Number(targetValue) > 0)) && local.disabledButton]}>
              <Text style={local.primaryButtonText}>Сохранить</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function TimeAddSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (amount: number) => void }) {
  const [manual, setManual] = useState('');
  const manualAmount = Number(manual);
  const canAddManual = Number.isFinite(manualAmount) && manualAmount > 0;

  function updateManual(value: string) {
    setManual(value.replace(/\D/g, '').slice(0, 4));
  }

  function addManual() {
    if (!canAddManual) return;
    onAdd(manualAmount);
    setManual('');
  }

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={local.modalOverlay}>
        <View style={local.sheet}>
          <Text style={local.sheetTitle}>Добавить время</Text>
          <View style={local.addChoices}>
            {[5, 15, 30].map((amount) => <ChoiceButton key={amount} label={`+${amount} минут`} onPress={() => onAdd(amount)} />)}
          </View>
          <TextInput inputMode="numeric" keyboardType="number-pad" onChangeText={updateManual} onSubmitEditing={addManual} placeholder="Вручную, минут" placeholderTextColor={faint} style={local.input} value={manual} />
          <Pressable disabled={!canAddManual} onPress={addManual} style={[local.primaryButton, !canAddManual && local.disabledButton]}><Text style={local.primaryButtonText}>Добавить</Text></Pressable>
        </View>
      </View>
    </Modal>
  );
}

function RoutineValueSheet({
  metricType,
  onClose,
  onSave,
  targetValue,
  value,
  visible,
}: {
  metricType: GoalRoutineMetricType;
  onClose: () => void;
  onSave: (value: number) => void;
  targetValue: number;
  value: number;
  visible: boolean;
}) {
  const [draft, setDraft] = useState(String(value));
  const parsed = Number(draft);
  const canSave = Number.isFinite(parsed) && parsed >= 0;

  function updateDraft(nextValue: string) {
    setDraft(nextValue.replace(/\D/g, '').slice(0, 5));
  }

  function save() {
    if (!canSave) return;
    onSave(parsed);
  }

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={local.confirmOverlay}>
        <View style={local.confirmCard}>
          <View style={local.cardHeader}>
            <Text style={local.sheetTitle}>Значение сегодня</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Закрыть ввод значения" onPress={onClose} style={local.iconButton}><X color={text} size={18} /></Pressable>
          </View>
          <Text style={local.goalMeta}>Можно поставить 0 или любое текущее значение. Цель: {targetValue} {metricType === 'minutes' ? 'минут' : metricType === 'count' ? 'шт' : 'раз'}.</Text>
          <TextInput autoFocus inputMode="numeric" keyboardType="number-pad" onChangeText={updateDraft} onSubmitEditing={save} placeholder="0" placeholderTextColor={faint} style={local.input} value={draft} />
          <View style={local.confirmActions}>
            <Pressable onPress={onClose} style={local.secondaryButton}><Text style={local.secondaryButtonText}>Отмена</Text></Pressable>
            <Pressable disabled={!canSave} onPress={save} style={[local.primaryButton, !canSave && local.disabledButton]}><Text style={local.primaryButtonText}>Сохранить</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ScheduleButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[local.segment, local.scheduleSegment, active && local.segmentActive]}>
      <Text style={[local.segmentText, active && local.segmentTextActive]}>{label}</Text>
    </Pressable>
  );
}

function WeekdayPicker({ selected, onToggle }: { selected: number[]; onToggle: (day: number) => void }) {
  return (
    <View style={local.weekdayRow}>
      {weekDays.map((day) => {
        const active = selected.includes(day.value);
        return (
          <Pressable key={day.value} onPress={() => onToggle(day.value)} style={[local.weekdayButton, active && local.weekdayButtonActive]}>
            <Text style={[local.weekdayText, active && local.weekdayTextActive]}>{day.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function sameDays(first: number[], second: number[]) {
  return first.length === second.length && [...first].sort().every((day, index) => day === [...second].sort()[index]);
}

function routineFrequencyLabel(routine: GoalRoutine) {
  if (routine.frequencyType !== 'selected_weekdays') return frequencyLabels[routine.frequencyType];
  if (sameDays(routine.weekdays, workDays)) return 'будни';
  if (sameDays(routine.weekdays, weekendDays)) return 'выходные';
  return routine.weekdays
    .map((day) => weekDays.find((item) => item.value === day)?.label)
    .filter(Boolean)
    .join(', ') || frequencyLabels.selected_weekdays;
}

function SectionBlock({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  return (
    <View style={local.block}>
      {title ? <Text style={local.blockTitle}>{title}</Text> : null}
      {empty ? <EmptyLine text={empty} /> : children}
    </View>
  );
}

function ConfirmSheet({ title, text: body, visible, onCancel, onConfirm, destructive }: { title: string; text: string; visible: boolean; onCancel: () => void; onConfirm: () => void; destructive?: boolean }) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={local.confirmOverlay}>
        <View style={local.confirmCard}>
          <Text style={local.sheetTitle}>{title}</Text>
          <Text style={local.goalMeta}>{body}</Text>
          <View style={local.confirmActions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Отмена" onPress={onCancel} style={local.secondaryButton}><Text style={local.secondaryButtonText}>Отмена</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel={destructive ? 'Удалить цель' : 'Подтвердить'} onPress={onConfirm} style={[local.primaryButton, destructive && local.dangerButton]}><Text style={local.primaryButtonText}>Подтвердить</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function toggleAction(goal: Goal, actionId: string, updateGoal: (recipe: (goal: Goal) => Goal) => void) {
  updateGoal((item) => ({
    ...item,
    actions: item.actions.map((action) =>
      action.id === actionId
        ? { ...action, status: action.status === 'completed' ? 'pending' : 'completed', completedAt: action.status === 'completed' ? null : new Date().toISOString() }
        : action,
    ),
    milestones: item.milestones.map((milestone) => {
      const actions = item.actions.map((action) =>
        action.id === actionId
          ? { ...action, status: action.status === 'completed' ? 'pending' : 'completed' }
          : action,
      );
      const own = actions.filter((action) => action.milestoneId === milestone.id && !action.archivedAt);
      if (!own.length || milestone.status === 'completed') return milestone;
      return { ...milestone, status: own.some((action) => action.status === 'completed') ? 'in_progress' : 'not_started' };
    }),
  }));
}

function EmptyLine({ text: value }: { text: string }) {
  return <Text style={local.emptyLine}>{value}</Text>;
}

function ChoiceButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={local.choiceButton}><Text style={local.choiceText}>{label}</Text></Pressable>;
}

function TinyButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={local.tinyButton}><Text style={local.tinyButtonText}>{label}</Text></Pressable>;
}

function InlineAction({ active, label, onPress }: { active?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ selected: active }} onPress={onPress} style={local.inlineAction}>
      <Text style={[local.inlineActionText, active && local.inlineActionTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MenuButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={local.menuButton}>
      {danger ? <Trash2 color="#ff4d4d" size={14} /> : null}
      <Text style={[local.menuButtonText, danger && local.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  detailPage: { alignSelf: 'center', gap: 12, maxWidth: 960, padding: 20, paddingTop: 0, width: '100%' },
  pageContent: { alignSelf: 'center', gap: 16, maxWidth: 960, padding: 20, width: '100%' },
  goalSummary: { gap: 12 },
  goalHeroGrid: { alignItems: 'flex-start' },
  goalHeroGridMobile: { flexDirection: 'row', flexWrap: 'wrap' },
  goalHeroMobile: { minHeight: 0, width: '100%', maxWidth: '100%', flexBasis: '100%', flexShrink: 1 },
  factPanel: { alignSelf: 'flex-start', minHeight: 120, padding: 14, width: '100%' },
  factPanelMobile: { minHeight: 100, width: '100%' },
  factGrid: { alignContent: 'center', alignItems: 'center', columnGap: 8, flexDirection: 'row', flexWrap: 'wrap', rowGap: 6 },
  factCell: { flexBasis: '47%', flexGrow: 1, gap: 2, minWidth: 0 },
  factLabel: { color: muted, fontSize: 12, lineHeight: 17 },
  factValue: { color: text, fontSize: 15, fontWeight: '600', lineHeight: 20 },
  scrollContent: { gap: 10, paddingBottom: 90 },
  overviewWrap: { alignSelf: 'center', flex: 1, gap: 16, justifyContent: 'center', maxWidth: 640, paddingHorizontal: 16, width: '100%' },
  overviewCard: { gap: 14 },
  overviewStats: { flexDirection: 'row', gap: 28 },
  overviewValue: { color: text, fontSize: 24, fontWeight: '600', lineHeight: 30 },
  overviewGoalRow: { alignItems: 'center', borderTopColor: line, borderTopWidth: 1, flexDirection: 'row', gap: 12, minHeight: 56, paddingTop: 8 },
  overviewProgress: { color: text, fontSize: 16, fontWeight: '600' },
  overviewActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  overviewTextButton: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  desktopScrollContent: { paddingBottom: 36, width: '100%' },
  desktopLayout: { alignItems: 'flex-start', flexDirection: 'row', gap: 0, width: '100%' },
  desktopDetailsLayout: { alignItems: 'flex-start', flexDirection: 'row', gap: 0, width: '100%' },
  desktopMainColumn: { flex: 1, gap: 12, minWidth: 0, maxWidth: 1080, marginRight: 'auto' },
  desktopAside: { borderLeftColor: line, borderLeftWidth: 1, flexShrink: 0, gap: 12, paddingLeft: 20, width: 282 },
  goalNavigation: { borderBottomColor: line, borderBottomWidth: 1, gap: 4, paddingBottom: 12 },
  navigationHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 34 },
  navigationAdd: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  navigationRow: { alignItems: 'center', borderLeftColor: 'transparent', borderLeftWidth: 2, borderRadius: 5, flexDirection: 'row', gap: 8, minHeight: 38, paddingHorizontal: 9 },
  navigationRowActive: { backgroundColor: accentFaint, borderLeftColor: accent },
  navigationText: { color: text, flex: 1, fontSize: 13, lineHeight: 18 },
  navigationTextActive: { color: accent, fontWeight: '700' },
  desktopGoalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  goalGrid: { alignItems: 'stretch' },
  emptyComposition: { gap: 12 },
  goalCardShell: { minWidth: 0 },
  desktopInfoCard: { gap: 10, padding: 4 },
  divider: { backgroundColor: line, height: 1, marginVertical: 2 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  roundAccentButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 999, height: 44, justifyContent: 'center', width: 44 },
  goalCard: { gap: 12, padding: 16 },
  goalCardDesktop: { flexBasis: 320, flexGrow: 1, minHeight: 148, padding: 20 },
  goalCardDesktopFeatured: { flexBasis: '100%' },
  goalCardFeatured: {},
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  flexText: { flex: 1, minWidth: 0 },
  goalTitle: { color: text, fontSize: 16, lineHeight: 22 },
  detailsTitle: { color: text, flex: 1, fontSize: 18, lineHeight: 24 },
  goalMeta: { color: muted, fontSize: 12, lineHeight: 17 },
  progressNumber: { color: text, fontSize: 22, fontWeight: '300' },
  todayPreview: { borderTopColor: 'rgba(23,32,24,0.16)', borderTopWidth: 1, gap: 5, paddingTop: 9 },
  miniLabel: { color: text, fontSize: 12, fontWeight: '700', lineHeight: 15 },
  previewLine: { color: text, fontSize: 13, lineHeight: 18 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  statusPill: { color: accent, fontSize: 12 },
  empty: { alignItems: 'flex-start', borderColor: line, borderRadius: 12, borderWidth: 1, gap: 10, padding: 16 },
  emptyTitle: { color: text, fontSize: 20, lineHeight: 26 },
  emptyText: { color: muted, fontSize: 13, lineHeight: 19 },
  exampleRoadmap: { alignSelf: 'stretch', backgroundColor: panelSoft, borderColor: line, borderRadius: 16, borderWidth: 1, gap: 8, padding: 12 },
  exampleRoadmapLabel: { color: muted, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  exampleRoadmapStep: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 30 },
  exampleRoadmapNumber: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 99, color: activeText, fontSize: 12, fontWeight: '700', height: 24, lineHeight: 24, textAlign: 'center', width: 24 },
  exampleRoadmapText: { color: text, flex: 1, fontSize: 13, lineHeight: 18 },
  primaryButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 48, paddingHorizontal: 16 },
  legacyFormButton: { alignSelf: 'flex-start', borderColor: line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 40, paddingHorizontal: 12 },
  primaryButtonText: { color: activeText, fontSize: 13, fontWeight: '700' },
  formActions: { flexDirection: 'row', gap: 8 },
  formPrimaryButton: { flex: 1 },
  disabledButton: { opacity: 0.4 },
  detailsHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingBottom: 8 },
  iconButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  inlineMenu: { borderColor: line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, padding: 8 },
  menuButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 34, paddingHorizontal: 10 },
  menuButtonText: { color: text, fontSize: 12 },
  dangerText: { color: '#ff4d4d' },
  summary: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  summaryText: { flex: 1, gap: 3 },
  block: { gap: 12 },
  blockTitle: { color: text, fontSize: 19, fontWeight: '700', lineHeight: 25, marginTop: 4 },
  detailTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginVertical: 6 },
  detailTab: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
  detailTabActive: { backgroundColor: activeBg, borderColor: activeBg },
  detailTabText: { color: muted, fontSize: 12, fontWeight: '600' },
  detailTabTextActive: { color: activeText, fontWeight: '700' },
  tabContent: { gap: 16 },
  blockHeadingRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  roadmapButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 999, justifyContent: 'center', minHeight: 42, paddingHorizontal: 14 },
  roadmapButtonText: { color: activeText, fontSize: 12, fontWeight: '700' },
  directionLink: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 },
  directionLinkText: { color: accent, fontSize: 12, fontWeight: '700' },
  roadmapActions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 7, maxWidth: '100%', minWidth: 0, flexShrink: 1 },
  roadmapOutlineButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 42, paddingHorizontal: 13 },
  roadmapOutlineText: { color: accent, fontSize: 12, fontWeight: '700' },
  stageEditor: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 14, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 },
  stageInput: { backgroundColor: panel, borderColor: line, borderRadius: 10, borderWidth: 1, color: text, flex: 1, fontSize: 14, minHeight: 44, minWidth: 160, paddingHorizontal: 12 },
  stageSave: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 999, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  stageSaveText: { color: activeText, fontSize: 12, fontWeight: '700' },
  stageCancel: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 },
  stageCancelText: { color: muted, fontSize: 12, lineHeight: 17 },
  stageDisabled: { opacity: 0.45 },
  managedMilestone: { gap: 8 },
  stageTools: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  stageStatusRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  stageToolsLabel: { color: muted, fontSize: 12, fontWeight: '600', lineHeight: 18, paddingVertical: 6 },
  stageToolButtons: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stageToolButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  stageToolText: { color: accent, fontSize: 18, fontWeight: '700' },
  statusChoice: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 11 },
  statusChoiceActive: { backgroundColor: accentFaint, borderColor: accent },
  statusChoiceText: { color: muted, fontSize: 11, fontWeight: '600' },
  statusChoiceTextActive: { color: accent },
  removeStageNote: { alignItems: 'center', backgroundColor: panelSoft, borderRadius: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', padding: 10 },
  removeStageButton: { alignItems: 'center', backgroundColor: '#f8e7e0', borderRadius: 999, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 },
  removeStageText: { color: '#783d2c', fontSize: 12, fontWeight: '700' },
  currentStep: { backgroundColor: panelSoft, borderColor: line, borderRadius: 16, borderWidth: 1, gap: 8, padding: 12 },
  currentStepLine: { gap: 3 },
  currentStepAction: { alignSelf: 'stretch', justifyContent: 'center', minHeight: 44 },
  currentStepLabel: { color: muted, fontSize: 12, lineHeight: 16 },
  currentStepValue: { color: text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  roadmapEmptyTitle: { color: text, fontSize: 17, fontWeight: '600', lineHeight: 23 },
  roadmapEmptyHint: { color: muted, fontSize: 12, lineHeight: 17, paddingTop: 3 },
  roadmapTrack:{backgroundColor:panel,borderRadius:24,padding:18,gap:12,borderWidth:1,borderColor:line},
  contextInput: { backgroundColor: panel, borderColor: line, borderRadius: 18, borderWidth: 1, color: text, fontSize: 14, lineHeight: 21, minHeight: 120, padding: 14, textAlignVertical: 'top' },
  contextAnswer: { backgroundColor: panel, borderColor: line, borderRadius: 18, borderWidth: 1, gap: 10, padding: 14 },
  contextQuestion: { color: text, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  contextAnswerInput: { backgroundColor: panelSoft, borderColor: line, borderRadius: 14, borderWidth: 1, color: text, fontSize: 14, lineHeight: 20, minHeight: 72, padding: 12, textAlignVertical: 'top' },
  compactList: { gap: 7 },
  todayRow: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 50, paddingHorizontal: 10 },
  sectionItem: { backgroundColor: panelSoft, borderColor: line, borderRadius: 12, borderWidth: 1, gap: 8, padding: 10 },
  nestedList: { borderTopColor: line, borderTopWidth: 1, gap: 7, paddingTop: 8 },
  milestoneActionRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 28 },
  inlineInputRow: { alignItems: 'center', borderColor: line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 38, paddingHorizontal: 10 },
  inlineInput: { color: text, flex: 1, fontSize: 13, minHeight: 34, padding: 0 },
  inlinePlusButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 999, height: 32, justifyContent: 'center', width: 32 },
  actionRow: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 46, paddingHorizontal: 10 },
  actionRowDone: { opacity: 0.62 },
  checkCircle: { alignItems: 'center', borderColor: muted, borderRadius: 999, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  checkCircleDone: { backgroundColor: activeBg, borderColor: activeBg },
  actionTitle: { color: text, fontSize: 14, lineHeight: 19 },
  doneText: { color: muted, textDecorationLine: 'line-through' },
  addSelector: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 34 },
  addSelectorText: { color: accent, fontSize: 13 },
  addChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 13 },
  choiceText: { color: text, fontSize: 12 },
  tinyButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, minHeight: 34, justifyContent: 'center', paddingHorizontal: 9 },
  tinyButtonText: { color: accent, fontSize: 12 },
  tinyIconButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  todayEditButton: { alignItems: 'center', height: 30, justifyContent: 'center', width: 24 },
  routineControls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' },
  inlineAction: { borderBottomColor: accentBorder, borderBottomWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 2 },
  inlineActionText: { color: accent, fontSize: 12, lineHeight: 15 },
  inlineActionTextActive: { color: text },
  emptyLine: { color: muted, fontSize: 13, lineHeight: 18, paddingVertical: 8 },
  modalOverlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  confirmOverlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  sheet: { backgroundColor: panelSoft, borderColor: line, borderRadius: 10, borderWidth: 1, gap: 12, maxWidth: 430, padding: 14, width: '100%' },
  confirmCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 10, borderWidth: 1, gap: 14, maxWidth: 420, padding: 16, width: '100%' },
  sheetTitle: { color: text, fontSize: 19, lineHeight: 25 },
  prompt: { color: text, fontSize: 16, lineHeight: 22 },
  input: { borderColor: line, borderRadius: 12, borderWidth: 1, color: text, fontSize: 16, minHeight: 44, paddingHorizontal: 11 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  segment: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, flexGrow: 1, minHeight: 38, justifyContent: 'center', paddingHorizontal: 10 },
  scheduleSegment: { flexBasis: '30%' },
  segmentActive: { backgroundColor: activeBg, borderColor: activeBg },
  segmentText: { color: muted, fontSize: 12 },
  segmentTextActive: { color: activeText, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  weekdayButton: { alignItems: 'center', borderColor: line, borderRadius: 12, borderWidth: 1, flex: 1, minHeight: 38, justifyContent: 'center' },
  weekdayButtonActive: { backgroundColor: activeBg, borderColor: activeBg },
  weekdayText: { color: muted, fontSize: 12 },
  weekdayTextActive: { color: activeText, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: line, borderRadius: 12, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  secondaryButtonText: { color: text, fontSize: 13 },
  deleteOutlineButton: { borderColor: accentBorder, marginRight: 'auto' },
  deleteOutlineText: { color: '#ff4d4d', fontSize: 13 },
  confirmActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  dangerButton: { backgroundColor: '#ff4d4d' },
});
