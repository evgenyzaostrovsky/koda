import {normalizeGoalActionDetails, type GoalPlanSuggestion} from '../../ai/goalPlanContract';
import {calculateMilestoneProgress, createGoalAction, createMilestone} from './goalLogic';
import type {Goal} from './types';

const key = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ru');

/** Structural receipt for the UI after recordGoalEdits/normalization. Progress and
 * sync stamps may change independently; neither is evidence that a route was applied. */
export function goalRoadmapStructureSignature(goal: Goal): string {
  const byId = (a: {id: string}, b: {id: string}) => a.id.localeCompare(b.id);
  return JSON.stringify({
    goalId: goal.id,
    milestones: [...goal.milestones].sort(byId).map(({id, title, position}) => ({id, title, position})),
    actions: [...goal.actions].sort(byId).map(({id, title, milestoneId, position}) => ({id, title, milestoneId, position})),
  });
}

/** Apply a reviewed proposal to the latest goal, after the caller's stale-review
 * check. Additive only: omitted work, OTANI links/history and existing copy survive.
 * Persist the result through the normal recordGoalEdits boundary, not directly. */
export function applyGoalRoadmap(goal: Goal, proposal: GoalPlanSuggestion): Goal {
  if (goal.deletedAt || goal.archivedAt || goal.status === 'archived') {
    throw new Error('Цель удалена или находится в архиве. Сначала восстанови её.');
  }
  if (!proposal.directions.length) throw new Error('Оставь хотя бы один этап маршрута.');

  const milestones = [...goal.milestones], actions = [...goal.actions];
  const stageNames = new Set<string>(), actionNames = new Set<string>();
  let nextStagePosition = Math.max(-1, ...milestones.map(stage => stage.position)) + 1;
  let nextActionPosition = Math.max(-1, ...actions.map(action => action.position)) + 1;
  let changed = false;

  for (const source of proposal.directions) {
    const title = source.title.trim(), name = key(title);
    if (!name || title.length > 300) throw new Error('Дай каждому этапу название длиной до 300 символов.');
    if (stageNames.has(name)) throw new Error('У этапов должны быть разные названия.');
    stageNames.add(name);
    const matches = milestones.filter(stage => key(stage.title) === name);
    if (matches.length > 1) throw new Error(`В цели несколько этапов «${title}». Уточни их названия перед применением.`);
    let stage = matches[0];
    if (!stage) {
      stage = createMilestone(title, '', '', nextStagePosition++);
      milestones.push(stage);
      changed = true;
    }
    const stageCompleted = stage.status === 'completed' || calculateMilestoneProgress(stage, goal.actions) === 100;
    const details = normalizeGoalActionDetails(source.actionDetails, source.actions);
    for (const raw of source.actions) {
      const actionTitle = raw.trim(), actionName = key(actionTitle);
      if (!actionName || actionTitle.length > 300) throw new Error('Дай каждому шагу название длиной до 300 символов.');
      if (actionNames.has(actionName)) throw new Error(`В предложении повторяется шаг «${actionTitle}». Оставь его в одном этапе.`);
      actionNames.add(actionName);
      const existing = actions.filter(action => key(action.title) === actionName);
      if (existing.length > 1) throw new Error(`В цели несколько шагов «${actionTitle}». Уточни их названия перед применением.`);
      const action = existing[0];
      if (action) {
        if (action.archivedAt) throw new Error(`Шаг «${actionTitle}» находится в архиве. Сначала восстанови его.`);
        if (action.milestoneId === stage.id) continue;
        if (action.milestoneId) throw new Error(`Шаг «${actionTitle}» уже связан с другим этапом. Перенеси его вручную.`);
        if (stageCompleted && action.status !== 'completed') throw new Error(`Этап «${title}» завершён. Добавь будущие шаги в новый этап.`);
        // Reuse a backlog action without changing status, notes, dates or OTANI links.
        actions[actions.indexOf(action)] = {...action, milestoneId: stage.id};
      } else {
        if (goal.routines.some(routine => key(routine.title) === actionName)) {
          throw new Error(`«${actionTitle}» уже есть среди регулярных действий. Уточни отдельный шаг маршрута.`);
        }
        if (stageCompleted) throw new Error(`Этап «${title}» завершён. Добавь будущие шаги в новый этап.`);
        const detail = details.find(item => key(item.title) === actionName);
        actions.push(createGoalAction({title: actionTitle, milestoneId: stage.id, position: nextActionPosition++,
          ...(detail ? {shortTitle: detail.shortTitle, description: detail.description} : {}),
        }));
      }
      changed = true;
    }
  }
  return changed ? {...goal, milestones, actions, updatedAt: new Date().toISOString()} : goal;
}
