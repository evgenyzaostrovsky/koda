import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, Heart, Leaf, Moon, Palette, Sun, Waves } from 'lucide-react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import type { PlannerItem, TabKey, ThemeId } from '../types';
import { accent, accentSoft, activeText, line, muted, panel, panelSoft, text } from '../theme';

type SupportAction = { label: string; icon: typeof Waves };
const supportActions: SupportAction[] = [
  { label: 'Выпить воды', icon: Waves },
  { label: 'Пауза для себя', icon: Sun },
  { label: 'Выйти на воздух', icon: Leaf },
];

export function CalmSupport({
  date,
  items,
  onAddItem,
  onOpenSection,
  onThemeChange,
  onToggleItem,
  themeId,
}: {
  date: string;
  items: PlannerItem[];
  onAddItem: (item: Pick<PlannerItem, 'date' | 'time' | 'title'>) => void;
  onOpenSection?: (tab: TabKey) => void;
  onThemeChange?: (id: ThemeId) => void;
  onToggleItem: (id: string) => void;
  themeId?: ThemeId;
}) {
  const dayItems = useMemo(() => items.filter((item) => item.date === date && !item.deletedAt), [date, items]);
  const accentChoice = themeId?.includes('sky') ? 'sky' : themeId?.includes('lavender') ? 'lavender' : 'sage';
  const isDark = themeId?.endsWith('dark') ?? false;
  const gradientColors = isDark
    ? accentChoice === 'sky' ? ['#2c3942', '#202722'] : accentChoice === 'lavender' ? ['#383342', '#202722'] : ['#2b3e31', '#202722']
    : accentChoice === 'sky' ? ['#e8eff4', '#f8f9f6'] : accentChoice === 'lavender' ? ['#efecf5', '#f8f9f6'] : ['#e8f0e9', '#f8f9f6'];
  const themes: { id: ThemeId; label: string; color: string }[] = [
    { id: isDark ? 'calm-dark' : 'calm-light', label: 'Шалфей', color: '#638b73' },
    { id: isDark ? 'calm-sky-dark' : 'calm-sky-light', label: 'Небо', color: '#6488a4' },
    { id: isDark ? 'calm-lavender-dark' : 'calm-lavender-light', label: 'Лаванда', color: '#887ba7' },
  ];

  function toggleSupportAction(label: string) {
    const matches = dayItems.filter((item) => item.title.trim().toLocaleLowerCase('ru-RU') === label.toLocaleLowerCase('ru-RU'));
    const item = matches[0];
    if (item) onToggleItem(item.id);
    else onAddItem({ date, time: '', title: label });
  }

  return (
    <View style={styles.root}>
      <View style={styles.quietCard}>
        <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Defs><LinearGradient id="quiet-support-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={gradientColors[0]} />
            <Stop offset="100%" stopColor={gradientColors[1]} />
          </LinearGradient></Defs>
          <Rect width="100%" height="100%" fill="url(#quiet-support-gradient)" />
        </Svg>
        <View style={styles.quietIcon}><Heart color={accent} size={17} /></View>
        <Text style={styles.kicker}>ТИХАЯ ПОДДЕРЖКА</Text>
        <Text style={styles.quietTitle}>Необязательно успеть всё, чтобы день удался</Text>
        <Text style={styles.copy}>Выбери один следующий шаг. Остальное можно перенести без чувства вины</Text>
        <Text style={styles.quietFooter}>Твой темп — подходящий.</Text>
        <Pressable accessibilityRole="button" onPress={() => onOpenSection?.('timer')} style={styles.quietAction}>
          <Moon color={accent} size={15} />
          <Text style={styles.quietActionText}>Сделать паузу</Text>
        </Pressable>
      </View>

      <View style={styles.card}>
        <Text style={styles.heading}>Мягкие опоры</Text>
        <Text style={styles.subheading}>Маленькие заботы о себе</Text>
        {supportActions.map(({ icon: Icon, label }) => {
          const item = dayItems.find((candidate) => candidate.title.trim().toLocaleLowerCase('ru-RU') === label.toLocaleLowerCase('ru-RU'));
          return (
            <Pressable key={label} accessibilityRole="button" accessibilityState={{ checked: Boolean(item?.done) }} onPress={() => toggleSupportAction(label)} style={styles.supportRow}>
              <View style={styles.supportIcon}><Icon color={accent} size={15} /></View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[styles.supportLabel, item?.done && styles.completed]}>{label}</Text>
                <Text style={styles.supportStatus}>{item?.done ? 'Готово' : item?.failed ? 'Не выполнено · нажми, если сделано' : item ? 'В планнере · отметить выполненным' : 'Добавить в день'}</Text>
              </View>
              <View style={[styles.check, item?.done && styles.checked]}>{item?.done ? <Check color={activeText} size={12} strokeWidth={3} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.card}>
        <View style={styles.moodHeading}><Palette color={accent} size={15} /><Text style={styles.heading}>Цвет настроения</Text></View>
        <View style={styles.swatches}>
          {themes.map((theme, index) => {
            const selected = index === (accentChoice === 'sky' ? 1 : accentChoice === 'lavender' ? 2 : 0);
            return <Pressable key={theme.label} accessibilityRole="button" accessibilityLabel={`Цвет ${theme.label}`} accessibilityState={{ selected }} onPress={() => onThemeChange?.(theme.id)} style={[styles.swatchButton, selected && styles.swatchSelected]}>
              <View style={[styles.swatch, { backgroundColor: theme.color }]} />
              <Text style={styles.swatchLabel}>{theme.label}</Text>
            </Pressable>;
          })}
        </View>
      </View>
      <Text style={styles.footer}>Только для тебя · без оценок</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12, marginTop: 12 },
  card: { backgroundColor: panel, borderColor: line, borderWidth: 1, borderRadius: 18, padding: 16 },
  quietCard: { overflow: 'hidden', backgroundColor: accentSoft, borderColor: line, borderWidth: 1, borderRadius: 19, padding: 17 },
  quietIcon: { width: 31, height: 31, borderRadius: 11, backgroundColor: panel, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  kicker: { color: accent, fontSize: 9, fontWeight: '700', letterSpacing: 1.2 },
  quietTitle: { color: text, fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 8 },
  copy: { color: muted, fontSize: 11, lineHeight: 17, marginTop: 6 },
  quietFooter: { color: accent, fontSize: 10, fontWeight: '600', marginTop: 9 },
  quietAction: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'flex-start', backgroundColor: panel, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, marginTop: 13 },
  quietActionText: { color: accent, fontSize: 10, fontWeight: '600' },
  heading: { color: text, fontSize: 12, fontWeight: '700' },
  subheading: { color: muted, fontSize: 10, marginTop: 4, marginBottom: 9 },
  supportRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: line },
  supportIcon: { width: 26, height: 26, borderRadius: 9, backgroundColor: panelSoft, alignItems: 'center', justifyContent: 'center' },
  supportLabel: { color: text, fontSize: 10, fontWeight: '600' },
  supportStatus: { color: muted, fontSize: 9 },
  completed: { color: muted, textDecorationLine: 'line-through' },
  check: { width: 17, height: 17, borderRadius: 6, borderWidth: 1, borderColor: line, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: accent, borderColor: accent },
  moodHeading: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  swatches: { flexDirection: 'row', gap: 8, marginTop: 12 },
  swatchButton: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: 'transparent' },
  swatchSelected: { borderColor: line, backgroundColor: panelSoft },
  swatch: { width: 19, height: 19, borderRadius: 10 },
  swatchLabel: { color: muted, fontSize: 9 },
  footer: { color: muted, fontSize: 9, textAlign: 'center', paddingVertical: 2 },
});
