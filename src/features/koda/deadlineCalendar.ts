export function dateKey(date:Date):string{return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function parseDateKey(value:string):Date|null{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const [year,month,day]=value.split('-').map(Number),date=new Date(year,month-1,day,12);
 return dateKey(date)===value?date:null;
}
export function calendarCells(year:number,month:number){
 const first=new Date(year,month,1,12),offset=(first.getDay()+6)%7;
 const count=Math.ceil((offset+new Date(year,month+1,0,12).getDate())/7);
 return Array.from({length:count},(_,week)=>Array.from({length:7},(_,day)=>{const date=new Date(year,month,1-offset+week*7+day,12);return{date,key:dateKey(date),current:date.getMonth()===month};}));
}
