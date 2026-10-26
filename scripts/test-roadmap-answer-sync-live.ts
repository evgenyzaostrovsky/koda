import { isDeepStrictEqual } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createGoal } from '../src/features/koda/goalLogic';
import { getActiveRoadmapClarifications as active, upsertRoadmapQuestions, updateRoadmapAnswer, clearRoadmapClarifications } from '../src/features/koda/goalRoadmapClarifications';
import { normalizeStoredKodaState, type StoredKodaState } from '../src/features/koda/persistence';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Goal } from '../src/features/koda/types';

const outputPath = '.tmp/roadmap-answer-sync-live-result.json';
const run = `roadmap-answers-live-${Date.now()}-${randomBytes(3).toString('hex')}`;
const goalId = run;
const checks: string[] = [];
let stage = 'configuration';
class CheckFailure extends Error {}
function ensure(condition: unknown, message: string): asserts condition {
  if (!condition) throw new CheckFailure(message);
}
// Errors deliberately contain only our fixed labels, never SDK error objects,
// credentials, auth requests, or existing account contents.
async function readRow(client: SupabaseClient, owner: string) {
  const result = await client.from('user_app_state').select('*').eq('user_id', owner).maybeSingle();
  ensure(!result.error, 'App state read failed');
  return result.data;
}
function normalize(row: unknown): StoredKodaState {
  const state = normalizeStoredKodaState(row);
  ensure(state, 'App state normalization failed');
  return state;
}
function ownGoal(row: unknown) {
  const goal = normalize(row).goals.find(item => item.id === goalId);
  ensure(goal, 'Synthetic goal missing');
  return goal;
}

// Run the application's actual normalization, merge, CAS and retry code.
// A narrow write guard forwards only its computed synthetic goal and row
// version. All unrelated raw JSON (including legacy fields) stays untouched.
// This intentionally does not test the full unguarded multi-domain payload.
function guardedClient(client: SupabaseClient, owner: string) {
  let current: any;
  let beforeWrite: (() => Promise<void>) | undefined;
  const counters = { reads: 0, writes: 0, casMisses: 0 };
  const transport = {
    from(table: string) {
      ensure(table === 'user_app_state', 'Unexpected table');
      return {
        select(columns: string) {
          ensure(columns === '*', 'Unexpected read projection');
          return { eq(column: string, value: string) {
            ensure(column === 'user_id' && value === owner, 'Unexpected read owner');
            return { async maybeSingle() {
              current = await readRow(client, owner);
              ensure(!current || Array.isArray(current.goals), 'Existing test goals must be an array');
              counters.reads++;
              return { data: current, error: null };
            } };
          } };
        },
        insert(payload: Record<string, any>) {
          ensure(!current && payload.user_id === owner, 'Unexpected initial write');
          ensure(payload.goals.length === 1 && payload.goals[0].id === goalId, 'Unexpected initial goals');
          return client.from(table).insert(payload);
        },
        update(payload: Record<string, any>) {
          ensure(current && payload.user_id === owner, 'Unexpected write owner');
          const synthetic = payload.goals.filter((goal: Goal) => goal.id === goalId);
          ensure(synthetic.length === 1, 'Synthetic goal must be unique');
          const goals = current.goals.filter((goal: Goal) => goal.id !== goalId);
          goals.push(synthetic[0]);
          let query = client.from(table).update({ goals, updated_at: payload.updated_at });
          const filters: Record<string, string> = {};
          const builder = {
            eq(column: string, value: string) {
              ensure(column === 'user_id' || column === 'updated_at', 'Unexpected CAS filter');
              filters[column] = value;
              query = query.eq(column, value);
              return builder;
            },
            select(columns: string) {
              ensure(columns === 'user_id', 'Unexpected write projection');
              return { async maybeSingle() {
                ensure(filters.user_id === owner && filters.updated_at === current.updated_at, 'CAS required');
                const hook = beforeWrite;
                beforeWrite = undefined;
                if (hook) await hook();
                const result = await query.select(columns).maybeSingle();
                ensure(!result.error, 'App state write failed');
                counters.writes++;
                if (!result.data) counters.casMisses++;
                return result;
              } };
            },
          };
          return builder;
        },
      };
    },
  };
  return { transport, counters, beforeNextWrite(hook: () => Promise<void>) { beforeWrite = hook; } };
}

async function main() {
  await mkdir('.tmp', { recursive: true });
  ensure(process.env.KODA_ROADMAP_ANSWERS_LIVE_TEST === '1', 'Explicit dedicated-account write opt-in required');
  dotenv.config({ path: '.env.local', quiet: true });
  dotenv.config({ quiet: true });
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  ensure(url && key, 'Public Supabase configuration missing');
  ensure(new URL(url).hostname === 'beeymkytqkgdyytzdlfx.supabase.co', 'Unexpected Supabase project');
  const accounts = JSON.parse(await readFile('.env.chat-sync.local', 'utf8'));
  ensure(Array.isArray(accounts) && accounts.length >= 2, 'Dedicated account fixture missing');
  const clients = Array.from({ length: 3 }, () => createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }));
  try {
    stage = 'login';
    const owners: string[] = [];
    for (let i = 0; i < clients.length; i++) {
      const account = accounts[i < 2 ? 0 : 1];
      const result = await clients[i].auth.signInWithPassword({ email: account.email, password: account.password });
      if (result.error) {
        console.error(JSON.stringify({ stage: 'login', clientIndex: i,
          status: typeof result.error.status === 'number' ? result.error.status : null,
          code: /^[a-z_0-9]+$/i.test(result.error.code ?? '') ? result.error.code : null,
          networkFailure: /fetch failed|network|timeout/i.test(result.error.message) }));
      }
      ensure(!result.error && result.data.user, 'Dedicated account login failed');
      owners.push(result.data.user.id);
    }
    ensure(owners[0] === owners[1] && owners[0] !== owners[2], 'Independent account sessions mismatch');
    const [a1, a2, b] = clients;
    stage = 'initial-read';
    const before = await readRow(a1, owners[0]);
    ensure(!before || Array.isArray(before.goals), 'Existing test goals must be an array');
    ensure(!before?.goals.some((goal: Goal) => goal.id === goalId), 'Synthetic ID collision');
    const bBefore = await readRow(b, owners[2]);
    const first = guardedClient(a1, owners[0]), second = guardedClient(a2, owners[0]);
    const timestamp = Date.now();
    const now = (offset: number) => new Date(timestamp + offset).toISOString();
    const goal: Goal = {
      ...createGoal({ title: `Проверка ответов ${run}`, desiredResult: 'Освоить основы SQL', deadline: '', priority: 'important' }, now(0)),
      id: goalId, planningContext: 'Учусь после работы',
    };
    const questions = upsertRoadmapQuestions(goal, ['Что уже умеешь?', 'Какие ресурсы есть?'], now(1));
    const edit = (item: Goal, question: string, value: string, offset: number) => {
      const pair = active(item).find(pair => pair.question === question);
      ensure(pair, 'Expected synthetic question missing');
      return updateRoadmapAnswer(item, pair.id, value, now(offset));
    };
    const save = (transport: any, item: Goal) => {
      const snapshot = normalize({ goals: [item] });
      return writeAppStateSnapshot(transport, owners[0], snapshot);
    };
    const initialAnswer = '  Основы SQL\n\nСохраняем пробелы  ';
    const a1Draft = edit(questions, 'Что уже умеешь?', initialAnswer, 2);
    stage = 'initial-write';
    await save(first.transport, a1Draft);
    const freshA2 = await readRow(a2, owners[0]);
    ensure(active(ownGoal(freshA2)).find(pair => pair.question === 'Что уже умеешь?')?.answer === initialAnswer, 'Exact multiline answer round trip failed');
    checks.push('A1 write -> A2 fresh read: exact raw multiline answer');
    // Both devices edit their own earlier question snapshots. Forced write interleave
    // deterministically exercises the hosted CAS miss and re-read path.
    const a2Draft = edit(questions, 'Какие ресурсы есть?', 'Ноутбук и два вечера', 3);
    const a1Updated = edit(a1Draft, 'Что уже умеешь?', 'SELECT и JOIN', 4);
    first.beforeNextWrite(async () => { await save(second.transport, a2Draft); });
    stage = 'concurrent-pair-edits';
    await save(first.transport, a1Updated);
    ensure(first.counters.casMisses >= 1, 'Expected real CAS conflict was not observed');
    const both = ownGoal(await readRow(a2, owners[0]));
    ensure(active(both).find(pair => pair.question === 'Что уже умеешь?')?.answer === 'SELECT и JOIN', 'First device answer lost');
    ensure(active(both).find(pair => pair.question === 'Какие ресурсы есть?')?.answer === 'Ноутбук и два вечера', 'Second device answer lost');
    checks.push('Independent pair edits preserved through actual hosted CAS miss/retry');
    stage = 'clear-versus-stale';
    const cleared = clearRoadmapClarifications(both, now(5));
    await save(second.transport, cleared);
    await save(first.transport, a1Draft);
    await save(first.transport, a1Draft);
    const after = await readRow(a2, owners[0]);
    ensure(active(ownGoal(after)).length === 0, 'Stale retry resurrected cleared answers');
    ensure(after.goals.filter((item: Goal) => item.id === goalId).length === 1, 'Retry duplicated synthetic goal');
    checks.push('A2 tombstone survives A1 stale write and repeated retry');
    stage = 'preservation-and-account-isolation';
    const untouched = (row: any) => {
      const { updated_at: _version, ...rest } = row;
      return { ...rest, goals: row.goals.filter((item: Goal) => item.id !== goalId) };
    };
    if (before) ensure(isDeepStrictEqual(untouched(before), untouched(after)), 'Unrelated account state changed');
    else ensure(after.goals.length === 1, 'Initial write added unrelated goals');
    const foreign = await b.from('user_app_state').select('user_id').eq('user_id', owners[0]);
    ensure(!foreign.error && foreign.data?.length === 0, 'Other account can read foreign app state');
    const bAfter = await readRow(b, owners[2]);
    ensure(isDeepStrictEqual(bBefore, bAfter), 'Account B state changed');
    ensure(!bAfter || !normalize(bAfter).goals.some(item => item.id === goalId), 'Synthetic goal leaked to B');
    checks.push('Account B foreign-row read empty; B unchanged; no synthetic goal in B');
    checks.push(before ? 'All pre-existing A row data preserved exactly except row updated_at' : 'A had no app state row; created defaults with exactly one synthetic goal');
    await writeFile(outputPath, JSON.stringify({
      passed: true, run, goalId, title: goal.title, accountFixtureIndex: 0,
      project: 'beeymkytqkgdyytzdlfx', checkedAt: new Date().toISOString(), checks,
      finalActiveAnswers: 0, counters: { a1: first.counters, a2: second.counters },
      limitations: ['Independent SDK sessions, not physical devices or browser reload', 'Write guard preserves all non-test-goal data; full multi-domain payload not tested', 'AI requests and published UI are checked separately by coordinator'],
    }, null, 2));
    console.log(JSON.stringify({ passed: true, run, goalId, outputPath, checks }));
  } finally {
    await Promise.allSettled(clients.map(client => client.auth.signOut({ scope: 'local' })));
  }
}

main().catch(async error => {
  // A fixed stage-only failure report prevents accidental secret/data exposure.
  const reason = error instanceof CheckFailure ? error.message : 'Unexpected runtime or transport failure';
  await writeFile(outputPath, JSON.stringify({ passed: false, run, goalId, stage, checks, error: reason }, null, 2));
  console.error(`Live roadmap answers check failed during ${stage}: ${reason}; see ${outputPath}`);
  process.exitCode = 1;
});
