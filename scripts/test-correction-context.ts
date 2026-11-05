import assert from 'node:assert/strict';
import {buildAssistantContext} from '../src/ai/assistantMemory';
import {createChatGenerator} from '../src/ai/chatProvider';
import {createGoalPlanGenerator} from '../src/ai/goalPlanProvider';
import {correctionGuidance} from '../src/ai/correctionGuidance';

const originalFetch=globalThis.fetch;
const requests:any[]=[];
const config={openAiApiKey:'test-only',preferredProvider:'openai' as const};
const example='Исправление пользователя. Было: Изучать Python. Стало: Проверить пропуски в таблице. Предпочтение: конкретный результат вместо общей темы.';
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
  for(const request of requests){
    assert.ok(request.input[0].content.includes(correctionGuidance),'all surfaces receive the same interpretation rules');
    assert.ok(JSON.stringify(request.input).includes('конкретный результат вместо общей темы'),'saved preference reaches provider');
  }
  await chat({messages:[{role:'user',content:'Предложи шаг'}]},context('Предпочтение: один шаг на 15 минут'));
  const edited=JSON.stringify(requests.at(-1).input);
  assert.ok(edited.includes('один шаг на 15 минут')&&!edited.includes(example),'edited memory replaces old context');
  await plan({wish:'Подготовить анализ',planningMethod:'otani'},context());
  assert.ok(!JSON.stringify(requests.at(-1).input).includes('конкретный результат вместо общей темы'),'deleted or other-account memory is not cached in generator');
  assert.ok(requests.every(r=>r.store===false));
  console.log('Correction context: chat, goals, OTANI, edited/deleted memory and no provider-side storage PASS (mock transport; no live model claim).');
}
main().finally(()=>{globalThis.fetch=originalFetch;}).catch(error=>{console.error(error);process.exitCode=1;});
