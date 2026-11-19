import {applyGoalStudyPlan} from '../goalStudyPlan';
import {StudyPlanPreview} from './StudyPlanPreview';
import {findGoalCompletionCandidates} from '../goalCompletion';
import {GoalDiscussion} from './GoalDiscussion';
import {goalDiscussionContext,normalizeGoalDiscussion} from '../goalDiscussion';
import {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {Check,ChevronDown,ChevronUp,Plus,Sparkles,X} from 'lucide-react-native';
import {requestGoalPlan} from '../../../services/kodaApi';
import {AssistantCorrection} from './AssistantCorrection';
import {AssistantMemory} from './AssistantMemory';
import type {GoalActionDetail,GoalPlanSuggestion} from '../../../ai/goalPlanContract';
import {diffGoalProposals} from '../../../ai/proposalCorrections';
import {addGoalStructure} from '../goalStructure';
import {applyGoalRoadmap,goalRoadmapStructureSignature} from '../goalRoadmapStructure';
import {buildGoalPlanContext,goalStudyPlanContext} from '../goalPlanContext';
import {getActiveRoadmapClarifications,upsertRoadmapQuestions,updateRoadmapAnswer,removeRoadmapClarification} from '../goalRoadmapClarifications';
import type {Goal} from '../types';
import {accent,activeBg,activeText,line,muted,panel,panelSoft,text} from '../theme';
import { VoiceTextInput, useDictationBusy } from './VoiceTextInput';

type Props={open:boolean;goal:Goal;userId?:string|null;planningMethod?:'otani'|'roadmap';onClose:()=>void;onUpdateGoal:(recipe:(current:Goal)=>Goal)=>void};
export function GoalStructureAssistant({open,goal,userId,planningMethod='roadmap',onClose,onUpdateGoal}:Props){
  const dictation=useDictationBusy();
  const isOtani=planningMethod==='otani';
  const [planScope,setPlanScope]=useState<'starter'|'full-map'>('full-map');
  const context=goal.planningContext??'';
  const [minutes,setMinutes]=useState(String(goal.studyPlan?.dailyMinutes??120));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [proposal,setProposal]=useState<GoalPlanSuggestion|null>(null);
  const [initialProposal,setInitialProposal]=useState<GoalPlanSuggestion|null>(null);
  const [actionCopyOnly,setActionCopyOnly]=useState(false);
  const [proposalSource,setProposalSource]=useState<string|null>(null);
  const [otaniQuestions,setOtaniQuestions]=useState<Array<{id:string;question:string;answer:string}>>([]);
  const savedClarifications=getActiveRoadmapClarifications(goal);
  const displayedClarifications=isOtani?otaniQuestions:savedClarifications;
  const [expandedDirections,setExpandedDirections]=useState<number[]>([]);
  const autoContext=buildGoalPlanContext(goal,planningMethod);
  const existingDirections=autoContext.existingDirections??[];
  const copySourceDirections=existingDirections;
  const hasExistingActions=copySourceDirections.some(d=>!d.archived&&d.actions.length>0);
  const goalProgress=autoContext.goalProgress;
  const source=JSON.stringify({id:goal.id,title:goal.title,desiredResult:goal.desiredResult,deadline:goal.deadline,status:goal.status,archivedAt:goal.archivedAt,milestones:goal.milestones.map(m=>[m.id,m.title,m.status,m.deadline]),actions:goal.actions.map(a=>[a.id,a.title,a.shortTitle,a.description,a.status,a.archivedAt,a.completedAt,a.milestoneId,a.dueDate]),directions:goal.openWindow?.directions.map(d=>[d.id,d.title,d.archivedAt,d.actionIds,d.routineIds]),routines:goal.routines.map(r=>[r.id,r.title,r.isActive,r.metricType,r.targetValue,r.frequencyType,r.weekdays,r.startDate,r.endDate])});
  const stepDensity=planScope==='full-map'?'adaptive':undefined;
  const basis=JSON.stringify([goal.assistantDiscussion,source,planningMethod,planScope,context.trim().slice(0,2000),minutes,stepDensity,autoContext]);
  const clarifications=displayedClarifications.map(({question,answer})=>({question,answer:answer.trim()||'не знаю'}));
  const requestSource=JSON.stringify([basis,clarifications]);
  const latestSource=useRef(requestSource);latestSource.current=requestSource;
  const staleProposal=Boolean(proposal?.directions.length&&proposalSource!==requestSource);
  const proposalCorrections=proposal&&initialProposal?diffGoalProposals(initialProposal,proposal,isOtani):[];
  const [pendingApply,setPendingApply]=useState<{base:string;expected:string;changeId?:string}|null>(null);
  const requestId=useRef(0);
  useEffect(()=>{
    requestId.current++;setPlanScope('full-map');setMinutes(String(goal.studyPlan?.dailyMinutes??120));setProposal(null);setInitialProposal(null);setActionCopyOnly(false);setProposalSource(null);setOtaniQuestions([]);setExpandedDirections([]);setPendingApply(null);setError('');setBusy(false);
    return()=>{requestId.current++;};
  },[open,goal.id,planningMethod]);
  useEffect(()=>{
    if(!pendingApply||!open)return;
    if(pendingApply.changeId?goal.openWindow?.history.some(change=>change.id===pendingApply.changeId):goalRoadmapStructureSignature(goal)===pendingApply.expected){
      setPendingApply(null);setBusy(false);onClose();
    }else if(JSON.stringify(goal)!==pendingApply.base){
      setPendingApply(null);setBusy(false);setError('Цель изменилась на другом экране или устройстве. Проверь предложения и подтверди их ещё раз. Существующие изменения сохранены.');
    }
  },[goal,pendingApply,open,onClose]);
  async function suggest(requestedActionCopyOnly=false){
    if(dictation.busy)return;
    const available=Number(minutes);
    if(!Number.isFinite(available)||available<10||available>480){setError('Укажи от 10 до 480 минут на один подход. Это не ежедневное обязательство.');return;}
    const id=++requestId.current,requestedSource=requestSource,requestedScope=planScope,requestedStepDensity=isOtani?undefined:stepDensity;setActionCopyOnly(requestedActionCopyOnly);setBusy(true);setError('');setProposal(null);setInitialProposal(null);setProposalSource(null);
    try{
      const result=await requestGoalPlan({contextScope:{kind:'goal',goalId:goal.id},discussionContext:goalDiscussionContext(goal.assistantDiscussion,JSON.stringify({studyPlan:goalStudyPlanContext(goal),progress:autoContext.goalProgress})),wish:requestedActionCopyOnly?`Главная цель: ${goal.title.slice(0,400)}\nУлучши только краткие подписи (до 48 знаков) и конкретные пояснения существующих действий в переданном списке. Сохрани исходные названия действий без изменений, не добавляй и не удаляй действия.`:isOtani?`Главная цель: ${goal.title.slice(0,400)}\nСформируй независимые поддерживающие факторы по методу OTANI, не последовательные этапы.`:[`Главная цель: ${goal.title.slice(0,400)}`,requestedScope==='full-map'?'Подготовь полный последовательный путь от текущего прогресса до результата главной цели, до 8 содержательных этапов. Текущий урок — только ближайший шаг, а не весь путь. Используй программу и сообщения этой цели; не назначай пройденное заново. Сначала используй все уже переданные факты; не проси повторять их. Неизвестные части явно обозначь, не выдавая их за программу курса. Не выдумывай модули курса и не заполняй 64 шага ради числа.':'Предложи ближайшие полезные шаги от текущей точки, не начинай заново.'].join('\n'),desiredResult:goal.desiredResult||undefined,availableMinutes:available,...(isOtani?{planningMethod:'otani' as const,actionCopyOnly:requestedActionCopyOnly,clarifyGoal:!requestedActionCopyOnly,planScope:'full-map' as const,clarifications:requestedActionCopyOnly?undefined:clarifications}:{planningMethod:'roadmap' as const,clarifyRoadmap:true,clarifications,planScope:requestedScope,stepDensity:requestedStepDensity}),currentState:context.trim().slice(0,2000)||undefined,goalProgress:autoContext.goalProgress,existingDirections:requestedActionCopyOnly?copySourceDirections:autoContext.existingDirections});
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
      const captured=JSON.parse(JSON.stringify(result)) as GoalPlanSuggestion;setProposal(captured);setInitialProposal(captured);setProposalSource(requestedSource);setExpandedDirections(requestedScope==='starter'||isOtani?result.directions.map((_,index)=>index):[]);
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
    if(dictation.busy)return;
    if(!proposal)return;
    if(staleProposal){setError('Цель изменилась. Запроси предложения заново перед добавлением.');return;}
    if(isOtani&&proposal.directions.some(direction=>direction.actions.some(title=>{const detail=direction.actionDetails?.find(item=>item.title===title);return !detail||!detail.shortTitle.trim()||detail.shortTitle.length>48||!detail.description.trim()||detail.description.length>1000;}))){setError('Для каждого действия проверь короткую подпись до 48 знаков и непустые подробности до 1000 знаков.');return;}
    try{
      const structured=proposal.studyPlan&&!actionCopyOnly?addGoalStructure(goal,proposal):isOtani?addGoalStructure(goal,proposal,{actionCopyOnly}):applyGoalRoadmap(goal,proposal);
      const prepared=proposal.studyPlan&&!actionCopyOnly?applyGoalStudyPlan(structured,proposal.studyPlan):structured;
      const base=JSON.stringify(goal),expected=goalRoadmapStructureSignature(prepared),changeId=isOtani?prepared.openWindow?.history.at(-1)?.id:undefined;
      setBusy(true);setError('');setPendingApply({base,expected,changeId});
      // Stable prepared IDs, pure updater, and confirmation only after the resulting goal renders.
      onUpdateGoal(current=>JSON.stringify(current)===base?prepared:current);
    }catch(e){setPendingApply(null);setBusy(false);setError(e instanceof Error?e.message:'Не удалось добавить предложения.');}
  }
  if(!open)return null;
  return <Modal transparent visible onRequestClose={onClose} animationType="none">
    <View style={styles.overlay}><View accessibilityViewIsModal accessibilityLabel={isOtani?'KODA: квадраты ОТАНИ':'KODA: путь к главной цели'} style={styles.sheet}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{isOtani?'Квадраты ОТАНИ':'Путь к главной цели'}</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть помощь с направлениями" onPress={onClose} style={styles.close}><X size={20} color={text}/></Pressable></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <Text style={styles.goal}>{goal.title}</Text>{proposal?.studyPlan?<StudyPlanPreview plan={proposal.studyPlan}/>:null}
        {!!goal.desiredResult&&<Text style={styles.help}>{goal.desiredResult}</Text>}
        <Text style={styles.help}>{isOtani?'Расскажи о своей стартовой точке, времени и доступных ресурсах. KODA предложит независимые факторы и наблюдаемые действия; ты проверишь их до добавления в цель.':'Расскажи, где ты сейчас и чего уже достиг. KODA подготовит следующий план, а ты проверишь его до добавления в цель.'}</Text>
        {userId?<AssistantMemory key={userId} userId={userId}/>:null}
        <GoalDiscussion completionGoal={goal} onCompleteAction={(_goalId,actionId,message)=>onUpdateGoal(current=>findGoalCompletionCandidates(current,message).some(action=>action.id===actionId)?{...current,actions:current.actions.map(action=>action.id===actionId?{...action,status:'completed' as const,completedAt:new Date().toISOString()}:action)}:current)} key={`${userId}:${goal.id}`} userId={userId} goalId={goal.id} title={goal.title} desiredResult={goal.desiredResult} planningContext={JSON.stringify({studyPlan:goalStudyPlanContext(goal),progress:autoContext.goalProgress})} value={goal.assistantDiscussion} onChange={recipe=>onUpdateGoal(current=>({...current,assistantDiscussion:recipe(normalizeGoalDiscussion(current.assistantDiscussion))}))} onSuggest={()=>void suggest()} disabled={busy} onDictationBusyChange={dictation.bind('discussion')}/>
        {!isOtani&&<Text style={styles.label}>Какую карту подготовить?</Text>}
        {!isOtani&&
        <View style={styles.scopeRow}>
          <Pressable accessibilityRole="radio" accessibilityState={{checked:planScope==='starter'}} onPress={()=>chooseScope('starter')} style={[styles.scopeOption,planScope==='starter'&&styles.scopeOptionActive,pendingApply&&styles.disabled]}>
            <Text style={[styles.scopeTitle,planScope==='starter'&&styles.scopeTitleActive]}>Небольшой старт</Text>
            <Text style={styles.scopeHelp}>Ближайший этап и конкретные шаги</Text>
          </Pressable>
          <Pressable accessibilityRole="radio" accessibilityState={{checked:planScope==='full-map'}} onPress={()=>chooseScope('full-map')} style={[styles.scopeOption,planScope==='full-map'&&styles.scopeOptionActive,pendingApply&&styles.disabled]}>
            <Text style={[styles.scopeTitle,planScope==='full-map'&&styles.scopeTitleActive]}>Полный роадмап</Text>
            <Text style={styles.scopeHelp}>До 8 этапов, только нужные шаги</Text>
          </Pressable>
        </View>}
        {!isOtani&&planScope==='full-map'&&<Text style={styles.help}>KODA свяжет этапы с твоим контекстом. Если данных мало, сначала задаст пару вопросов. Неизвестные части пути можно уточнить позже.</Text>}
        {goalProgress&&<View style={styles.autoContext}>
          <Text style={styles.autoTitle}>Что KODA уже видит в этой цели</Text>
          <Text style={styles.help}>Передадим автоматически: {goalProgress.completedActions.length} выполненных и {goalProgress.pendingActions.length} будущих дел, {goalProgress.milestones.length} этапов{goalProgress.deadline?` · срок ${goalProgress.deadline}`:''}.</Text>
          <Text style={styles.autoNote}>Передадим прогресс, беседу и материалы только этой цели. Программа курса не считается списком уже пройденного.</Text>
        </View>}
        <Text style={styles.label}>Где ты сейчас и что уже есть?</Text>
        <VoiceTextInput accessibilityLabel="Где ты сейчас и что уже есть?" onDictationBusyChange={dictation.bind(`context-${goal.id}`)} editable={!busy} value={context} onChangeText={value=>onUpdateGoal(current=>({...current,planningContext:value.slice(0,2000)}))} maxLength={2000} multiline placeholder="Например: прошёл половину курса, знаю SQL, уже собрал датасет. Хочу научиться анализировать данные и собрать портфолио." placeholderTextColor={muted} style={[styles.input,styles.multiline]}/>
        <Text style={styles.autoNote}>Контекст сохраняется автоматически вместе с целью. Его можно дополнять или очищать. План изменится только после подтверждения.</Text>
        <Text style={styles.label}>Минут на один подход, когда есть силы</Text>
        <TextInput accessibilityLabel="Минут на один подход" editable={!busy} value={minutes} onChangeText={setMinutes} inputMode="numeric" maxLength={3} style={styles.input}/>
        {!!displayedClarifications.length&&<View style={styles.review}>
          <Text style={styles.label}>{isOtani?'Уточнения':'Уточнения к роадмапу'}</Text>
          <Text style={styles.help}>{isOtani?'Ответы передаются при следующем запросе, чтобы KODA учла их и не задавала те же вопросы повторно.':'Вопросы и ответы сохраняются вместе с целью и передаются KODA при следующем запросе. Можно ответить «не знаю», исправить ответ или удалить уточнение.'}</Text>
          {displayedClarifications.map(({id,question,answer},index)=><View key={id} style={styles.actionRow}>
            <View style={styles.row}><Text style={[styles.help,styles.flex]}>{question}</Text><Pressable accessibilityRole="button" accessibilityLabel={`Удалить уточнение ${index+1}`} disabled={busy} onPress={()=>{if(isOtani)setOtaniQuestions(current=>current.filter(item=>item.id!==id));else{const now=new Date().toISOString();onUpdateGoal(current=>removeRoadmapClarification(current,id,now));}}} style={styles.close}><X size={16} color={muted}/></Pressable></View>
            <VoiceTextInput accessibilityLabel={`Ответ на вопрос ${index+1}`} onDictationBusyChange={dictation.bind(`clarification-${id}`)} editable={!busy} value={answer} onChangeText={value=>{if(isOtani)setOtaniQuestions(current=>current.map(item=>item.id===id?{...item,answer:value}:item));else{const now=new Date().toISOString();onUpdateGoal(current=>updateRoadmapAnswer(current,id,value,now));}}} maxLength={400} multiline style={[styles.input,styles.multiline]}/>
          </View>)}
        </View>}
        {isOtani&&hasExistingActions&&<Pressable accessibilityRole="button" disabled={busy||dictation.busy} onPress={()=>void suggest(true)} style={[styles.secondary,(busy||dictation.busy)&&styles.disabled]}><Sparkles size={17} color={accent}/><Text style={styles.secondaryText}>{busy&&actionCopyOnly?'Сокращаю формулировки…':'Сократить формулировки с ИИ'}</Text>{busy&&actionCopyOnly&&<ActivityIndicator color={accent}/>}</Pressable>}
        <Pressable accessibilityRole="button" disabled={busy||dictation.busy} onPress={()=>void suggest()} style={[styles.secondary,(busy||dictation.busy)&&styles.disabled]}><Sparkles size={17} color={accent}/><Text style={styles.secondaryText}>{busy&&!actionCopyOnly?(isOtani?'Подбираю факторы…':'Собираю путь…'):proposal&&!actionCopyOnly?'Предложить другой вариант':displayedClarifications.length&&!actionCopyOnly?'Построить с учётом ответов':isOtani?'Предложить факторы':'Составить путь'}</Text>{busy&&!actionCopyOnly&&<ActivityIndicator color={accent}/>}</Pressable>
        {!!error&&<Text accessibilityRole="alert" style={styles.help}>{error}</Text>}
        {staleProposal&&!pendingApply&&<Text accessibilityRole="alert" style={styles.help}>Условия изменились. Запроси новый вариант перед сохранением.</Text>}
        {!!proposal?.planningNote&&proposalSource===requestSource&&<Text style={styles.help}>{proposal.planningNote}</Text>}
        {proposal&&userId&&proposalSource===requestSource&&proposalCorrections.length>0&&<View style={styles.rememberBox}>
          <Text style={styles.label}>Запомнить исправления · {proposalCorrections.length}</Text>
          <Text style={styles.help}>Каждый изменённый пункт сохраняется отдельно с коротким фрагментом исходного и исправленного варианта. Сохранение примеров не меняет цель; для этого используй кнопку добавления ниже.</Text>
          {proposalCorrections.map(change=><AssistantCorrection key={`${change.key}:${change.before}:${change.after}`} userId={userId} source={isOtani?'otani':'goal'} before={change.before} initialAfter={change.after} buttonLabel={`Запомнить: ${change.label}`} preferenceHint="Что учитывать в похожих предложениях? (необязательно)" />)}
        </View>}
        {proposal&&proposal.directions.length>0&&<View style={styles.review}>
          <Text style={styles.label}>Проверь и поправь предложения</Text>
          {(planScope==='full-map'||isOtani)&&<Text style={styles.count}>{proposal.directions.length} {isOtani?'факторов':'этапов'} · {proposal.directions.reduce((count,direction)=>count+direction.actions.length,0)} {isOtani?'действий':'шагов'}</Text>}
          <Text style={styles.help}>{actionCopyOnly?'Сохраняются только подписи и подробности действий, которые уже есть в квадратах. Состав действий не изменится.':isOtani?'Можно убрать факторы и отдельные шаги. Совпадающие дела не будут созданы повторно.':'Этапы попадут в «Путь» и виджет главной цели. Сохранённые дела и отметки выполнения сохранятся; квадраты ОТАНИ не изменятся.'}</Text>
          {[...proposal.directions].map((direction,index)=>({direction,index})).sort((a,b)=>(a.direction.slotIndex??a.index)-(b.direction.slotIndex??b.index)).map(({direction,index},displayIndex)=>{
            const expanded=planScope!=='full-map'||expandedDirections.includes(index);
            const linkedDirection=(goal.openWindow?.directions??[]).find(d=>!d.archivedAt&&(direction.slotIndex!==undefined?d.position===direction.slotIndex:d.title.trim().toLocaleLowerCase('ru')===direction.title.trim().toLocaleLowerCase('ru')));
            const completedTitles=(isOtani?(linkedDirection?.actionIds??[]).map(id=>goal.actions.find(a=>a.id===id)):goal.actions).filter(a=>a?.status==='completed'&&!a.archivedAt).map(a=>a!.title);
            const routineTitles=(isOtani?linkedDirection?.routineIds??[]:[]).map(id=>goal.routines.find(r=>r.id===id)?.title).filter((title):title is string=>Boolean(title));
            return <View key={index} style={styles.direction}>
              <View style={styles.row}>
                {planScope==='full-map'&&<Pressable accessibilityRole="button" accessibilityLabel={`${expanded?'Свернуть':'Показать'} шаги направления ${index+1}`} onPress={()=>toggleDirection(index)} style={styles.expandButton}>{expanded?<ChevronUp size={17} color={accent}/>:<ChevronDown size={17} color={accent}/>}</Pressable>}
                {planScope==='full-map'&&!isOtani&&<Text style={styles.sequence}>Этап {displayIndex+1}</Text>}
                <VoiceTextInput onDictationBusyChange={dictation.bind(`proposal-direction-${index}`)} accessibilityLabel={`Предложенное ${isOtani?'фактор':'этап'} ${displayIndex+1}`} editable={!busy&&!actionCopyOnly} value={direction.title} onChangeText={v=>editDirection(index,v)} maxLength={200} style={[styles.input,styles.flex]}/>
                {!actionCopyOnly&&<Pressable accessibilityRole="button" accessibilityLabel={`Убрать предложенное ${isOtani?'фактор':'этап'} ${index+1}`} disabled={busy} onPress={()=>{setProposal(p=>p?{...p,directions:p.directions.filter((_,i)=>i!==index)}:p);setExpandedDirections([]);}} style={styles.close}><X size={18} color={muted}/></Pressable>}
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
                  <View style={styles.row}><Text style={styles.stepSequence}>{isOtani?'Действие':'Шаг'} {actionIndex+1}</Text><VoiceTextInput onDictationBusyChange={dictation.bind(`proposal-action-${index}-${actionIndex}`)} accessibilityLabel={`${isOtani?'Действие':'Шаг'} ${actionIndex+1} для предложения ${displayIndex+1}`} editable={!busy&&!protectedAction&&!actionCopyOnly} value={action} onChangeText={v=>editAction(index,actionIndex,v)} maxLength={300} style={[styles.input,styles.flex,protectedAction&&styles.protectedInput,actionCopyOnly&&styles.protectedInput]}/>{!protectedAction&&!actionCopyOnly&&<Pressable accessibilityRole="button" accessibilityLabel={`Убрать ${isOtani?'действие':'шаг'} ${actionIndex+1} ${isOtani?'из фактора':'из направления'} ${displayIndex+1}`} disabled={busy} onPress={()=>removeAction(index,actionIndex)} style={styles.close}><X size={16} color={muted}/></Pressable>}</View>
                  {isOtani&&<View style={styles.copyDetailFields}><Text style={styles.copyDetailLabel}>В сетке</Text><VoiceTextInput onDictationBusyChange={dictation.bind(`proposal-short-${index}-${actionIndex}`)} accessibilityLabel={`Короткая подпись действия ${actionIndex+1}`} editable={!busy} value={detail.shortTitle} onChangeText={v=>editActionDetail(index,actionIndex,'shortTitle',v)} maxLength={48} placeholder="Короткая подпись · до 48 знаков" style={styles.input}/><Text style={styles.copyDetailLabel}>Подробности при наведении</Text>{preserveExistingDescription?<View style={styles.preservedDescription}><Text style={styles.help}>Сохранённые подробности останутся без изменений. Изменить их можно в редакторе действия.</Text><Text style={styles.descriptionText}>{existingAction?.description}</Text></View>:<VoiceTextInput onDictationBusyChange={dictation.bind(`proposal-description-${index}-${actionIndex}`)} accessibilityLabel={`Подробности действия ${actionIndex+1}`} editable={!busy} value={detail.description} onChangeText={v=>editActionDetail(index,actionIndex,'description',v)} maxLength={1000} multiline placeholder="Подробности · до 1000 знаков" style={[styles.input,styles.multiline]}/>}</View>}
                </View>;
              })}
            </View>;
          })}
          <Pressable accessibilityRole="button" disabled={busy||dictation.busy||staleProposal||!proposal.directions.length} onPress={apply} style={[styles.primary,(busy||dictation.busy||staleProposal||!proposal.directions.length)&&styles.disabled]}><Plus size={18} color={activeText}/><Text style={styles.primaryText}>{actionCopyOnly?'Сохранить подписи и подробности':isOtani?'Добавить выбранное в цель':'Добавить этапы в путь'}</Text></Pressable>
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
  rememberBox:{gap:4,padding:12,borderRadius:12,borderWidth:1,borderColor:line,backgroundColor:panel},primary:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'center',gap:8,backgroundColor:activeBg,borderRadius:12,padding:12},primaryText:{color:activeText,fontSize:14,fontWeight:'700'},disabled:{opacity:0.5},
});
