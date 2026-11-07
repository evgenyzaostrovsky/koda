const knownVerboseLabels = new Map<string, string>([
  ['учебный анализ выполнен в sql', 'Учебный SQL-анализ'],
  ['результат анализа статистически обоснован', 'Статистическое обоснование'],
  ['учебный кейс оформлен и объяснён', 'Учебный кейс: оформить и объяснить'],
  ['материалы для отклика подготовлены', 'Материалы для отклика'],
]);

/** Shortens only reviewed labels and stage numbering duplicated by the numbered chip. */
export function roadmapStageLabel(title: string, stageNumber: number): string {
  const original = title.trim();
  if (!original || !Number.isInteger(stageNumber) || stageNumber < 1) return original;
  const redundantNumber = new RegExp(`^(?:этап\\s+)?(?:№\\s*)?${stageNumber}\\s*[.):—–-]\\s*`, 'i');
  const shortened = original.replace(redundantNumber, '').trim();
  const candidate = shortened || original;
  return knownVerboseLabels.get(candidate.toLocaleLowerCase('ru-RU')) ?? candidate;
}
