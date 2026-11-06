const { readAiConfig, createGoalPlanGenerator, normalizeGoalPlanInput } = require('../src/server/kodaDomain.cjs');
const { authorizeAiRequest } = require('../src/server/aiSecurity');
const { loadAssistantContext } = require('../src/server/assistantContext');
const generate = createGoalPlanGenerator(readAiConfig(process.env));
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  if (!(await authorizeAiRequest(req, res))) return;
  let input;
  try { input = normalizeGoalPlanInput(req.body); } catch { res.status(400).json({ error: 'Опишите желание.' }); return; }
  try { res.json(await generate(input,await loadAssistantContext(req,{scope:input.contextScope}))); } catch { res.status(503).json({ error: 'Помощник недоступен. Продолжите вручную.' }); }
};
