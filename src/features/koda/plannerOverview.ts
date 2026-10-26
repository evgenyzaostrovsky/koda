import type { Goal, PlannerItem } from './types';
import { getGoalDayEntries } from './kodaScore';

export function isPlannerDate(value:string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function plannerDateOffset(value:string,offset:number) {
  const date=new Date(`${value}T12:00:00Z`); date.setUTCDate(date.getUTCDate()+offset); return date.toISOString().slice(0,10);
}
export function plannerWorkKey(item:PlannerItem) {
  if(item.goalId&&item.goalActionId)return `action:${item.goalId}:${item.goalActionId}`;
  if(item.sourceType==='project'&&item.sourceId)return `project:${item.ownerId}:${item.sourceId}`;
  return item.id;
}
/** Calendar sources only: habits stay in their own widget; never infer a date from a title. */
export function plannerOverview(items:PlannerItem[],today:string,limit=3) {
  const unique=new Map<string,PlannerItem>();
  for(const item of items){
    if(item.id.startsWith('habit:'))continue;
    const key=plannerWorkKey(item), previous=unique.get(key);
    const stamp=(value:PlannerItem)=>value.deletedAt||value.updatedAt||'';
    if(!previous||stamp(item)>stamp(previous)||(stamp(item)===stamp(previous)&&(Boolean(item.deletedAt)||item.done||item.failed)))unique.set(key,item);
  }
  const pending=[...unique.values()].filter(i=>!i.deletedAt&&!i.done&&!i.failed);
  const compare=(a:PlannerItem,b:PlannerItem)=>a.date.localeCompare(b.date)||(a.time||'99:99').localeCompare(b.time||'99:99')||plannerWorkKey(a).localeCompare(plannerWorkKey(b));
  return {
    upcoming:pending.filter(i=>isPlannerDate(i.date)&&i.date>=today).sort(compare).slice(0,limit),
    overdue:pending.filter(i=>isPlannerDate(i.date)&&i.date<today).sort(compare),
    undated:pending.filter(i=>!i.date).sort((a,b)=>plannerWorkKey(a).localeCompare(plannerWorkKey(b))),
  };
}
/** Same goal entries as the full planner, excluding archived/deferred/blocked work. */
export function plannerGoalEntries(goal:Goal,date:string){
  return getGoalDayEntries(goal,date).filter(entry=>entry.kind==='routine'||(!entry.action.archivedAt&&
    (!entry.action.deferredUntil||entry.action.deferredUntil<=date)&&
    (entry.action.dependsOn??[]).every(id=>goal.actions.some(a=>a.id===id&&a.status==='completed'))));
}
/** Read-only projection, never a second persisted task or recurrence engine. */
export function goalOverviewItems(goals:Goal[],today:string):PlannerItem[]{
  const result:PlannerItem[]=[];
  for(const goal of goals){
    if(goal.status!=='active'||goal.archivedAt)continue;
    for(const action of goal.actions){
      if(!isPlannerDate(action.dueDate)||action.archivedAt||
        !(action.dependsOn??[]).every(id=>goal.actions.some(a=>a.id===id&&a.status==='completed')))continue;
      result.push({id:`goal-action:${goal.id}:${action.id}`,title:action.title,date:action.deferredUntil&&isPlannerDate(action.deferredUntil)&&action.deferredUntil>action.dueDate?action.deferredUntil:action.dueDate,time:'',done:action.status==='completed',sourceType:'goal',sourceId:action.id,goalId:goal.id,goalActionId:action.id,milestoneId:action.milestoneId});
    }
    const seen=new Map<string,number>();
    for(let offset=0;offset<32;offset++){
      const date=plannerDateOffset(today,offset);
      for(const entry of plannerGoalEntries(goal,date)){
        if(entry.kind!=='routine'||(seen.get(entry.routine.id)??0)>=2)continue;
        seen.set(entry.routine.id,(seen.get(entry.routine.id)??0)+1);
        result.push({id:`goal-routine:${goal.id}:${entry.routine.id}:${date}`,title:entry.routine.title,date,time:'',done:entry.completionRatio>=1,sourceType:'goal',sourceId:entry.routine.id,goalId:goal.id});
      }
    }
  }
  return result;
}
