import assert from 'node:assert/strict';
import { roadmapStageLabel } from '../src/features/koda/roadmapLabels';

assert.equal(roadmapStageLabel('Этап 1 — Подготовить портфолио', 1), 'Подготовить портфолио');
assert.equal(roadmapStageLabel('2: Пройти курс по аналитике', 2), 'Пройти курс по аналитике');
assert.equal(roadmapStageLabel('№3) Защитить проект', 3), 'Защитить проект');
assert.equal(roadmapStageLabel('Учебный анализ выполнен в SQL', 1), 'Учебный SQL-анализ');
assert.equal(roadmapStageLabel('Результат анализа статистически обоснован', 2), 'Статистическое обоснование');
assert.equal(roadmapStageLabel('Учебный кейс оформлен и объяснён', 3), 'Учебный кейс: оформить и объяснить');
assert.equal(roadmapStageLabel('Материалы для отклика подготовлены', 4), 'Материалы для отклика');
assert.equal(roadmapStageLabel('Этап 3: Сдать экзамен с отличием', 2), 'Этап 3: Сдать экзамен с отличием');
assert.equal(roadmapStageLabel('Разобрать Python, Pandas и построить дашборд', 4), 'Разобрать Python, Pandas и построить дашборд');
assert.equal(roadmapStageLabel('Этап 5 —', 5), 'Этап 5 —');
console.log('PASS roadmap stage labels preserve meaning and full unknown titles');
