import {activeBg} from '../theme';
import { webSpaceActivationProps } from './keyboard';
import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type ViewStyle } from 'react-native';
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
  const {height: viewportHeight, width: viewportWidth} = useWindowDimensions();
  const compactFullscreen = viewportHeight < 800 || viewportWidth < 1350;
  const [selectedDirectionId, setSelectedDirectionId] = useState<string | null>(null);
  const [directionEditorOpen, setDirectionEditorOpen] = useState(false);
  const [fullscreenAreaSize, setFullscreenAreaSize] = useState({ width: 0, height: 0 });
  const [fullscreenPreview, setFullscreenPreview] = useState<{ index: number; title: string; detail: string } | null>(null);
  useEffect(()=>{if(initialDirectionId)setSelectedDirectionId(initialDirectionId);},[initialDirectionId]);
  const [gridMode, setGridMode] = useState<'compact' | 'full'>('compact');
  const [expandedGrid, setExpandedGrid] = useState(false);
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
    setDirectionEditorOpen(false);
    setGridMode('compact');
    setExpandedGrid(false);
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
  const directionColors = [
    { backgroundColor: '#E0E7FF', color: '#3730A3' }, { backgroundColor: '#DFF4FF', color: '#075985' },
    { backgroundColor: '#DCFCE7', color: '#166534' }, { backgroundColor: '#FEF3C7', color: '#92400E' },
    { backgroundColor: '#FFE4E6', color: '#9F1239' }, { backgroundColor: '#EDE9FE', color: '#5B21B6' },
    { backgroundColor: '#CCFBF1', color: '#115E59' }, { backgroundColor: '#FFEDD5', color: '#9A3412' },
  ];

  function renderMatrixCell(cell: Cell, index: number, overviewGrid = false, fullscreenBlock = false) {
    const isGoal = cell.kind === 'goal';
    const direction = cell.kind !== 'goal' ? directions.find((item) => item.id === cell.directionId) : undefined;
    const directionColor = direction ? directionColors[direction.position % directionColors.length]! : undefined;
    const isSelected = Boolean(selectedDirection && direction?.id === selectedDirection.id);
    const action = cell.kind === 'action' && cell.actionId ? goal.actions.find((item) => item.id === cell.actionId) : undefined;
    const routine = cell.kind === 'action' && cell.actionId ? goal.routines.find((item) => item.id === cell.actionId) : undefined;
    const displayActionTitle = action?.shortTitle?.trim() || action?.title;
    const cellLabel = isGoal ? goal.title : cell.kind === 'direction' ? direction?.title || '+ направление' : displayActionTitle ?? routine?.title ?? '+ действие';
    const status = action ? actionStatusLabel(goal, action) : routine ? routineLogValue(goal, routine.id) >= routine.targetValue ? 'Сегодня выполнено' : 'Регулярное' : '';
    const visibleStatus = status === 'Следующий шаг' ? '' : status;
    const actionCount = direction ? activeActions(direction).length + activeRoutines(direction).length : 0;
    const completedCount = direction ? activeActions(direction).filter((item) => item.status === 'completed').length + activeRoutines(direction).filter((item) => routineLogValue(goal, item.id) >= item.targetValue).length : 0;
    const row = Math.floor(cell.index / 9), column = cell.index % 9;
    const isOuterDirectionCenter = cell.kind === 'direction' && (Math.floor(row / 3) * 3 + Math.floor(column / 3) !== 4) && row % 3 === 1 && column % 3 === 1;
    const previewRole = isGoal ? 'Главная цель' : cell.kind === 'direction' ? isOuterDirectionCenter ? 'Действия направления' : 'Направление' : routine ? 'Регулярное действие' : 'Действие';
    const previewCell = () => {
      if (!fullscreenBlock) return;
      const fullText = action?.description?.trim() || action?.title || cellLabel;
      const shortText = action?.shortTitle?.trim();
      setFullscreenPreview({ index: cell.index, title: fullText, detail: `${shortText ? `Коротко: ${shortText} · ` : ''}${previewRole}${status ? ` · ${status}` : ''}` });
    };
    const fullscreenLineHeight = compactFullscreen ? 15 : 16;
    const fullscreenStatusHeight = isGoal || cell.kind === 'direction' && Boolean(direction?.title && actionCount) ? 12 : cell.kind === 'action' && !action && !routine ? 15 : (action || routine) && visibleStatus ? 12 : 0;
    const fullscreenReservedHeight = 8 + (cell.kind === 'direction' ? 12 : 0) + fullscreenStatusHeight;
    const fullscreenTextLines = Math.max(1, Math.floor((fullscreenAreaSize.height / 9 - fullscreenReservedHeight) / fullscreenLineHeight));
    const onCellPress = () => {
      previewCell();
      if (isGoal) { onRequestAI?.(); return; }
      if (action) { setEditingActionId(action.id); return; }
      if (routine) { toggleRoutine(routine); setNotice(`Обновлён статус «${routine.title}».`); return; }
      if (direction) { setSelectedDirectionId((current) => current === direction.id ? null : direction.id); setDirectionEditorOpen(false); setDirectionTitleDraft(direction.title ?? ''); }
    };
    const cellSize = fullscreenAreaSize.width > 0 && fullscreenAreaSize.height > 0 ? { width: fullscreenAreaSize.width / 9, height: fullscreenAreaSize.height / 9, flexBasis: fullscreenAreaSize.width / 9 } : {};
    const accessibilityCellLabel = action ? `${action.title}${action.shortTitle ? `. Коротко: ${action.shortTitle}` : ''}${action.description ? `. Подробности: ${action.description}` : ''}` : cellLabel;
    const cellBaseStyle: (ViewStyle | false | undefined)[] = [styles.cell, isGoal && styles.goalCell, cell.kind === 'direction' && styles.directionCell, cell.kind === 'action' && (action || routine) && styles.filledCell, cell.kind === 'action' && !action && !routine && styles.emptyCell, gridMode === 'full' && overviewGrid ? fullscreenBlock ? { ...styles.fullscreenCell, ...cellSize, borderTopWidth: row % 3 === 0 ? 2 : 0.5, borderLeftWidth: column % 3 === 0 ? 2 : 0.5, borderRightWidth: column === 8 ? 2 : 0.5, borderBottomWidth: row === 8 ? 2 : 0.5 } : { borderTopWidth: [3,6].includes(Math.floor(cell.index/9)) ? 2 : 1, borderLeftWidth: [3,6].includes(cell.index%9) ? 2 : 1, flexBasis: isDesktop ? '10%' : 154, flexGrow: isDesktop ? 1 : 0, flexShrink: 0, minHeight: action || routine ? 52 : 38, height: 'auto', padding: isDesktop ? 6 : 5, borderRadius: 7 } : styles.mobileCell];
    return (
      <Pressable {...webSpaceActivationProps(onCellPress)} key={`${cell.kind}-${index}-${direction?.id ?? ''}`} testID={fullscreenBlock ? `goal-matrix-fullscreen-cell-${cell.index}` : undefined} accessibilityRole="button" accessibilityLabel={isGoal ? `Цель: ${goal.title}. Помочь с направлениями` : `${cell.kind === 'direction' ? `${isOuterDirectionCenter ? 'Действия' : 'Направление'} ${direction ? direction.position + 1 : 1}` : `Действие направления ${direction ? direction.position + 1 : ''}`}: ${accessibilityCellLabel}${status ? `, ${status}` : ''}`} accessibilityHint={fullscreenBlock ? 'Наведи, сфокусируйся или удерживай, чтобы прочитать полный текст' : undefined} accessibilityActions={fullscreenBlock ? [{ name: 'showFullText', label: 'Показать полный текст' }] : undefined} onAccessibilityAction={({ nativeEvent }) => { if (nativeEvent.actionName === 'showFullText') previewCell(); }} onFocus={previewCell} onHoverIn={previewCell} onLongPress={previewCell} accessibilityState={{ selected: isSelected }} onPress={onCellPress} style={[...cellBaseStyle, fullscreenBlock && styles.fullscreenCellOverflow, isSelected && { borderColor: directionColor!.color, backgroundColor: directionColor!.backgroundColor }]}>
        {isGoal ? <><Text numberOfLines={fullscreenBlock ? fullscreenTextLines : gridMode === 'full' ? undefined : 2} style={[styles.goalCellText, fullscreenBlock && { fontSize: fullscreenLineHeight - 1, lineHeight: fullscreenLineHeight }]}>{goal.title}</Text><Text style={[styles.goalCellStatus, fullscreenBlock && { fontSize: 10, lineHeight: 12 }]}>Главная цель</Text></> : (
          <>
            {direction && (cell.kind === 'direction' || action || routine) ? <View style={styles.cellDirectionLabel}>{!fullscreenBlock || cell.kind === 'direction' ? <View style={[styles.directionBadge, fullscreenBlock && styles.smallDirectionBadge, { backgroundColor: directionColor!.backgroundColor }]}><Text style={[styles.directionBadgeText, fullscreenBlock && styles.smallDirectionBadgeText, { color: directionColor!.color }]}>{direction.position + 1}</Text></View> : null}{!fullscreenBlock ? <Text numberOfLines={1} style={[styles.cellRole, isSelected && styles.selectedCellText]}>{cell.kind === 'action' ? 'Действие' : isOuterDirectionCenter ? 'Действия' : 'Направление'}</Text> : cell.kind === 'direction' ? <Text numberOfLines={1} style={[styles.cellRole, isSelected && styles.selectedCellText]}>{isOuterDirectionCenter ? 'Действия' : 'Направление'}</Text> : null}</View> : null}
            {cell.kind === 'direction' || action || routine ? <Text numberOfLines={fullscreenBlock ? fullscreenTextLines : gridMode === 'full' && overviewGrid ? undefined : 2} style={[styles.cellTitle, cell.kind === 'direction' && styles.directionTitle, gridMode === 'full' && overviewGrid && { fontSize: fullscreenBlock ? fullscreenLineHeight - 3 : 14, lineHeight: fullscreenBlock ? fullscreenLineHeight : 18 }, fullscreenBlock && { textAlign: 'left', width: '100%' }, isSelected && styles.selectedCellText]}>{fullscreenBlock && cell.kind === 'action' && direction ? `${direction.position + 1} · ${displayActionTitle ?? routine?.title ?? ''}` : action ? displayActionTitle : routine?.title ?? (cell.kind === 'direction' ? cellLabel : '')}</Text> : null}
            {cell.kind === 'direction' ? direction?.title && actionCount ? <Text numberOfLines={1} style={[styles.cellStatus, isSelected && styles.selectedStatus]}>{completedCount}/{actionCount}</Text> : null : action || routine ? visibleStatus ? <Text numberOfLines={1} style={[styles.cellStatus, isSelected && styles.selectedStatus]}>{visibleStatus}</Text> : null : cell.kind === 'action' ? <View style={styles.emptyActionLabel}>{direction && <View style={[styles.directionBadge, styles.smallDirectionBadge, { backgroundColor: directionColor!.backgroundColor }]}><Text style={[styles.directionBadgeText, styles.smallDirectionBadgeText, { color: directionColor!.color }]}>{direction.position + 1}</Text></View>}<Text numberOfLines={1} style={[styles.cellStatus, isSelected && styles.selectedStatus]}>+ действие</Text></View> : null}
          </>
        )}
      </Pressable>
    );
  }

  const grid = (items: Cell[], desktopGrid: boolean, overviewGrid = false) => (
    <View style={[styles.grid, (desktopGrid || overviewGrid) && styles.desktopGrid, desktopGrid && { width: 9 * 102 + 8 * 3 }, overviewGrid && isDesktop && { width: '100%' }, overviewGrid && !isDesktop && { width: 9 * 154 + 8 * 3 }, !desktopGrid && !overviewGrid && styles.mobileGrid]}>
      {items.map((cell, index) => renderMatrixCell(cell, index, overviewGrid))}
    </View>
  );

  const renderSelectionBar = (compact = false) => selectedDirection ? <View style={[styles.selectionBar, compact && styles.compactSelectionBar]}><View style={[styles.directionBadge, compact && styles.smallDirectionBadge, { backgroundColor: directionColors[selectedDirection.position % directionColors.length]!.backgroundColor }]}><Text style={[styles.directionBadgeText, compact && styles.smallDirectionBadgeText, { color: directionColors[selectedDirection.position % directionColors.length]!.color }]}>{selectedDirection.position + 1}</Text></View><Text numberOfLines={1} style={[styles.selectedTitle, compact && styles.compactSelectedTitle]}>{selectedDirection.title || `Направление ${selectedDirection.position + 1}`}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Редактировать направление ${selectedDirection.position + 1}`} onPress={() => setDirectionEditorOpen(true)} style={[styles.editDirectionButton, compact && styles.compactSelectionAction]}><Text style={[styles.editDirectionButtonText, compact && {color: text}]}>Изменить</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Сбросить выбор направления" onPress={() => setSelectedDirectionId(null)} style={[styles.clearSelectionButton, compact && styles.compactSelectionAction]}><Text style={styles.clearSelectionText}>Сброс</Text></Pressable></View> : compact ? <Text style={styles.fullscreenLegend}>Цель → направления → действия</Text> : null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}><Text style={styles.title}>Квадраты ОТАНИ</Text><Text style={styles.subtitle}>Цель в центре · направления вокруг</Text></View>
        {gridMode === 'full' ? <Pressable accessibilityRole="button" accessibilityLabel="Открыть сетку на весь экран" onPress={() => setExpandedGrid(true)} style={styles.expandButton}><Text style={styles.expandButtonText}>На весь экран</Text></Pressable> : null}
        {onRequestAI ? <Pressable accessibilityRole="button" accessibilityLabel="Попросить AI предложить направления для цели" onPress={onRequestAI} style={styles.aiButton}><Sparkles size={16} color={activeText}/><Text style={styles.aiButtonText}>Собрать с помощником</Text></Pressable> : null}
      </View>

      <Text style={styles.matrixLegend}>Цель → направления → действия</Text>
      {renderSelectionBar()}

      <View style={styles.mobileTabs} accessibilityRole="tablist"><Pressable accessibilityRole="tab" aria-pressed={gridMode === 'compact'} accessibilityState={{ selected: gridMode === 'compact' }} onPress={() => setGridMode('compact')} style={[styles.mobileTab, gridMode === 'compact' && styles.mobileTabActive]}><Text style={[styles.mobileTabText, gridMode === 'compact' && styles.mobileTabTextActive]}>Направления</Text></Pressable><Pressable accessibilityRole="tab" aria-pressed={gridMode === 'full'} accessibilityState={{ selected: gridMode === 'full' }} onPress={() => setGridMode('full')} style={[styles.mobileTab, gridMode === 'full' && styles.mobileTabActive]}><Text style={[styles.mobileTabText, gridMode === 'full' && styles.mobileTabTextActive]}>Все 64 шага</Text></Pressable></View>

      {gridMode === 'full' ? (
        <View style={styles.overview}>
          <Text style={styles.overviewHint}>Выбери направление: подсветится его квадрат действий. Цвет и номер связывают ячейки.</Text>
          {isDesktop ? grid(cells, true, true) : <ScrollView horizontal showsHorizontalScrollIndicator><View style={styles.mobileOverviewGrid}>{grid(cells, false, true)}</View></ScrollView>}
        </View>
      ) : <View style={styles.compactGridWrap}><View style={styles.desktopGridWrap}>{grid(compactGridCells, false)}</View></View>}

      {expandedGrid && gridMode === 'full' ? <Modal animationType="fade" onRequestClose={() => setExpandedGrid(false)} visible><View style={styles.fullscreenContainer}><View style={styles.fullscreenHeader}><Text accessibilityRole="header" numberOfLines={1} style={styles.fullscreenTitle}>ОТАНИ · 9×9</Text>{renderSelectionBar(true)}<Pressable accessibilityRole="button" accessibilityLabel="Закрыть полноэкранную сетку" onPress={() => setExpandedGrid(false)} style={styles.fullscreenClose}><X color={text} size={18}/></Pressable></View><View accessibilityLiveRegion="polite" style={styles.fullscreenPreviewPanel}>{fullscreenPreview ? <ScrollView style={styles.fullscreenPreviewScroll} contentContainerStyle={styles.fullscreenPreviewContent}><Text style={styles.fullscreenPreviewTitle}>{fullscreenPreview.title}</Text><Text style={styles.fullscreenPreviewDetail}>{fullscreenPreview.detail}</Text></ScrollView> : <Text style={styles.fullscreenPreviewHint}>Наведи, сфокусируйся или удерживай ячейку — полный текст появится здесь.</Text>}</View><View testID="goal-matrix-fullscreen-grid" style={styles.fullscreenGridArea} onLayout={({ nativeEvent }) => { const { width, height } = nativeEvent.layout; setFullscreenAreaSize((current) => current.width === width && current.height === height ? current : { width, height }); }}><View style={styles.fullscreenGrid}>{cells.map((cell, index) => renderMatrixCell(cell, index, true, true))}</View></View></View></Modal> : null}

      {selectedDirection && directionEditorOpen ? <Modal animationType="none" onRequestClose={() => setDirectionEditorOpen(false)} transparent visible><View accessibilityViewIsModal accessibilityLabel={`Редактор направления ${selectedDirection.title || selectedDirection.position + 1}`} style={styles.editorOverlay}><ScrollView keyboardShouldPersistTaps="handled" style={styles.directionModalScroll} contentContainerStyle={styles.directionModalContent}><View style={styles.editor}>
          <View style={styles.editorHeader}><Text accessibilityRole="header" style={styles.editorTitle}>Направление {selectedDirection.position + 1}</Text><View style={styles.editorHeaderActions}>{selectedDirection.archivedAt ? <Pressable accessibilityRole="button" onPress={() => restoreDirection(selectedDirection)} style={styles.smallButton}><RotateCcw color={accent} size={14} /><Text style={styles.smallButtonText}>Восстановить</Text></Pressable> : <Pressable accessibilityRole="button" onPress={() => archiveDirection(selectedDirection)} style={styles.smallButton}><X color={muted} size={14} /><Text style={styles.smallButtonText}>В архив</Text></Pressable>}<Pressable accessibilityRole="button" accessibilityLabel="Закрыть редактор направления" onPress={() => setDirectionEditorOpen(false)} style={styles.unlinkButton}><X color={muted} size={16} /></Pressable></View></View>
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
  for (const snapshot of change.actionsSnapshot ?? []) {
    const index = actions.findIndex((item) => item.id === snapshot.id);
    if (index < 0) actions.push(snapshot);
    else actions[index] = { ...actions[index]!, title: snapshot.title, shortTitle: snapshot.shortTitle ?? '', description: snapshot.description ?? '' };
  }
  const routines = [...goal.routines];
  for (const snapshot of change.routinesSnapshot ?? []) if (!routines.some((item) => item.id === snapshot.id)) routines.push(snapshot);
  return updateOpenWindow({ ...goal, actions, routines }, change.directions, label);
}

function ActionQuickEditor({ action, allActions, onClose, onSave }: { action: GoalAction | null; allActions: GoalAction[]; onClose: () => void; onSave: (action: GoalAction) => void }) {
  const [title, setTitle] = useState(action?.title ?? '');
  const [shortTitle, setShortTitle] = useState(action?.shortTitle ?? '');
  const [description, setDescription] = useState(action?.description ?? '');
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
    onSave({ ...action, title: title.trim(), shortTitle: shortTitle.trim(), description: description.trim(), archivedAt: archived ? action.archivedAt ?? new Date().toISOString() : null, deferredUntil: deferredUntil.trim(), dependsOn: dependencyId ? [dependencyId] : [] });
  }
  const candidates = allActions.filter((item) => item.id !== action.id && !item.archivedAt);
  return <Modal animationType="none" onRequestClose={onClose} transparent visible><View accessibilityViewIsModal style={styles.editorOverlay}><ScrollView keyboardShouldPersistTaps="handled" style={styles.quickEditorScroll} contentContainerStyle={styles.quickEditorScrollContent}><View style={styles.quickEditor}><View style={styles.editorHeader}><Text style={styles.editorTitle}>Действие</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть редактор действия" onPress={onClose} style={styles.unlinkButton}><X color={muted} size={16} /></Pressable></View><TextInput accessibilityLabel="Исходное название действия" onChangeText={setTitle} onSubmitEditing={save} placeholderTextColor={faint} style={styles.directionInput} value={title} />
    <View style={styles.extraField}><Text style={styles.sectionTitle}>Короткая подпись для сетки · до 48 знаков</Text><TextInput accessibilityLabel="Короткая подпись действия для сетки" maxLength={48} onChangeText={setShortTitle} placeholder="Например: Позвонить врачу" placeholderTextColor={faint} style={styles.directionInput} value={shortTitle} /></View>
    <View style={styles.extraField}><Text style={styles.sectionTitle}>Подробности · до 1000 знаков</Text><TextInput accessibilityLabel="Подробности действия" maxLength={1000} multiline onChangeText={setDescription} placeholder="Что именно сделать, как подготовиться или проверить результат" placeholderTextColor={faint} style={[styles.directionInput, styles.descriptionInput]} value={description} /></View>
    <View style={styles.extraField}><Text style={styles.sectionTitle}>Отложить до</Text><TextInput accessibilityLabel="Дата отсрочки в формате ГГГГ-ММ-ДД" inputMode="text" onChangeText={setDeferredUntil} placeholder="ГГГГ-ММ-ДД · необязательно" placeholderTextColor={faint} style={styles.directionInput} value={deferredUntil} /></View>
    <View style={styles.extraField}><Text style={styles.sectionTitle}>Сначала выполнить</Text><Pressable accessibilityRole="button" aria-pressed={!dependencyId} accessibilityState={{ selected: !dependencyId }} onPress={() => setDependencyId('')} style={[styles.dependencyOption, !dependencyId && styles.dependencyOptionActive]}><Text style={[styles.dependencyText, !dependencyId && styles.dependencyTextActive]}>Без зависимости</Text></Pressable>{candidates.length ? <ScrollView style={styles.dependencies}>{candidates.map((item) => <Pressable key={item.id} accessibilityRole="button" aria-pressed={dependencyId === item.id} accessibilityState={{ selected: dependencyId === item.id }} onPress={() => setDependencyId(dependencyId === item.id ? '' : item.id)} style={[styles.dependencyOption, dependencyId === item.id && styles.dependencyOptionActive]}><Text numberOfLines={2} style={[styles.dependencyText, dependencyId === item.id && styles.dependencyTextActive]}>{item.title}{item.status === 'completed' ? ' · выполнено' : ''}</Text></Pressable>)}</ScrollView> : <Text style={styles.taskMeta}>Других активных действий пока нет.</Text>}</View>
    <Pressable accessibilityRole="button" aria-pressed={archived} accessibilityState={{ checked: archived }} onPress={() => setArchived((value) => !value)} style={[styles.archiveAction, archived && styles.archivedActionActive]}><Text style={[styles.archiveActionText, archived && styles.archivedActionTextActive]}>{archived ? 'Восстановить действие из архива' : 'Переместить действие в архив'}</Text></Pressable><Text style={styles.taskMeta}>Архив скрывает действие из плана, сохраняя историю и ссылку в цели.</Text>
    {validationError?<Text accessibilityRole="alert" style={styles.notice}>{validationError}</Text>:null}<View style={styles.editorActions}><Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryText}>Отмена</Text></Pressable><Pressable disabled={!title.trim()} onPress={save} style={[styles.primaryButton, !title.trim() && styles.disabled]}><Text style={styles.primaryText}>Сохранить</Text></Pressable></View></View></ScrollView></View></Modal>;
}

const styles = StyleSheet.create({
  container: { gap: 9, minWidth: 0 }, header: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' }, headerText: { flexBasis: 180, flexGrow: 1, flexShrink: 1, gap: 2, minWidth: 0 }, title: { color: text, fontSize: 16, fontWeight: '700' }, subtitle: { color: muted, fontSize: 11 }, zoom: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 6 }, zoomButton: { alignItems: 'center', borderColor: line, borderRadius: 12, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, zoomText: { color: text, fontSize: 20 }, zoomLabel: { color: muted, fontSize: 12, minWidth: 42, textAlign: 'center' },
  desktopGridWrap: { alignItems: 'center', padding: 2 }, grid: { gap: 3 }, desktopGrid: { flexDirection: 'row', flexWrap: 'wrap', width: 9 * 102 + 8 * 3 }, mobileGrid: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' }, cell: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 11, borderWidth: 1, flexBasis: '10.7%', flexGrow: 1, height: 64, justifyContent: 'center', margin: 0, minWidth: 0, padding: 5 }, mobileCell: { flexBasis: '32.7%', flexGrow: 0, height: 96, minHeight: 96 }, goalCell: { backgroundColor: activeBg, borderColor: accent, flexBasis: '32.7%', flexGrow: 1.05 }, mobileGoalCell: { flexBasis: '31.8%', flexGrow: 0 }, directionCell: { backgroundColor: panelSoft, borderColor: line }, filledCell: { borderColor: accentBorder }, emptyCell: { backgroundColor: panel, borderStyle: 'dashed' }, directionBadge: { alignItems: 'center', borderRadius: 99, height: 20, justifyContent: 'center', width: 20 }, smallDirectionBadge: { height: 15, width: 15 }, smallDirectionBadgeText: { fontSize: 9, lineHeight: 12 }, directionBadgeText: { fontSize: 11, fontWeight: '800', lineHeight: 14 }, cellDirectionLabel: { alignItems: 'center', flexDirection: 'row', gap: 3, justifyContent: 'center', maxWidth: '100%' }, cellRole: { color: muted, flexShrink: 1, fontSize: 9, fontWeight: '700', lineHeight: 12 }, emptyActionLabel: { alignItems: 'center', flexDirection: 'row', gap: 3, justifyContent: 'center' }, selectedCellText: { color: '#172033' }, selectedStatus: { color: '#344054' }, goalCellText: { color: activeText, fontSize: 12, fontWeight: '700', lineHeight: 15, textAlign: 'center' }, goalCellStatus: { color: activeText, fontSize: 10, lineHeight: 13, textAlign: 'center' }, cellTitle: { color: text, fontSize: 12, lineHeight: 16, textAlign: 'center' }, directionTitle: { color: text, fontSize: 12, fontWeight: '700' }, cellStatus: { color: muted, fontSize: 10, lineHeight: 13, textAlign: 'center' }, mobileTabs: { alignSelf: 'flex-start', backgroundColor: panel, borderColor: line, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 3, padding: 3 }, mobileTab: { alignItems: 'center', borderRadius: 9, justifyContent: 'center', minHeight: 40, paddingHorizontal: 12 }, mobileTabActive: { backgroundColor: panelSoft }, mobileTabText: { color: muted, fontSize: 12, lineHeight: 16, textAlign: 'center' }, mobileTabTextActive: { color: text, fontWeight: '700' }, overview: { gap: 8 }, overviewHint: { color: muted, fontSize: 11, lineHeight: 15, paddingVertical: 2 }, overviewRow: { alignItems: 'center', backgroundColor: panelSoft, borderColor: line, borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 64, padding: 10 }, overviewIcon: { alignItems: 'center', backgroundColor: accentFaint, borderRadius: 20, height: 36, justifyContent: 'center', width: 36 }, overviewIndex: { color: accent, fontWeight: '700' }, directionCopy: { flex: 1, gap: 3, minWidth: 0 }, directionRowTitle: { color: text, fontSize: 13, fontWeight: '600' }, mobileBackRow: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 44 }, backButton: { alignItems: 'center', flexDirection: 'row', minHeight: 44 }, backText: { color: accent, fontSize: 12 }, selectedTitle: { color: text, flex: 1, fontSize: 13, fontWeight: '700' },
  editor: { backgroundColor: panelSoft, borderColor: line, borderRadius: 18, borderWidth: 1, gap: 9, padding: 12 }, editorHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' }, editorTitle: { color: text, fontSize: 14, fontWeight: '700' }, directionInput: { backgroundColor: panel, borderColor: line, borderRadius: 16, borderWidth: 1, color: text, fontSize: 16, minHeight: 44, paddingHorizontal: 11 }, sectionTitle: { color: text, fontSize: 12, fontWeight: '700', marginTop: 3 }, taskRow: { alignItems: 'center', backgroundColor: panel, borderColor: line, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 52, paddingHorizontal: 8, paddingVertical: 5 }, taskCheck: { alignItems: 'center', borderColor: muted, borderRadius: 99, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, taskCheckDone: { backgroundColor: activeBg, borderColor: accent }, taskCopy: { flex: 1, gap: 2, minWidth: 0 }, taskTitle: { color: text, fontSize: 12, lineHeight: 16 }, taskTitleDone: { color: muted, textDecorationLine: 'line-through' }, taskMeta: { color: muted, fontSize: 12, lineHeight: 16 }, existingBox: { backgroundColor: accentFaint, borderRadius: 16, gap: 3, padding: 7 }, existingRow: { alignItems: 'center', flexDirection: 'row', gap: 7, minHeight: 44 }, existingText: { color: text, flex: 1, fontSize: 11 }, smallButton: { alignItems: 'center', borderColor: accentBorder, borderRadius: 9, borderWidth: 1, flexDirection: 'row', gap: 4, justifyContent: 'center', minHeight: 44, paddingHorizontal: 8 }, smallButtonText: { color: accent, fontSize: 11 }, unlinkButton: { alignItems: 'center', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 }, addRow: { alignItems: 'center', flexDirection: 'row', gap: 6 }, addInput: { backgroundColor: panel, borderColor: line, borderRadius: 16, borderWidth: 1, color: text, flex: 1, fontSize: 16, minHeight: 44, minWidth: 0, paddingHorizontal: 10 }, addButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 44, paddingHorizontal: 11 }, addButtonText: { color: activeText, fontSize: 11, fontWeight: '700' }, disabled: { opacity: 0.5 }, notice: { color: muted, fontSize: 11, lineHeight: 16 }, moveBox: { borderTopColor: line, borderTopWidth: 1, gap: 6, paddingTop: 7 }, moveRow: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 44 }, moveTitle: { color: text, fontSize: 10, maxWidth: 140 }, moveChoices: { alignItems: 'center', gap: 5 }, moveChoice: { borderColor: line, borderRadius: 99, borderWidth: 1, justifyContent: 'center', minHeight: 36, maxWidth: 100, paddingHorizontal: 8 }, moveChoiceText: { color: accent, fontSize: 10 }, toast: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingVertical: 8 }, toastText: { color: activeText, flex: 1, fontSize: 11 }, toastClose: { alignItems: 'center', height: 32, justifyContent: 'center', width: 32 }, editorOverlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.48)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 }, quickEditor: { backgroundColor: panelSoft, borderColor: line, borderRadius: 14, borderWidth: 1, gap: 12, maxWidth: 420, padding: 14, width: '94%' }, editorActions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end' }, secondaryButton: { alignItems: 'center', borderColor: line, borderRadius: 16, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 12 }, secondaryText: { color: text, fontSize: 12 }, primaryButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 44, paddingHorizontal: 14 }, primaryText: { color: activeText, fontSize: 12, fontWeight: '700' },
  conflicts: { backgroundColor: panelSoft, borderColor: accentBorder, borderRadius: 18, borderWidth: 1, gap: 7, padding: 11 }, conflictRow: { alignItems: 'center', borderTopColor: line, borderTopWidth: 1, flexDirection: 'row', gap: 8, minHeight: 48, paddingTop: 6 }, conflictLabel: { color: text, flex: 1, fontSize: 11, lineHeight: 15 }, restoreButton: { alignItems: 'center', borderColor: accentBorder, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 9 }, restoreText: { color: accent, fontSize: 11, fontWeight: '700' }, history: { backgroundColor: panelSoft, borderColor: line, borderRadius: 18, borderWidth: 1, gap: 5, padding: 10 }, historyToggle: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', minHeight: 44 }, historyToggleText: { color: accent, fontSize: 11 }, mobileOverviewScroll: { maxHeight: 490, minHeight: 260 }, mobileOverviewGrid: { paddingBottom: 6, paddingRight: 6 }, extraField: { gap: 5 }, dependencies: { gap: 5, maxHeight: 156 }, dependencyOption: { borderColor: line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 9, paddingVertical: 5 }, dependencyOptionActive: { backgroundColor: accentFaint, borderColor: accentBorder }, dependencyText: { color: text, fontSize: 11, lineHeight: 15 }, dependencyTextActive: { color: accent, fontWeight: '700' }, archiveAction: { alignItems: 'center', borderColor: line, borderRadius: 9, borderWidth: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 }, archivedActionActive: { backgroundColor: accentFaint, borderColor: accentBorder }, archiveActionText: { color: muted, fontSize: 11 }, archivedActionTextActive: { color: accent, fontWeight: '700' },
  aiButton: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: activeBg, borderRadius: 12, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 40, paddingHorizontal: 12 },
  aiButtonText: { color: activeText, fontSize: 13, fontWeight: '700' },
  fullscreenContainer: { backgroundColor: panel, flex: 1, gap: 6, paddingHorizontal: 10, paddingVertical: 6 },
  fullscreenHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, minHeight: 36 },
  fullscreenTitle: { color: text, flexShrink: 0, fontSize: 14, fontWeight: '700' },
  fullscreenLegend: { color: muted, fontSize: 11, lineHeight: 14 },
  fullscreenClose: { alignItems: 'center', borderColor: line, borderRadius: 9, borderWidth: 1, height: 36, justifyContent: 'center', width: 36 },
  fullscreenPreviewPanel: { backgroundColor: panelSoft, borderColor: line, borderRadius: 8, borderWidth: 1, flexShrink: 0, height: 58, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 3 },
  fullscreenPreviewScroll: { flex: 1 },
  fullscreenPreviewContent: { flexGrow: 1, justifyContent: 'center', paddingVertical: 2 },
  fullscreenPreviewTitle: { color: text, fontSize: 12, lineHeight: 15 },
  fullscreenPreviewDetail: { color: muted, fontSize: 10, lineHeight: 12 },
  fullscreenPreviewHint: { color: muted, fontSize: 11, lineHeight: 14 },
  fullscreenGridArea: { flex: 1, minHeight: 0, width: '100%' },
  fullscreenGrid: { alignContent: 'stretch', alignItems: 'stretch', flex: 1, flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  fullscreenCell: { borderRadius: 0, borderWidth: 0.5, flexBasis: '11.111%', flexGrow: 0, flexShrink: 0, height: 'auto', justifyContent: 'flex-start', minHeight: 24, padding: 2 },
  fullscreenCellOverflow: { overflow: 'hidden' },
  quickEditorScroll: { maxHeight: '92%', width: '94%' },
  quickEditorScrollContent: { paddingVertical: 8 },
  descriptionInput: { minHeight: 88, textAlignVertical: 'top', paddingTop: 9 },
  compactSelectionBar: { backgroundColor: 'transparent', borderWidth: 0, flex: 1, flexWrap: 'nowrap', gap: 4, justifyContent: 'flex-end', minHeight: 32, padding: 0 },
  compactSelectedTitle: { flex: 1, fontSize: 11, maxWidth: 190 },
  compactSelectionAction: { backgroundColor: 'transparent', borderColor: line, borderWidth: 1, minHeight: 32, paddingHorizontal: 7 },
  matrixLegend: { color: muted, fontSize: 11, lineHeight: 15 },
  selectionBar: { alignItems: 'center', backgroundColor: panelSoft, borderColor: accentBorder, borderRadius: 12, borderWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 7, padding: 6 },
  editDirectionButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 9, justifyContent: 'center', minHeight: 40, paddingHorizontal: 10 },
  editDirectionButtonText: { color: activeText, fontSize: 11, fontWeight: '700' },
  clearSelectionButton: { alignItems: 'center', justifyContent: 'center', minHeight: 40, paddingHorizontal: 6 },
  clearSelectionText: { color: muted, fontSize: 11 },
  directionModalScroll: { flexGrow: 0, maxHeight: '92%', width: '94%' },
  directionModalContent: { paddingVertical: 16 },
  editorHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  expandButton: { borderWidth: 1, borderColor: line, borderRadius: 12, paddingHorizontal: 14, minHeight: 44, justifyContent: 'center' },
  expandButtonText: { color: text, fontSize: 13, fontWeight: '600' },
  compactGridWrap: { alignItems: 'center', maxWidth: 600, width: '100%' },
});
