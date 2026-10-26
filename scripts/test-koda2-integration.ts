import assert from 'node:assert/strict';
import { createGoal, createGoalAction, createGoalRoutine, upsertRoutineLog } from '../src/features/koda/goalLogic';
import { createOpenWindow, updateOpenWindow } from '../src/features/koda/openWindow';
import { acceptDayPlan, calculatePlanScore, getCurrentPlanVersion, recordPlanProgress, reviseDayPlan, suggestDayPlan } from '../src/features/koda/dayPlan';
import { syncDayPlanProgress, syncExplicitSourceChanges } from '../src/features/koda/dayPlanSync';
import { finalizeKodaDay, fromKodaDayRow, toKodaDayRow } from '../src/features/koda/kodaDaySync';
import { defaultPomodoroSettings, defaultProfile, mergeKodaDays, normalizeStoredKodaState, parseStoredKodaState } from '../src/features/koda/persistence';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Goal, KodaDay, PlannerItem } from '../src/features/koda/types';

const date='2026-10-20',at='2026-10-20T12:00:00.000Z';
let goal=createGoal({title:'Портфолио',desiredResult:'Готовый проект',deadline:'',priority:'main'});
const action=createGoalAction({title:'Опубликовать проект',dueDate:date,estimatedMinutes:20});
goal={...goal,actions:[action],openWindow:createOpenWindow(goal.id)};
goal=updateOpenWindow(goal,goal.openWindow!.directions.map((d,i)=>i===0?{...d,title:'Практика',actionIds:[action.id]}:d),'Первый шаг',at);
const planner:PlannerItem[]=[{id:'errand',date,time:'',title:'Оплатить интернет',done:false}];
const mainWithoutDeadline={...goal,actions:[{...action,dueDate:''}]};
const supporting={...createGoal({title:'Второстепенное',desiredResult:'',deadline:'',priority:'supporting'}),actions:[createGoalAction({title:'Мелкий шаг',dueDate:date,estimatedMinutes:20})]};
assert.equal(suggestDayPlan([supporting,mainWithoutDeadline],planner,date,{availableMinutes:60}).items[0].goalId,goal.id,'main focus is not displaced by a smaller supporting goal due today');
let plan=acceptDayPlan(suggestDayPlan([goal],planner,date),{ownerId:'test-user',at,versionId:'initial'});
let day:KodaDay={id:'day',localDate:date,timezone:'Europe/Moscow',status:'active',startedAt:at,finishedAt:null,goalScore:null,plannerScore:0,totalScore:null,classification:'unclassified',scoreVersion:3,summary:'',focusLoss:'',nextRecommendation:'',goalsSnapshot:[],plannerSnapshot:[],calculationSnapshot:null,createdAt:at,updatedAt:at,plan};
const completed:Goal={...goal,actions:[{...action,status:'completed',completedAt:at}]};
plan=syncExplicitSourceChanges(plan,[goal],[completed],planner,planner,{at});
assert.equal(calculatePlanScore(plan).totalScore,75);
plan=syncExplicitSourceChanges(plan,[completed],[goal],planner,planner,{at:'2026-10-20T12:10:00Z'});
assert.equal(calculatePlanScore(plan).totalScore,0,'undo from goals updates score');
plan=syncDayPlanProgress(plan,[completed],planner,{at});
assert.equal(calculatePlanScore(plan).totalScore,0,'a stale canonical completion cannot resurrect an explicit manual undo');
// Explicit new work after undo is recorded through the UI helper, not a stale source replay.
plan=syncExplicitSourceChanges(plan,[goal],[completed],planner,planner,{at:'2026-10-20T12:20:00Z'});
const completedPlanner=planner.map(p=>({...p,done:true}));
plan=syncExplicitSourceChanges(plan,[completed],[completed],planner,completedPlanner,{at});
assert.equal(calculatePlanScore(plan).totalScore,100);
const originalVersion=getCurrentPlanVersion(plan);
plan=reviseDayPlan(plan,{date,items:originalVersion.items.filter(i=>i.category==='goal'),minimum:originalVersion.minimum,availableMinutes:120,reserveRatio:0.2},'Изменились обстоятельства',{at:'2026-10-20T13:00:00Z',versionId:'revision'});
day={...day,plan};
const stored=parseStoredKodaState(JSON.stringify({goals:[completed],habits:[],projects:[],kodaDays:[day],profile:defaultProfile,pomodoro:defaultPomodoroSettings}))!;
assert.equal(stored.goals[0].openWindow!.directions[0].actionIds[0],action.id);
assert.equal(stored.kodaDays[0].plan!.versions.length,2);
assert.equal(calculatePlanScore(stored.kodaDays[0].plan).totalScore,100);
const row=toKodaDayRow(day,'test-user');
const restored=fromKodaDayRow(row)!;
assert.equal(restored.plan!.versions.length,2);
const finished=finalizeKodaDay(restored,[completed],completedPlanner,'2026-10-20T18:00:00Z');
assert.equal(finished.totalScore,100);
assert.equal(finalizeKodaDay(finished,[],[]).totalScore,100,'completed history never recalculates');
assert.equal(mergeKodaDays([finished],[{...day,updatedAt:'2026-10-20T23:00:00Z'}])[0].status,'completed','stale device cannot reopen history');
assert.equal(normalizeStoredKodaState({kodaDays:[{...day,plan:{schemaVersion:1}}]})!.kodaDays[0].plan,undefined,'malformed plan does not crash screen');

// Exercise the actual CAS boundary with two independent offline device branches.
class MemoryBackend {
 row:Record<string,any>|null=null; counter=0;
 from(table:string){assert.equal(table,'user_app_state');let op='read',payload:Record<string,unknown>={},version:unknown;const query:any={select:()=>query,eq:(key:string,value:unknown)=>{if(key==='updated_at')version=value;return query;},insert:(v:Record<string,unknown>)=>{op='insert';payload=v;return query;},update:(v:Record<string,unknown>)=>{op='update';payload=v;return query;},maybeSingle:async()=>{if(op==='read')return{data:structuredClone(this.row),error:null};if(op==='insert'&&this.row)return{data:null,error:{code:'23505'}};if(op==='update'&&this.row?.updated_at!==version)return{data:null,error:null};this.row=structuredClone({...this.row,...payload,updated_at:`revision-${++this.counter}`});return{data:{user_id:'test-user'},error:null};}};return query;}
}
async function main(){
 const backend=new MemoryBackend();
 const root=acceptDayPlan(suggestDayPlan([goal],planner,date),{ownerId:'test-user',versionId:'root',at});
 const first=root.versions[0].items[0],second=root.versions[0].items[1];
 const phone=recordPlanProgress(root,first.sourceKey,first.targetValue,'phone',{at});
 const desktop=recordPlanProgress(root,second.sourceKey,second.targetValue,'desktop',{at});
 const state=(p:typeof root)=>({goals:[goal],habits:[],projects:[],kodaDays:[{...day,plan:p}],profile:defaultProfile,pomodoro:defaultPomodoroSettings});
 await writeAppStateSnapshot(backend,'test-user',state(phone));
 await Promise.all([writeAppStateSnapshot(backend,'test-user',state(phone)),writeAppStateSnapshot(backend,'test-user',state(desktop))]);
 const merged=normalizeStoredKodaState(backend.row)!;
 assert.equal(calculatePlanScore(merged.kodaDays[0].plan).totalScore,100,'both devices facts survive CAS');
 assert.equal(merged.kodaDays[0].plan!.progress.length,2);
 console.log('KODA2 integration: matrix -> accepted plan -> completion/undo -> revision -> reload -> finalized history -> row roundtrip -> concurrent CAS PASS');
}
void main();
