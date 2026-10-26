import { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { acceptDayPlan, calculatePlanScore, getCurrentPlanVersion, PLAN_PRIORITY_WEIGHTS, recordPlanProgress, resolveDayPlanConflict, reviseDayPlan, suggestDayPlan, type DayPlanItem, type DayPlanProposal, type PlanScoreResult } from '../dayPlan';
import { syncDayPlanProgress } from '../dayPlanSync';
import { upsertRoutineLog } from '../goalLogic';
import { finalizeKodaDay } from '../kodaDaySync';
import { ProgressLine, SectionTitle } from '../components';
import { accent, activeText, faint, line, muted, panel, panelSoft, text } from '../theme';
import type { Goal, KodaDay, PlannerItem, TabKey } from '../types';
import { todayDateKey, uid } from '../utils';
import { usePomodoroController } from '../usePomodoroTimer';
import {Clock3,Target} from 'lucide-react-native';
import {AssistantTile,DateRibbon,ScoreHistoryChart} from '../components/RoadmapUI';
import {activeBg,ink,lime} from '../theme';

type Props = {
  goals: Goal[]; plannerItems: PlannerItem[]; kodaDays: KodaDay[]; isDesktop?: boolean; userId?: string | null;
  onGoalsChange: (updater: (goals: Goal[]) => Goal[]) => void;
  onKodaDaysChange: (updater: (days: KodaDay[]) => KodaDay[]) => void;
  onTogglePlannerItem: (item: PlannerItem) => void;
  onOpenSection: (tab: TabKey) => void;
  onOpenGoal: (goalId: string) => void;
  onAddItem: (title: string) => PlannerItem | null;
  onDiscussDay?: (context:string)=>void;
};

export function DailyPlanScreen({ goals, plannerItems, kodaDays, isDesktop, userId, onGoalsChange, onKodaDaysChange, onTogglePlannerItem, onOpenSection, onOpenGoal, onAddItem,onDiscussDay }: Props) {
  const date = todayDateKey();
  const timer = usePomodoroController();
  const day = kodaDays.find(item => item.localDate === date);
  const recent = [...kodaDays].sort((a,b) => b.localDate.localeCompare(a.localDate)).find(item => item.plan);
  const [available, setAvailable] = useState(() => recent?.plan ? getCurrentPlanVersion(recent.plan).availableMinutes : 120);
  const proposal = useMemo(() => suggestDayPlan(goals, plannerItems, date, { availableMinutes: available }), [goals, plannerItems, date, available]);
  const [editor, setEditor] = useState<'proposal' | 'revision' | null>(null);
  const [draft, setDraft] = useState<DayPlanProposal>(proposal);
  const [reason, setReason] = useState('Изменились обстоятельства');
  const [details, setDetails] = useState(false);
  const [finish, setFinish] = useState(false);
  const [history, setHistory] = useState<KodaDay | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [newTask, setNewTask] = useState('');
  const [customDraft, setCustomDraft] = useState<DayPlanProposal | null>(null);
  const [selectedDate,setSelectedDate]=useState(date);
  const [calendarOpen,setCalendarOpen]=useState(false);
  const shown = customDraft ?? proposal;
  const plan = day?.plan;
  const storedResult = day?.status==='completed' && day.calculationSnapshot && typeof day.calculationSnapshot==='object' && (day.calculationSnapshot as PlanScoreResult).scoreVersion===3 ? day.calculationSnapshot as PlanScoreResult : null;
  const result = storedResult ?? calculatePlanScore(plan);
  const current = plan ? getCurrentPlanVersion(plan) : null;
  const activeScores = plan && current ? calculatePlanScore(plan, current.id) : null;
  const completed = day?.status === 'completed';
  const nextItem = activeScores?.items.filter(item=>item.completionRatio<1).sort((a,b)=>(b.category==='goal'?1:0)-(a.category==='goal'?1:0) || (b.priority?PLAN_PRIORITY_WEIGHTS[b.priority]:0)-(a.priority?PLAN_PRIORITY_WEIGHTS[a.priority]:0) || b.weight-a.weight || a.sourceKey.localeCompare(b.sourceKey))[0];
  const previousDays = kodaDays.filter(d => d.status === 'completed').sort((a,b)=>b.localDate.localeCompare(a.localDate));
  const lastOtherDay = previousDays.find(d => d.localDate !== date);
  const returning = lastOtherDay && new Date(`${date}T12:00:00`).getTime() - new Date(`${lastOtherDay.localDate}T12:00:00`).getTime() > 3 * 86400000;

  useEffect(() => {
    if (!plan || completed) return;
    const next = syncDayPlanProgress(plan, goals, plannerItems);
    if (next === plan) return;
    onKodaDaysChange(days => days.map(d => d.id === day?.id && d.plan === plan ? { ...d, plan: next, updatedAt: new Date().toISOString() } : d));
  }, [plan, goals, plannerItems, completed]);

  function start() {
    if (!shown.items.length) { setError('Добавьте действие в цели или дело в планнере. Пустой день не требует оценки.'); return; }
    const now = new Date().toISOString();
    const accepted = syncDayPlanProgress(acceptDayPlan(shown, { ownerId: userId ?? null, at: now }), goals, plannerItems);
    onKodaDaysChange(days => {
      if (days.some(d => d.localDate === date && (d.plan || d.status === 'completed'))) return days;
      const next: KodaDay = { id: day?.id ?? uid('day'), localDate: date, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'local', status: 'active', startedAt: now, finishedAt: null, goalScore: null, plannerScore: 0, totalScore: null, classification: 'unclassified', scoreVersion: 3, summary: '', focusLoss: '', nextRecommendation: '', goalsSnapshot: [], plannerSnapshot: [], calculationSnapshot: null, createdAt: day?.createdAt ?? now, updatedAt: now, plan: accepted };
      return [next, ...days.filter(d => d.localDate !== date)];
    });
    setError('');
  }
  function openEditor(mode: 'proposal' | 'revision') {
    setError('');
    if (mode === 'revision' && current) setDraft({ date, items: current.items.map(({ weight, ...item }) => item), minimum: current.minimum, availableMinutes: current.availableMinutes, reserveRatio: current.reserveRatio });
    else setDraft(shown);
    setEditor(mode);
  }
  function saveDraft() {
    if (!draft.items.length) { setError('Оставьте хотя бы один шаг. Для отдыха можно не начинать оцениваемый день.'); return; }
    const minimum = draft.items.find(item => item.sourceKey === draft.minimum?.sourceKey) ? draft.minimum : draft.items[0] ? { sourceKey: draft.items[0].sourceKey, label: draft.items[0].title, targetValue: draft.items[0].metric === 'minutes' ? Math.min(10, draft.items[0].targetValue) : 1 } : null;
    const normalized = { ...draft, minimum };
    if (editor === 'proposal') setCustomDraft(normalized);
    else if (plan && day) {
      onKodaDaysChange(days => days.map(d => d.id === day.id && d.status === 'active' && d.plan ? { ...d, plan: reviseDayPlan(d.plan, normalized, reason.trim() || 'План адаптирован'), updatedAt: new Date().toISOString() } : d));
    }
    setEditor(null); setError('');
  }
  function progress(item: DayPlanItem, value: number) {
    if (!plan || !day || completed) return;
    const now = new Date().toISOString();
    onKodaDaysChange(days => days.map(d => d.id === day.id && d.status === 'active' && d.plan ? { ...d, plan: recordPlanProgress(d.plan, item.sourceKey, value, uid('completion'), { at: now, versionId: current?.id }), updatedAt: now } : d));
    if (item.source.kind === 'routine') {
      onGoalsChange(items => items.map(g => g.id === item.source.goalId ? { ...g, routineLogs: upsertRoutineLog(g.routineLogs, item.source.id, date, value), updatedAt: now } : g));
    } else if (item.source.kind === 'action') {
      onGoalsChange(items => items.map(g => g.id === item.source.goalId ? { ...g, actions: g.actions.map(a => a.id === item.source.id ? { ...a, status: value >= item.targetValue ? 'completed' : 'pending', completedAt: value >= item.targetValue ? now : null } : a), updatedAt: now } : g));
    } else {
      const source = plannerItems.find(p => p.id === item.source.plannerId || p.id === item.source.id);
      if (source && item.metric === 'binary' && source.done !== (value >= item.targetValue)) onTogglePlannerItem(source);
    }
  }
  function finishDay() {
    onKodaDaysChange(days => days.map(d => d.id === day?.id && d.status === 'active' ? { ...finalizeKodaDay(d, goals, plannerItems), ...(note.trim() ? { summary: note.trim() } : {}) } : d));
    setFinish(false);
  }
  function beginNextStep() {
    if (!nextItem) return;
    if (nextItem.metric==='minutes') { timer.start(); onOpenSection('timer'); }
    else if (nextItem.goalId) onOpenGoal(nextItem.goalId);
    else onOpenSection('planner');
  }
  function addOwnTask() {
    const item=onAddItem(newTask.trim());
    if (!item) return;
    const key=`planner:${item.id}`;
    setDraft(d=>({...d,items:[...d.items,{sourceKey:key,budgetKey:key,title:item.title,category:'planner',metric:'binary',targetValue:1,estimatedMinutes:20,source:{kind:'planner',id:item.id,plannerId:item.id},explanation:'Дело добавлено вами'}]}));
    setNewTask('');
  }
  const maxMinutes = shown.items.reduce((sum,item)=>sum+item.estimatedMinutes,0);
  const notSelected = plannerItems.filter(item=>!item.done&&!item.deletedAt&&item.date<=date&&!shown.items.some(i=>i.source.id===item.id));
  const selectedDay=kodaDays.find(item=>item.localDate===selectedDate);
  const selectedItems=plannerItems.filter(item=>!item.deletedAt&&item.date===selectedDate);
  const leadTitle=completed?'День завершён':plan?'Один шаг ближе':'День в твоём темпе';
  const leadStep=completed?day?.summary||'Сохрани то, что получилось. Остальное можно продолжить позже.':plan?nextItem?.title??'Принятые действия выполнены. Можно завершить день.':shown.minimum?.label??'Выбери один посильный шаг — остальное подстроим.';
  const selectedDateLabel=selectedDate===date?'Сегодня':new Date(`${selectedDate}T12:00:00`).toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
  function discussDay(){const context=[`Помоги разобрать мой день ${date}.`,plan?`Статус: ${completed?'завершён':'в процессе'}. Исходный SCORE: ${result.totalScore===null?'без оценки':Math.round(result.totalScore)}.`:'План пока не принят.',`Доступное время: ${available} мин.`,...((current?.items??shown.items).map(item=>`• ${item.title} (${item.estimatedMinutes} мин)`)),`Следующий шаг: ${leadStep}`,'Предложи посильное продолжение без обязательного ежедневного режима.'].join('\n');if(onDiscussDay)onDiscussDay(context);else onOpenSection('koda');}
  return <ScrollView contentContainerStyle={[s.page, isDesktop && s.desktop]} keyboardShouldPersistTaps="handled">
    <SectionTitle title="Сегодня" subtitle={new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })} />
    <View style={[s.overview,isDesktop&&s.overviewDesktop]}>
      <View style={[s.dayBrief,isDesktop&&s.dayBriefDesktop]}>
        <View style={s.inline}><View style={s.statusPill}><View style={s.statusDot}/><Text style={s.briefMeta}>{completed?'Итог сохранён':plan?'План принят':'Можно начать с малого'}</Text></View><Target size={20} color="#202810"/></View>
        <Text style={s.briefTitle}>{leadTitle}</Text>
      </View>
    </View>
    <View style={s.calendarSection}>
      <Pressable accessibilityRole="button" accessibilityState={{expanded:calendarOpen}} onPress={()=>setCalendarOpen(open=>!open)} style={s.calendarToggle}>
        <Text style={s.calendarToggleTitle}>Календарь</Text>
        <Text style={s.calendarToggleMeta}>{selectedDateLabel} · {selectedItems.length} дел</Text>
        <Text style={s.calendarToggleAction}>{calendarOpen?'Свернуть':'Выбрать дату'}</Text>
      </Pressable>
      {calendarOpen?<View style={s.calendarCard}>
        <DateRibbon today={date} value={selectedDate} onChange={setSelectedDate}/>
        <View style={s.inline}><Text style={[s.body,s.grow]}>{selectedDateLabel} · {selectedItems.length} дел в планнере</Text><Action title="Открыть планнер" onPress={()=>onOpenSection('planner')}/></View>
        {selectedDay?.status==='completed'?<Action title={`Итог дня · ${selectedDay.totalScore===null?'без оценки':Math.round(selectedDay.totalScore)+' SCORE'}`} onPress={()=>setHistory(selectedDay)}/>:<Text style={s.meta}>{selectedItems[0]?.title??'Свободное место для важных дел и отдыха.'}</Text>}
      </View>:null}
    </View>
    <View style={[s.workGrid,isDesktop&&s.workGridDesktop]}><View style={s.workMain}>
    {returning && !plan ? <Text style={s.meta}>Рады видеть вас снова. Прошлые достижения сохранены; начнём с посильного шага.</Text> : null}
    {!plan && !completed ? <View style={s.hero}>
      <Text style={s.heading}>Вот посильный план на сегодня</Text>
      <Text style={s.meta}>Из активных целей и дел на сегодня. Вы решаете, что принять.</Text>
      <View style={s.inline}><Text style={s.meta}>Доступно времени, мин</Text><TextInput accessibilityLabel="Доступное время в минутах" keyboardType="number-pad" value={String(available)} onChangeText={v=>{ setAvailable(Math.max(0,Math.min(600,Number(v.replace(/\D/g,''))||0))); setCustomDraft(null); }} style={[s.input,s.number]} /></View>
      {shown.items.map(item=><View key={item.sourceKey} style={s.planTrack}><View style={s.inline}><View style={s.grow}><Text style={s.label}>{item.goalTitle || 'Текущие дела'}</Text><Text style={s.body}>{item.title}</Text></View><Text style={s.timePill}>{item.estimatedMinutes} мин</Text></View><View accessibilityLabel={`Запланировано около ${item.estimatedMinutes} минут`} style={s.budgetTrack}><View style={[s.budgetFill,{width:`${Math.min(100,item.estimatedMinutes/Math.max(1,maxMinutes)*100)}%`}]} /></View></View>)}
      {!shown.items.length ? <Text style={s.meta}>Пока нечего предложить в выбранное время. Добавьте небольшой шаг или увеличьте доступное время.</Text> : <Text style={s.meta}>Примерно {maxMinutes} мин · оставляем резерв времени</Text>}
      {shown.minimum ? <Text style={s.minimum}>Минимум: {shown.minimum.label}{shown.items.find(i=>i.sourceKey===shown.minimum?.sourceKey)?.metric==='minutes'?` · ${shown.minimum.targetValue} мин`:''}</Text> : null}
      <Action title="Начать день" onPress={start} primary disabled={!shown.items.length}/>
      <View style={s.inline}><Action title="Подстроить план" onPress={()=>openEditor('proposal')} />
      <Action title={details?'Скрыть объяснение':'Почему такой план?'} onPress={()=>setDetails(!details)} /></View>
      {!shown.items.length ? <View style={s.inline}><Action title="Открыть цели" onPress={()=>onOpenSection('goals')} /><Action title="Добавить дело" onPress={()=>onOpenSection('planner')} /></View> : null}
      {notSelected.length?<Action title={`Ещё ${notSelected.length} дел · открыть планнер`} onPress={()=>onOpenSection('planner')}/>:null}
      {details?shown.items.map(i=><Text key={i.sourceKey} style={s.meta}>{i.title}: {i.explanation}</Text>):null}
    </View> : <View style={s.hero}>
      <Text style={s.heading}>{completed?'Итог и наблюдения':'Следующий шаг'}</Text>
      {!completed ? <Text style={s.body}>{nextItem?.title ?? 'Принятые действия выполнены'}</Text> : <Text style={s.body}>{day?.summary}</Text>}
      {!completed&&nextItem?<Action title={nextItem.metric==='minutes'?'Начать шаг с таймером':'Открыть следующий шаг'} onPress={beginNextStep} primary/>:null}
      {!completed?<><View accessibilityLiveRegion="polite"><Text style={s.score}>{result.totalScore === null ? '—' : Math.round(result.totalScore)}<Text style={s.meta}> / 100 SCORE</Text></Text></View><ProgressLine value={result.totalScore??0}/></>:<Text style={s.body}>{plan?`Исходный план: ${result.completedCount} из ${result.totalCount} действий выполнено.`:'Исторический итог сохранён по прежней формуле.'}</Text>}
      {completed?<Action title="Подробный итог дня" onPress={()=>setHistory(day??null)}/>:null}
      <Text style={s.meta}>{plan?'Выполнение исходного принятого плана':'Историческая оценка · прежняя версия формулы'}</Text>
      {plan && result.totalScore!==null ? <Text style={s.meta}>Цели: {Math.round(result.goalScore??0)} балл. · текущие дела: {Math.round(result.plannerScore)} балл.</Text> : null}
      {result.minimumCompleted?<Text style={s.minimum}>Минимум дня выполнен</Text>:null}
      {result.revisionCount>0?<Text style={s.meta}>План пересматривался {result.revisionCount} раз. Актуальный план: {Math.round(result.currentScore??0)}%. Исходный результат сохранён.</Text>:null}
      {result.hasConflicts&&!completed?<View style={s.section}><Text style={s.minimum}>Найдено несколько вариантов плана. Выберите актуальный; история и исходный SCORE сохранятся.</Text>{result.conflictingVersionIds.map(id=>{const v=plan!.versions.find(v=>v.id===id)!;return <Action key={id} title={`Выбрать вариант: ${v.items.length} действий · ${v.plannedMinutes} мин · ${v.reason||'начало дня'}`} onPress={()=>onKodaDaysChange(days=>days.map(d=>d.id===day?.id&&d.status==='active'&&d.plan?{...d,plan:resolveDayPlanConflict(d.plan,id),updatedAt:new Date().toISOString()}:d))}/>;})}</View>:null}
      {!completed && activeScores?.items.map(item=><View key={item.sourceKey} style={s.row}>
        <View style={s.grow}><Text style={s.body}>{item.title}</Text><Text style={s.meta}>{item.goalTitle || 'Текущие дела'} · {item.metric==='binary'?(item.completionRatio>=1?'Выполнено':'Не завершено'):`${item.currentValue} / ${item.targetValue} ${item.metric==='minutes'?'мин':'шагов'}`}</Text>{item.goalId?<Action title="Открыть цель" onPress={()=>onOpenGoal(item.goalId!)} />:null}</View>
        {item.metric==='subtasks'?<Action title="Подзадачи" onPress={()=>onOpenSection('planner')} />:item.metric==='binary'?<Action title={item.completionRatio>=1?'Отменить отметку':'Готово'} onPress={()=>progress(item,item.completionRatio>=1?0:item.targetValue)} />:<View style={s.inline}><Action title="−" label={`Уменьшить выполнение ${item.title}`} onPress={()=>progress(item,Math.max(0,item.currentValue-(item.metric==='minutes'?10:1)))} /><Action title={item.metric==='minutes'?'+10 мин':'+1'} label={`Добавить выполнение ${item.title}`} onPress={()=>progress(item,Math.max(item.currentValue,Math.min(item.targetValue,item.currentValue+(item.metric==='minutes'?10:1))))} /></View>}
      </View>)}
      {!completed && plan?<><Action title="Завершить день" onPress={()=>setFinish(true)} primary={!nextItem} /><Action title="Пересмотреть план" onPress={()=>openEditor('revision')} /></>:null}
      <Action title={details?'Скрыть подробности':'Как считается · версии плана'} onPress={()=>setDetails(!details)} />
      {details && plan?<><Text style={s.meta}>Цели — 75%, текущие дела — 25%. Если категория одна, её вес — 100%. Минимум не даёт дополнительных баллов. Удаление и перенос задач не меняют принятый снимок. Пересмотр меняет актуальный план, но не повышает сам по себе исходный SCORE.</Text>{plan.versions.map(v=><View key={v.id} style={s.row}><View style={s.grow}><Text style={s.body}>{v.parentVersionId?'Пересмотр':'Исходный план'} · {new Date(v.acceptedAt).toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'})}</Text><Text style={s.meta}>{v.reason || 'Принят при начале дня'} · {v.plannedMinutes} мин · {Math.round(calculatePlanScore(plan,v.id).totalScore??0)}%</Text>{v.items.map(i=><Text key={i.sourceKey} style={s.meta}>{i.title} · объём {i.targetValue} · вес {i.weight.toFixed(1)}</Text>)}</View></View>)}</>:null}
    </View>}
    {error && !editor?<Text accessibilityRole="alert" style={s.meta}>{error}</Text>:null}
    </View><View style={[s.workAside,isDesktop&&{flex:0.7}]}>
      <ScoreHistoryChart days={kodaDays} compact/>
      <View style={s.utilityRow}>
      <View style={s.focusCard}><View style={s.inline}><Clock3 size={18} color={muted}/><Text style={s.body}>Время для фокуса</Text></View><Text style={s.focusNumber}>{current?.availableMinutes??available}<Text style={s.meta}>{' мин доступно'}</Text></Text><Text style={s.meta}>{current ? `В плане ${current.items.reduce((sum, item) => sum + item.estimatedMinutes, 0)} мин. ` : ''}Сессии запускаются по желанию. Перерывы — часть движения.</Text><Action title="Открыть таймер" onPress={()=>onOpenSection('timer')}/></View>
      <View style={s.utilityTile}><AssistantTile onPress={discussDay}>Подстроить план под силы? Текущий день добавим в черновик сообщения.</AssistantTile></View>
      </View>
    </View></View>
    <View style={[s.section,{maxWidth:920,width:"100%",backgroundColor:panel,borderRadius:24,padding:20}]}><Text style={s.heading}>История дней</Text>{previousDays.slice(0,14).map(d=><Pressable key={d.id} accessibilityRole="button" onPress={()=>setHistory(d)} style={s.row}><View style={{width:48,height:6,borderRadius:4,backgroundColor:panelSoft,overflow:"hidden"}}><View style={{height:6,width:`${Math.max(0,Math.min(100,d.totalScore??0))}%`,backgroundColor:accent}}/></View><Text style={[s.body,{minWidth:100}]}>{new Date(`${d.localDate}T12:00:00`).toLocaleDateString("ru-RU",{day:"numeric",month:"short"})}</Text><Text style={[s.meta,{flexShrink:1}]}>{d.totalScore===null?'Без оценки':`${Math.round(d.totalScore)}/100`} · {d.plan?'план дня':'прежняя формула'}</Text></Pressable>)}{!previousDays.length?<Text style={s.meta}>Здесь появятся завершённые дни и их планы.</Text>:null}</View>
    <Modal transparent visible={editor!==null} animationType="none" onRequestClose={()=>setEditor(null)}><View style={s.overlay}><View style={s.sheet}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.section}>
      <Text style={s.heading}>{editor==='revision'?'Пересмотреть план':'Подстроить предложение'}</Text>
      <Text style={s.meta}>{editor==='revision'?'Исходный план и его SCORE сохранятся. Для нового плана будет отдельный процент выполнения.':'Уберите лишнее, выберите другое действие или уточните объём.'}</Text>
      {draft.items.map(item=><View style={s.row} key={item.sourceKey}><View style={s.grow}><Text style={s.body}>{item.title}</Text>{item.metric!=='binary'?<TextInput accessibilityLabel={`Плановый объём: ${item.title}`} keyboardType="decimal-pad" value={String(item.targetValue)} onChangeText={v=>setDraft(d=>({...d,items:d.items.map(i=>i.sourceKey===item.sourceKey?{...i,targetValue:Math.max(1,Number(v.replace(',','.'))||1),estimatedMinutes:i.metric==='minutes'?Math.max(1,Number(v)||1):i.estimatedMinutes}:i)}))} style={s.input}/>:null}<Action title="Сделать минимумом" onPress={()=>setDraft(d=>({...d,minimum:{sourceKey:item.sourceKey,label:item.title,targetValue:item.metric==='minutes'?Math.min(10,item.targetValue):1}}))}/></View><Action title="Убрать" label={`Убрать из плана ${item.title}`} onPress={()=>setDraft(d=>({...d,items:d.items.filter(i=>i.sourceKey!==item.sourceKey)}))}/></View>)}
      <Text style={s.label}>Другие действия</Text>{suggestDayPlan(goals,plannerItems,date,{availableMinutes:10000,maxItems:100,maxActionsPerGoal:8}).items.filter(i=>!draft.items.some(j=>j.sourceKey===i.sourceKey)).slice(0,20).map(item=><Action key={item.sourceKey} title={`Добавить: ${item.title}`} onPress={()=>setDraft(d=>({...d,items:[...d.items,item]}))}/>)}
      <Text style={s.label}>Своё дело</Text><TextInput accessibilityLabel="Новое дело для плана" value={newTask} onChangeText={setNewTask} onSubmitEditing={addOwnTask} placeholder="Например, записаться к врачу" placeholderTextColor={faint} style={s.input}/><Action title="Добавить своё дело" disabled={!newTask.trim()} onPress={addOwnTask}/><Text style={s.meta}>Дело сохранится в планнере. В оцениваемый план оно войдёт после подтверждения изменений.</Text>
      {editor==='revision'?<><Text style={s.label}>Причина пересмотра</Text><TextInput accessibilityLabel="Причина пересмотра" value={reason} onChangeText={setReason} style={s.input}/></>:null}
      {draft.items.reduce((sum,i)=>sum+i.estimatedMinutes,0)>draft.availableMinutes*(1-draft.reserveRatio)?<Text style={s.minimum}>План выходит за доступное время с резервом. Можно убрать действие или уменьшить объём.</Text>:null}
      {error?<Text accessibilityRole="alert" style={s.meta}>{error}</Text>:null}<Action title={editor==='revision'?'Сохранить пересмотр':'Готово'} onPress={saveDraft} primary/><Action title="Отмена" onPress={()=>{setEditor(null);setError('');}}/>
    </ScrollView></View></View></Modal>
    <Modal transparent visible={finish} animationType="none" onRequestClose={()=>setFinish(false)}><View style={s.overlay}><View style={s.sheet}><Text style={s.heading}>Завершим день?</Text><Text style={s.score}>{Math.round(result.totalScore??0)}<Text style={s.meta}> / 100</Text></Text><Text style={s.meta}>Исходный план: {result.completedCount} из {result.totalCount} действий · {result.plannedMinutes} мин запланировано.</Text><Text style={s.meta}>{result.minimumCompleted?'Минимум выполнен':'Минимум пока не выполнен'} · пересмотров: {result.revisionCount}</Text><Text style={s.label}>Что получилось · необязательно</Text><TextInput accessibilityLabel="Итог дня" multiline value={note} onChangeText={setNote} style={s.input}/><Action title="Завершить день" onPress={finishDay} primary/><Action title="Вернуться" onPress={()=>setFinish(false)}/></View></View></Modal>
    <Modal transparent visible={!!history} animationType="none" onRequestClose={()=>setHistory(null)}><View style={s.overlay}><View style={s.sheet}><ScrollView contentContainerStyle={s.section}><Text style={s.heading}>{history?.localDate}</Text><Text style={s.body}>{history?.summary}</Text><Text style={s.meta}>Зафиксированный SCORE: {history?.totalScore===null?'без оценки':Math.round(history?.totalScore??0)}</Text>{history?.plan?.versions.map(v=><View key={v.id} style={s.section}><Text style={s.body}>{v.parentVersionId?'Пересмотр':'Исходный план'} · {v.reason}</Text>{v.items.map(i=><Text key={i.sourceKey} style={s.meta}>{i.title} · объём {i.targetValue}</Text>)}</View>)}<Action title="Закрыть историю" onPress={()=>setHistory(null)} /></ScrollView></View></View></Modal>
  </ScrollView>;
}

function Action({ title, onPress, primary, disabled, label }: { title:string; onPress:()=>void; primary?:boolean; disabled?:boolean; label?:string }) { return <Pressable accessibilityRole="button" accessibilityLabel={label ?? title} accessibilityState={{disabled:!!disabled}} disabled={disabled} onPress={onPress} style={[s.button,primary&&s.primary,disabled&&{opacity:0.45}]}><Text style={[s.buttonText,primary&&s.primaryText]}>{title}</Text></Pressable>; }
const s=StyleSheet.create({
  page:{padding:2,paddingTop:16,paddingBottom:100,gap:20},desktop:{maxWidth:1320,width:'100%',alignSelf:'center',padding:4,paddingBottom:36},
  overview:{gap:16},overviewDesktop:{flexDirection:'row',alignItems:'stretch'},dayBrief:{backgroundColor:lime,borderRadius:28,padding:20,gap:12,minHeight:132,justifyContent:'space-between'},dayBriefDesktop:{maxWidth:720},briefTitle:{fontSize:30,lineHeight:34,letterSpacing:-1.1,fontWeight:'600',color:'#202810'},briefMeta:{fontSize:12,color:'#3b461e'},statusPill:{flexDirection:'row',gap:6,alignItems:'center',borderWidth:1,borderColor:'#aabc47',borderRadius:99,paddingHorizontal:10,paddingVertical:6,marginRight:'auto'},statusDot:{width:5,height:5,borderRadius:5,backgroundColor:'#43591a'},briefArrow:{minHeight:44,paddingHorizontal:14,borderRadius:99,backgroundColor:ink,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:8,flexShrink:1},calendarSection:{gap:10},calendarToggle:{alignItems:'center',backgroundColor:panel,borderColor:line,borderRadius:20,borderWidth:1,flexDirection:'row',flexWrap:'wrap',gap:8,minHeight:50,paddingHorizontal:16,paddingVertical:10},calendarToggleTitle:{color:text,fontSize:15,fontWeight:'600'},calendarToggleMeta:{color:muted,flex:1,fontSize:13},calendarToggleAction:{color:accent,fontSize:13,fontWeight:'600'},calendarCard:{backgroundColor:panel,borderRadius:24,padding:18,gap:10,justifyContent:'space-between',minWidth:0},workGrid:{gap:16},workGridDesktop:{flexDirection:'row',alignItems:'flex-start'},workMain:{flex:1.35,minWidth:0,gap:16},workAside:{gap:16,minWidth:0},focusCard:{backgroundColor:panelSoft,borderRadius:28,padding:22,gap:12},focusNumber:{fontSize:34,fontWeight:'500',color:text,letterSpacing:-1.5},
  hero:{backgroundColor:panel,borderWidth:0,borderColor:line,borderRadius:28,padding:24,gap:12},
  briefActionText:{color:'#f5f7e9',fontSize:12,fontWeight:'500'},planTrack:{gap:8,paddingVertical:10,borderBottomWidth:1,borderBottomColor:line},timePill:{color:muted,fontSize:12,paddingHorizontal:10,paddingVertical:6,borderRadius:99,backgroundColor:panelSoft},budgetTrack:{height:6,backgroundColor:panelSoft,borderRadius:99,overflow:'hidden'},budgetFill:{height:6,backgroundColor:accent,borderRadius:99},
  utilityRow:{gap:16},utilityRowDesktop:{flexDirection:'row',alignItems:'stretch'},utilityTile:{flex:1,minWidth:0},
  heading:{fontSize:21,lineHeight:28,color:text,fontWeight:'500'},body:{fontSize:15,lineHeight:22,color:text},meta:{fontSize:13,lineHeight:19,color:muted},label:{fontSize:12,lineHeight:18,color:muted},
  row:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:10,paddingVertical:10,borderBottomColor:line,borderBottomWidth:1},grow:{flex:1,minWidth:150},inline:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',gap:8},section:{gap:12},
  button:{minHeight:44,paddingVertical:10,paddingHorizontal:16,justifyContent:'center',alignItems:'center',borderRadius:99,flexShrink:1,borderColor:line,borderWidth:1},buttonText:{fontSize:13,color:accent,textAlign:'center'},primary:{backgroundColor:activeBg,borderColor:activeBg},primaryText:{color:activeText,fontWeight:'600'},
  input:{minHeight:44,padding:10,borderColor:line,borderWidth:1,borderRadius:8,color:text,fontSize:16},number:{width:84},minimum:{fontSize:13,lineHeight:20,color:accent,paddingVertical:8},score:{fontSize:54,lineHeight:64,color:text,fontWeight:'300'},
  overlay:{flex:1,backgroundColor:'rgba(0,0,0,0.6)',justifyContent:'center',alignItems:'center',padding:16},sheet:{maxWidth:560,width:'100%',maxHeight:'90%',backgroundColor:panelSoft,borderColor:line,borderWidth:1,borderRadius:16,padding:20,gap:12},
});
