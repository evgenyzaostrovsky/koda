import assert from 'node:assert/strict';
import {buildAssistantContext} from '../src/ai/assistantMemory';
import {createChatGenerator} from '../src/ai/chatProvider';
import {constrainInitialGoalPlan,createGoalPlanGenerator} from '../src/ai/goalPlanProvider';
import {normalizeGoalPlanInput} from '../src/ai/goalPlanContract';
import {correctionGuidance} from '../src/ai/correctionGuidance';

const originalFetch=globalThis.fetch;
const requests:any[]=[];
const config={openAiApiKey:'test-only',preferredProvider:'openai' as const};
const example='Исправление пользователя (цель)\nБыло: Изучать Python.\nСтало: Проверить пропуски в таблице.\nПредпочтение: конкретный результат вместо общей темы.';
const context=(content?:string)=>buildAssistantContext({memories:content?[{id:'m',userId:'account-a',content,createdAt:'2026-11-05',updatedAt:'2026-11-05'}]:[],state:{}});
globalThis.fetch=async(_url,init)=>{
  const request=JSON.parse(String(init?.body));requests.push(request);
  const answer={reply:'Проверить пропуски в таблице.',desiredResult:'Готовый анализ',directions:[{slotIndex:0,title:'Анализ',actions:['Проверить пропуски в таблице'],actionDetails:[{title:'Проверить пропуски в таблице',shortTitle:'Проверить пропуски в таблице',description:'Посчитать пропуски каждого столбца и сохранить таблицу результата.'}]}]};
  return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(answer)}]}]}));
};
async function main(){
  const chat=createChatGenerator(config),plan=createGoalPlanGenerator(config);
  await chat({messages:[{role:'user',content:'Предложи шаг'}]},context(example));
  await plan({wish:'Подготовить анализ',planningMethod:'roadmap'},context(example));
  await plan({wish:'Подготовить анализ',planningMethod:'otani'},context(example));
  assert.equal(requests.length,3);
  const evidencePlan={desiredResult:'Готовый отчёт',directions:[{title:'Проверенные данные',actions:['Посчитать пропуски в таблице'],groundingSourceId:0}]};
  const evidenceInput={wish:'Подготовить отчёт',planScope:'full-map' as const,stepDensity:'adaptive' as const,clarifyRoadmap:true};
  assert.throws(()=>constrainInitialGoalPlan(evidencePlan,{...evidenceInput,discussionContext:JSON.stringify({history:[{role:'assistant',text:'Уже пройден урок 6'}],materials:[]})},{requireGroundingSourceId:true}),/неизвестный источник/,'assistant guesses are not evidence');
  const supported=constrainInitialGoalPlan(evidencePlan,{...evidenceInput,discussionContext:JSON.stringify({history:[{role:'user',text:'Есть таблица продаж'}],materials:[]})},{requireGroundingSourceId:true});
  assert.equal(supported.directions[0].groundingEvidence,'Есть таблица продаж');
  const course=constrainInitialGoalPlan(evidencePlan,{...evidenceInput,discussionContext:JSON.stringify({history:[],materials:[{name:'course.txt',text:'Урок 1: проверка пропусков'}]})},{requireGroundingSourceId:true});
  assert.match(course.directions[0].groundingEvidence!,/^Материал курса \(не прогресс\):/);

  for(const request of requests){
    assert.ok(request.input[0].content.includes(correctionGuidance),'all surfaces receive the same interpretation rules');
    assert.ok(JSON.stringify(request.input).includes('конкретный результат вместо общей темы'),'saved preference reaches provider');
  }
  for(const request of requests.slice(1)){
    const payload=JSON.parse(request.input[1].content);
    assert.ok(!payload.assistantContextData.includes('Изучать Python'),'private example never leaks across goals');
    assert.deepEqual(payload.contextScope,{kind:'goal'});
  }
  await chat({messages:[{role:'user',content:'Предложи шаг'}]},context('Предпочтение: один шаг на 15 минут'));
  const edited=JSON.stringify(requests.at(-1).input);
  assert.ok(edited.includes('один шаг на 15 минут')&&!edited.includes(example),'edited memory replaces old context');
  await plan({wish:'Подготовить анализ',planningMethod:'otani'},context());
  assert.ok(!JSON.stringify(requests.at(-1).input).includes('конкретный результат вместо общей темы'),'deleted or other-account memory is not cached in generator');
  const memory={id:'m',userId:'a',content:'Я на уроке 6',createdAt:'2026-11-01',updatedAt:'2026-11-01'};
  const state={goals:[{id:'old',title:'Старая цель — урок 6'},{id:'current',title:'Текущая цель'}],profile:{focus:'Урок 6'},habits:[{title:'Старый курс'}]};
  const currentInput={wish:'Пройти новый курс',goalId:'current',currentState:'Я только начинаю, урок 1',discussionContext:'Пользователь: Начинаю новый курс. Материалы: урок 1 — вводная часть.'};
  await plan(currentInput,buildAssistantContext({memories:[memory],state}));
  const legacyPayload=JSON.parse(requests.at(-1).input[1].content);
  assert.ok(!legacyPayload.assistantContextData.includes('урок 6')&&!legacyPayload.assistantContextData.includes('Урок 6'),'legacy full context is narrowed even without scoped endpoint');
  assert.equal(legacyPayload.discussionContext,currentInput.discussionContext);
  assert.match(requests.at(-1).input[0].content,/важнее сохранённого assistantContextData/);
  assert.match(requests.at(-1).input[0].content,/Содержание курса описывает программу/);
  await plan(currentInput,buildAssistantContext({memories:[memory],state,scope:{kind:'goal',goalId:'current'}}));
  const scoped=JSON.parse(requests.at(-1).input[1].content).assistantContextData;
  assert.ok(scoped.includes('Текущая цель')&&!scoped.includes('Старая цель'));
  await plan({...currentInput,goalId:'other'},buildAssistantContext({memories:[],state,scope:{kind:'goal',goalId:'current'}}));
  assert.ok(!JSON.parse(requests.at(-1).input[1].content).assistantContextData.includes('Текущая цель'),'mismatched scope fails closed');
  await plan({...currentInput,goalId:undefined},buildAssistantContext({memories:[],state,scope:{kind:'goal',goalId:'current'}}));
  assert.ok(!JSON.parse(requests.at(-1).input[1].content).assistantContextData.includes('Текущая цель'),'new goal cannot inherit an existing goal');
  assert.equal(normalizeGoalPlanInput({...currentInput,discussionContext:'x'.repeat(25000)}).discussionContext?.length,24000);
  assert.deepEqual(normalizeGoalPlanInput({wish:'X',contextScope:{kind:'goal',goalId:'current'}}).contextScope,{kind:'goal',goalId:'current'});
  assert.deepEqual(normalizeGoalPlanInput({wish:'X',goalId:'a',contextScope:{kind:'goal',goalId:'b'}}).contextScope,{kind:'goal'});
  assert.ok(requests.every(r=>r.store===false));
  console.log('Correction context: chat, goals, OTANI, edited/deleted memory and no provider-side storage PASS (mock transport; no live model claim).');
}
main().finally(()=>{globalThis.fetch=originalFetch;}).catch(error=>{console.error(error);process.exitCode=1;});
