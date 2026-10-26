import { webSpaceActivationProps } from './keyboard';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Plus, Sparkles, X } from 'lucide-react-native';
import { createGoal, createGoalAction, type GoalDraft } from '../goalLogic';
import { createOpenWindow } from '../openWindow';
import type { Goal, GoalPriority, OpenWindowDirection } from '../types';
import { uid } from '../utils';
import { createWizardDraftStorage, restoreWizardClarifications, type WizardClarifications } from '../wizardDraft';
import {cloudWizardDraftStorage,watchWizardDraft,refreshWizardDraft,chooseWizardDraft,type WizardCloudStatus} from '../wizardDraftCloud';
import { requestGoalPlan } from '../../../services/kodaApi';
import { accent, accentBorder, accentFaint, activeBg, activeText, faint, line, muted, panel, panelSoft, text } from '../theme';

type PlanSuggestion = { goalTitle?: string; desiredResult: string; clarificationQuestions?: string[]; directions: Array<{ title: string; actions: string[] }> };
type WizardDirection = { id: string; title: string; actions: string[] };
type StoredDraft = { version: 1; step: number; wish: string; goalTitle?: string; desiredResult: string; deadline: string; priority: GoalPriority; directions: WizardDirection[] } & WizardClarifications;
type Props = { open: boolean; userId?: string | null; onClose: () => void; onSave: (goal: Goal) => boolean };
const draftStorage = createWizardDraftStorage(cloudWizardDraftStorage);
export function removeGoalWizardDraft(key:string){return draftStorage.removeItem(key);}

const priorities: Array<{ value: GoalPriority; label: string }> = [
  { value: 'main', label: 'Главная' },
  { value: 'important', label: 'Важная' },
  { value: 'supporting', label: 'Поддерживающая' },
];

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
    };
  });
}

export function GoalWizard({ open, userId, onClose, onSave }: Props) {
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
    setWish('');
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
    latestDraft.current = { key: storageKey, value: { version: 1, step, wish, goalTitle, desiredResult, deadline, priority, directions, clarificationQuestions, clarificationAnswers } };
    persistDraft();
  }, [open, restoredKey, storageKey, step, wish, goalTitle, desiredResult, deadline, priority, directions, clarificationQuestions, clarificationAnswers]);

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
    setDirections((items) => items.map((item) => item.id === id ? recipe(item) : item));
  }

  function addDirection() {
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
      const result = await requestGoalPlan({ wish: goalPlanWish, desiredResult: forMainGoal ? undefined : desiredResult.trim() || undefined, ...(forMainGoal ? { clarifyGoal: true, ...(answerClarifications ? { clarifications: answeredQuestions } : {}) } : {}) });
      if (requestId !== aiRequestId.current) return;
      const validDirections = (result.directions ?? []).slice(0, 8).map((direction) => ({ title: String(direction.title ?? '').trim().slice(0, 300), actions: (direction.actions ?? []).map((action) => String(action).trim()).filter(Boolean).slice(0, 8) })).filter((direction) => direction.title);
      const questions = (result.clarificationQuestions ?? []).map((question) => String(question).trim().slice(0, 300)).filter(Boolean).slice(0, 2);
      const proposal = { goalTitle: String(result.goalTitle ?? '').trim().slice(0, 300), desiredResult: String(result.desiredResult ?? '').trim(), directions: validDirections };
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
    } catch {
      if (requestId !== aiRequestId.current) return;
      setAiMessage('Подсказка сейчас недоступна. Продолжи вручную — черновик сохранён.');
    } finally { if (requestId === aiRequestId.current) setAiBusy(false); }
  }

  function applySuggestions() {
    if (!suggestion) return;
    setDirections((current) => {
      const next = current.map((item) => ({ ...item, actions: [...item.actions] }));
      for (const proposal of suggestion.directions) {
        if (next.some((item) => item.title.trim().toLocaleLowerCase() === proposal.title.toLocaleLowerCase())) continue;
        const empty = next.find((item) => !item.title.trim());
        if (empty) { empty.title = proposal.title; empty.actions = proposal.actions.slice(0, 8); }
        else if (next.length < 8) next.push({ id: uid(`wizard-direction-${next.length}`), title: proposal.title, actions: proposal.actions.slice(0, 8) });
      }
      return next;
    });
    setAiMessage('Выбранные предложения добавлены. Заполненные направления остались без изменений.');
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
          if (empty) { empty.title = proposal.title; empty.actions = proposal.actions.slice(0, 8); }
          else if (next.length < 8) next.push({ id: uid(`wizard-direction-${next.length}`), title: proposal.title, actions: proposal.actions.slice(0, 8) });
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
    const canonicalByDirection = normalizedDirections.map((source) => source.actions.map((title) => title.trim()).filter(Boolean).slice(0, 8).map((title, actionIndex) => createGoalAction({ title, position: actionIndex })));
    const canonicalActions = canonicalByDirection.flat();
    const linkedDirections: OpenWindowDirection[] = window.directions.map((direction, index) => ({ ...direction, title: normalizedDirections[index]?.title.trim().slice(0, 300) ?? '', actionIds: canonicalByDirection[index]?.map((action) => action.id) ?? [] }));
    const finalGoal: Goal = { ...goal, actions: canonicalActions, openWindow: { ...window, directions: linkedDirections } };
    const saved=onSave(finalGoal);
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
        <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>Новая цель</Text><Text style={styles.subtitle}>Шаг {step + 1} из 5 · можно пропустить детали</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Закрыть мастер" onPress={closeWizard} style={styles.close}><X color={text} size={18} /></Pressable></View>
        {userId?<View style={{paddingHorizontal:16,gap:4}}><Text accessibilityLiveRegion="polite" style={styles.help}>{cloud.status==='synced'?'Черновик синхронизирован':cloud.status==='syncing'?'Синхронизирую черновик…':cloud.status==='conflict'?'Есть разные версии черновика':cloud.status==='unavailable'?'Сохранено на устройстве. Синхронизация пока недоступна.':cloud.status==='pending'?'Сохранено на устройстве. Ожидает синхронизации.':'Черновик сохраняется на устройстве'}</Text><Pressable accessibilityRole="button" onPress={()=>void refreshWizardDraft(userId)} style={{minHeight:44,justifyContent:'center'}}><Text style={styles.addDirectionText}>Обновить черновик</Text></Pressable></View>:null}
        {restoredKey !== storageKey ? <View style={styles.loading}><ActivityIndicator color={accent} /><Text style={styles.loadingText}>Открываю черновик…</Text></View> : cloud.status==='conflict'?<ScrollView contentContainerStyle={styles.body}><Text style={styles.prompt}>Черновик изменился на другом устройстве</Text><Text style={styles.help}>Выбери, какую версию продолжить. Вопросы и ответы не объединяются автоматически; обе версии сохранены.</Text>{cloud.heads.map((revision,index)=><View key={revision.id} style={styles.actionGroup}><Text style={styles.summaryTitle}>{revision.draft?.goalTitle||revision.draft?.wish||'Черновик завершён или удалён'}</Text>{revision.draft?.clarificationQuestions.map((question,i)=><Text key={i} style={styles.help}>{question}{'\n'}{revision.draft?.clarificationAnswers[i]||'Без ответа'}</Text>)}<Pressable accessibilityRole="button" accessibilityLabel={`Продолжить версию ${index+1}`} onPress={()=>{if(userId)void chooseWizardDraft(userId,revision.id).catch(()=>setAiMessage('Не удалось выбрать версию. Попробуй ещё раз.'));}} style={styles.aiButton}><Text style={styles.aiButtonText}>{revision.draft?'Продолжить с этой версией':'Оставить черновик завершённым'}</Text></Pressable></View>)}{!!aiMessage&&<Text accessibilityRole="alert" style={styles.help}>{aiMessage}</Text>}</ScrollView>:<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} showsVerticalScrollIndicator>
          {step === 0 ? <>
            <Text style={styles.prompt}>Чего ты хочешь?</Text><Text style={styles.help}>Опиши желание своими словами. KODA предложит ясную формулировку цели и желаемый результат.</Text>
            <TextInput accessibilityLabel="Исходное желание" autoFocus onChangeText={updateWish} placeholder="Например, перейти в аналитику данных" placeholderTextColor={faint} style={styles.input} value={wish} />
            <View style={styles.aiCard}><View style={styles.aiHeader}><Sparkles color={accent} size={17} /><Text style={styles.aiTitle}>Сформулировать главную цель</Text></View>{clarificationQuestions.map((question, index) => <View key={`${question}-${index}`} style={styles.clarificationField}><Text style={styles.clarificationLabel}>{question}</Text><TextInput accessibilityLabel={`Ответ на вопрос ${index + 1}`} maxLength={400} multiline onChangeText={(value) => updateClarificationAnswer(index, value)} placeholder={index === 1 ? 'Можно пропустить этот вопрос' : 'Твой ответ'} placeholderTextColor={faint} style={[styles.input, styles.clarificationInput]} value={clarificationAnswers[index] ?? ''} /></View>)}<Pressable accessibilityRole="button" disabled={!wish.trim() || aiBusy || (clarificationQuestions.length > 0 && !clarificationAnswers.some((answer) => answer.trim()))} onPress={() => getSuggestions(true, clarificationQuestions.length > 0)} style={[styles.aiButton, (!wish.trim() || aiBusy || (clarificationQuestions.length > 0 && !clarificationAnswers.some((answer) => answer.trim()))) && styles.disabled]}><Text style={styles.aiButtonText}>{aiBusy ? 'Формулирую…' : clarificationQuestions.length ? 'Сформулировать по ответам' : 'Предложить формулировку'}</Text></Pressable>{aiMessage ? <Text accessibilityLiveRegion="polite" style={styles.aiMessage}>{aiMessage}</Text> : null}{suggestion && (!clarificationQuestions.length || clarificationProposalReady) ? <View style={styles.suggestion}><Text style={styles.suggestionTitle}>{suggestion.goalTitle || 'Название не предложено'}</Text><Text style={styles.suggestionLine}>{suggestion.desiredResult || 'Желаемый результат не предложен'}</Text>{suggestion.directions[0]?.actions[0] ? <Text style={styles.suggestionAction}>Первый шаг: {suggestion.directions[0].actions[0]}</Text> : null}<Pressable accessibilityRole="button" disabled={!suggestion.goalTitle && !suggestion.desiredResult} onPress={acceptMainGoal} style={[styles.applyButton, !suggestion.goalTitle && !suggestion.desiredResult && styles.disabled]}><Text style={styles.applyText}>Принять и уточнить цель</Text></Pressable></View> : null}</View>
          </> : null}
          {step === 1 ? <>
            <Text style={styles.prompt}>Уточни цель и желаемый результат</Text><Text style={styles.help}>Исходное желание сохранится отдельно. Название и результат можно написать самому или отредактировать предложение.</Text>
            <TextInput accessibilityLabel="Название главной цели" autoFocus onChangeText={updateGoalTitle} placeholder="Например, перейти в аналитику данных" placeholderTextColor={faint} style={styles.input} value={goalTitle} />
            <TextInput accessibilityLabel="Желаемый результат" multiline onChangeText={updateDesiredResult} placeholder="Например, получить оффер на позицию аналитика до конца года" placeholderTextColor={faint} style={[styles.input, styles.multiline]} value={desiredResult} />
          </> : null}
          {step === 2 ? <>
            <Text style={styles.prompt}>Какие направления помогут прийти к результату?</Text><Text style={styles.help}>Не нужно заполнять все восемь: можно начать с одного направления или без них.</Text>
            {directions.map((direction, index) => <View key={direction.id} style={styles.directionRow}><Text style={styles.directionNumber}>{index + 1}</Text><TextInput accessibilityLabel={`Направление ${index + 1}`} onChangeText={(title) => updateDirection(direction.id, (item) => ({ ...item, title }))} placeholder={`Например, ${['здоровье', 'обучение', 'портфолио', 'поиск работы'][index % 4]}`} placeholderTextColor={faint} style={styles.directionInput} value={direction.title} /><Pressable accessibilityRole="button" accessibilityLabel={`Удалить направление ${index + 1}`} onPress={() => setDirections((items) => items.filter((item) => item.id !== direction.id))} style={styles.actionRemove}><X color={muted} size={15} /></Pressable></View>)}
            {directions.length < 8 ? <Pressable accessibilityRole="button" onPress={addDirection} style={styles.addDirection}><Plus color={accent} size={16} /><Text style={styles.addDirectionText}>Добавить направление</Text></Pressable> : null}
            <View style={styles.aiCard}><View style={styles.aiHeader}><Sparkles color={accent} size={17} /><Text style={styles.aiTitle}>Можно попросить KODA предложить структуру</Text></View><Text style={styles.help}>Предложения попадут в черновик только после твоего подтверждения.</Text><Pressable accessibilityRole="button" disabled={!goalTitle.trim() || aiBusy} onPress={() => getSuggestions()} style={[styles.aiButton, (!goalTitle.trim() || aiBusy) && styles.disabled]}><Text style={styles.aiButtonText}>{aiBusy ? 'Подбираю…' : 'Предложить направления и действия'}</Text></Pressable>{aiMessage ? <Text accessibilityLiveRegion="polite" style={styles.aiMessage}>{aiMessage}</Text> : null}{suggestion ? <View style={styles.suggestion}><Text style={styles.suggestionTitle}>Направления и первые шаги</Text>{suggestion.directions.map((item, index) => <View key={`${item.title}-${index}`} style={styles.suggestionGroup}><Text style={styles.suggestionLine}>{item.title}</Text>{item.actions.map((action, actionIndex) => <Text key={`${action}-${actionIndex}`} style={styles.suggestionAction}>• {action}</Text>)}</View>)}<Pressable accessibilityRole="button" disabled={!suggestion.directions.length} onPress={applySuggestions} style={[styles.applyButton, !suggestion.directions.length && styles.disabled]}><Text style={styles.applyText}>Добавить предложения в черновик</Text></Pressable></View> : null}</View>
          </> : null}
          {step === 3 ? <>
            <Text style={styles.prompt}>Какие первые действия помогут?</Text><Text style={styles.help}>Добавляй только понятные следующие шаги. В каждом направлении до восьми действий.</Text>
            {directions.filter((item) => item.title.trim()).length ? directions.filter((item) => item.title.trim()).map((direction) => <View key={direction.id} style={styles.actionGroup}><Text style={styles.actionGroupTitle}>{direction.title}</Text>{direction.actions.map((action, index) => <View key={`${direction.id}-${index}`} style={styles.actionInputRow}><TextInput accessibilityLabel={`Действие ${index + 1} для ${direction.title}`} onChangeText={(value) => updateDirection(direction.id, (item) => ({ ...item, actions: item.actions.map((candidate, candidateIndex) => candidateIndex === index ? value : candidate) }))} placeholder="Короткий следующий шаг" placeholderTextColor={faint} style={styles.actionInput} value={action} />{direction.actions.length > 1 ? <Pressable accessibilityRole="button" accessibilityLabel="Удалить действие из черновика" onPress={() => updateDirection(direction.id, (item) => ({ ...item, actions: item.actions.filter((_, actionIndex) => actionIndex !== index) }))} style={styles.actionRemove}><X color={muted} size={15} /></Pressable> : null}</View>)}{direction.actions.length < 8 ? <Pressable accessibilityRole="button" onPress={() => addAction(direction)} style={styles.addAction}><Plus color={accent} size={14} /><Text style={styles.addDirectionText}>Добавить действие</Text></Pressable> : null}</View>) : <Text style={styles.help}>Направлений пока нет. Их можно создать позже внутри цели.</Text>}
          </> : null}
          {step === 4 ? <>
            <Text style={styles.prompt}>Какой приоритет и срок подойдут сейчас?</Text><Text style={styles.help}>Оба поля можно изменить позже.</Text>
            <View style={styles.priorityRow}>{priorities.map((item) => <Pressable key={item.value} {...webSpaceActivationProps(() => setPriority(item.value))} accessibilityRole="radio" aria-checked={priority === item.value} accessibilityState={{ checked: priority === item.value }} onPress={() => setPriority(item.value)} style={[styles.priority, priority === item.value && styles.priorityActive]}><Text style={[styles.priorityText, priority === item.value && styles.priorityTextActive]}>{item.label}</Text></Pressable>)}</View>
            {aiMessage.includes('дату')?<Text accessibilityRole="alert" style={styles.help}>{aiMessage}</Text>:null}<TextInput accessibilityLabel="Срок цели, необязательно" inputMode="text" onChangeText={setDeadline} placeholder="Срок, например 2027-03-01 · необязательно" placeholderTextColor={faint} style={styles.input} value={deadline} />
            <View style={styles.summary}><Text style={styles.summaryTitle}>{goalTitle || wish || 'Цель без названия'}</Text>{desiredResult ? <Text style={styles.help}>{desiredResult}</Text> : null}<Text style={styles.summaryMeta}>{directions.filter((item) => item.title.trim()).length} направлений · {directions.reduce((sum, item) => sum + item.actions.filter((action) => action.trim()).length, 0)} действий</Text></View>
          </> : null}
          <View style={styles.actions}>{step > 0 ? <Pressable accessibilityRole="button" onPress={goBack} style={styles.secondary}><Text style={styles.secondaryText}>Назад</Text></Pressable> : null}<Pressable accessibilityRole="button" onPress={() => step === 4 ? save() : advance()} disabled={step === 0 && !wish.trim()} style={[styles.primary, step === 0 && !wish.trim() && styles.disabled]}><Text style={styles.primaryText}>{step === 4 ? 'Создать цель' : 'Дальше'}</Text></Pressable></View>
          {step > 0 ? <Pressable accessibilityRole="button" onPress={skipStep} style={styles.skip}><Text style={styles.skipText}>{step === 4 ? 'Продолжить позже · черновик сохранён' : 'Пропустить этот шаг'}</Text></Pressable> : null}
          <Text style={styles.draftNote}>Черновик сохраняется на этом устройстве{userId ? ' для текущего аккаунта' : ''}.</Text>
        </ScrollView>}
      </View>
    </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.58)', flex: 1, justifyContent: 'center', padding: 14 }, sheet: { backgroundColor: panelSoft, borderColor: line, borderRadius: 16, borderWidth: 1, gap: 10, maxHeight: '92%', maxWidth: 620, width: '100%' }, header: { alignItems: 'center', borderBottomColor: line, borderBottomWidth: 1, flexDirection: 'row', gap: 8, justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12 }, headerCopy: { gap: 3 }, title: { color: text, fontSize: 19, fontWeight: '700' }, subtitle: { color: muted, fontSize: 11 }, close: { alignItems: 'center', borderColor: line, borderRadius: 99, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 }, body: { gap: 10, padding: 16, paddingBottom: 22 }, loading: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 200 }, loadingText: { color: muted, fontSize: 12 }, prompt: { color: text, fontSize: 17, fontWeight: '600', lineHeight: 23 }, help: { color: muted, fontSize: 12, lineHeight: 18 }, input: { backgroundColor: panel, borderColor: line, borderRadius: 12, borderWidth: 1, color: text, fontSize: 15, minHeight: 48, paddingHorizontal: 12 }, multiline: { minHeight: 96, paddingVertical: 11, textAlignVertical: 'top' }, clarificationField: { gap: 5 }, clarificationLabel: { color: text, fontSize: 12, fontWeight: '600', lineHeight: 18 }, clarificationInput: { minHeight: 72, paddingVertical: 9, textAlignVertical: 'top' }, directionRow: { alignItems: 'center', flexDirection: 'row', gap: 8 }, directionNumber: { color: accent, fontSize: 12, fontWeight: '700', width: 20 }, directionInput: { backgroundColor: panel, borderColor: line, borderRadius: 10, borderWidth: 1, color: text, flex: 1, fontSize: 13, minHeight: 44, paddingHorizontal: 10 }, addDirection: { alignItems: 'center', flexDirection: 'row', gap: 6, minHeight: 44 }, addDirectionText: { color: accent, fontSize: 12 }, aiCard: { backgroundColor: accentFaint, borderColor: accentBorder, borderRadius: 18, borderWidth: 1, gap: 7, padding: 11 }, aiHeader: { alignItems: 'center', flexDirection: 'row', gap: 6 }, aiTitle: { color: text, flex: 1, fontSize: 12, fontWeight: '600' }, aiButton: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, justifyContent: 'center', minHeight: 46, paddingHorizontal: 12 }, aiButtonText: { color: activeText, fontSize: 12, fontWeight: '700' }, aiMessage: { color: muted, fontSize: 11, lineHeight: 16 }, suggestion: { backgroundColor: panel, borderColor: line, borderRadius: 10, borderWidth: 1, gap: 4, padding: 9 }, suggestionTitle: { color: text, fontSize: 12, fontWeight: '700' }, suggestionLine: { color: muted, fontSize: 11, lineHeight: 16 }, suggestionGroup: { borderTopColor: line, borderTopWidth: 1, gap: 3, paddingTop: 5 }, suggestionAction: { color: muted, fontSize: 11, lineHeight: 16, paddingLeft: 8 }, applyButton: { alignItems: 'center', backgroundColor: accentFaint, borderRadius: 8, justifyContent: 'center', marginTop: 5, minHeight: 42, paddingHorizontal: 8 }, applyText: { color: accent, fontSize: 11, fontWeight: '700' }, actionGroup: { borderTopColor: line, borderTopWidth: 1, gap: 6, paddingTop: 8 }, actionGroupTitle: { color: accent, fontSize: 13, fontWeight: '700' }, actionInputRow: { alignItems: 'center', flexDirection: 'row', gap: 4 }, actionInput: { backgroundColor: panel, borderColor: line, borderRadius: 9, borderWidth: 1, color: text, flex: 1, fontSize: 12, minHeight: 42, paddingHorizontal: 9 }, actionRemove: { alignItems: 'center', height: 40, justifyContent: 'center', width: 40 }, addAction: { alignItems: 'center', flexDirection: 'row', gap: 4, minHeight: 40 }, priorityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, priority: { alignItems: 'center', borderColor: line, borderRadius: 999, borderWidth: 1, flexGrow: 1, justifyContent: 'center', minHeight: 44, paddingHorizontal: 10 }, priorityActive: { backgroundColor: activeBg, borderColor: activeBg }, priorityText: { color: muted, fontSize: 12 }, priorityTextActive: { color: activeText, fontWeight: '700' }, summary: { backgroundColor: accentFaint, borderColor: accentBorder, borderRadius: 18, borderWidth: 1, gap: 5, padding: 11 }, summaryTitle: { color: text, fontSize: 14, fontWeight: '700' }, summaryMeta: { color: accent, fontSize: 11 }, actions: { flexDirection: 'row', gap: 8, paddingTop: 4 }, secondary: { alignItems: 'center', borderColor: line, borderRadius: 10, borderWidth: 1, justifyContent: 'center', minHeight: 46, paddingHorizontal: 14 }, secondaryText: { color: text, fontSize: 12 }, primary: { alignItems: 'center', backgroundColor: activeBg, borderRadius: 16, flex: 1, justifyContent: 'center', minHeight: 48, paddingHorizontal: 14 }, primaryText: { color: activeText, fontSize: 12, fontWeight: '700' }, disabled: { opacity: 0.5 }, skip: { alignItems: 'center', justifyContent: 'center', minHeight: 44 }, skipText: { color: accent, fontSize: 12 }, draftNote: { color: faint, fontSize: 10, textAlign: 'center' },
});
