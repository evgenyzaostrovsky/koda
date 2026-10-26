import type { AiMode, Answer, KodaAiResult } from '../types/koda';
import { env } from '../config/env';
import { validateGoalPlan, type GoalPlanInput, type GoalPlanSuggestion } from '../ai/goalPlanContract';
import { supabase } from '../lib/supabase';

async function authenticatedHeaders(): Promise<Record<string, string>> {
  const { data, error } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (error || !token || data.session?.user?.is_anonymous) {
    throw new Error('Войдите в аккаунт, чтобы использовать помощника.');
  }
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

async function aiRequestError(response: Response, fallback: string): Promise<Error> {
  if (response.status === 401 || response.status === 429) {
    try {
      const body = await response.json();
      if (typeof body?.error === 'string' && body.error.trim()) return new Error(body.error.slice(0, 200));
    } catch { /* Use the local fallback for invalid error bodies. */ }
  }
  return new Error(fallback);
}

export async function requestGoalPlan(input: GoalPlanInput): Promise<GoalPlanSuggestion> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 50000);
  try {
    const response = await fetch(`${API_URL}/api/goal-plan`, { method: 'POST', signal: controller.signal, headers: await authenticatedHeaders(), body: JSON.stringify(input) });
    if (!response.ok) throw await aiRequestError(response, 'Помощник недоступен. Можно продолжить вручную.');
    return validateGoalPlan(await response.json());
  } finally { clearTimeout(timer); }
}

const API_URL = env.kodaApiUrl.replace(/\/$/, '');

export async function getAiMode(): Promise<AiMode> {
  try {
    const response = await fetch(`${API_URL}/api/health`);
    const data = await response.json();
    if (data.provider === 'yandex') return 'yandex';
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
    headers: await authenticatedHeaders(),
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw await aiRequestError(response, 'KODA API unavailable');
  }

  return response.json();
}

export async function requestChat(messages: Array<{role:'user'|'assistant';content:string}>): Promise<{reply:string;provider:'yandex'|'openrouter'|'gemini'}> {
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),50000);
  try {
    const response=await fetch(API_URL+'/api/chat',{method:'POST',signal:controller.signal,headers:await authenticatedHeaders(),body:JSON.stringify({messages})});
    if(!response.ok) throw await aiRequestError(response, 'Помощник сейчас недоступен. Попробуйте ещё раз.');
    const result=await response.json();
    if(typeof result.reply!=='string'||!result.reply.trim()||!['yandex','openrouter','gemini'].includes(result.provider))throw new Error('Некорректный ответ помощника.');
    return result;
  } finally { clearTimeout(timer); }
}
