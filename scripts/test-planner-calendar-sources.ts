import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { createGoal, createGoalAction, createGoalRoutine } from '../src/features/koda/goalLogic';
import { goalOverviewItems } from '../src/features/koda/plannerOverview';
import { isGoalRoutinePlannerItem, plannerCalendarItems, plannerCalendarRange, type PlannerCalendarMode } from '../src/features/koda/plannerCalendarModel';
import type { Goal, PlannerItem } from '../src/features/koda/types';

const today = '2026-11-07';
const stamp = `${today}T12:00:00.000Z`;
const routine = { ...createGoalRoutine({ title: 'Учёба карпов', metricType: 'minutes', targetValue: 60, frequencyType: 'daily', startDate: '2026-01-01' }), id: 'study' };
const goal: Goal = { ...createGoal({ title: 'Учёба', desiredResult: '', deadline: '', priority: 'main' }, stamp), id: 'goal', routines: [routine] };
const before = JSON.stringify(goal);
const preview = goalOverviewItems([goal], today);
assert.deepEqual(preview.map(item => item.date), ['2026-11-07', '2026-11-08']);
assert.deepEqual(plannerCalendarRange('week', today), { from: '2026-11-02', to: '2026-11-08' });
assert.deepEqual(plannerCalendarRange('month', today), { from: '2026-10-26', to: '2026-12-06' });
const week = plannerCalendarItems([], [goal], today, 'week', 'account');
assert.equal(week.length, 7, 'full calendar must not reuse the two-occurrence preview limit');
for (const row of preview) assert.ok(week.some(item => item.id === row.id && item.date === row.date && !item.time));
assert.ok(week.every(row => row.ownerId === 'account' && row.sourceId === 'study' && row.goalId === 'goal' && isGoalRoutinePlannerItem(row)));
assert.equal(plannerCalendarItems([], [goal], '2027-02-05', 'month', 'account').length, 42, 'navigation beyond the current preview horizon expands that month');
assert.equal(plannerCalendarItems([], [goal], '2028-06-01', 'year', 'account').length, 366, 'leap-year navigation uses the actual selected year');
const logged = { ...goal, routineLogs: [{ id: 'log', routineId: 'study', date: today, value: 60, createdAt: stamp, updatedAt: stamp }] };
assert.equal(plannerCalendarItems([], [logged], today, 'day')[0].done, true);
assert.equal(plannerCalendarItems([], [logged], '2026-11-08', 'day')[0].done, false, 'completion belongs to a single occurrence');
for (const patch of [{ status: 'paused' as const }, { archivedAt: stamp }, { deletedAt: stamp }]) assert.deepEqual(plannerCalendarItems([], [{ ...goal, ...patch }], today, 'week'), []);
assert.deepEqual(plannerCalendarItems([], [{ ...goal, routines: [{ ...routine, isActive: false }] }], today, 'week'), []);
const weekdays = { ...goal, routines: [{ ...routine, frequencyType: 'selected_weekdays' as const, weekdays: [1, 5] }] };
assert.deepEqual(plannerCalendarItems([], [weekdays], today, 'week').map(row => row.date), ['2026-11-02', '2026-11-06']);
const monthly = { ...goal, routines: [{ ...routine, frequencyType: 'monthly' as const, startDate: '2026-01-31' }] };
assert.equal(plannerCalendarItems([], [monthly], '2027-02-28', 'day').length, 1);
const action = { ...createGoalAction({ title: 'Сдать работу', dueDate: today }), id: 'submit' };
const withAction = { ...goal, routines: [], actions: [action] };
const direct = plannerCalendarItems([], [withAction], today, 'day', 'account')[0];
assert.equal(direct.goalActionId, action.id); assert.equal(direct.ownerId, 'account');
assert.equal(isGoalRoutinePlannerItem(direct), false);
const assigned: PlannerItem = { ...direct, id: 'autoplan-assignment', sourceId: 'assignment', date: '2026-11-08', time: '09:00' };
assert.deepEqual(plannerCalendarItems([assigned], [withAction], today, 'day'), [], 'a moved auto assignment suppresses the original due-date projection');
assert.deepEqual(plannerCalendarItems([assigned], [withAction], '2026-11-08', 'day'), [assigned]);
assert.deepEqual(plannerCalendarItems([{ ...assigned, deletedAt: stamp }], [withAction], '2026-11-08', 'day'), []);
const deferred = { ...withAction, actions: [{ ...action, deferredUntil: '2026-11-10' }] };
assert.equal(plannerCalendarItems([], [deferred], today, 'day').length, 0);
assert.equal(plannerCalendarItems([], [deferred], '2026-11-10', 'day').length, 1);
assert.equal(JSON.stringify(goal), before, 'projection must not persist occurrences or alter the source goal');

/** Execute the real screen/calendar JSX with deterministic hook and native adapters. */
function renderModule(relative: string, exportName: string, props: any, width = 1200) {
  const filename = resolve(relative), requireReal = createRequire(filename);
  const compiled = ts.transpileModule(readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
  const make = (type: any, props: any, key?: any) => ({ type, props, key });
  const exported: any = {};
  runInNewContext(compiled, { exports: exported, require: (id: string) => {
    if (id === 'react') return { createElement: (type: any, props: any, ...children: any[]) => make(type, { ...props, children }), useState: (initial: any) => [typeof initial === 'function' ? initial() : initial, () => {}], useMemo: (make: any) => make(), useRef: (value: any) => ({ current: value }), useEffect: () => {} };
    if (id === 'react/jsx-runtime') return { jsx: make, jsxs: make, Fragment: 'Fragment' };
    if (id === 'react-native') return { Platform: { OS: 'web' }, StyleSheet: { create: (styles: any) => styles, hairlineWidth: 1 }, View: 'View', Text: 'Text', Pressable: 'Pressable', ScrollView: 'ScrollView', TextInput: 'TextInput', Modal: 'Modal', KeyboardAvoidingView: 'KeyboardAvoidingView', useWindowDimensions: () => ({ width }) };
    if (id === 'lucide-react-native') return new Proxy({}, { get: (_, key) => key });
    if (id === '../theme') return { accent: 'blue', text: 'black', panel: 'white' };
    if (id === '../styles') return { styles: {} };
    if (id === '../components/PlannerCalendar') return { PlannerCalendar: 'PlannerCalendar' };
    return requireReal(id);
  }, console });
  return exported[exportName](props);
}
function nodes(tree: any): any[] {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  return [tree, ...nodes(tree.props?.children)];
}
const manual: PlannerItem = { id: 'manual', date: today, time: '10:00', title: 'Встреча', done: false };
const project: PlannerItem = { id: 'project:p:t', date: today, time: '', title: 'Задача проекта', done: false, sourceType: 'project', sourceId: 't', ownerId: 'p' };
const screen = renderModule('src/features/koda/screens/PlannerScreen.tsx', 'PlannerScreen', { initialFocus: preview[0], isDesktop: true, items: [manual], projectItems: [project], goals: [goal], ownerId: 'account' });
const calendar = nodes(screen).find(node => node.type === 'PlannerCalendar');
assert.ok(calendar);
assert.deepEqual(Array.from(calendar.props.items, (row: PlannerItem) => row.title), ['Встреча', 'Задача проекта', 'Учёба карпов']);
for (const width of [390, 1200]) for (const mode of ['day', 'week', 'month'] as PlannerCalendarMode[]) {
  let opened: PlannerItem | undefined;
  const tree = renderModule('src/features/koda/components/PlannerCalendar.tsx', 'PlannerCalendar', { ...calendar.props, mode, items: plannerCalendarItems([manual, project], [goal], today, mode, 'account'), onOpenItem: (item: PlannerItem) => { opened = item; } }, width);
  const study = nodes(tree).filter(node => node.type === 'Pressable' && node.props.accessibilityLabel === 'Весь день: Учёба карпов');
  assert.ok(study.length >= (mode === 'day' ? 1 : mode === 'week' ? 7 : 42), `${mode}/${width}: untimed goal routine must render in actual calendar JSX`);
  study[0].props.onPress({ stopPropagation() {} });
  assert.equal(opened?.sourceId, 'study'); assert.equal(opened?.ownerId, 'account');
}
console.log('planner calendar sources: preview parity, full-period recurrence, source identity, dates, deduplication and real screen/calendar rendering PASS');

import { toggleGoalCalendarItem, moveGoalCalendarAction } from '../src/features/koda/plannerCalendarModel';
const occurrence=week.find(item=>item.date===today)!;
const completedGoal=toggleGoalCalendarItem([goal],occurrence,'account',stamp)[0];
assert.equal(plannerCalendarItems([],[completedGoal],today,'day','account')[0].done,true);
assert.equal(plannerCalendarItems([],[completedGoal],'2026-11-08','day','account')[0].done,false);
const toggledBack=toggleGoalCalendarItem([completedGoal],{...occurrence,done:true},'account',stamp)[0];
assert.equal(plannerCalendarItems([],[toggledBack],today,'day','account')[0].done,false);
assert.equal(toggleGoalCalendarItem([goal],occurrence,'other',stamp)[0],goal);
const moved=moveGoalCalendarAction([deferred],direct,'2026-11-08','account',stamp)[0];
assert.equal(moved.actions[0].dueDate,'2026-11-08');
assert.equal(moved.actions[0].deferredUntil,undefined);
assert.equal(moveGoalCalendarAction([goal],occurrence,'2026-11-08','account',stamp)[0],goal);
assert.equal(toggleGoalCalendarItem([withAction],direct,'account',stamp)[0].actions[0].status,'completed');
console.log('Calendar edits update the owning action or single routine occurrence, with account guard PASS');
