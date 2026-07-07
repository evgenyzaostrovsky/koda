import cors from 'cors';
import 'dotenv/config';
import express from 'express';
import { createAiProvider } from './src/ai/aiProvider';
import type { KodaAiInput } from './src/types/koda';

const app = express();
const port = Number(process.env.PORT || process.env.KODA_API_PORT || 3333);
const aiProvider = createAiProvider({
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  openRouterApiKey: process.env.OPENROUTER_API_KEY,
  openRouterModel: process.env.OPENROUTER_MODEL,
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    provider: aiProvider.name,
    geminiEnabled: Boolean(process.env.GEMINI_API_KEY),
    openRouterEnabled: Boolean(process.env.OPENROUTER_API_KEY),
    model: getActiveModel(),
  });
});

app.post('/api/onboarding', async (req, res) => {
  const input = normalizeInput(req.body);

  try {
    const result = await aiProvider.generate(input);
    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'KODA AI failed.',
    });
  }
});

app.listen(port, () => {
  console.log(`KODA API listening on port ${port}`);
  console.log(`Provider: ${aiProvider.name}`);
});

function normalizeInput(body: Partial<KodaAiInput>): KodaAiInput {
  return {
    name: String(body.name || 'Евгений'),
    targetYear: String(body.targetYear || '2029'),
    answers: Array.isArray(body.answers) ? body.answers : [],
    maxQuestions: Number(body.maxQuestions || 7),
  };
}

function getActiveModel() {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';
  }

  if (process.env.OPENROUTER_API_KEY) {
    return process.env.OPENROUTER_MODEL || 'openrouter/free';
  }

  return 'rules';
}
