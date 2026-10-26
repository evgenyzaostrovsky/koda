import type {GoalPlanInput} from '../../ai/goalPlanContract';
import {createOpenWindow} from './openWindow';
import type {Goal} from './types';

/** Only this goal's facts are sent; no chat history, other goals or private profile. */
export function buildGoalPlanContext(goal:Goal):Required<Pick<GoalPlanInput,'existingDirections'|'goalProgress'>> {
  const window=goal.openWindow??createOpenWindow(goal.id);
  const linked=(ids:string[])=>ids.map(id=>goal.actions.find(action=>action.id===id)).filter((action):action is Goal['actions'][number]=>Boolean(action));
  return {
    existingDirections:[...window.directions].sort((a,b)=>a.position-b.position).slice(0,8).map(direction=>({
      title:direction.title,actions:linked(direction.actionIds).map(action=>action.title),
      completedActions:linked(direction.actionIds).filter(action=>action.status==='completed').map(action=>action.title),
      routineTitles:direction.routineIds.map(id=>goal.routines.find(routine=>routine.id===id)?.title).filter((title):title is string=>title!==undefined),
      archived:Boolean(direction.archivedAt),
    })),
    goalProgress:{
      completedActions:goal.actions.filter(action=>action.status==='completed'&&!action.archivedAt).map(action=>action.title),
      pendingActions:goal.actions.filter(action=>action.status==='pending'&&!action.archivedAt).map(action=>action.title),
      milestones:[...goal.milestones].sort((a,b)=>a.position-b.position).map(({title,status})=>({title,status})),
      ...(goal.deadline?{deadline:goal.deadline}:{}),
    },
  };
}
