import type { PlannerItem } from './types';
import { normalizeTimeValue, todayDateKey } from './utils';
import { isPlannerDate, plannerDateOffset } from './plannerOverview';

/** Civil dates stay civil dates; relative words refer to the user's actual local today. */
export function parseQuickTaskInput(value:string,fallbackDate:string,fallbackTime:string,referenceDate=todayDateKey()):Pick<PlannerItem,'date'|'time'|'title'>|null {
 if(!isPlannerDate(fallbackDate)||!isPlannerDate(referenceDate))return null;
 let date=fallbackDate;let time=fallbackTime.trim()?normalizeTimeValue(fallbackTime):'';if(time===null)return null;
 let title=value.trim();
 // An explicit "в" makes dotted input a clock time, even when it resembles a date.
 const qualifiedTime=title.match(/(^|\s)в\s*(\d{1,2})[:.](\d{2})(?=\s|$|[,.;])/iu);
 if(qualifiedTime){const parsed=normalizeTimeValue(`${qualifiedTime[2]}:${qualifiedTime[3]}`);if(!parsed)return null;time=parsed;title=title.replace(qualifiedTime[0],' ');}

 const relative=title.match(/(^|\s)(послезавтра|завтра|сегодня)(?=\s|$|[,.;:])/iu);
 if(relative){date=plannerDateOffset(referenceDate,({сегодня:0,завтра:1,послезавтра:2} as Record<string,number>)[relative[2].toLocaleLowerCase('ru')]);title=title.replace(relative[0],' ');}
 const explicit=title.match(/(^|\s)(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?(?=\s|$|[,.;:])/u);
 if(explicit){
   const day=Number(explicit[2]),month=Number(explicit[3]);let year=explicit[4]?Number(explicit[4]):Number(fallbackDate.slice(0,4));if(explicit[4]?.length===2)year+=2000;
   let key=`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
   // HH.MM remains a supported time when it cannot be a calendar month.
   if(!isPlannerDate(key)){if(!(month===0||month>12)||!normalizeTimeValue(`${day}:${String(month).padStart(2,'0')}`))return null;}
   else {if(!explicit[4]&&key<referenceDate)key=`${year+1}${key.slice(4)}`;if(!isPlannerDate(key))return null;date=key;title=title.replace(explicit[0],' ');}
 }
 const timed=title.match(/(^|\s)(?:в\s*)?(\d{1,2})[:.](\d{2})(?=\s|$|[,.;])/iu);
 const hour=timed?null:title.match(/(^|\s)в\s*(\d{1,2})(?=\s|$|[,.;])/iu);
 if(timed||hour){const match=timed??hour!;const parsed=normalizeTimeValue(`${match[2]}:${timed?match[3]:'00'}`);if(!parsed)return null;time=parsed;title=title.replace(match[0],' ');}
 title=title.replace(/\s+/g,' ').replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/gu,'').trim();
 return title?{date,time:time??'',title}:null;
}
