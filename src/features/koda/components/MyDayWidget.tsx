import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, Circle, Sun } from 'lucide-react-native';
import type { PlanItemScore } from '../dayPlan';
import type { PlannerItem, TabKey } from '../types';
import { accent, activeText, line, lime, muted, panelSoft, text } from '../theme';
import { todayDateKey } from '../utils';

export type MyDayWidgetProps = {
  tasks: PlanItemScore[];
  done: number;
  plan: boolean;
  completed: boolean;
  overviewItems: PlannerItem[];
  onOpen: (tab: TabKey) => void;
  onProgress: (item: PlanItemScore, value: number) => void;
  width: number;
};

export function MyDayWidget({ tasks, done, plan, completed, overviewItems, onOpen, onProgress, width }: MyDayWidgetProps) {
  const today = todayDateKey();
  const todayItems = overviewItems
    .filter(item => item.date === today && !item.deletedAt && !item.done && !item.failed)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
      .slice(0, 2);
  const title = completed ? 'День завершён' : `${done} из ${tasks.length} задач выполнено`;

  return (
    <View style={s.root}>
      <View style={s.heading}>
        <View style={s.icon}><Sun size={19} color={accent} /></View>
        <View style={s.headingCopy}>
          <Text accessibilityRole="header" style={s.title}>Мой день</Text>
          <Text numberOfLines={1} style={s.subtitle}>{plan ? title : 'План на сегодня'}</Text>
        </View>
      </View>

      <View style={s.main}>
          {plan && tasks.length ? <>
            <View style={s.progressRow}>
              <View accessibilityRole="progressbar" accessibilityLabel={`Выполнено ${done} из ${tasks.length} задач`} accessibilityValue={{ min: 0, max: tasks.length, now: done }} style={s.track}>
                <View style={[s.fill, { width: `${tasks.length ? Math.min(100, done / tasks.length * 100) : 0}%` }]} />
              </View>
              <Text style={s.percent}>{tasks.length ? Math.min(100, Math.round(done / tasks.length * 100)) : 0}%</Text>
            </View>
            <View style={s.taskList}>
              {tasks.slice(0, 2).map(item => {
                const source = overviewItems.find(candidate => candidate.id === item.source.plannerId || candidate.id === item.source.id || candidate.goalActionId === item.source.id);
                const category = taskCategory(item, source);
                const checked = item.completionRatio >= 1;
                return <View key={item.sourceKey} style={s.taskRow}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${checked ? 'Отменить' : 'Выполнить'}: ${item.title}`}
                    accessibilityState={{ checked, disabled: completed }}
                    aria-checked={checked}
                    disabled={completed}
                    onPress={() => onProgress(item, checked ? 0 : item.targetValue)}
                    style={s.check}
                  >{checked ? <View style={s.checked}><Check color="#fff" size={17} /></View> : <Circle color={accent} size={25} />}</Pressable>
                  <View style={s.taskCopy}>
                    <Text numberOfLines={width < 680 ? 2 : undefined} style={[s.taskTitle, checked && s.done]}>{item.title}</Text>
                    <View style={s.details}>
                      <Text style={s.meta}>{source?.time || `${item.estimatedMinutes} мин`}</Text>
                      <Text style={[s.category, { backgroundColor: category.bg, color: category.color }]}>{category.label}</Text>
                    </View>
                  </View>
                </View>;
              })}
            </View>
            {tasks.length > 2 ? <Text style={s.meta}>Ещё {tasks.length - 2} в плане</Text> : null}
          </> : <View style={s.empty}>
            <Text style={s.emptyCopy}>{plan ? 'В плане пока нет дел.' : 'План не собран. Выбери задачи на сегодня.'}</Text>
            {todayItems.map(item => <View key={item.id} style={s.availableRow}>
              <Text numberOfLines={1} style={s.availableTitle}>{item.title}</Text>
              <Text style={s.meta}>{item.time || 'сегодня'}</Text>
            </View>)}
          </View>}
          <Pressable accessibilityRole="button" onPress={() => onOpen('day')} style={s.primary}>
            <Text numberOfLines={1} style={s.primaryText}>{completed ? 'Посмотреть итог дня' : plan ? 'Продолжить день' : 'Собрать мой день'}</Text>
            <ArrowRight color={activeText} size={16} />
          </Pressable>
      </View>
    </View>
  );
}

function taskCategory(item: PlanItemScore, source?: PlannerItem) {
  if (source?.sourceType === 'project' || item.sourceKey.startsWith('project:')) return { label: 'Проект', bg: '#e5efff', color: '#285ca2' };
  if (/трениров|прогул|зарядк|разминк|здоров/i.test(item.title)) return { label: 'Здоровье', bg: '#ffedd9', color: '#925521' };
  if (/SQL|Python|урок|уч[её]б|курс|Pandas|прочита|конспект/i.test(item.title)) return { label: 'Учёба', bg: '#e8efcf', color: '#4c642a' };
  return item.category === 'goal' ? { label: 'Цель', bg: '#e8efcf', color: '#4c642a' } : { label: 'Дело', bg: '#e9edde', color: '#4b5847' };
}

const s = StyleSheet.create({
  root: { flex: 1, gap: 6, minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 34 },
  icon: { width: 32, height: 32, borderRadius: 12, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { minWidth: 0, flex: 1, gap: 0 },
  title: { color: text, fontSize: 18, lineHeight: 22, fontWeight: '600' },
  subtitle: { color: muted, fontSize: 11, lineHeight: 15 },
  main: { flex: 1, minWidth: 0, gap: 5 },
  progressRow: { minHeight: 14, flexDirection: 'row', alignItems: 'center', gap: 7 },
  track: { flex: 1, height: 7, backgroundColor: '#e0e5df', borderRadius: 9, overflow: 'hidden' },
  percent: { width: 30, color: muted, fontSize: 11, lineHeight: 14, textAlign: 'right' },
  fill: { height: '100%', backgroundColor: '#91b85f', borderRadius: 9 },
  taskList: { minWidth: 0 },
  taskRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: line },
  check: { width: 30, height: 32, alignItems: 'center', justifyContent: 'center' },
  checked: { width: 21, height: 21, borderRadius: 20, backgroundColor: '#426528', alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  taskTitle: { color: text, fontSize: 13, lineHeight: 17, fontWeight: '500', flex: 1, minWidth: 0 },
  done: { textDecorationLine: 'line-through', color: muted },
  details: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 },
  meta: { color: muted, fontSize: 11, lineHeight: 15 },
  category: { fontSize: 10, lineHeight: 14, paddingHorizontal: 7, borderRadius: 12, overflow: 'hidden' },
  primary: { minHeight: 32, alignSelf: 'flex-start', borderRadius: 18, backgroundColor: lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 11, marginTop: 2 },
  primaryText: { fontSize: 12, fontWeight: '600', color: activeText },
  empty: { gap: 5 },
  emptyCopy: { color: muted, fontSize: 12, lineHeight: 16 },
  availableRow: { minHeight: 27, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line },
  availableTitle: { color: text, fontSize: 12, flex: 1, minWidth: 0 },
});
