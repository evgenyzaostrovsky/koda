import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Check,ChevronDown,ChevronUp,Plus,Sparkles,X} from 'lucide-react-native';
import {requestGoalPlan} from '../../../services/kodaApi';
import type {GoalActionDetail,GoalPlanSuggestion} from '../../../ai/goalPlanContract';
import {addGoalStructure,rebuildGoalStructure} from '../goalStructure';
import {buildGoalPlanContext} from '../goalPlanContext';
import {getActiveRoadmapClarifications,upsertRoadmapQuestions,updateRoadmapAnswer,removeRoadmapClarification} from '../goalRoadmapClarifications';
import type {Goal} from '../types';
import {accent,activeBg,activeText,line,muted,panel,panelSoft,text} from '../theme';

type Props={open:boolean;goal:Goal;planningMethod?:'otani'|'roadmap';onClose:()=>void;onUpdateGoal:(recipe:(current:Goal)=>Goal)=>void};
export function GoalStructureAssistant({open,goal,planningMethod='roadmap',onClose,onUpdateGoal}:Props){
  const isOtani=planningMethod==='otani';
  const [planScope,setPlanScope]=useState<'starter'|'full-map'>('starter');
  const context=goal.planningContext??'';
  const [rebuildPending,setRebuildPending]=useState(false);
  const [fillAllSteps,setFillAllSteps]=useState(false);
  const [minutes,setMinutes]=useState('20');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [proposal,setProposal]=useState<GoalPlanSuggestion|null>(null);
  const [actionCopyOnly,setActionCopyOnly]=useState(false);
  const [proposalSource,setProposalSource]=useState<string|null>(null);
  const [otaniQuestions,setOtaniQuestions]=useState<Array<{id:string;question:string;answer:string}>>([]);
  const savedClarifications=getActiveRoadmapClarifications(goal);
  const displayedClarifications=isOtani?otaniQuestions:savedClarifications;
  const [expandedDirections,setExpandedDirections]=useState<number[]>([]);
  const autoContext=buildGoalPlanContext(goal);
  const existingDirections=autoContext.existingDirections??[];
  const copySourceDirections=existingDirections;
  const hasExistingActions=copySourceDirections.some(d=>!d.archived&&d.actions.length>0);
  const goalProgress=autoContext.goalProgress;
  const hasExistingStructure=existingDirections.some(d=>!d.archived&&Boolean(d.title||d.actions.length||d.routineTitles.length));
  const source=JSON.stringify({id:goal.id,title:goal.title,desiredResult:goal.desiredResult,deadline:goal.deadline,status:goal.status,archivedAt:goal.archivedAt,milestones:goal.milestones.map(m=>[m.id,m.title,m.status,m.deadline]),actions:goal.actions.map(a=>[a.id,a.title,a.shortTitle,a.description,a.status,a.archivedAt,a.completedAt,a.milestoneId,a.dueDate]),directions:goal.openWindow?.directions.map(d=>[d.id,d.title,d.archivedAt,d.actionIds,d.routineIds]),routines:goal.routines.map(r=>[r.id,r.title,r.isActive,r.metricType,r.targetValue,r.frequencyType,r.weekdays,r.startDate,r.endDate])});
  const revisionMode=planScope==='full-map'&&rebuildPending?'rebuild-pending':undefined;
  const stepDensity=planScope==='full-map'&&!fillAllSteps?'adaptive':undefined;
  const basis=JSON.stringify([source,planningMethod,planScope,context.trim().slice(0,2000),minutes,revisionMode,fillAllSteps,stepDensity,autoContext]);
  const clarifications=displayedClarifications.map(({question,answer})=>({question,answer:answer.trim()||'не знаю'}));
  const requestSource=JSON.stringify([basis,clarifications]);
  const latestSource=useRef(requestSource);latestSource.current=requestSource;
  const staleProposal=Boolean(proposal?.directions.length&&proposalSource!==requestSource);
  const [pendingApply,setPendingApply]=useState<{base:string;changeId:string}|null>(null);
  const requestId=useRef(0);
  useEffect(()=>{
    requestId.current++;setPlanScope(getActiveRoadmapClarifications(goal).length?'full-map':'starter');setMinutes('20');setRebuildPending(false);setFillAllSteps(false);setProposal(null);setActionCopyOnly(false);setProposalSource(null);setOtaniQuestions([]);setExpandedDirections([]);setPendingApply(null);setError('');setBusy(false);
    return()=>{requestId.current++;};
  },[open,goal.id,planningMethod]);
  useEffect(()=>{
    if(!pendingApply||!open)return;
    if(goal.openWindow?.history.some(change=>change.id===pendingApply.changeId)){
      setPendingApply(null);setBusy(false);onClose();
    }else if(JSON.stringify(goal)!==pendingApply.base){
      setPendingApply(null);setBusy(false);setError('Цель изменилась на другом экране или устройстве. Проверь предложения и подтверди их ещё раз. Существующие изменения сохранены.');
    }
  },[goal,pendingApply,open,onClose]);
  async function suggest(requestedActionCopyOnly=false){
    if(!isOtani&&planScope==='full-map'&&goal.openWindow?.directions.every(d=>Boolean(d.archivedAt))){setError('Все направления в архиве. Сначала восстанови хотя бы одно направление.');return;}
    const available=Number(minutes);
    if(!Number.isFinite(available)||available<10||available>480){setError('Укажи от 10 до 480 минут на один подход. Это не ежедневное обязательство.');return;}
    const id=++requestId.current,requestedSource=requestSource,requestedScope=planScope,requestedRevisionMode=isOtani?undefined:revisionMode,requestedStepDensity=isOtani?undefined:stepDensity;setActionCopyOnly(requestedActionCopyOnly);setBusy(true);setError('');setProposal(null);setProposalSource(null);
    try{
      const result=await requestGoalPlan({wish:requestedActionCopyOnly?`Главная цель: ${goal.title.slice(0,400)}\nУлучши только краткие подписи (до 48 знаков) и конкретные пояснения существующих действий в переданном списке. Сохрани исходные названия действий без изменений, не добавляй и не удаляй действия.`:isOtani?`Главная цель: ${goal.title.slice(0,400)}\nСформируй независимые поддерживающие факторы по методу OTANI, не последовательные этапы.`:[`Главная цель: ${goal.title.slice(0,400)}`,requestedScope==='full-map'?fillAllSteps?'Подготовь полный роадмап из 8 этапов и заполни все 8 шагов каждого этапа (64 шага): долгосрочные варианты, не ежедневные обязанности.':'Подготовь конкретный роадмап до 8 этапов и предложи только обоснованные известными фактами шаги: долгосрочные варианты, не ежедневные обязанности.':'Предложи ближайшие полезные шаги от текущей точки, не начинай заново.'].join('\n'),desiredResult:goal.desiredResult||undefined,availableMinutes:available,...(isOtani?{planningMethod:'otani' as const,actionCopyOnly:requestedActionCopyOnly,clarifyGoal:!requestedActionCopyOnly,planScope:'full-map' as const,clarifications:requestedActionCopyOnly?undefined:clarifications}:{planningMethod:'roadmap' as const,clarifyRoadmap:true,clarifications,planScope:requestedScope,revisionMode:requestedRevisionMode,stepDensity:requestedStepDensity}),currentState:context.trim().slice(0,2000)||undefined,goalProgress:autoContext.goalProgress,existingDirections:requestedActionCopyOnly?copySourceDirections:autoContext.existingDirections});
      if(id!==requestId.current)return;
      if(requestedSource!==latestSource.current){setProposal(null);setError('Цель изменилась, пока KODA готовила предложения. Запроси новый вариант для актуальной цели.');return;}
      if(result.clarificationQuestions?.length){
        if(isOtani){
          setOtaniQuestions(current=>result.clarificationQuestions!.map((question,index)=>{const existing=current.find(item=>item.question===question);return {id:existing?.id??`otani-${Date.now()}-${index}`,question,answer:existing?.answer??''};}));
        }else{
          const now=new Date().toISOString();
          onUpdateGoal(current=>upsertRoadmapQuestions(current,result.clarificationQuestions!,now));
        }
        return;
      }
      setProposal(result);setProposalSource(requestedSource);setExpandedDirections(requestedScope==='starter'||isOtani?result.directions.map((_,index)=>index):[]);
    }catch{if(id===requestId.current)setError(isOtani?'KODA пока не смогла предложить факторы. Попробуй ещё раз или добавь их вручную в матрице. Ничего не изменено.':'KODA пока не смогла предложить направления. Попробуй ещё раз или добавь их вручную в карте. Ничего не изменено.');}
    finally{if(id===requestId.current)setBusy(false);}
  }
  function editDirection(index:number,title:string){setProposal(p=>p?{...p,directions:p.directions.map((d,i)=>i===index?{...d,title}:d)}:p);}
  function actionDetailsFor(direction:GoalPlanSuggestion['directions'][number]):GoalActionDetail[]{return direction.actions.map(title=>direction.actionDetails?.find(detail=>detail.title===title)??{title,shortTitle:'',description:''});}
  function editAction(index:number,actionIndex:number,title:string){setProposal(p=>p?{...p,directions:p.directions.map((d,i)=>{if(i!==index)return d;const previous=d.actions[actionIndex],details=actionDetailsFor(d).map(detail=>detail.title===previous?{...detail,title}:detail);return {...d,actions:d.actions.map((a,j)=>j===actionIndex?title:a),actionDetails:details};})}:p);}
  function editActionDetail(index:number,actionIndex:number,field:'shortTitle'|'description',value:string){setProposal(p=>p?{...p,directions:p.directions.map((d,i)=>{if(i!==index)return d;const title=d.actions[actionIndex];return {...d,actionDetails:actionDetailsFor(d).map(detail=>detail.title===title?{...detail,[field]:value}:detail)};})}:p);}
  function removeAction(index:number,actionIndex:number){setProposal(p=>p?{...p,directions:p.directions.map((d,i)=>{if(i!==index)return d;const removed=d.actions[actionIndex],actions=d.actions.filter((_,j)=>j!==actionIndex);return {...d,actions,actionDetails:actionDetailsFor(d).filter(detail=>detail.title!==removed)};})}:p);}
  function chooseScope(value:'starter'|'full-map'){
    if(value===planScope||pendingApply)return;
    requestId.current++;setPlanScope(value);setBusy(false);setProposal(null);setProposalSource(null);setExpandedDirections([]);setError('');
  }
  function toggleDirection(index:number){setExpandedDirections(current=>current.includes(index)?current.filter(item=>item!==index):[...current,index]);}
  function apply(){
    if(!proposal)return;
    if(staleProposal){setError('Цель изменилась. Запроси предложения заново перед добавлением.');return;}
    if(isOtani&&proposal.directions.some(direction=>direction.actions.some(title=>{const detail=direction.actionDetails?.find(item=>item.title===title);return !detail||!detail.shortTitle.trim()||detail.shortTitle.length>48||!detail.description.trim()||detail.description.length>1000;}))){setError('Для каждого действия проверь короткую подпись до 48 знаков и непустые подробности до 1000 знаков.');return;}
    try{
      const prepared=actionCopyOnly?addGoalStructure(goal,proposal,{actionCopyOnly:true}):revisionMode==='rebuild-pending'?rebuildGoalStructure(goal,proposal):addGoalStructure(goal,proposal);
      const base=JSON.stringify(goal),changeId=prepared.openWindow!.history[prepared.openWindow!.history.length-1].id;
      setBusy(true);setError('');setPendingApply({base,changeId});
      // Stable prepared IDs, pure updater, and confirmation only after the resulting goal renders.
      onUpdateGoal(current=>JSON.stringify(current)===base?prepared:current);
    }catch(e){setPendingApply(null);setBusy(false);setError(e instanceof Error?e.message:'Не удалось добавить предложения.');}
  }
  if(!open)return null;
  return <Modal transparent visible onRequestClose={onClose} animationType="none">
    <View style={styles.overlay}><View accessibilityViewIsModal accessibilityLabel={isOtani?'KODA: квадраты ОТАНИ':'KODA: направления от главной цели'} style={styles.sheet}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{isOtani?'Квадраты ОТАНИ':'Направления от цели'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть помощь с направлениями" onPress={onClose} style={styles.close}><X size={20} color={text}/></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Text style={styles.goal}>{goal.title}</Text>
        {!!goal.desiredResult&&<Text style={styles.help}>{goal.desiredResult}</Text>}
        <Text style={styles.help}>{isOtani?'Расскажи о своей стартовой точке, времени и доступных ресурсах. KODA предложит независимые факторы и наблюдаемые действия; ты проверишь их до добавления в цель.':'Расскажи, где ты сейчас и чего уже достиг. KODA подготовит следующий план, а ты проверишь его до добавления в цель.'}</Text>
        {!isOtani&&<Text style={styles.label}>Какую карту подготовить?</Text>}
        {!isOtani&&
        <View style={styles.scopeRow}>
          <Pressable accessibilityRole="radio" accessibilityState={{checked:planScope==='starter'}} onPress={()=>chooseScope('starter')} style={[styles.scopeOption,planScope==='starter'&&styles.scopeOptionActive,pendingApply&&styles.disabled]}>
            <Text style={[styles.scopeTitle,planScope==='starter'&&styles.scopeTitleActive]}>Небольшой старт</Text>
            <Text style={styles.scopeHelp}>Несколько направлений и первые шаги</Text>
          </Pressable>
          <Pressable accessibilityRole="radio" accessibilityState={{checked:planScope==='full-map'}} onPress={()=>chooseScope('full-map')} style={[styles.scopeOption,planScope==='full-map'&&styles.scopeOptionActive,pendingApply&&styles.disabled]}>
            <Text style={[styles.scopeTitle,planScope==='full-map'&&styles.scopeTitleActive]}>Полный роадмап</Text>
            <Text style={styles.scopeHelp}>До 8 этапов, только нужные шаги</Text>
          </Pressable>
        </View>}
        {!isOtani&&planScope==='full-map'&&<Text style={styles.help}>KODA свяжет этапы с твоим контекстом. Если данных мало, сначала задаст пару вопросов. Неизвестные части пути можно уточнить позже.</Text>}
        {!isOtani&&planScope==='full-map'&&<View style={styles.rebuildBox}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:fillAllSteps,disabled:busy||Boolean(pendingApply)}} disabled={busy||Boolean(pendingApply)} onPress={()=>setFillAllSteps(value=>!value)} style={[styles.checkboxRow,(busy||pendingApply)&&styles.disabled]}>
            <View style={[styles.checkbox,fillAllSteps&&styles.checkboxActive]}>{fillAllSteps&&<Check size={14} color={activeText} strokeWidth={3}/>}</View>
          <Text style={styles.checkboxLabel}>Заполнить все 64 шага</Text>
          </Pressable>
          <Text style={styles.help}>Без отметки KODA предложит столько шагов, сколько нужно; пустые слоты можно заполнить позже.</Text>
        </View>}
        {goalProgress&&<View style={styles.autoContext}>
          <Text style={styles.autoTitle}>Что KODA уже видит в этой цели</Text>
          <Text style={styles.help}>Передадим автоматически: {goalProgress.completedActions.length} выполненных и {goalProgress.pendingActions.length} будущих дел, {goalProgress.milestones.length} этапов{goalProgress.deadline?` · срок ${goalProgress.deadline}`:''}.</Text>
          <Text style={styles.autoNote}>Выполненные дела и этапы из цели передадим автоматически. Личный опыт и знания можно добавить ниже.</Text>
        </View>}
        <Text style={styles.label}>Где ты сейчас и что уже есть?</Text>
        <TextInput accessibilityLabel="Где ты сейчас и что уже есть?" editable={!busy} value={context} onChangeText={value=>onUpdateGoal(current=>({...current,planningContext:value.slice(0,2000)}))} maxLength={2000} multiline placeholder="Например: прошёл половину курса, знаю SQL, уже собрал датасет. Хочу научиться анализировать данные и собрать портфолио." placeholderTextColor={muted} style={[styles.input,styles.multiline]}/>
        <Text style={styles.autoNote}>Контекст сохраняется автоматически вместе с целью. Его можно дополнять или очищать. План изменится только после подтверждения.</Text>
        {!isOtani&&planScope==='full-map'&&hasExistingStructure&&<View style={styles.rebuildBox}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{checked:rebuildPending,disabled:busy||Boolean(pendingApply)}} disabled={busy||Boolean(pendingApply)} onPress={()=>setRebuildPending(value=>!value)} style={[styles.checkboxRow,(busy||pendingApply)&&styles.disabled]}>
            <View style={[styles.checkbox,rebuildPending&&styles.checkboxActive]}>{rebuildPending&&<Check size={14} color={activeText} strokeWidth={3}/>}</View>
            <Text style={styles.checkboxLabel}>Пересобрать будущие шаги</Text>
          </Pressable>
          <Text style={styles.help}>При добавлении будущие дела будут заменены или отправлены в архив. Выполненные дела, ритуалы и история карты сохранятся. До подтверждения цель не изменится.</Text>
        </View>}
        <Text style={styles.label}>Минут на один подход, когда есть силы</Text>
        <TextInput accessibilityLabel="Минут на один подход" editable={!busy} value={minutes} onChangeText={setMinutes} inputMode="numeric" maxLength={3} style={styles.input}/>
        {!!displayedClarifications.length&&<View style={styles.review}>
          <Text style={styles.label}>{isOtani?'Уточнения':'Уточнения к роадмапу'}</Text>
          <Text style={styles.help}>{isOtani?'Ответы передаются при следующем запросе, чтобы KODA учла их и не задавала те же вопросы повторно.':'Вопросы и ответы сохраняются вместе с целью и передаются KODA при следующем запросе. Можно ответить «не знаю», исправить ответ или удалить уточнение.'}</Text>
          {displayedClarifications.map(({id,question,answer},index)=><View key={id} style={styles.actionRow}>
            <View style={styles.row}><Text style={[styles.help,styles.flex]}>{question}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Удалить уточнение ${index+1}`} disabled={busy} onPress={()=>{if(isOtani)setOtaniQuestions(current=>current.filter(item=>item.id!==id));else{const now=new Date().toISOString();onUpdateGoal(current=>removeRoadmapClarification(current,id,now));}}} style={styles.close}><X size={16} color={muted}/></Pressable></View>
            <TextInput accessibilityLabel={`Ответ на вопрос ${index+1}`} editable={!busy} value={answer} onChangeText={value=>{if(isOtani)setOtaniQuestions(current=>current.map(item=>item.id===id?{...item,answer:value}:item));else{const now=new Date().toISOString();onUpdateGoal(current=>updateRoadmapAnswer(current,id,value,now));}}} maxLength={400} multiline style={[styles.input,styles.multiline]}/>
          </View>)}
        </View>}
        {isOtani&&hasExistingActions&&<Pressable accessibilityRole="button" disabled={busy} onPress={()=>void suggest(true)} style={[styles.secondary,busy&&styles.disabled]}><Sparkles size={17} color={accent}/><Text style={styles.secondaryText}>{busy&&actionCopyOnly?'Сокращаю формулировки…':'Сократить формулировки с ИИ'}</Text>{busy&&actionCopyOnly&&<ActivityIndicator color={accent}/>}</Pressable>}
        <Pressable accessibilityRole="button" disabled={busy} onPress={()=>void suggest()} style={[styles.secondary,busy&&styles.disabled]}><Sparkles size={17} color={accent}/><Text style={styles.secondaryText}>{busy&&!actionCopyOnly?(isOtani?'Подбираю факторы…':'Подбираю направления…'):proposal&&!actionCopyOnly?'Предложить другой вариант':displayedClarifications.length&&!actionCopyOnly?'Построить с учётом ответов':isOtani?'Предложить факторы':'Предложить направления'}</Text>{busy&&!actionCopyOnly&&<ActivityIndicator color={accent}/>}</Pressable>
        {!!error&&<Text accessibilityRole="alert" style={styles.help}>{error}</Text>}
        {staleProposal&&!pendingApply&&<Text accessibilityRole="alert" style={styles.help}>Условия изменились. Запроси новый вариант перед сохранением.</Text>}
        {!!proposal?.planningNote&&proposalSource===requestSource&&<Text style={styles.help}>{proposal.planningNote}</Text>}
        {proposal&&proposal.directions.length>0&&<View style={styles.review}>
          <Text style={styles.label}>Проверь и поправь предложения</Text>
          {(planScope==='full-map'||isOtani)&&<Text style={styles.count}>{proposal.directions.length} {isOtani?'факторов':'этапов'} · {proposal.directions.reduce((count,direction)=>count+direction.actions.length,0)} {isOtani?'действий':'шагов'}</Text>}
          {revisionMode==='rebuild-pending'&&<Text style={styles.replaceWarning}>Будущие шаги будут заменены или отправлены в архив после подтверждения. Выполненные дела, ритуалы и история карты сохранятся.</Text>}
          <Text style={styles.help}>{actionCopyOnly?'Сохраняются только подписи и подробности действий, которые уже есть в квадратах. Состав действий не изменится.':'Можно убрать направления и отдельные шаги. Совпадающие дела не будут созданы повторно.'}</Text>
          {[...proposal.directions].map((direction,index)=>({direction,index})).sort((a,b)=>(a.direction.slotIndex??a.index)-(b.direction.slotIndex??b.index)).map(({direction,index},displayIndex)=>{
            const expanded=planScope!=='full-map'||expandedDirections.includes(index);
            const linkedDirection=(goal.openWindow?.directions??[]).find(d=>!d.archivedAt&&(direction.slotIndex!==undefined?d.position===direction.slotIndex:d.title.trim().toLocaleLowerCase('ru')===direction.title.trim().toLocaleLowerCase('ru')));
            const completedTitles=(linkedDirection?.actionIds??[]).map(id=>goal.actions.find(a=>a.id===id)).filter(a=>a?.status==='completed').map(a=>a!.title);
            const routineTitles=(linkedDirection?.routineIds??[]).map(id=>goal.routines.find(r=>r.id===id)?.title).filter((title):title is string=>Boolean(title));
            return <View key={index} style={styles.direction}>
              <View style={styles.row}>
                {planScope==='full-map'&&<Pressable accessibilityRole="button" accessibilityLabel={`${expanded?'Свернуть':'Показать'} шаги направления ${index+1}`} onPress={()=>toggleDirection(index)} style={styles.expandButton}>{expanded?<ChevronUp size={17} color={accent}/>:<ChevronDown size={17} color={accent}/>}</Pressable>}
                {planScope==='full-map'&&!isOtani&&<Text style={styles.sequence}>Этап {displayIndex+1}</Text>}
                <TextInput accessibilityLabel={`Предложенное ${isOtani?'фактор':'направление'} ${displayIndex+1}`} editable={!busy&&!actionCopyOnly} value={direction.title} onChangeText={v=>editDirection(index,v)} maxLength={200} style={[styles.input,styles.flex]}/>
                {!actionCopyOnly&&<Pressable accessibilityRole="button" accessibilityLabel={`Убрать предложенное ${isOtani?'фактор':'направление'} ${index+1}`} disabled={busy} onPress={()=>{setProposal(p=>p?{...p,directions:p.directions.filter((_,i)=>i!==index)}:p);setExpandedDirections([]);}} style={styles.close}><X size={18} color={muted}/></Pressable>}
              </View>
              {planScope==='full-map'&&!expanded&&<Pressable accessibilityRole="button" onPress={()=>toggleDirection(index)} style={styles.expandSummary}><Text style={styles.expandText}>Показать {direction.actions.length} шагов</Text></Pressable>}
              {expanded&&direction.actions.map((action,actionIndex)=>{
                const normalized=action.trim().toLocaleLowerCase('ru');
                const detail=direction.actionDetails?.find(item=>item.title===action)??{title:action,shortTitle:action.length<=48?action:'',description:''};
                const existingAction=isOtani?goal.actions.find(item=>item.title===action):undefined;
                const preserveExistingDescription=Boolean(existingAction?.description?.trim());
                const isCompleted=completedTitles.some(title=>title.trim().toLocaleLowerCase('ru')===normalized);
                const isRoutine=routineTitles.some(title=>title.trim().toLocaleLowerCase('ru')===normalized);
                const protectedAction=isCompleted||isRoutine;
                return <View key={actionIndex} style={styles.actionRow}>
                  {isCompleted&&<Text style={styles.protectedLabel}>Уже выполнено</Text>}
                  {isRoutine&&<Text style={styles.protectedLabel}>Привычка сохранится</Text>}
                  <View style={styles.row}><Text style={styles.stepSequence}>{isOtani?'Действие':'Шаг'} {actionIndex+1}</Text><TextInput accessibilityLabel={`${isOtani?'Действие':'Шаг'} ${actionIndex+1} для предложения ${displayIndex+1}`} editable={!busy&&!protectedAction&&!actionCopyOnly} value={action} onChangeText={v=>editAction(index,actionIndex,v)} maxLength={300} style={[styles.input,styles.flex,protectedAction&&styles.protectedInput,actionCopyOnly&&styles.protectedInput]}/>{!protectedAction&&!actionCopyOnly&&<Pressable accessibilityRole="button" accessibilityLabel={`Убрать ${isOtani?'действие':'шаг'} ${actionIndex+1} ${isOtani?'из фактора':'из направления'} ${displayIndex+1}`} disabled={busy} onPress={()=>removeAction(index,actionIndex)} style={styles.close}><X size={16} color={muted}/></Pressable>}</View>
                  {isOtani&&<View style={styles.copyDetailFields}><Text style={styles.copyDetailLabel}>В сетке</Text><TextInput accessibilityLabel={`Короткая подпись действия ${actionIndex+1}`} editable={!busy} value={detail.shortTitle} onChangeText={v=>editActionDetail(index,actionIndex,'shortTitle',v)} maxLength={48} placeholder="Короткая подпись · до 48 знаков" style={styles.input}/><Text style={styles.copyDetailLabel}>Подробности при наведении</Text>{preserveExistingDescription?<View style={styles.preservedDescription}><Text style={styles.help}>Сохранённые подробности останутся без изменений. Изменить их можно в редакторе действия.</Text><Text style={styles.descriptionText}>{existingAction?.description}</Text></View>:<TextInput accessibilityLabel={`Подробности действия ${actionIndex+1}`} editable={!busy} value={detail.description} onChangeText={v=>editActionDetail(index,actionIndex,'description',v)} maxLength={1000} multiline placeholder="Подробности · до 1000 знаков" style={[styles.input,styles.multiline]}/>}</View>}
                </View>;
              })}
            </View>;
          })}
          <Pressable accessibilityRole="button" disabled={busy||staleProposal||!proposal.directions.length} onPress={apply} style={[styles.primary,(busy||staleProposal||!proposal.directions.length)&&styles.disabled]}><Plus size={18} color={activeText}/><Text style={styles.primaryText}>{actionCopyOnly?'Сохранить подписи и подробности':revisionMode==='rebuild-pending'?'Заменить будущие шаги':'Добавить выбранное в цель'}</Text></Pressable>
        </View>}
      </ScrollView>
    </View></View>
  </Modal>;
}
const styles=StyleSheet.create({
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.46)',alignItems:'center',justifyContent:'center',padding:12},
  sheet:{width:'100%',maxWidth:680,maxHeight:'92%',backgroundColor:panelSoft,borderColor:line,borderWidth:1,borderRadius:14},
  header:{flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:14,paddingVertical:10,borderBottomColor:line,borderBottomWidth:1},title:{color:text,fontSize:18,fontWeight:'700',flex:1},close:{width:44,height:44,alignItems:'center',justifyContent:'center'},
  body:{padding:14,gap:10},goal:{color:text,fontSize:17,fontWeight:'600'},help:{color:muted,fontSize:13,lineHeight:19},label:{color:text,fontSize:14,fontWeight:'600'},
  scopeRow:{flexDirection:'row',gap:8},scopeOption:{flex:1,minHeight:68,borderWidth:1,borderColor:line,borderRadius:12,padding:10,gap:4,justifyContent:'center'},scopeOptionActive:{borderColor:accent,backgroundColor:panel},scopeTitle:{color:text,fontSize:13,fontWeight:'700'},scopeTitleActive:{color:accent},scopeHelp:{color:muted,fontSize:11,lineHeight:15},count:{color:accent,fontSize:13,fontWeight:'700'},autoContext:{gap:5,padding:12,borderWidth:1,borderColor:line,borderRadius:12,backgroundColor:panel},autoTitle:{color:text,fontSize:14,fontWeight:'700'},autoNote:{color:muted,fontSize:12,lineHeight:17},rebuildBox:{gap:8,paddingTop:4},checkboxRow:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10},checkbox:{width:24,height:24,borderRadius:7,borderWidth:1.5,borderColor:muted,alignItems:'center',justifyContent:'center'},checkboxActive:{borderColor:activeBg,backgroundColor:activeBg},checkboxLabel:{color:text,fontSize:15,fontWeight:'600'},replaceWarning:{color:text,fontSize:14,lineHeight:20,padding:12,borderWidth:1,borderColor:accent,borderRadius:12,backgroundColor:panel},sequence:{width:58,color:accent,fontSize:12,fontWeight:'700'},stepSequence:{width:64,flexShrink:0,color:muted,fontSize:11,fontWeight:'600'},
  input:{backgroundColor:panel,borderColor:line,borderWidth:1,borderRadius:12,minHeight:44,paddingHorizontal:12,paddingVertical:9,color:text,fontSize:16},multiline:{minHeight:84,textAlignVertical:'top'},
  secondary:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,borderColor:line,borderWidth:1,borderRadius:16,padding:12},secondaryText:{color:accent,fontSize:14,fontWeight:'600'},
  review:{gap:14,paddingTop:8},direction:{gap:8,borderTopColor:line,borderTopWidth:1,paddingTop:14},actionRow:{gap:2},copyDetailFields:{gap:6,paddingLeft:50},copyDetailLabel:{color:text,fontSize:12,fontWeight:'600'},preservedDescription:{gap:4,padding:10,borderRadius:10,borderWidth:1,borderColor:line,backgroundColor:panel},descriptionText:{color:text,fontSize:13,lineHeight:18},protectedLabel:{color:accent,fontSize:12,fontWeight:'600',paddingLeft:50},protectedInput:{opacity:0.76},row:{flexDirection:'row',alignItems:'center',gap:4},flex:{flex:1,minWidth:0},expandButton:{width:36,height:44,alignItems:'center',justifyContent:'center'},expandSummary:{alignSelf:'flex-start',paddingLeft:38,minHeight:36,justifyContent:'center'},expandText:{color:accent,fontSize:12,fontWeight:'600'},
  primary:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:activeBg,borderRadius:12,padding:12},primaryText:{color:activeText,fontSize:14,fontWeight:'700'},disabled:{opacity:0.5},
});
