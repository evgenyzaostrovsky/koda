import 'dotenv/config';
import assert from 'node:assert/strict';
import { normalizeGoalPlanInput, validateGoalPlan, type GoalPlanInput } from '../src/ai/goalPlanContract';
import { constrainInitialGoalPlan, createGoalPlanGenerator } from '../src/ai/goalPlanProvider';
import { readAiConfig } from '../src/ai/providerConfig';

const remembered=Array.from({length:10},(_,i)=>({question:`Вопрос ${i}`,answer:`Ответ ${i}`}));
assert.equal(normalizeGoalPlanInput({wish:'Цель',clarifyRoadmap:true,clarifications:remembered}).clarifications?.length,8,'Remember roadmap answers beyond the first two, with a bounded payload');
assert.equal(normalizeGoalPlanInput({wish:'Цель',clarifyGoal:true,clarifications:remembered}).clarifications?.length,2,'New-goal wizard keeps its existing limit');

const spanish: GoalPlanInput = {
  wish: 'Освоить основы испанского языка', desiredResult: 'Освоить основы испанского языка', availableMinutes: 10,
  planScope: 'full-map', stepDensity: 'adaptive', clarifyRoadmap: true,
  currentState: 'Алфавит, чтение и знакомство уже освоены. Заказ еды в кафе Sol я уже отработал. Сейчас остановился на просьбе принести счёт в уроке 5 «В кафе». Есть то же меню Sol и свой учебник; не нужны новый курс, покупки, алфавит и повторное знакомство. Могу заниматься по 10 минут.',
};
const csv: GoalPlanInput = {
  wish: 'Опубликовать учебный анализ продаж', desiredResult: 'Опубликованный анализ продаж', availableMinutes: 20,
  planScope: 'full-map', stepDensity: 'adaptive', clarifyRoadmap: true,
  currentState: 'Курс по аналитике пройден наполовину. Знаю SQL и Python. Есть CSV продаж с полями date, product, revenue; пропуски ещё не проверял. Новые курсы не нужны.',
};
const csvAnswered:GoalPlanInput={...csv,clarifications:[{question:'Где и в каком формате опубликовать?',answer:'Есть свой GitHub-репозиторий; хочу README и notebook. Сравнить выручку по товарам и месяцам по полям date, product, revenue; причинность не утверждать.'}]};

const noop = <T extends Array<{title:string;actions:string[]}>>(directions:T, extra:Record<string,unknown>={}) => ({desiredResult:spanish.desiredResult,answerStatus:'resolved',directions,...extra});

// The explicit roadmap-question mode is opt-in and transports its answer/context intact.
assert.equal(normalizeGoalPlanInput({...spanish, clarifyRoadmap:false}).clarifyRoadmap, undefined);
assert.equal(normalizeGoalPlanInput(spanish).clarifyRoadmap, true);
const questionOnly = validateGoalPlan({desiredResult:spanish.desiredResult,directions:[],clarificationQuestions:['Какой результат покажет, что испанского уже достаточно?','Что именно включает следующая часть учебника?']});
assert.equal(questionOnly.directions.length,0);
assert.equal(questionOnly.clarificationQuestions?.length,2);
assert.ok(validateGoalPlan({desiredResult:spanish.desiredResult,directions:[],planningNote:'Фактов пока недостаточно.'}).planningNote);
assert.throws(()=>validateGoalPlan({desiredResult:'x',directions:[]}),/Не получилось предложить/);

const answered: GoalPlanInput = {...spanish, clarifications:[
  {question:'Как поймёшь, что освоил основы?',answer:'Для меня основы — пройти темы кафе, транспорт, дорога, отель и покупки из оглавления и уметь выполнить одну бытовую просьбу или вопрос в каждой.'},
  {question:'Что есть в учебнике?',answer:'Оглавление: урок 5 — кафе; 6 — транспорт; 7 — дорога; 8 — отель; 9 — покупки. Это названия тем, подробности упражнений не знаю.'},
]};
const specificStages = [
  ['Просьба принести счёт в кафе Sol выполнена',['В знакомой ситуации кафе Sol попросить принести счёт; отметить, где понадобилась подсказка'],'остановился на просьбе принести счёт в уроке 5'],
  ['Урок 6 о транспорте пройден',['Открыть урок 6 «Транспорт» и выписать одну фразу для вопроса о маршруте'],'6 — транспорт'],
  ['Маршрут из урока 7 объяснён',['По фразам урока 7 объяснить один маршрут от точки A до B'],'7 — дорога'],
  ['Заезд в отель из урока 8 разыгран',['По материалу урока 8 составить одну реплику для заселения'],'8 — отель'],
  ['Покупка из урока 9 разыграна',['По материалу урока 9 спросить цену одного товара'],'9 — покупки'],
 ].map(([title, actions, groundingEvidence])=>({title:String(title),actions:actions as string[],groundingEvidence:String(groundingEvidence)}));
const goodSpanish = constrainInitialGoalPlan(noop(specificStages), answered);
assert.equal(goodSpanish.directions.length,5,'The confirmed result only needs five grounded topic stages');
assert.ok(goodSpanish.planningNote,'Explicitly unknown textbook exercises should be surfaced even when a topic-based route is possible');
assert.match(goodSpanish.directions[0].actions.join(' '),/Sol|счёт/iu);
assert.doesNotMatch(goodSpanish.directions[0].actions.join(' '),/заказать\s+еду/iu,'Do not repeat the already mastered food order');
assert.match(goodSpanish.directions[1].actions.join(' '),/урок 6/iu);
for(const filler of ['Изучить основные грамматические правила','Перейти к следующему уроку','Выучить новые слова и фразы']){
  assert.throws(()=>constrainInitialGoalPlan(noop(specificStages.map((d,i)=>i===4?{...d,actions:[filler]}:d)),answered),/слишком общие/,`Reject later-stage placeholder: ${filler}`);
}
const conciseSpanish = constrainInitialGoalPlan(noop(specificStages.slice(0,3)),answered);
assert.equal(conciseSpanish.directions.length,3,'Adaptive mode may stop at a short, complete result without filling eight stages');
assert.throws(()=>constrainInitialGoalPlan(noop([{title:'Неизвестный этап',actions:['Выполнить шаг']}],{directions:[{title:'Неизвестный этап',actions:['Выполнить шаг'],groundingSourceId:999}]}),answered,{requireGroundingSourceId:true}),/неизвестный источник/);
assert.throws(()=>constrainInitialGoalPlan({...noop([]),clarificationQuestions:['Что дальше?']},{...answered}),/нельзя повторять/,
  'The model cannot open a repeated clarification round after answers');

const dontKnow: GoalPlanInput = {...spanish, clarifications:[{question:'Какой результат?',answer:'Не знаю'}]};
const bounded = constrainInitialGoalPlan({
  desiredResult:spanish.desiredResult, directions:[],planningNote:'Фактов пока недостаточно, чтобы построить проверяемый путь.',
}, dontKnow);
assert.equal(bounded.directions.length,0);
assert.ok(bounded.planningNote);
const repeatedQuestion=constrainInitialGoalPlan({desiredResult:spanish.desiredResult,clarificationQuestions:['Какой результат?'],directions:[]},dontKnow);
assert.equal(repeatedQuestion.clarificationQuestions,undefined);assert.equal(repeatedQuestion.directions.length,0);assert.ok(repeatedQuestion.planningNote);
assert.throws(()=>constrainInitialGoalPlan({desiredResult:spanish.desiredResult,answerStatus:'resolved',directions:[{title:'Полная карта',actions:['Учить дальше'],groundingEvidence:'неизвестный факт'}]},dontKnow),/неполную карту|дословными/,
  'Unknown answers cannot silently become a fabricated full map');
const mixedKnownAndUnknown:GoalPlanInput={...spanish,clarifications:[
  {question:'Что есть в следующих уроках?',answer:'Не знаю оглавление.'},
  {question:'Что хочешь уметь?',answer:'Хочу только научиться попросить счёт в кафе Sol; еду заказывать уже умею.'},
]};
const knownCafeOnly=constrainInitialGoalPlan({desiredResult:'Попросить счёт в кафе Sol',answerStatus:'resolved',planningNote:'Дальнейшие темы не указаны; оставляю только подтверждённый сценарий.',directions:[{title:'Счёт в кафе Sol запрошен',actions:['В знакомой ситуации кафе Sol попросить счёт без повторения заказа еды'],groundingEvidence:'Заказ еды в кафе Sol я уже отработал.'}]},mixedKnownAndUnknown);
assert.equal(knownCafeOnly.directions.length,1,'Known answers remain usable even when one answer is unknown');

const contradictoryAnswers:GoalPlanInput={wish:'Опубликовать анализ продаж',desiredResult:'Опубликованный анализ продаж',planScope:'full-map',stepDensity:'adaptive',clarifyRoadmap:true,clarifications:[
  {question:'Где публиковать?',answer:'Хочу опубликовать в GitHub'},
  {question:'Нужна ли публикация?',answer:'Публиковать не нужно, нужен только локальный файл'},
]};
const conflicting=constrainInitialGoalPlan({desiredResult:contradictoryAnswers.desiredResult,answerStatus:'conflicting',directions:[]},contradictoryAnswers);
assert.equal(conflicting.directions.length,0,'Conflicting answers must never produce a roadmap');
assert.equal(conflicting.clarificationQuestions,undefined,'Conflict handling must not start a question loop');
assert.ok(conflicting.planningNote);
const unassessed=constrainInitialGoalPlan({desiredResult:contradictoryAnswers.desiredResult,directions:[{title:'Анализ опубликован',groundingEvidence:'Хочу опубликовать в GitHub',actions:['Сохранить анализ в GitHub']}]},contradictoryAnswers);
assert.equal(unassessed.directions.length,0,'A model plan without explicit answer compatibility assessment is rejected');
assert.ok(unassessed.planningNote);

const csvActions=[
  'Проверить пропуски только в полях date, product и revenue',
  'Сгруппировать revenue по product и отсортировать суммы',
  'Посчитать суммы revenue по месяцам из date',
  'Построить диаграмму выручки по товарам',
  'Сверить одну сумму группировки с исходными строками',
  'Записать, что поля не позволяют делать причинные выводы',
  'Сформулировать вывод по товарам с наибольшей выручкой',
  'Сохранить анализ с запросом и описанием метода',
];
const csvPlan = constrainInitialGoalPlan({desiredResult:csvAnswered.desiredResult,answerStatus:'resolved',directions:Array.from({length:8},(_,i)=>({
  title:['Таблица проверена','Выручка по товарам рассчитана','Период сравнения выбран','Результаты визуализированы','Расчёт перепроверен','Ограничения описаны','Выводы сформулированы','Учебный анализ опубликован'][i],
  actions:[csvActions[i]],
  groundingEvidence:'CSV продаж с полями date, product, revenue',
}))},csvAnswered);
assert.equal(csvPlan.directions.length,8);
assert.match(csvPlan.directions[1].actions[0],/revenue|product/iu);

// Provider prompt and input contract stay intact for the actual model adapter.
async function mockedTransportChecks(){
  const original=globalThis.fetch;
  try {
    let preflightCalls=0;globalThis.fetch=(async()=>{preflightCalls++;throw new Error('Broad language goal must clarify before proposing a route');}) as typeof fetch;
    const broad=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})({...spanish,wish:'Освоить основы японского языка',desiredResult:'Освоить основы японского языка'});
    assert.equal(preflightCalls,0);assert.equal(broad.directions.length,0);assert.equal(broad.clarificationQuestions?.length,2);
    const publicationQuestion=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(csv);
    assert.equal(preflightCalls,0,'Ask for a publication target before generating a plan');
    assert.equal(publicationQuestion.directions.length,0);assert.equal(publicationQuestion.clarificationQuestions?.length,1);
    assert.match(publicationQuestion.clarificationQuestions?.[0]??'',/где и в каком формате/i);
    globalThis.fetch=(async(_url,init)=>{preflightCalls++;const payload=JSON.parse(String(init?.body));if(payload.messages[0].content.includes('Проведи независимую короткую проверку'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({issues:[],missingQuestions:[],conflicting:false})}}]}));const sent=JSON.parse(payload.messages[1].content);const groundingSourceId=sent.groundingSources.findIndex((source:{id:number;text:string})=>/github/i.test(source.text));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({desiredResult:csvAnswered.desiredResult,answerStatus:'resolved',directions:[{title:'Первый анализ рассчитан',groundingSourceId,actions:['Проверить суммы выручки по указанным полям']}]})}}]}));}) as typeof fetch;
    const publishedCsv=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(csvAnswered);
    assert.equal(preflightCalls,2,'A supplied GitHub destination skips preflight; the plan then receives one audit');
    assert.equal(publishedCsv.clarificationQuestions,undefined);assert.equal(publishedCsv.directions.length,1);
    preflightCalls=0;
    const alreadySpecific={...spanish,currentState:spanish.currentState+' Хочу научиться просить счёт в кафе, этого достаточно.'};
    globalThis.fetch=(async(_url,init)=>{preflightCalls++;const payload=JSON.parse(String(init?.body));if(payload.messages[0].content.includes('Проведи независимую короткую проверку'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({issues:[],missingQuestions:[],conflicting:false})}}]}));const sent=JSON.parse(payload.messages[1].content);const evidence='Хочу научиться просить счёт в кафе, этого достаточно.';const groundingSourceId=sent.groundingSources.findIndex((source:{id:number;text:string})=>source.text.includes(evidence));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({desiredResult:alreadySpecific.desiredResult,answerStatus:'resolved',directions:[{title:'Счёт в кафе запрошен',groundingSourceId,actions:['В кафе попросить счёт и проверить, удалось ли обойтись без подсказки.']}]})}}]}));}) as typeof fetch;
    const specificOutcome=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(alreadySpecific);
    assert.equal(preflightCalls,2);assert.equal(specificOutcome.clarificationQuestions,undefined,'Do not ask again when context already states a measurable outcome; then audit the plan once');
    const answersModel={...noop(specificStages),planningNote:undefined};
    globalThis.fetch=(async(_url,init)=>{
      const payload=JSON.parse(String(init?.body));
      if(payload.messages[0].content.includes('Проведи независимую короткую проверку'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({issues:[],missingQuestions:[],conflicting:false})}}]}));
      const sent=JSON.parse(payload.messages[1].content);
      assert.equal(sent.clarifyRoadmap,true);assert.equal(sent.currentState,spanish.currentState);assert.deepEqual(sent.clarifications,answered.clarifications);
      assert.ok(Array.isArray(sent.groundingSources)&&sent.groundingSources.length>0);
      assert.match(payload.messages[0].content,/ко ВСЕМ этапам/i);
      assert.match(payload.messages[0].content,/groundingSourceId/i);
      assert.match(payload.messages[0].content,/число\/наличие упражнений/i);
      const grounded={...answersModel,directions:answersModel.directions.map(direction=>({...direction,groundingSourceId:sent.groundingSources.findIndex((source:{id:number;text:string})=>source.text.includes(direction.groundingEvidence??''))}))};
      assert.ok(grounded.directions.every(direction=>direction.groundingSourceId>=0),'Every mocked roadmap stage selects an available source id');
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(grounded)}}]}));
    }) as typeof fetch;
    assert.equal((await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(answered)).directions.length,5);
    globalThis.fetch=(async(_url,init)=>{
      const payload=JSON.parse(String(init?.body));
      assert.match(payload.messages[0].content,/не повторяй вопросы/i);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({desiredResult:spanish.desiredResult,directions:[],clarificationQuestions:['Уточни итог?']})}}]}));
    }) as typeof fetch;
    const noKnowResult=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(dontKnow);
    assert.equal(noKnowResult.directions.length,0);assert.equal(noKnowResult.clarificationQuestions,undefined);assert.ok(noKnowResult.planningNote);
    globalThis.fetch=(async(_url,init)=>{
      const payload=JSON.parse(String(init?.body));
      assert.match(payload.messages[0].content,/answerStatus="conflicting"/i);
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({desiredResult:contradictoryAnswers.desiredResult,answerStatus:'conflicting',directions:[]})}}]}));
    }) as typeof fetch;
    const conflictingResult=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(contradictoryAnswers);
    assert.equal(conflictingResult.directions.length,0);assert.equal(conflictingResult.clarificationQuestions,undefined);assert.ok(conflictingResult.planningNote);
    globalThis.fetch=(async(_url,init)=>{
      const payload=JSON.parse(String(init?.body));
      return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({desiredResult:contradictoryAnswers.desiredResult,directions:[{title:'Анализ опубликован',groundingEvidence:'Хочу опубликовать в GitHub',actions:['Сохранить анализ в GitHub']}]})}}]}));
    }) as typeof fetch;
    const unassessedResult=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(contradictoryAnswers);
    assert.equal(unassessedResult.directions.length,0);assert.ok(unassessedResult.planningNote);
    let callCount=0;
    globalThis.fetch=(async(_url,init)=>{callCount++;const payload=JSON.parse(String(init?.body));if(payload.messages[0].content.includes('Проведи независимую короткую проверку'))return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(noop([]))}}]}));const sent=JSON.parse(payload.messages[1].content);const grounded=specificStages.map((d,i)=>({...d,actions:i===4?['Перейти к следующему уроку']:d.actions,groundingSourceId:sent.groundingSources.findIndex((source:{id:number;text:string})=>source.text.includes(d.groundingEvidence??''))}));return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(noop(grounded))}}]}));}) as typeof fetch;
    const guarded=await createGoalPlanGenerator({preferredProvider:'yandex',yandexApiKey:'fixture',yandexFolderId:'fixture'})(answered);
    assert.equal(callCount,2,'A bad roadmap is audited once; invalid audit output fails closed without retries');
    assert.equal(guarded.directions.length,0);assert.ok(guarded.planningNote);assert.equal(guarded.clarificationQuestions,undefined);
  } finally { globalThis.fetch=original; }
}

async function liveYandex(){
  if(process.env.RUN_LIVE_KODA_ROADMAP!=='1')return;
  const config=readAiConfig(process.env);
  if(!config.yandexApiKey||!config.yandexFolderId)throw new Error('Yandex credentials are unavailable; no credential values were printed.');
  const generate=createGoalPlanGenerator({...config,preferredProvider:'yandex',openRouterApiKey:undefined,geminiApiKey:undefined});
  const originalFetch=globalThis.fetch,modelDrafts:string[]=[];
  globalThis.fetch=(async(url,init)=>{const response=await originalFetch(url,init);const data=await response.clone().json().catch(()=>({}));const content=data?.choices?.[0]?.message?.content;if(typeof content==='string')modelDrafts.push(content);return response;}) as typeof fetch;
  const outputs:Array<{name:string;directions:number;questions:number;planningNote?:string;titles:string[];groundingEvidence:Array<string|undefined>;actions:string[][];rawModelDraft?:string}> = [];
  const run=async(name:string,input:GoalPlanInput)=>{
    const before=modelDrafts.length;
    const plan=await generate(input);
    outputs.push({name,directions:plan.directions.length,questions:plan.clarificationQuestions?.length??0,planningNote:plan.planningNote,titles:plan.directions.map(d=>d.title),groundingEvidence:plan.directions.map(d=>d.groundingEvidence),actions:plan.directions.map(d=>d.actions),rawModelDraft:modelDrafts.length>before?modelDrafts.at(-1):undefined});
    return plan;
  };
  try {
  const first=await run('spanish-clarify',spanish);
  assert.ok(first.clarificationQuestions?.length,'Spanish context should prompt about measurable outcome / unknown book contents');
  assert.equal(first.directions.length,0);
  const spanishAnswers={...answered,clarifications:first.clarificationQuestions.map((question,index)=>({question,answer:index===0?'Для меня основы — уметь попросить счёт в кафе и выполнить по одной бытовой просьбе или вопросу в темах транспорт, дорога, отель и покупки. Заказ еды уже умею. Оглавление: урок 5 — кафе; 6 — транспорт; 7 — дорога; 8 — отель; 9 — покупки. Упражнения неизвестны.':'Оглавление: урок 5 — кафе; 6 — транспорт; 7 — дорога; 8 — отель; 9 — покупки. Упражнения неизвестны.'}))};
  assert.ok(spanishAnswers.clarifications.some(item=>/неизвестны/i.test(item.answer)),'Synthetic Spanish answers include an explicit unknown material detail');
  const spanishMap=await run('spanish-answered',spanishAnswers);
  console.log('LIVE_SPANISH_DIAGNOSTIC '+JSON.stringify(outputs.at(-1)));
  assert.ok(spanishMap.directions.length>=1&&spanishMap.directions.length<=8,'Enough user detail is available for a useful grounded Spanish route');
  assert.equal(spanishMap.clarificationQuestions,undefined,'Do not loop with more questions after answers');
  assert.ok(spanishMap.directions.some(d=>/транспорт|урок 6/iu.test(d.title+' '+d.actions.join(' '))));
  assert.ok(spanishMap.directions.every(d=>d.groundingEvidence),'Each returned Spanish stage must cite exact user context');
  assert.doesNotMatch(spanishMap.directions.flatMap(d=>d.actions).join(' '),/заказать\s+еду/iu,'Already mastered order must not be repeated');
  assert.doesNotMatch(spanishMap.directions.flatMap(d=>d.actions).join(' '),/в уроке\s+\d+\s+(?:есть|содержится|включено)\s+\d+\s+упражнений/iu,'Do not assert unknown textbook contents as facts');
  const unknown=await run('spanish-dont-know',{...spanish,clarifications:[{question:first.clarificationQuestions[0],answer:'Не знаю'}]});
  assert.equal(unknown.clarificationQuestions?.length??0,0,'No repeat questions after “не знаю”');
  assert.ok(unknown.planningNote,'Bound the roadmap when the result remains unknown');
  assert.ok(unknown.directions.length<8,'Do not invent a complete route from unknown answers');
  const csvQuestions=await run('sales-csv-clarify',csv);
  let csvMap=csvQuestions;
  if(csvQuestions.clarificationQuestions?.length){
    const answers=csvQuestions.clarificationQuestions.map(question=>({question,answer:/публикац|формат|где|репозитор|площадк/iu.test(question)?'Есть свой GitHub-репозиторий; хочу README и notebook. Сравнить выручку по товарам и месяцам по полям date, product, revenue; причинность не утверждать.':'По CSV с полями date, product, revenue хочу сравнить выручку по товарам и месяцам; есть свой GitHub-репозиторий, подойдут README и notebook, причинность не утверждать.'}));
    csvMap=await run('sales-csv-answered',{...csv,clarifications:answers});
  }
  console.log('LIVE_CSV_DIAGNOSTIC '+JSON.stringify(outputs.at(-1)));
  assert.ok(csvMap.directions.length>=1&&csvMap.directions.length<=8,'Course progress, CSV fields, desired analysis, and publication format are known');
  assert.ok(csvMap.directions.every(d=>d.groundingEvidence),'Every returned CSV stage must cite supplied facts');
  const csvActionsText=csvMap.directions.flatMap(d=>d.actions).join(' ');
  assert.match(csvActionsText,/GitHub|репозитор/i,'Use the supplied publication destination');
  assert.doesNotMatch(csvActionsText,/создать новый репозиторий|сделать репозиторий публичным|заполнить пропуск/iu,'Do not invent a new public repo or a missing-value policy');
  const exhausted=await run('low-energy',{
    wish:'Хочу закончить небольшой рассказ за два месяца. Сейчас тяжёлая неделя, мало сил и трудно начать.',desiredResult:'Закончить небольшой рассказ',availableMinutes:10,
    planScope:'full-map',stepDensity:'adaptive',clarifyRoadmap:true,
    currentState:'Сейчас тяжёлая неделя, мало сил и трудно начать. На план есть 10 минут за подход; ежедневный режим не нужен.',clarifications:[],
  });
  assert.ok(exhausted.directions.length>=1&&exhausted.directions.length<=8,'A low-energy 10-minute context should still get at least one manageable route step');
  assert.ok(exhausted.directions.every(d=>d.actions.length>=1&&d.groundingEvidence));
  console.log(JSON.stringify(outputs,null,2));
  } finally { globalThis.fetch=originalFetch; }
}

async function main(){await mockedTransportChecks();await liveYandex();console.log('PASS roadmap clarification contract, bounded unknown answer, all-stage concreteness, CSV and low-energy fixtures.');}
main().catch(error=>{console.error(error instanceof Error?error.stack:'Roadmap check failed');process.exitCode=1;});
