import assert from 'node:assert/strict';
import { deterministicRoadmapIssues, makeRoadmapAuditDraft, validateRoadmapAudit, applyRoadmapRepair } from '../src/ai/roadmapReview';
import { createGoalPlanGenerator } from '../src/ai/goalPlanProvider';
import type { GoalPlanInput } from '../src/ai/goalPlanContract';

const input:GoalPlanInput={wish:'Подготовить и опубликовать анализ продаж',desiredResult:'Опубликованный учебный анализ продаж',availableMinutes:20,planScope:'full-map',stepDensity:'adaptive',clarifyRoadmap:true,currentState:'Есть свой GitHub-репозиторий. CSV имеет только поля date, product, revenue. Выручку нужно сравнить по товарам и месяцам. Период в файле пока не проверял; пропуски не проверял.',clarifications:[{question:'Какой результат?',answer:'README и notebook в своём GitHub; сравнить выручку по товарам и месяцам по date, product, revenue; причинность не утверждать.'}]};
const unsafe={desiredResult:input.desiredResult,answerStatus:'resolved',directions:[
  {title:'CSV исправлен',groundingSourceId:0,actions:['Удалить или заполнить пропуски и аномалии']},
  {title:'Сезонность найдена',groundingSourceId:0,actions:['Выявить сезонные колебания по датам']},
  {title:'Причины выручки найдены',groundingSourceId:0,actions:['Определить факторы, влияющие на выручку']},
]};
const factsPlan={desiredResult:input.desiredResult!,directions:unsafe.directions.map(d=>({title:d.title,actions:d.actions}))};
const ids=makeRoadmapAuditDraft(factsPlan).knownIds;
assert.deepEqual(deterministicRoadmapIssues(factsPlan,input).map(issue=>issue.actionId),['d0a0','d1a0','d2a0'],'Deterministic rules catch missing-value mutation, unverified seasonality, and causal claims even when the model auditor misses them');
const spanishShort={desiredResult:'Освоить основы языка',directions:[{title:'Маршрут освоен',actions:['Выучить основные фразы для объяснения маршрута','Ознакомиться с фразами для заселения в отель','Репетировать основные фразы для общения с администратором','Выучить одну фразу, чтобы спросить дорогу']} ]};
assert.deepEqual(deterministicRoadmapIssues(spanishShort,{...input,wish:'Освоить основы языка',desiredResult:'Освоить основы языка',availableMinutes:10}).map(issue=>issue.actionId),['d0a0','d0a1','d0a2'],'A 10-minute plan cannot hide an unbounded plural collection behind a specific topic');
const existingRepoPlan={desiredResult:'x',directions:[{title:'Опубликовано',actions:['Создать репозиторий или использовать существующий']} ]};
assert.deepEqual(deterministicRoadmapIssues(existingRepoPlan,{...input,currentState:'Уже есть свой GitHub-репозиторий.'}).map(issue=>issue.actionId),['d0a0'],'Do not offer a new repository when the user already has one');
assert.deepEqual(deterministicRoadmapIssues({desiredResult:'x',directions:[{title:'Done',protectedActions:['Выучить основные фразы'],actions:['Выучить основные фразы']}]},{...input,availableMinutes:10}),[],'Protected historical actions are not treated as proposals');
assert.deepEqual([...ids],['d0a0','d1a0','d2a0'],'Action identities are stable IDs, not arithmetic indices');
assert.throws(()=>validateRoadmapAudit({issues:[{actionId:'d0a2',reason:'unknown'}],missingQuestions:[],conflicting:false},ids),/unknown|invalid/i);
assert.throws(()=>validateRoadmapAudit({issues:[],missingQuestions:['x','y','z'],conflicting:false},ids),/bounds/i);
assert.throws(()=>validateRoadmapAudit({issues:[],missingQuestions:[],conflicting:'false'},ids),/schema/i);
const issues=[{actionId:'d0a0',reason:'Нельзя предписывать удаление до проверки и выбора политики.'}];
assert.throws(()=>applyRoadmapRepair(factsPlan,{patches:[{actionId:'d0a0',text:'Проверить пропуски'},{actionId:'d1a0',text:'Изменить неотмеченное'}]},issues),/unknown|unflagged|exact issue/i);
const sparseSlots={desiredResult:'x',directions:[{title:'Этап 1',slotIndex:0,actions:['Готово']},{title:'Этап 3',slotIndex:2,actions:['Проверить период']}]};
const sparseRepair=applyRoadmapRepair(sparseSlots,{patches:[{actionId:'d1a0',directionTitle:'Период проверен',text:'Проверить минимальную и максимальную дату'}]},[{actionId:'d1a0',reason:'Пустышка'}]);
assert.equal(sparseRepair.directions[1].title,'Период проверен');assert.equal(sparseRepair.directions[1].slotIndex,2,'Review identity uses stable candidate position while preserving the real Open Window slot');

function response(content:unknown){return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(content)}}]}));}
function detectRequest(init:RequestInit|undefined){const body=JSON.parse(String(init?.body));return {system:body.messages[0].content as string,payload:JSON.parse(body.messages[1].content)};}
async function main(){
 const original=globalThis.fetch;
 try{
  const stages:string[]=[];let calls=0;
  globalThis.fetch=(async(_url,init)=>{
    calls++;const {system,payload}=detectRequest(init);
    if(system.includes('Проведи независимую короткую проверку')){
      stages.push('audit');
      const draft=payload.draft as {directions:Array<{directionId:string;actions:Array<{actionId:string}>}>};
      if(stages.filter(x=>x==='audit').length===1)return response({issues:[],missingQuestions:[],conflicting:false});
      assert.deepEqual(draft.directions.flatMap(d=>d.actions.map(a=>a.actionId)),['d0a0','d1a0','d2a0']);
      assert.match(JSON.stringify(draft),/Проверить долю пропусков/i);
      assert.doesNotMatch(JSON.stringify(draft),/сезонн|влияющие на выручку|удалить или заполнить/iu);
      return response({issues:[],missingQuestions:[],conflicting:false});
    }
    if(system.includes('Исправь ТОЛЬКО перечисленные дефекты')){
      stages.push('repair');
      return response({patches:[
        {actionId:'d0a0',directionTitle:'Качество CSV проверено',text:'Проверить долю пропусков в date, product и revenue, не меняя исходный файл'},
        {actionId:'d1a0',directionTitle:'Период анализа установлен',text:'Проверить минимальную и максимальную дату в файле до группировки по месяцам'},
        {actionId:'d2a0',directionTitle:'Сравнение выручки описано',text:'Сравнить суммы по товарам и месяцам и описать наблюдаемые различия без причинных выводов'},
      ]});
    }
    stages.push('generate');
    return response(unsafe);
  }) as typeof fetch;
  const result=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(input);
  assert.deepEqual(stages,['generate','audit','repair','audit']);assert.equal(calls,4);
  assert.equal(result.directions.length,3);assert.match(result.directions[0].actions[0],/не меняя исходный файл/i);
  assert.doesNotMatch(result.directions.flatMap(d=>d.actions).join(' '),/сезонн|влияющие на выручку|удалить или заполнить/iu);

  calls=0;globalThis.fetch=(async(_url,init)=>{calls++;const {system}=detectRequest(init);if(system.includes('Проведи независимую'))return response({issues:[{actionId:'d0a99',reason:'bad id'}],missingQuestions:[],conflicting:false});return response(unsafe);}) as typeof fetch;
  const badAudit=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(input);
  assert.equal(badAudit.directions.length,0);assert.ok(badAudit.planningNote);assert.equal(calls,2,'Invalid audit fails closed without repair or fallback calls');

  calls=0;const strictInput={...input,stepDensity:undefined};
  globalThis.fetch=(async(_url,init)=>{calls++;const {system,payload}=detectRequest(init);if(system.includes('Проведи независимую'))return response({issues:[],missingQuestions:[],conflicting:false});if(system.includes('Исправь ТОЛЬКО'))throw new Error('Unexpected repair');return response({...unsafe,directions:Array.from({length:8},(_,di)=>({title:`Этап ${di+1}`,groundingSourceId:0,actions:Array.from({length:8},(_,ai)=>`Операция ${di+1}/${ai+1}`)}))});}) as typeof fetch;
  const strict=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(strictInput);
  assert.equal(calls,2,'clarifyRoadmap opts strict 64-slot maps into audit too');assert.equal(strict.directions.length,8);

  const rebuildInput:GoalPlanInput={...strictInput,revisionMode:'rebuild-pending',existingDirections:Array.from({length:8},(_,i)=>({title:`Этап ${i+1}`,actions:[],completedActions:[`Завершённое дело ${i+1}`],routineTitles:[`Рутина ${i+1}`],archived:false})),goalProgress:{completedActions:Array.from({length:8},(_,i)=>`Завершённое дело ${i+1}`),pendingActions:[],milestones:[]}};
  calls=0;globalThis.fetch=(async(_url,init)=>{calls++;const {system,payload}=detectRequest(init);if(system.includes('Проведи независимую')){const auditDraft=payload.draft;assert.deepEqual(auditDraft.directions[0].actions.slice(0,2).map((a:{actionId:string;protected?:boolean})=>[a.actionId,a.protected]),[['d0a0',true],['d0a1',true]]);assert.ok(auditDraft.directions[0].actions.slice(2).every((a:{protected?:boolean})=>!a.protected));return response({issues:[],missingQuestions:[],conflicting:false});}return response({...unsafe,directions:Array.from({length:8},(_,di)=>({slotIndex:di,title:`Этап ${di+1}`,groundingSourceId:0,actions:[`Завершённое дело ${di+1}`,`Рутина ${di+1}`,...Array.from({length:6},(_,ai)=>`Новое дело ${di+1}/${ai+1}`)]}))});}) as typeof fetch;
  const rebuilt=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(rebuildInput);
  assert.equal(calls,2);assert.equal(rebuilt.directions[0].slotIndex,0);assert.deepEqual(rebuilt.directions[0].actions.slice(0,2),['Завершённое дело 1','Рутина 1'],'Protected completed/routine items remain exact and are not reviewed as proposed tasks');

  calls=0;const realNow=Date.now;let now=realNow();Date.now=()=>now;
  try{globalThis.fetch=(async()=>{calls++;now+=46_000;return response(unsafe);}) as typeof fetch;
    const exhausted=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(input);
    assert.equal(exhausted.directions.length,0);assert.ok(exhausted.planningNote);assert.equal(calls,1,'Budget exhaustion prevents an unaudited plan from escaping');
  }finally{Date.now=realNow;}

  calls=0;const realNow2=Date.now;let now2=realNow2(),auditCount=0;Date.now=()=>now2;
  try{globalThis.fetch=(async(_url,init)=>{calls++;const {system}=detectRequest(init);if(system.includes('Проведи независимую')){auditCount++;if(auditCount===2)now2+=46_000;return response({issues:[],missingQuestions:[],conflicting:false});}if(system.includes('Исправь ТОЛЬКО'))return response({patches:[{actionId:'d0a0',text:'Проверить пропуски в исходном CSV, не изменяя данные'},{actionId:'d1a0',text:'Проверить минимальную и максимальную дату перед сравнением по месяцам'},{actionId:'d2a0',text:'Сравнить выручку по товарам и описать различия без утверждений о причинах'}]});return response(unsafe);}) as typeof fetch;
    const lateAudit=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(input);
    assert.equal(lateAudit.directions.length,0);assert.ok(lateAudit.planningNote);assert.equal(calls,4,'A final audit that finishes after the shared deadline cannot release its plan');
  }finally{Date.now=realNow2;}

  calls=0;globalThis.fetch=(async()=>{calls++;return response({desiredResult:'Starter result',directions:[{title:'One',actions:['Do one thing']}]});}) as typeof fetch;
  const legacy=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})({wish:'A concrete starter goal',desiredResult:'Starter result'});
  assert.equal(legacy.directions.length,1);assert.equal(calls,1,'Non-opt-in generation retains the original single-call flow');
 }finally{globalThis.fetch=original;}
 console.log('PASS roadmap semantic review: unsafe CSV repair/re-audit, schema and ID guards, fail-closed deadline, legacy route.');
}
main().catch(error=>{console.error(error instanceof Error?error.stack:error);process.exitCode=1;});
