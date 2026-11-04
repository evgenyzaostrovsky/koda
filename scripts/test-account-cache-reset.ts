import assert from 'node:assert/strict';
import { resetTestAccountCache } from '../src/lib/resetTestAccountCache';
async function main() {
const values = new Map([
  ['koda:appState:v1:test', 'demo'], ['koda:appState:v1:main', 'private'],
  ['koda:appState:v1', 'guest'], ['auth-token', 'secret'],
  ['koda:chat-history:v1:user:"test"', 'chat'], ['koda:timer:v1:test', 'timer'],
]);
const storage = {
  getAllKeys: async () => [...values.keys()], getItem: async (key:string) => values.get(key) ?? null,
  setItem: async (key:string,value:string) => { values.set(key,value); },
  removeItem: async (key:string) => { values.delete(key); },
};
await resetTestAccountCache(storage,'main','test','1');
assert.equal(values.size,6);
await resetTestAccountCache(storage,'test','test','1');
assert.equal(values.get('koda:appState:v1:main'),'private');
assert.equal(values.get('koda:appState:v1'),'guest');
assert.equal(values.get('auth-token'),'secret');
assert.equal(values.has('koda:appState:v1:test'),false);
assert.equal(values.has('koda:chat-history:v1:user:"test"'),false);
assert.equal(values.has('koda:timer:v1:test'),false);
values.set('koda:appState:v1:test','new work');
await resetTestAccountCache(storage,'test','test','1');
assert.equal(values.get('koda:appState:v1:test'),'new work');
console.log('PASS: reset only named test owner, preserve main/guest/auth, run once');
}
void main().catch(error => { console.error(error); process.exitCode=1; });
