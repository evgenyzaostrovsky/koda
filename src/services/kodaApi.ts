import type { AiMode, Answer, KodaAiResult } from '../types/koda';
import { env } from '../config/env';

const API_URL = env.kodaApiUrl.replace(/\/$/, '');

export async function getAiMode(): Promise<AiMode> {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    if (data.provider === 'gemini') {
      return 'gemini';
    }

    if (data.provider === 'openrouter') {
      return 'openrouter';
    }

    return 'rules';
  } catch {
    return 'offline';
  }
}

export async function generateKodaState(input: {
  name: string;
  targetYear: string;
  answers: Answer[];
  maxQuestions: number;
}): Promise<KodaAiResult> {
  const response = await fetch(`${API_URL}/api/onboarding`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error('KODA API unavailable');
  }

  return response.json();
}
