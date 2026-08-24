import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Check, Plus, Trash2, X } from 'lucide-react-native';
import { upsertRoutineLog } from '../goalLogic';
import { calculateKodaScore, classificationLabel, getGoalDayEntries, KODA_SCORE_VERSION } from '../kodaScore';
import { finalizeKodaDay } from '../kodaDaySync';
import type { Goal, KodaDay, PlannerItem } from '../types';
import { todayDateKey, uid } from '../utils';
import { ProgressLine, RoutineValueSheet, SectionTitle, type RoutineValueEditor } from '../components';
import { accent, accentBorder, accentFaint, faint, line, muted, panel, panelSoft, text } from '../theme';

type GoalsChange = (updater: (goals: Goal[]) => Goal[]) => void;
type KodaDaysChange = (updater: (days: KodaDay[]) => KodaDay[]) => void;

export function KodaDayScreen({
  goals,
  isDesktop = false,
  kodaDays,
  onGoalsChange,
  onKodaDaysChange,
  plannerItems,
}: {
  goals: Goal[];
  isDesktop?: boolean;
  kodaDays: KodaDay[];
  onGoalsChange: GoalsChange;
  onKodaDaysChange: KodaDaysChange;
  plannerItems: PlannerItem[];
}) {
  const date = todayDateKey();
  const [finishOpen, setFinishOpen] = useState(false);
  const [deleteDayId, setDeleteDayId] = useState<string | null>(null);
  const [hoveredHistoryDeleteId, setHoveredHistoryDeleteId] = useState<string | null>(null);
  const [routineEditor, setRoutineEditor] = useState<RoutineValueEditor | null>(null);
  const [routineDraft, setRoutineDraft] = useState('');
  const currentScore = useMemo(() => calculateKodaScore(goals, plannerItems, date), [goals, plannerItems, date]);
  const todayDay = kodaDays.find((day) => day.localDate === date) ?? null;
  const activeGoals = goals.filter((goal) => getGoalDayEntries(goal, date).length > 0);
  const history = kodaDays.filter((day) => day.status === 'completed').sort((a, b) => b.localDate.localeCompare(a.localDate)).slice(0, 7);
  const dayStatus = todayDay?.status ?? 'not_started';
  const completedScore = todayDay?.status === 'completed' ? todayDay : null;
  const todayPlannerItems = plannerItems.filter((item) => item.date === date);
  const openPlannerItems = todayPlannerItems.filter((item) => !item.done);

  function startDay() {
    const now = new Date().toISOString();
    onKodaDaysChange((days) => {
      const existing = days.find((day) => day.localDate === date);
      if (existing?.status === 'completed') return days;
      if (existing) {
        return days.map((day) => (day.id === existing.id ? { ...day, status: 'active', startedAt: day.startedAt ?? now, updatedAt: now } : day));
      }

      return [
        {
          id: uid('koda-day'),
          localDate: date,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local',
          status: 'active',
          startedAt: now,
          finishedAt: null,
          goalScore: null,
          plannerScore: currentScore.plannerScore,
          totalScore: null,
          classification: 'unclassified',
          scoreVersion: KODA_SCORE_VERSION,
          summary: '',
          focusLoss: '',
          nextRecommendation: '',
          goalsSnapshot: activeGoals.map((goal) => ({ id: goal.id, title: goal.title, priority: goal.priority })),
          plannerSnapshot: [],
          calculationSnapshot: null,
          createdAt: now,
          updatedAt: now,
        },
        ...days,
      ];
    });
  }

  function reopenDay() {
    const now = new Date().toISOString();
    onKodaDaysChange((days) => {
      const existing = days.find((day) => day.localDate === date);
      if (!existing) return days;

      return days.map((day) => (
        day.id === existing.id
          ? {
              ...day,
              status: 'active',
              finishedAt: null,
              goalScore: null,
              plannerScore: currentScore.plannerScore,
              totalScore: null,
              classification: 'unclassified',
              summary: '',
              focusLoss: '',
              nextRecommendation: '',
              calculationSnapshot: null,
              updatedAt: now,
            }
          : day
      ));
    });
  }

  function finishDay() {
    const now = new Date().toISOString();

    onKodaDaysChange((days) => {
      const existing = days.find((day) => day.localDate === date);
      if (existing?.status === 'completed') return days;
      const baseDay: KodaDay = {
        id: existing?.id ?? uid('koda-day'),
        localDate: date,
        timezone: existing?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'local',
        status: 'active',
        startedAt: existing?.startedAt ?? now,
        finishedAt: null,
        goalScore: null,
        plannerScore: 0,
        totalScore: null,
        classification: 'unclassified',
        scoreVersion: KODA_SCORE_VERSION,
        summary: '',
        focusLoss: '',
        nextRecommendation: '',
        goalsSnapshot: [],
        plannerSnapshot: [],
        calculationSnapshot: null,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const nextDay = finalizeKodaDay(baseDay, goals, plannerItems, now);

      return existing ? days.map((day) => (day.id === existing.id ? nextDay : day)) : [nextDay, ...days];
    });
    setFinishOpen(false);
  }

  function confirmDeleteHistoryDay() {
    if (!deleteDayId) return;
    onKodaDaysChange((days) => days.filter((day) => day.id !== deleteDayId));
    setDeleteDayId(null);
  }

  function setRoutineValue(goalId: string, routineId: string, value: number) {
    onGoalsChange((items) =>
      items.map((goal) => (goal.id === goalId ? { ...goal, routineLogs: upsertRoutineLog(goal.routineLogs, routineId, date, value) } : goal)),
    );
  }

  function openRoutineEditor(editor: RoutineValueEditor) {
    setRoutineEditor(editor);
    setRoutineDraft(String(editor.currentValue));
  }

  function saveRoutineEditor() {
    if (!routineEditor) return;
    const value = Number(routineDraft);
    if (!Number.isFinite(value) || value < 0) return;

    setRoutineValue(routineEditor.goalId, routineEditor.routineId, Math.round(value));
    setRoutineEditor(null);
    setRoutineDraft('');
  }

  function toggleGoalAction(goalId: string, actionId: string) {
    onGoalsChange((items) =>
      items.map((goal) => (
        goal.id === goalId
          ? {
              ...goal,
              actions: goal.actions.map((action) =>
                action.id === actionId
                  ? { ...action, status: action.status === 'completed' ? 'pending' : 'completed', completedAt: action.status === 'completed' ? null : new Date().toISOString() }
                  : action,
              ),
            }
          : goal
      )),
    );
  }

  return (
    <View style={local.screen}>
      <ScrollView contentContainerStyle={[local.scroll, isDesktop && local.desktopScroll]} showsVerticalScrollIndicator={false}>
        {!isDesktop ? <View style={local.pageHeader}>
          <SectionTitle title="Старт дня" subtitle={dayStatus === 'completed' ? 'Итог зафиксирован' : 'Движение к будущей версии'} />
          {dayStatus === 'active' ? (
            <Pressable onPress={() => setFinishOpen(true)} style={local.finishHeaderButton}>
              <Text style={local.finishHeaderText}>Закончить</Text>
            </Pressable>
          ) : null}
        </View> : null}

        <View style={isDesktop ? local.desktopLayout : undefined} testID={isDesktop ? 'desktop-page-columns' : undefined}>
          <View style={isDesktop ? local.desktopMain : undefined} testID={isDesktop ? 'desktop-main-column' : undefined}>
        {isDesktop ? (
          <View style={local.pageHeader}>
            <SectionTitle title="Старт дня" subtitle={dayStatus === 'completed' ? 'Итог зафиксирован' : 'Движение к будущей версии'} />
            {dayStatus === 'active' ? <Pressable onPress={() => setFinishOpen(true)} style={local.finishHeaderButton}><Text style={local.finishHeaderText}>Закончить</Text></Pressable> : null}
          </View>
        ) : null}
        {completedScore ? (
          <View style={local.hero}>
            <Text style={local.label}>KODA SCORE</Text>
            <Text style={local.score}>{completedScore.totalScore === null ? '--' : Math.round(completedScore.totalScore)}</Text>
            <Text style={local.level}>{classificationLabel(completedScore.classification)}</Text>
            <Text style={local.meta}>{completedScore.summary}</Text>
            <Pressable onPress={reopenDay} style={local.reopenDayButton}>
              <Text style={local.reopenDayText}>Вернуть день</Text>
            </Pressable>
          </View>
        ) : (
          <View style={[local.hero, dayStatus === 'not_started' && isDesktop && local.startHero]}>
            {dayStatus === 'not_started' && isDesktop ? (
              <>
                <View style={local.startHeroTop}>
                  <View style={local.startMark}>
                    <Text style={local.startMarkText}>K</Text>
                  </View>
                  <View style={local.startHeroText}>
                    <Text style={local.label}>{formatTodayTitle(date)}</Text>
                    <Text style={local.level}>Фокус на сегодня</Text>
                    <Text style={local.meta}>{activeGoals.length ? 'Запусти день, когда готов отмечать движение по целям.' : 'Можно начать день спокойно, без оценки по целям.'}</Text>
                  </View>
                </View>
                <View style={local.startHeroBottom}>
                  <View>
                    <Text style={local.startHintValue}>{activeGoals.length || 0}</Text>
                    <Text style={local.startHintLabel}>целей в фокусе</Text>
                  </View>
                  <PrimaryAction label="Начать" onPress={startDay} variant="start" />
                </View>
                <View style={local.consoleGrid}>
                  <ConsoleCell label="ЦЕЛИ" value={`${activeGoals.length} в фокусе`} detail={activeGoals[0]?.title || 'Можно начать без цели'} />
                  <ConsoleCell label="ПЛАННЕР" value={`${openPlannerItems.length} осталось`} detail={todayPlannerItems.length ? `${todayPlannerItems.length} дел на сегодня` : 'День пока свободен'} />
                  <ConsoleCell label="СЛЕДУЮЩИЙ ШАГ" value={openPlannerItems[0]?.title || activeGoals[0]?.title || 'Начать день'} detail="Один понятный шаг вместо всего списка" />
                </View>
              </>
            ) : (
              <>
                <View>
                  <Text style={local.label}>{dayStatus === 'active' ? 'ТЕКУЩИЙ РЕЗУЛЬТАТ' : formatTodayTitle(date)}</Text>
                  {dayStatus === 'active' ? (
                  <>
                    <Text style={local.score}>{currentScore.totalScore === null ? '--' : Math.round(currentScore.totalScore)}</Text>
                    <Text style={local.level}>{classificationLabel(currentScore.classification)}</Text>
                    <Text style={local.meta}>{currentScore.totalScore === null ? 'Недостаточно данных для KODA Score.' : currentScore.nextThreshold ? `До следующего уровня: ${currentScore.pointsToNextThreshold} баллов` : 'Сегодня уже уровень УДАР.'}</Text>
                  </>
                  ) : (
                  <>
                    <Text style={local.level}>Фокус на сегодня</Text>
                    <Text style={local.meta}>{activeGoals.length ? 'Начни день, когда будешь готов фиксировать движение по целям.' : 'На сегодня нет действий целей. Можно начать день без оценки или добавить действие в цели.'}</Text>
                  </>
                  )}
                </View>
                {dayStatus === 'not_started' ? <PrimaryAction label="Начать" onPress={startDay} /> : null}
              </>
            )}
          </View>
        )}

        {completedScore ? (
          <View style={local.section}>
            <Text style={local.sectionTitle}>Итог</Text>
            <MetricLine label="Движение по целям" value={completedScore.goalScore === null ? 'нет данных' : `${Math.round(completedScore.goalScore)} / 90`} />
            <MetricLine label="Текущие дела" value={`${Math.round(completedScore.plannerScore)} / 10`} />
            <Text style={local.meta}>{completedScore.focusLoss}</Text>
            <Text style={local.meta}>{completedScore.nextRecommendation}</Text>
          </View>
        ) : (
          <>
            {dayStatus === 'active' ? (
              <>
                <View style={local.section}>
                  <Text style={local.sectionTitle}>Цели сегодня</Text>
                  {activeGoals.length ? activeGoals.map((goal) => (
                    <GoalDayBlock key={goal.id} date={date} goal={goal} onEditRoutine={openRoutineEditor} onRoutineValue={setRoutineValue} onToggleAction={toggleGoalAction} />
                  )) : <Text style={local.meta}>На сегодня нет действий целей. Добавь регулярное действие или разовое действие в цели.</Text>}
                </View>

                <View style={local.section}>
                  <Text style={local.sectionTitle}>Как догнать день</Text>
                  {currentScore.suggestions.length ? currentScore.suggestions.map((suggestion) => (
                    <Text key={suggestion.id} style={local.suggestion}>{suggestion.label} · +{suggestion.points}</Text>
                  )) : <Text style={local.meta}>Сейчас достаточно закрепить результат и не распыляться.</Text>}
                </View>

                <View style={local.section}>
                  <Text style={local.sectionTitle}>Текущие дела</Text>
                  <MetricLine label="Планнер" value={`${currentScore.planner.completed} из ${currentScore.planner.total || 0} выполнено`} />
                  <ProgressLine value={currentScore.planner.completionRatio * 100} />
                </View>
              </>
            ) : null}
          </>
        )}

          </View>
          <View style={isDesktop ? local.desktopAside : undefined} testID={isDesktop ? 'desktop-right-column' : undefined}>
        <View style={local.section}>
          <Text style={local.sectionTitle}>История</Text>
          {history.length ? history.map((day) => (
            <View key={day.id} style={local.historyRow}>
              <Text style={local.historyDate}>{formatHistoryDate(day.localDate)}</Text>
              <Text style={local.historyScore}>{day.totalScore === null ? 'без оценки' : `KODA ${Math.round(day.totalScore)} · ${classificationLabel(day.classification)}`}</Text>
              <Pressable
                onHoverIn={() => setHoveredHistoryDeleteId(day.id)}
                onHoverOut={() => setHoveredHistoryDeleteId((current) => (current === day.id ? null : current))}
                onPress={() => setDeleteDayId(day.id)}
                style={[local.historyDeleteButton, hoveredHistoryDeleteId === day.id && local.historyDeleteButtonHover]}
              >
                <Trash2 color={hoveredHistoryDeleteId === day.id ? accent : muted} size={13} />
              </Pressable>
            </View>
          )) : <Text style={local.meta}>Завершённых дней пока нет.</Text>}
        </View>
          </View>
        </View>
      </ScrollView>

      <FinishDaySheet
        result={currentScore}
        visible={finishOpen}
        onCancel={() => setFinishOpen(false)}
        onConfirm={finishDay}
      />
      <Modal animationType="fade" transparent visible={Boolean(deleteDayId)} onRequestClose={() => setDeleteDayId(null)}>
        <View style={local.overlay}>
          <View style={local.sheet}>
            <View style={local.headerRow}>
              <Text style={local.sheetTitle}>Подтвердить удаление?</Text>
              <Pressable onPress={() => setDeleteDayId(null)} style={local.iconButton}><X color={text} size={18} /></Pressable>
            </View>
            <Text style={local.meta}>День исчезнет из истории KODA.</Text>
            <View style={local.sheetActions}>
              <Pressable onPress={() => setDeleteDayId(null)} style={local.secondaryButton}><Text style={local.secondaryText}>Нет</Text></Pressable>
              <Pressable onPress={confirmDeleteHistoryDay} style={local.dangerButton}><Text style={local.dangerText}>Да, удалить</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <RoutineValueSheet
        draft={routineDraft}
        editor={routineEditor}
        onChangeDraft={(value) => setRoutineDraft(value.replace(/\D/g, '').slice(0, 5))}
        onClose={() => setRoutineEditor(null)}
        onSave={saveRoutineEditor}
        onSetDraft={(value) => setRoutineDraft(String(value))}
      />
    </View>
  );
}

function GoalDayBlock({ date, goal, onEditRoutine, onRoutineValue, onToggleAction }: { date: string; goal: Goal; onEditRoutine: (editor: RoutineValueEditor) => void; onRoutineValue: (goalId: string, routineId: string, value: number) => void; onToggleAction: (goalId: string, actionId: string) => void }) {
  const entries = getGoalDayEntries(goal, date);
  const complete = entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.completionRatio, 0) / entries.length * 100) : 0;

  return (
    <View style={local.goalBlock}>
      <Text style={local.goalTitle}>{goal.title}</Text>
      <ProgressLine value={complete} />
      {entries.map((entry) => entry.kind === 'routine' ? (
        <View key={entry.routine.id} style={local.actionRow}>
          <View style={local.actionText}>
            <Text style={local.actionTitle}>{entry.routine.title}</Text>
            <Text style={local.meta}>{entry.currentValue} / {entry.targetValue}</Text>
          </View>
          {entry.routine.metricType === 'boolean' ? (
            <MiniAction label={entry.currentValue >= entry.targetValue ? 'Снять' : 'Готово'} onPress={() => onRoutineValue(goal.id, entry.routine.id, entry.currentValue >= entry.targetValue ? 0 : entry.targetValue)} />
          ) : (
            <MiniAction
              label="заполнить"
              onPress={() => onEditRoutine({
                currentValue: entry.currentValue,
                goalId: goal.id,
                metricLabel: entry.routine.metricType === 'minutes' ? 'минут' : 'шт',
                routineId: entry.routine.id,
                targetValue: entry.targetValue,
                title: entry.routine.title,
              })}
            />
          )}
        </View>
      ) : (
        <Pressable key={entry.action.id} onPress={() => onToggleAction(goal.id, entry.action.id)} style={local.actionRow}>
          <View style={local.check}>{entry.action.status === 'completed' ? <Check color={accent} size={15} /> : null}</View>
          <View style={local.actionText}>
            <Text style={local.actionTitle}>{entry.action.title}</Text>
            <Text style={local.meta}>{entry.action.status === 'completed' ? 'Выполнено' : 'Не выполнено'}</Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

function FinishDaySheet({ result, visible, onCancel, onConfirm }: { result: ReturnType<typeof calculateKodaScore>; visible: boolean; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={local.overlay}>
        <View style={local.sheet}>
          <View style={local.headerRow}>
            <Text style={local.sheetTitle}>Закончить день?</Text>
            <Pressable onPress={onCancel} style={local.iconButton}><X color={text} size={18} /></Pressable>
          </View>
          <Text style={local.scoreSmall}>{result.totalScore === null ? 'Без KODA Score' : `KODA ${Math.round(result.totalScore)} · ${classificationLabel(result.classification)}`}</Text>
          <Text style={local.meta}>Результат будет зафиксирован. Поздние правки задач и целей не изменят итог дня.</Text>
          <MetricLine label="Цели" value={result.goalScore === null ? 'нет данных' : `${Math.round(result.goalScore)} / 90`} />
          <MetricLine label="Планнер" value={`${Math.round(result.plannerScore)} / 10`} />
          <View style={local.sheetActions}>
            <Pressable onPress={onCancel} style={local.secondaryButton}><Text style={local.secondaryText}>Вернуться</Text></Pressable>
            <Pressable onPress={onConfirm} style={local.primaryButton}><Text style={local.primaryText}>Закончить день</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PrimaryAction({ label, onPress, variant = 'default' }: { label: string; onPress: () => void; variant?: 'default' | 'start' }) {
  return <Pressable onPress={onPress} style={[local.primaryButton, variant === 'start' && local.startButton]}><Text style={[local.primaryText, variant === 'start' && local.startButtonText]}>{label}</Text></Pressable>;
}

function MiniAction({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} style={local.miniButton}><Text style={local.miniText}>{label}</Text></Pressable>;
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={local.metricRow}>
      <Text style={local.meta}>{label}</Text>
      <Text style={local.metricValue}>{value}</Text>
    </View>
  );
}

function ConsoleCell({ detail, label, value }: { detail: string; label: string; value: string }) {
  return <View style={local.consoleCell}><Text style={local.label}>{label}</Text><Text numberOfLines={2} style={local.consoleValue}>{value}</Text><Text numberOfLines={2} style={local.meta}>{detail}</Text></View>;
}

function formatTodayTitle(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }).toUpperCase();
}

function formatHistoryDate(date: string) {
  return new Date(`${date}T00:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

const local = StyleSheet.create({
  screen: { flex: 1, minHeight: 0 },
  scroll: { gap: 12, paddingBottom: 94 },
  desktopScroll: { paddingBottom: 36, width: '100%' },
  desktopLayout: { alignItems: 'flex-start', flexDirection: 'row', gap: 24, width: '100%' },
  desktopMain: { flex: 1, gap: 12, minWidth: 0 },
  desktopAside: { borderLeftColor: line, borderLeftWidth: 1, flexShrink: 0, gap: 12, paddingLeft: 20, width: 330 },
  pageHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', width: '100%' },
  finishHeaderButton: {
    alignItems: 'center',
    borderColor: accentBorder,
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 16,
  },
  finishHeaderText: { color: accent, fontSize: 13, fontWeight: '700', lineHeight: 17 },
  hero: { borderColor: line, borderRadius: 8, borderWidth: 1, gap: 8, padding: 14 },
  reopenDayButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderBottomColor: accent,
    borderBottomWidth: 1,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 30,
  },
  reopenDayText: { color: accent, fontSize: 13, fontWeight: '700', lineHeight: 17 },
  startHero: {
    backgroundColor: '#121312',
    borderColor: '#292a29',
    borderRadius: 18,
    gap: 22,
    justifyContent: 'space-between',
    minHeight: 390,
    overflow: 'hidden',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.32,
    shadowRadius: 38,
    width: '100%',
  },
  startHeroTop: { alignItems: 'flex-start', flexDirection: 'row', gap: 16 },
  startHeroText: { flex: 1, gap: 8, minWidth: 0 },
  startMark: {
    alignItems: 'center',
    backgroundColor: '#1f1712',
    borderColor: accentBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 58,
    justifyContent: 'center',
    width: 58,
  },
  startMarkText: { color: accent, fontSize: 29, fontWeight: '900', lineHeight: 34 },
  startHeroBottom: {
    alignItems: 'flex-end',
    borderTopColor: '#252625',
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 16,
  },
  consoleGrid: { borderTopColor: '#252625', borderTopWidth: 1, flexDirection: 'row', gap: 12, paddingTop: 18 },
  consoleCell: { backgroundColor: '#0e0f0e', borderColor: '#292a29', borderRadius: 10, borderWidth: 1, flex: 1, gap: 7, minHeight: 112, minWidth: 0, padding: 14 },
  consoleValue: { color: text, fontSize: 17, lineHeight: 22 },
  startHintValue: { color: text, fontSize: 28, fontWeight: '300', lineHeight: 32 },
  startHintLabel: { color: muted, fontSize: 11, lineHeight: 15 },
  label: { color: accent, fontSize: 11, letterSpacing: 1.8 },
  score: { color: text, fontSize: 54, fontWeight: '300', lineHeight: 60 },
  scoreSmall: { color: text, fontSize: 22, lineHeight: 28 },
  level: { color: text, fontSize: 18, lineHeight: 24 },
  meta: { color: muted, fontSize: 12, lineHeight: 17 },
  section: { gap: 8 },
  sectionTitle: { color: text, fontSize: 18, lineHeight: 24 },
  goalBlock: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, gap: 8, padding: 10 },
  goalTitle: { color: text, fontSize: 14, lineHeight: 19 },
  actionRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 42 },
  actionText: { flex: 1, minWidth: 0 },
  actionTitle: { color: text, fontSize: 13, lineHeight: 18 },
  check: { alignItems: 'center', borderColor: muted, borderRadius: 999, borderWidth: 1, height: 22, justifyContent: 'center', width: 22 },
  miniButton: { borderBottomColor: accentBorder, borderBottomWidth: 1, minHeight: 30, justifyContent: 'center', paddingHorizontal: 2 },
  miniText: { color: accent, fontSize: 11 },
  suggestion: { color: text, fontSize: 13, lineHeight: 19 },
  metricRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  metricValue: { color: text, fontSize: 13 },
  historyRow: { alignItems: 'center', borderBottomColor: '#202120', borderBottomWidth: 1, flexDirection: 'row', minHeight: 34 },
  historyDate: { color: muted, fontSize: 12, width: 82 },
  historyScore: { color: text, flex: 1, fontSize: 13 },
  historyDeleteButton: {
    alignItems: 'center',
    borderRadius: 999,
    flexShrink: 0,
    height: 26,
    justifyContent: 'center',
    marginLeft: 8,
    width: 26,
  },
  historyDeleteButtonHover: { backgroundColor: accentFaint },
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.72)', flex: 1, justifyContent: 'center', padding: 18 },
  sheet: { backgroundColor: panelSoft, borderColor: line, borderRadius: 10, borderWidth: 1, gap: 12, maxWidth: 420, padding: 16, width: '100%' },
  headerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sheetTitle: { color: text, fontSize: 19, lineHeight: 25 },
  iconButton: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  sheetActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' },
  primaryButton: { alignItems: 'center', backgroundColor: accent, borderRadius: 7, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  primaryText: { color: panel, fontSize: 13, fontWeight: '700' },
  dangerButton: { alignItems: 'center', backgroundColor: '#ff4d4f', borderRadius: 7, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  dangerText: { color: panel, fontSize: 13, fontWeight: '700' },
  startButton: {
    alignSelf: 'flex-end',
    borderRadius: 14,
    height: 58,
    minHeight: 58,
    paddingHorizontal: 28,
    width: 150,
  },
  startButtonText: { fontSize: 16, lineHeight: 22 },
  secondaryButton: { alignItems: 'center', borderColor: line, borderRadius: 7, borderWidth: 1, minHeight: 42, justifyContent: 'center', paddingHorizontal: 14 },
  secondaryText: { color: text, fontSize: 13 },
});
