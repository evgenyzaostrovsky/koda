import assert from 'node:assert/strict';
import { configureAutoPlan, recordAutoPlanCompletion, parseAutoPlanState, applyAutoPlanProgress } from '../src/features/koda/autoPlan';
import { normalizeGoal } from '../src/features/koda/goalLogic';
import { acceptDayPlan, suggestDayPlan, calculatePlanScore } from '../src/features/koda/dayPlan';
import { syncExplicitSourceChanges } from '../src/features/koda/dayPlanSync';
import { defaultProfile } from '../src/features/koda/persistence';
const { advanceAccountAutoPlan, localPlanDate } = require('../src/server/autoPlan');
const cron = require('../api/auto-plan-cron');
const {loadAssistantContext}=require('../src/server/assistantContext');
const owner = '11111111-1111-4111-8111-111111111111';
const at = '2026-11-05T10:00:00.000Z';
const goal = normalizeGoal({id:'g1',title:'Учебная цель',priority:'main',status:'active',createdAt:at,actions:[{id:'a1',title:'Проверить столбец',estimatedMinutes:20,position:0},{id:'a2',title:'Записать вывод',estimatedMinutes:20,position:1}]})!;
function fakeClient(){
 let row:any={user_id:owner,goals:[goal],profile:{...defaultProfile,values:'keep',autoPlan:configureAutoPlan(undefined,owner,{enabled:true,timezone:'Europe/Moscow'},at,'settings')},updated_at:at};
 let race:(()=>void)|undefined;const writes:any[]=[];
 const client={from(table:string){let payload:any;const filters:Record<string,unknown>={};const query:any={select(){return query},eq(k:string,v:unknown){filters[k]=v;return query},update(p:any){payload=p;return query},async maybeSingle(){
  assert.equal(filters.user_id,owner);
  if(payload){writes.push(payload);if(race){const fn=race;race=undefined;fn();}if(filters.updated_at!==row.updated_at)return {data:null,error:null};row={...row,...payload};return {data:{user_id:owner},error:null};}
  return {data:structuredClone(row),error:null};
 },then(resolve:any,reject:any){assert.equal(table,'planner_events');assert.equal(filters.owner_key,'user:'+owner);return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return query}};
 return {client,get row(){return row},set row(value){row=value},writes,onWrite(fn:()=>void){race=fn}};
}
async function main(){
 assert.equal(localPlanDate(new Date('2026-11-05T22:00:00Z'),'Europe/Moscow'),'2026-11-06');
 const f=fakeClient();assert.equal((await advanceAccountAutoPlan(f.client,owner,new Date(at))).changed,true);
 assert.equal(f.row.profile.autoPlan.assignments.length,1);assert.equal(f.row.profile.values,'keep');
 assert.equal((await advanceAccountAutoPlan(f.client,owner,new Date(at))).changed,false);
 assert.ok(f.writes.every(w=>!('goals'in w)&&!('habits'in w))); // narrow patch only
 const yesterday=f.row.profile.autoPlan;
 const nextDay=new Date('2026-11-06T10:00:00Z');
 f.onWrite(()=>{f.row={...f.row,profile:{...f.row.profile,values:'changed elsewhere',autoPlan:recordAutoPlanCompletion(yesterday,yesterday.assignments[0].id,true,'2026-11-06',nextDay.toISOString(),'done')},updated_at:'2026-11-06T10:00:01.000Z'}});
 await advanceAccountAutoPlan(f.client,owner,nextDay);
 assert.equal(f.row.profile.values,'changed elsewhere');assert.equal(f.row.profile.autoPlan.assignments.length,1);assert.equal(f.row.profile.autoPlan.completions.length,1);
 await advanceAccountAutoPlan(f.client,owner,new Date('2026-11-07T10:00:00Z'));
 assert.equal(f.row.profile.autoPlan.assignments.length,2);
 const initialGoals=[goal];
 const completedGoals=applyAutoPlanProgress(f.row.profile.autoPlan,initialGoals);
 const plan=acceptDayPlan(suggestDayPlan(initialGoals,[],'2026-11-06',{maxActionsPerGoal:1}),{ownerId:owner,at:'2026-11-06T09:00:00Z'});
 const scored=syncExplicitSourceChanges(plan,initialGoals,completedGoals,[],[]);
 assert.equal(calculatePlanScore(scored).completedCount,1);
 const undone=recordAutoPlanCompletion(f.row.profile.autoPlan,f.row.profile.autoPlan.assignments[0].id,false,'2026-11-07','2026-11-07T11:00:00Z','undo-score');
 const reopened=syncExplicitSourceChanges(scored,completedGoals,applyAutoPlanProgress(undone,initialGoals),[],[]);
 assert.equal(calculatePlanScore(reopened).completedCount,0);
 let deletedContext = false;
 const contextClient={auth:{async getUser(){return {data:{user:{id:owner}},error:null}}},from(table:string){const q:any={select(){return q},eq(){return q},order(){return q},limit(){return q},async maybeSingle(){return {data:{user_id:owner,goals:[deletedContext ? {...goal,deletedAt:at} : goal],habits:[],profile_auto_plan:f.row.profile.autoPlan},error:null}},then(resolve:any,reject:any){return Promise.resolve({data:[],error:null}).then(resolve,reject)}};return q}};
 const context=await loadAssistantContext({headers:{authorization:'Bearer test'}},{clientFactory:()=>contextClient});
 assert.ok(context.includes('Проверить столбец'));assert.match(context,/"actionsDone":1/);

 deletedContext = true;
 const deletedReplyContext=await loadAssistantContext({headers:{authorization:'Bearer test'}},{clientFactory:()=>contextClient});
 assert.ok(!deletedReplyContext.includes('Учебная цель') && !deletedReplyContext.includes('Проверить столбец'), 'deleted goals must not reach assistant context');
 const removed=fakeClient();
 removed.row={...removed.row,goals:[{...goal,deletedAt:at}]};
 await advanceAccountAutoPlan(removed.client,owner,new Date(at));
 assert.equal(removed.row.profile.autoPlan.assignments.length,0,'cron must not schedule deleted goals');
 assert.equal(removed.row.goals[0].deletedAt,at,'cron must preserve deletion markers');
 assert.equal(parseAutoPlanState(f.row.profile.autoPlan,'other'),undefined);
 const secret=process.env.CRON_SECRET;delete process.env.CRON_SECRET;
 const response:any={code:0,status(code:number){this.code=code;return this},json(_body:unknown){return this}};
 await cron({method:'GET',headers:{}},response);assert.equal(response.code,401);
 process.env.CRON_SECRET='test-secret';await cron({method:'POST',headers:{authorization:'Bearer wrong'}},response);assert.equal(response.code,401);
 if(secret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=secret;
 console.log('PASS auto-plan server: timezone, CAS retry, narrow patch, idempotency, next-day barrier, owner parsing and fail-closed cron');
}
main().catch(error=>{console.error(error);process.exitCode=1});
