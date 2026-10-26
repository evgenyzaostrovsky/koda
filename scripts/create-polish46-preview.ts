import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Goal, Habit, KodaDay, Note, PlannerItem, Project } from '../src/features/koda/types';
import { acceptDayPlan, calculatePlanScore, goalActionSourceKey, plannerSourceKey, recordPlanProgress, type DayPlanItem } from '../src/features/koda/dayPlan';
import { defaultPomodoroSettings, defaultProfile } from '../src/features/koda/persistence';
import type { StoredKodaState } from '../src/features/koda/persistence';
import { syncDayPlanProgress } from '../src/features/koda/dayPlanSync';
import { buildProjectPlannerItems } from '../src/features/koda/plannerProjections';

const output = path.resolve(process.argv[2] || '.tmp/koda46');
const indexPath = path.join(output, 'index.html');
const today = localDateKey();
const dateOffset = (date: string, offset: number) => {
  const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10);
};
const stamp = (date: string, hour = 12) => `${date}T${String(hour).padStart(2, '0')}:00:00.000Z`;

const milestones = ['Таблицы', 'SQL', 'Статистика', 'Python и Pandas', 'BI', 'Портфолио', 'Собеседования'];
const goal: Goal = {
  id: 'demo-goal-data-analyst', title: 'Стать аналитиком данных',
  desiredResult: 'Собрать портфолио и пройти собеседования на junior data analyst', deadline: dateOffset(today, 120), priority: 'main', status: 'active',
  createdAt: stamp(dateOffset(today, -30)), updatedAt: stamp(today), completedAt: null, archivedAt: null,
  milestones: milestones.map((title, index) => ({ id: `demo-milestone-${index + 1}`, title, description: '', deadline: dateOffset(today, 15 * (index + 1)),
    status: index === 0 ? 'completed' : index === 1 ? 'in_progress' : 'not_started', position: index, completedAt: index === 0 ? stamp(dateOffset(today, -12)) : null })),
  actions: [
    { id: 'demo-action-tables', title: 'Собрать таблицы учебной базы', description: 'Подготовить исходные таблицы для практики запросов', dueDate: dateOffset(today, -12), estimatedMinutes: 30, importance: 'normal', milestoneId: 'demo-milestone-1', status: 'completed', position: 0, completedAt: stamp(dateOffset(today, -12), 18) },
    { id: 'demo-action-sql-joins', title: 'Практика SQL JOIN', description: 'Решить 5 задач с INNER и LEFT JOIN', dueDate: today, estimatedMinutes: 35, importance: 'key', milestoneId: 'demo-milestone-2', status: 'pending', position: 1, completedAt: null },
    ...milestones.slice(2).map((title, index) => ({ id: `demo-action-stage-${index + 3}`, title: `${['Повторить описательную статистику', 'Разобрать анализ данных в Python и Pandas', 'Собрать дашборд в BI', 'Описать проект для портфолио', 'Подготовить ответы для собеседований'][index]}`, description: `Следующий шаг этапа «${title}»`, dueDate: dateOffset(today, 7 * (index + 1)), estimatedMinutes: 40, importance: 'normal' as const, milestoneId: `demo-milestone-${index + 3}`, status: 'pending' as const, position: index + 2, completedAt: null, dependsOn: ['demo-action-sql-joins'] })),
  ],
  routines: [], routineLogs: [],
};

const dates = Array.from({ length: 7 }, (_, index) => dateOffset(today, index - 7));
const scores = [42, 58, 35, 76, 64, 88, 71];
const completedDays: KodaDay[] = dates.map((date, dayIndex) => {
  const targetScore = scores[dayIndex];
  const plan = createPlan(date, targetScore, dayIndex, false);
  const result = calculatePlanScore(plan);
  return makeDay(date, 'completed', result.totalScore, result.plannerScore, plan, dayIndex);
});

const currentPlannerItems: PlannerItem[] = [
  { id: 'demo-task-review', title: 'Повторить конспект по агрегатам', date: today, time: '11:00', done: true, sourceType: 'planner', sourceId: 'demo-task-review', updatedAt: stamp(today, 8) },
  { id: 'demo-task-walk', title: 'Прогулка после обеда', date: today, time: '14:30', done: true, sourceType: 'planner', sourceId: 'demo-task-walk', updatedAt: stamp(today, 8) },
];

const habits: Habit[] = [
  ['demo-habit-study', 'Учёба', 'laptop'], ['demo-habit-sport', 'Спорт', 'dumbbell'], ['demo-habit-reading', 'Чтение', 'book'],
  ['demo-habit-water', 'Вода', 'droplet'], ['demo-habit-sleep', 'Сон', 'moon'],
].map(([id, title, icon], index) => {
  const dayEdits: NonNullable<Habit['dayEdits']> = {};
  for (let offset = 12; offset >= 1; offset--) {
    const date = dateOffset(today, -offset);
    dayEdits[date] = { done: true, at: stamp(date, 20), id: `${id}-${date}` };
  }
  dayEdits[today] = { done: index < 2, at: stamp(today, 0), id: `${id}-${today}` };
  return { id, title, target: index === 1 ? 'Небольшая активность' : 'Каждый день', icon, color: ['#577b58', '#6186a8', '#8d719d', '#57938b', '#a78355'][index],
    frequency: 'daily', weekdays: [0, 1, 2, 3, 4, 5, 6], isActive: true, createdDate: dateOffset(today, -12), doneDays: Array(7).fill(false), monthDays: [], monthHistory: {}, dayEdits };
});

const projects: Project[] = [
  { id: 'demo-project-sales-dashboard', title: 'Дашборд продаж', description: 'Учебный проект на открытых данных.', status: 'active', createdAt: stamp(dateOffset(today, -20)), updatedAt: stamp(today), completedAt: null,
    tasks: [projectTask('demo-sales-1', 'Очистить исходные данные', 'done', -8), projectTask('demo-sales-2', 'Собрать SQL-агрегации', 'done', -5), {...projectTask('demo-sales-3', 'Доработать дашборд', 'todo', 0), plannedTime: '16:00'}] },
  { id: 'demo-project-portfolio', title: 'Портфолио аналитика', description: 'Оформить два законченных кейса.', status: 'active', createdAt: stamp(dateOffset(today, -9)), updatedAt: stamp(today), completedAt: null,
    tasks: [projectTask('demo-portfolio-1', 'Выбрать второй датасет', 'done', -3), projectTask('demo-portfolio-2', 'Описать выводы по кейсу', 'todo', 2)] },
];

// The app derives this item from the saved project task; it is intentionally absent from plannerItems storage.
const currentProjectItem = { id: 'project:demo-project-sales-dashboard:demo-sales-3', title: 'Доработать дашборд', date: today, time: '16:00', done: false,
  sourceType: 'project' as const, sourceId: 'demo-sales-3', ownerId: 'demo-project-sales-dashboard', updatedAt: stamp(today, 8) } satisfies PlannerItem;
const currentPlan = syncDayPlanProgress(createPlan(today, 50, 8, true, [...currentPlannerItems, currentProjectItem]), goal ? [goal] : [],
  [...currentPlannerItems, ...buildProjectPlannerItems(projects)]);
const currentScore = calculatePlanScore(currentPlan);
const activeDay = makeDay(today, 'active', currentScore.totalScore, currentScore.plannerScore, currentPlan, 8);

const notes: Note[] = [
  makeNote('demo-note-sql', 'SQL: шпаргалка', 'JOIN соединяет строки по ключу. GROUP BY собирает группы, HAVING фильтрует агрегаты.'),
  makeNote('demo-note-ideas', 'Идеи для портфолио', 'Сравнить продажи по сезонам и проверить, какие категории растут быстрее.'),
];
const journal = [{ id: 'demo-journal-entry', title: 'Небольшой прогресс', text: 'Сегодня закрыл два дела и оставил SQL на первый шаг завтра. Так план выглядит посильнее.', sleepStart: '23:15', wakeTime: '07:10', tags: ['Учёба', 'Самочувствие'], mood: 4 as const, createdAt: stamp(today, 19) }];
const fixture = {
  appState: { goals: [goal], habits, kodaDays: [...completedDays, activeDay], pomodoro: defaultPomodoroSettings, profile: { ...defaultProfile, focus: 'Подготовка к работе аналитиком данных', milestone: 'Практика SQL JOIN' }, projects },
  plannerItems: currentPlannerItems, journalEntries: journal, notes,
};

async function writeFixture() {
await mkdir(output, { recursive: true });
await writeFile(path.join(output, 'demo-fixture.json'), `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
const seedSource = `/* KODA 4.6 local-only demo fixture. Generated by scripts/create-polish46-preview.ts. */
(function(){
  if(location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')return;
  if(location.port!=='8126'&&location.port!=='8127'&&location.port!=='8128'&&location.port!=='8129'&&location.port!=='8130'&&location.port!=='8131'&&location.port!=='8132'&&location.port!=='8133')return;
  var marker='koda:polish46-preview:seeded';
  var keys=['koda:appState:v1','koda:plannerItems:v1','koda:journalEntries:v1','koda:notes:v1'];
  try{
    if(localStorage.getItem(marker))return;
    if(keys.some(function(key){return localStorage.getItem(key)!==null;}))return;
    var fixture=${JSON.stringify(fixture)};
    if(new URLSearchParams(location.search).get('scenario')==='empty'){fixture.appState={...fixture.appState,goals:[],habits:[],kodaDays:[],projects:[],profile:{themeId:'calm-light',version:'',daysLeft:'',level:'',streak:'',xp:'',values:'',futureSelf:'',focus:'',milestone:''}};fixture.plannerItems=[];fixture.journalEntries=[];fixture.notes=[];}
    localStorage.setItem(keys[0],JSON.stringify(fixture.appState));
    localStorage.setItem(keys[1],JSON.stringify(fixture.plannerItems));
    localStorage.setItem(keys[2],JSON.stringify(fixture.journalEntries));
    localStorage.setItem(keys[3],JSON.stringify(fixture.notes));
    localStorage.setItem(marker,${JSON.stringify(today)});
  }catch(error){console.warn('KODA preview fixture was not seeded',error);}
})();\n`;
await writeFile(path.join(output, 'demo-seed.js'), seedSource, 'utf8');
let html = await readFile(indexPath, 'utf8');
if (!html.includes('id="koda-polish46-demo-seed"')) {
  const appScriptIndex = html.indexOf('<script src="/_expo/static/js/web/');
  if (appScriptIndex < 0) throw new Error(`Could not find the Expo web entry script in ${indexPath}`);
  html = `${html.slice(0, appScriptIndex)}<script id="koda-polish46-demo-seed" src="./demo-seed.js" defer></script>\n  ${html.slice(appScriptIndex)}`;
  await writeFile(indexPath, html, 'utf8');
}
console.log(`Created local guest preview fixture for ${today} in ${output}`);
}
void writeFixture().catch(error => { console.error(error); process.exitCode = 1; });

function createPlan(date: string, score: number, suffix: number, current: boolean, plannerItems?: PlannerItem[]) {
  const planSourceItems: PlannerItem[] = plannerItems ?? Array.from({ length: 4 }, (_, index): PlannerItem => ({
    id: `demo-history-${suffix}-${index + 1}`, title: ['Учебный блок · SQL', 'Учебный блок · аналитика', 'Практика · таблицы', 'Подведение итогов'][index],
    date, time: `${String(9 + index * 2).padStart(2, '0')}:00`, done: false, sourceType: 'planner' as const, sourceId: `demo-history-${suffix}-${index + 1}`,
  }));
  const items: DayPlanItem[] = planSourceItems.map(item => ({ sourceKey: plannerSourceKey(item), budgetKey: plannerSourceKey(item), title: item.title, category: 'planner',
    ...(item.goalId ? { goalId: item.goalId, goalTitle: goal.title, priority: goal.priority } : {}),
    metric: current ? 'binary' : 'count', targetValue: current ? 1 : 100, estimatedMinutes: 20,
    source: { kind: 'planner', id: item.id, plannerId: item.id }, explanation: 'Часть принятого плана дня' }));
  if (current) items.push({ sourceKey: goalActionSourceKey(goal.id, 'demo-action-sql-joins'), budgetKey: goalActionSourceKey(goal.id, 'demo-action-sql-joins'),
    title: 'Практика SQL JOIN', category: 'goal', goalId: goal.id, goalTitle: goal.title, priority: goal.priority, metric: 'binary', targetValue: 1,
    estimatedMinutes: 35, source: { kind: 'action', id: 'demo-action-sql-joins', goalId: goal.id }, explanation: 'Следующий шаг активной цели' });
  let plan = acceptDayPlan({ date, items, minimum: null, availableMinutes: 100, reserveRatio: 0.2 }, { versionId: `demo-plan-${date}`, at: stamp(date, 8), ownerId: null });
  if (current) {
    for (const item of items) {
      const source = plannerItems?.find(candidate => plannerSourceKey(candidate) === item.sourceKey);
      if (source?.done) plan = recordPlanProgress(plan, item.sourceKey, 1, `demo-progress-${date}-${source.id}`, { at: stamp(date, 18) });
    }
  } else {
    items.forEach((item, index) => { plan = recordPlanProgress(plan, item.sourceKey, score, `demo-progress-${date}-${index}`, { at: stamp(date, 18) }); });
  }
  return plan;
}

function makeDay(date: string, status: KodaDay['status'], totalScore: number | null, plannerScore: number, plan: KodaDay['plan'], suffix: number): KodaDay {
  const completed = status === 'completed';
  const planResult = calculatePlanScore(plan);
  return { id: `demo-day-${date}`, localDate: date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local', status,
    startedAt: stamp(date, 8), finishedAt: completed ? stamp(date, 18) : null, goalScore: null, plannerScore, totalScore,
    classification: totalScore === null ? 'unclassified' : totalScore >= 90 ? 'strike' : totalScore >= 75 ? 'pace' : totalScore >= 50 ? 'minimum' : 'sabotage',
    scoreVersion: 3, summary: completed ? `Учебный план дня ${suffix + 1}` : 'План дня принят, два дела выполнены', focusLoss: '', nextRecommendation: 'Начать с короткого блока SQL',
    goalsSnapshot: [], plannerSnapshot: [], calculationSnapshot: { source: 'local-preview', completedCount: planResult.completedCount, totalCount: planResult.totalCount }, createdAt: stamp(date, 8), updatedAt: stamp(date, 18), plan };
}

function projectTask(id: string, title: string, status: 'todo' | 'done', dayOffset: number) {
  const at = stamp(dateOffset(today, dayOffset), 12);
  return { id, title, description: '', cost: '', status, plannedDate: dateOffset(today, dayOffset), plannedTime: '', createdAt: at, updatedAt: at, completedAt: status === 'done' ? at : null, deletedAt: null };
}

function makeNote(id: string, title: string, text: string): Note {
  const at = stamp(today, 18);
  return { id, userId: null, title, content: { type: 'doc', content: [{ id: `${id}-paragraph`, type: 'paragraph', text }] }, pinned: false, createdAt: at, updatedAt: at, deletedAt: null };
}

function localDateKey() {
  const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
