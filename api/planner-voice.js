const { createPlannerVoiceHandler } = require('../src/server/plannerVoice');

// Authentication and the shared AI rate limiter run before decoding audio or contacting OpenAI.
module.exports = createPlannerVoiceHandler();
