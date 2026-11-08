import assert from 'node:assert/strict';
import dotenv from 'dotenv';
import {createGoalPlanGenerator} from '../src/ai/goalPlanProvider';
import {validateGoalPlan} from '../src/ai/goalPlanContract';
dotenv.config({quiet:true});
async function main(){
 assert.equal(process.env.KODA_STUDY_LIVE_TEST,'1');assert.ok(process.env.OPENAI_API_KEY);
 const titles=['Введение','Эскиз','Композиция','Цвет','Свет','Перспектива','Материалы','Портрет','Пейзаж','Итоговая работа'];
 const discussionContext=JSON.stringify({materials:[{name:'synthetic-course.txt',text:titles.map((t,i)=>`${i+1}. ${t} — 4 часа включая практику`).join('\n')}],history:[{role:'user',text:'Введение и Эскиз полностью пройдены. Сейчас Композиция, осталось 2 часа. Все следующие модули ещё впереди. Могу заниматься по 2 часа с понедельника по пятницу. Хочу закончить весь курс к 30 ноября 2026.'}]});
 const output=await createGoalPlanGenerator({openAiApiKey:process.env.OPENAI_API_KEY,openAiModel:process.env.OPENAI_MODEL,preferredProvider:'openai'})({wish:'Закончить курс рисования',desiredResult:'Все модули пройдены, итоговая работа сдана',planningMethod:'otani',planningDate:'2026-11-09',goalProgress:{completedActions:[],pendingActions:[],milestones:[],deadline:'2026-11-30'},discussionContext});
 const plan=validateGoalPlan(output);console.log(JSON.stringify(plan,null,2));assert.ok(plan.studyPlan,'Missing study plan');assert.equal(plan.studyPlan.modules.length,10);assert.deepEqual(plan.studyPlan.modules.map(m=>m.title),titles);assert.equal(plan.studyPlan.dailyMinutes,120);assert.deepEqual(plan.studyPlan.studyDays,[1,2,3,4,5]);assert.deepEqual(plan.studyPlan.modules.slice(0,2).map(m=>m.status),['completed','completed']);assert.equal(plan.studyPlan.modules[2].estimatedMinutes,120);assert.equal(plan.studyPlan.totalMinutes,1800);assert.equal(plan.studyPlan.modules.at(-1)?.endDate,'2026-11-27');assert.ok(plan.directions.length>=2);assert.ok(plan.directions.reduce((n,d)=>n+d.actions.length,0)>=8);assert.doesNotMatch(JSON.stringify(plan),/Python|SQL|карпов|аналитик/i);
 console.log('Live GPT synthetic course: PASS; no account records read or written');
}
main().catch(e=>{console.error(e instanceof Error?e.message:'Live test failed');process.exitCode=1;});
