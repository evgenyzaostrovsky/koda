import assert from 'node:assert/strict';
import { createWizardDraftStorage, restoreWizardClarifications } from '../src/features/koda/wizardDraft';

const empty = { clarificationQuestions: [], clarificationAnswers: [] };
assert.deepEqual(restoreWizardClarifications({ version: 1, wish: 'Legacy draft' }), empty);
for (const malformed of [null, undefined, false, 42, '', [], { clarificationQuestions: {} }]) {
  assert.deepEqual(restoreWizardClarifications(malformed), empty);
}
const partial = { clarificationQuestions: ['First?', 'Second?'], clarificationAnswers: ['  unfinished answer ', ''] };
assert.deepEqual(restoreWizardClarifications(JSON.parse(JSON.stringify(partial))), partial, 'Unsent whitespace and blank second answer survive reload');
assert.deepEqual(restoreWizardClarifications({ clarificationQuestions: ['First?', 'Second?'], clarificationAnswers: ['', 'Second answer'] }).clarificationAnswers, ['', 'Second answer']);
assert.deepEqual(restoreWizardClarifications({ clarificationQuestions: [null, 'Second?'], clarificationAnswers: ['Wrong answer', 'Right answer'] }), {
  clarificationQuestions: ['Second?'], clarificationAnswers: ['Right answer'],
}, 'Skipping a malformed question must not shift another answer onto it');
assert.deepEqual(restoreWizardClarifications({ clarificationQuestions: ['First?', 'Second?'], clarificationAnswers: [42] }), {
  clarificationQuestions: ['First?', 'Second?'], clarificationAnswers: ['', ''],
});
assert.deepEqual(restoreWizardClarifications({ clarificationQuestions: ['First?'], clarificationAnswers: { 0: 'Not an array' } }).clarificationAnswers, ['']);
const bounded = restoreWizardClarifications({ clarificationQuestions: ['q'.repeat(900), 'Second?', 'Third?'], clarificationAnswers: ['a'.repeat(900), 'b'.repeat(900), 'Third answer'] });
assert.equal(bounded.clarificationQuestions.length, 2);
assert.equal(bounded.clarificationQuestions[0].length, 300);
assert.equal(bounded.clarificationAnswers[0].length, 400);
assert.equal(bounded.clarificationAnswers[1].length, 400);
assert.deepEqual(restoreWizardClarifications({ ...partial, clarificationQuestions: [], clarificationAnswers: [] }), empty, 'Changing the wish clears clarification fields');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

async function main() {
  const data = new Map<string, string>();
  const firstWrite = deferred();
  let failNext = false;
  const writes: string[] = [];
  const storage = createWizardDraftStorage({
    async getItem(key) { return data.get(key) ?? null; },
    async setItem(key, value) {
      writes.push(value);
      if (value === 'older') await firstWrite.promise;
      if (failNext) { failNext = false; throw new Error('Fixture storage failure'); }
      data.set(key, value);
    },
    async removeItem(key) { data.delete(key); },
  });
  const old = storage.setItem('account-a', 'older');
  const recent = storage.setItem('account-a', JSON.stringify(partial));
  const reopened = storage.getItem('account-a');
  await storage.setItem('account-b', 'other account');
  assert.deepEqual(writes, ['older', 'other account'], 'Another account must not wait for a blocked draft');
  firstWrite.resolve();
  await Promise.all([old, recent]);
  assert.deepEqual(JSON.parse((await reopened)!), partial, 'Reopening must wait for the latest partial answer write');
  assert.equal(data.get('account-b'), 'other account');

  const beforeDelete = storage.setItem('account-a', 'before save');
  const removed = storage.removeItem('account-a');
  const afterSave = storage.getItem('account-a');
  await Promise.all([beforeDelete, removed]);
  assert.equal(await afterSave, null, 'An earlier pending draft write must not resurrect a successfully saved goal');

  failNext = true;
  const failed = storage.setItem('account-a', 'failure');
  const recovered = storage.setItem('account-a', 'recovered');
  await assert.rejects(failed, /Fixture storage failure/);
  await recovered;
  assert.equal(await storage.getItem('account-a'), 'recovered', 'A failed write must not poison subsequent edits');
  console.log('Wizard draft: legacy/malformed restore, positional answers, raw partial text, limits, per-account ordering, removal and recovery PASS');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
