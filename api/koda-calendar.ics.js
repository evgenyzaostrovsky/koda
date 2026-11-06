const DEFAULT_TIMEZONE = 'Europe/Moscow';
const DEFAULT_DAYS = 30;
const DEFAULT_PAST_DAYS = 14;
const { createClient } = require('@supabase/supabase-js');
const { escapeIcs } = require('../src/server/ics');
const { calendarOwnerFromToken } = require('./_calendarTokens');
const { validateBearerToken } = require('../src/server/aiSecurity');
const { parseAutoPlanState, buildAutoPlanItems, normalizeGoal, visibleGoals, withoutDeletedGoalItems } = require('../src/server/kodaDomain.cjs');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const query = req.query || {};
  const timezone = normalizeTimezone(cleanText(query.tz) || DEFAULT_TIMEZONE);
  const days = clampNumber(Number(query.days || DEFAULT_DAYS), 1, 90);
  const pastDays = clampNumber(Number(query.pastDays || DEFAULT_PAST_DAYS), 0, 30);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  const token = /^Bearer\s+(.+)$/i.exec(String(req.headers?.authorization || ''))?.[1];
  const owner = token ? await validateBearerToken(token) : null;
  let key;
  if (token) {
    if (!owner) { res.status(401).json({ error: 'Войдите в КОДА для экспорта календаря.' }); return; }
    key = `user:${owner}`;
    if (query.key && cleanText(query.key) !== key) { res.status(403).json({ error: 'Этот календарь принадлежит другому аккаунту.' }); return; }
  } else {
    if (!process.env.CALENDAR_TOKEN_SECRET) { res.status(503).json({ error: 'Календарь временно недоступен.' }); return; }
    key = calendarOwnerFromToken(cleanText(query.key), process.env.CALENDAR_TOKEN_SECRET);
    if (!key) { res.status(403).json({ error: 'Ссылка недействительна. Подключите календарь заново в профиле KODA.' }); return; }
  }
  const startDate = addDays(startOfToday(timezone), -pastDays);
  const events = [];
  let plannerItems;
  try {
    plannerItems = await loadPlannerItems(key, startDate, days + pastDays, token);
  } catch {
    res.status(503).json({ error: 'Календарь временно недоступен.' });
    return;
  }

  for (const item of plannerItems) {
    const date = parseDateKey(item.date);
    if (item.time) {
      const [hour, minute] = item.time.split(':').map(Number);
      events.push(createEvent({
        date,
        description: item.done ? 'Отмечено выполненным в KODA.' : 'Запланировано в KODA.',
        hour,
        minute,
        summary: item.title,
        timezone,
        uidPrefix: item.id,
      }));
    } else {
      events.push(createAllDayEvent({
        date,
        description: item.done ? 'Отмечено выполненным в KODA.' : 'Запланировано в KODA без времени.',
        summary: item.title,
        uidPrefix: item.id,
      }));
    }
  }

  const calendar = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KODA//Calendar Feed//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:KODA',
    'X-WR-CALDESC:Запланированные дела из Планнера KODA',
    `X-WR-TIMEZONE:${timezone}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.status(200).send(calendar);
};

async function loadPlannerItems(key, startDate, days, token) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const supabaseKey = token
    ? process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
    : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) throw new Error('Calendar backend not configured');

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    ...(token ? { global: { headers: { Authorization: `Bearer ${token}` } } } : {}),
  });
  const start = formatIsoDate(startDate);
  const end = formatIsoDate(addDays(startDate, days - 1));
  const { data, error } = await client
    .from('planner_events')
    .select('id, event_date, event_time, title, done')
    .eq('owner_key', key)
    .gte('event_date', start)
    .lte('event_date', end)
    .order('event_date', { ascending: true })
    .order('event_time', { ascending: true });

  if (error || !Array.isArray(data)) throw new Error('Calendar backend unavailable');

  const account = await client.from('user_app_state').select('user_id,goals,profile_auto_plan:profile->autoPlan').eq('user_id', key.slice(5)).maybeSingle();
  const autoPlan = !account.error && account.data?.user_id === key.slice(5) ? parseAutoPlanState(account.data.profile_auto_plan, key.slice(5)) : undefined;
  const allGoals = Array.isArray(account.data?.goals) ? account.data.goals.map(normalizeGoal).filter(Boolean) : [];
  const goals = visibleGoals(allGoals);
  const today = formatIsoDate(startOfToday(autoPlan?.settings.timezone || DEFAULT_TIMEZONE));
  const automatic = withoutDeletedGoalItems(buildAutoPlanItems(autoPlan, goals, today), allGoals).filter(item => item.date >= start && item.date <= end);
  return [...data.map((item) => ({
    id: String(item.id),
    date: String(item.event_date),
    time: item.event_time ? String(item.event_time).slice(0, 5) : '',
    title: String(item.title),
    done: Boolean(item.done),
  })), ...automatic];
}

function createAllDayEvent({ date, description, summary, uidPrefix }) {
  const nextDate = addDays(date, 1);
  const dayKey = formatDate(date);

  return [
    'BEGIN:VEVENT',
    `UID:${safeUid(uidPrefix)}-${dayKey}@koda`,
    `DTSTAMP:${formatUtcDate(new Date())}`,
    `DTSTART;VALUE=DATE:${formatDate(date)}`,
    `DTEND;VALUE=DATE:${formatDate(nextDate)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
  ].join('\r\n');
}

function createEvent({ date, description, hour, minute, summary, timezone, uidPrefix }) {
  const startsAt = withTime(date, hour, minute);
  const endsAt = withTime(date, hour, minute + 20);
  const stamp = formatUtcDate(new Date());
  const dayKey = formatDate(date);

  return [
    'BEGIN:VEVENT',
    `UID:${safeUid(uidPrefix)}-${dayKey}@koda`,
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${timezone}:${formatLocalDateTime(startsAt)}`,
    `DTEND;TZID=${timezone}:${formatLocalDateTime(endsAt)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
  ].join('\r\n');
}

function startOfToday(timezone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function parseDateKey(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function formatIsoDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-');
}

function withTime(date, hour, minute) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function formatDate(date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('');
}

function formatLocalDateTime(date) {
  return `${formatDate(date)}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function formatUtcDate(date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function cleanText(value) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' ? text.trim().slice(0, 120) : '';
}

function normalizeTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function safeUid(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '-');
}
