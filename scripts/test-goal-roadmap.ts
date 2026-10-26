import assert from 'node:assert/strict';
import {normalizeGoalPlanInput,validateGoalPlan,type GoalPlanInput} from '../src/ai/goalPlanContract';
import {constrainInitialGoalPlan,createGoalPlanGenerator} from '../src/ai/goalPlanProvider';
import {buildGoalPlanContext} from '../src/features/koda/goalPlanContext';
import {createGoal,createGoalAction} from '../src/features/koda/goalLogic';
import {createOpenWindow} from '../src/features/koda/openWindow';

const goal=createGoal({title:'Портфолио',desiredResult:'Опубликовать учебный анализ продаж',deadline:'2026-12-01',priority:'main'});
const done={...createGoalAction({title:'Установить Python'}),status:'completed' as const};
const pending=createGoalAction({title:'Проверить пропуски датасета продаж'});
goal.actions=[done,pending];goal.openWindow=createOpenWindow(goal.id);
goal.openWindow.directions[0].title='Старая область';goal.openWindow.directions[0].actionIds=[done.id,pending.id];
goal.milestones=[{id:'m1',title:'Половина курса пройдена',description:'',deadline:'',status:'in_progress',position:0,completedAt:null}];
const facts=buildGoalPlanContext(goal);
assert.deepEqual(facts.goalProgress?.completedActions,[done.title]);assert.deepEqual(facts.goalProgress?.pendingActions,[pending.title]);
assert.deepEqual(facts.existingDirections?.[0].completedActions,[done.title]);
assert.equal(facts.goalProgress?.milestones[0].status,'in_progress');assert.equal(facts.goalProgress?.deadline,goal.deadline);
const input:GoalPlanInput={wish:goal.title,desiredResult:goal.desiredResult,planScope:'full-map',revisionMode:'rebuild-pending',currentState:'Уже знаю SQL и Python, есть датасет продаж, курс на середине. Без новых курсов.',...facts};
const normalized=normalizeGoalPlanInput(input);
assert.equal(normalized.currentState,input.currentState);assert.equal(normalized.revisionMode,'rebuild-pending');assert.deepEqual(normalized.goalProgress,facts.goalProgress);
assert.equal(normalizeGoalPlanInput({...input,planScope:'starter'}).revisionMode,undefined,'Replacing structure must be full-map opt-in');
assert.equal(normalizeGoalPlanInput({...input,currentState:'x'.repeat(4000)}).currentState?.length,2000);
const roadmap={desiredResult:'Изменённый результат',directions:Array.from({length:8},(_,slotIndex)=>({slotIndex,title:`Результат этапа ${slotIndex}`,actions:Array.from({length:8},(_,step)=>slotIndex===0&&step===0?done.title:`Продолжение ${slotIndex}/${step}`)}))};
const checked=constrainInitialGoalPlan(roadmap,input);
assert.equal(checked.desiredResult,goal.desiredResult);assert.equal(checked.directions[0].slotIndex,0);
assert.equal(validateGoalPlan(checked).directions[7].slotIndex,7,'Client validation retains physical target slot');
const compact={...roadmap,directions:roadmap.directions.map(d=>({...d,actions:d.actions.slice(0,2)}))};
const adaptive=constrainInitialGoalPlan(compact,{...input,stepDensity:'adaptive'});
assert.equal(adaptive.directions.reduce((sum,d)=>sum+d.actions.length,0),16,'Adaptive roadmap does not pad useful work to 64');
assert.equal(adaptive.directions[0].actions[0],done.title);
assert.throws(()=>constrainInitialGoalPlan(compact,input),/неполную карту/,'64-slot option still requests full coverage');
assert.equal(normalizeGoalPlanInput({...input,stepDensity:'adaptive'}).stepDensity,'adaptive');
assert.equal(normalizeGoalPlanInput({...input,planScope:'starter',stepDensity:'adaptive'}).stepDensity,undefined);
assert.throws(()=>constrainInitialGoalPlan({...roadmap,directions:roadmap.directions.map(d=>({...d,slotIndex:0}))},input),/точное место/);
assert.equal(constrainInitialGoalPlan({...roadmap,directions:roadmap.directions.map((d,i)=>i===0?{...d,actions:d.actions.map(a=>a===done.title?'Другой будущий шаг':a)}:d)},input).directions[0].actions[0],done.title,'Historical slots are restored from actual records even if the model omits them');
const unlinkedCompleted={...input,goalProgress:{...facts.goalProgress!,completedActions:[...facts.goalProgress!.completedActions,'Выполненное вне карты']}};
assert.throws(()=>constrainInitialGoalPlan({...roadmap,directions:roadmap.directions.map((d,i)=>i===1?{...d,actions:['Выполненное вне карты',...d.actions.slice(1)]}:d)},unlinkedCompleted),/неполную карту будущих/);
assert.throws(()=>constrainInitialGoalPlan({desiredResult:goal.desiredResult,directions:[{title:'Ближайший шаг',actions:[done.title]}]},{...input,planScope:'starter'}),/уже выполнены/);

async function main(){
  const originalFetch=globalThis.fetch;
  try{
    globalThis.fetch=(async(_url,init)=>{
      const body=JSON.parse(String(init?.body));const request=JSON.parse(body.messages[1].content);
      assert.equal(request.currentState,input.currentState);assert.deepEqual(request.goalProgress,normalized.goalProgress);
      assert.match(body.messages[0].content,/ОТ ТЕКУЩЕЙ ТОЧКИ/);assert.match(body.messages[0].content,/slotIndex/);
      return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(roadmap)}}]}));
    }) as typeof fetch;
    const result=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'test',yandexFolderId:'test'})(input);
    assert.equal(result.directions.length,8);
  }finally{globalThis.fetch=originalFetch;}
  console.log('PASS roadmap: actual progress/current-state transport, bounded context, protected completed work, opt-in rebuild slots, unchanged result, no assigned completed task.');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
