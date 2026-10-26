import assert from 'node:assert/strict';
import { requestOpenRouter, OpenRouterError, parseModelJson } from '../src/ai/openRouterClient';
import { readAiConfig, providerOrder, configuredAiHealth } from '../src/ai/providerConfig';
import { createAiProvider } from '../src/ai/aiProvider';
import { createGoalPlanGenerator } from '../src/ai/goalPlanProvider';
const originalFetch = globalThis.fetch;
const request = { messages: [{role:'user' as const,content:'Synthetic test'}], max_tokens:3000, response_format:{type:'json_object' as const} };
function response(content:unknown, status=200){return new Response(JSON.stringify(content),{status,headers:{'Content-Type':'application/json'}});}
function completion(content:string, finish_reason='stop'){return response({choices:[{message:{content},finish_reason}]});}
async function main(){
 let calls:Array<{model:string;signal:AbortSignal|null|undefined;body:any}>=[];
 globalThis.fetch=(async (_url,init)=>{const body=JSON.parse(String(init?.body));calls.push({model:body.model,signal:init?.signal,body});return calls.length===1?response({error:{message:'Private upstream text test-secret'}},404):completion('{"ok":true}');}) as typeof fetch;
 assert.equal(await requestOpenRouter({apiKey:'test-secret',model:'retired/model:free'},request),'{"ok":true}');
 assert.deepEqual(calls.map(c=>c.model),['retired/model:free','openrouter/free']);assert.equal(calls[0].signal,calls[1].signal);assert.equal(calls[1].body.provider.require_parameters,true);assert.deepEqual(calls[1].body.reasoning,{effort:'low',exclude:true});
 for(const status of [401,403,429,500]){let count=0;globalThis.fetch=(async()=>{count++;return response({error:{message:'test-secret'}},status);}) as typeof fetch;await assert.rejects(requestOpenRouter({apiKey:'test-secret',model:'retired/model:free'},request),(e:unknown)=>e instanceof OpenRouterError&&e.status===status&&!e.message.includes('test-secret'));assert.equal(count,1);}
 let count=0;globalThis.fetch=(async()=>{count++;return response({},404);}) as typeof fetch;await assert.rejects(requestOpenRouter({apiKey:'test',model:'paid/model'},request),OpenRouterError);assert.equal(count,1); // Never invent a paid or alternative paid slug.
 count=0;await assert.rejects(requestOpenRouter({apiKey:'test'},request),OpenRouterError);assert.equal(count,1); // Free router is not retried forever.
 for(const bad of [response({error:{message:'private'}},200),completion(''),completion('  '),completion('{"cut":', 'length')]){globalThis.fetch=(async()=>bad) as typeof fetch;await assert.rejects(requestOpenRouter({apiKey:'test'},request),(e:unknown)=>e instanceof OpenRouterError&&e.reason==='invalid_response');}
 globalThis.fetch=(async()=>{throw new Error('offline');}) as typeof fetch;await assert.rejects(requestOpenRouter({apiKey:'test'},request),/offline/);
 assert.deepEqual(parseModelJson('\x60\x60\x60json\n{"ok":true}\n\x60\x60\x60'.replace(/\\x60/g,String.fromCharCode(96))),{ok:true});assert.throws(()=>parseModelJson('not JSON'),OpenRouterError);
 const config=readAiConfig({GEMINI_API_KEY:'fake-gemini',OPENROUTER_API_KEY:'fake-router',KODA_AI_PROVIDER:'openrouter',OPENROUTER_MODEL:'openrouter/free'});
 assert.deepEqual(providerOrder(config),['openrouter','gemini']);assert.equal(configuredAiHealth(config).provider,'openrouter');assert.equal(configuredAiHealth(config).model,'openrouter/free');assert.deepEqual(providerOrder({}),[]);assert.deepEqual(providerOrder({...config,preferredProvider:'auto'}),['gemini','openrouter']);
 const input={name:'Test',targetYear:'2027',answers:[],maxQuestions:1};
 globalThis.fetch=(async(url)=>{assert.ok(String(url).startsWith('https://openrouter.ai/'));return completion(JSON.stringify({shouldFinalize:true,nextQuestion:null,userProfile:{archetype:'A',description:'B',strategy:'C'},goals:[{title:'Goal',target:'Result',firstStep:'Step'}]}));}) as typeof fetch;
 const result=await createAiProvider(config).generate(input);assert.equal(result.provider,'openrouter');assert.equal(result.shouldFinalize,true);assert.equal(result.nextQuestion,null);
 globalThis.fetch=(async()=>completion(JSON.stringify({desiredResult:'One project',directions:[{title:'Learning',actions:['Read one page']}]}))) as typeof fetch;
 assert.equal((await createGoalPlanGenerator(config)({wish:'Learn Python'})).directions.length,1);
 console.log('OpenRouter: retired-free fallback, no paid escalation, bounded attempts/shared deadline, sanitized errors, invalid responses, JSON, provider preference, health and both AI flows PASS');
}
main().finally(()=>{globalThis.fetch=originalFetch;}).catch(e=>{console.error(e);process.exitCode=1;});
