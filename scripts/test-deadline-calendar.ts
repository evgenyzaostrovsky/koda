import assert from 'node:assert/strict';
import {calendarCells,parseDateKey,dateKey} from '../src/features/koda/deadlineCalendar';
assert.equal(parseDateKey('2026-02-29'),null);
assert.equal(dateKey(parseDateKey('2028-02-29')!),'2028-02-29');
assert.equal(parseDateKey('2026-13-01'),null);
assert.equal(parseDateKey(''),null);
for(let year=2025;year<=2028;year++)for(let month=0;month<12;month++){
 const weeks=calendarCells(year,month),days=weeks.flat();
 assert.equal(days[0].date.getDay(),1);assert.equal(days.at(-1)!.date.getDay(),0);
 assert.equal(new Set(days.map(d=>d.key)).size,days.length);
 assert.equal(days.filter(d=>d.current).length,new Date(year,month+1,0).getDate());
 assert.ok(weeks.length>=4&&weeks.length<=6);
}
console.log('Deadline calendar: leap years, month boundaries, Monday weeks and local date keys PASS');
