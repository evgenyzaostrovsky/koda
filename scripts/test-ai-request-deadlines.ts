import assert from 'node:assert/strict';
import {requestYandex} from '../src/ai/yandexClient';
import {requestOpenRouter} from '../src/ai/openRouterClient';

const originalFetch=globalThis.fetch,originalSetTimeout=globalThis.setTimeout;
const request={messages:[{role:'user' as const,content:'Synthetic deadline check'}],max_tokens:20,response_format:{type:'json_object' as const}};
const providers=[
  (timeoutMs?:number)=>requestYandex({apiKey:'fixture',folderId:'fixture',timeoutMs},request),
  (timeoutMs?:number)=>requestOpenRouter({apiKey:'fixture',model:'openrouter/free',timeoutMs},request),
];
async function main(){
  try{
    for(const run of providers){
      for(const [input,expected] of [[undefined,40000],[1200,1200],[999999,40000],[-1,1],[NaN,40000]] as const){
        const timeouts:number[]=[];
        globalThis.setTimeout=((handler:(...args:unknown[])=>void,timeout?:number,...args:unknown[])=>{timeouts.push(timeout??0);return originalSetTimeout(handler,0,...args);}) as typeof setTimeout;
        globalThis.fetch=(async()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{}'}}]}))) as typeof fetch;
        await run(input);assert.deepEqual(timeouts,[expected]);
      }
      globalThis.setTimeout=originalSetTimeout;
      globalThis.fetch=((_url,init)=>new Promise((_resolve,reject)=>{
        const signal=init?.signal;assert.ok(signal);
        signal.addEventListener('abort',()=>reject(new DOMException('Deadline expired','AbortError')),{once:true});
      })) as typeof fetch;
      let watchdog:ReturnType<typeof setTimeout>|undefined;
      try{
        await assert.rejects(Promise.race([run(1),new Promise((_resolve,reject)=>{watchdog=originalSetTimeout(()=>reject(new Error('Deadline did not abort')),300);})]),{name:'AbortError'});
      }finally{if(watchdog)clearTimeout(watchdog);}
    }
    console.log('PASS AI request deadlines: default/remaining bounds, finite values and actual abort on both providers.');
  }finally{globalThis.fetch=originalFetch;globalThis.setTimeout=originalSetTimeout;}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
