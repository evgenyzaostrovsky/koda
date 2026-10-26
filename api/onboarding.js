const { readAiConfig } = require('../src/ai/providerConfig');
const { createAiProvider } = require('../src/ai/aiProvider');
const { authorizeAiRequest } = require('../src/server/aiSecurity');

const aiProvider = createAiProvider(readAiConfig(process.env));

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await authorizeAiRequest(req, res))) return;

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
