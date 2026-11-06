import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {createChatGenerator} from '../src/ai/chatProvider';
import {createGoalPlanGenerator} from '../src/ai/goalPlanProvider';
import {buildAssistantContext} from '../src/ai/assistantMemory';
// Synthetic, in-memory fixtures only: no Supabase reads or writes.
dotenv.config({quiet:true});
async function main(){
 assert.equal(process.env.KODA_DISCUSSION_LIVE_TEST,'1','Explicit live test opt-in required');
 assert.ok(process.env.OPENAI_API_KEY,'OpenAI key unavailable');
 const config={openAiApiKey:process.env.OPENAI_API_KEY,openAiModel:process.env.OPENAI_MODEL,preferredProvider:'openai' as const};
 const contextScope={kind:'goal' as const,goalId:'synthetic-current'};
 const context=buildAssistantContext({scope:contextScope,memories:[],state:{goals:[{id:'synthetic-other',title:'Другая цель',actions:[{id:'old',title:'Повторить шестой урок и требования финального проекта КЕДР-991',status:'pending'}]},{id:'synthetic-current',title:'Изучить аналитику',actions:[]}]}});
 assert.ok(!context.includes('КЕДР-991'));
 const discussionContext=JSON.stringify({materials:[{name:'course.txt',text:'Программа учебного курса: урок 6 — очистка таблиц, урок 7 — объединение таблиц заказов и клиентов через merge, урок 8 — группировки groupby. Практика урока 7: найти заказы без клиента через индикатор merge. Финального проекта в этом материале нет.'}],history:[{role:'user',text:'Я ещё на уроке 6.'},{role:'assistant',text:'Тогда продолжи урок 6.'},{role:'user',text:'Поправка: урок 6 уже полностью закончен. Сейчас начал урок 7. Есть 25 минут.'}]});
 const chat=await createChatGenerator(config)({contextScope,goalTitle:'Изучить аналитику',discussionContext,messages:[{role:'user',content:'Что мне делать следующим по моей программе? Учти последнее исправление прогресса. Предложи один конкретный шаг.'}]},context);
 assert.equal(chat.provider,'openai');assert.ok(/merge|объедин|заказ/i.test(chat.reply));assert.ok(!/КЕДР-991/.test(chat.reply));
 console.log(JSON.stringify({surface:'goal-chat',reply:chat.reply}));
 const plan=await createGoalPlanGenerator(config)({contextScope,wish:'Освоить объединение таблиц в Python',desiredResult:'Уметь найти заказы без клиента',discussionContext,availableMinutes:25},context);
 assert.ok(plan.directions.length);const output=JSON.stringify(plan);assert.ok(/merge|объедин|заказ/i.test(output));assert.ok(!/КЕДР-991/.test(output));
 console.log(JSON.stringify({surface:'goal-structure',plan}));
 const fresh=buildAssistantContext({scope:{kind:'goal'},memories:[],state:{goals:[{id:'synthetic-other',title:'Аналитика',actions:[{title:'Урок 6, проект КЕДР-991',status:'pending'}]}]}});
 const independent=await createChatGenerator(config)({contextScope:{kind:'goal'},goalTitle:'Вырастить базилик',discussionContext:JSON.stringify({materials:[{name:'plant.txt',text:'Базилик уже посеян. Всходы появились сегодня. Есть подоконник и лампа.'}],history:[]}),messages:[{role:'user',content:'Какой следующий шаг для этой цели?'}]},fresh);
 assert.ok(!/КЕДР-991|урок|Python|аналитик/i.test(independent.reply));console.log(JSON.stringify({surface:'new-goal',reply:independent.reply}));
 console.log('Live GPT goal discussion and materials: PASS; no account data accessed');
}
main().catch(()=>{console.error('Live discussion check failed; inspect synthetic outputs only');process.exitCode=1;});
