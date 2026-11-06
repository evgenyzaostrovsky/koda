import type {Goal, GoalAction} from './types';

const normalized = (value: string) => value.toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
const numbers: Record<string, number> = {
  один: 1, первый: 1, два: 2, второй: 2, три: 3, третий: 3, четыре: 4, четвертый: 4,
  пять: 5, пятый: 5, шесть: 6, шестой: 6, семь: 7, седьмой: 7, восемь: 8, восьмой: 8,
  девять: 9, девятый: 9, десять: 10, десятый: 10,
};
const number = `(?:\\d+|${Object.keys(numbers).join('|')})`;
const lessonAfter = new RegExp(`(?:^|[^\\p{L}\\d])урок\\s*№?\\s*(${number})(?![\\p{L}\\d])`, 'gu');
const lessonBefore = new RegExp(`(?:^|[^\\p{L}\\d])(${number})(?:-?й)?\\s+урок(?![\\p{L}\\d])`, 'gu');
function lessonReferences(value: string): Array<{number: number; start: number; end: number}> {
  return [...value.matchAll(lessonAfter), ...value.matchAll(lessonBefore)].map(match => ({
    number: numbers[match[1]] ?? Number(match[1]),
    start: match.index! + (/^[^\p{L}\d]/u.test(match[0]) ? 1 : 0),
    end: match.index! + match[0].length,
  })).filter(ref => Number.isSafeInteger(ref.number) && ref.number > 0);
}
const completed = /(?:^|[^\p{L}])(?:прошел|прошла|прошли|завершил[аи]?|закончил[аи]?|выполнил[аи]?|сделал[аи]?|пройден[аоы]?|завершен[аоы]?|закончен[аоы]?|выполнен[аоы]?|сделан[аоы]?)(?!\p{L})/u;
const uncertain = /(?:^|[^\p{L}])(?:не|нет|если|возможно|кажется|наверное|планирую|хочу|нужно|надо|буду|будет|хотел)(?!\p{L})/u;
const modifiers = new Set(['я', 'мы', 'уже', 'давно', 'полностью', 'успешно', 'наконец', 'точно', 'был', 'была', 'были', 'мной']);
function directlyCompleted(clause: string, ref: ReturnType<typeof lessonReferences>[number]): boolean {
  return [...clause.matchAll(new RegExp(completed.source, 'gu'))].some(match => {
    const start = match.index! + (/^[^\p{L}]/u.test(match[0]) ? 1 : 0);
    const end = match.index! + match[0].length;
    const between = end <= ref.start ? clause.slice(end, ref.start) : ref.end <= start ? clause.slice(ref.end, start) : '';
    return between.split(/[\s,:—–-]+/u).filter(Boolean).every(word => modifiers.has(word));
  });
}
function lessonActionNumber(title: string): number | undefined {
  const target = title.replace(/^(?:пройти|закончить|завершить|изучить|посмотреть|досмотреть)\s+/u, '');
  const refs = lessonReferences(target);
  // Only the lesson itself, not an exercise about it or a follow-up after it.
  return refs.length === 1 && refs[0].start === 0 ? refs[0].number : undefined;
}

/** Suggestions only, for an explicit confirmation button. Never call this with
 * attached material or infer progress from an assistant reply. The caller must
 * recheck the action against the latest goal and use the normal edit boundary. */
function matchingActions(goal: Goal, message: {role: string; content: string}): GoalAction[] {
  if (message.role !== 'user' || goal.deletedAt || goal.archivedAt || goal.status === 'archived') return [];
  const clauses = (message.content.match(/[^.!?;\n]+[.!?;]?/g) ?? []).map(normalized);
  const active = goal.actions.filter(action => !action.archivedAt);
  return active.filter(action => {
    const title = normalized(action.title);
    const number = lessonActionNumber(title);
    let claimed = false;
    for (const clause of clauses) {
      if (!completed.test(clause)) continue;
      const refs = number === undefined ? [] : lessonReferences(clause).filter(ref => ref.number === number);
      const exactStart = title ? clause.indexOf(title) : -1;
      if (exactStart >= 0) refs.push({number: number ?? 0, start: exactStart, end: exactStart + title.length});
      if (!refs.length) continue;
      // The latest statement about this action wins, including an explicit denial.
      claimed = !clause.includes('?') && !uncertain.test(clause) && refs.some(ref => directlyCompleted(clause, ref));
    }
    return claimed;
  });
}

export function findGoalCompletionCandidates(goal: Goal, message: {role: string; content: string}): GoalAction[] {
  const candidates = matchingActions(goal, message);
  return candidates.length === 1 && candidates[0].status !== 'completed' ? candidates : [];
}

/** General chat must count all matches before filtering completed work: a
 * completed lesson in another goal still makes an unscoped claim ambiguous. */
export function findAccountCompletionCandidates(goals: Goal[], message: {role: string; content: string}): Array<{goalId: string; action: GoalAction}> {
  const candidates = goals.flatMap(goal => matchingActions(goal, message).map(action => ({goalId: goal.id, action})));
  return candidates.length === 1 && candidates[0].action.status !== 'completed' ? candidates : [];
}
