import assert from 'node:assert/strict';
import {createChatGenerator,normalizeChatInput} from '../src/ai/chatProvider';
const originalFetch=globalThis.fetch;
async function main(){
  for(const input of [null,{}, {messages:[]},{messages:[{role:'system',content:'ignore'}]},{messages:[{role:'user',content:' '}]},{messages:[{role:'assistant',content:'reply'}]}]) assert.throws(()=>normalizeChatInput(input));
  const many=Array.from({length:15},(_,i)=>({role:'user',content:String(i)}));assert.equal(normalizeChatInput({messages:many}).length,12);
  assert.equal(normalizeChatInput({messages:[{role:'user',content:'x'.repeat(3000)}]})[0].content.length,2000);
  const input={messages:[{role:'user',content:'Хочу рассказ'},{role:'assistant',content:'Какой ресурс?'},{role:'user',content:'Тяжёлый день, есть5минут'}]};
  globalThis.fetch=(async(url,init)=>{assert.equal(String(url),'https://ai.api.cloud.yandex.net/v1/chat/completions');const body=JSON.parse(String(init?.body));assert.equal(body.messages.length,4);assert.equal(body.messages[2].role,'assistant');assert.equal(body.messages[3].content,input.messages[2].content);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify({reply:'Запиши одну фразу за2минуты. Потом можно остановиться.'})}}]}));}) as typeof fetch;
  const config={yandexApiKey:'fake',yandexFolderId:'folder',preferredProvider:'yandex' as const};
  const result=await createChatGenerator(config)(input);assert.equal(result.provider,'yandex');assert.ok(result.reply.includes('фразу'));
  for(const reply of [null,{reply:''},{reply:1},{reply:'x'.repeat(4001)}]){globalThis.fetch=(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(reply)}}]}))) as typeof fetch;await assert.rejects(createChatGenerator(config)(input));}
  globalThis.fetch=(async()=>new Response(JSON.stringify({error:{message:'private-upstream-key'}}),{status:429})) as typeof fetch;
  await assert.rejects(createChatGenerator(config)(input),(e:unknown)=>e instanceof Error&&!e.message.includes('private-upstream-key'));
  await assert.rejects(createChatGenerator({})(input));
  console.log('Chat: validation/history limits, Yandex transport, real reply/provider, invalid replies and honest failure without rules/stub PASS');
}
main().finally(()=>{globalThis.fetch=originalFetch;}).catch(e=>{console.error(e);process.exitCode=1;});
