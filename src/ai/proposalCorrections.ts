import type {GoalPlanSuggestion} from './goalPlanContract';

export type ProposalCorrection={key:string;label:string;before:string;after:string};
type Direction=GoalPlanSuggestion['directions'][number];

const clean=(value:string|undefined)=>value?.trim()??'';
const detail=(direction:Direction,title:string)=>direction.actionDetails?.find(item=>item.title===title);
const directionKey=(direction:Direction,index:number)=>direction.slotIndex===undefined?`index:${index}`:`slot:${direction.slotIndex}`;

/** Return one concise, independently savable example for every edited or removed proposal field. */
export function diffGoalProposals(before:GoalPlanSuggestion,after:GoalPlanSuggestion,isOtani:boolean):ProposalCorrection[]{
  const changes:ProposalCorrection[]=[];
  const pair=(key:string,label:string,oldText:string,newText:string)=>{if(oldText!==newText)changes.push({key,label,before:`${label}\n${oldText}`,after:`${label}\n${newText}`});};
  const oldDirs=before.directions,newDirs=after.directions;
  const oldToNew=new Map<number,number>(),usedNew=new Set<number>();
  // Match stable slots and exact titles first. Only equally sized leftovers can be paired by order.
  oldDirs.forEach((old,index)=>{if(old.slotIndex===undefined)return;const found=newDirs.findIndex((candidate,j)=>!usedNew.has(j)&&candidate.slotIndex===old.slotIndex);if(found>=0){oldToNew.set(index,found);usedNew.add(found);}});
  oldDirs.forEach((old,index)=>{if(oldToNew.has(index))return;const found=newDirs.findIndex((candidate,j)=>!usedNew.has(j)&&candidate.title===old.title);if(found>=0){oldToNew.set(index,found);usedNew.add(found);}});
  const unmatchedOldDirs=oldDirs.map((_,index)=>index).filter(index=>!oldToNew.has(index));
  const unmatchedNewDirs=newDirs.map((_,index)=>index).filter(index=>!usedNew.has(index));
  const ambiguousOldDirs=new Set<number>();
  const unplacedOldDirs=unmatchedOldDirs.filter(index=>oldDirs[index].slotIndex===undefined);
  const unplacedNewDirs=unmatchedNewDirs.filter(index=>newDirs[index].slotIndex===undefined);
  if(unplacedOldDirs.length&&unplacedNewDirs.length&&unplacedOldDirs.length!==unplacedNewDirs.length){
    pair('directions:ambiguous','Неоднозначно изменённые направления',unplacedOldDirs.map(index=>formatDirection(oldDirs[index],index,isOtani)).join('\n'),unplacedNewDirs.map(index=>formatDirection(newDirs[index],index,isOtani)).join('\n'));
    unplacedOldDirs.forEach(index=>ambiguousOldDirs.add(index));
  }else if(unplacedOldDirs.length&&unplacedOldDirs.length===unplacedNewDirs.length){
    unplacedOldDirs.forEach((oldIndex,index)=>{const newIndex=unplacedNewDirs[index];oldToNew.set(oldIndex,newIndex);usedNew.add(newIndex);});
  }

  oldDirs.forEach((old,oldIndex)=>{
    const nextIndex=oldToNew.get(oldIndex),slot=old.slotIndex??oldIndex,context=`${isOtani?'Фактор':'Направление'} ${slot+1}`;
    if(nextIndex===undefined){
      if(ambiguousOldDirs.has(oldIndex))return;
      pair(`direction:${directionKey(old,oldIndex)}:title`,`${context} · название`,`«${clean(old.title)}»`,`Удалено из предложения.`);
      old.actions.forEach((action,index)=>{
        const d=detail(old,action),label=`${context} «${clean(old.title)}» · действие ${index+1}`;
        pair(`action:${directionKey(old,oldIndex)}:${index}:removed`,label,actionText(action,d,isOtani),'Удалено из предложения.');
      });
      return;
    }
    const next=newDirs[nextIndex],nextSlot=next.slotIndex??nextIndex,nextContext=`${isOtani?'Фактор':'Направление'} ${nextSlot+1}`;
    pair(`direction:${directionKey(old,oldIndex)}:title`,`${context} · название`,`«${clean(old.title)}»`,`«${clean(next.title)}»`);

    const oldActions=old.actions,newActions=next.actions,oldToNewAction=new Map<number,number>(),usedNewAction=new Set<number>();
    oldActions.forEach((title,i)=>{const found=newActions.findIndex((candidate,j)=>!usedNewAction.has(j)&&candidate===title);if(found>=0){oldToNewAction.set(i,found);usedNewAction.add(found);}});
    const unmatchedOldActions=oldActions.map((_,i)=>i).filter(i=>!oldToNewAction.has(i));
    const unmatchedNewActions=newActions.map((_,i)=>i).filter(i=>!usedNewAction.has(i));
    const ambiguousOldActions=new Set<number>();
    if(unmatchedOldActions.length&&unmatchedNewActions.length&&unmatchedOldActions.length!==unmatchedNewActions.length){
      const label=`${nextContext} «${clean(next.title)}» · неоднозначные действия`;
      pair(`actions:${directionKey(old,oldIndex)}:ambiguous`,label,unmatchedOldActions.map(index=>actionText(oldActions[index],detail(old,oldActions[index]),isOtani)).join('\n'),unmatchedNewActions.map(index=>actionText(newActions[index],detail(next,newActions[index]),isOtani)).join('\n'));
      unmatchedOldActions.forEach(index=>ambiguousOldActions.add(index));
    }else if(unmatchedOldActions.length===unmatchedNewActions.length){
      unmatchedOldActions.forEach((oldActionIndex,index)=>{const newActionIndex=unmatchedNewActions[index];oldToNewAction.set(oldActionIndex,newActionIndex);usedNewAction.add(newActionIndex);});
    }
    oldActions.forEach((oldAction,oldActionIndex)=>{
      if(ambiguousOldActions.has(oldActionIndex))return;
      const newActionIndex=oldToNewAction.get(oldActionIndex),oldDetail=detail(old,oldAction);
      const label=`${nextContext} «${clean(next.title)}» · действие ${oldActionIndex+1}`;
      if(newActionIndex===undefined){pair(`action:${directionKey(old,oldIndex)}:${oldActionIndex}:removed`,label,actionText(oldAction,oldDetail,isOtani),'Удалено из предложения.');return;}
      const newAction=newActions[newActionIndex],newDetail=detail(next,newAction);
      pair(`action:${directionKey(old,oldIndex)}:${oldActionIndex}`,label,actionText(oldAction,oldDetail,isOtani),actionText(newAction,newDetail,isOtani));
    });
  });
  return changes;
}

function actionText(title:string,detailValue:ReturnType<typeof detail>,isOtani:boolean){
  const short=clean(detailValue?.shortTitle),description=clean(detailValue?.description);
  return `Действие: ${clean(title)}${isOtani?`\nКороткая подпись: ${short||'не задана'}\nПодробности: ${description||'не заданы'}`:''}`;
}

function formatDirection(direction:Direction,index:number,isOtani:boolean){
  const slot=direction.slotIndex??index,label=`${isOtani?'Фактор':'Направление'} ${slot+1}`;
  return [`${label}: ${clean(direction.title)}`,...direction.actions.map((action,actionIndex)=>`  ${actionIndex+1}. ${actionText(action,detail(direction,action),isOtani)}`)].join('\n');
}
