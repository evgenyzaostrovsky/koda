const { timingSafeEqual } = require('node:crypto');
const { getSupabaseAdmin } = require('./_supabaseAdmin');
const { advanceAccountAutoPlan } = require('../src/server/autoPlan');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ''}`);
  const actual = Buffer.from(typeof req.headers.authorization === 'string' ? req.headers.authorization : '');
  if (!secret || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const client = getSupabaseAdmin();
    let changed = 0, failed = 0, scanned = 0;
    // Enabled accounts only. Stable pagination; per-account failure does not stop others.
    for (let offset = 0; ; offset += 100) {
      const result = await client.from('user_app_state').select('user_id').eq('profile->autoPlan->settings->>enabled', 'true').order('user_id').range(offset, offset + 99);
      if (result.error) throw result.error;
      for (const row of result.data || []) {
        scanned += 1;
        try { if ((await advanceAccountAutoPlan(client, row.user_id)).changed) changed += 1; }
        catch { failed += 1; }
      }
      if ((result.data || []).length < 100) break;
    }
    return res.status(failed ? 503 : 200).json({ scanned, changed, failed });
  } catch { return res.status(503).json({ error: 'Automatic planning unavailable' }); }
};
