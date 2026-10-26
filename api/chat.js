const { readAiConfig } = require('../src/ai/providerConfig');
const { createChatGenerator, normalizeChatInput } = require('../src/ai/chatProvider');
const { authorizeAiRequest } = require('../src/server/aiSecurity');
const generate = createChatGenerator(readAiConfig(process.env));
module.exports = async function handler(req,res) {
  if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
  if (!(await authorizeAiRequest(req, res))) return;
  let messages;
  try{messages=normalizeChatInput(req.body);}catch{res.status(400).json({error:'Напишите сообщение.'});return;}
  try{res.json(await generate({messages}));}catch{res.status(503).json({error:'Помощник сейчас недоступен. Попробуйте ещё раз.'});}
};
