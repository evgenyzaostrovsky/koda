const { readAiConfig, configuredAiHealth } = require('../src/ai/providerConfig');
module.exports = function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return; }
  res.json(configuredAiHealth(readAiConfig(process.env)));
};
