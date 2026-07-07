module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const provider = process.env.GEMINI_API_KEY
    ? 'gemini'
    : process.env.OPENROUTER_API_KEY
      ? 'openrouter'
      : 'rules';

  res.json({
    provider,
    geminiEnabled: Boolean(process.env.GEMINI_API_KEY),
    openRouterEnabled: Boolean(process.env.OPENROUTER_API_KEY),
    model:
      provider === 'gemini'
        ? process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'
        : provider === 'openrouter'
          ? process.env.OPENROUTER_MODEL || 'openrouter/free'
          : 'rules',
  });
};
