import dotenv from 'dotenv';
import {createChatGenerator} from '../src/ai/chatProvider';
import {createGoalPlanGenerator} from '../src/ai/goalPlanProvider';
import {buildAssistantContext} from '../src/ai/assistantMemory';
import {buildAssistantCorrectionMemory} from '../src/ai/assistantCorrections';
dotenv.config({quiet:true});
async function main(){
 if(!process.env.OPENAI_API_KEY) throw new Error('OpenAI key unavailable');
 const config={openAiApiKey:process.env.OPENAI_API_KEY,openAiModel:process.env.OPENAI_MODEL,preferredProvider:'openai' as const};
 const content=buildAssistantCorrectionMemory({source:'chat',before:'Заниматься аналитикой каждый день по часу',after:'Проверить пропуски в одном столбце за 15 минут',preference:'Предлагать один конкретный проверяемый результат за 15 минут; не назначать обязательный ежедневный режим.'});
 const context=buildAssistantContext({memories:[{id:'synthetic',userId:'synthetic',content,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}],state:{}});
 const chat=await createChatGenerator(config)({messages:[{role:'user',content:'Я учусь Python, у меня учебная таблица. Как сегодня попрактиковаться?'}]},context);
 console.log(JSON.stringify({surface:'chat',reply:chat.reply}));
 const plan=await createGoalPlanGenerator(config)({wish:'Подготовить учебный анализ таблицы',desiredResult:'Таблица проверена',planningMethod:'otani',currentState:'Учусь Python, есть учебная таблица. Нужен один ближайший практический шаг.',availableMinutes:15},context);
 console.log(JSON.stringify({surface:'otani',plan}));
}
main().catch(()=>{console.error('Live correction check failed; no secrets printed');process.exitCode=1});
