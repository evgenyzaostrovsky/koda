const { readAiConfig, createChatGenerator, normalizeChatInput } = require('../src/server/kodaDomain.cjs');
const { authorizeAiRequest } = require('../src/server/aiSecurity');
const { loadAssistantContext } = require('../src/server/assistantContext');
const generate = createChatGenerator(readAiConfig(process.env));
module.exports = async function handler(req,res) {
  if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
  if (!(await authorizeAiRequest(req, res))) return;
  let messages;
  try{messages=normalizeChatInput(req.body);}catch{res.status(400).json({error:'Напишите сообщение.'});return;}
  try{res.json(await generate({messages},await loadAssistantContext(req)));}catch{res.status(503).json({error:'Помощник сейчас недоступен. Попробуйте ещё раз.'});}
};
