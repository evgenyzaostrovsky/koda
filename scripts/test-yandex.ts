import assert from 'node:assert/strict';
import { requestYandex, YandexError } from '../src/ai/yandexClient';
import { createYandexProvider } from '../src/ai/yandexProvider';
import { createGoalPlanGenerator } from '../src/ai/goalPlanProvider';
import { readAiConfig, configuredAiHealth, providerOrder } from '../src/ai/providerConfig';
const originalFetch = globalThis.fetch;
const request = { messages: [{ role: 'user' as const, content: 'Synthetic' }], max_tokens: 3000, response_format: { type: 'json_object' as const } };
const profile = {archetype:'A',description:'B',strategy:'C'};
const goal = {title:'Goal',target:'Result',firstStep:'Step'};
const completion = (content: unknown) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(content) } }] }));
async function main() {
  const config = readAiConfig({ YANDEX_API_KEY: 'secret-test', YANDEX_FOLDER_ID: 'folder-test', KODA_AI_PROVIDER: 'yandex', OPENROUTER_API_KEY: 'router-test' });
  assert.deepEqual(providerOrder(config), ['yandex', 'openrouter']);
  assert.deepEqual(providerOrder({ ...config, preferredProvider: 'auto' }), ['openrouter']);
  assert.equal(configuredAiHealth(config).model, 'yandexgpt-5.1');
  assert.equal(createYandexProvider({ yandexApiKey: 'only-key' }), null);
  let calls = 0;
  globalThis.fetch = (async (url, init) => {
    calls++; assert.equal(String(url), 'https://ai.api.cloud.yandex.net/v1/chat/completions');
    const headers = new Headers(init?.headers);
    assert.equal(headers.get('Authorization'), 'Api-Key secret-test');
    assert.equal(headers.get('OpenAI-Project'), 'folder-test');
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, 'gpt://folder-test/yandexgpt-5.1');
    assert.equal(body.response_format.type, 'json_object');
    assert.equal(body.provider, undefined); assert.equal(body.reasoning, undefined);
    assert.ok(init?.signal);
    return completion({ desiredResult: 'One project', directions: [{ title: 'Learn', actions: ['Read one page'] }] });
  }) as typeof fetch;
  assert.equal((await createGoalPlanGenerator(config)({ wish: 'Learn Python' })).directions.length, 1);
  assert.equal(calls, 1);
  globalThis.fetch = (async () => completion({ shouldFinalize: true, nextQuestion: null, userProfile:profile, goals: [{title:'Goal',target:'Result',firstStep:'Step'}] })) as typeof fetch;
  const result = await createYandexProvider(config)!.generate({ name:'Test',targetYear:'2027',maxQuestions:1,answers:[] });
  assert.equal(result.provider, 'yandex'); assert.equal(result.nextQuestion, null);
  globalThis.fetch=(async(_url,init)=>{const body=JSON.parse(String(init?.body));const prompt=JSON.parse(body.messages[1].content);assert.equal(prompt.rulesDraft,undefined);return completion({userProfile:profile,goals:[goal],shouldFinalize:false,nextQuestion:{eyebrow:'More',question:'More?',placeholder:'',rationale:''}});}) as typeof fetch;
  const capped=await createYandexProvider(config)!.generate({name:'Test',targetYear:'2027',maxQuestions:1,answers:[{eyebrow:'',question:'Goal?',placeholder:'',rationale:'',answer:'Learn'}]});
  assert.equal(capped.shouldFinalize,true);assert.equal(capped.nextQuestion,null);assert.equal(capped.nextStep,goal.firstStep);
  globalThis.fetch=(async()=>completion({shouldFinalize:true,goals:[],userProfile:profile})) as typeof fetch;
  await assert.rejects(createYandexProvider(config)!.generate({name:'Test',targetYear:'2027',maxQuestions:1,answers:[]}));
  // Even if a model ignores the small-draft prompt, limited time cannot expose eight branches.
  globalThis.fetch=(async()=>completion({desiredResult:'Portfolio',directions:Array.from({length:8},(_,i)=>({title:'Direction '+i,actions:['Step '+i+'a','Step '+i+'b','Step '+i+'c']}))})) as typeof fetch;
  const small=await createGoalPlanGenerator(config)({wish:'Portfolio',availableMinutes:15});
  assert.equal(small.directions.length,1);assert.equal(small.directions[0].actions.length,1);
  const ordinary=await createGoalPlanGenerator(config)({wish:'Project',availableMinutes:30});
  assert.equal(ordinary.directions.length,3);assert.ok(ordinary.directions.every(d=>d.actions.length===1));
  for (const status of [401,403,404,429,500]) {
    calls=0; globalThis.fetch=(async()=>{calls++;return new Response(JSON.stringify({error:{message:'secret-test'}}),{status});}) as typeof fetch;
    await assert.rejects(requestYandex({apiKey:'secret-test',folderId:'folder-test'},request), (e: unknown) => e instanceof YandexError && e.status === status && !e.message.includes('secret-test'));
    assert.equal(calls,1);
  }
  for (const body of [{error:{message:'secret-test'}},{choices:[{finish_reason:'length',message:{content:'{}'}}]},{choices:[{message:{content:' '}}]}]) {
    globalThis.fetch=(async()=>new Response(JSON.stringify(body))) as typeof fetch;
    await assert.rejects(requestYandex({apiKey:'secret-test',folderId:'folder-test'},request),YandexError);
  }
  console.log('Yandex: server auth, model URI, no implicit paid fallback, health, both flows, safe errors and invalid/truncated responses PASS');
}
main().finally(()=>{globalThis.fetch=originalFetch;}).catch(e=>{console.error(e);process.exitCode=1;});
