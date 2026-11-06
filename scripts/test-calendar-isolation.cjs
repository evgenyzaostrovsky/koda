const assert = require('node:assert/strict');
const { signCalendarToken } = require('../api/_calendarTokens');
const user = '123e4567-e89b-42d3-a456-426614174000';
const secret = 'test-only-calendar-secret';
let backendError = false;
let plannerRows = [];
let accountState = null;
let clients = [];
const auth = require('../src/server/aiSecurity');
auth.validateBearerToken = async token => token === 'valid' ? user : null;
const supabase = require('@supabase/supabase-js');
supabase.createClient = (url, key, options) => {
  clients.push({ key, options });
  return { from(table) {
    const query = { select(){return this},eq(field,value){ if (field === 'owner_key') assert.equal(value, `user:${user}`); if (field === 'user_id') assert.equal(value,user); return this; }, gte(){return this}, lte(){return this}, order(){return this}, maybeSingle:async()=>({data:accountState,error:null}), then(resolve){ assert.equal(table,'planner_events'); resolve(backendError ? {data:null,error:{message:'offline'}} : {data:plannerRows,error:null}); } };
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
  const { normalizeGoal, advanceAutoPlan } = require('../src/server/kodaDomain.cjs');
  const stamp = new Date().toISOString(), day = stamp.slice(0,10);
  const fixtureGoal = normalizeGoal({id:'deleted-test',title:'DeletedGoal',status:'active',priority:'main',actions:[{id:'step',title:'DeletedGoalAction',estimatedMinutes:20}]});
  const auto = {version:1,ownerId:user,settings:{enabled:true,dailyMinutes:120,timezone:'UTC',updatedAt:stamp,id:'settings'},assignments:[],completions:[],moves:[],days:[]};
  const planned = advanceAutoPlan(auto,[fixtureGoal],[],day,stamp);
  assert.equal(planned.assignments.length,1);
  accountState={user_id:user,goals:[fixtureGoal],profile_auto_plan:planned};
  result=await call({authorization:'Bearer valid'});
  assert.match(result.body,/DeletedGoalAction/,'fixture action is exported before deletion');
  planned.completions=[{id:'complete',assignmentId:planned.assignments[0].id,done:true,date:day,at:stamp}];
  accountState.goals=[{...fixtureGoal,deletedAt:stamp}];
  result=await call({authorization:'Bearer valid'});
  assert.doesNotMatch(result.body,/DeletedGoalAction/,'calendar must not export deleted goal assignments');
  plannerRows=[{id:'stale',event_date:day,title:'DeletedManual',done:false}];
  accountState.profile_planner={ownerId:user,domain:'planner',initialized:true,records:{stale:{value:{id:'stale',title:'DeletedManual',date:day},fields:{},deleted:{counter:1,actor:'test'}}}};
  backendError=true;
  result=await call({authorization:'Bearer valid'});
  assert.equal(result.code,200,'canonical planner does not depend on stale/failed mirror');
  assert.doesNotMatch(result.body,/DeletedManual/,'canonical tombstone excludes legacy mirror');
  accountState.profile_planner.records.active={value:{id:'active',title:'CanonicalManual',date:day,time:'',done:false},fields:{},deleted:null};
  result=await call({authorization:'Bearer valid'}); assert.match(result.body,/CanonicalManual/);
  delete accountState.profile_planner;
  backendError=true; assert.equal((await call({}, {key:signCalendarToken(user,secret)})).code,503);
  console.log('PASS calendar bearer and signed links: owner isolation, service credentials, invalid links and backend failures');
})().catch(e=>{console.error(e);process.exitCode=1});
