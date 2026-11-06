/** Goal-local memory. User statements are evidence; assistant replies are only suggestions. */
export type DiscussionMessage = {id:string;role:'user'|'assistant';content:string;at:string};
export type DiscussionMaterial = {id:string;name:string;content:string;at:string};
export type GoalDiscussionData = {messages:DiscussionMessage[];materials:DiscussionMaterial[];removedIds:string[]};
export function normalizeGoalDiscussion(raw:unknown):GoalDiscussionData {
  const value=(raw&&typeof raw==='object'?raw:{}) as Partial<GoalDiscussionData>;
  const removedIds=Array.from(new Set((Array.isArray(value.removedIds)?value.removedIds:[]).filter(x=>typeof x==='string')));
  const valid=(item:any)=>item&&typeof item.id==='string'&&typeof item.content==='string'&&typeof item.at==='string'&&Number.isFinite(Date.parse(item.at))&&!removedIds.includes(item.id);
  const messages=(Array.isArray(value.messages)?value.messages:[]).filter(item=>valid(item)&&['user','assistant'].includes(item.role)).map(item=>({id:item.id,role:item.role,at:item.at,content:item.content.slice(0,4000)}));
  const materials=(Array.isArray(value.materials)?value.materials:[]).filter(item=>valid(item)&&typeof item.name==='string').map(item=>({id:item.id,at:item.at,name:item.name.slice(0,120),content:item.content.slice(0,16000)}));
  return {messages,materials,removedIds};
}
export function mergeGoalDiscussion(a:unknown,b:unknown):GoalDiscussionData {
  const left=normalizeGoalDiscussion(a),right=normalizeGoalDiscussion(b);
  const union=<T extends {id:string;at:string}>(a:T[],b:T[])=>Array.from(new Map([...a,...b].sort((a,b)=>a.at.localeCompare(b.at)||JSON.stringify(a).localeCompare(JSON.stringify(b))).map(item=>[item.id,item])).values()).sort((a,b)=>a.at.localeCompare(b.at)||a.id.localeCompare(b.id));
  return normalizeGoalDiscussion({messages:union(left.messages,right.messages),materials:union(left.materials,right.materials),removedIds:[...left.removedIds,...right.removedIds]});
}
export function goalDiscussionContext(raw:unknown):string {
  const data=normalizeGoalDiscussion(raw);
  // Latest user corrections are included last and take priority; never silently treat course contents as completed work.
  const materials=data.materials.map(m=>({name:m.name,text:m.content}));
  const history=data.messages.slice(-12).map(m=>({role:m.role,text:m.content,at:m.at}));
  let result=JSON.stringify({materials,history});
  const lastUser=history.findLast(m=>m.role==='user');
  while(result.length>24000&&history.length>1){const index=history.findIndex(m=>m!==lastUser);if(index<0)break;history.splice(index,1);result=JSON.stringify({materials,history,earlierMessagesOmitted:true});}
  while(result.length>24000&&materials.some(m=>m.text.length>100)){const longest=[...materials].sort((a,b)=>b.text.length-a.text.length)[0];longest.text=longest.text.slice(0,Math.floor(longest.text.length*0.8));result=JSON.stringify({materials,history,contextShortened:true});}
  while(result.length>24000&&materials.length){materials.shift();result=JSON.stringify({materials,history,contextShortened:true});}
  return result;
}
export function validateDiscussionMaterial(name:string,content:string,existing:GoalDiscussionData):void {
  if(!/\.(txt|md|csv|json)$/i.test(name))throw new Error('Выбери TXT, MD, CSV или JSON. Из PDF или страницы курса можно вставить текст в сообщение.');
  if(!content.trim()||content.includes('\u0000')||content.includes('\ufffd'))throw new Error('Нужен непустой текстовый файл в UTF-8.');
  if(content.length+existing.materials.reduce((n,m)=>n+m.content.length,0)>16000)throw new Error('Материалы: до 16 000 символов суммарно. Удали лишнее или загрузи короткую программу курса.');
}

export function assertDiscussionCapacity(value:GoalDiscussionData):void {
 if(new TextEncoder().encode(JSON.stringify(value)).length>28000)throw new Error('Память беседы заполнена. Удали ненужные сообщения или материалы перед продолжением.');
}
