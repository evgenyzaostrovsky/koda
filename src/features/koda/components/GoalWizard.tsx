import {GoalDiscussion} from './GoalDiscussion';
import {DeadlinePicker} from './DeadlinePicker';
import {StudyPlanPreview,StudyPlanSummary,studyPlanSummary} from './StudyPlanPreview';
import {calculateStudyPlan,studyPlanContext,type StudyPlan} from '../../../ai/studyPlanning';
import {applyGoalStudyPlan,normalizeGoalStudyPlan} from '../goalStudyPlan';
import type {GoalActionDetail} from '../../../ai/goalPlanContract';
import {normalizeGoalActionDetails} from '../../../ai/goalPlanContract';
import {assertDiscussionCapacity,normalizeGoalDiscussion,goalDiscussionContext,type GoalDiscussionData} from '../goalDiscussion';
import { webSpaceActivationProps } from './keyboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Plus, RefreshCw, Sparkles, X } from 'lucide-react-native';
import { createGoal, createGoalAction, type GoalDraft } from '../goalLogic';
import { createOpenWindow } from '../openWindow';
import type { Goal, GoalPriority, OpenWindowDirection } from '../types';
import { todayDateKey, uid } from '../utils';
import { createWizardDraftStorage, restoreWizardClarifications, type WizardClarifications } from '../wizardDraft';
import {cloudWizardDraftStorage,watchWizardDraft,refreshWizardDraft,chooseWizardDraft,type WizardCloudStatus} from '../wizardDraftCloud';
import { requestGoalPlan } from '../../../services/kodaApi';
import { accent, accentBorder, accentFaint, activeBg, activeText, faint, line, muted, panel, panelSoft, text } from '../theme';
import { VoiceTextInput } from './VoiceTextInput';

type PlanSuggestion = { goalTitle?: string; desiredResult: string; clarificationQuestions?: string[]; planningNote?:string; studyPlan?:StudyPlan; directions: Array<{ title: string; actions: string[]; actionDetails?:GoalActionDetail[];slotIndex?:number }> };
type WizardDirection = { id: string; title: string; actions: string[]; actionDetails?:GoalActionDetail[] };
type StoredDraft = { studyPlan?:StudyPlan; assistantDiscussion?:GoalDiscussionData; version: 1; step: number; wish: string; goalTitle?: string; desiredResult: string; deadline: string; priority: GoalPriority; directions: WizardDirection[] } & WizardClarifications;
type Props = { open: boolean; userId?: string | null; onClose: () => void; onSave: (goal: Goal) => boolean };
const draftStorage = createWizardDraftStorage(cloudWizardDraftStorage);
export function removeGoalWizardDraft(key:string){return draftStorage.removeItem(key);}

const priorities: Array<{ value: GoalPriority; label: string }> = [
  { value: 'main', label: 'Главная' },
  { value: 'important', label: 'Важная' },
  { value: 'supporting', label: 'Поддерживающая' },
];
const stepLabels = ['Желание', 'Формулировка', 'Направления', 'Действия', 'Приоритет и срок'];

function emptyDirection(position: number): WizardDirection {
  return { id: uid(`wizard-direction-${position}`), title: '', actions: [] };
}

function restoreWizardDirections(value: unknown): WizardDirection[] {
  if (!Array.isArray(value)) return Array.from({ length: 2 }, (_, index) => emptyDirection(index));
  return value.slice(0, 8).map((candidate, index) => {
    const item = candidate as Partial<WizardDirection> | null;
    const actions = Array.isArray(item?.actions) ? item.actions.filter((action): action is string => typeof action === 'string').slice(0, 8) : [];
    return {
      id: typeof item?.id === 'string' ? item.id : uid(`wizard-direction-${index}`),
      title: typeof item?.title === 'string' ? item.title.slice(0, 300) : '',
      actions,
      actionDetails:normalizeGoalActionDetails(item?.actionDetails,actions),
    };
  });
}

function studyPlanMessages(plan:StudyPlan){
  const lines=`Принятый план обучения\n${studyPlanSummary(plan)}`.split('\n');
  const chunks:string[]=[];let chunk='';
  for(const line of lines){const next=chunk?`${chunk}\n${line}`:line;if(next.length>3800&&chunk){chunks.push(chunk);chunk=`Продолжение плана обучения\n${line}`;}else chunk=next;}
  if(chunk)chunks.push(chunk);
  const at=new Date().toISOString();
  return chunks.map((content,index)=>({id:uid('study-plan'),role:'assistant' as const,at:new Date(Date.parse(at)+index).toISOString(),content}));
}

export function GoalWizard({ open, userId, onClose, onSave }: Props) {
  const [studyPlan,setStudyPlan]=useState<StudyPlan|undefined>();
  const [discussion,setDiscussion]=useState<GoalDiscussionData>(()=>normalizeGoalDiscussion(null));
  const [step, setStep] = useState(0);
  const [wish, setWish] = useState('');
  const [goalTitle, setGoalTitle] = useState('');
  const [desiredResult, setDesiredResult] = useState('');
  const [deadline, setDeadline] = useState('');
  const [priority, setPriority] = useState<GoalPriority>('important');
  const [directions, setDirections] = useState<WizardDirection[]>(() => Array.from({ length: 2 }, (_, index) => emptyDirection(index)));
  const [suggestion, setSuggestion] = useState<PlanSuggestion | null>(null);
  const [clarificationQuestions, setClarificationQuestions] = useState<string[]>([]);
  const [clarificationAnswers, setClarificationAnswers] = useState<string[]>([]);
  const [clarificationProposalReady, setClarificationProposalReady] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [restoredKey, setRestoredKey] = useState<string | null>(null);
  const [cloud,setCloud]=useState<WizardCloudStatus>({status:'local',generation:0,heads:[]});
  const cloudGeneration=useRef(0);
  const localEdits=useRef(0);
  const hydratingKey = useRef<string | null>(null);
  const latestDraft = useRef<{ key: string; value: StoredDraft } | null>(null);
  const discardedKey = useRef<string | null>(null);
  const aiRequestId = useRef(0);
  const storageKey = useMemo(() => `koda:goal-wizard:v1:${userId || 'guest'}`, [userId]);

  function restoreFields(raw:string|null){
    let saved:Partial<StoredDraft>={};
    try{const value=raw?JSON.parse(raw):null;if(value?.version===1)saved=value;}catch{}
    setStep(Math.max(0,Math.min(4,Number(saved.step)||0)));
    setWish(typeof saved.wish==='string'?saved.wish:'');
    setGoalTitle(typeof saved.goalTitle==='string'?saved.goalTitle:typeof saved.wish==='string'?saved.wish:'');
    setDesiredResult(typeof saved.desiredResult==='string'?saved.desiredResult:'');
    setDeadline(typeof saved.deadline==='string'?saved.deadline:'');
    setPriority(priorities.some(item=>item.value===saved.priority)?saved.priority as GoalPriority:'important');
    setDiscussion(normalizeGoalDiscussion(saved.assistantDiscussion));
    setStudyPlan(normalizeGoalStudyPlan(saved.studyPlan));
    setDirections(restoreWizardDirections(saved.directions));
    const pairs=restoreWizardClarifications(saved);
    setClarificationQuestions(pairs.clarificationQuestions);setClarificationAnswers(pairs.clarificationAnswers);
  }

  useEffect(()=>{
    let active=true,unsubscribe=()=>{};
    cloudGeneration.current=0;setCloud({status:'local',generation:0,heads:[]});
    if(!userId)return;
    void watchWizardDraft(userId,value=>{
      if(!active)return;setCloud(value);
      if(!open||value.generation<=cloudGeneration.current||hydratingKey.current===storageKey)return;
      const edit=localEdits.current;
      void draftStorage.getItem(storageKey).then(raw=>{
        if(!active||edit!==localEdits.current)return;
        cloudGeneration.current=value.generation;invalidateAI();latestDraft.current=null;
        restoreFields(raw);setRestoredKey(storageKey);
      });
    }).then(stop=>{if(active)unsubscribe=stop;else stop();});
    const refresh=()=>{if(active)void refreshWizardDraft(userId);};
    const timer=setInterval(refresh,20000);refresh();
    if(typeof window!=='undefined'){window.addEventListener('online',refresh);window.addEventListener('focus',refresh);}
    return()=>{active=false;unsubscribe();clearInterval(timer);if(typeof window!=='undefined'){window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);}};
  },[userId,open,storageKey]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    hydratingKey.current = storageKey;
    latestDraft.current = null;
    discardedKey.current = null;
    setRestoredKey(null);
    setStep(0);
    setWish('');setStudyPlan(undefined);
    setDiscussion(normalizeGoalDiscussion(null));
    setGoalTitle('');
    setDesiredResult('');
    setDeadline('');
    setPriority('important');
    setAiBusy(false);
    setDirections(Array.from({ length: 2 }, (_, index) => emptyDirection(index)));
    setSuggestion(null);
    setClarificationQuestions([]);
    setClarificationAnswers([]);
    setClarificationProposalReady(false);
    setAiMessage('');
    draftStorage.getItem(storageKey).then((raw) => {
      if (!active) return;
      if (raw) {
        try {
          const saved = JSON.parse(raw) as Partial<StoredDraft>;
          if (saved.version === 1) {
            setStep(Math.max(0, Math.min(4, Number(saved.step) || 0)));
            setWish(typeof saved.wish === 'string' ? saved.wish : '');
            setGoalTitle(typeof saved.goalTitle === 'string' ? saved.goalTitle : (typeof saved.wish === 'string' ? saved.wish : ''));
            setDesiredResult(typeof saved.desiredResult === 'string' ? saved.desiredResult : '');
            setDeadline(typeof saved.deadline === 'string' ? saved.deadline : '');
            setPriority(priorities.some((item) => item.value === saved.priority) ? saved.priority as GoalPriority : 'important');
            setDiscussion(normalizeGoalDiscussion(saved.assistantDiscussion));
    setStudyPlan(normalizeGoalStudyPlan(saved.studyPlan));
    setDirections(restoreWizardDirections(saved.directions));
            const clarifications = restoreWizardClarifications(saved);
            setClarificationQuestions(clarifications.clarificationQuestions);
            setClarificationAnswers(clarifications.clarificationAnswers);
          }
        } catch { /* A malformed draft is ignored and replaced on the next edit. */ }
      }
      hydratingKey.current = null;
      setRestoredKey(storageKey);
      if(userId)void refreshWizardDraft(userId);
    }).catch(() => { if (active) { hydratingKey.current = null; setRestoredKey(storageKey); } });
    return () => { active = false; aiRequestId.current += 1; if (hydratingKey.current === storageKey) hydratingKey.current = null; };
  }, [open, storageKey]);

  useEffect(() => {
    if (!open || restoredKey !== storageKey || hydratingKey.current === storageKey || discardedKey.current === storageKey) return;
    latestDraft.current = { key: storageKey, value: { studyPlan, assistantDiscussion:discussion, version: 1, step, wish, goalTitle, desiredResult, deadline, priority, directions, clarificationQuestions, clarificationAnswers } };
    persistDraft();
  }, [open, restoredKey, storageKey, step, wish, goalTitle, desiredResult, deadline, priority, directions, clarificationQuestions, clarificationAnswers, discussion, studyPlan]);

  function persistDraft(patch: Partial<StoredDraft> = {}) {
    const current = latestDraft.current;
    if (!current || current.key !== storageKey || hydratingKey.current === storageKey || discardedKey.current === storageKey) return;
    localEdits.current++;
    const value = { ...current.value, ...patch };
    current.value = { ...value, ...restoreWizardClarifications(value) };
    void draftStorage.setItem(storageKey, JSON.stringify(current.value)).catch(() => undefined);
  }

  function closeWizard() {
    invalidateAI();
    persistDraft();
    onClose();
  }

  function updateDirection(id: string, recipe: (direction: WizardDirection) => WizardDirection) {
    invalidateAI();
    setDirections((items) => items.map((item) => item.id === id ? recipe(item) : item));
  }

  function addDirection() {
    invalidateAI();
    setDirections((items) => items.length < 8 ? [...items, emptyDirection(items.length)] : items);
  }

  function addAction(direction: WizardDirection) {
    updateDirection(direction.id, (item) => item.actions.length < 8 ? { ...item, actions: [...item.actions, ''] } : item);
  }

  function invalidateAI() {
    aiRequestId.current += 1;
    setAiBusy(false);
    setSuggestion(null);
    setClarificationProposalReady(false);
    setAiMessage('');
  }

  function updateWish(value: string) {
    invalidateAI();
    // An explicit clear is different from an untouched empty form on a new
    // device: retire the old cloud draft instead of restoring its questions.
    if(userId&&!value.trim())void draftStorage.removeItem(storageKey).catch(()=>undefined);
    if(!value.trim()){setStudyPlan(undefined);setDiscussion(normalizeGoalDiscussion(null));persistDraft({assistantDiscussion:normalizeGoalDiscussion(null),studyPlan:undefined});}
    setWish(value);
    setGoalTitle(value);
    setClarificationQuestions([]);
    setClarificationAnswers([]);
    persistDraft({ wish: value, goalTitle: value, clarificationQuestions: [], clarificationAnswers: [] });
  }

  function updateGoalTitle(value: string) {
    invalidateAI();
    setGoalTitle(value);
  }

  function updateDesiredResult(value: string) {
    invalidateAI();
    setDesiredResult(value);
  }

  function updateClarificationAnswer(index: number, value: string) {
    invalidateAI();
    const answers = (latestDraft.current?.key === storageKey ? latestDraft.current.value.clarificationAnswers : clarificationAnswers).map((answer, answerIndex) => answerIndex === index ? value.slice(0, 400) : answer);
    setClarificationAnswers(answers);
    persistDraft({ clarificationAnswers: answers });
  }

  async function getSuggestions(forMainGoal = false, answerClarifications = false) {
    const requestId = ++aiRequestId.current;
    setAiBusy(true);
    setAiMessage('Запрашиваю варианты плана…');
    setSuggestion(null);
    try {
      const answeredQuestions = clarificationQuestions.map((question, index) => ({ question, answer: clarificationAnswers[index]?.trim() ?? '' })).filter((item) => item.answer);
      const goalPlanWish = forMainGoal ? wish.trim() : [
        `Основная цель: ${goalTitle.trim() || wish.trim()}`,
        `Исходное желание: ${wish.trim()}`,
        ...answeredQuestions.map(({ question, answer }) => `Уточнение: ${question}\nОтвет: ${answer}`),
      ].join('\n');
      const currentDirections=directions.map(item=>({title:item.title.trim(),actions:item.actions.map(action=>action.trim()).filter(Boolean),actionDetails:item.actionDetails,routineTitles:[],archived:false}));
      const result = await requestGoalPlan({ contextScope:{kind:'goal'},discussionContext:goalDiscussionContext(discussion,JSON.stringify({studyPlan:studyPlanContext(studyPlan),directions:currentDirections})),wish: goalPlanWish, availableMinutes:studyPlan?.dailyMinutes??120, desiredResult: forMainGoal ? undefined : desiredResult.trim() || undefined, ...(!forMainGoal?{planningMethod:'otani' as const,planningDate:todayDateKey(),goalProgress:{completedActions:[],pendingActions:[],milestones:[],deadline:deadline||undefined},existingDirections:currentDirections}:{}), ...(forMainGoal ? { clarifyGoal: true, ...(answerClarifications ? { clarifications: answeredQuestions } : {}) } : {}) });
      if (requestId !== aiRequestId.current) return;
      const extended=result as typeof result & {studyPlan?:StudyPlan};
      const validDirections = (result.directions ?? []).slice(0, 8).map((direction) => ({ title: String(direction.title ?? '').trim().slice(0, 300), actions: (direction.actions ?? []).map((action) => String(action).trim()).filter(Boolean).slice(0, 8),actionDetails:direction.actionDetails,slotIndex:direction.slotIndex })).filter((direction) => direction.title);
      const questions = (result.clarificationQuestions ?? []).map((question) => String(question).trim().slice(0, 300)).filter(Boolean).slice(0, 2);
      const proposal = { goalTitle: String(result.goalTitle ?? '').trim().slice(0, 300), desiredResult: String(result.desiredResult ?? '').trim(), directions: validDirections,planningNote:result.planningNote,clarificationQuestions:questions,studyPlan:extended.studyPlan };
      if (forMainGoal && !answerClarifications && questions.length) {
        setClarificationQuestions(questions);
        setClarificationAnswers(questions.map(() => ''));
        persistDraft({ clarificationQuestions: questions, clarificationAnswers: questions.map(() => '') });
        setClarificationProposalReady(false);
        setAiMessage('Ответь хотя бы на один вопрос, чтобы KODA уточнила формулировку.');
      } else {
        setSuggestion(proposal);
        setClarificationProposalReady(forMainGoal && answerClarifications);
        setAiMessage(forMainGoal ? (proposal.goalTitle || proposal.desiredResult ? 'Предложение готово. Проверь формулировку и подтверди переход.' : 'Не удалось получить формулировку. Можно продолжить вручную.') : validDirections.length ? 'Варианты готовы. Просмотри их и реши, что добавить в черновик.' : 'Не удалось получить подходящий план. Можно продолжить вручную.');
      }
    } catch (error) {
      if (requestId !== aiRequestId.current) return;
      setAiMessage(error instanceof Error ? error.message : 'Не удалось составить план. Попробуй ещё раз — беседа и материалы сохранены.');
    } finally { if (requestId === aiRequestId.current) setAiBusy(false); }
  }

  const latestStudyMessage=discussion.messages.findLast(message=>message.id.startsWith('study-plan'));
  const studyScheduleStale=latestStudyMessage?.id.startsWith('study-plan-stale')??false;
  function changeDeadline(value:string){
    if(value===deadline)return;
    invalidateAI();setDeadline(value);
    if(studyPlan){const nextPlan=calculateStudyPlan(studyPlan,studyPlan.startDate,value);setStudyPlan(nextPlan);persistDraft({studyPlan:nextPlan,deadline:value});return;}
    if(!latestStudyMessage){persistDraft({deadline:value});return;}
    const notice={id:uid('study-plan-stale'),role:'assistant' as const,at:new Date().toISOString(),content:`Срок цели изменён на ${value||'без срока'}. Предыдущий график обучения устарел: его даты и вывод о достижимости больше не действуют. Запроси новое предложение на шаге направлений или действий.`};
    const messages=discussion.messages.map(message=>message.id.startsWith('study-plan')?{...message,content:message.content.replace(/^Принятый план обучения/u,'Архивный план обучения').replace(/^Продолжение плана обучения/u,'Продолжение архивного плана обучения')}:message);
    const next=normalizeGoalDiscussion({...discussion,messages:[...messages,notice]});
    try{assertDiscussionCapacity(next);}catch{setDeadline(deadline);setAiMessage('Память беседы заполнена. Освободи место перед изменением срока принятого плана.');return;}
    setDiscussion(next);persistDraft({deadline:value,assistantDiscussion:next});
  }

  function applySuggestions() {
    if (!suggestion) return;
    if(suggestion.studyPlan){const next=normalizeGoalDiscussion({...discussion,messages:[...discussion.messages,...studyPlanMessages(suggestion.studyPlan)]});try{assertDiscussionCapacity(next);}catch{setAiMessage('Память беседы заполнена. Удали ненужные сообщения или материалы, затем прими план ещё раз.');return;}setDiscussion(next);setStudyPlan(suggestion.studyPlan);persistDraft({assistantDiscussion:next,studyPlan:suggestion.studyPlan});}
    setDirections((current) => {
      const next = current.map((item) => ({ ...item, actions: [...item.actions] }));
      for (const proposal of suggestion.directions) {
        const slot=typeof proposal.slotIndex==='number'?next[proposal.slotIndex]:undefined;
        const match=slot?.title.trim().toLocaleLowerCase()===proposal.title.toLocaleLowerCase()?slot:next.find((item)=>item.title.trim().toLocaleLowerCase()===proposal.title.toLocaleLowerCase());
        if(match){const seen=new Set(match.actions.map(action=>action.trim().toLocaleLowerCase()).filter(Boolean));for(const action of proposal.actions){const normalized=action.trim().toLocaleLowerCase();if(!normalized||seen.has(normalized)||(match.actions.length>=8&&!match.actions.some(existing=>!existing.trim())))continue;const emptyIndex=match.actions.findIndex(existing=>!existing.trim());if(emptyIndex>=0)match.actions[emptyIndex]=action;else match.actions.push(action);seen.add(normalized);}match.actionDetails=normalizeGoalActionDetails([...(match.actionDetails??[]),...(proposal.actionDetails??[])],match.actions);continue;}
        const empty = slot&&!slot.title.trim()?slot:next.find((item) => !item.title.trim());
        const uniqueActions=proposal.actions.filter((action,index,all)=>action.trim()&&all.findIndex(item=>item.trim().toLocaleLowerCase()===action.trim().toLocaleLowerCase())===index).slice(0,8);
        if (empty) { empty.title = proposal.title; empty.actions = uniqueActions;empty.actionDetails=proposal.actionDetails; }
        else if (next.length < 8) next.push({ id: uid(`wizard-direction-${next.length}`), title: proposal.title, actions: uniqueActions,actionDetails:proposal.actionDetails });
      }
      return next;
    });
    setAiMessage('Предложения добавлены без повторов. Твои действия сохранены.');
    setSuggestion(null);
  }

  function acceptMainGoal() {
    const accepted = suggestion;
    invalidateAI();
    if (accepted?.goalTitle?.trim()) setGoalTitle(accepted.goalTitle.trim());
    if (accepted?.desiredResult?.trim()) setDesiredResult(accepted.desiredResult.trim());
    const clarified = clarificationAnswers.some((answer) => answer.trim());
    if (accepted?.directions.length) {
      setDirections((current) => {
        if (current.some((direction) => direction.title.trim())) return current;
        const proposals = accepted.directions.slice(0, clarified ? 1 : 8);
        const next = current.map((direction) => ({ ...direction, actions: [...direction.actions] }));
        for (const proposal of proposals) {
          const empty = next.find((direction) => !direction.title.trim());
          if (empty) { empty.title = proposal.title; empty.actions = proposal.actions.slice(0, 8);empty.actionDetails=proposal.actionDetails; }
          else if (next.length < 8) next.push({ id: uid(`wizard-direction-${next.length}`), title: proposal.title, actions: proposal.actions.slice(0, 8),actionDetails:proposal.actionDetails });
        }
        return next;
      });
    }
    setAiMessage('Формулировка принята. Её можно отредактировать.');
    setStep(1);
  }

  function advance() {
    invalidateAI();
    setStep((value) => Math.min(4, value + 1));
  }

  function goBack() {
    invalidateAI();
    setStep((value) => Math.max(0, value - 1));
  }

  function skipStep() {
    invalidateAI();
    if (step === 4) closeWizard();
    else setStep((value) => Math.min(4, value + 1));
  }

  function save() {
    const chosenDate=deadline.trim();
    if (chosenDate && (!/^\d{4}-\d{2}-\d{2}$/.test(chosenDate) || !Number.isFinite(Date.parse(chosenDate+'T12:00:00Z')) || new Date(chosenDate+'T12:00:00Z').toISOString().slice(0,10)!==chosenDate)) { setStep(4); setAiMessage('Укажите существующую дату в формате ГГГГ-ММ-ДД или оставьте срок пустым.'); return; }
    const normalizedWish = wish.trim();
    if (!normalizedWish) { setStep(0); return; }
    const draft: GoalDraft = { title: goalTitle.trim() || normalizedWish, desiredResult: desiredResult.trim(), deadline: deadline.trim(), priority };
    const goal = createGoal(draft);
    const window = createOpenWindow(goal.id);
    const normalizedDirections = directions.filter((direction) => direction.title.trim()).slice(0, 8);
    const canonicalByDirection = normalizedDirections.map((source) => source.actions.map((rawTitle) => rawTitle.trim()).filter(Boolean).slice(0, 8).map((title, actionIndex) => {const detail=source.actionDetails?.find(item=>item.title===title)??suggestion?.directions.flatMap(item=>item.actionDetails??[]).find(item=>item.title===title);return createGoalAction({ title,shortTitle:detail?.shortTitle,description:detail?.description, studyModuleId:detail?.studyModuleId, estimatedMinutes:detail?.estimatedMinutes, position: actionIndex });}));
    const canonicalActions = canonicalByDirection.flat();
    const linkedDirections: OpenWindowDirection[] = window.directions.map((direction, index) => ({ ...direction, title: normalizedDirections[index]?.title.trim().slice(0, 300) ?? '', actionIds: canonicalByDirection[index]?.map((action) => action.id) ?? [] }));
    const finalGoal: Goal = { ...goal, assistantDiscussion:discussion, actions: canonicalActions, openWindow: { ...window, directions: linkedDirections } };
    let readyGoal:Goal;
    try{readyGoal=studyPlan?applyGoalStudyPlan(finalGoal,studyPlan):finalGoal;}catch(error){setAiMessage(error instanceof Error?error.message:'Не удалось связать учебный план. Черновик сохранён.');return;}
    const saved=onSave(readyGoal);
    if(saved) {
      discardedKey.current = storageKey;
      latestDraft.current = null;
      void draftStorage.removeItem(storageKey).catch(() => undefined);
    }
    closeWizard();
  }

  if (!open) return null;

  return (
    <Modal animationType="none" onRequestClose={closeWizard} transparent visible={open}>
    <View style={styles.overlay}>
      <View accessibilityViewIsModal accessibilityLabel="Мастер создания цели" style={styles.sheet}>
        <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>Новая цель</Text><Text style={styles.subtitle}>Шаг {step + 1} из 5 · {stepLabels[step]}</Text>{userId?<Text numberOfLines={1} ellipsizeMode="tail" accessibilityLiveRegion="polite" style={styles.cloudStatus}>{cloud.status==='synced'?'Черновик синхронизирован':cloud.status==='syncing'?'Синхронизация черновика…':cloud.status==='conflict'?'Есть разные версии черновика':cloud.status==='unavailable'?'Синхронизация недоступна · сохранено на устройстве':cloud.status==='pending'?'Ожидает синхронизации · сохранено на устройстве':'Черновик сохраняется на устройстве'}</Text>:null}</View>{userId?<Pressable accessibilityRole="button" accessibilityLabel="Обновить черновик" onPress={()=>void refreshWizardDraft(userId)} style={styles.refreshButton}><RefreshCw color={accent} size={16} /></Pressable>:null}<Pressable accessibilityRole="button" accessibilityLabel="Закрыть мастер" onPress={closeWizard} style={styles.close}><X color={text} size={18} /></Pressable></View>

        {restoredKey !== storageKey ? <View style={styles.loading}><ActivityIndicator color={accent} /><Text style={styles.loadingText}>Открываю черновик…</Text></View> : cloud.status==='conflict'?<ScrollView contentContainerStyle={styles.body}><Text style={styles.prompt}>Черновик изменился на другом устройстве</Text><Text style={styles.help}>Выбери, какую версию продолжить. Вопросы и ответы не объединяются автоматически; обе версии сохранены.</Text>{cloud.heads.map((revision,index)=><View key={revision.id} style={styles.actionGroup}><Text style={styles.summaryTitle}>{revision.draft?.goalTitle||revision.draft?.wish||'Черновик завершён или удалён'}</Text>{revision.draft?.clarificationQuestions.map((question,i)=><Text key={i} style={styles.help}>{question}{'\n'}{revision.draft?.clarificationAnswers[i]||'Без ответа'}</Text>)}<Pressable accessibilityRole="button" accessibilityLabel={`Продолжить версию ${index+1}`} onPress={()=>{if(userId)void chooseWizardDraft(userId,revision.id).catch(()=>setAiMessage('Не удалось выбрать версию. Попробуй ещё раз.'));}} style={styles.aiButton}><Text style={styles.aiButtonText}>{revision.draft?'Продолжить с этой версией':'Оставить черновик завершённым'}</Text></Pressable></View>)}{!!aiMessage&&<Text accessibilityRole="alert" style={styles.help}>{aiMessage}</Text>}</ScrollView>:<>
        <View style={styles.stepper} accessibilityLabel={`Шаг ${step+1} из 5`}>{Array.from({length:5},(_,index)=><View key={index} style={[styles.stepDot,index<=step&&styles.stepDotActive]}><Text style={[styles.stepNumber,index<=step&&styles.stepNumberActive]}>{index+1}</Text></View>)}</View>
        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator>
          {step === 0 ? <>
            <Text accessibilityRole="header" style={styles.prompt}>Чего ты хочешь?</Text><Text style={styles.help}>Опиши желание своими словами. KODA предложит ясную формулировку цели и желаемый результат.</Text>
            <VoiceTextInput accessibilityLabel="Исходное желание" autoFocus onChangeText={updateWish} placeholder="Например, освоить новую тему или подготовиться к событию" placeholderTextColor={faint} style={styles.input} value={wish} />
            <View style={styles.aiCard}><View style={styles.aiHeader}><Sparkles color={accent} size={17} /><Text style={styles.aiTitle}>Сформулировать главную цель</Text></View>{clarificationQuestions.map((question, index) => <View key={`${question}-${index}`} style={styles.clarificationField}><Text style={styles.clarificationLabel}>{question}</Text><VoiceTextInput accessibilityLabel={`Ответ на вопрос ${index + 1}`} maxLength={400} multiline onChangeText={(value) => updateClarificationAnswer(index, value)} placeholder={index === 1 ? 'Можно пропустить этот вопрос' : 'Твой ответ'} placeholderTextColor={faint} style={[styles.input, styles.clarificationInput]} value={clarificationAnswers[index] ?? ''} /></View>)}<Pressable accessibilityRole="button" disabled={!wish.trim() || aiBusy || (clarificationQuestions.length > 0 && !clarificationAnswers.some((answer) => answer.trim()))} onPress={() => getSuggestions(true, clarificationQuestions.length > 0)} style={[styles.aiButton, (!wish.trim() || aiBusy || (clarificationQuestions.length > 0 && !clarificationAnswers.some((answer) => answer.trim()))) && styles.disabled]}><Text style={styles.aiButtonText}>{aiBusy ? 'Формулирую…' : clarificationQuestions.length ? 'Сформулировать по ответам' : 'Предложить формулировку'}</Text></Pressable>{aiMessage ? <Text accessibilityLiveRegion="polite" style={styles.aiMessage}>{aiMessage}</Text> : null}{suggestion && (!clarificationQuestions.length || clarificationProposalReady) && (suggestion.goalTitle || suggestion.desiredResult) ? <View style={styles.suggestion}><Text style={styles.suggestionTitle}>{suggestion.goalTitle || 'Название не предложено'}</Text><Text style={styles.suggestionLine}>{suggestion.desiredResult || 'Желаемый результат не предложен'}</Text>{suggestion.directions[0]?.actions[0] ? <Text style={styles.suggestionAction}>Первый шаг: {suggestion.directions[0].actions[0]}</Text> : null}<Pressable accessibilityRole="button" onPress={acceptMainGoal} style={styles.applyButton}><Text style={styles.applyText}>Принять и уточнить цель</Text></Pressable></View> : null}</View>
          </> : null}
          {step === 1 ? <>
            <Text accessibilityRole="header" style={styles.prompt}>Уточни цель и желаемый результат</Text><Text style={styles.help}>Исходное желание сохранится отдельно. Название и результат можно написать самому или отредактировать предложение.</Text>
            <VoiceTextInput accessibilityLabel="Название главной цели" autoFocus onChangeText={updateGoalTitle} placeholder="Короткое название цели" placeholderTextColor={faint} style={styles.input} value={goalTitle} />
            <VoiceTextInput accessibilityLabel="Желаемый результат" multiline onChangeText={updateDesiredResult} placeholder="По чему ты поймёшь, что цель достигнута?" placeholderTextColor={faint} style={[styles.input, styles.multiline]} value={desiredResult} />
            <Text style={styles.help}>Если у цели есть срок, укажи его сейчас — планирование сможет учесть время до даты.</Text><DeadlinePicker value={deadline} onChange={changeDeadline} />
          </> : null}
          {step === 2 ? <>
            <Text accessibilityRole="header" style={styles.prompt}>Какие направления помогут прийти к результату?</Text><Text style={styles.help}>Не нужно заполнять все восемь: можно начать с одного направления или без них.</Text>
            {directions.map((direction, index) => <View key={direction.id} style={styles.directionRow}><Text style={styles.directionNumber}>{index + 1}</Text><VoiceTextInput accessibilityLabel={`Направление ${index + 1}`} onChangeText={(title) => updateDirection(direction.id, (item) => ({ ...item, title }))} placeholder={`Например, ${['здоровье', 'обучение', 'портфолио', 'поиск работы'][index % 4]}`} placeholderTextColor={faint} style={styles.directionInput} value={direction.title} /><Pressable accessibilityRole="button" accessibilityLabel={`Удалить направление ${index + 1}`} onPress={() => { invalidateAI(); setDirections((items) => items.filter((item) => item.id !== direction.id)); }} style={styles.actionRemove}><X color={muted} size={15} /></Pressable></View>)}
            {directions.length < 8 ? <Pressable accessibilityRole="button" onPress={addDirection} style={styles.addDirection}><Plus color={accent} size={16} /><Text style={styles.addDirectionText}>Добавить направление</Text></Pressable> : null}
          </> : null}
          {step === 3 ? <>
            <Text accessibilityRole="header" style={styles.prompt}>Какие первые действия помогут?</Text><Text style={styles.help}>Составь план с KODA по цели, беседе и материалам или добавь шаги вручную.</Text>
            {directions.filter((item) => item.title.trim()).length ? directions.filter((item) => item.title.trim()).map((direction) => <View key={direction.id} style={styles.actionGroup}><Text style={styles.actionGroupTitle}>{direction.title}</Text>{direction.actions.map((action, index) => <View key={`${direction.id}-${index}`} style={styles.actionInputRow}><VoiceTextInput accessibilityLabel={`Действие ${index + 1} для ${direction.title}`} onChangeText={(value) => updateDirection(direction.id, (item) => ({ ...item, actions: item.actions.map((candidate, candidateIndex) => candidateIndex === index ? value : candidate) }))} placeholder="Короткий следующий шаг" placeholderTextColor={faint} style={styles.actionInput} value={action} />{direction.actions.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel="Удалить действие из черновика" onPress={() => updateDirection(direction.id, (item) => ({ ...item, actions: item.actions.filter((_, actionIndex) => actionIndex !== index) }))} style={styles.actionRemove}><X color={muted} size={15} /></Pressable> : null}</View>)}{direction.actions.length < 8 ? <Pressable accessibilityRole="button" onPress={() => addAction(direction)} style={styles.addAction}><Plus color={accent} size={14} /><Text style={styles.addDirectionText}>Добавить действие</Text></Pressable> : null}</View>) : <Text style={styles.help}>Направлений пока нет. Их можно создать позже внутри цели.</Text>}
          </> : null}
          {step === 4 ? <>
            <Text accessibilityRole="header" style={styles.prompt}>Какой приоритет и срок подойдут сейчас?</Text><Text style={styles.help}>Оба поля можно изменить позже.</Text>{aiMessage?<Text accessibilityLiveRegion="polite" style={styles.help}>{aiMessage}</Text>:null}{studyPlan?<StudyPlanSummary plan={studyPlan}/>:null}
            <View style={styles.priorityRow}>{priorities.map((item) => <Pressable key={item.value} {...webSpaceActivationProps(() => setPriority(item.value))} accessibilityRole="radio" aria-checked={priority === item.value} accessibilityState={{ checked: priority === item.value }} onPress={() => setPriority(item.value)} style={[styles.priority, priority === item.value && styles.priorityActive]}><Text style={[styles.priorityText, priority === item.value && styles.priorityTextActive]}>{item.label}</Text></Pressable>)}</View>
            {aiMessage.includes('дату')?<Text accessibilityRole="alert" style={styles.help}>{aiMessage}</Text>:null}<Text style={styles.help}>Срок необязателен.</Text><DeadlinePicker value={deadline} onChange={changeDeadline} />
            <View style={styles.summary}><Text style={styles.summaryTitle}>{goalTitle || wish || 'Цель без названия'}</Text>{desiredResult ? <Text style={styles.help}>{desiredResult}</Text> : null}<Text style={styles.summaryMeta}>{directions.filter((item) => item.title.trim()).length} направлений · {directions.reduce((sum, item) => sum + item.actions.filter((action) => action.trim()).length, 0)} действий</Text></View>
          </> : null}
          {(step===2||step===3)?<View style={styles.sharedAi}>
            <GoalDiscussion key={storageKey} userId={userId} title={goalTitle||wish} desiredResult={desiredResult} planningContext={JSON.stringify({studyPlan:studyPlanContext(studyPlan),deadline,directions:directions.map(({title,actions})=>({title,actions}))})} value={discussion} onChange={recipe=>{invalidateAI();const next=recipe(normalizeGoalDiscussion(latestDraft.current?.value.assistantDiscussion??discussion));setDiscussion(next);persistDraft({assistantDiscussion:next});}} onSuggest={()=>void getSuggestions()} hideSuggest disabled={aiBusy}/>
            <View style={styles.aiCard}><View style={styles.aiHeader}><Sparkles color={accent} size={17}/><Text style={styles.aiTitle}>План по цели, беседе и материалам</Text></View><Pressable accessibilityRole="button" disabled={!goalTitle.trim()||aiBusy} onPress={()=>getSuggestions()} style={[styles.aiButton,(!goalTitle.trim()||aiBusy)&&styles.disabled]}><Text style={styles.aiButtonText}>{aiBusy?'Составляю план…':suggestion?'Пересоставить план':'Составить план'}</Text></Pressable>{aiMessage?<Text accessibilityLiveRegion="polite" style={styles.aiMessage}>{aiMessage}</Text>:null}{suggestion?.planningNote?<Text style={styles.help}>{suggestion.planningNote}</Text>:null}{suggestion?.clarificationQuestions?.length?<View style={styles.pendingQuestions}><Text style={styles.aiTitle}>Нужно уточнить перед применением:</Text>{suggestion.clarificationQuestions.map((question,index)=><Text key={`q${index}`} style={styles.help}>• {question}</Text>)}</View>:null}{suggestion?.studyPlan?<StudyPlanPreview plan={suggestion.studyPlan}/>:null}{suggestion?.directions.length?<View style={styles.suggestion}><Text style={styles.suggestionTitle}>Направления и первые шаги</Text>{suggestion.directions.map((item,index)=><View key={`${item.title}-${index}`} style={styles.suggestionGroup}><Text style={styles.suggestionLine}>{item.title}</Text>{item.actions.map((action,actionIndex)=>{const detail=item.actionDetails?.find(candidate=>candidate.title===action);return <View key={`${action}-${actionIndex}`}><Text style={styles.suggestionAction}>• {action}</Text>{detail?.description?<Text style={styles.help}>{detail.shortTitle}: {detail.description}</Text>:null}</View>})}</View>)}<Text style={styles.help}>Пока только в черновик. Цель сохранится на последнем шаге.</Text><Pressable accessibilityRole="button" onPress={applySuggestions} style={styles.applyButton}><Text style={styles.applyText}>Добавить в цель</Text></Pressable></View>:suggestion?.studyPlan?<><Text style={styles.help}>Пока только в черновик. Цель сохранится на последнем шаге.</Text><Pressable accessibilityRole="button" onPress={applySuggestions} style={styles.applyButton}><Text style={styles.applyText}>Добавить в цель</Text></Pressable></>:null}</View>
          </View>:null}
          {studyScheduleStale?<View style={styles.pendingQuestions}><Text accessibilityRole="alert" style={styles.help}>Срок изменился. Прежний график больше не актуален — запроси новый на шаге направлений или действий.</Text><Pressable accessibilityRole="button" onPress={()=>{invalidateAI();setStep(2);}} style={styles.applyButton}><Text style={styles.applyText}>Пересчитать план с KODA</Text></Pressable></View>:null}
          {step > 0 && step !== 2 && step !== 3 ? <Pressable accessibilityRole="button" onPress={skipStep} style={styles.skip}><Text style={styles.skipText}>{step === 4 ? 'Продолжить позже · черновик сохранён' : 'Пропустить этот шаг'}</Text></Pressable> : null}
          <Text style={styles.draftNote}>Черновик сохраняется на этом устройстве{userId ? ' для текущего аккаунта' : ''}.</Text>
        </ScrollView>
        <View style={styles.footer}>{step>0?<Pressable accessibilityRole="button" onPress={goBack} style={styles.secondary}><Text style={styles.secondaryText}>Назад</Text></Pressable>:null}<Pressable accessibilityRole="button" onPress={()=>step===4?save():advance()} disabled={step===0&&!wish.trim()} style={[styles.primary,step===0&&!wish.trim()&&styles.disabled]}><Text style={styles.primaryText}>{step===4?'Создать цель':suggestion&&(step===2||step===3)?'Продолжить без предложений':step===2&&!directions.some(item=>item.title.trim())?'Продолжить без направлений':step===3&&!directions.some(item=>item.actions.some(action=>action.trim()))?'Продолжить без плана':step===2?'К действиям':'Продолжить'}</Text></Pressable></View>
        </>}
      </View>
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.58)', flex: 1, justifyContent: 'center', padding: 14 }, sheet: { backgroundColor: panelSoft, borderColor: line, borderRadius: 30, borderWidth: 1, overflow: 'hidden', gap: 4, maxHeight: '92%', maxWidth: 720, minHeight: 0, flexShrink: 1, width: '100%' }, header: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 9 }, headerCopy: { gap: 3, flex: 1, minWidth: 0 }, title: { color: text, fontSize: 24, fontWeight: '700' }, subtitle: { color: muted, fontSize: 11 }, close: { alignItems: 'center', borderColor: line, borderRadius: 99, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, cloudRow: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingLeft: 16, paddingRight: 10 }, cloudStatus: { color: muted, fontSize: 10, lineHeight: 14 }, refreshButton: { alignItems: 'center', borderColor: line, borderRadius: 99, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, stepper: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 5 }, stepDot: { width: 30, height: 30, borderRadius: 15, backgroundColor: panel, alignItems: 'center', justifyContent: 'center' }, stepDotActive: { backgroundColor: activeBg }, stepNumber: { fontSize: 12, color: muted, fontWeight: '700' }, stepNumberActive: { color: activeText }, scroll: { flexShrink: 1, minHeight: 0 }, sharedAi: { gap: 8, paddingTop: 4 }, pendingQuestions:{backgroundColor:panel,borderColor:line,borderWidth:1,borderRadius:10,padding:9,gap:4}, footer: { backgroundColor: panelSoft, borderTopColor: line, borderTopWidth: 1, flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingTop: 9, paddingBottom: 12 }, body: { gap: 12, paddingHorizontal: 16, paddingTop: 7, paddingBottom: 18 }, loading: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 200 }, loadingText: { color: muted, fontSize: 12 }, prompt: { color: text, fontSize: 20, fontWeight: '700', lineHeight: 26 }, help: { color: muted, fontSize: 13, lineHeight: 19 }, input: { backgroundColor: panel, borderColor: line, borderRadius: 16, borderWidth: 1, color: text, fontSize: 15, minHeight: 48, paddingHorizontal: 12 }, multiline: { minHeight: 96, paddingVertical: 11, textAlignVertical: 'top' }, clarificationField: { gap: 5 }, clarificationLabel: { color: text, fontSize: 12, fontWeight: '600', lineHeight: 18 }, clarificationInput: { minHeight: 72, paddingVertical: 9, textAlignVertical: 'top' }, directionRow: { alignItems: 'center', flexDirection: 'row', gap: 8, padding: 8, backgroundColor: panel, borderRadius: 22 }, directionNumber: { color: accent, fontSize: 12, fontWeight: '700', width: 20 }, directionInput: { backgroundColor: panel, borderColor: line, borderRadius: 10, borderWidth: 1, color: text, flex: 1, fontSize: 13, minHeight: 44, paddingHorizontal: 10 }, addDirection: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 44 }, addDirectionText: { color: accent, fontSize: 12 }, aiCard: { backgroundColor: accentFaint, borderColor: accentBorder, borderRadius: 24, borderWidth: 1, gap: 7, padding: 11 }, aiHeader: { alignItems: 'center', flexDirection: 'row', gap: 6 }, aiTitle: { color: text, flex: 1, fontSize: 12, fontWeight: '600' }, aiButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 46, paddingHorizontal: 12 }, aiButtonText: { color: activeText, fontSize: 12, fontWeight: '700' }, aiMessage: { color: muted, fontSize: 11, lineHeight: 16 }, suggestion: { backgroundColor: panel, borderColor: line, borderRadius: 10, borderWidth: 1, gap: 4, padding: 9 }, suggestionTitle: { color: text, fontSize: 12, fontWeight: '700' }, suggestionLine: { color: muted, fontSize: 11, lineHeight: 16 }, suggestionGroup: { borderTopColor: line, borderTopWidth: 1, gap: 3, paddingTop: 5 }, suggestionAction: { color: muted, fontSize: 11, lineHeight: 16, paddingLeft: 8 }, applyButton: { alignItems: 'center', backgroundColor: accentFaint, borderRadius: 8, justifyContent: 'center', marginTop: 5, minHeight: 42, paddingHorizontal: 8 }, applyText: { color: accent, fontSize: 11, fontWeight: '700' }, actionGroup: { backgroundColor: panel, borderColor: line, borderWidth: 1, borderRadius: 24, gap: 10, padding: 14 }, actionGroupTitle: { color: accent, fontSize: 15, fontWeight: '700' }, actionInputRow: { alignItems: 'center', flexDirection: 'row', gap: 4 }, actionInput: { backgroundColor: panelSoft, borderColor: line, borderRadius: 9, borderWidth: 1, color: text, flex: 1, fontSize: 14, minHeight: 44, paddingHorizontal: 9 }, actionRemove: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 }, addAction: { alignSelf: 'flex-start', backgroundColor: accentFaint, borderRadius: 99, paddingHorizontal: 12, alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 44 }, priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, priority: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, flexGrow: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 }, priorityActive: { backgroundColor: activeBg, borderColor: activeBg }, priorityText: { color: muted, fontSize: 12 }, priorityTextActive: { color: activeText, fontWeight: '700' }, summary: { backgroundColor: accentFaint, borderColor: accentBorder, borderRadius: 18, borderWidth: 1, gap: 5, padding: 11 }, summaryTitle: { color: text, fontSize: 14, fontWeight: '700' }, summaryMeta: { color: accent, fontSize: 11 }, actions: { flexDirection: 'row', gap: 8, paddingTop: 4 }, secondary: { alignItems: 'center', borderColor: line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 14 }, secondaryText: { color: text, fontSize: 12 }, primary: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 }, primaryText: { color: activeText, fontSize: 14, fontWeight: '700' }, disabled: { opacity: 0.5 }, skip: { alignItems: 'center', justifyContent: 'center', minHeight: 44 }, skipText: { color: accent, fontSize: 12 }, draftNote: { color: faint, fontSize: 10, textAlign: 'center' },
});
