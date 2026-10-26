import type { GoalPlanInput } from './goalPlanContract';

export type RoadmapDraft = {
  desiredResult: string;
  answerStatus?: 'resolved' | 'uncertain' | 'conflicting';
  planningNote?: string;
  clarificationQuestions?: string[];
  directions: Array<{ title: string; slotIndex?:number; protectedActions?:string[]; groundingSourceId?: number; groundingEvidence?: string; actions: string[] }>;
};

export type RoadmapAction = { actionId: string; text: string };
export type RoadmapAudit = {
  issues: Array<{ actionId: string; reason: string }>;
  missingQuestions: string[];
  conflicting: boolean;
};

/** Deterministic guard for high-impact data actions that an LLM reviewer can miss. */
export function deterministicRoadmapIssues(plan:RoadmapDraft,input:GoalPlanInput):RoadmapAudit['issues']{
  const facts=[input.wish,input.desiredResult??'',input.currentState??'',...(input.clarifications??[]).map(item=>item.answer)].join('\n');
  const hasNegativeMutationPolicy=/(?:не\s+(?:хочу|хочет|нужно|следует|надо|буду|разрешаю|должен)?\s*(?:удалить|исправить|заполнить|заменить|исключить|импутир\w*)|нельзя\s+(?:удалить|исправить|заполнить|заменить|исключить|импутир\w*)).{0,80}пропуск\w*/iu.test(facts);
  const explicitMissingPolicy=!hasNegativeMutationPolicy&&/(?:хочу|решил|нужно|правило|политик\w*).{0,70}(?:удалить|исправить|заполнить|заменить|исключить|импутир\w*).{0,70}пропуск\w*|(?:хочу|решил|нужно|правило|политик\w*).{0,70}пропуск\w*.{0,70}(?:удалить|исправить|заполнить|заменить|исключить|импутир\w*)/iu.test(facts);
  const hasLongCoverage=/(?:нескольк\w*\s+лет|период\w*.{0,30}\d{4}.{0,20}\d{4}|данные\s+за\s+\d+\s+лет|достаточн\w*\s+для\s+сезонност)/iu.test(facts);
  const shortTime=(input.availableMinutes??60)<=15;
  const alreadyHasRepo=/(?:есть|имею|мой|моя|моё|свой|своя|существующ\w*)\s+(?:свой\s+)?(?:github|gitlab|репозитор\w*)|(?:github|gitlab)[- ]репозитор\w*\s+(?:уже\s+)?есть/iu.test(facts);
  const explicitlyWantsNewRepo=/(?:хочу|нужно|решил\w*|необходим\w*)\s+(?:создать|завести|открыть)\s+(?:новый\s+)?(?:github|gitlab|репозитор\w*)/iu.test(facts);
  const result:RoadmapAudit['issues']=[];
  for(const [di,direction] of plan.directions.entries())for(const [ai,text] of direction.actions.entries()){
    if(direction.protectedActions?.includes(text))continue;
    const id=`d${di}a${ai}`;
    const mutatesUnknowns=/(?:удалить|исправить|заменить|заполнить|импутир\w*|исключить).{0,80}(?:пропуск\w*|аномал\w*)|(?:пропуск\w*|аномал\w*).{0,80}(?:удалить|исправить|заменить|заполнить|импутир\w*|исключить)/iu.test(text);
    if(mutatesUnknowns&&!explicitMissingPolicy)result.push({actionId:id,reason:'Не предписывать изменение пропусков или аномалий до их проверки и явного выбора политики.'});
    const saysSeasonality=/(?:сезонн\w*\s+(?:колебан\w*|изменен\w*|тренд\w*|анализ\w*)|(?:выявить|найти|определить|проанализировать|оценить|исследовать).{0,60}(?:сезонн\w*|цикличн\w*)|(?:сезонн\w*|цикличн\w*).{0,60}(?:выявить|найти|определить|проанализировать|оценить|исследовать))/iu.test(text);
    if(saysSeasonality&&!hasLongCoverage)result.push({actionId:id,reason:'Убери сезонные выводы и упоминание сезонности из шага. Замени на проверку минимальной/максимальной даты и описание фактически охваченного периода; его достаточность пока неизвестна.'});
    const causal=/(?:определить|выявить|доказать|установить).{0,50}(?:фактор\w*|причин\w*).{0,40}(?:влия|выручк|результат)|(?:фактор\w*|причин\w*).{0,40}(?:влияющ\w*\s+на|влияет\s+на)/iu.test(text);
    const explicitlyRejectsCausality=/(?:не|без)\s+(?:делать\s+)?(?:утверждать\s+)?причинн\w*|не\s+приписывать\s+причин/iu.test(text);
    if(causal&&!explicitlyRejectsCausality)result.push({actionId:id,reason:'Описательные поля не позволяют приписывать выручке причинные факторы.'});
    const learnsCollection=/(?:выучить|изучить|освоить|прочитать|повторить|потренировать|ознакомиться|репетировать|практиковать|проработать|познакомиться).{0,60}(?:слов(?:а|ами|ах)?|фраз(?:ы|ами|ах)?|правил(?:а|ами|ах)?|упражнен(?:ия|иями|иях)|пример(?:ы|ами|ах)|задан(?:ия|иями|иях)|тем(?:ы|ами|ах))(?=\s|[,.:;!?]|$)/iu.test(text);
    const singleUnit=/(?:одну|один|одна|одно|1\s+(?:слово|фраз\w*|правил\w*|упражнен\w*|пример\w*|задан\w*|тем\w*))/iu.test(text);
    if(shortTime&&learnsCollection&&!singleUnit)result.push({actionId:id,reason:'Для короткой сессии замени неограниченный набор на одну конкретную единицу и проверяемое действие.'});
    const suggestsNewRepo=/(?:создать|завести|открыть)\s+(?:новый\s+)?(?:репозитор\w*|github|gitlab)|нов(?:ый|ого)\s+(?:github|gitlab|репозитор\w*)/iu.test(text);
    if(alreadyHasRepo&&suggestsNewRepo&&!explicitlyWantsNewRepo)result.push({actionId:id,reason:'Используй уже имеющийся репозиторий пользователя; не предлагай создавать ещё один.'});
  }
  return result;
}

export function makeRoadmapAuditDraft(plan: RoadmapDraft) {
  const knownIds = new Set<string>();
  const protectedIds = new Set<string>();
  const directions = plan.directions.map((direction, di) => ({
    directionId: `d${di}`,
    title: direction.title,
    actions: direction.actions.map((text, ai) => {
      const actionId = `d${di}a${ai}`;
      const protectedAction=direction.protectedActions?.includes(text)??false;
      if(protectedAction)protectedIds.add(actionId);else knownIds.add(actionId);
      return { actionId, text,...(protectedAction?{protected:true}:{}) };
    }),
  }));
  return { draft: { desiredResult: plan.desiredResult, directions }, knownIds, protectedIds };
}

export function validateRoadmapAudit(value: unknown, knownIds: ReadonlySet<string>): RoadmapAudit {
  if (!value || typeof value !== 'object') throw new Error('Invalid roadmap review response');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.issues) || !Array.isArray(raw.missingQuestions) || typeof raw.conflicting !== 'boolean') throw new Error('Invalid roadmap review schema');
  if (raw.issues.length > 64 || raw.missingQuestions.length > 2) throw new Error('Roadmap review exceeded its bounds');
  const seen = new Set<string>();
  const issues = raw.issues.map(item => {
    if (!item || typeof item !== 'object') throw new Error('Invalid roadmap issue');
    const issue = item as Record<string, unknown>;
    if (typeof issue.actionId !== 'string' || !knownIds.has(issue.actionId) || seen.has(issue.actionId) || typeof issue.reason !== 'string' || !issue.reason.trim()) throw new Error('Roadmap review referenced an unknown or invalid action');
    seen.add(issue.actionId);
    return { actionId: issue.actionId, reason: issue.reason.trim().slice(0, 300) };
  });
  const missingQuestions = raw.missingQuestions.map(question => {
    if (typeof question !== 'string' || !question.trim()) throw new Error('Invalid roadmap clarification question');
    return question.trim().slice(0, 180);
  });
  return { issues, missingQuestions, conflicting: raw.conflicting };
}

/** Apply only explicitly flagged action repairs. Direction/action shape and all unflagged text must remain identical. */
export function applyRoadmapRepair(original: RoadmapDraft, value: unknown, issues: RoadmapAudit['issues']): RoadmapDraft {
  if (!value || typeof value !== 'object') throw new Error('Invalid roadmap repair response');
  const raw = value as Record<string, unknown>;
  if (!Array.isArray(raw.patches)) throw new Error('Invalid roadmap repair patches');
  const issueIds = new Set(issues.map(issue => issue.actionId));
  const knownIds = makeRoadmapAuditDraft(original).knownIds;
  const seen = new Set<string>();
  const patches = new Map<string,{text:string;directionTitle?:string}>();
  for(const value of raw.patches){
    if(!value||typeof value!=='object')throw new Error('Invalid roadmap repair patch');
    const patch=value as Record<string,unknown>,id=patch.actionId;
    if(typeof id!=='string'||!knownIds.has(id)||!issueIds.has(id)||seen.has(id)||typeof patch.text!=='string'||!patch.text.trim())throw new Error('Roadmap repair contains unknown, duplicate, or unflagged IDs');
    const directionTitle=patch.directionTitle;
    if(directionTitle!==undefined&&(typeof directionTitle!=='string'||!directionTitle.trim()))throw new Error('Invalid repaired stage title');
    seen.add(id);patches.set(id,{text:patch.text.trim().slice(0,300),...(typeof directionTitle==='string'?{directionTitle:directionTitle.trim().slice(0,200)}:{})});
  }
  if(seen.size!==issueIds.size||[...issueIds].some(id=>!seen.has(id)))throw new Error('Roadmap repair did not patch the exact issue set');
  const titleByDirection=new Map<number,string>();
  for(const [id,patch] of patches){
    if(!patch.directionTitle)continue;
    const di=Number(id.match(/^d(\d+)a\d+$/u)?.[1]);
    if(!Number.isInteger(di)||di<0||di>=original.directions.length)throw new Error('Invalid patched stage reference');
    const previous=titleByDirection.get(di);
    if(previous&&previous!==patch.directionTitle)throw new Error('Conflicting stage titles in repair patches');
    titleByDirection.set(di,patch.directionTitle);
  }
  return {...original,directions:original.directions.map((direction,di)=>({...direction,title:titleByDirection.get(di)??direction.title,actions:direction.actions.map((text,ai)=>patches.get(`d${di}a${ai}`)?.text??text)}))};
}

export function roadmapReviewPrompt(mode: 'audit' | 'repair', issues?: RoadmapAudit['issues']): string {
  if (mode === 'audit') return `Проведи независимую короткую проверку черновика дорожной карты. Ничего не переписывай. Проверь действия/этапы на факты и доступность материалов; освоенное; scope/end criteria; одна ограниченная операция и доступное время; неизвестные поля/ресурсы; удаление/импутацию пропусков; необоснованные причинные/сезонные выводы; upload raw data без просьбы; публичность/доступ. Источник фактов не доказывает корректность анализа. Не считай предложенную проверку фактом об учебнике или данных. Действия с protected:true — уже сохранённые завершённые/рутинные дела, не новые предложения: не критикуй, не повторяй и никогда не выдавай их actionId в issues. При настоящих противоречиях поставь conflicting=true.
missingQuestions используй ТОЛЬКО если отсутствует существенный факт, без которого нельзя безопасно начать ни один полезный этап. Не задавай вопросы об оценке времени: availableMinutes уже задано, его должен учитывать план, дробя каждое действие. Не спрашивай необязательные предпочтения оформления/визуализации и не уточняй точный период, если его можно безопасно определить первым шагом по фактическим датам. Не спрашивай повторно то, на что уже ответили. Если неизвестное можно ограничить безопасной проверкой или условным шагом, не задавай вопрос.
В issues включай только реальные дефекты, причина краткая и проверяемая. JSON строго: {"issues":[{"actionId":"d0a0","reason":"..."}],"missingQuestions":[],"conflicting":false}. Если проблем нет — пустые массивы и conflicting=false.`;
  return `Исправь ТОЛЬКО перечисленные дефекты. Не расширяй цель, факты, scope или гипотезы; не добавляй этапы/действия. Верни ровно один patch для каждого flagged actionId и ни одного другого. Сервер сохранит все неотмеченные тексты и структуру без изменений. directionTitle можно указать только в patch отмеченного действия и только если нужно исправить заголовок его этапа; у patches одного этапа заголовок должен совпадать. Учитывай причины аудита и факты пользователя; при невозможности безопасно исправить не придумывай решение. Верни JSON {"patches":[{"actionId":"d0a0","text":"...","directionTitle":"..."}]}. Defects: ${JSON.stringify(issues ?? [])}`;
}
