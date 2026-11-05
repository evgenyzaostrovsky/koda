import { ASSISTANT_MEMORY_MAX_LENGTH, normalizeAssistantMemoryContent } from './assistantMemory';

export type AssistantCorrectionSource = 'chat' | 'goal' | 'otani';
export type AssistantCorrection = {
  source: AssistantCorrectionSource;
  before: string;
  after: string;
  preference?: string;
};
export type SaveAssistantCorrectionInput = AssistantCorrection & { ownerId: string };

const sourceLabels = { chat: 'чат', goal: 'цель', otani: 'ОТАНИ' } as const;
const correctionPrefix = 'Исправление пользователя';

/** A content marker only: user-authored memories remain untrusted context data. */
export function isAssistantCorrectionContent(content: unknown): content is string {
  return typeof content === 'string' && /^Исправление пользователя \((чат|цель|ОТАНИ)\)\nБыло: /.test(content);
}

function text(value: unknown): string {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

// Reject recognizable credentials before truncation; never copy auth/session objects here.
function containsCredential(value: string): boolean {
  return /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=-]{8,}|\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{16,}|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:password|пароль|api[_ -]?key|access[_ -]?token|refresh[_ -]?token)\s*[:=]\s*\S+/i.test(value);
}

/** Keep the changed passage when long examples share an identical opening. */
function excerpt(value: string[], limit: number, difference = 0): string {
  if (value.length <= limit) return value.join('');
  const start = Math.min(Math.max(0, difference - Math.floor(limit / 3)), value.length - limit + 2);
  const room = limit - (start > 0 ? 1 : 0) - 1;
  return (start > 0 ? '…' : '') + value.slice(start, start + room).join('') + '…';
}

/** Deterministic, bounded content for the existing assistant_memories table. */
export function buildAssistantCorrectionMemory(input: AssistantCorrection): string {
  if (!Object.prototype.hasOwnProperty.call(sourceLabels, input.source)) throw new Error('Некорректный источник исправления.');
  const before = text(input.before);
  const after = text(input.after);
  const preference = text(input.preference);
  if (!before || !after) throw new Error('Укажите исходный и исправленный текст.');
  if (before === after) throw new Error('Исправленный текст должен отличаться от исходного.');
  if ([before, after, preference].some(containsCredential)) throw new Error('Удалите пароли и ключи доступа из исправления.');
  const original = Array.from(before);
  const corrected = Array.from(after);
  let difference = 0;
  while (difference < original.length && difference < corrected.length && original[difference] === corrected[difference]) difference++;
  const header = `${correctionPrefix} (${sourceLabels[input.source]})\nБыло: `;
  const afterLabel = '\nСтало: ';
  const preferencePart = preference ? `\nПредпочтение: ${excerpt(Array.from(preference), 220)}` : '';
  const available = ASSISTANT_MEMORY_MAX_LENGTH - Array.from(header + afterLabel + preferencePart).length;
  const beforeLimit = Math.floor(available / 2);
  return normalizeAssistantMemoryContent(header + excerpt(original, beforeLimit, difference) + afterLabel + excerpt(corrected, available - beforeLimit, difference) + preferencePart);
}
