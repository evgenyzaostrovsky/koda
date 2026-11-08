/** Runtime skill: preserve curriculum units, then calculate dates outside the model. */
export type StudyPlan = {
  dailyMinutes:number; studyDays:number[]; startDate:string; deadline?:string;
  availableMinutes:number; totalMinutes:number; shortfallMinutes:number;
  assumptions:string[]; warnings:string[];
  modules:Array<{title:string;status:'completed'|'current'|'remaining';estimatedMinutes:number;sessions:number;startDate?:string;endDate?:string}>;
};
export function planningDate(value:unknown):string|undefined {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return undefined;
  const date=new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?value:undefined;
}
const addDay=(date:string)=>new Date(Date.parse(`${date}T00:00:00Z`)+86400000).toISOString().slice(0,10);
export function calculateStudyPlan(raw:unknown,start:string,deadline?:string):StudyPlan|undefined {
  if(raw==null)return undefined;
  if(typeof raw!=='object'||!planningDate(start))throw new Error('Не удалось определить дату начала учебного плана.');
  const value=raw as Record<string,unknown>;
  const daily=value.dailyMinutes;
  if(typeof daily!=='number'||!Number.isInteger(daily)||daily<5||daily>480)throw new Error('В учебном плане нужно указать посильную длительность занятия.');
  const days=Array.isArray(value.studyDays)?[...new Set(value.studyDays.filter((d):d is number=>typeof d==='number'&&Number.isInteger(d)&&d>=0&&d<=6))].sort():[];
  if(!days.length)throw new Error('В учебном плане нужны дни занятий.');
  if(!Array.isArray(value.modules)||!value.modules.length||value.modules.length>100)throw new Error('Учебный план должен содержать исходные модули по отдельности (до 100).');
  const seen=new Set<string>();
  const modules:StudyPlan['modules']=value.modules.map(item=>{
    const m=item as Record<string,unknown>;
    if(!m||typeof m.title!=='string'||!m.title.trim()||m.title.length>200||!['completed','current','remaining'].includes(String(m.status)))throw new Error('У каждого модуля нужны название и статус прохождения.');
    const key=m.title.trim().toLocaleLowerCase();
    if(seen.has(key))throw new Error('В учебном плане повторяется модуль.');
    seen.add(key);
    const minutes=m.status==='completed'?0:m.estimatedMinutes;
    if(typeof minutes!=='number'||!Number.isInteger(minutes)||minutes<0||(m.status!=='completed'&&minutes===0)||minutes>60000)throw new Error('Для оставшегося модуля нужна оценка времени.');
    return {title:m.title.trim(),status:m.status as StudyPlan['modules'][number]['status'],estimatedMinutes:minutes,sessions:0};
  });
  const assumptions=Array.isArray(value.assumptions)?value.assumptions.filter((s):s is string=>typeof s==='string').slice(0,12).map(s=>s.slice(0,400)):[];
  const end=planningDate(deadline),warnings:string[]=[];
  let available=0;
  if(end){let day=start;for(let i=0;day<=end&&i<3660;i++,day=addDay(day))if(days.includes(new Date(`${day}T00:00:00Z`).getUTCDay()))available+=daily;}
  let cursor=start,used=0;
  for(const module of modules){
    if(module.status==='completed')continue;
    let remaining=module.estimatedMinutes,iterations=0;
    while(remaining>0){
      if(++iterations>20000)throw new Error('Учебный план слишком длинный для расчёта.');
      if(!days.includes(new Date(`${cursor}T00:00:00Z`).getUTCDay())||used>=daily){cursor=addDay(cursor);used=0;continue;}
      module.startDate??=cursor;
      const take=Math.min(remaining,daily-used);used+=take;remaining-=take;module.endDate=cursor;module.sessions++;
    }
  }
  const total=modules.reduce((sum,m)=>sum+m.estimatedMinutes,0),shortfall=end?Math.max(0,total-available):0;
  if(shortfall)warnings.push(`До срока не помещается ${shortfall} мин. Нужно уменьшить объём, изменить нагрузку или перенести срок.`);
  if(!end)warnings.push('Срок не выбран: даты рассчитаны по предложенной нагрузке, достижимость срока ещё не проверена.');
  if(end&&end<start)warnings.push('Выбранный срок уже прошёл.');
  warnings.push('Длительность модулей — оценка. Уточняй её по фактическому темпу; это предложение, а не обещание закончить к дате.');
  return {dailyMinutes:daily,studyDays:days,startDate:start,...(end?{deadline:end}:{}),availableMinutes:available,totalMinutes:total,shortfallMinutes:shortfall,assumptions,warnings,modules};
}

export const studyPlanningSkill=`Навык планирования обучения (включай только для цели пройти курс, программу, подготовку или освоить явно названные материалы):
1. Извлеки ВСЕ модули из материалов этой цели, сохрани названия и порядок. Не объединяй и не выбрасывай модули ради лимита восьми квадратов: список модулей studyPlan независим от directions. Отдельно пометь completed/current/remaining по последним словам пользователя и выполненному. Содержание программы само по себе НЕ означает завершение. Если весь список обрезан (contextShortened), прямо предупреди и не называй перечень полным.
2. Для текущего модуля оцени только оставшуюся работу; для завершённых estimatedMinutes=0. Для остальных оцени минуты включая практику, явно обозначь оценки и основания в assumptions. Не утверждай, что оценка взята из курса, если её нет в материалах.
3. Используй указанную нагрузку и дни занятий из беседы. Если человек просит план, но режим не задан, ПРЕДЛОЖИ 120 минут в день (или меньше при явном ограничении); в assumptions напиши, что это ещё не согласованный режим. Не принимай availableMinutes по умолчанию за дневную норму. Не создавай календарные дела без принятия пользователем.
4. В ответ добавь studyPlan: {dailyMinutes:120,studyDays:[1,2,3,4,5,6,0],assumptions:["Оценки длительности..."],modules:[{title:"Точное название модуля",status:"completed|current|remaining",estimatedMinutes:240}]}. Не считай даты самостоятельно: приложение распределит минуты по дням от planningDate до goalProgress.deadline и покажет дефицит. Срок из формы имеет приоритет; если его нет, можно добавить studyPlan.deadline только когда точная дата явно есть в текущей беседе. Если времени мало, не сокращай исходную программу молча.
5. Квадраты ОТАНИ — отдельная карта поддержки цели. Дай несколько содержательных факторов и действий из оставшихся материалов: конкретная практика, проверка понимания, сдача необходимых работ. Не подменяй модуль общими «развивать навыки». Если модулей больше восьми, группируй только факторы, а все исходные модули оставляй в studyPlan. Не заполняй 64 ячейки повторениями; при достаточных материалах не ограничивай карту тремя факторами и одним действием. Каждое действие имеет короткую подпись и объяснение. Не ограничивай каждый модуль одним пунктом «пройти модуль» или «выполнить практику модуля»: это повтор заголовка, а не помощь. Предложи конкретную работу с наблюдаемым результатом на одну сессию: разбор конкретной темы, выполнение отдельного упражнения, проверка и исправление результата. Если модуль занимает несколько сессий, не выдавай его целиком за одно действие на 120 минут. Используй названные задания курса; если их формулировок нет, предложи своё посильное упражнение и прямо назови его предложением, не заданием курса. Для цели другого типа studyPlan не добавляй. Никогда не подставляй профессию аналитика, Python или конкретный курс без данных текущей цели.`;
