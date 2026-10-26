export type GoalPlanInput = { wish: string; desiredResult?: string; availableMinutes?: number; clarifyGoal?:boolean; clarifyRoadmap?:boolean; clarifications?:Array<{question:string;answer:string}>; planScope?:'starter'|'full-map'; stepDensity?:'adaptive'; currentState?:string; revisionMode?:'rebuild-pending'; goalProgress?:{completedActions:string[];pendingActions:string[];milestones:Array<{title:string;status:'not_started'|'in_progress'|'completed'}>;deadline?:string}; existingDirections?:Array<{title:string;actions:string[];completedActions?:string[];routineTitles:string[];archived:boolean}> };
export type GoalPlanSuggestion = { goalTitle?: string; desiredResult: string; directions: Array<{ title: string; actions: string[];slotIndex?:number;groundingEvidence?:string;groundingSourceId?:number }>; clarificationQuestions?:string[]; planningNote?:string };

export function validateGoalPlan(value: unknown): GoalPlanSuggestion {
  if (!value || typeof value !== 'object') throw new Error('Ответ помощника не удалось разобрать. Можно продолжить вручную.');
  const raw = value as Record<string, unknown>;
  const clean = (v: unknown, limit: number) => typeof v === 'string' ? v.trim().slice(0, limit) : '';
  const desiredResult = clean(raw.desiredResult, 1000);
  if (!desiredResult || !Array.isArray(raw.directions)) throw new Error('Помощник не вернул структуру цели. Попробуйте ещё раз или продолжите вручную.');
  const directions: GoalPlanSuggestion['directions'] = [];
  const titles = new Set<string>(), actions = new Set<string>();
  for (const item of raw.directions.slice(0, 32)) {
    if (!item || typeof item !== 'object') continue;
    const title = clean((item as Record<string, unknown>).title, 200);
    if (!title || titles.has(title.toLocaleLowerCase('ru'))) continue;
    titles.add(title.toLocaleLowerCase('ru'));
    const values = (item as Record<string, unknown>).actions;
    const next: string[] = [];
    if (Array.isArray(values)) for (const v of values.slice(0, 32)) {
      const action = clean(v, 300), key = action.toLocaleLowerCase('ru');
      if (action && !actions.has(key) && next.length < 8) { actions.add(key); next.push(action); }
    }
    const slotIndex=(item as Record<string,unknown>).slotIndex;
    const groundingEvidence=clean((item as Record<string,unknown>).groundingEvidence,300);
    const groundingSourceId=(item as Record<string,unknown>).groundingSourceId;
    directions.push({ title, actions: next,...(typeof slotIndex==='number'&&Number.isInteger(slotIndex)&&slotIndex>=0&&slotIndex<8?{slotIndex}:{}),...(groundingEvidence?{groundingEvidence}:{}),...(typeof groundingSourceId==='number'&&Number.isInteger(groundingSourceId)&&groundingSourceId>=0?{groundingSourceId}:{}) });
    if (directions.length === 8) break;
  }
  const goalTitle=clean(raw.goalTitle,300);
  const questions=Array.isArray(raw.clarificationQuestions)?[...new Set(raw.clarificationQuestions.filter((q):q is string=>typeof q==='string').map(q=>q.trim().slice(0,180)).filter(Boolean))].slice(0,2):[];
  const planningNote=clean(raw.planningNote,500);
  if (!directions.length && !questions.length && !planningNote) throw new Error('Не получилось предложить направления. Их можно добавить самостоятельно.');
  return { ...(goalTitle?{goalTitle}:{}), desiredResult, directions,...(questions.length?{clarificationQuestions:questions}:{}),...(planningNote?{planningNote}:{}) };
}

export function normalizeGoalPlanInput(value: unknown): GoalPlanInput {
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const wish = typeof raw.wish === 'string' ? raw.wish.trim().slice(0, 1500) : '';
  if (!wish) throw new Error('Опишите, чего хотите достичь.');
  const clarifications=Array.isArray(raw.clarifications)?raw.clarifications.slice(0,raw.clarifyRoadmap===true?8:2).flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const q=item as Record<string,unknown>;
    const question=typeof q.question==='string'?q.question.trim().slice(0,180):'';
    const answer=typeof q.answer==='string'?q.answer.trim().slice(0,400):'';
    return question&&answer?[{question,answer}]:[];
  }):[];
  const existingDirections=Array.isArray(raw.existingDirections)?raw.existingDirections.slice(0,8).flatMap(value=>{
    if(!value||typeof value!=='object')return [];
    const d=value as Record<string,unknown>;
    const texts=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').slice(0,8).map(x=>x.trim().slice(0,300)).filter(Boolean):[];
    return [{title:typeof d.title==='string'?d.title.trim().slice(0,200):'',actions:texts(d.actions),completedActions:texts(d.completedActions),routineTitles:texts(d.routineTitles),archived:d.archived===true}];
  }):[];
  const currentState=typeof raw.currentState==='string'?raw.currentState.trim().slice(0,2000):'';
  const p=raw.goalProgress&&typeof raw.goalProgress==='object'?raw.goalProgress as Record<string,unknown>:null;
  const progressTexts=(v:unknown)=>Array.isArray(v)?v.filter((x):x is string=>typeof x==='string').slice(0,128).map(x=>x.trim().slice(0,300)).filter(Boolean):[];
  const milestones=p&&Array.isArray(p.milestones)?p.milestones.slice(0,32).flatMap(item=>{
    if(!item||typeof item!=='object')return [];
    const m=item as Record<string,unknown>,title=typeof m.title==='string'?m.title.trim().slice(0,300):'';
    return title&&['not_started','in_progress','completed'].includes(String(m.status))?[{title,status:m.status as 'not_started'|'in_progress'|'completed'}]:[];
  }):[];
  const goalProgress=p?{completedActions:progressTexts(p.completedActions),pendingActions:progressTexts(p.pendingActions),milestones,...(typeof p.deadline==='string'?{deadline:p.deadline.trim().slice(0,30)}:{})}:undefined;
  return { wish, desiredResult: typeof raw.desiredResult === 'string' ? raw.desiredResult.trim().slice(0, 1000) : '', availableMinutes: typeof raw.availableMinutes === 'number' && Number.isFinite(raw.availableMinutes) ? Math.max(10, Math.min(480, raw.availableMinutes)) : 60,...(raw.clarifyGoal===true?{clarifyGoal:true}:{}),...(raw.clarifyRoadmap===true&&raw.planScope==='full-map'?{clarifyRoadmap:true}:{}),...(clarifications.length?{clarifications}:{}),...(raw.planScope==='full-map'?{planScope:'full-map' as const}:{}),...(existingDirections.length?{existingDirections}:{}),...(raw.stepDensity==='adaptive'&&raw.planScope==='full-map'?{stepDensity:'adaptive' as const}:{}),...(currentState?{currentState}:{}),...(goalProgress?{goalProgress}:{}),...(raw.revisionMode==='rebuild-pending'&&raw.planScope==='full-map'?{revisionMode:'rebuild-pending' as const}:{}) };
}
