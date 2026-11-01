const { getSupabaseAdmin } = require('./_supabaseAdmin');
const { validateBearerToken } = require('../src/server/aiSecurity');
const { isAllowedPushEndpoint } = require('./_pushSecurity');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const match = typeof req.headers?.authorization === 'string' && req.headers.authorization.match(/^Bearer\s+(.+)$/i);
  const userId = match ? await validateBearerToken(match[1]) : null;
  if (!userId) {
    res.status(401).json({ error: 'Войдите в аккаунт, чтобы включить уведомления.' });
    return;
  }

  const body = req.body || {};
  const subscription = body.subscription;

  if (!isAllowedPushEndpoint(subscription?.endpoint) || typeof subscription?.keys?.p256dh !== 'string' || typeof subscription?.keys?.auth !== 'string' || subscription.keys.p256dh.length > 256 || subscription.keys.auth.length > 256 || !subscription.keys.p256dh || !subscription.keys.auth) {
    res.status(400).json({ error: 'Invalid push subscription.' });
    return;
  }

  const timezone = typeof body.timezone === 'string' && body.timezone.length <= 64 ? body.timezone : 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
  } catch {
    res.status(400).json({ error: 'Invalid timezone.' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        subscription: { endpoint: subscription.endpoint, keys: { p256dh: subscription.keys.p256dh, auth: subscription.keys.auth } },
        owner_key: userId,
        timezone,
        reminder_time: '14:00',
        enabled: true,
      },
      { onConflict: 'endpoint' },
    );

    if (error) {
      res.status(500).json({ error: 'Failed to save push subscription.' });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save push subscription.' });
  }
};
