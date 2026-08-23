const webpush = require('web-push');
const { getSupabaseAdmin } = require('./_supabaseAdmin');

function getLocalParts(timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    timeZone: timezone || 'UTC',
    year: 'numeric',
  }).formatToParts(new Date());

  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    date: `${value.year}-${value.month}-${value.day}`,
    time: `${value.hour}:${value.minute}`,
  };
}

function isDue(subscription) {
  const local = getLocalParts(subscription.timezone);
  const reminderTime = process.env.PUSH_REMINDER_TIME || '14:00';
  return local.time >= reminderTime && subscription.last_sent_date !== local.date;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (process.env.CRON_SECRET) {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (token !== process.env.CRON_SECRET) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
  }

  const publicKey = process.env.VAPID_PUBLIC_KEY || process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;

  if (!publicKey || !privateKey) {
    res.status(500).json({ error: 'VAPID env is not configured.' });
    return;
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@koda.ru', publicKey, privateKey);

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from('push_subscriptions').select('*').eq('enabled', true);

    if (error) {
      res.status(500).json({ error: error.message });
      return;
    }

    let sent = 0;
    let skipped = 0;
    let disabled = 0;

    for (const item of data || []) {
      if (!isDue(item)) {
        skipped += 1;
        continue;
      }

      const local = getLocalParts(item.timezone);

      try {
        await webpush.sendNotification(
          item.subscription,
          JSON.stringify({
            body: 'Открой KODA и отметь привычки, дневник и фокус дня.',
            tag: `daily-${local.date}`,
            title: 'KODA',
            url: '/',
          }),
        );

        await supabase.from('push_subscriptions').update({ last_sent_date: local.date }).eq('id', item.id);
        sent += 1;
      } catch (sendError) {
        const statusCode = sendError?.statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await supabase.from('push_subscriptions').update({ enabled: false }).eq('id', item.id);
          disabled += 1;
        } else {
          console.error(sendError);
        }
      }
    }

    res.status(200).json({ ok: true, sent, skipped, disabled });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to send push notifications.' });
  }
};
