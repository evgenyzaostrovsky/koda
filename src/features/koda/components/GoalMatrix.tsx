import {activeBg} from '../theme';
import { webSpaceActivationProps } from './keyboard';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Check, Plus, RotateCcw, Sparkles, X } from 'lucide-react-native';
import { createGoalAction, createGoalRoutine, wouldCreateDependencyCycle, routineLogValue, upsertRoutineLog } from '../goalLogic';
import { createOpenWindow, getOpenWindowCells, updateOpenWindow } from '../openWindow';
import type { Goal, GoalAction, GoalRoutine, OpenWindowChange, OpenWindowDirection } from '../types';
import { todayDateKey } from '../utils';
import { accent, accentBorder, accentFaint, activeText, faint, line, muted, panel, panelSoft, text } from '../theme';

type Props = { initialDirectionId?: string | null; goal: Goal; isDesktop?: boolean; onUpdateGoal: (recipe: (goal: Goal) => Goal) => void; onRequestAI?: () => void };
type Cell = ReturnType<typeof getOpenWindowCells>[number];

function actionStatusLabel(goal: Goal, action: GoalAction): string {
  if (action.archivedAt) return 'В архиве';
  if (action.deferredUntil && action.deferredUntil > todayDateKey()) return `Отложено до ${action.deferredUntil}`;
  if (action.status === 'completed') return 'Выполнено';
  const blocker = action.dependsOn?.map((id) => goal.actions.find((item) => item.id === id)).find((item) => item && item.status !== 'completed' && !item.archivedAt);
  if (blocker) return `Сначала: ${blocker.title}`;
  if (action.dueDate === todayDateKey()) return 'Сегодня';
  return action.dueDate && action.dueDate < todayDateKey() ? 'Просрочено' : 'Следующий шаг';
}

export function GoalMatrix({ initialDirectionId, goal, isDesktop = false, onUpdateGoal, onRequestAI }: Props) {
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  useEffect(()=>{if(initialDirectionId)setSelectedDirectionId(initialDirectionId);},[initialDirectionId]);
  const [gridMode, setGridMode] = useState<'compact' | 'full'>('compact');
  const [zoom, setZoom] = useState(1);
  const [notice, setNotice] = useState('');
  const [newActionTitle, setNewActionTitle] = useState('');
  const [newRoutineTitle, setNewRoutineTitle] = useState('');
  const [editingActionId, setEditingActionId] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [directionTitleDraft, setDirectionTitleDraft] = useState('');

  const directions = useMemo(() => [...(goal.openWindow?.directions ?? createOpenWindow(goal.id).directions)].sort((a, b) => a.position - b.position), [goal.id, goal.openWindow?.directions]);
  const activeDirections = directions.filter((direction) => !direction.archivedAt);
  const selectedDirection = directions.find((direction) => direction.id === selectedDirectionId) ?? null;
  const cells = useMemo(() => getOpenWindowCells(goal), [goal]);
  const activeActions = (direction: OpenWindowDirection) => direction.actionIds.map((id) => goal.actions.find((item) => item.id === id)).filter((item): item is GoalAction => Boolean(item));
  const activeRoutines = (direction: OpenWindowDirection) => direction.routineIds.map((id) => goal.routines.find((item) => item.id === id)).filter((item): item is GoalRoutine => Boolean(item));

  useEffect(() => { setDirectionTitleDraft(selectedDirection?.title ?? ''); }, [selectedDirection?.id]);

  useEffect(() => {
    setSelectedDirectionId(null);
    setGridMode('compact');
    setZoom(1);
    setNotice('');
    setNewActionTitle('');
    setNewRoutineTitle('');
    setEditingActionId(null);
    setHistoryOpen(false);
  }, [goal.id]);

  function changeDirection(directionId: string, recipe: (direction: OpenWindowDirection) => OpenWindowDirection, label: string) {
    onUpdateGoal((current) => updateOpenWindow(current, (current.openWindow?.directions ?? directions).map((direction) => direction.id === directionId ? recipe(direction) : direction), label));
  }

  function updateDirectionTitle(direction: OpenWindowDirection, title: string) {
    const normalized = title.trim().slice(0, 300);
    setDirectionTitleDraft(normalized);
    if (normalized === direction.title) return;
    changeDirection(direction.id, (item) => ({ ...item, title: normalized }), 'Изменено название направления');
  }

  function addAction(direction: OpenWindowDirection) {
    const title = newActionTitle.trim();
    if (!title || direction.actionIds.length + direction.routineIds.length >= 8) return;
    const action = createGoalAction({ title, position: goal.actions.length });
    onUpdateGoal((current) => {
      const latest = current.openWindow?.directions ?? directions;
      return updateOpenWindow({ ...current, actions: [...current.actions, action] }, latest.map((item) => item.id === direction.id ? { ...item, actionIds: [...item.actionIds, action.id].slice(0, 8) } : item), 'Добавлено действие в направление');
    });
    setNewActionTitle('');
  }

  function addRoutine(direction: OpenWindowDirection) {
    const title = newRoutineTitle.trim();
    if (!title || direction.actionIds.length + direction.routineIds.length >= 8) return;
    const routine = createGoalRoutine({ title, metricType: 'boolean', targetValue: 1, frequencyType: 'daily' });
    onUpdateGoal((current) => {
      const latest = current.openWindow?.directions ?? directions;
      return updateOpenWindow({ ...current, routines: [...current.routines, routine] }, latest.map((item) => item.id === direction.id ? { ...item, routineIds: [...item.routineIds, routine.id].slice(0, 8) } : item), 'Добавлено регулярное действие в направление');
    });
    setNewRoutineTitle('');
  }

  function unlinkAction(direction: OpenWindowDirection, actionId: string) {
    changeDirection(direction.id, (item) => ({ ...item, actionIds: item.actionIds.filter((id) => id !== actionId) }), 'Действие отвязано от направления');
    setNotice('Действие осталось в цели и больше не занимает слот направления.');
  }

  function unlinkRoutine(direction: OpenWindowDirection, routineId: string) {
    changeDirection(direction.id, (item) => ({ ...item, routineIds: item.routineIds.filter((id) => id !== routineId) }), 'Регулярное действие отвязано от направления');
    setNotice('Регулярное действие осталось в цели и отвязано от направления.');
  }

  function linkExistingAction(direction: OpenWindowDirection, actionId: string) {
    if (direction.actionIds.length + direction.routineIds.length >= 8) return;
    const next = directions.map((item) => ({ ...item, actionIds: item.actionIds.filter((id) => id !== actionId) }));
    const linked = next.map((item) => item.id === direction.id ? { ...item, actionIds: [...item.actionIds, actionId] } : item);
    onUpdateGoal((current) => updateOpenWindow(current, linked, 'Существующее действие привязано к направлению'));
  }

  function linkExistingRoutine(direction: OpenWindowDirection, routineId: string) {
    if (direction.actionIds.length + direction.routineIds.length >= 8) return;
    const next = directions.map((item) => ({ ...item, routineIds: item.routineIds.filter((id) => id !== routineId) }));
    const linked = next.map((item) => item.id === direction.id ? { ...item, routineIds: [...item.routineIds, routineId] } : item);
    onUpdateGoal((current) => updateOpenWindow(current, linked, 'Существующее регулярное действие привязано к направлению'));
  }

  function moveAction(direction: OpenWindowDirection, actionId: string, targetDirectionId: string) {
    const target = directions.find((item) => item.id === targetDirectionId);
    if (!target || target.id === direction.id || target.actionIds.length + target.routineIds.length >= 8) return;
    onUpdateGoal((current) => updateOpenWindow(current, (current.openWindow?.directions ?? directions).map((item) => item.id === direction.id
      ? { ...item, actionIds: item.actionIds.filter((id) => id !== actionId) }
      : item.id === targetDirectionId ? { ...item, actionIds: [...item.actionIds, actionId] } : item), 'Действие перенесено между направлениями'));
  }

  function moveRoutine(direction: OpenWindowDirection, routineId: string, targetDirectionId: string) {
    const target = directions.find((item) => item.id === targetDirectionId);
    if (!target || target.id === direction.id || target.actionIds.length + target.routineIds.length >= 8) return;
    onUpdateGoal((current) => updateOpenWindow(current, (current.openWindow?.directions ?? directions).map((item) => item.id === direction.id
      ? { ...item, routineIds: item.routineIds.filter((id) => id !== routineId) }
      : item.id === targetDirectionId ? { ...item, routineIds: [...item.routineIds, routineId] } : item), 'Регулярное действие перенесено между направлениями'));
  }

  function archiveDirection(direction: OpenWindowDirection) {
    changeDirection(direction.id, (item) => ({ ...item, archivedAt: new Date().toISOString() }), 'Направление помещено в архив');
    setSelectedDirectionId(null);
    setNotice('Направление скрыто из окна. Связанные действия и история цели сохранены.');
  }

  function restoreDirection(direction: OpenWindowDirection) {
    changeDirection(direction.id, (item) => ({ ...item, archivedAt: null }), 'Направление восстановлено');
    setNotice('Направление восстановлено вместе со ссылками на прежние действия.');
  }

  function restoreConflict(conflictId: string) {
    const conflict = goal.openWindow?.conflicts?.find((item) => item.id === conflictId);
    if (!conflict) return;
    onUpdateGoal((current) => {
      const updated = restoreWindowChange(current, conflict, 'Восстановлен вариант окна с другого устройства');
      return { ...updated, openWindow: updated.openWindow ? { ...updated.openWindow, conflicts: updated.openWindow.conflicts?.filter((item) => item.id !== conflictId) } : undefined };
    });
    setNotice('Вариант восстановлен. Текущее состояние сохранено в истории.');
  }

  function restoreHistory(changeId: string) {
    const change = goal.openWindow?.history.find((item) => item.id === changeId);
    if (!change) return;
    onUpdateGoal((current) => restoreWindowChange(current, change, `Восстановлено состояние: ${change.label}`));
    setNotice('Предыдущее состояние восстановлено. Текущий вариант сохранён в истории.');
  }

  function scheduleToday(action: GoalAction) {
    if (action.archivedAt) { setNotice('Сначала восстанови действие из архива.'); return; }
    if (action.status === 'completed') { setNotice('Это действие уже выполнено. Его выполнение сохранено.'); return; }
    if (action.deferredUntil && action.deferredUntil > todayDateKey()) { setNotice(`Действие отложено до ${action.deferredUntil}. Сначала измени срок отсрочки.`); return; }
    const blocker = action.dependsOn?.map((id) => goal.actions.find((item) => item.id === id)).find((item) => item && item.status !== 'completed' && !item.archivedAt);
    if (blocker) { setNotice(`Сначала выполни действие «${blocker.title}».`); return; }
    onUpdateGoal((current) => ({ ...current, updatedAt: new Date().toISOString(), actions: current.actions.map((item) => item.id === action.id ? { ...item, dueDate: todayDateKey() } : item) }));
    setNotice(`«${action.title}» добавлено в Сегодня.`);
  }

  function toggleAction(action: GoalAction) {
    const completed = action.status === 'completed';
    if (action.archivedAt) { setNotice('Сначала восстанови действие из архива.'); return; }
    onUpdateGoal((current) => ({ ...current, updatedAt: new Date().toISOString(), actions: current.actions.map((item) => item.id === action.id ? { ...item, status: completed ? 'pending' : 'completed', completedAt: completed ? null : new Date().toISOString() } : item) }));
  }

  function toggleRoutine(routine: GoalRoutine) {
    const today = todayDateKey();
    const value = routineLogValue(goal, routine.id, today);
    onUpdateGoal((current) => ({ ...current, updatedAt: new Date().toISOString(), routineLogs: upsertRoutineLog(current.routineLogs, routine.id, today, value >= routine.targetValue ? 0 : routine.targetValue) }));
  }

  const compactGridCells = [30, 31, 32, 39, 40, 41, 48, 49, 50].map((index) => cells[index]!);

  function renderMatrixCell(cell: Cell, index: number, overviewGrid = false) {
    const isGoal = cell.kind === 'goal';
    const direction = cell.kind !== 'goal' ? directions.find((item) => item.id === cell.directionId) : undefined;
    const action = cell.kind === 'action' && cell.actionId ? goal.actions.find((item) => item.id === cell.actionId) : undefined;
    const routine = cell.kind === 'action' && cell.actionId ? goal.routines.find((item) => item.id === cell.actionId) : undefined;
    const cellLabel = isGoal ? goal.title : cell.kind === 'direction' ? direction?.title || 'Добавить направление' : action?.title ?? routine?.title ?? 'Пустой слот';
    const status = action ? actionStatusLabel(goal, action) : routine ? routineLogValue(goal, routine.id) >= routine.targetValue ? 'Сегодня выполнено' : 'Регулярное' : '';
    const actionCount = direction ? activeActions(direction).length + activeRoutines(direction).length : 0;
    const completedCount = direction ? activeActions(direction).filter((item) => item.status === 'completed').length + activeRoutines(direction).filter((item) => routineLogValue(goal, item.id) >= item.targetValue).length : 0;
    return (
      <Pressable key={`${cell.kind}-${index}-${direction?.id ?? ''}`} accessibilityRole="button" accessibilityLabel={isGoal ? `Цель: ${goal.title}. Помочь с направлениями` : `${cell.kind === 'direction' ? 'Направление' : 'Действие'}: ${cellLabel}${status ? `, ${status}` : ''}`} onPress={() => {
        if (isGoal) { onRequestAI?.(); return; }
        if (action) { setEditingActionId(action.id); return; }
        if (routine) { toggleRoutine(routine); setNotice(`Обновлён статус «${routine.title}».`); return; }
        if (direction) { setSelectedDirectionId(direction.id); setDirectionTitleDraft(direction.title ?? ''); return; }
      }} style={[styles.cell, selectedDirection?.id===direction?.id && {borderWidth:2}, isGoal && styles.goalCell, cell.kind === 'direction' && styles.directionCell, cell.kind === 'action' && (action || routine) && styles.filledCell, cell.kind === 'action' && !action && !routine && styles.emptyCell, gridMode === 'full' && (isDesktop || overviewGrid) ? { borderTopWidth: [3,6].includes(Math.floor(cell.index/9)) ? 2 : 1, borderLeftWidth: [3,6].includes(cell.index%9) ? 2 : 1, width: (isDesktop ? 102 : 74) * zoom, height: Math.max(60,(isDesktop ? 96 : 66) * zoom), flexBasis: (isDesktop ? 102 : 74) * zoom, flexGrow: 0, flexShrink: 0 } : styles.mobileCell]}>
        {isGoal ? <><Text numberOfLines={2} style={styles.goalCellText}>{goal.title}</Text><Text style={styles.cellStatus}>{onRequestAI ? 'Главная цель · нажми для AI' : 'Главная цель'}</Text></> : (
          <>
            <Text numberOfLines={2} style={[styles.cellTitle, cell.kind === 'direction' && styles.directionTitle]}>{action?.title ?? routine?.title ?? cellLabel}</Text>
            {cell.kind === 'direction' ? <Text numberOfLines={1} style={styles.cellStatus}>{completedCount}/{actionCount} готово · {direction?.archivedAt ? 'в архиве' : 'открыть'}</Text> : action || routine ? <Text numberOfLines={1} style={styles.cellStatus}>{status}</Text> : <Text numberOfLines={1} style={styles.cellStatus}>+ добавить</Text>}
          </>
        )}
      </Pressable>
    );
  }

  const grid = (items: Cell[], desktopGrid: boolean, overviewGrid = false) => (
    <View style={[styles.grid, (desktopGrid || overviewGrid) && styles.desktopGrid, desktopGrid && { width: 9 * (102 * zoom) + 8 * 3 }, overviewGrid && { width: 9 * (74 * zoom) + 8 * 3 }, !desktopGrid && !overviewGrid && styles.mobileGrid]}>
      {items.map((cell, index) => renderMatrixCell(cell, index, overviewGrid))}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}><Text style={styles.title}>Окно 64</Text><Text style={styles.subtitle}>Одна цель · 8 направлений · 64 действия</Text></View>
        {gridMode === 'full' ? <View style={styles.zoom}><Pressable accessibilityRole="button" accessibilityLabel="Уменьшить матрицу" onPress={() => setZoom((value) => Math.max(0.72, +(value - 0.12).toFixed(2)))} style={styles.zoomButton}><Text style={styles.zoomText}>−</Text></Pressable><Text style={styles.zoomLabel}>{Math.round(zoom * 100)}%</Text><Pressable accessibilityRole="button" accessibilityLabel="Увеличить матрицу" onPress={() => setZoom((value) => Math.min(1.48, +(value + 0.12).toFixed(2)))} style={styles.zoomButton}><Text style={styles.zoomText}>+</Text></Pressable></View> : null}
      </View>

      <View style={styles.mobileTabs} accessibilityRole="tablist"><Pressable accessibilityRole="tab" aria-pressed={gridMode === 'compact'} accessibilityState={{ selected: gridMode === 'compact' }} onPress={() => setGridMode('compact')} style={[styles.mobileTab, gridMode === 'compact' && styles.mobileTabActive]}><Text style={[styles.mobileTabText, gridMode === 'compact' && styles.mobileTabTextActive]}>Цель и направления</Text></Pressable><Pressable accessibilityRole="tab" aria-pressed={gridMode === 'full'} accessibilityState={{ selected: gridMode === 'full' }} onPress={() => setGridMode('full')} style={[styles.mobileTab, gridMode === 'full' && styles.mobileTabActive]}><Text style={[styles.mobileTabText, gridMode === 'full' && styles.mobileTabTextActive]}>Полное окно 9×9</Text></Pressable></View>
      {onRequestAI ? <Pressable accessibilityRole="button" accessibilityLabel="Попросить AI предложить направления для цели" onPress={onRequestAI} style={[styles.aiButton,{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8}]}><Sparkles size={17} color={accent}/><Text style={styles.aiButtonText}>Помочь с направлениями</Text></Pressable> : null}

      {gridMode === 'full' ? (
        <View style={styles.overview}>
          <Text style={styles.overviewHint}>Полная сетка 9×9. Прокручивай по горизонтали и вертикали, чтобы просматривать все направления и слоты.</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator><ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={styles.mobileOverviewScroll}><View style={styles.mobileOverviewGrid}>{grid(cells, isDesktop, !isDesktop)}</View></ScrollView></ScrollView>
        </View>
      ) : <View style={styles.compactGridWrap}><View style={styles.desktopGridWrap}>{grid(compactGridCells, false)}</View><Text style={styles.overviewHint}>Нажми на направление, чтобы добавить или изменить его действия.</Text></View>}

      {selectedDirection ? <Modal animationType="none" onRequestClose={() => setSelectedDirectionId(null)} transparent visible><View accessibilityViewIsModal accessibilityLabel={`Редактор направления ${selectedDirection.title || selectedDirection.position + 1}`} style={styles.editorOverlay}><ScrollView keyboardShouldPersistTaps="handled" style={styles.directionModalScroll} contentContainerStyle={styles.directionModalContent}><View style={styles.editor}>
          <View style={styles.editorHeader}><Text accessibilityRole="header" style={styles.editorTitle}>Направление {selectedDirection.position + 1}</Text><View style={styles.editorHeaderActions}>{selectedDirection.archivedAt ? <Pressable accessibilityRole="button" onPress={() => restoreDirection(selectedDirection)} style={styles.smallButton}><RotateCcw color={accent} size={14} /><Text style={styles.smallButtonText}>Восстановить</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => archiveDirection(selectedDirection)} style={styles.smallButton}><X color={muted} size={14} /><Text style={styles.smallButtonText}>В архив</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Закрыть редактор направления" onPress={() => setSelectedDirectionId(null)} style={styles.unlinkButton}><X color={muted} size={16} /></Pressable></View></View>
          <TextInput accessibilityLabel="Название направления" autoFocus onChangeText={setDirectionTitleDraft} onBlur={() => updateDirectionTitle(selectedDirection, directionTitleDraft)} onSubmitEditing={() => updateDirectionTitle(selectedDirection, directionTitleDraft)} placeholder="Например: здоровье" placeholderTextColor={faint} style={styles.directionInput} value={directionTitleDraft} />
          {selectedDirection.archivedAt ? <Text style={styles.notice}>Направление в архиве. Действия и прогресс сохранены.</Text> : null}
          <Text style={styles.sectionTitle}>Действия направления · {activeActions(selectedDirection).filter((item) => item.status === 'completed').length + activeRoutines(selectedDirection).filter((item) => routineLogValue(goal, item.id) >= item.targetValue).length}/{activeActions(selectedDirection).length + activeRoutines(selectedDirection).length} выполнено</Text>
          <Text style={styles.taskMeta}>Всего слотов: {activeActions(selectedDirection).length + activeRoutines(selectedDirection).length}/8</Text>
          {activeActions(selectedDirection).map((action) => <View key={action.id} style={styles.taskRow}><Pressable {...webSpaceActivationProps(() => toggleAction(action), Boolean(action.archivedAt))} accessibilityRole="checkbox" accessibilityLabel={`Выполнено: ${action.title}`} aria-checked={action.status === 'completed'} accessibilityState={{ checked: action.status === 'completed' }} disabled={Boolean(action.archivedAt)} onPress={() => toggleAction(action)} style={[styles.taskCheck, action.status === 'completed' && styles.taskCheckDone, action.archivedAt && styles.disabled]}>{action.status === 'completed' ? <Check color={activeText} size={13} strokeWidth={3} /> : null}</Pressable><Pressable onPress={() => setEditingActionId(action.id)} style={styles.taskCopy}><Text numberOfLines={2} style={[styles.taskTitle, action.status === 'completed' && styles.taskTitleDone]}>{action.title}</Text><Text style={styles.taskMeta}>{actionStatusLabel(goal, action)}</Text></Pressable>{action.status !== 'completed' && !action.archivedAt ? <Pressable accessibilityRole="button" onPress={() => scheduleToday(action)} style={styles.smallButton}><Text style={styles.smallButtonText}>Сегодня</Text></Pressable> : null}<Pressable accessibilityRole="button" accessibilityLabel="Отвязать действие от направления" onPress={() => unlinkAction(selectedDirection, action.id)} style={styles.unlinkButton}><X color={muted} size={15} /></Pressable></View>)}
          {!selectedDirection.archivedAt && selectedDirection.actionIds.length + selectedDirection.routineIds.length < 8 ? <View style={styles.addRow}><TextInput accessibilityLabel="Новое разовое действие" onChangeText={setNewActionTitle} onSubmitEditing={() => addAction(selectedDirection)} placeholder="Добавить разовое действие" placeholderTextColor={faint} style={styles.addInput} value={newActionTitle} /><Pressable accessibilityRole="button" accessibilityLabel="Добавить разовое действие" disabled={!newActionTitle.trim()} onPress={() => addAction(selectedDirection)} style={[styles.addButton, !newActionTitle.trim() && styles.disabled]}><Text style={styles.addButtonText}>Добавить</Text></Pressable></View> : null}
          {!selectedDirection.archivedAt && selectedDirection.actionIds.length + selectedDirection.routineIds.length < 8 && goal.actions.some((action) => !directions.some((item) => item.actionIds.includes(action.id))) ? <View style={styles.existingBox}><Text style={styles.taskMeta}>Или привяжи существующее действие</Text>{goal.actions.filter((action) => !directions.some((item) => item.actionIds.includes(action.id))).slice(0, 6).map((action) => <Pressable key={`existing-${action.id}`} accessibilityRole="button" onPress={() => linkExistingAction(selectedDirection, action.id)} style={styles.existingRow}><Plus color={accent} size={14} /><Text numberOfLines={2} style={styles.existingText}>{action.title}</Text></Pressable>)}</View> : null}
          <Text style={styles.sectionTitle}>Регулярные действия ({activeRoutines(selectedDirection).length}/8)</Text>
          {activeRoutines(selectedDirection).map((routine) => { const done = routineLogValue(goal, routine.id) >= routine.targetValue; return <View key={routine.id} style={styles.taskRow}><Pressable {...webSpaceActivationProps(() => toggleRoutine(routine))} accessibilityRole="checkbox" accessibilityLabel={`Сегодня выполнено: ${routine.title}`} aria-checked={done} accessibilityState={{ checked: done }} onPress={() => toggleRoutine(routine)} style={[styles.taskCheck, done && styles.taskCheckDone]}>{done ? <Check color={activeText} size={13} strokeWidth={3} /> : null}</Pressable><View style={styles.taskCopy}><Text style={styles.taskTitle}>{routine.title}</Text><Text style={styles.taskMeta}>{done ? 'Сегодня выполнено' : 'Сегодня не выполнено'} · каждый день</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Отвязать регулярное действие от направления" onPress={() => unlinkRoutine(selectedDirection, routine.id)} style={styles.unlinkButton}><X color={muted} size={15} /></Pressable></View>; })}
          {!selectedDirection.archivedAt && selectedDirection.actionIds.length + selectedDirection.routineIds.length < 8 ? <View style={styles.addRow}><TextInput accessibilityLabel="Новое регулярное действие" onChangeText={setNewRoutineTitle} onSubmitEditing={() => addRoutine(selectedDirection)} placeholder="Добавить ежедневное действие" placeholderTextColor={faint} style={styles.addInput} value={newRoutineTitle} /><Pressable accessibilityRole="button" accessibilityLabel="Добавить регулярное действие" disabled={!newRoutineTitle.trim()} onPress={() => addRoutine(selectedDirection)} style={[styles.addButton, !newRoutineTitle.trim() && styles.disabled]}><Text style={styles.addButtonText}>Добавить</Text></Pressable></View> : null}
          {!selectedDirection.archivedAt && selectedDirection.actionIds.length + selectedDirection.routineIds.length < 8 && goal.routines.some((routine) => !directions.some((item) => item.routineIds.includes(routine.id))) ? <View style={styles.existingBox}><Text style={styles.taskMeta}>Или привяжи существующее регулярное действие</Text>{goal.routines.filter((routine) => !directions.some((item) => item.routineIds.includes(routine.id))).slice(0, 6).map((routine) => <Pressable key={`existing-routine-${routine.id}`} accessibilityRole="button" onPress={() => linkExistingRoutine(selectedDirection, routine.id)} style={styles.existingRow}><Plus color={accent} size={14} /><Text numberOfLines={2} style={styles.existingText}>{routine.title}</Text></Pressable>)}</View> : null}
          {!!activeActions(selectedDirection).length || !!activeRoutines(selectedDirection).length ? <View style={styles.moveBox}><Text style={styles.sectionTitle}>Перенести действие</Text>{activeActions(selectedDirection).map((action) => <View key={`move-${action.id}`} style={styles.moveRow}><Text numberOfLines={1} style={styles.moveTitle}>{action.title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moveChoices}>{activeDirections.filter((item) => item.id !== selectedDirection.id && item.actionIds.length + item.routineIds.length < 8).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Перенести ${action.title} в ${item.title || `направление ${item.position + 1}`}`} onPress={() => moveAction(selectedDirection, action.id, item.id)} style={styles.moveChoice}><Text numberOfLines={1} style={styles.moveChoiceText}>{item.title || `№${item.position + 1}`}</Text></Pressable>)}</ScrollView></View>)}{activeRoutines(selectedDirection).map((routine) => <View key={`move-routine-${routine.id}`} style={styles.moveRow}><Text numberOfLines={1} style={styles.moveTitle}>{routine.title}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.moveChoices}>{activeDirections.filter((item) => item.id !== selectedDirection.id && item.actionIds.length + item.routineIds.length < 8).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Перенести ${routine.title} в ${item.title || `направление ${item.position + 1}`}`} onPress={() => moveRoutine(selectedDirection, routine.id, item.id)} style={styles.moveChoice}><Text numberOfLines={1} style={styles.moveChoiceText}>{item.title || `№${item.position + 1}`}</Text></Pressable>)}</ScrollView></View>)}</View> : null}
        </View></ScrollView></View></Modal> : null}
      {goal.openWindow?.history.length ? <View style={styles.history}><Pressable accessibilityRole="button" aria-expanded={historyOpen} accessibilityState={{ expanded: historyOpen }} onPress={() => setHistoryOpen((value) => !value)} style={styles.historyToggle}><Text style={styles.sectionTitle}>История окна · {goal.openWindow.history.length}</Text><Text style={styles.historyToggleText}>{historyOpen ? 'Скрыть' : 'Показать'}</Text></Pressable>{historyOpen ? [...goal.openWindow.history].reverse().slice(0, 8).map((change) => <View key={change.id} style={styles.conflictRow}><Text numberOfLines={2} style={styles.conflictLabel}>{change.label} · {new Date(change.at).toLocaleDateString('ru-RU')}</Text><Pressable accessibilityRole="button" onPress={() => restoreHistory(change.id)} style={styles.restoreButton}><Text style={styles.restoreText}>Вернуть</Text></Pressable></View>) : null}</View> : null}
      {goal.openWindow?.conflicts?.length ? <View style={styles.conflicts}><Text style={styles.sectionTitle}>Другой вариант изменений</Text><Text style={styles.notice}>Изменения с другого устройства сохранены и не потерялись. Можно восстановить выбранный вариант.</Text>{goal.openWindow.conflicts.map((conflict) => <View key={conflict.id} style={styles.conflictRow}><Text numberOfLines={2} style={styles.conflictLabel}>{conflict.label || 'Вариант с другого устройства'}</Text><Pressable accessibilityRole="button" onPress={() => restoreConflict(conflict.id)} style={styles.restoreButton}><Text style={styles.restoreText}>Восстановить</Text></Pressable></View>)}</View> : null}
      {notice ? <View accessibilityLiveRegion="polite" style={styles.toast}><Text style={styles.toastText}>{notice}</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть сообщение" onPress={() => setNotice('')} style={styles.toastClose}><X color={activeText} size={14} /></Pressable></View> : null}
      {editingActionId ? <ActionQuickEditor action={goal.actions.find((item) => item.id === editingActionId) ?? null} allActions={goal.actions} onClose={() => setEditingActionId(null)} onSave={(action) => { onUpdateGoal((current) => ({ ...current, updatedAt: new Date().toISOString(), actions: current.actions.map((item) => item.id === action.id ? action : item) })); setEditingActionId(null); }} /> : null}
    </View>
  );
}

function restoreWindowChange(goal: Goal, change: OpenWindowChange, label: string): Goal {
  const actions = [...goal.actions];
  for (const snapshot of change.actionsSnapshot ?? []) if (!actions.some((item) => item.id === snapshot.id)) actions.push(snapshot);
  const routines = [...goal.routines];
  for (const snapshot of change.routinesSnapshot ?? []) if (!routines.some((item) => item.id === snapshot.id)) routines.push(snapshot);
  return updateOpenWindow({ ...goal, actions, routines }, change.directions, label);
}

function ActionQuickEditor({ action, allActions, onClose, onSave }: { action: GoalAction | null; allActions: GoalAction[]; onClose: () => void; onSave: (action: GoalAction) => void }) {
  const [title, setTitle] = useState(action?.title ?? '');
  const [deferredUntil, setDeferredUntil] = useState(action?.deferredUntil ?? '');
  const [dependencyId, setDependencyId] = useState(action?.dependsOn?.[0] ?? '');
  const [archived, setArchived] = useState(Boolean(action?.archivedAt));
  const [validationError,setValidationError] = useState('');
  if (!action) return null;
  function save() {
    if (!action) return;
    if (!title.trim()) return;
    const date=deferredUntil.trim();
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date+'T12:00:00Z')) || new Date(date+'T12:00:00Z').toISOString().slice(0,10)!==date)) { setValidationError('Укажите существующую дату ГГГГ-ММ-ДД или оставьте поле пустым.'); return; }
    if (dependencyId && wouldCreateDependencyCycle(allActions,action.id,[dependencyId])) { setValidationError('Эта зависимость замыкает цепочку. Выберите другое действие.'); return; }
    onSave({ ...action, title: title.trim(), archivedAt: archived ? action.archivedAt ?? new Date().toISOString() : null, deferredUntil: deferredUntil.trim(), dependsOn: dependencyId ? [dependencyId] : [] });
  }
  const candidates = allActions.filter((item) => item.id !== action.id && !item.archivedAt);
  return <Modal animationType="none" onRequestClose={onClose} transparent visible><View accessibilityViewIsModal style={styles.editorOverlay}><View style={styles.quickEditor}><View style={styles.editorHeader}><Text style={styles.editorTitle}>Действие</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть редактор действия" onPress={onClose} style={styles.unlinkButton}><X color={muted} size={16} /></Pressable></View><TextInput accessibilityLabel="Название действия" onChangeText={setTitle} onSubmitEditing={save} placeholderTextColor={faint} style={styles.directionInput} value={title} />
    <View style={styles.extraField}><Text style={styles.sectionTitle}>Отложить до</Text><TextInput accessibilityLabel="Дата отсрочки в формате ГГГГ-ММ-ДД" inputMode="text" onChangeText={setDeferredUntil} placeholder="ГГГГ-ММ-ДД · необязательно" placeholderTextColor={faint} style={styles.directionInput} value={deferredUntil} /></View>
    <View style={styles.extraField}><Text style={styles.sectionTitle}>Сначала выполнить</Text><Pressable accessibilityRole="button" aria-pressed={!dependencyId} accessibilityState={{ selected: !dependencyId }} onPress={() => setDependencyId('')} style={[styles.dependencyOption, !dependencyId && styles.dependencyOptionActive]}><Text style={[styles.dependencyText, !dependencyId && styles.dependencyTextActive]}>Без зависимости</Text></Pressable>{candidates.length ? <ScrollView style={styles.dependencies}>{candidates.map((item) => <Pressable key={item.id} accessibilityRole="button" aria-pressed={dependencyId === item.id} accessibilityState={{ selected: dependencyId === item.id }} onPress={() => setDependencyId(dependencyId === item.id ? '' : item.id)} style={[styles.dependencyOption, dependencyId === item.id && styles.dependencyOptionActive]}><Text numberOfLines={2} style={[styles.dependencyText, dependencyId === item.id && styles.dependencyTextActive]}>{item.title}{item.status === 'completed' ? ' · выполнено' : ''}</Text></Pressable>)}</ScrollView> : <Text style={styles.taskMeta}>Других активных действий пока нет.</Text>}</View>
    <Pressable accessibilityRole="button" aria-pressed={archived} accessibilityState={{ checked: archived }} onPress={() => setArchived((value) => !value)} style={[styles.archiveAction, archived && styles.archivedActionActive]}><Text style={[styles.archiveActionText, archived && styles.archivedActionTextActive]}>{archived ? 'Восстановить действие из архива' : 'Переместить действие в архив'}</Text></Pressable><Text style={styles.taskMeta}>Архив скрывает действие из плана, сохраняя историю и ссылку в цели.</Text>
    {validationError?<Text accessibilityRole="alert" style={styles.notice}>{validationError}</Text>:null}<View style={styles.editorActions}><Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Отмена</Text></Pressable><Pressable disabled={!title.trim()} onPress={save} style={[styles.primaryButton, !title.trim() && styles.disabled]}><Text style={styles.primaryText}>Сохранить</Text></Pressable></View></View></View></Modal>;
}

const styles = StyleSheet.create({
  container: { gap: 12, minWidth: 0 }, header: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between' }, headerText: { flexBasis: 180, flexGrow: 1, flexShrink: 1, gap: 2, minWidth: 0 }, title: { color: text, fontSize: 18, fontWeight: '700' }, subtitle: { color: muted, fontSize: 12 }, zoom: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 6 }, zoomButton: { alignItems: 'center', borderColor: line, borderRadius: 16, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, zoomText: { color: text, fontSize: 20 }, zoomLabel: { color: muted, fontSize: 12, minWidth: 42, textAlign: 'center' },
  desktopGridWrap: { padding: 6 }, grid: { gap: 3 }, desktopGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 9 * 102 + 8 * 3 }, mobileGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' }, cell: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 14, borderWidth: 1, flexBasis: '10.7%', flexGrow: 1, height: 64, justifyContent: 'center', margin: 0, minWidth: 0, padding: 4 }, mobileCell: { aspectRatio: 1, flexBasis: '31.8%', flexGrow: 0, height: undefined }, goalCell: { backgroundColor: activeBg, borderColor: accent, flexBasis: '32.7%', flexGrow: 1.05 }, mobileGoalCell: { flexBasis: '31.8%', flexGrow: 0 }, directionCell: { backgroundColor: accentFaint, borderColor: accentBorder }, filledCell: { borderColor: accentBorder }, emptyCell: { backgroundColor: panel, borderStyle: 'dashed' }, goalCellText: { color: activeText, fontSize: 12, fontWeight: '700', lineHeight: 15, textAlign: 'center' }, cellTitle: { color: text, fontSize: 12, lineHeight: 16, textAlign: 'center' }, directionTitle: { color: accent, fontSize: 12, fontWeight: '700' }, cellStatus: { color: muted, fontSize: 11, lineHeight: 15, textAlign: 'center' }, mobileTabs: { borderBottomColor: line, borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, mobileTab: { flexBasis: '46%', flexGrow: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 4 }, mobileTabActive: { borderBottomColor: accent, borderBottomWidth: 2 }, mobileTabText: { color: muted, fontSize: 12, lineHeight: 16, textAlign: 'center' }, mobileTabTextActive: { color: accent, fontWeight: '700' }, overview: { gap: 8 }, overviewHint: { color: muted, fontSize: 12, lineHeight: 17, paddingVertical: 3 }, overviewRow: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 64, padding: 10 }, overviewIcon: { alignItems: 'center', backgroundColor: accentFaint, borderRadius: 20, height: 36, justifyContent: 'center', width: 36 }, overviewIndex: { color: accent, fontWeight: '700' }, directionCopy: { flex: 1, gap: 3, minWidth: 0 }, directionRowTitle: { color: text, fontSize: 13, fontWeight: '600' }, mobileBackRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 }, backButton: { alignItems: 'center', flexDirection: 'row', minHeight: 44 }, backText: { color: accent, fontSize: 12 }, selectedTitle: { color: text, flex: 1, fontSize: 13, fontWeight: '700' },
  editor: { backgroundColor: panelSoft, borderColor: line, borderRadius: 18, borderWidth: 1, gap: 9, padding: 12 }, editorHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' }, editorTitle: { color: text, fontSize: 14, fontWeight: '700' }, directionInput: { backgroundColor: panel, borderColor: line, borderRadius: 16, borderWidth: 1, color: text, fontSize: 14, minHeight: 44, paddingHorizontal: 11 }, sectionTitle: { color: text, fontSize: 12, fontWeight: '700', marginTop: 3 }, taskRow: { alignItems: 'center', backgroundColor: panel, borderColor: line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 52, paddingHorizontal: 8, paddingVertical: 5 }, taskCheck: { alignItems: 'center', borderColor: muted, borderRadius: 99, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, taskCheckDone: { backgroundColor: activeBg, borderColor: accent }, taskCopy: { flex: 1, gap: 2, minWidth: 0 }, taskTitle: { color: text, fontSize: 12, lineHeight: 16 }, taskTitleDone: { color: muted, textDecorationLine: 'line-through' }, taskMeta: { color: muted, fontSize: 12, lineHeight: 16 }, existingBox: { backgroundColor: accentFaint, borderRadius: 16, gap: 3, padding: 7 }, existingRow: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 44 }, existingText: { color: text, flex: 1, fontSize: 11 }, smallButton: { alignItems: 'center', borderColor: accentBorder, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 }, smallButtonText: { color: accent, fontSize: 11 }, unlinkButton: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 }, addRow: { alignItems: 'center', flexDirection: 'row', gap: 6 }, addInput: { backgroundColor: panel, borderColor: line, borderRadius: 16, borderWidth: 1, color: text, flex: 1, fontSize: 12, minHeight: 44, minWidth: 0, paddingHorizontal: 10 }, addButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 44, paddingHorizontal: 11 }, addButtonText: { color: activeText, fontSize: 11, fontWeight: '700' }, disabled: { opacity: 0.5 }, notice: { color: muted, fontSize: 11, lineHeight: 16 }, moveBox: { borderTopColor: line, borderTopWidth: 1, gap: 6, paddingTop: 7 }, moveRow: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 44 }, moveTitle: { color: text, fontSize: 10, maxWidth: 140 }, moveChoices: { alignItems: 'center', gap: 5 }, moveChoice: { borderColor: line, borderRadius: 99, borderWidth: 1, justifyContent: 'center', minHeight: 36, maxWidth: 100, paddingHorizontal: 8 }, moveChoiceText: { color: accent, fontSize: 10 }, toast: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 }, toastText: { color: activeText, flex: 1, fontSize: 11 }, toastClose: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 }, editorOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.48)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 }, quickEditor: { backgroundColor: panelSoft, borderColor: line, borderRadius: 14, borderWidth: 1, gap: 12, maxWidth: 420, padding: 14, width: '94%' }, editorActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }, secondaryButton: { alignItems: 'center', borderColor: line, borderRadius: 16, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 }, secondaryText: { color: text, fontSize: 12 }, primaryButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 }, primaryText: { color: activeText, fontSize: 12, fontWeight: '700' },
  conflicts: { backgroundColor: panelSoft, borderColor: accentBorder, borderRadius: 18, borderWidth: 1, gap: 7, padding: 11 }, conflictRow: { alignItems: 'center', borderTopColor: line, borderTopWidth: 1, flexDirection: 'row', gap: 8, minHeight: 48, paddingTop: 6 }, conflictLabel: { color: text, flex: 1, fontSize: 11, lineHeight: 15 }, restoreButton: { alignItems: 'center', borderColor: accentBorder, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 9 }, restoreText: { color: accent, fontSize: 11, fontWeight: '700' }, history: { backgroundColor: panelSoft, borderColor: line, borderRadius: 18, borderWidth: 1, gap: 5, padding: 10 }, historyToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 }, historyToggleText: { color: accent, fontSize: 11 }, mobileOverviewScroll: { maxHeight: 490, minHeight: 260 }, mobileOverviewGrid: { paddingBottom: 6, paddingRight: 6 }, extraField: { gap: 5 }, dependencies: { gap: 5, maxHeight: 156 }, dependencyOption: { borderColor: line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 9, paddingVertical: 5 }, dependencyOptionActive: { backgroundColor: accentFaint, borderColor: accentBorder }, dependencyText: { color: text, fontSize: 11, lineHeight: 15 }, dependencyTextActive: { color: accent, fontWeight: '700' }, archiveAction: { alignItems: 'center', borderColor: line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 }, archivedActionActive: { backgroundColor: accentFaint, borderColor: accentBorder }, archiveActionText: { color: muted, fontSize: 11 }, archivedActionTextActive: { color: accent, fontWeight: '700' },
  aiButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 },
  aiButtonText: { color: activeText, fontSize: 13, fontWeight: '700' },
  directionModalScroll: { flexGrow: 0, maxHeight: '92%', width: '94%' },
  directionModalContent: { paddingVertical: 16 },
  editorHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  compactGridWrap: { maxWidth: 560, width: '100%' },
});
