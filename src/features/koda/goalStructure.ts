import type {GoalPlanSuggestion} from '../../ai/goalPlanContract';
import {createGoalAction} from './goalLogic';
import {createOpenWindow,updateOpenWindow} from './openWindow';
import type {Goal} from './types';

const key=(value:string)=>value.trim().replace(/\s+/g,' ').toLocaleLowerCase('ru');

/** Add a reviewed proposal to the latest goal. Never replace existing work or its progress. */
export function addGoalStructure(goal:Goal,proposal:GoalPlanSuggestion):Goal {
  const directions=(goal.openWindow??createOpenWindow(goal.id)).directions.map(d=>({...d,actionIds:[...d.actionIds],routineIds:[...d.routineIds]}));
  const actions=[...goal.actions];
  let changed=false;
  const seen=new Set<string>();
  for(const source of proposal.directions){
    const title=source.title.trim().slice(0,300),name=key(title);
    if(!name)throw new Error('Дай название каждому выбранному направлению.');
    if(seen.has(name))throw new Error('У направлений должны быть разные названия.');
    seen.add(name);
    if(directions.some(d=>d.archivedAt&&key(d.title)===name))throw new Error(`«${title}» уже есть в архиве. Сначала восстанови направление.`);
    let direction=directions.find(d=>!d.archivedAt&&key(d.title)===name);
    if(!direction){
      const proposed=new Set(source.actions.map(key));
      direction=directions.find(d=>{
        if(d.archivedAt||d.title.trim()||!d.actionIds.length&&!d.routineIds.length)return false;
        const saved=[...d.actionIds.map(id=>actions.find(a=>a.id===id)?.title),...d.routineIds.map(id=>goal.routines.find(r=>r.id===id)?.title)];
        return saved.every(title=>title!==undefined&&proposed.has(key(title)));
      })??directions.find(d=>!d.archivedAt&&!d.title.trim()&&!d.actionIds.length&&!d.routineIds.length);
      if(!direction)throw new Error('Нет свободных направлений. Убери лишние предложения или освободи место в карте.');
      direction.title=title;changed=true;
    }
    for(const raw of source.actions){
      const actionTitle=raw.trim().slice(0,300);if(!actionTitle)continue;
      const existing=actions.find(a=>key(a.title)===key(actionTitle));
      // Do not duplicate a completed/archived action or move work out of another direction.
      if(existing&&(existing.archivedAt||directions.some(d=>d.actionIds.includes(existing.id))))continue;
      if(goal.routines.some(r=>key(r.title)===key(actionTitle)))continue;
      if(direction.actionIds.length+direction.routineIds.length>=8)throw new Error(`В направлении «${direction.title}» заполнены все 8 слотов. Убери лишние шаги.`);
      const action=existing??createGoalAction({title:actionTitle,position:actions.length});
      if(!existing)actions.push(action);
      direction.actionIds.push(action.id);changed=true;
    }
  }
  if(!seen.size)throw new Error('Оставь хотя бы одно направление для добавления.');
  if(!changed)throw new Error('Эти направления и шаги уже есть в цели. Повторы не добавлены.');
  return {...updateOpenWindow(goal,directions,'Добавлена структура по предложению KODA'),actions};
}

/** Replace only reviewed future work, addressed by the original physical slots. */
export function rebuildGoalStructure(goal:Goal,proposal:GoalPlanSuggestion):Goal {
  const previous=goal.openWindow??createOpenWindow(goal.id);
  const directions=previous.directions.map(d=>({...d,actionIds:[...d.actionIds],routineIds:[...d.routineIds]}));
  const actions=[...goal.actions];
  const originalLinks=new Set(previous.directions.flatMap(d=>d.actionIds));
  const removed=new Set<string>(),slots=new Set<number>();
  if(!proposal.directions.length)throw new Error('Оставь хотя бы одно направление для перестройки.');

  for(const source of proposal.directions){
    const slot=source.slotIndex;
    if(typeof slot!=='number'||!Number.isInteger(slot)||slot<0||slot>7)throw new Error('Не удалось определить исходное место направления. Запроси карту заново.');
    if(slots.has(slot))throw new Error('В предложении повторяется место направления. Запроси карту заново.');
    slots.add(slot);
    const direction=directions.find(d=>d.position===slot);
    if(!direction||direction.archivedAt)throw new Error('Направление отсутствует или находится в архиве. Запроси карту заново.');
    const title=source.title.trim().slice(0,300);
    if(!title)throw new Error('Дай название каждому выбранному направлению.');
    const ownActions=direction.actionIds.map(id=>goal.actions.find(a=>a.id===id));
    const ownRoutines=direction.routineIds.map(id=>goal.routines.find(r=>r.id===id));
    if(ownActions.some(a=>!a)||ownRoutines.some(r=>!r))throw new Error('Связанные шаги направления изменились. Обнови цель и запроси карту заново.');
    const protectedTitles=[...ownActions.filter(a=>a?.status==='completed').map(a=>a!.title),...ownRoutines.map(r=>r!.title)];
    if(protectedTitles.some(saved=>!source.actions.includes(saved)))throw new Error(`В направлении «${title}» нужно сохранить точные названия выполненных шагов и регулярных действий.`);
    const proposed=source.actions.map(raw=>raw.trim().slice(0,300));
    if(proposed.some(item=>!item))throw new Error('Дай название каждому шагу предложенной карты.');
    if(new Set(proposed.map(key)).size!==proposed.length)throw new Error(`В направлении «${title}» повторяются шаги. Убери повторы.`);
    const actionIds:string[]=[];
    // Protected records are retained even if legacy data contains equal titles.
    for(const actionTitle of proposed){
      const name=key(actionTitle);
      const own=ownActions.filter(a=>a&&key(a.title)===name);
      if(own.length){
        own.forEach(a=>actionIds.push(a!.id));
        continue;
      }
      if(ownRoutines.some(r=>key(r!.title)===name))continue;
      // The original link set prevents moving a task from another slot even
      // when that slot was already processed and no longer links the task.
      const matching=actions.filter(a=>key(a.title)===name);
      const reusable=matching.find(a=>a.status==='pending'&&!a.archivedAt&&!originalLinks.has(a.id)&&!directions.some(d=>d.actionIds.includes(a.id)));
      if(matching.some(a=>a.id!==reusable?.id)||goal.routines.some(r=>key(r.title)===name))throw new Error(`Шаг «${actionTitle}» уже есть в другом направлении или архиве. Сохрани его на прежнем месте либо убери повтор.`);
      const action=reusable??createGoalAction({title:actionTitle,position:actions.length});
      if(!reusable)actions.push(action);
      actionIds.push(action.id);
    }
    if(ownActions.some(a=>a!.status==='completed'&&!actionIds.includes(a!.id)))throw new Error(`В направлении «${title}» нужно сохранить точные названия выполненных шагов.`);
    if(actionIds.length+direction.routineIds.length>8)throw new Error(`В направлении «${title}» больше 8 слотов с учётом выполненных и регулярных действий. Убери лишние будущие шаги.`);
    for(const id of direction.actionIds)if(!actionIds.includes(id))removed.add(id);
    direction.title=title;
    direction.actionIds=actionIds;
  }
  for(const slot of slots){
    const direction=directions.find(d=>d.position===slot)!;
    if(directions.some(d=>d.id!==direction.id&&key(d.title)===key(direction.title)))throw new Error('У направлений должны быть разные названия, включая направления в архиве.');
  }
  if(JSON.stringify(previous.directions)===JSON.stringify(directions))throw new Error('Эта карта уже применена. Новых изменений нет.');
  const at=new Date().toISOString();
  // Snapshot the original goal before assigning archived/new canonical actions.
  const updated=updateOpenWindow(goal,directions,'Перестроены будущие шаги по предложению KODA',at);
  const remainingLinks=new Set(directions.flatMap(d=>d.actionIds));
  return {...updated,actions:actions.map(a=>removed.has(a.id)&&!remainingLinks.has(a.id)&&a.status==='pending'&&!a.archivedAt?{...a,archivedAt:at}:a)};
}
