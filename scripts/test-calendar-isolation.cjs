const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
async function main(){
 let reads=0;
 const source=fs.readFileSync('api/koda-calendar.ics.js','utf8');
 const box={module:{exports:{}},process:{env:{SUPABASE_URL:'test',EXPO_PUBLIC_SUPABASE_ANON_KEY:'public-key',SUPABASE_SERVICE_ROLE_KEY:'must-not-use'}},Date,Intl,require(name){
  if(name.includes('aiSecurity'))return {validateBearerToken:async token=>token==='valid'?'test-owner':null};
  if(name==='@supabase/supabase-js')return {createClient(url,key,options){
   assert.equal(key,'public-key');assert.equal(options.global.headers.Authorization,'Bearer valid');
   const query={select(){return this;},eq(field,value){assert.equal(field,'owner_key');assert.equal(value,'user:test-owner');return this;},gte(){return this;},lte(){return this;},order(){return this;},then(resolve){reads++;resolve({data:[],error:null});}};
   return {from(table){assert.equal(table,'planner_events');return query;}};
  }};
  throw Error(name);
 }};
 vm.runInNewContext(source,box);
 async function call(headers,query){const out={code:200,status(code){this.code=code;return this;},json(body){this.body=body;},setHeader(){},send(body){this.body=body;}};await box.module.exports({method:'GET',headers,query},out);return out;}
 assert.equal((await call({},{})).code,401);
 assert.equal((await call({authorization:'Bearer bad'},{})).code,401);
 assert.equal((await call({authorization:'Bearer valid'},{key:'user:other'})).code,403);
 assert.equal(reads,0);
 const own=await call({authorization:'Bearer valid'},{key:'user:test-owner'});
 assert.equal(own.code,200);assert.match(own.body,/BEGIN:VCALENDAR/);assert.equal(reads,1);
 console.log('PASS: calendar anonymous/invalid/foreign denied; own export uses owner JWT and public key, never service role');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
