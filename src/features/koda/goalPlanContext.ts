import type {GoalPlanInput} from '../../ai/goalPlanContract';
import {createOpenWindow} from './openWindow';
import {calculateMilestoneProgress} from './goalLogic';
import type {Goal} from './types';

/** Only this goal's facts are sent; no chat history, other goals or private profile. */
export function buildGoalPlanContext(goal:Goal,planningMethod:'otani'|'roadmap'='otani'):Required<Pick<GoalPlanInput,'existingDirections'|'goalProgress'>> {
  const window=goal.openWindow??createOpenWindow(goal.id);
  const linked=(ids:string[])=>ids.map(id=>goal.actions.find(action=>action.id===id)).filter((action):action is Goal['actions'][number]=>Boolean(action));
  return {
    existingDirections:planningMethod==='roadmap'?[...goal.milestones].sort((a,b)=>a.position-b.position).slice(0,8).map(stage=>{
      const actions=goal.actions.filter(action=>action.milestoneId===stage.id&&!action.archivedAt).sort((a,b)=>a.position-b.position);
      return {title:stage.title,actions:actions.map(action=>action.title),
        actionDetails:actions.filter(action=>action.shortTitle||action.description).map(action=>({title:action.title,...(action.shortTitle===undefined?{}:{shortTitle:action.shortTitle}),description:action.description})),
        completedActions:actions.filter(action=>action.status==='completed').map(action=>action.title),
        routineTitles:[],archived:false};
    }):[...window.directions].sort((a,b)=>a.position-b.position).slice(0,8).map(direction=>({
      title:direction.title,actions:linked(direction.actionIds).map(action=>action.title),
      actionDetails:linked(direction.actionIds).filter(action=>action.shortTitle||action.description).map(action=>({title:action.title,...(action.shortTitle===undefined?{}:{shortTitle:action.shortTitle}),description:action.description})),
      completedActions:linked(direction.actionIds).filter(action=>action.status==='completed').map(action=>action.title),
      routineTitles:direction.routineIds.map(id=>goal.routines.find(routine=>routine.id===id)?.title).filter((title):title is string=>title!==undefined),
      archived:Boolean(direction.archivedAt),
    })),
    goalProgress:{
      completedActions:goal.actions.filter(action=>action.status==='completed'&&!action.archivedAt).map(action=>action.title),
      pendingActions:goal.actions.filter(action=>action.status==='pending'&&!action.archivedAt).map(action=>action.title),
      milestones:[...goal.milestones].sort((a,b)=>a.position-b.position).map(stage=>{
        if(planningMethod==='otani')return {title:stage.title,status:stage.status};
        const progress=calculateMilestoneProgress(stage,goal.actions);
        return {title:stage.title,status:progress===100?'completed' as const:progress>0||stage.status==='in_progress'?'in_progress' as const:'not_started' as const};
      }),
      ...(goal.deadline?{deadline:goal.deadline}:{}),
    },
  };
}
