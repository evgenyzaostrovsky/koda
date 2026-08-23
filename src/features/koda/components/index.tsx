import type { ReactNode } from 'react';
import { useState } from 'react';
import { Modal, Pressable, Text, TextInput, View } from 'react-native';
import { Menu, Plus, X } from 'lucide-react-native';
import type { TabKey } from '../types';
import { accent, faint, muted, panel } from '../theme';
import { styles } from '../styles';

type BottomNavTab = { key: TabKey; label: string; icon: (active: boolean) => ReactNode };

export function Header({ isOnline, syncText, hasPendingSync, onMenuPress }: { hasPendingSync: boolean; isOnline: boolean; onMenuPress: () => void; syncText: string }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        <Pressable accessibilityLabel="Открыть меню" onPress={onMenuPress} style={styles.mobileMenuButton}>
          <Menu color={muted} size={22} />
        </Pressable>
        <View style={styles.headerSync}>
          <View style={[styles.syncStripDot, isOnline && !hasPendingSync && styles.syncStripDotOk, !isOnline && styles.syncStripDotOffline]} />
          <Text style={styles.syncStripText}>{syncText}</Text>
        </View>
      </View>
      <Text style={styles.logo}>K O D A</Text>
    </View>
  );
}

export function BottomNav({
  activeTab,
  setActiveTab,
  tabs,
}: {
  activeTab: TabKey;
  setActiveTab: (tab: TabKey) => void;
  tabs: BottomNavTab[];
}) {
  return (
    <View style={styles.nav}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        const featured = tab.key === 'habits';

        return (
          <Pressable key={tab.key} onPress={() => setActiveTab(tab.key)} style={[styles.navItem, featured ? styles.navItemFeatured : undefined, featured && active ? styles.navItemFeaturedActive : undefined]} testID={`tab-${tab.key}`}>
            <View style={featured ? styles.navFeaturedIcon : undefined}>
              {tab.icon(active)}
            </View>
            <Text style={[styles.navText, active && styles.navTextActive, featured && styles.navTextFeatured, featured && active && styles.navTextFeaturedActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.titleBlock}>
      <Text style={styles.screenTitle}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function InlineAdd({ placeholder, buttonLabel, onSubmit }: { placeholder: string; buttonLabel: string; onSubmit: (value: string) => void }) {
  const [value, setValue] = useState('');

  function submit() {
    onSubmit(value);
    setValue('');
  }

  return (
    <View style={styles.addBox}>
      <TextInput
        onChangeText={setValue}
        onSubmitEditing={submit}
        placeholder={placeholder}
        placeholderTextColor={faint}
        style={styles.addInput}
        testID={`input-${buttonLabel}`}
        value={value}
      />
      <Pressable onPress={submit} style={styles.addButton} testID={`add-${buttonLabel}`}>
        <Plus color={accent} size={15} />
        <Text style={styles.addButtonText}>{buttonLabel}</Text>
      </Pressable>
    </View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function ProgressLine({ value }: { value: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(3, Math.min(100, value))}%` }]} />
    </View>
  );
}


export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.rowMeta}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function MetricCard({ label, value, progress }: { label: string; value: string; progress: number }) {
  return (
    <Card>
      <Text style={styles.cardLabel}>{label.toUpperCase()}</Text>
      <Text style={styles.goalPercent}>{value}</Text>
      <ProgressLine value={progress} />
    </Card>
  );
}

export type RoutineValueEditor = {
  currentValue: number;
  goalId: string;
  metricLabel: string;
  routineId: string;
  targetValue: number;
  title: string;
};

export function RoutineValueSheet({
  draft,
  editor,
  onChangeDraft,
  onClose,
  onSave,
  onSetDraft,
}: {
  draft: string;
  editor: RoutineValueEditor | null;
  onChangeDraft: (value: string) => void;
  onClose: () => void;
  onSave: () => void;
  onSetDraft: (value: number) => void;
}) {
  const value = Number(draft);
  const canSave = Boolean(editor) && Number.isFinite(value) && value >= 0;

  return (
    <Modal animationType="fade" transparent visible={Boolean(editor)} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.quickAddModalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderText}>
              <Text style={styles.cardLabel}>ПРОГРЕСС</Text>
              <Text style={styles.modalTitle}>{editor?.title ?? ''}</Text>
            </View>
            <Pressable onPress={onClose} style={styles.modalCloseButton}>
              <X color={muted} size={18} />
            </Pressable>
          </View>
          <Text style={styles.rowMeta}>Цель: {editor?.targetValue ?? 0} {editor?.metricLabel ?? ''}</Text>
          <TextInput
            autoFocus
            inputMode="numeric"
            keyboardType="number-pad"
            onChangeText={onChangeDraft}
            onSubmitEditing={onSave}
            placeholder="Текущее значение"
            placeholderTextColor={muted}
            style={styles.modalInput}
            value={draft}
          />
          <View style={styles.addOptionsRow}>
            <Pressable onPress={() => onSetDraft(0)} style={styles.plannerInlineAddButton}>
              <Text style={styles.plannerInlineAddText}>0</Text>
            </Pressable>
            <Pressable onPress={() => onSetDraft(editor?.targetValue ?? 0)} style={styles.plannerInlineAddButton}>
              <Text style={styles.plannerInlineAddText}>цель</Text>
            </Pressable>
          </View>
          <Pressable disabled={!canSave} onPress={onSave} style={[styles.notificationButton, !canSave && styles.notificationButtonDisabled]}>
            <Text style={styles.notificationButtonText}>Сохранить</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

