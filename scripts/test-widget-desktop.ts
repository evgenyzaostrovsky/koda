import assert from 'node:assert/strict';
import { cleanNotePreview, nearestPlannerItems, normalizeWidgetLayout, displayedWidgetOrder, moveWidget, scoreHistory, widgetIds, widgetMainGoal } from '../src/features/koda/widgetDesktop';
import { createGoal, createMilestone, createGoalAction } from '../src/features/koda/goalLogic';
import { currentGoalMilestone } from '../src/features/koda/components/goalPresentation';
import type { KodaDay, Note, PlannerItem } from '../src/features/koda/types';
const layout=normalizeWidgetLayout({order:['notes','notes','removed','day'],hidden:['removed','notes','notes']});
assert.equal(new Set(layout.order).size,widgetIds.length);assert.deepEqual(layout.order.slice(0,2),['notes','day']);assert.deepEqual(layout.hidden,['notes']);
assert.deepEqual(normalizeWidgetLayout(null).order,[...widgetIds]);
const row=(id:string,date:string,time='',extra:Partial<PlannerItem>={}):PlannerItem=>({id,date,time,title:id,done:false,...extra});
assert.deepEqual(nearestPlannerItems([row('undated',''),row('overdue','2026-10-22'),row('late','2026-10-23','18:00'),row('untimed','2026-10-23'),row('early','2026-10-23','09:00'),row('done','2026-10-23','08:00',{done:true}),row('deleted','2026-10-23','07:00',{deletedAt:'now'})],'2026-10-23').map(i=>i.id),['early','late','untimed']);
const goal=createGoal({title:'Главная',desiredResult:'Результат',priority:'main',deadline:''});const other=createGoal({title:'Другая',desiredResult:'Результат',priority:'important',deadline:''});
assert.equal(widgetMainGoal([other,goal])?.id,goal.id);assert.equal(widgetMainGoal([{...goal,status:'archived'},other])?.id,other.id);
const first={...createMilestone('Первый'),status:'in_progress' as const};const second=createMilestone('Второй','','',1);
assert.equal(currentGoalMilestone({...goal,milestones:[first,second],actions:[{...createGoalAction({title:'Готовое действие',milestoneId:first.id}),status:'completed'}]})?.id,second.id);
const note={content:{type:'doc',content:[{id:'a',type:'paragraph',text:'<b>Мысль</b>&nbsp;без мусора',children:[{id:'b',type:'paragraph',text:'дальше'}]}]}} as Note;
assert.equal(cleanNotePreview(note),'Мысль без мусора дальше');
const days=[{id:'old',localDate:'2026-10-22',status:'completed',scoreVersion:2,totalScore:99},{id:'active',localDate:'2026-10-23',status:'active',scoreVersion:3,totalScore:75},{id:'new',localDate:'2026-10-23',status:'completed',scoreVersion:3,totalScore:0}] as KodaDay[];
assert.deepEqual(scoreHistory(days).map(d=>d.id),['new']);
console.log('Widget desktop: layout compatibility, nearest tasks, actual goal/note/score selection passed.');

const baseLayout = normalizeWidgetLayout(null);
const visualOrder = displayedWidgetOrder(baseLayout, true);
assert.deepEqual(visualOrder.slice(0, 3), ['day', 'goal', 'score']);
const movedLayout = moveWidget({...baseLayout, hidden:['notes']}, visualOrder, 'score', 'day');
assert.deepEqual(movedLayout.order.slice(0, 3), ['score', 'day', 'goal']);
assert.deepEqual(movedLayout.hidden, ['notes']);
assert.equal(new Set(movedLayout.order).size, widgetIds.length);
assert.deepEqual(displayedWidgetOrder(normalizeWidgetLayout(JSON.parse(JSON.stringify(movedLayout))), true), movedLayout.order);
assert.strictEqual(moveWidget(baseLayout, visualOrder, 'day', 'day'), baseLayout);
const movedDay=moveWidget(baseLayout, visualOrder, 'day', 'habits').order;
assert.equal(movedDay.indexOf('day'),movedDay.indexOf('habits')+1);
console.log('Widget drag: visual order, forward/backward moves, hidden tiles and persisted layout passed.');

const legacy=normalizeWidgetLayout({order:['day','planner','goal','score','notes','focus','projects','habits'],hidden:['notes']});
assert.deepEqual(legacy.order.slice(-3),['assistant','journal','progress']);
assert.deepEqual(legacy.hidden,['notes']);
for (const id of ['assistant','journal','progress'] as const) {
 const moved=moveWidget(legacy,displayedWidgetOrder(legacy,true),id,'day');
 assert.equal(moved.order[0],id);
 assert.deepEqual(normalizeWidgetLayout(JSON.parse(JSON.stringify(moved))),moved);
}
console.log('Companion widgets: old layouts migrate without losing hidden/order, new cards drag and round-trip.');
