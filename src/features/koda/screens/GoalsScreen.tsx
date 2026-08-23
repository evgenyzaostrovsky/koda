import { ArrowLeft, Check, ChevronRight, MoreHorizontal, Pencil, Plus, Trash2, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
import { ProgressLine, SectionTitle } from '../components';
import { accent, accentBorder, accentFaint, faint, line, muted, panel, panelSoft, text } from '../theme';

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

export function GoalsScreen({ goals, onGoalsChange, isDesktop = false, isOnline }: { goals: Goal[]; onGoalsChange: GoalsChange; isDesktop?: boolean; isOnline: boolean }) {
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(() => goals.find((goal) => goal.status === 'active' || goal.status === 'paused')?.id ?? null);
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmMainGoal, setConfirmMainGoal] = useState<GoalDraft | null>(null);

  const visibleGoals = goals.filter((goal) => goal.status === 'active' || goal.status === 'paused');
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

  function saveGoal(draft: GoalDraft) {
    const nextGoal = createGoal(draft);
    if (draft.priority === 'main' && goals.some((goal) => goal.priority === 'main' && goal.status === 'active')) {
      setConfirmMainGoal(draft);
      return;
    }

    onGoalsChange((items) => [nextGoal, ...items]);
    setSelectedGoalId(nextGoal.id);
  }

  function confirmMainGoalSave() {
    if (!confirmMainGoal) return;
    const nextGoal = createGoal(confirmMainGoal);
    onGoalsChange((items) => [nextGoal, ...nextGoalPriorityGoals(items, nextGoal)]);
    setConfirmMainGoal(null);
    setSelectedGoalId(nextGoal.id);
  }

  if (selectedGoal) {
    return (
      <>
        <GoalDetails goal={selectedGoal} goals={sortedGoals} isDesktop={isDesktop} isOnline={isOnline} onBack={() => setSelectedGoalId(null)} onCreate={() => setCreateOpen(true)} onGoalsChange={onGoalsChange} onSelect={setSelectedGoalId} />
        <CreateGoalFlow open={createOpen} onClose={() => setCreateOpen(false)} onSave={saveGoal} />
      </>
    );
  }

  return (
    <View style={local.screen}>
      <View style={local.topRow}>
        <SectionTitle title="Цели" subtitle={isOnline ? 'Синхронизируется с аккаунтом' : 'Офлайн: изменения сохранятся локально'} />
        <Pressable onPress={() => setCreateOpen(true)} style={local.roundAccentButton}>
          <Plus color={panel} size={20} strokeWidth={3} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[local.scrollContent, isDesktop && local.desktopScrollContent]} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false}>
        <View style={isDesktop ? local.desktopLayout : undefined}>
          <View style={isDesktop ? local.desktopMainColumn : undefined}>
            {!sortedGoals.length ? (
              <View style={local.empty}>
                <Text style={local.emptyTitle}>Куда ты хочешь прийти?</Text>
                <Text style={local.emptyText}>Создай первую цель и добавь действия, которые будут двигать тебя к ней.</Text>
                <Pressable onPress={() => setCreateOpen(true)} style={local.primaryButton}>
                  <Text style={local.primaryButtonText}>Создать цель</Text>
                </Pressable>
              </View>
            ) : (
              <View style={isDesktop ? local.desktopGoalGrid : undefined}>
                {sortedGoals.map((goal, index) => (
                  <GoalCard key={goal.id} desktop={isDesktop} goal={goal} featured={index === 0 && goal.priority === 'main'} onPress={() => setSelectedGoalId(goal.id)} />
                ))}
              </View>
            )}
          </View>
          {isDesktop ? (
            <View style={local.desktopAside}>
              <View style={local.desktopInfoCard}>
                <Text style={local.blockTitle}>Сводка</Text>
                <Text style={local.progressNumber}>{averageProgress}%</Text>
                <Text style={local.goalMeta}>Средний прогресс активных целей</Text>
                <View style={local.divider} />
                <Text style={local.progressNumber}>{activeGoals.length}</Text>
                <Text style={local.goalMeta}>активных целей</Text>
              </View>
              <View style={local.desktopInfoCard}>
                <Text style={local.blockTitle}>Ближайшие действия</Text>
                {todayCandidates.slice(0, 5).map((item) => <Text key={item} style={local.previewLine}>{item}</Text>)}
                {!todayCandidates.length ? <Text style={local.goalMeta}>На сегодня действий по целям нет.</Text> : null}
              </View>
              <View style={local.desktopInfoCard}>
                <Text style={local.blockTitle}>Без следующего шага</Text>
                {activeGoals.filter((goal) => !goal.actions.some((action) => action.status !== 'completed')).slice(0, 4).map((goal) => (
                  <Text key={goal.id} style={local.previewLine}>{goal.title}</Text>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <CreateGoalFlow open={createOpen} onClose={() => setCreateOpen(false)} onSave={saveGoal} />
      <ConfirmSheet
        title="Сделать цель главной?"
        text="Предыдущая главная цель станет важной. Одновременно активной главной может быть только одна."
        visible={Boolean(confirmMainGoal)}
        onCancel={() => setConfirmMainGoal(null)}
        onConfirm={confirmMainGoalSave}
      />
    </View>
  );
}

function GoalCard({ desktop, goal, featured, onPress }: { desktop?: boolean; goal: Goal; featured: boolean; onPress: () => void }) {
  const progress = calculateGoalProgress(goal);
  const today = todayActionCandidates(goal);
  const standaloneActions = goal.actions.filter((action) => !action.milestoneId).sort(sortGoalActions);
  const nextAction = today.actions[0] ?? goal.actions.filter((action) => action.status !== 'completed').sort(sortGoalActions)[0];

  return (
    <Pressable onPress={onPress} style={[local.goalCard, desktop && local.goalCardDesktop, featured && local.goalCardFeatured, desktop && featured && local.goalCardDesktopFeatured]}>
      <View style={local.cardHeader}>
        <View style={local.flexText}>
          <Text style={local.goalTitle}>{goal.title}</Text>
          <Text style={local.goalMeta}>{goal.desiredResult || `Цель ${goalDeadlineLabel(goal.deadline)}`}</Text>
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
  );
}

function GoalDetails({ goal, goals, isDesktop = false, isOnline, onBack, onCreate, onGoalsChange, onSelect }: { goal: Goal; goals: Goal[]; isDesktop?: boolean; isOnline: boolean; onBack: () => void; onCreate: () => void; onGoalsChange: GoalsChange; onSelect: (id: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [addKind, setAddKind] = useState<AddKind | null>(null);
  const [deleteGoalOpen, setDeleteGoalOpen] = useState(false);
  const progress = calculateGoalProgress(goal);
  const today = todayActionCandidates(goal);
  const standaloneActions = goal.actions.filter((action) => !action.milestoneId).sort(sortGoalActions);

  function updateGoal(recipe: (goal: Goal) => Goal) {
    onGoalsChange((items) => items.map((item) => (item.id === goal.id ? { ...recipe(item), updatedAt: new Date().toISOString() } : item)));
  }

  function deleteGoal() {
    onGoalsChange((items) => items.filter((item) => item.id !== goal.id));
    setDeleteGoalOpen(false);
    onBack();
  }

  return (
    <View style={local.screen}>
      <View style={local.detailsHeader}>
        <Pressable onPress={onBack} style={local.iconButton}>
          <ArrowLeft color={text} size={19} />
        </Pressable>
        <Text numberOfLines={2} style={local.detailsTitle}>{goal.title}</Text>
        <Pressable onPress={() => setMenuOpen((value) => !value)} style={local.iconButton}>
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
            <View style={local.summary}>
              <View style={local.summaryText}>
                <Text style={local.goalMeta}>{goal.desiredResult || 'Результат пока не задан'}</Text>
                <Text style={local.goalMeta}>{goal.deadline ? `Срок: ${formatDateLong(goal.deadline)}` : 'Без срока'} · {priorityLabels[goal.priority]} · {isOnline ? 'онлайн' : 'офлайн'}</Text>
              </View>
              <Text style={local.progressNumber}>{progress}%</Text>
            </View>
            <ProgressLine value={progress} />

            <Text style={local.blockTitle}>Сегодня</Text>
            <View style={local.compactList}>
              {!today.routines.length && !today.actions.length ? <EmptyLine text="На сегодня нет обязательных действий." /> : null}
              {today.routines.map((routine) => (
                <RoutineTodayRow key={routine.id} goal={goal} routine={routine} onUpdateGoal={updateGoal} />
              ))}
              {today.actions.map((action) => (
                <ActionRow key={action.id} action={action} onToggle={() => toggleAction(goal, action.id, updateGoal)} />
              ))}
            </View>

            <SectionBlock title="Этапы" empty={!goal.milestones.length ? 'Этапы пока не добавлены.' : ''}>
              {goal.milestones.sort((a, b) => a.position - b.position).map((milestone) => (
                <MilestoneItem key={milestone.id} milestone={milestone} actions={goal.actions} onUpdateGoal={updateGoal} />
              ))}
            </SectionBlock>
          </View>
          <View style={isDesktop ? local.desktopAside : undefined} testID={isDesktop ? 'desktop-right-column' : undefined}>
            {isDesktop ? (
              <View style={local.goalNavigation}>
                <View style={local.navigationHeader}>
                  <Text style={local.blockTitle}>Цели</Text>
                  <Pressable onPress={onCreate} style={local.navigationAdd}><Plus color={accent} size={16} /></Pressable>
                </View>
                {goals.map((item) => (
                  <Pressable key={item.id} onPress={() => onSelect(item.id)} style={[local.navigationRow, item.id === goal.id && local.navigationRowActive]}>
                    <Text numberOfLines={1} style={[local.navigationText, item.id === goal.id && local.navigationTextActive]}>{item.title}</Text>
                    <Text style={local.goalMeta}>{calculateGoalProgress(item)}%</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            <SectionBlock title="Регулярные действия" empty={!goal.routines.length ? 'Регулярные действия пока не добавлены.' : ''}>
              {goal.routines.map((routine) => (
                <RoutineRow key={routine.id} goal={goal} routine={routine} onUpdateGoal={updateGoal} />
              ))}
            </SectionBlock>

            <SectionBlock title="Разовые действия" empty={!standaloneActions.length ? 'Разовые действия пока не добавлены.' : ''}>
              {standaloneActions.map((action) => (
                <ActionRow key={action.id} action={action} onToggle={() => toggleAction(goal, action.id, updateGoal)} />
              ))}
            </SectionBlock>

            <Pressable onPress={() => setAddKind(null)} style={local.addSelector}>
              <Plus color={accent} size={18} />
              <Text style={local.addSelectorText}>Добавить</Text>
            </Pressable>
            <View style={local.addChoices}>
              <ChoiceButton label="Этап" onPress={() => setAddKind('milestone')} />
              <ChoiceButton label="Разовое" onPress={() => setAddKind('action')} />
              <ChoiceButton label="Регулярное" onPress={() => setAddKind('routine')} />
            </View>
          </View>
        </View>
      </ScrollView>

      <AddGoalItemSheet goal={goal} kind={addKind} onClose={() => setAddKind(null)} onUpdateGoal={updateGoal} />
      <ConfirmSheet title="Удалить цель?" text="Все этапы, действия и история выполнения этой цели исчезнут." visible={deleteGoalOpen} onCancel={() => setDeleteGoalOpen(false)} onConfirm={deleteGoal} destructive />
    </View>
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
  const ownActions = actions.filter((action) => action.milestoneId === milestone.id).sort(sortGoalActions);
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
      <Pressable onPress={() => setOpen((value) => !value)} style={local.cardHeader}>
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
              <Plus color={panel} size={15} strokeWidth={3} />
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
    <Pressable onPress={onToggle} style={[local.actionRow, done && local.actionRowDone]}>
      <View style={[local.checkCircle, done && local.checkCircleDone]}>{done ? <Check color={panel} size={13} strokeWidth={3} /> : null}</View>
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
            <Pressable onPress={close} style={local.iconButton}><X color={text} size={18} /></Pressable>
          </View>
          {step < 3 && current ? (
            <>
              <Text style={local.prompt}>{current.title}</Text>
              <TextInput
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
                  <Pressable key={priority} onPress={() => setDraft((item) => ({ ...item, priority }))} style={[local.segment, draft.priority === priority && local.segmentActive]}>
                    <Text style={[local.segmentText, draft.priority === priority && local.segmentTextActive]}>{priorityLabels[priority]}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={local.goalMeta}>Первый этап или действие добавим на странице цели.</Text>
            </>
          )}
          <View style={local.formActions}>
            {step > 0 ? (
              <Pressable onPress={back} style={local.secondaryButton}>
                <Text style={local.secondaryButtonText}>Назад</Text>
              </Pressable>
            ) : null}
            <Pressable disabled={step === 0 && !draft.title.trim()} onPress={next} style={[local.primaryButton, local.formPrimaryButton, step === 0 && !draft.title.trim() && local.disabledButton]}>
              <Text style={local.primaryButtonText}>{step < 3 ? 'Дальше' : 'Создать цель'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function AddGoalItemSheet({ goal, kind, onClose, onUpdateGoal }: { goal: Goal; kind: AddKind | null; onClose: () => void; onUpdateGoal: (recipe: (goal: Goal) => Goal) => void }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [metricType, setMetricType] = useState<GoalRoutineMetricType>('minutes');
  const [frequencyType, setFrequencyType] = useState<GoalRoutineFrequencyType>('daily');
  const [weekdays, setWeekdays] = useState<number[]>(workDays);
  const [targetValue, setTargetValue] = useState('60');
  const milestoneOptions = useMemo(() => goal.milestones, [goal.milestones]);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);

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
            <Pressable onPress={reset} style={local.iconButton}><X color={text} size={18} /></Pressable>
          </View>
          <TextInput autoFocus onChangeText={setTitle} onSubmitEditing={save} placeholder="Название" placeholderTextColor={faint} style={local.input} value={title} />
          <TextInput onChangeText={setDate} placeholder={kind === 'routine' ? 'Дата старта: 2026-07-30' : 'Срок: 2026-07-30'} placeholderTextColor={faint} style={local.input} value={date} />
          {kind === 'action' && milestoneOptions.length ? (
            <View style={local.segmentRow}>
              <Pressable onPress={() => setMilestoneId(null)} style={[local.segment, !milestoneId && local.segmentActive]}><Text style={[local.segmentText, !milestoneId && local.segmentTextActive]}>без этапа</Text></Pressable>
              {milestoneOptions.slice(0, 2).map((milestone) => (
                <Pressable key={milestone.id} onPress={() => setMilestoneId(milestone.id)} style={[local.segment, milestoneId === milestone.id && local.segmentActive]}>
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
            <Pressable onPress={onClose} style={local.iconButton}><X color={text} size={18} /></Pressable>
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
            <Pressable onPress={onClose} style={local.iconButton}><X color={text} size={18} /></Pressable>
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
      <Text style={local.blockTitle}>{title}</Text>
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
            <Pressable onPress={onCancel} style={local.secondaryButton}><Text style={local.secondaryButtonText}>Отмена</Text></Pressable>
            <Pressable onPress={onConfirm} style={[local.primaryButton, destructive && local.dangerButton]}><Text style={local.primaryButtonText}>Подтвердить</Text></Pressable>
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
      const own = actions.filter((action) => action.milestoneId === milestone.id);
      if (!own.length || milestone.status === 'completed') return milestone;
      return { ...milestone, status: own.some((action) => action.status === 'completed') ? 'in_progress' : 'not_started' };
    }),
  }));
}

function EmptyLine({ text: value }: { text: string }) {
  return <Text style={local.emptyLine}>{value}</Text>;
}

function ChoiceButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={local.choiceButton}><Text style={local.choiceText}>{label}</Text></Pressable>;
}

function TinyButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={local.tinyButton}><Text style={local.tinyButtonText}>{label}</Text></Pressable>;
}

function InlineAction({ active, label, onPress }: { active?: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={local.inlineAction}>
      <Text style={[local.inlineActionText, active && local.inlineActionTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MenuButton({ label, onPress, danger }: { label: string; onPress: () => void; danger?: boolean }) {
  return (
    <Pressable onPress={onPress} style={local.menuButton}>
      {danger ? <Trash2 color="#ff4d4d" size={14} /> : null}
      <Text style={[local.menuButtonText, danger && local.dangerText]}>{label}</Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scrollContent: { gap: 10, paddingBottom: 90 },
  desktopScrollContent: { paddingBottom: 36, width: '100%' },
  desktopLayout: { alignItems: 'flex-start', flexDirection: 'row', gap: 24, width: '100%' },
  desktopDetailsLayout: { alignItems: 'flex-start', flexDirection: 'row', gap: 24, width: '100%' },
  desktopMainColumn: { flex: 1, gap: 12, minWidth: 0 },
  desktopAside: { borderLeftColor: line, borderLeftWidth: 1, flexShrink: 0, gap: 12, paddingLeft: 20, width: 330 },
  goalNavigation: { borderBottomColor: line, borderBottomWidth: 1, gap: 4, paddingBottom: 12 },
  navigationHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 34 },
  navigationAdd: { alignItems: 'center', height: 30, justifyContent: 'center', width: 30 },
  navigationRow: { alignItems: 'center', borderLeftColor: 'transparent', borderLeftWidth: 2, borderRadius: 5, flexDirection: 'row', gap: 8, minHeight: 38, paddingHorizontal: 9 },
  navigationRowActive: { backgroundColor: accentFaint, borderLeftColor: accent },
  navigationText: { color: text, flex: 1, fontSize: 13, lineHeight: 18 },
  navigationTextActive: { color: accent, fontWeight: '700' },
  desktopGoalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, width: '100%' },
  desktopInfoCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, gap: 9, padding: 14 },
  divider: { backgroundColor: '#242524', height: 1, marginVertical: 2 },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  roundAccentButton: { alignItems: 'center', backgroundColor: accent, borderRadius: 999, height: 42, justifyContent: 'center', width: 42 },
  goalCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, gap: 9, padding: 12 },
  goalCardDesktop: { flexBasis: 320, flexGrow: 1, minHeight: 128, padding: 16 },
  goalCardDesktopFeatured: { flexBasis: '100%' },
  goalCardFeatured: { borderColor: accentBorder },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  flexText: { flex: 1, minWidth: 0 },
  goalTitle: { color: text, fontSize: 16, lineHeight: 22 },
  detailsTitle: { color: text, flex: 1, fontSize: 18, lineHeight: 24 },
  goalMeta: { color: muted, fontSize: 12, lineHeight: 17 },
  progressNumber: { color: text, fontSize: 22, fontWeight: '300' },
  todayPreview: { gap: 4 },
  miniLabel: { color: accent, fontSize: 11, lineHeight: 15 },
  previewLine: { color: text, fontSize: 13, lineHeight: 18 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  statusPill: { color: accent, fontSize: 11 },
  empty: { alignItems: 'flex-start', borderColor: line, borderRadius: 8, borderWidth: 1, gap: 10, padding: 16 },
  emptyTitle: { color: text, fontSize: 20, lineHeight: 26 },
  emptyText: { color: muted, fontSize: 13, lineHeight: 19 },
  primaryButton: { alignItems: 'center', backgroundColor: accent, borderRadius: 7, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  primaryButtonText: { color: panel, fontSize: 13, fontWeight: '700' },
  formActions: { flexDirection: 'row', gap: 8 },
  formPrimaryButton: { flex: 1 },
  disabledButton: { opacity: 0.4 },
  detailsHeader: { alignItems: 'center', flexDirection: 'row', gap: 10, paddingBottom: 8 },
  iconButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  inlineMenu: { borderColor: line, borderRadius: 8, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, padding: 8 },
  menuButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, flexDirection: 'row', gap: 5, minHeight: 34, paddingHorizontal: 10 },
  menuButtonText: { color: text, fontSize: 12 },
  dangerText: { color: '#ff4d4d' },
  summary: { alignItems: 'center', flexDirection: 'row', gap: 10, justifyContent: 'space-between' },
  summaryText: { flex: 1, gap: 3 },
  block: { gap: 8 },
  blockTitle: { color: text, fontSize: 18, lineHeight: 24, marginTop: 8 },
  compactList: { gap: 7 },
  todayRow: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 50, paddingHorizontal: 10 },
  sectionItem: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, gap: 8, padding: 10 },
  nestedList: { borderTopColor: '#202120', borderTopWidth: 1, gap: 7, paddingTop: 8 },
  milestoneActionRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 28 },
  inlineInputRow: { alignItems: 'center', borderColor: line, borderRadius: 7, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 38, paddingHorizontal: 10 },
  inlineInput: { color: text, flex: 1, fontSize: 13, minHeight: 34, padding: 0 },
  inlinePlusButton: { alignItems: 'center', backgroundColor: accent, borderRadius: 999, height: 28, justifyContent: 'center', width: 28 },
  actionRow: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 46, paddingHorizontal: 10 },
  actionRowDone: { opacity: 0.62 },
  checkCircle: { alignItems: 'center', borderColor: muted, borderRadius: 999, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  checkCircleDone: { backgroundColor: accent, borderColor: accent },
  actionTitle: { color: text, fontSize: 14, lineHeight: 19 },
  doneText: { color: muted, textDecorationLine: 'line-through' },
  addSelector: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 34 },
  addSelectorText: { color: accent, fontSize: 13 },
  addChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choiceButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: 'center', paddingHorizontal: 13 },
  choiceText: { color: text, fontSize: 12 },
  tinyButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, minHeight: 34, justifyContent: 'center', paddingHorizontal: 9 },
  tinyButtonText: { color: accent, fontSize: 11 },
  tinyIconButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 32, justifyContent: 'center', width: 32 },
  todayEditButton: { alignItems: 'center', height: 30, justifyContent: 'center', width: 24 },
  routineControls: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'flex-end' },
  inlineAction: { borderBottomColor: accentBorder, borderBottomWidth: 1, justifyContent: 'center', minHeight: 30, paddingHorizontal: 2 },
  inlineActionText: { color: accent, fontSize: 11, lineHeight: 15 },
  inlineActionTextActive: { color: text },
  emptyLine: { color: muted, fontSize: 13, lineHeight: 18, paddingVertical: 8 },
  modalOverlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  confirmOverlay: { alignItems: 'center', backgroundColor: 'rgba(0, 0, 0, 0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  sheet: { backgroundColor: panelSoft, borderColor: line, borderRadius: 10, borderWidth: 1, gap: 12, maxWidth: 430, padding: 14, width: '100%' },
  confirmCard: { backgroundColor: panelSoft, borderColor: line, borderRadius: 10, borderWidth: 1, gap: 14, maxWidth: 420, padding: 16, width: '100%' },
  sheetTitle: { color: text, fontSize: 19, lineHeight: 25 },
  prompt: { color: text, fontSize: 16, lineHeight: 22 },
  input: { borderColor: line, borderRadius: 8, borderWidth: 1, color: text, fontSize: 16, minHeight: 44, paddingHorizontal: 11 },
  segmentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  segment: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, flexGrow: 1, minHeight: 38, justifyContent: 'center', paddingHorizontal: 10 },
  scheduleSegment: { flexBasis: '30%' },
  segmentActive: { backgroundColor: accent, borderColor: accent },
  segmentText: { color: muted, fontSize: 12 },
  segmentTextActive: { color: panel, fontWeight: '700' },
  weekdayRow: { flexDirection: 'row', gap: 6, justifyContent: 'space-between' },
  weekdayButton: { alignItems: 'center', borderColor: line, borderRadius: 7, borderWidth: 1, flex: 1, minHeight: 38, justifyContent: 'center' },
  weekdayButtonActive: { backgroundColor: accent, borderColor: accent },
  weekdayText: { color: muted, fontSize: 11 },
  weekdayTextActive: { color: panel, fontWeight: '700' },
  secondaryButton: { alignItems: 'center', borderColor: line, borderRadius: 7, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  secondaryButtonText: { color: text, fontSize: 13 },
  deleteOutlineButton: { borderColor: '#56302f', marginRight: 'auto' },
  deleteOutlineText: { color: '#ff4d4d', fontSize: 13 },
  confirmActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  dangerButton: { backgroundColor: '#ff4d4d' },
});
