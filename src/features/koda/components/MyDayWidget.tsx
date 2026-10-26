import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, Check, Circle, Sun } from 'lucide-react-native';
import type { PlanItemScore } from '../dayPlan';
import type { PlannerItem, TabKey } from '../types';
import { accent, activeText, line, lime, muted, panelSoft, text } from '../theme';
import { todayDateKey } from '../utils';
import { DayPlant } from './DayPlant';

export type MyDayWidgetProps = {
  tasks: PlanItemScore[];
  done: number;
  plan: boolean;
  completed: boolean;
  overviewItems: PlannerItem[];
  onOpen: (tab: TabKey) => void;
  onProgress: (item: PlanItemScore, value: number) => void;
  width: number;
  availableWidth: number;
};

export function MyDayWidget({ tasks, done, plan, completed, overviewItems, onOpen, onProgress, width, availableWidth }: MyDayWidgetProps) {
  const today = todayDateKey();
  const showPlant = width >= 680 && availableWidth >= 600;
  const todayItems = overviewItems
    .filter(item => item.date === today && !item.deletedAt && !item.done && !item.failed)
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'))
    .slice(0, 2);
  const title = completed ? 'День завершён' : `${done} из ${tasks.length} задач выполнено`;

  return (
    <View style={s.root}>
      <View style={s.heading}>
        <View style={s.icon}><Sun size={26} color={accent} /></View>
        <View style={s.headingCopy}>
          <Text accessibilityRole="header" style={s.title}>Мой день</Text>
          <Text style={s.subtitle}>{plan ? title : 'Начни с одного важного шага.'}</Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Смотреть всё: Мой день" onPress={() => onOpen('day')} style={s.headingAction}>
          {availableWidth >= 400 && <Text style={s.headingActionText}>Смотреть всё</Text>}
          <ArrowRight color={muted} size={17} />
        </Pressable>
      </View>

      <View style={s.content}>
        <View style={[s.main, showPlant && s.mainWithPlant]}>
          {plan ? <>
            <View style={s.progressRow}>
              <View accessibilityRole="progressbar" accessibilityLabel={`Выполнено ${done} из ${tasks.length} задач`} accessibilityValue={{ min: 0, max: tasks.length, now: done }} style={s.track}>
                <View style={[s.fill, { width: `${tasks.length ? Math.min(100, done / tasks.length * 100) : 0}%` }]} />
              </View>
              <Text style={s.percent}>{tasks.length ? Math.min(100, Math.round(done / tasks.length * 100)) : 0}%</Text>
            </View>
            <View style={s.taskList}>
              {tasks.slice(0, 3).map(item => {
                const source = overviewItems.find(candidate => candidate.id === item.source.plannerId || candidate.id === item.source.id || candidate.goalActionId === item.source.id);
                const category = taskCategory(item, source);
                const checked = item.completionRatio >= 1;
                return <View key={item.sourceKey} style={[s.taskRow, width < 680 && s.taskRowCompact]}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityLabel={`${checked ? 'Отменить' : 'Выполнить'}: ${item.title}`}
                    accessibilityState={{ checked, disabled: completed }}
                    aria-checked={checked}
                    disabled={completed}
                    onPress={() => onProgress(item, checked ? 0 : item.targetValue)}
                    style={s.check}
                  >{checked ? <View style={s.checked}><Check color="#fff" size={17} /></View> : <Circle color={accent} size={25} />}</Pressable>
                  <View style={[s.taskCopy, width < 680 && s.taskCopyCompact]}>
                    <Text numberOfLines={width < 680 ? 2 : 1} style={[s.taskTitle, width < 680 && s.taskTitleCompact, checked && s.done]}>{item.title}</Text>
                    <View style={s.details}>
                      <Text style={s.meta}>{source?.time || `${item.estimatedMinutes} мин`}</Text>
                      <Text style={[s.category, { backgroundColor: category.bg, color: category.color }]}>{category.label}</Text>
                    </View>
                  </View>
                </View>;
              })}
            </View>
          </> : <View style={s.empty}>
            <Text style={s.emptyCopy}>План пока не собран. Можно начать с доступного дела или выбрать задачи на день.</Text>
            {todayItems.map(item => <View key={item.id} style={s.availableRow}>
              <Text numberOfLines={1} style={s.availableTitle}>{item.title}</Text>
              <Text style={s.meta}>{item.time || 'сегодня'}</Text>
            </View>)}
          </View>}
          <Pressable accessibilityRole="button" onPress={() => onOpen('day')} style={[s.primary, showPlant && s.primaryNarrow]}>
            <Text numberOfLines={1} style={s.primaryText}>{completed ? 'Посмотреть итог дня' : plan ? 'Продолжить день' : 'Собрать мой день'}</Text>
            <ArrowRight color={activeText} size={19} />
          </Pressable>
        </View>
        {showPlant && <View style={s.plant}><DayPlant /></View>}
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
  root: { flex: 1, gap: 8, minWidth: 0 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  icon: { width: 48, height: 48, borderRadius: 18, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  headingCopy: { minWidth: 0, flex: 1, gap: 1 },
  headingAction: { minHeight: 32, borderWidth: 1, borderColor: line, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12 },
  headingActionText: { color: muted, fontSize: 12, lineHeight: 17 },
  title: { color: text, fontSize: 24, lineHeight: 29, fontWeight: '600' },
  subtitle: { color: muted, fontSize: 13, lineHeight: 18 },
  content: { flexDirection: 'row', alignItems: 'stretch', gap: 12, minWidth: 0 },
  main: { flex: 1, minWidth: 0, gap: 5 },
  mainWithPlant: { flex: 1 },
  progressRow: { minHeight: 17, flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { flex: 1, height: 10, backgroundColor: '#e0e5df', borderRadius: 9, overflow: 'hidden' },
  percent: { width: 34, color: muted, fontSize: 12, lineHeight: 17, textAlign: 'right' },
  fill: { height: '100%', backgroundColor: '#91b85f', borderRadius: 9 },
  taskList: { minWidth: 0, borderWidth: 1, borderColor: line, borderRadius: 16, paddingHorizontal: 8 },
  taskRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, borderBottomWidth: 1, borderBottomColor: line },
  taskRowCompact: { minHeight: 54, alignItems: 'center' },
  check: { width: 42, height: 44, alignItems: 'center', justifyContent: 'center' },
  checked: { width: 25, height: 25, borderRadius: 20, backgroundColor: '#426528', alignItems: 'center', justifyContent: 'center' },
  taskCopy: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  taskCopyCompact: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 1 },
  taskTitle: { color: text, fontSize: 14, lineHeight: 19, fontWeight: '500', flex: 1, minWidth: 0 },
  taskTitleCompact: { flex: 0, alignSelf: 'stretch', fontSize: 14, lineHeight: 18 },
  done: { textDecorationLine: 'line-through', color: muted },
  details: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  meta: { color: muted, fontSize: 12, lineHeight: 17 },
  category: { fontSize: 11, lineHeight: 16, paddingHorizontal: 9, borderRadius: 12, overflow: 'hidden' },
  primary: { minHeight: 42, width: '100%', borderRadius: 24, backgroundColor: lime, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, paddingHorizontal: 12, marginTop: 'auto' },
  primaryNarrow: { width: '75%', minWidth: 210 },
  primaryText: { fontSize: 14, fontWeight: '600', color: activeText },
  plant: { width: 190, alignItems: 'center', justifyContent: 'center' },
  empty: { gap: 5 },
  emptyCopy: { color: muted, fontSize: 13, lineHeight: 18 },
  availableRow: { minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderBottomWidth: 1, borderBottomColor: line },
  availableTitle: { color: text, fontSize: 13, flex: 1, minWidth: 0 },
});
