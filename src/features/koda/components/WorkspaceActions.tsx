import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Bell, Moon, Sun, X } from 'lucide-react-native';
import { AccountAvatar, accountDisplayName } from './WorkspaceIdentity';
import { line, muted, panel, panelSoft, resolveKodaThemeId, text } from '../theme';
import type { AccountInfo, PlannerItem, TabKey, ThemeId } from '../types';
import { todayDateKey } from '../utils';

export function WorkspaceActions({ account, themeId, onThemeChange, items, syncText, onOpenSection }: {
  account: AccountInfo | null; themeId: ThemeId; onThemeChange: (id: ThemeId) => void;
  items: PlannerItem[]; syncText: string; onOpenSection: (tab: TabKey) => void;
}) {
  const [open, setOpen] = useState(false);
  const id = resolveKodaThemeId(themeId);
  const upcoming = items.filter(item => !item.deletedAt && !item.done && !item.failed && item.date >= todayDateKey())
    .sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)).slice(0, 5);
  function navigate(tab: TabKey) { setOpen(false); onOpenSection(tab); }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel="Переключить светлую и тёмную тему" onPress={() => onThemeChange(resolveKodaThemeId(id.endsWith('dark') ? id.replace('dark', 'light') : id.replace('light', 'dark')))} style={s.icon}>
      {id.endsWith('dark') ? <Sun size={19} color={muted} /> : <Moon size={19} color={muted} />}
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Уведомления" accessibilityState={{ expanded: open }} onPress={() => setOpen(true)} style={s.icon}><Bell size={19} color={muted} /></Pressable>
    <AccountAvatar name={accountDisplayName(account)} onPress={() => navigate('profile')} />
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={s.overlay}><View accessibilityViewIsModal style={s.sheet}>
        <View style={s.heading}><Text style={s.title}>Уведомления</Text><Pressable accessibilityRole="button" accessibilityLabel="Закрыть уведомления" onPress={() => setOpen(false)} style={s.icon}><X size={18} color={muted} /></Pressable></View>
        <Text style={s.meta}>{syncText}</Text>
        <Text style={s.section}>Ближайшие дела</Text>
        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ gap: 8 }}>
          {upcoming.length ? upcoming.map(item => <Pressable key={item.id} accessibilityRole="button" onPress={() => navigate('planner')} style={s.item}><Text style={s.itemTitle}>{item.title}</Text><Text style={s.meta}>{item.date === todayDateKey() ? 'Сегодня' : item.date} · {item.time || 'без времени'}</Text></Pressable>) : <Text style={s.meta}>Ближайших дел нет. Сейчас всё спокойно.</Text>}
        </ScrollView>
        <Pressable accessibilityRole="button" onPress={() => navigate('profile')} style={s.item}><Text style={s.itemTitle}>Настроить уведомления</Text><Text style={s.meta}>Разрешения и подписка в настройках профиля</Text></Pressable>
      </View></View>
    </Modal>
  </>;
}

const s = StyleSheet.create({
  icon: { backgroundColor: panel, borderWidth: 1, borderColor: line, borderRadius: 14, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, backgroundColor: 'rgba(20,30,23,.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheet: { width: '100%', maxWidth: 420, backgroundColor: panel, padding: 22, borderRadius: 22, borderWidth: 1, borderColor: line, gap: 14 },
  heading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: text, fontSize: 20, fontWeight: '600' },
  section: { color: text, fontSize: 14, fontWeight: '600', marginTop: 8 },
  meta: { color: muted, fontSize: 12, lineHeight: 18 },
  item: { backgroundColor: panelSoft, borderColor: line, borderWidth: 1, borderRadius: 14, minHeight: 48, padding: 12, gap: 4 },
  itemTitle: { color: text, fontSize: 14 },
});
