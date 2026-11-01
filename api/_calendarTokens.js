const { createHmac, timingSafeEqual } = require('node:crypto');
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function signCalendarToken(userId, secret) {
  if (!secret || !USER_ID.test(userId)) return null;
  const id = userId.toLowerCase();
  const signature = createHmac('sha256', secret).update(`koda-calendar:v1:${id}`).digest('base64url');
  return `v1.${id}.${signature}`;
}

function calendarOwnerFromToken(token, secret) {
  if (typeof token !== 'string' || token.length > 200) return null;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[0] !== 'v1' || !USER_ID.test(parts[1]) || !/^[A-Za-z0-9_-]{43}$/.test(parts[2])) return null;
  const expected = signCalendarToken(parts[1], secret);
  if (!expected) return null;
  const providedBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer) ? `user:${parts[1]}` : null;
}

module.exports = { signCalendarToken, calendarOwnerFromToken };
