import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Settings } from 'lucide-react-native';
import { accent, accentSoft, line, muted, panelSoft, text } from '../theme';
import type { AccountInfo, KodaDay, PlannerItem } from '../types';

export function accountDisplayName(account: AccountInfo | null) {
  return account?.name?.trim() || account?.username?.trim() || 'Мой профиль';
}

export function AccountAvatar({ name, onPress }: { name: string; onPress?: () => void }) {
  const initials = name === 'Мой профиль' ? 'К' : name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <Pressable accessibilityRole="button" accessibilityLabel={`Открыть профиль: ${name}`} onPress={onPress} style={identity.avatar}><Text style={identity.initials}>{initials}</Text></Pressable>;
}

export function WorkspaceIdentity({ account, days, items, collapsed, onProfile }: {
  account: AccountInfo | null; days: KodaDay[]; items: PlannerItem[]; collapsed: boolean; onProfile: () => void;
}) {
  const name = accountDisplayName(account);
  const dates = new Set(Array.from({ length: 7 }, (_, index) => {
    const day = new Date(); day.setDate(day.getDate() - index);
    return `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
  }));
  const activeDates = new Set([
    ...days.filter(day => day.status !== 'not_started' && dates.has(day.localDate)).map(day => day.localDate),
    ...items.filter(item => !item.deletedAt && item.done && dates.has(item.date)).map(item => item.date),
  ]);
  return <View style={identity.footer}>
    {!collapsed ? <>
      <View style={identity.movement}>
        <Text style={identity.title}>Ты уже в движении</Text>
        <Text style={identity.copy}>Маленький шаг тоже считается.</Text>
        <Text style={identity.copy}>{activeDates.size ? `За последние 7 дней движение отмечено в ${activeDates.size} из 7 дней.` : 'Начни с одного посильного дела. Здесь появится твой ритм за последние 7 дней.'}</Text>
        <View accessibilityLabel={`Активность: ${activeDates.size} из 7 дней`} style={identity.track}><View style={[identity.fill, { width: `${activeDates.size / 7 * 100}%` }]} /></View>
      </View>
      <Text style={identity.label}>НАСТРОЙКИ</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Настройки" onPress={onProfile} style={identity.settings}><Settings size={18} color={muted} /><Text style={identity.settingsText}>Настройки</Text></Pressable>
    </> : null}
    <View style={[identity.profile, collapsed && { justifyContent: 'center' }]}>
      <AccountAvatar name={name} onPress={onProfile} />
      {!collapsed ? <Pressable accessibilityRole="button" accessibilityLabel={`Профиль ${name}`} onPress={onProfile} style={{ flex: 1, minWidth: 0 }}><Text numberOfLines={1} style={identity.title}>{name}</Text><Text style={identity.copy}>Моё пространство</Text></Pressable> : null}
    </View>
  </View>;
}

const identity = StyleSheet.create({
  footer: { gap: 8 },
  movement: { backgroundColor: panelSoft, borderWidth: 1, borderColor: line, borderRadius: 16, padding: 14, gap: 4, marginBottom: 6 },
  title: { color: text, fontWeight: '600', fontSize: 12, lineHeight: 17 },
  copy: { color: muted, fontSize: 11, lineHeight: 16 },
  track: { height: 5, borderRadius: 8, backgroundColor: line, overflow: 'hidden', marginTop: 8 },
  fill: { height: 5, backgroundColor: accent, borderRadius: 8 },
  label: { color: muted, fontSize: 10, letterSpacing: 1.1, paddingHorizontal: 10 },
  settings: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 10 },
  settingsText: { color: muted, fontSize: 13 },
  profile: { flexDirection: 'row', gap: 9, alignItems: 'center', borderTopWidth: 1, borderTopColor: line, paddingTop: 10, paddingBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: accentSoft, alignItems: 'center', justifyContent: 'center' },
  initials: { color: accent, fontWeight: '700', fontSize: 12 },
});
