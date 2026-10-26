import type { Goal, KodaDay, Note, NoteBlock, PlannerItem } from './types';
import { plannerDateOffset, plannerOverview } from './plannerOverview';

export const widgetIds = ['day','planner','goal','score','notes','focus','projects','habits','assistant','journal','progress'] as const;
export type WidgetId = typeof widgetIds[number];
export type WidgetLayout = { order: WidgetId[]; hidden: WidgetId[] };
export function displayedWidgetOrder(layout: WidgetLayout, wide: boolean): WidgetId[] {
  const original = layout.order.join(',') === widgetIds.join(',');
  return original ? (wide ? ['day','goal','score','planner','notes','focus','projects','habits','assistant','journal','progress'] : ['day','planner','score','goal','focus','notes','habits','projects','assistant','journal','progress']) : [...layout.order];
}
export function moveWidget(layout: WidgetLayout, displayOrder: WidgetId[], source: WidgetId, target: WidgetId): WidgetLayout {
  const order = [...displayOrder], from = order.indexOf(source), to = order.indexOf(target);
  if (from < 0 || to < 0 || from === to) return layout;
  order.splice(from, 1);
  order.splice(to, 0, source);
  return normalizeWidgetLayout({ ...layout, order });
}
export function normalizeWidgetLayout(value: unknown): WidgetLayout {
  const raw = value && typeof value === 'object' ? value as Partial<WidgetLayout> : {};
  const valid = (id: unknown): id is WidgetId => widgetIds.includes(id as WidgetId);
  const order = Array.isArray(raw.order) ? [...new Set(raw.order.filter(valid))] : [];
  return { order: [...order,...widgetIds.filter(id=>!order.includes(id))], hidden: Array.isArray(raw.hidden) ? [...new Set(raw.hidden.filter(valid))] : [] };
}
export function nearestPlannerItems(items: PlannerItem[], date: string) {
  return plannerOverview(items,date).upcoming;
}
export function widgetMainGoal(goals: Goal[]) {
  return goals.filter(g=>g.status==='active'&&!g.archivedAt).sort((a,b)=>Number(b.priority==='main')-Number(a.priority==='main')||a.createdAt.localeCompare(b.createdAt))[0];
}
export function cleanNotePreview(note: Note) {
  const flatten = (blocks: NoteBlock[]):string => blocks.map(block=>[block.text,block.children?flatten(block.children):''].join(' ')).join(' ');
  return flatten(note.content.content).replace(/<[^>]*>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/\s+/g,' ').trim();
}
export function scoreHistory(days: KodaDay[]) {
  return days.filter(d=>d.status==='completed'&&d.scoreVersion===3&&typeof d.totalScore==='number'&&Number.isFinite(d.totalScore)).sort((a,b)=>a.localDate.localeCompare(b.localDate)).slice(-7);
}

export function scoreWeek(days:KodaDay[],date:string,count=7){
  return Array.from({length:count},(_,index)=>{
    const key=plannerDateOffset(date,index-count+1);
    const day=days.filter(d=>d.localDate===key).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))[0];
    const current=day?.status==='completed'&&day.scoreVersion===3&&typeof day.totalScore==='number'&&Number.isFinite(day.totalScore);
    return {date:key,day,value:current?day.totalScore!:null,status:current?'completed':day?.status==='completed'?'legacy':day?.status==='active'?'active':'empty'} as const;
  });
}
