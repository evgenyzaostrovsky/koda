import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { createAiProvider } from './src/ai/aiProvider';
import type { KodaAiInput } from './src/types/koda';

const app = express();
const port = Number(process.env.PORT || process.env.KODA_API_PORT || 3333);
const aiProvider = createAiProvider({
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openRouterModel: process.env.OPENROUTER_MODEL,
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    provider: aiProvider.name,
    geminiEnabled: Boolean(process.env.GEMINI_API_KEY),
    openRouterEnabled: Boolean(process.env.OPENROUTER_API_KEY),
    model: getActiveModel(),
  });
});

app.get('/api/koda-calendar.ics', (req, res) => {
  const timezone = normalizeTimezone(cleanText(req.query.tz) || 'Europe/Moscow');
  const days = clampNumber(Number(req.query.days || 30), 1, 90);
  const focus = cleanText(req.query.focus) || 'Фокус: 3 главные задачи';
  const habit = cleanText(req.query.habit) || 'Привычка: вода + прогулка';
  const checkin = cleanText(req.query.checkin) || 'KODA check-in';
  const startDate = startOfToday(timezone);
  const events: string[] = [];

  for (let index = 0; index < days; index += 1) {
    const date = addDays(startDate, index);
    events.push(createCalendarEvent(date, 9, 0, focus, 'Главный фокус дня из KODA.', timezone, 'focus'));
    events.push(createCalendarEvent(date, 13, 0, habit, 'Короткая привычка, которую важно увидеть без открытия приложения.', timezone, 'habit'));
    events.push(createCalendarEvent(date, 21, 30, checkin, 'Вечерняя отметка дня в KODA.', timezone, 'checkin'));
  }

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
  res.send([
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KODA//Calendar Feed//RU',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:KODA',
    'X-WR-CALDESC:Важные фокусы, привычки и check-in из KODA',
    `X-WR-TIMEZONE:${timezone}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n'));
});

app.post('/api/onboarding', async (req, res) => {
  const input = normalizeInput(req.body);

  try {
    const result = await aiProvider.generate(input);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'KODA AI failed.',
    });
  }
});

app.listen(port, () => {
  console.log(`KODA API listening on port ${port}`);
  console.log(`Provider: ${aiProvider.name}`);
});

function normalizeInput(body: Partial<KodaAiInput>): KodaAiInput {
  return {
    name: String(body.name || 'Евгений'),
    targetYear: String(body.targetYear || '2029'),
    answers: Array.isArray(body.answers) ? body.answers : [],
    maxQuestions: Number(body.maxQuestions || 7),
  };
}

function getActiveModel() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  }

  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_MODEL || 'openrouter/free';
  }

  return 'rules';
}

function createCalendarEvent(date: Date, hour: number, minute: number, summary: string, description: string, timezone: string, uidPrefix: string) {
  const startsAt = withTime(date, hour, minute);
  const endsAt = withTime(date, hour, minute + 20);
  const dayKey = formatDate(date);

  return [
    'BEGIN:VEVENT',
    `UID:${uidPrefix}-${dayKey}@koda`,
    `DTSTAMP:${formatUtcDate(new Date())}`,
    `DTSTART;TZID=${timezone}:${formatLocalDateTime(startsAt)}`,
    `DTEND;TZID=${timezone}:${formatLocalDateTime(endsAt)}`,
    `SUMMARY:${escapeIcs(summary)}`,
    `DESCRIPTION:${escapeIcs(description)}`,
    'END:VEVENT',
  ].join('\r\n');
}

function startOfToday(timezone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return new Date(Number(values.year), Number(values.month) - 1, Number(values.day));
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function withTime(date: Date, hour: number, minute: number) {
  const next = new Date(date);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function formatDate(date: Date) {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('');
}

function formatLocalDateTime(date: Date) {
  return `${formatDate(date)}T${pad(date.getHours())}${pad(date.getMinutes())}00`;
}

function formatUtcDate(date: Date) {
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
}

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function cleanText(value: unknown) {
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' ? text.trim().slice(0, 120) : '';
}

function normalizeTimezone(value: string) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format();
    return value;
  } catch {
    return 'Europe/Moscow';
  }
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function escapeIcs(value: string) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}
