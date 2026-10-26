import assert from 'node:assert/strict';
import { isRoutineDueToday } from '../src/features/koda/goalLogic';
import { isPlanRoutineDue } from '../src/features/koda/dayPlan';
import type { GoalRoutine } from '../src/features/koda/types';

const routine: GoalRoutine = { id:'r',title:'Practice',metricType:'boolean',targetValue:1,frequencyType:'weekly',weekdays:[],startDate:'2026-10-15',endDate:'',isActive:true };
const check = (patch:Partial<GoalRoutine>,date:string,expected:boolean) => {
  for (const due of [isRoutineDueToday,isPlanRoutineDue]) assert.equal(due({...routine,...patch},date),expected,date);
};
check({},'2026-10-15',true);
check({},'2026-10-16',false);
check({},'2026-10-22',true);
check({weekdays:[1]},'2026-10-19',true);
check({frequencyType:'monthly'},'2026-11-01',false);
check({frequencyType:'monthly'},'2026-11-15',true);
check({frequencyType:'monthly',startDate:'2026-01-31'},'2026-02-28',true);
check({frequencyType:'monthly',startDate:'2024-01-31'},'2024-02-29',true);
check({frequencyType:'daily'},'2026-02-30',false);
check({isActive:false},'2026-10-15',false);
check({endDate:'2026-10-20'},'2026-10-22',false);
console.log('Routine schedule: every consumer agrees on weekly/monthly dates, leap years and bounds.');
