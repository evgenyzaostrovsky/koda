import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeGoalPlanInput } from '../src/ai/goalPlanContract';
import { constrainOtaniPlan, createGoalPlanGenerator, validateOtaniActionCopy } from '../src/ai/goalPlanProvider';
import { otaniGuidance } from '../src/ai/otaniGuidance';
import { buildAssistantContext } from '../src/ai/assistantMemory';

assert.equal(normalizeGoalPlanInput({wish:'Цель',planningMethod:'otani'}).planningMethod,'otani');
assert.equal(normalizeGoalPlanInput({wish:'Цель'}).planningMethod,undefined,'Roadmap remains the default for old callers');
assert.match(otaniGuidance,/параллельные области/);
assert.match(otaniGuidance,/НЕ последовательные этапы/);
assert.match(otaniGuidance,/не заполняй все 64 ячейки/i);
const assistantUi=readFileSync('src/features/koda/components/GoalStructureAssistant.tsx','utf8');
assert.match(assistantUi,/planningMethod:'otani' as const,[^}]*planScope:'full-map' as const,clarifications:/u,'OTANI clarification answers must reach follow-up requests');

const preserved=constrainOtaniPlan({desiredResult:'Результат',directions:[{slotIndex:0,title:'Переименованный фактор',actions:['Новое действие']}]},{
  wish:'Достичь результата',planningMethod:'otani',desiredResult:'Мой результат',
  goalProgress:{completedActions:['Готово'],pendingActions:[],milestones:[]},
  existingDirections:[{title:'Мой фактор',actions:['Моя ручная правка'],completedActions:['Готово'],routineTitles:['Ежедневная рутина'],archived:false}],
});
assert.equal(preserved.desiredResult,'Мой результат');
assert.equal(preserved.directions.length,1);
assert.equal(preserved.directions[0].title,'Мой фактор');
assert.deepEqual(preserved.directions[0].actions,['Готово','Ежедневная рутина','Моя ручная правка','Новое действие']);
assert.equal(constrainOtaniPlan({desiredResult:'Короткая цель',directions:[{title:'Фактор',actions:['Действие']}]},{wish:'Короткая цель',planningMethod:'otani'}).directions.length,1,'Sparse matrices are valid; no padding is required');

const originalFetch=globalThis.fetch;
const queuedReplies:Record<string,unknown>[]=[];
const requests:Array<{system:string;user:Record<string,unknown>}>=[];
let response:Record<string,unknown>={desiredResult:'Выступление готово',directions:[{slotIndex:2,title:'Практика навыка',actions:['Записать вступление на пять предложений','Проговорить вступление и отметить время']} ]};
globalThis.fetch=async(input,init)=>{
  const request=JSON.parse(String(init?.body)) as {messages?:Array<{role:string;content:string}>;input?:Array<{role:string;content:string|Array<{text:string}>}>};
  const messages=request.messages??request.input!.map(item=>({role:item.role,content:typeof item.content==='string'?item.content:item.content.map(part=>part.text).join('')}));
  requests.push({system:messages[0].content,user:JSON.parse(messages[1].content)});
  const reply=String(input).includes('api.openai.com')&&messages[0].content.includes('Проведи независимую короткую проверку')
    ?{issues:[],missingQuestions:[],conflicting:false}:(queuedReplies.shift()??response);
  if(Array.isArray(reply.directions)) for(const direction of reply.directions as Array<{actions:string[];actionDetails?:unknown}>) {
    direction.actionDetails??=direction.actions.map(title=>({title,shortTitle:title.length<=48?title:'Выполнить упражнение по материалу',description:title}));
  }
  const body=String(input).includes('api.openai.com')
    ?{output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(reply)}]}]}
    :{choices:[{message:{content:JSON.stringify(reply)},finish_reason:'stop'}]};
  return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
};
async function main(){
try{
  const generate=createGoalPlanGenerator({openRouterApiKey:'test-key',preferredProvider:'openrouter'});
  const plan=await generate({wish:'Подготовить выступление',planningMethod:'otani',planScope:'full-map',clarifyRoadmap:true,desiredResult:'Выступление готово'});
  assert.equal(plan.directions.length,1);
  assert.equal(plan.directions[0].slotIndex,2);
  assert.match(requests[0].system,/параллельные области/);
  assert.doesNotMatch(requests[0].system,/роадмап — последовательность/i);
  assert.equal(requests[0].user.planningMethod,'otani');
  assert.equal('groundingSources' in requests[0].user,false,'OTANI does not use roadmap evidence/review inputs');
  response={desiredResult:'Предварительный результат',directions:[],clarificationQuestions:['Какой срок важен?','Какие ресурсы уже есть?','Третий вопрос']};
  const questions=await generate({wish:'Подготовиться',planningMethod:'otani'});
  assert.deepEqual(questions.clarificationQuestions,['Какой срок важен?','Какие ресурсы уже есть?']);
  assert.deepEqual(questions.directions,[]);
  const accountContext=buildAssistantContext({memories:[{id:'m',userId:'u',content:'Мне удобны короткие занятия',createdAt:'',updatedAt:''}],state:{journal:'private diary text',profile:{focus:'Публичное выступление'},goals:[],habits:[]}});
  await assert.rejects(generate({wish:'Цель',planningMethod:'otani'},accountContext),/только через настроенного помощника OpenAI/);
  assert.equal(requests.length,2,'A provider without authorized OpenAI context support is never contacted');
  response={desiredResult:'Результат',directions:[{title:'Фактор',actions:['Действие']}]};
  await createGoalPlanGenerator({openAiApiKey:'test-key',preferredProvider:'openai'})({wish:'Цель',planningMethod:'otani'},accountContext);
  assert.equal(requests[2].user.assistantContextData,accountContext,'Only the bounded account-context format is accepted by OpenAI');
  assert.doesNotMatch(String(requests[2].user.assistantContextData),/private diary text/);
  assert.equal('assistantContextData' in requests[0].user,false,'Other providers never receive scoped account context');
  response={answerStatus:'resolved',desiredResult:'Отчёт опубликован',directions:Array.from({length:8},(_,i)=>({title:`Этап ${i+1}`,groundingSourceId:0,actions:Array.from({length:8},(_,j)=>`Операция ${i+1}/${j+1}`)}))};
  await createGoalPlanGenerator({openAiApiKey:'test-key',preferredProvider:'openai'})({wish:'Подготовить и опубликовать отчёт по теме X',desiredResult:'Отчёт опубликован',planningMethod:'roadmap',planScope:'full-map',clarifyRoadmap:true,clarifications:[{question:'Где опубликовать?',answer:'В личном блоге'}],currentState:'Есть исходные данные: поле А'},accountContext);
  assert.equal(requests[3].user.assistantContextData,accountContext,'Initial roadmap generation uses the approved context');
  assert.equal((requests[4].user.facts as Record<string,unknown>).assistantContextData,accountContext,'The independent roadmap review receives the same approved context');
  const followUp={wish:'Стать Дата аналитиком',planningMethod:'otani' as const,clarifications:[{question:'Опыт?',answer:'Учусь на karpov.courses, Python, исследование данных и создание метрик'}]};
  queuedReplies.push({desiredResult:'Оффер',directions:[],clarificationQuestions:['Какой у вас опыт?']},{desiredResult:'Оффер',directions:[{slotIndex:0,title:'Исследование данных',actions:['Проверить пропуски в данных урока']} ]});
  const before=requests.length;
  const repaired=await createGoalPlanGenerator({openAiApiKey:'test-key',preferredProvider:'openai'})(followUp,accountContext);
  assert.equal(requests.length-before,2,'Invalid follow-up gets one repair instead of failing immediately');
  assert.equal(repaired.directions[0].title,'Исследование данных');
  assert.equal(repaired.clarificationQuestions,undefined);
  assert.equal(requests.at(-1)!.user.assistantContextData,accountContext,'Repair keeps the same authorized account context');
  assert.deepEqual(requests.at(-1)!.user.clarifications,followUp.clarifications,'Repair preserves user answers');
  queuedReplies.push({directions:[]},{desiredResult:'Оффер',directions:[],clarificationQuestions:['Какая стартовая точка?']});
  const initialRepair=await createGoalPlanGenerator({openAiApiKey:'test-key',preferredProvider:'openai'})({wish:'Стать аналитиком',planningMethod:'otani'});
  assert.deepEqual(initialRepair.clarificationQuestions,['Какая стартовая точка?'],'Initial repair may still clarify missing facts');
  assert.match(requests.at(-1)!.system,/можно вернуть 1–2 уточняющих вопроса/);
  response={desiredResult:'Оффер',directions:[],clarificationQuestions:['Опыт?']};
  const beforeFailure=requests.length;
  await assert.rejects(createGoalPlanGenerator({openAiApiKey:'test-key',preferredProvider:'openai'})(followUp),/повторять уточняющий круг/);
  assert.equal(requests.length-beforeFailure,2,'Repeated invalid output fails safely after exactly one repair');
}finally{globalThis.fetch=originalFetch;}

const copyInput={wish:'Цель',planningMethod:'otani' as const,actionCopyOnly:true,existingDirections:[{title:'Навык',actions:['Старое длинное название'],routineTitles:[],archived:false}]};
const copyPlan={desiredResult:'Результат',directions:[{slotIndex:0,title:'Навык',actions:['Старое длинное название'],actionDetails:[{title:'Старое длинное название',shortTitle:'Решить упражнение по Python',description:'Старое длинное название с условиями'}]}]};
assert.equal(validateOtaniActionCopy(copyPlan,copyInput),copyPlan);
assert.throws(()=>validateOtaniActionCopy({...copyPlan,directions:[{...copyPlan.directions[0],actions:['Новое дело']}]},copyInput),/исходные действия/);
assert.throws(()=>validateOtaniActionCopy({...copyPlan,directions:[{...copyPlan.directions[0],actionDetails:[]}]},copyInput),/короткое законченное/);
assert.throws(()=>validateOtaniActionCopy({...copyPlan,directions:[{...copyPlan.directions[0],actionDetails:[{...copyPlan.directions[0].actionDetails[0],shortTitle:'Сокращённая строка…'}]}]},copyInput),/короткое законченное/);
assert.match(otaniGuidance,/actionCopyOnly=true/);
assert.match(otaniGuidance,/не механическое обрезание/);

console.log('OTANI assistant: mode-specific prompt, sparse output, clarification limits, and protected progress passed');
}
void main();
