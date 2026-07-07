const { createAiProvider } = require('../src/ai/aiProvider');

const aiProvider = createAiProvider({
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openRouterModel: process.env.OPENROUTER_MODEL,
});

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = req.body || {};
  const input = {
    name: String(body.name || 'Евгений'),
    targetYear: String(body.targetYear || '2029'),
    answers: Array.isArray(body.answers) ? body.answers : [],
    maxQuestions: Number(body.maxQuestions || 7),
  };

  try {
    res.json(await aiProvider.generate(input));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'KODA AI failed.' });
  }
};
