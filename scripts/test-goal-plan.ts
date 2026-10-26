import assert from 'node:assert/strict';
import { normalizeGoalPlanInput, validateGoalPlan } from '../src/ai/goalPlanContract';
import { createGoalPlanGenerator, constrainInitialGoalPlan } from '../src/ai/goalPlanProvider';
assert.throws(()=>normalizeGoalPlanInput({wish:''}));
assert.equal(normalizeGoalPlanInput({wish:' Python ',availableMinutes:-10}).availableMinutes,10);
assert.throws(()=>validateGoalPlan(null));
assert.throws(()=>validateGoalPlan({desiredResult:'',directions:[]}));
const raw={desiredResult:'Три проекта',directions:[{title:'Python',actions:['Сделать пример','Сделать пример']},{title:'python',actions:['Дубль']},...Array.from({length:10},(_,i)=>({title:`Раздел ${i}`,actions:['Сделать пример',...Array.from({length:12},(_,j)=>`Шаг ${i}/${j}`)]}))]};
const result=validateGoalPlan(raw);
assert.equal(result.directions.length,8);
assert.equal(result.directions[0].actions.length,1);
assert.ok(result.directions.every(d=>d.actions.length<=8));
const actions=result.directions.flatMap(d=>d.actions);
assert.equal(new Set(actions).size,actions.length);
assert.deepEqual(validateGoalPlan(result),result);
assert.equal(validateGoalPlan({...raw,goalTitle:'  Перейти в аналитику  '}).goalTitle,'Перейти в аналитику');
assert.equal(validateGoalPlan({...raw,goalTitle:'x'.repeat(400)}).goalTitle?.length,300);
assert.equal(validateGoalPlan(raw).goalTitle,undefined,'Older responses remain compatible');
assert.equal(validateGoalPlan({goalTitle:'Начать обучение',desiredResult:'Выбрать учебный путь',directions:[{title:'Первый ориентир',actions:['Открыть программу курса']}]}).directions.length,1,'A single direction is sufficient');
const vague=constrainInitialGoalPlan({...raw,needsClarification:true},{wish:'Наладить жизнь'});
const questions=constrainInitialGoalPlan({...raw,needsClarification:true,clarificationQuestions:['Что хочется изменить?','Как заметишь результат?','Третий лишний']},{wish:'Наладить жизнь',clarifyGoal:true});
assert.equal(questions.clarificationQuestions?.length,2);
const answerInput=normalizeGoalPlanInput({wish:'Наладить жизнь',clarifyGoal:true,clarifications:[{question:'Что хочется изменить?',answer:' Начать писать рассказ, есть 5 минут '}]});
assert.equal(answerInput.clarifications?.[0].answer,'Начать писать рассказ, есть 5 минут');
const answered=constrainInitialGoalPlan({...raw,needsClarification:false,clarificationQuestions:['Снова вопрос?']},answerInput);
assert.equal(answered.clarificationQuestions,undefined);assert.equal(answered.directions.length,1);
for(const answerStatus of ['uncertain','conflicting']){
  const unresolved=constrainInitialGoalPlan({...raw,goalTitle:'Выдуманная смена работы',answerStatus,clarificationQuestions:['Повтор вопроса?']},answerInput);
  assert.equal(unresolved.clarificationQuestions,undefined);
  assert.match(unresolved.desiredResult,/Предварительно/);
  assert.doesNotMatch(JSON.stringify(unresolved),/Выдуманная смена работы|Три проекта|Назвать одну перемену|\?/);
  assert.equal(unresolved.directions.length,1);assert.equal(unresolved.directions[0].actions.length,1);
}
assert.equal(constrainInitialGoalPlan({...raw,goalTitle:'Уточнённая цель',answerStatus:'resolved'},answerInput).goalTitle,'Уточнённая цель','Resolved corrections retain the chosen goal');
assert.equal(constrainInitialGoalPlan({...raw,goalTitle:'Уточнённая цель',answerStatus:'resolved',needsClarification:true},answerInput).goalTitle,'Уточнённая цель','Resolved answers take precedence over a stale initial clarification flag');
assert.equal(constrainInitialGoalPlan({...raw,needsClarification:true}, {...answerInput,clarifications:[{question:'Что?',answer:'Не знаю'}]}).clarificationQuestions,undefined,'Never start a second question round');
assert.equal(constrainInitialGoalPlan({...raw,needsClarification:false,clarificationQuestions:['Лишний?']},{wish:'Закончить роман',clarifyGoal:true}).clarificationQuestions,undefined,'Specific wishes bypass clarification');
assert.equal(vague.directions.length,1);assert.equal(vague.directions[0].actions.length,1);
assert.match(vague.desiredResult,/Предварительный/);assert.doesNotMatch(JSON.stringify(vague),/Три проекта|3–5|сфер/);
const limited=constrainInitialGoalPlan({...raw,limitedCapacity:true},{wish:'Закончить роман, сил мало',availableMinutes:60});
assert.equal(limited.directions.length,1);assert.equal(limited.directions[0].actions.length,1);
assert.equal(limited.desiredResult,raw.desiredResult,'Capacity must not shrink the main outcome');
for(const wish of ['Могу иногда выделять 30 минут','Сил почти нет, есть 5 минут','Ежедневно не могу, хочу портфолио']){
  assert.equal(constrainInitialGoalPlan({...raw,limitedCapacity:false},{wish,desiredResult:'Главный результат',availableMinutes:60}).directions.length,1,'Explicit constraints survive a missed model flag on the second stage');
}
assert.equal(constrainInitialGoalPlan({...raw,limitedCapacity:false},{wish:'Написать роман в 5 частях, могу заниматься 30 минут',availableMinutes:30}).directions.length,3,'Non-time numbers must not trigger the minute budget cap');
assert.equal(constrainInitialGoalPlan({...raw,needsClarification:true},{wish:'Роман',desiredResult:'Завершённый роман'}).desiredResult,raw.desiredResult,'Do not replace an already specified outcome with clarification');
async function main(){ await assert.rejects(createGoalPlanGenerator({})({wish:'Python'}),/недоступен/); console.log('AI contract: validation, limits, dedupe, invalid response, manual fallback passed'); }
void main();
const completeMap={desiredResult:'Предложенный результат',directions:Array.from({length:8},(_,i)=>({title:`Направление ${i}`,actions:Array.from({length:8},(_,j)=>`Действие ${i}/${j}`)}))};
assert.equal(normalizeGoalPlanInput({wish:'Цель',planScope:'anything'}).planScope,undefined);
const fullInput={wish:'Цель, сил мало',planScope:'full-map' as const,availableMinutes:10,desiredResult:'Исходный результат'};
const complete=constrainInitialGoalPlan(completeMap,fullInput);
assert.equal(complete.directions.length,8);assert(complete.directions.every(d=>d.actions.length===8));assert.equal(complete.desiredResult,'Исходный результат');
assert.throws(()=>constrainInitialGoalPlan({...completeMap,directions:completeMap.directions.slice(0,7)},fullInput),/неполную/);
assert.throws(()=>constrainInitialGoalPlan(completeMap,{...fullInput,existingDirections:[{title:'Существующее',actions:[],routineTitles:[],archived:false}]}),/не сохранило/);
assert.equal(constrainInitialGoalPlan({...completeMap,directions:completeMap.directions.slice(0,7)},{...fullInput,existingDirections:[{title:'Архив',actions:[],routineTitles:[],archived:true}]}).directions.length,7);
