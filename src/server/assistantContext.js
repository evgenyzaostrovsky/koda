const { createClient } = require('@supabase/supabase-js');
const { createAuthFetch } = require('./aiSecurity');
const { buildAssistantContext, normalizeAssistantMemoryRow, ASSISTANT_CONTEXT_MEMORY_LIMIT, parseAutoPlanState, applyAutoPlanProgress, normalizeGoal } = require('./kodaDomain.cjs');

function createUserContextClient(token, env = process.env) {
  const url = env.SUPABASE_URL || env.EXPO_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_ANON_KEY || env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Assistant context is not configured.');
  // Never use the admin client. JWT + RLS remain in force on both reads.
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` }, fetch: createAuthFetch() },
  });
}

async function loadAssistantContext(req, dependencies = {}) {
  const header = req.headers?.authorization || req.headers?.Authorization;
  const match = typeof header === 'string' && header.match(/^Bearer\s+(\S+)$/i);
  if (!match) throw new Error('Authentication is required for assistant context.');
  const client = (dependencies.clientFactory || createUserContextClient)(match[1], dependencies.env || process.env);
  const { data: authData, error: authError } = await client.auth.getUser(match[1]);
  const owner = authData?.user?.id;
  if (authError || !owner || authData.user.is_anonymous === true) throw new Error('Assistant context session is invalid.');
  const [memoryResult, stateResult] = await Promise.all([
    client.from('assistant_memories').select('id,user_id,content,created_at,updated_at').eq('user_id', owner)
      .order('updated_at', { ascending: false }).order('id', { ascending: false }).limit(ASSISTANT_CONTEXT_MEMORY_LIMIT + 1),
    // Explicit columns; never query diary/journal tables or pass through embedded profile state.
    client.from('user_app_state').select('user_id,goals,habits,updated_at,profile_auto_plan:profile->autoPlan,profile_values:profile->>values,profile_future_self:profile->>futureSelf,profile_focus:profile->>focus,profile_milestone:profile->>milestone').eq('user_id', owner).maybeSingle(),
  ]);
  if (memoryResult.error || stateResult.error || !Array.isArray(memoryResult.data)) throw new Error('Assistant context could not be loaded.');
  if (stateResult.data && stateResult.data.user_id !== owner) throw new Error('Assistant context account mismatch.');
  const memories = memoryResult.data.map(row => normalizeAssistantMemoryRow(row, owner));
  const state = stateResult.data;
  return buildAssistantContext({ memories, state: state ? {
    goals: state.profile_auto_plan ? applyAutoPlanProgress(parseAutoPlanState(state.profile_auto_plan, owner), Array.isArray(state.goals) ? state.goals.filter(goal => !goal?.deletedAt).map(normalizeGoal).filter(Boolean) : []) : Array.isArray(state.goals) ? state.goals.filter(goal => !goal?.deletedAt) : [], habits: state.habits, updated_at: state.updated_at,
    profile: { values: state.profile_values, futureSelf: state.profile_future_self, focus: state.profile_focus, milestone: state.profile_milestone },
  } : null });
}

module.exports = { loadAssistantContext, createUserContextClient };
