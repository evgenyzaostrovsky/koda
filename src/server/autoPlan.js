const { parseAutoPlanState, advanceAutoPlan } = require('../features/koda/autoPlan');
const { normalizeStoredKodaState } = require('../features/koda/persistence');

function localPlanDate(now, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

/** Patch only profile, with CAS. Never rewrite goals or advance from an unacknowledged client snapshot. */
async function advanceAccountAutoPlan(client, ownerId, now = new Date()) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await client.from('user_app_state').select('*').eq('user_id', ownerId).maybeSingle();
    if (row.error) throw row.error;
    if (!row.data) return { changed: false, reason: 'no-state' };
    if (row.data.user_id !== ownerId) throw new Error('Account mismatch');
    const plan = parseAutoPlanState(row.data.profile?.autoPlan, ownerId);
    if (!plan?.settings.enabled) return { changed: false, reason: 'disabled' };
    const state = normalizeStoredKodaState(row.data);
    if (!state) throw new Error('Invalid account state');
    const date = localPlanDate(now, plan.settings.timezone);
    const calendar = await client.from('planner_events').select('id,event_date,event_time,title,done').eq('owner_key', `user:${ownerId}`).eq('event_date', date);
    if (calendar.error) throw calendar.error;
    const items = (calendar.data || []).map(item => ({ id: item.id, date: item.event_date, time: item.event_time || '', title: item.title, done: item.done }));
    const next = advanceAutoPlan(plan, state.goals, items, date, now.toISOString());
    if (JSON.stringify(next) === JSON.stringify(plan)) return { changed: false, reason: 'current', date };
    const updatedAt = new Date(Math.max(now.getTime(), Date.parse(row.data.updated_at) + 1)).toISOString();
    const write = await client.from('user_app_state').update({ profile: { ...row.data.profile, autoPlan: next }, updated_at: updatedAt })
      .eq('user_id', ownerId).eq('updated_at', row.data.updated_at).select('user_id').maybeSingle();
    if (write.error) throw write.error;
    if (write.data) return { changed: true, date };
  }
  throw new Error('Account changed concurrently; retry later');
}

module.exports = { advanceAccountAutoPlan, localPlanDate };
