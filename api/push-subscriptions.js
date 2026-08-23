const { getSupabaseAdmin } = require('./_supabaseAdmin');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const subscription = body.subscription;

  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
    res.status(400).json({ error: 'Invalid push subscription.' });
    return;
  }

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        endpoint: subscription.endpoint,
        subscription,
        owner_key: String(body.ownerKey || 'default'),
        timezone: String(body.timezone || 'UTC'),
        reminder_time: String(body.reminderTime || '14:00'),
        enabled: true,
      },
      { onConflict: 'endpoint' },
    );

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to save push subscription.' });
  }
};
