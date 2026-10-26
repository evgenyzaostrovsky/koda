import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transpileModule } from 'typescript';

// Exercise the actual editor handler without loading React Native in Node.
const source = readFileSync('src/features/koda/screens/NotesScreen.tsx','utf8');
const start = source.indexOf('  function applyInlineMark(');
const end = source.indexOf('\n  function openNote(',start);
assert.ok(start >= 0 && end > start);
const code = transpileModule(source.slice(start,end),{}).outputText;
function format(value:string,mark:string,selection?:{start:number;end:number}) {
  let result='';
  new Function('updateBlock',`${code}; return applyInlineMark;`)((_id:string,patch:{text:string})=>{result=patch.text;})({id:'b',text:value},mark,selection);
  return result;
}
assert.equal(format('Hello world','bold',{start:6,end:6}),'Hello **текст**world');
assert.equal(format('Hello world','italic',{start:6,end:11}),'Hello _world_');
assert.equal(format('Hello','bold'),'**Hello**');
assert.equal(format('','code',{start:0,end:0}),'`текст`');
console.log('Note formatting: caret insertion preserves surrounding text; selection and whole-block formatting pass.');
