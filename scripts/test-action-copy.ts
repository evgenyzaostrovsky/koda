import assert from 'node:assert/strict';
import {normalizeGoalActionDetails,normalizeGoalPlanInput,validateGoalPlan} from '../src/ai/goalPlanContract';
import {createGoal,createGoalAction,normalizeGoal} from '../src/features/koda/goalLogic';
import {addGoalStructure,rebuildGoalStructure} from '../src/features/koda/goalStructure';
import {buildGoalPlanContext} from '../src/features/koda/goalPlanContext';
import {createOpenWindow} from '../src/features/koda/openWindow';
import {mergeGoals,normalizeStoredKodaState,parseStoredKodaState} from '../src/features/koda/persistence';
import {writeAppStateSnapshot} from '../src/features/koda/syncCoordinator';

const originalTitle='Открыть программу выбранного курса и выделить обязательные разделы';
const detail={title:originalTitle,shortTitle:'Изучить программу курса',description:'Открой программу выбранного курса. Выпиши обязательные разделы и требования.'};
const proposal={desiredResult:'Проверяемый результат',directions:[{title:'Обучение',slotIndex:0,actions:[originalTitle],actionDetails:[detail]}]};
assert.deepEqual(validateGoalPlan(proposal),proposal);
const legacy={desiredResult:proposal.desiredResult,directions:[{title:'Обучение',actions:[originalTitle]}]};
assert.deepEqual(validateGoalPlan(legacy),legacy,'Legacy plans need no metadata');
assert.deepEqual(normalizeGoalActionDetails([detail,{...detail,shortTitle:'Поздний дубль'},{...detail,title:'Чужой шаг'}],[originalTitle]),[detail]);
for(const shortTitle of ['',7,'x'.repeat(49)])assert.deepEqual(normalizeGoalActionDetails([{...detail,shortTitle}],[originalTitle]),[]);
assert.deepEqual(normalizeGoalActionDetails([{...detail,title:` ${originalTitle}`}],[originalTitle]),[],'Identity is exact, not fuzzy');
assert.equal(normalizeGoalActionDetails([{...detail,description:'x'.repeat(2000)}],[originalTitle])[0].description.length,1000);
assert.equal(normalizeGoalPlanInput({wish:'Цель',planningMethod:'otani',actionCopyOnly:true}).actionCopyOnly,true);
for(const planningMethod of [undefined,'roadmap'])assert.equal(normalizeGoalPlanInput({wish:'Цель',planningMethod,actionCopyOnly:true}).actionCopyOnly,undefined);

const base=createGoal({title:'Тестовая цель',desiredResult:proposal.desiredResult,deadline:'',priority:'main'},'2026-10-01T10:00:00.000Z');
const completed={...createGoalAction({title:originalTitle,dueDate:'2026-11-05',importance:'key',milestoneId:'stage'}),status:'completed' as const,completedAt:'2026-11-01T12:00:00Z',dependsOn:['before'],deferredUntil:'2026-11-02'};
base.actions=[completed];base.openWindow=createOpenWindow(base.id);
base.openWindow.directions[0]={...base.openWindow.directions[0],title:'Обучение',actionIds:[completed.id]};
const before=JSON.stringify(base);
const updated=addGoalStructure(base,proposal,{actionCopyOnly:true});
assert.equal(JSON.stringify(base),before,'Apply must not mutate input or snapshots');
assert.deepEqual(updated.actions,[{...completed,shortTitle:detail.shortTitle,description:detail.description}]);
assert.deepEqual(updated.openWindow!.directions,base.openWindow.directions);
assert.deepEqual(updated.openWindow!.history[0].actionsSnapshot,base.actions);
assert.notEqual(updated.updatedAt,base.updatedAt,'Copy-only changes participate in persistence ordering');
assert.throws(()=>addGoalStructure(updated,proposal,{actionCopyOnly:true}),/уже сохранены/);
assert.equal(updated.openWindow!.history.length,1,'Retry must not create duplicate history');
const additive=addGoalStructure(base,proposal);
assert.deepEqual(additive.actions,updated.actions,'Regular proposals update metadata on linked actions too');
assert.equal(additive.openWindow!.history.length,1);
const rebuild=rebuildGoalStructure(base,proposal);
assert.deepEqual(rebuild.actions,updated.actions);
assert.deepEqual(rebuild.openWindow!.history[0].actionsSnapshot,base.actions);
assert.throws(()=>rebuildGoalStructure(rebuild,proposal),/уже применена/);

const notes={...base,actions:[{...completed,description:'Личные заметки: выбрать доступный курс'}]};
assert.equal(addGoalStructure(notes,proposal,{actionCopyOnly:true}).actions[0].description,notes.actions[0].description,'AI cannot replace personal notes');
const deleted={...base,actions:[],openWindow:{...base.openWindow,directions:base.openWindow.directions.map((d,i)=>i?d:{...d,actionIds:[]})}};
assert.throws(()=>addGoalStructure(deleted,proposal,{actionCopyOnly:true}),/изменились/,'A stale review cannot recreate removed work');
assert.throws(()=>addGoalStructure(base,{...proposal,directions:[{...proposal.directions[0],actions:[originalTitle,'Новый шаг']}]},{actionCopyOnly:true}),/изменились/);
assert.throws(()=>addGoalStructure(base,{...proposal,directions:[{...proposal.directions[0],title:'Переименовать'}]},{actionCopyOnly:true}),/Карта изменилась/);
assert.throws(()=>addGoalStructure(base,{...proposal,directions:[{...proposal.directions[0],slotIndex:1}]},{actionCopyOnly:true}),/Карта изменилась/);
const pending={...completed,status:'pending' as const,completedAt:null,shortTitle:'Ранее сохранённая подпись',description:'Сохранённое описание'};
const rebuildWithoutMetadata=rebuildGoalStructure({...base,actions:[pending]},{desiredResult:proposal.desiredResult,directions:[{title:'Обновлённое обучение',slotIndex:0,actions:[originalTitle]}]});
assert.deepEqual(rebuildWithoutMetadata.actions,[pending],'Plans without metadata preserve existing copy');
const created=addGoalStructure({...base,actions:[],openWindow:createOpenWindow(base.id)},proposal);
assert.equal(created.actions[0].shortTitle,detail.shortTitle);assert.equal(created.actions[0].description,detail.description);

const normalized=normalizeGoal(JSON.parse(JSON.stringify(updated)))!;
assert.equal(normalized.actions[0].shortTitle,detail.shortTitle);
assert.equal(normalized.actions[0].status,'completed');
assert.deepEqual(normalized.openWindow!.history[0].actionsSnapshot,base.actions);
assert.equal(Object.hasOwn(normalizeGoal(base)!.actions[0],'shortTitle'),false,'Legacy absence remains absent');
assert.equal(normalizeGoal({...base,actions:[{...completed,shortTitle:4}]})!.actions[0].shortTitle,undefined);
const state=normalizeStoredKodaState({goals:[updated]})!;
const reload=parseStoredKodaState(JSON.stringify(state))!;
assert.equal(reload.goals[0].actions[0].shortTitle,detail.shortTitle,'Actual persisted JSON normalization retains labels');
assert.equal(reload.goals[0].actions[0].description,detail.description);
for(const [first,second] of [[base,updated],[updated,base]]){
  const merged=mergeGoals([first],[second])[0];
  assert.equal(merged.actions[0].shortTitle,detail.shortTitle,'Stale device does not overwrite newer copy');
  assert.equal(merged.actions[0].status,'completed');
}
assert.deepEqual(normalizeGoalPlanInput({wish:base.title,planningMethod:'otani',...buildGoalPlanContext(updated)}).existingDirections![0].actionDetails,[detail]);
const notesContext=normalizeGoalPlanInput({wish:base.title,planningMethod:'otani',...buildGoalPlanContext(notes)}).existingDirections![0].actionDetails!;
assert.deepEqual(notesContext,[{title:originalTitle,description:notes.actions[0].description}],'Existing notes without labels reach AI unchanged');
assert.equal(Object.hasOwn(notesContext[0],'shortTitle'),false,'Context must not invent or truncate a label');
const boundedContext=normalizeGoalPlanInput({wish:base.title,existingDirections:[{title:'Обучение',actions:[originalTitle],actionDetails:[{title:originalTitle,shortTitle:'x'.repeat(49),description:'a'.repeat(2000)},{...detail,title:'Чужое действие'}]}]}).existingDirections![0].actionDetails!;
assert.deepEqual(boundedContext,[{title:originalTitle,description:'a'.repeat(1000)}]);

const later=new Date(Date.parse(updated.updatedAt)+1000).toISOString();
const latest=new Date(Date.parse(updated.updatedAt)+2000).toISOString();
const newerLegacy=normalizeGoal({...base,updatedAt:later,actions:[{...completed,status:'pending',completedAt:null,description:'Заметка старого клиента'}]})!;
const clear=normalizeGoal({...updated,updatedAt:latest,actions:updated.actions.map(a=>({...a,shortTitle:''}))})!;
assert.equal(clear.actions[0].shortTitle,'','Normalization preserves explicit clear');
assert.equal(parseStoredKodaState(JSON.stringify(normalizeStoredKodaState({goals:[clear]})))!.goals[0].actions[0].shortTitle,'','Clear survives local JSON reload');
for(const [first,second] of [[updated,newerLegacy],[newerLegacy,updated]]){
  const merged=mergeGoals([first],[second])[0];
  assert.equal(merged.actions[0].shortTitle,detail.shortTitle,'Newer legacy omission cannot erase label');
  assert.equal(merged.actions[0].status,'pending','The latest status still wins');
  assert.equal(merged.actions[0].description,'Заметка старого клиента','Existing description semantics are unchanged');
}
for(const [first,second] of [[updated,clear],[clear,updated]])assert.equal(mergeGoals([first],[second])[0].actions[0].shortTitle,'','Explicit newer clear beats stale metadata');
const afterClearLegacy={...newerLegacy,updatedAt:new Date(Date.parse(latest)+1000).toISOString()};
for(const [first,second] of [[afterClearLegacy,clear],[clear,afterClearLegacy]])assert.equal(mergeGoals([first],[second])[0].actions[0].shortTitle,'','An even newer legacy omission preserves a clear');
const removedAfterCopy={...newerLegacy,actions:[]};
assert.deepEqual(mergeGoals([updated],[removedAfterCopy])[0].actions,[],'Metadata fallback never restores deleted actions');
const differentId={...newerLegacy,actions:newerLegacy.actions.map(a=>({...a,id:'unrelated-action'}))};
assert.equal(mergeGoals([updated],[differentId])[0].actions[0].shortTitle,undefined,'Equal titles do not transfer metadata across IDs');
assert.deepEqual(mergeGoals([newerLegacy],[updated]),mergeGoals([updated],[newerLegacy]));

// Local PostgREST boundary: no credentials, network, or real account records.
class CopyBackend {
  rows=new Map<string,Record<string,any>>();offline=false;writes=0;
  from(table:string){
    assert.equal(table,'user_app_state');
    let operation='read',payload:Record<string,any>={};const filters:Record<string,unknown>={};
    const query={
      select:(_columns:string)=>query,
      eq:(key:string,value:unknown)=>{filters[key]=value;return query;},
      update:(value:Record<string,any>)=>{operation='update';payload=value;return query;},
      insert:(value:Record<string,any>)=>{operation='insert';payload=value;return query;},
      maybeSingle:async()=>{
        if(this.offline)return {data:null,error:{code:'FETCH',message:'offline'}};
        const userId=String(filters.user_id??payload.user_id),current=this.rows.get(userId);
        if(operation==='read')return {data:structuredClone(current??null),error:null};
        if(operation==='insert'&&current)return {data:null,error:{code:'23505',message:'duplicate'}};
        if(operation==='update'&&current?.updated_at!==filters.updated_at)return {data:null,error:null};
        this.rows.set(userId,JSON.parse(JSON.stringify({...current,...payload,updated_at:`server-${++this.writes}`})));
        return {data:{user_id:userId},error:null};
      },
    };return query;
  }
  label(account:string){return normalizeStoredKodaState(this.rows.get(account))!.goals[0].actions[0].shortTitle;}
}
async function verifyCopyPersistence(){
  const backend=new CopyBackend();
  const snapshot=(goal:typeof updated)=>normalizeStoredKodaState({goals:[goal]})!;
  await writeAppStateSnapshot(backend,'copy-a',snapshot(updated));
  await writeAppStateSnapshot(backend,'copy-b',snapshot(base));
  await writeAppStateSnapshot(backend,'copy-a',snapshot(newerLegacy));
  assert.equal(backend.label('copy-a'),detail.shortTitle,'Cloud merge preserves labels after old-client writes');
  assert.equal(backend.label('copy-b'),undefined,'Same goal/action IDs cannot leak labels across accounts');
  backend.offline=true;
  await assert.rejects(writeAppStateSnapshot(backend,'copy-a',snapshot(clear)));
  const queued=parseStoredKodaState(JSON.stringify(snapshot(clear)))!;
  assert.equal(queued.goals[0].actions[0].shortTitle,'');
  assert.equal(backend.label('copy-a'),detail.shortTitle,'Failed write leaves server unchanged');
  backend.offline=false;
  await writeAppStateSnapshot(backend,'copy-a',queued);
  await writeAppStateSnapshot(backend,'copy-a',queued);
  await writeAppStateSnapshot(backend,'copy-a',snapshot(updated));
  assert.equal(backend.label('copy-a'),'','Retry and stale writes cannot resurrect a cleared label');
  assert.equal(normalizeStoredKodaState(backend.rows.get('copy-a'))!.goals.length,1,'Retry does not duplicate goals');
  console.log('PASS action copy persistence: legacy omission vs explicit clear, bounded original notes context, account isolation, failed request, local queue/retry and stale cloud writes.');
}
void verifyCopyPersistence().catch(error=>{console.error(error);process.exitCode=1;});
console.log('PASS action copy: bounded exact identity, legacy compatibility, immutable copy-only apply, stale/deleted work rejection, metadata history/retry, progress/notes preservation, rebuild, JSON reload and stale-device merge.');
