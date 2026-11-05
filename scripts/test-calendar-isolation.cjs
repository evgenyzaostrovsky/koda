const assert = require('node:assert/strict');
const { signCalendarToken } = require('../api/_calendarTokens');
const user = '123e4567-e89b-42d3-a456-426614174000';
const secret = 'test-only-calendar-secret';
let backendError = false;
let clients = [];
const auth = require('../src/server/aiSecurity');
auth.validateBearerToken = async token => token === 'valid' ? user : null;
const supabase = require('@supabase/supabase-js');
supabase.createClient = (url, key, options) => {
  clients.push({ key, options });
  return { from(table) {
    const query = { select(){return this},eq(field,value){ if (field === 'owner_key') assert.equal(value, `user:${user}`); if (field === 'user_id') assert.equal(value,user); return this; }, gte(){return this}, lte(){return this}, order(){return this}, maybeSingle:async()=>({data:null,error:null}), then(resolve){ assert.equal(table,'planner_events'); resolve(backendError ? {data:null,error:{message:'offline'}} : {data:[],error:null}); } };
    return query;
  }};
};
const handler = require('../api/koda-calendar.ics');
function response(){ return {code:200,headers:{},status(code){this.code=code;return this},json(body){this.body=body;return this},setHeader(k,v){this.headers[k]=v},send(body){this.body=body;return this}}; }
async function call(headers={},query={}){ const out=response();await handler({method:'GET',headers,query},out);return out; }
(async()=>{
  process.env.SUPABASE_URL='https://example.test'; process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY='public-key'; process.env.SUPABASE_SERVICE_ROLE_KEY='service-key'; process.env.CALENDAR_TOKEN_SECRET=secret;
  assert.equal((await call({authorization:'Bearer invalid'})).code,401);
  assert.equal((await call({authorization:'Bearer valid'},{key:'user:other'})).code,403);
  assert.equal((await call({}, {key:`user:${user}`})).code,403);
  assert.equal(clients.length,0);
  let result=await call({authorization:'Bearer valid'},{key:`user:${user}`});
  assert.equal(result.code,200);assert.match(result.body,/BEGIN:VCALENDAR/);assert.equal(clients[0].key,'public-key');assert.equal(clients[0].options.global.headers.Authorization,'Bearer valid');
  result=await call({}, {key:signCalendarToken(user,secret)});
  assert.equal(result.code,200);assert.equal(clients[1].key,'service-key');assert.equal(clients[1].options.global,undefined);
  backendError=true; assert.equal((await call({}, {key:signCalendarToken(user,secret)})).code,503);
  console.log('PASS calendar bearer and signed links: owner isolation, service credentials, invalid links and backend failures');
})().catch(e=>{console.error(e);process.exitCode=1});
