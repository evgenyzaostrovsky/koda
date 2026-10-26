export type WizardClarifications = { clarificationQuestions: string[]; clarificationAnswers: string[] };

// Keep each answer attached to its original question, including blank answers.
export function restoreWizardClarifications(value: unknown): WizardClarifications {
  const result: WizardClarifications = { clarificationQuestions: [], clarificationAnswers: [] };
  if (!value || typeof value !== 'object') return result;
  const saved = value as Record<string, unknown>;
  if (!Array.isArray(saved.clarificationQuestions)) return result;
  const answers = Array.isArray(saved.clarificationAnswers) ? saved.clarificationAnswers : [];
  saved.clarificationQuestions.slice(0, 2).forEach((question, index) => {
    if (typeof question !== 'string' || !question.trim()) return;
    result.clarificationQuestions.push(question.trim().slice(0, 300));
    result.clarificationAnswers.push(typeof answers[index] === 'string' ? answers[index].slice(0, 400) : '');
  });
  return result;
}

type DraftStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<unknown>;
};

// Serialize per-account writes, deletion and reopening, also across wizard remounts.
// The first operation starts immediately (web storage can commit synchronously).
export function createWizardDraftStorage(storage: DraftStorage) {
  const pending = new Map<string, Promise<unknown>>();
  function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const previous = pending.get(key);
    const next = previous ? previous.then(operation, operation) : operation();
    pending.set(key, next);
    const cleanup = () => { if (pending.get(key) === next) pending.delete(key); };
    void next.then(cleanup, cleanup);
    return next;
  }
  return {
    getItem: (key: string) => enqueue(key, () => storage.getItem(key)),
    setItem: (key: string, value: string) => enqueue(key, () => storage.setItem(key, value)),
    removeItem: (key: string) => enqueue(key, () => storage.removeItem(key)),
  };
}
