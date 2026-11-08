import {StyleSheet,Text,View} from 'react-native';
import type {StudyPlan} from '../../../ai/studyPlanning';
import {line,muted,panel,text,accent} from '../theme';

const statusLabel={completed:'Пройдено',current:'Текущий модуль',remaining:'Впереди'} as const;
const weekdayShort=['вс','пн','вт','ср','чт','пт','сб'];
function minutesLabel(minutes:number){const hours=Math.floor(minutes/60),rest=minutes%60;return hours&&rest?`${hours} ч ${rest} мин`:hours?`${hours} ч`:`${rest} мин`;}
function dateLabel(value?:string){if(!value)return '';const match=/^(\d{4})-(\d{2})-(\d{2})$/.exec(value);if(!match)return value;return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]),12).toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});}
function sessionsLabel(count:number){const mod100=count%100,mod10=count%10;const noun=mod100>=11&&mod100<=14?'занятий':mod10===1?'занятие':mod10>=2&&mod10<=4?'занятия':'занятий';return `${count} ${noun}`;}
function moduleDates(start?:string,end?:string){if(start&&end&&start===end)return dateLabel(start);if(start&&end)return `${dateLabel(start)} — ${dateLabel(end)}`;if(start)return `с ${dateLabel(start)}`;if(end)return `до ${dateLabel(end)}`;return '';}
function finishDate(plan:StudyPlan){return plan.modules.reduce<string|undefined>((latest,module)=>module.endDate&&(!latest||module.endDate>latest)?module.endDate:latest,undefined);}
function scheduleText(plan:StudyPlan){const finish=finishDate(plan);return [
 `Объём: ${minutesLabel(plan.totalMinutes)}.`,
 `Нагрузка: ${minutesLabel(plan.dailyMinutes)} за занятие, ${plan.studyDays.length} ${plan.studyDays.length===1?'день':'дней'} в неделю (${plan.studyDays.map(day=>weekdayShort[day]).join(', ')}).`,
 ...(plan.deadline?[`Доступно до срока: ${minutesLabel(plan.availableMinutes)}.`,`Срок: ${dateLabel(plan.deadline)}`]:['Доступное время до срока не рассчитано: срок не выбран.']),...(finish?[`Расчётное завершение: ${dateLabel(finish)}`]:[]),
];}
export function studyPlanSummary(plan:StudyPlan){return [
 `Принятый план обучения. Начало: ${dateLabel(plan.startDate)}.`,...scheduleText(plan),
 ...plan.modules.map(module=>module.status==='completed'?`Пройдено: ${module.title}.`:`${statusLabel[module.status]}: ${module.title} — ${minutesLabel(module.estimatedMinutes)}, ${sessionsLabel(module.sessions)}${moduleDates(module.startDate,module.endDate)?`, ${moduleDates(module.startDate,module.endDate)}`:''}.`),
 ...(plan.shortfallMinutes>0?[`Не хватает времени: ${minutesLabel(plan.shortfallMinutes)}.`]:[]),...plan.assumptions.map(item=>`Допущение: ${item}`),...plan.warnings.map(item=>`Важно: ${item}`),
].join('\n');}
export function StudyPlanPreview({plan}:{plan:StudyPlan}){const groups=(['completed','current','remaining'] as const).map(status=>({status,items:plan.modules.filter(item=>item.status===status)})).filter(group=>group.items.length);return <View style={s.card}>
 <Text style={s.title}>Черновой график обучения</Text>{scheduleText(plan).map((line,index)=><Text key={`summary${index}`} style={s.meta}>{line}</Text>)}
 {!!plan.shortfallMinutes&&<Text style={s.notice}>По текущему темпу не хватает {minutesLabel(plan.shortfallMinutes)} до срока.</Text>}
 {groups.map(group=><View key={group.status}><Text style={[s.status,group.status==='completed'&&s.done]}>{statusLabel[group.status]}</Text>{group.items.map((item,index)=><View key={`${item.title}-${index}`} style={s.module}><Text style={s.name}>{item.title}</Text>{item.status!=='completed'?<Text style={s.meta}>{minutesLabel(item.estimatedMinutes)} · {sessionsLabel(item.sessions)}{moduleDates(item.startDate,item.endDate)?` · ${moduleDates(item.startDate,item.endDate)}`:''}</Text>:null}</View>)}</View>)}
 {plan.assumptions.map((item,index)=><Text key={`a${index}`} style={s.meta}>Допущение: {item}</Text>)}{plan.warnings.map((item,index)=><Text key={`w${index}`} style={s.notice}>{item}</Text>)}
 </View>}
const s=StyleSheet.create({card:{backgroundColor:panel,borderColor:line,borderWidth:1,borderRadius:14,padding:10,gap:5},title:{color:text,fontSize:12,fontWeight:'700'},meta:{color:muted,fontSize:10,lineHeight:15},notice:{color:accent,fontSize:10,lineHeight:15},module:{borderTopWidth:1,borderTopColor:line,paddingTop:5,gap:2},status:{color:accent,fontSize:9,fontWeight:'700'},done:{color:muted},name:{color:text,fontSize:11,fontWeight:'600'}});
