import { BarChart3, Check, Flame, Home, ListChecks, Settings, Trophy, User, Zap } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

const quests = [
  { id: '1', title: 'Пройти урок SQL 4', attribute: 'Карьера', xp: 120, completed: false },
  { id: '2', title: 'Пройти 10 000 шагов', attribute: 'Здоровье', xp: 80, completed: true },
  { id: '3', title: 'Внести минимальный платеж по кредитке', attribute: 'Финансы', xp: 100, completed: false },
  { id: '4', title: 'Позвонить сыну', attribute: 'Отношения', xp: 90, completed: false },
];

export function DashboardScreen() {
  return (
    <View style={styles.screen}>
      <View style={styles.sidebar}>
        <View style={styles.brandRow}>
          <View style={styles.avatarSmall}>
            <Text style={styles.avatarInitials}>AR</Text>
          </View>
          <View>
            <Text style={styles.brand}>ADHD RPG</Text>
            <Text style={styles.brandSub}>Развивай будущего себя</Text>
          </View>
        </View>

        <View style={styles.nav}>
          <NavItem icon={<Home size={18} color="#FFFFFF" />} label="Главная" active />
          <NavItem icon={<User size={18} color="#9A9A9A" />} label="Будущий я" />
          <NavItem icon={<ListChecks size={18} color="#9A9A9A" />} label="Квесты" />
          <NavItem icon={<BarChart3 size={18} color="#9A9A9A" />} label="Прогресс" />
        </View>

        <View style={styles.sidebarBottom}>
          <NavItem icon={<Settings size={18} color="#9A9A9A" />} label="Настройки" />
          <View style={styles.profilePill}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitial}>A</Text>
            </View>
            <View style={styles.profileText}>
              <Text style={styles.profileName}>Алексей</Text>
              <Text style={styles.profileLevel}>Уровень 12</Text>
            </View>
            <View style={styles.flameRow}>
              <Flame size={15} color="#DADADA" />
              <Text style={styles.flameText}>17</Text>
            </View>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>Доброе утро, Алексей</Text>
        <Text style={styles.subtitle}>Маленькие квесты складываются в человека, которым ты становишься.</Text>

        <View style={styles.heroCard}>
          <View style={styles.characterPortrait} />
          <View style={styles.heroCopy}>
            <View style={styles.levelRow}>
              <Text style={styles.levelBadge}>Уровень 12</Text>
              <Text style={styles.archetype}>Строитель</Text>
            </View>
            <Text style={styles.xpText}>2480 / 3200 XP</Text>
            <Text style={styles.xpMuted}>720 XP до уровня 13</Text>
          </View>
        </View>

        <View style={styles.statsGrid}>
          <MetricCard label="Серия" value="17 дней" hint="Держи ритм" />
          <MetricCard label="Всего XP" value="2 480" hint="За сезон" />
          <MetricCard label="Квесты сегодня" value="1/4" hint="Выполнено" accent="#27D17F" />
          <MetricCard label="Активные цели" value="4" hint="В работе" accent="#46B3FF" />
        </View>

        <View style={styles.mainGrid}>
          <View style={styles.questColumn}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Квесты на сегодня</Text>
              <Text style={styles.viewAll}>Все</Text>
            </View>

            <View style={styles.questList}>
              {quests.map((quest) => (
                <QuestRow key={quest.id} {...quest} />
              ))}
            </View>
          </View>

          <View style={styles.sideCards}>
            <View style={styles.sideCard}>
              <View style={styles.sideTitleRow}>
                <Trophy size={18} color="#FFFFFF" />
                <Text style={styles.sideTitle}>Главная цель</Text>
              </View>
              <Text style={styles.goalTitle}>Стать старшим дата-инженером</Text>
              <Text style={styles.goalProgress}>64%</Text>
              <View style={styles.progressTrack}>
                <View style={styles.progressFill} />
              </View>
            </View>

            <View style={styles.sideCard}>
              <View style={styles.sideTitleRow}>
                <Flame size={18} color="#FFFFFF" />
                <Text style={styles.sideTitle}>Сильнейший атрибут</Text>
              </View>
              <View style={styles.attributeRow}>
                <View style={styles.attributeIcon}>
                  <BarChart3 size={20} color="#FFFFFF" />
                </View>
                <View>
                  <Text style={styles.goalTitle}>Карьера</Text>
                  <Text style={styles.goalProgress}>Уровень 7</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function NavItem({ icon, label, active = false }: { icon: ReactNode; label: string; active?: boolean }) {
  return (
    <Pressable style={[styles.navItem, active && styles.navItemActive]}>
      {icon}
      <Text style={[styles.navText, active && styles.navTextActive]}>{label}</Text>
    </Pressable>
  );
}

function MetricCard({ label, value, hint, accent = '#FFFFFF' }: { label: string; value: string; hint: string; accent?: string }) {
  return (
    <View style={styles.metricCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, { color: accent }]}>{value}</Text>
      <Text style={styles.metricHint}>{hint}</Text>
    </View>
  );
}

function QuestRow({
  title,
  attribute,
  xp,
  completed,
}: {
  title: string;
  attribute: string;
  xp: number;
  completed: boolean;
}) {
  return (
    <View style={styles.questRow}>
      <View style={[styles.checkCircle, completed && styles.checkCircleDone]}>
        {completed ? <Check size={14} color="#FFFFFF" strokeWidth={3} /> : null}
      </View>
      <View style={styles.questText}>
        <Text style={[styles.questTitle, completed && styles.questTitleDone]}>{title}</Text>
        <Text style={styles.questAttribute}>{attribute}</Text>
      </View>
      <View style={styles.xpBadge}>
        <Zap size={14} color="#FFFFFF" />
        <Text style={styles.xpBadgeText}>{xp}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    backgroundColor: '#050505',
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    backgroundColor: '#171717',
    borderRightColor: '#303030',
    borderRightWidth: 1,
    display: 'flex',
    padding: 24,
    width: 260,
  },
  brandRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    marginBottom: 34,
  },
  avatarSmall: {
    alignItems: 'center',
    backgroundColor: '#F1F1F1',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  avatarInitials: {
    color: '#050505',
    fontSize: 13,
    fontWeight: '900',
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  brandSub: {
    color: '#A8A8A8',
    fontSize: 12,
    marginTop: 2,
  },
  nav: {
    gap: 8,
  },
  navItem: {
    alignItems: 'center',
    borderRadius: 22,
    flexDirection: 'row',
    gap: 12,
    minHeight: 42,
    paddingHorizontal: 14,
  },
  navItemActive: {
    backgroundColor: '#292929',
  },
  navText: {
    color: '#BDBDBD',
    fontSize: 15,
    fontWeight: '700',
  },
  navTextActive: {
    color: '#FFFFFF',
  },
  sidebarBottom: {
    gap: 16,
    marginTop: 'auto',
  },
  profilePill: {
    alignItems: 'center',
    borderColor: '#303030',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 12,
  },
  profileCircle: {
    alignItems: 'center',
    backgroundColor: '#292929',
    borderRadius: 18,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  profileInitial: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  profileText: {
    flex: 1,
  },
  profileName: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  profileLevel: {
    color: '#BDBDBD',
    fontSize: 12,
  },
  flameRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
  },
  flameText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  content: {
    alignSelf: 'center',
    maxWidth: 980,
    paddingHorizontal: 56,
    paddingVertical: 44,
    width: '100%',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 31,
    fontWeight: '900',
    letterSpacing: 0,
  },
  subtitle: {
    color: '#BDBDBD',
    fontSize: 14,
    marginTop: 8,
  },
  heroCard: {
    alignItems: 'center',
    backgroundColor: '#181818',
    borderColor: '#333333',
    borderRadius: 28,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 24,
    marginTop: 30,
    minHeight: 145,
    padding: 24,
  },
  characterPortrait: {
    backgroundColor: '#E8DED2',
    borderRadius: 24,
    height: 96,
    width: 96,
  },
  heroCopy: {
    gap: 11,
  },
  levelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  levelBadge: {
    backgroundColor: '#2B2B2B',
    borderRadius: 12,
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  archetype: {
    color: '#BDBDBD',
    fontSize: 14,
  },
  xpText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
  xpMuted: {
    color: '#BDBDBD',
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  metricCard: {
    backgroundColor: '#181818',
    borderColor: '#333333',
    borderRadius: 18,
    borderWidth: 1,
    flex: 1,
    minHeight: 102,
    padding: 18,
  },
  metricLabel: {
    color: '#BDBDBD',
    fontSize: 12,
    marginBottom: 8,
  },
  metricValue: {
    fontSize: 26,
    fontWeight: '900',
  },
  metricHint: {
    color: '#BDBDBD',
    fontSize: 12,
    marginTop: 6,
  },
  mainGrid: {
    flexDirection: 'row',
    gap: 24,
    marginTop: 28,
  },
  questColumn: {
    flex: 1,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '900',
  },
  viewAll: {
    color: '#BDBDBD',
    fontSize: 13,
  },
  questList: {
    gap: 10,
  },
  questRow: {
    alignItems: 'center',
    backgroundColor: '#181818',
    borderColor: '#303030',
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 66,
    paddingHorizontal: 16,
  },
  checkCircle: {
    borderColor: '#333333',
    borderRadius: 13,
    borderWidth: 2,
    height: 26,
    width: 26,
  },
  checkCircleDone: {
    alignItems: 'center',
    backgroundColor: '#219653',
    borderColor: '#219653',
    justifyContent: 'center',
  },
  questText: {
    flex: 1,
  },
  questTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  questTitleDone: {
    color: '#A8A8A8',
    textDecorationLine: 'line-through',
  },
  questAttribute: {
    color: '#A8A8A8',
    fontSize: 12,
    marginTop: 2,
  },
  xpBadge: {
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 15,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  xpBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  sideCards: {
    gap: 16,
    width: 300,
  },
  sideCard: {
    backgroundColor: '#181818',
    borderColor: '#333333',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  sideTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 14,
  },
  sideTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
  },
  goalTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    lineHeight: 20,
  },
  goalProgress: {
    color: '#BDBDBD',
    fontSize: 13,
    marginTop: 12,
  },
  progressTrack: {
    backgroundColor: '#303030',
    borderRadius: 999,
    height: 6,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    backgroundColor: '#52B96B',
    height: '100%',
    width: '64%',
  },
  attributeRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  attributeIcon: {
    alignItems: 'center',
    backgroundColor: '#2A2A2A',
    borderRadius: 18,
    height: 42,
    justifyContent: 'center',
    width: 42,
  },
});
