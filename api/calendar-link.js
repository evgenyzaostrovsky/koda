const { validateBearerToken } = require('../src/server/aiSecurity');
const { signCalendarToken } = require('./_calendarTokens');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed.' });
  const match = typeof req.headers?.authorization === 'string' && req.headers.authorization.match(/^Bearer\s+(.+)$/i);
  const userId = match ? await validateBearerToken(match[1]) : null;
  if (!userId) return res.status(401).json({ error: 'Войдите в аккаунт.' });
  const token = signCalendarToken(userId, process.env.CALENDAR_TOKEN_SECRET);
  if (!token) return res.status(503).json({ error: 'Календарь временно недоступен.' });
  return res.status(200).json({ token });
};
