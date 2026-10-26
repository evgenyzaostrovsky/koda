const { readAiConfig } = require('../src/ai/providerConfig');
const { createGoalPlanGenerator } = require('../src/ai/goalPlanProvider');
const { normalizeGoalPlanInput } = require('../src/ai/goalPlanContract');
const { authorizeAiRequest } = require('../src/server/aiSecurity');
const generate = createGoalPlanGenerator(readAiConfig(process.env));
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!(await authorizeAiRequest(req, res))) return;
  let input;
  try { input = normalizeGoalPlanInput(req.body); } catch { res.status(400).json({ error: 'Опишите желание.' }); return; }
  try { res.json(await generate(input)); } catch { res.status(503).json({ error: 'Помощник недоступен. Продолжите вручную.' }); }
};
