import assert from 'node:assert/strict';
import {diffGoalProposals} from '../src/ai/proposalCorrections';
import type {GoalPlanSuggestion} from '../src/ai/goalPlanContract';

function proposal(directions:GoalPlanSuggestion['directions']):GoalPlanSuggestion{return {desiredResult:'result',directions};}

const manyBefore=proposal(Array.from({length:8},(_,direction)=>({slotIndex:direction,title:`Направление ${direction+1}`,actions:Array.from({length:8},(_,action)=>`Шаг ${direction+1}.${action+1}`)})));
const manyAfter=proposal(manyBefore.directions.map((direction,index)=>index===7?{...direction,actions:direction.actions.map((action,actionIndex)=>actionIndex===7?'Изменённый шаг 8.8':action)}:direction));
const lateChange=diffGoalProposals(manyBefore,manyAfter,false);
assert.equal(lateChange.length,1,'an edit in direction 8, action 8 must be retained');
assert.match(lateChange[0].label,/Направление 8/);
assert.match(lateChange[0].before,/Шаг 8\.8/);
assert.match(lateChange[0].after,/Изменённый шаг 8\.8/);

const directionRename=proposal(manyBefore.directions.map((direction,index)=>index===7?{...direction,title:'Переименованное направление 8'}:direction));
const renamed=diffGoalProposals(manyBefore,directionRename,false);
assert.equal(renamed.length,1,'direction title edit is independently captured');
assert.match(renamed[0].after,/Переименованное направление 8/);

const removalBefore=proposal([{title:'Фактор',slotIndex:0,actions:['Первое','Удалённое','Следующее','Последнее']}]);
const removalAfter=proposal([{title:'Фактор',slotIndex:0,actions:['Первое','Следующее','Последнее']}]);
const removed=diffGoalProposals(removalBefore,removalAfter,true);
assert.equal(removed.length,1,'removing one item before retained siblings only reports that removal');
assert.match(removed[0].before,/Удалённое/);
assert.equal(removed[0].after.includes('Следующее'),false);
assert.match(removed[0].after,/Удалено из предложения/);

const ambiguousBefore=proposal([{title:'Фактор',actions:['Keep 1','Remove this','Original name','Keep 4']}]);
const ambiguousAfter=proposal([{title:'Фактор',actions:['Keep 1','Renamed action','Keep 4']}]);
const ambiguous=diffGoalProposals(ambiguousBefore,ambiguousAfter,false);
assert.equal(ambiguous.length,1,'unequal unmatched counts must stay grouped instead of guessing identities');
assert.match(ambiguous[0].before,/Remove this[\s\S]*Original name/);
assert.match(ambiguous[0].after,/Renamed action/);
assert.equal(ambiguous[0].after.includes('Original name'),false);

const ambiguousDirectionsBefore=proposal([
  {title:'Keep',actions:['Keep action']},
  {title:'Remove direction',actions:['Old action']},
  {title:'Original direction',actions:['Other old action']},
  {title:'Keep last',actions:['Keep last action']},
]);
const ambiguousDirectionsAfter=proposal([
  {title:'Keep',actions:['Keep action']},
  {title:'Renamed direction',actions:['New action']},
  {title:'Keep last',actions:['Keep last action']},
]);
const ambiguousDirections=diffGoalProposals(ambiguousDirectionsBefore,ambiguousDirectionsAfter,false);
assert.equal(ambiguousDirections.length,1,'unequal unmatched directions must be grouped');
assert.match(ambiguousDirections[0].before,/Remove direction[\s\S]*Original direction/);
assert.match(ambiguousDirections[0].after,/Renamed direction/);

const detailBefore=proposal([{title:'Поддержка',slotIndex:0,actions:['Позвонить'],actionDetails:[{title:'Позвонить',shortTitle:'Звонок',description:'Позвонить специалисту'}]}]);
const detailAfter=proposal([{title:'Поддержка',slotIndex:0,actions:['Позвонить'],actionDetails:[{title:'Позвонить',shortTitle:'Записаться',description:'Выбрать удобное время и записаться'}]}]);
const detailChanges=diffGoalProposals(detailBefore,detailAfter,true);
assert.equal(detailChanges.length,1,'OTANI detail edit is captured as one example');
assert.match(detailChanges[0].before,/Звонок/);
assert.match(detailChanges[0].after,/Записаться/);
assert.match(detailChanges[0].after,/Выбрать удобное время/);

console.log('proposal correction diff tests passed');
