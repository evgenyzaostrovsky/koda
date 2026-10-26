import { isDeepStrictEqual } from 'node:util';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import dotenv from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createGoal } from '../src/features/koda/goalLogic';
import { normalizeStoredKodaState, type StoredKodaState } from '../src/features/koda/persistence';
import { writeAppStateSnapshot } from '../src/features/koda/syncCoordinator';
import type { Goal } from '../src/features/koda/types';

const outputPath = '.tmp/goal-context-live-result.json';
const run = `context-live-${Date.now()}-${randomBytes(3).toString('hex')}`;
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
  ensure(process.env.KODA_GOAL_CONTEXT_LIVE_TEST === '1', 'Explicit dedicated-account write opt-in required');
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
    const initialContext = '  Уже пройден первый урок.\nРесурсы: 20 минут вечером.\n\nОграничения: нужен небольшой следующий шаг.  ';
    const editedContext = 'Первый урок и упражнение завершены.\nТеперь доступно 30 минут утром.\nНе повторять пройденное.';
    const goal: Goal = {
      ...createGoal({ title: `Проверка контекста ${run}`, desiredResult: 'Освоить основы испанского языка', deadline: '', priority: 'important' }, new Date(timestamp).toISOString()),
      id: goalId, planningContext: initialContext,
    };
    const initialState = normalize(before ?? { goals: [], habits: [], projects: [], kodaDays: [] });
    initialState.goals.push(goal);
    stage = 'initial-write';
    await writeAppStateSnapshot(first.transport, owners[0], initialState);
    const freshA2 = await readRow(a2, owners[0]);
    ensure(ownGoal(freshA2).planningContext === initialContext, 'Exact multiline context round trip failed');
    checks.push('A1 write -> A2 fresh read: exact whitespace and newlines');
    const editedState = normalize(freshA2);
    editedState.goals = editedState.goals.map(item => item.id === goalId
      ? { ...item, planningContext: editedContext, updatedAt: new Date(timestamp + 1).toISOString() } : item);
    stage = 'second-client-edit';
    await writeAppStateSnapshot(second.transport, owners[0], editedState);
    const freshA1 = await readRow(a1, owners[0]);
    ensure(ownGoal(freshA1).planningContext === editedContext, 'Second client edit did not reach first client');
    checks.push('A2 edit -> A1 fresh read: updated context');
    const clearState = normalize(freshA1);
    clearState.goals = clearState.goals.map(item => item.id === goalId
      ? { ...item, planningContext: '', updatedAt: new Date(timestamp + 2).toISOString() } : item);
    first.beforeNextWrite(async () => { await writeAppStateSnapshot(second.transport, owners[0], clearState); });
    stage = 'clear-versus-stale-CAS';
    await writeAppStateSnapshot(first.transport, owners[0], initialState);
    ensure(first.counters.casMisses === 1, 'Expected real CAS conflict was not observed');
    const afterConflict = await readRow(a1, owners[0]);
    ensure(ownGoal(afterConflict).planningContext === '', 'Stale snapshot restored cleared context');
    await writeAppStateSnapshot(first.transport, owners[0], initialState);
    const after = await readRow(a2, owners[0]);
    ensure(ownGoal(after).planningContext === '', 'Repeated stale snapshot restored cleared context');
    ensure(after.goals.filter((item: Goal) => item.id === goalId).length === 1, 'Retry duplicated synthetic goal');
    checks.push('A2 clear beats A1 stale write with real CAS miss/retry and repeated stale retry');
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
      initialContext, editedContext, finalContext: '', counters: { a1: first.counters, a2: second.counters },
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
  console.error(`Live goal context check failed during ${stage}: ${reason}; see ${outputPath}`);
  process.exitCode = 1;
});
