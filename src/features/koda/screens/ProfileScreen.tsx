import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { ListChecks, LogOut, Palette, Plus, X } from 'lucide-react-native';
import type { AccountInfo, Habit, PlannerItem, ProfileState, ThemeId } from '../types';
import { Card } from '../components';
import { accent, faint, muted, themeOptions } from '../theme';
import { styles } from '../styles';
import { enablePushNotifications, getPushStatus } from '../../../lib/pushNotifications';
import { env } from '../../../config/env';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

export function ProfileScreen({
  accountInfo,
  calendarKey,
  calendarSync,
  habits,
  isDesktop = false,
  onProfileChange,
  onSignOut,
  plannerItems,
  profile,
}: {
  accountInfo: AccountInfo | null;
  calendarKey: string;
  calendarSync: { count: number; message: string; status: 'idle' | 'syncing' | 'synced' | 'error' };
  habits: Habit[];
  isDesktop?: boolean;
  onProfileChange: (patch: Partial<ProfileState>) => void;
  onSignOut?: () => void;
  plannerItems: PlannerItem[];
  profile: ProfileState;
}) {
  const habitPreview = habits.slice(0, 3);
  const widgetItems = getWidgetPlannerItems(plannerItems);
  const [pushStatus, setPushStatus] = useState(getPushStatus);
  const [pushBusy, setPushBusy] = useState(false);
  const [passwordSheetOpen, setPasswordSheetOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordRepeat, setNewPasswordRepeat] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installHelpOpen, setInstallHelpOpen] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const calendarUrl = calendarKey ? getCalendarUrl(calendarKey) : '';
  const calendarSubscribeUrl = calendarUrl.replace(/^https?:\/\//, 'webcal://');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setIsInstalled(Boolean(standalone));

    function handleBeforeInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }

    function handleInstalled() {
      setIsInstalled(true);
      setInstallPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  useEffect(() => {
    if (!toastMessage) return undefined;

    const timeout = setTimeout(() => setToastMessage(''), 2000);
    return () => clearTimeout(timeout);
  }, [toastMessage]);

  async function enableNotifications() {
    if (pushBusy) return;
    setPushBusy(true);

    try {
      await enablePushNotifications();
      setPushStatus(getPushStatus());
    } catch {
      setPushStatus(getPushStatus());
    } finally {
      setPushBusy(false);
    }
  }

  async function installDesktopApp() {
    if (isInstalled) return;

    if (!installPrompt) {
      setInstallHelpOpen(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);

    if (choice?.outcome === 'accepted') {
      setIsInstalled(true);
    }

    setInstallPrompt(null);
  }

  const pushButtonText =
    pushStatus === 'enabled'
      ? 'Обновить подписку'
      : pushStatus === 'blocked'
        ? 'Уведомления заблокированы'
        : pushStatus === 'unsupported'
          ? 'Уведомления недоступны'
          : pushBusy
            ? 'Включаю...'
            : 'Включить уведомления';

  async function changePassword() {
    const username = accountInfo?.username?.trim();
    const password = newPassword.trim();

    if (!username) {
      setPasswordMessage('Логин аккаунта пока не загружен.');
      return;
    }

    if (password.length < 6) {
      setPasswordMessage('Пароль минимум 6 символов.');
      return;
    }

    if (password !== newPasswordRepeat.trim()) {
      setPasswordMessage('Пароли не совпадают.');
      return;
    }

    setPasswordBusy(true);
    try {
      const response = await fetch(`${getApiBaseUrl()}/api/auth-reset-password`, {
        body: JSON.stringify({ password, username }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setPasswordMessage(String(data.error || 'Не удалось сменить пароль.'));
        return;
      }

      setPasswordMessage('Пароль изменён.');
      setNewPassword('');
      setNewPasswordRepeat('');
      setPasswordSheetOpen(false);
      setToastMessage('Пароль изменён');
    } catch {
      setPasswordMessage('Backend смены пароля недоступен.');
    } finally {
      setPasswordBusy(false);
    }
  }

  return (
    <>
    <ScrollView contentContainerStyle={[styles.profileScrollContent, isDesktop && styles.desktopPageScroll]} showsVerticalScrollIndicator={false}>
      {!isDesktop ? <View style={styles.profileHeader}>
        <View style={styles.profileTitleRow}>
          <Text style={styles.screenTitle}>Профиль</Text>
          {onSignOut ? (
            <Pressable onPress={onSignOut} style={styles.profileSignOutButton}>
              <LogOut color={muted} size={16} />
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.subtitle}>Твоя будущая версия</Text>
      </View> : null}
      <View style={isDesktop ? styles.profileDesktopLayout : undefined} testID={isDesktop ? 'desktop-page-columns' : undefined}>
        <View style={isDesktop ? styles.profileDesktopMain : undefined} testID={isDesktop ? 'desktop-main-column' : undefined}>
      {isDesktop ? (
        <View style={styles.profileHeader}>
          <View style={styles.profileTitleRow}>
            <Text style={styles.screenTitle}>Профиль</Text>
            {onSignOut ? <Pressable onPress={onSignOut} style={styles.profileSignOutButton}><LogOut color={muted} size={16} /></Pressable> : null}
          </View>
          <Text style={styles.subtitle}>Твоя будущая версия</Text>
        </View>
      ) : null}
      <View style={styles.profileAccountBox}>
        <View style={styles.profileAccountMain}>
          <Text style={styles.cardLabel}>АККАУНТ</Text>
          <Text numberOfLines={1} style={styles.profileAccountName}>{accountInfo?.name || 'Пользователь KODA'}</Text>
          <Text numberOfLines={1} style={styles.rowMeta}>{accountInfo?.username ? `@${accountInfo.username}` : 'логин загружается'}</Text>
        </View>
        <View style={styles.profileAccountSide}>
          <Text style={styles.rowMeta}>{accountInfo?.createdAt ? `в KODA с ${formatAccountDate(accountInfo.createdAt)}` : 'дата входа...'}</Text>
          <Pressable onPress={() => setPasswordSheetOpen(true)} style={styles.profilePasswordButton}>
            <Text style={styles.profilePasswordButtonText}>Сменить пароль</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.profileThemeBox}>
        <View style={styles.rowBetween}>
          <View style={styles.profileThemeTitleRow}>
            <Palette color={accent} size={15} />
            <Text style={styles.cardLabel}>ЦВЕТОВАЯ СХЕМА</Text>
          </View>
          <Text style={styles.rowMeta}>{getThemeName(profile.themeId)}</Text>
        </View>
        <View style={styles.profileThemeList}>
          {themeOptions.map((theme) => {
            const active = profile.themeId === theme.id;
            return (
              <Pressable
                key={theme.id}
                onPress={() => onProfileChange({ themeId: theme.id })}
                style={[styles.profileThemeOption, active && styles.profileThemeOptionActive]}
              >
                <View style={styles.profileThemeSwatches}>
                  <View style={[styles.profileThemeSwatch, { backgroundColor: theme.colors['--koda-app-bg'] }]} />
                  <View style={[styles.profileThemeSwatch, { backgroundColor: theme.colors['--koda-surface-2'] }]} />
                  <View style={[styles.profileThemeSwatch, { backgroundColor: theme.colors['--koda-accent'] }]} />
                </View>
                <View style={styles.profileSettingText}>
                  <Text style={styles.rowTitle}>{theme.id === 'koda-dark' ? 'Основная' : 'Альтернативная'}</Text>
                  <Text style={styles.rowMeta}>{theme.description}</Text>
                </View>
                <Text style={[styles.profileThemeState, active && styles.profileThemeStateActive]}>{active ? 'выбрана' : 'выбрать'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <View style={styles.profileSettingsList}>
        <SettingRow
          disabled={pushBusy || pushStatus === 'unsupported'}
          meta={pushStatus === 'enabled' ? '14:00' : pushStatus === 'blocked' ? 'заблокированы' : pushBusy ? 'сохраняю...' : '14:00'}
          onPress={enableNotifications}
          title="Уведомления"
          value={pushStatus === 'enabled'}
        />
        <SettingRow
          disabled={!calendarSubscribeUrl}
          meta={calendarSync.status === 'synced' ? 'готов' : calendarSync.status === 'error' ? 'ошибка' : 'подписка'}
          onPress={() => Linking.openURL(calendarSubscribeUrl)}
          title="Календарь iPhone"
          value={Boolean(calendarSubscribeUrl)}
        />
        <SettingRow
          disabled={isInstalled}
          meta={isInstalled ? 'установлено' : installPrompt ? 'готово к установке' : 'инструкция'}
          onPress={installDesktopApp}
          title="Установить на компьютер"
          value={isInstalled}
        />
      </View>
        </View>

        <View style={isDesktop ? styles.profileDesktopAside : undefined} testID={isDesktop ? 'desktop-right-column' : undefined}>
      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>ВИДЖЕТНАЯ ЛЕНТА</Text>
          <Text style={styles.rowMeta}>{widgetItems.length ? 'ближайшее' : 'пусто'}</Text>
        </View>
        <Text style={styles.cardText}>Короткий список ближайших дел для виджета, календаря и уведомлений.</Text>
        <View style={styles.widgetFeedList}>
          {widgetItems.length ? (
            widgetItems.map((item) => (
              <View key={`widget-${item.id}`} style={styles.widgetFeedRow}>
                <Text style={styles.widgetFeedTime}>{formatWidgetDate(item)}</Text>
                <Text numberOfLines={1} style={styles.widgetFeedTitle}>{item.title}</Text>
              </View>
            ))
          ) : (
            <Text style={styles.rowMeta}>Ближайших дел нет.</Text>
          )}
        </View>
      </Card>


      <Card>
        <View style={styles.rowBetween}>
          <Text style={styles.cardLabel}>ПРИВЫЧКИ</Text>
          <Text style={styles.moreText}>...</Text>
        </View>
        {habitPreview.length ? (
          <View style={styles.profileHabitList}>
            {habitPreview.map((habit) => (
              <View key={habit.id} style={styles.profileHabitRow}>
                <View style={styles.profileHabitMark}>
                  <ListChecks color={accent} size={15} />
                </View>
                <View style={styles.profileHabitText}>
                  <Text style={styles.rowTitle}>{habit.title}</Text>
                  <Text style={styles.rowMeta}>{habit.target}</Text>
                </View>
                <View style={styles.profileHabitDays}>
                  {habit.doneDays.map((done, index) => (
                    <View key={`${habit.id}-profile-${index}`} style={[styles.habitDot, done && styles.habitDotDone]} />
                  ))}
                </View>
              </View>
            ))}
          </View>
        ) : (
          <EmptyProfilePlus minHeight={92} />
        )}
      </Card>
        </View>
      </View>
    </ScrollView>
    <Modal animationType="fade" transparent visible={passwordSheetOpen} onRequestClose={() => setPasswordSheetOpen(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Сменить пароль</Text>
            <Pressable onPress={() => setPasswordSheetOpen(false)} style={styles.iconButton}>
              <X color={muted} size={17} />
            </Pressable>
          </View>
          <View style={styles.modalFields}>
            <TextInput
              onChangeText={setNewPassword}
              placeholder="Новый пароль"
              placeholderTextColor={faint}
              secureTextEntry
              style={styles.modalInput}
              value={newPassword}
            />
            <TextInput
              onChangeText={setNewPasswordRepeat}
              onSubmitEditing={changePassword}
              placeholder="Повторить пароль"
              placeholderTextColor={faint}
              secureTextEntry
              style={styles.modalInput}
              value={newPasswordRepeat}
            />
          </View>
          <View style={styles.modalActions}>
            <Text style={[styles.rowMeta, passwordMessage === 'Пароль изменён.' && styles.messageSuccess]}>{passwordMessage}</Text>
            <Pressable disabled={passwordBusy} onPress={changePassword} style={[styles.saveButton, passwordBusy && styles.saveButtonDisabled]}>
              <Text style={styles.saveButtonText}>{passwordBusy ? 'Секунду...' : 'Сохранить'}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    <Modal animationType="fade" transparent visible={installHelpOpen} onRequestClose={() => setInstallHelpOpen(false)}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Установить KODA</Text>
            <Pressable onPress={() => setInstallHelpOpen(false)} style={styles.iconButton}>
              <X color={muted} size={17} />
            </Pressable>
          </View>
          <View style={styles.modalFields}>
            <Text style={styles.cardText}>
              В Chrome или Edge нажми иконку установки в адресной строке. Если её нет, открой меню браузера и выбери установку страницы как приложения.
            </Text>
            <Text style={styles.rowMeta}>
              После установки KODA откроется отдельным окном и будет доступна из меню Пуск или панели задач.
            </Text>
          </View>
          <View style={styles.modalActions}>
            <Pressable onPress={() => setInstallHelpOpen(false)} style={styles.saveButton}>
              <Text style={styles.saveButtonText}>Понятно</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
    {toastMessage ? (
      <View style={styles.profileToast}>
        <Text style={styles.profileToastText}>{toastMessage}</Text>
      </View>
    ) : null}
    </>
  );
}

function getCalendarUrl(calendarKey: string) {
  const baseUrl = getApiBaseUrl();
  const params = new URLSearchParams({
    key: calendarKey,
  });

  return `${baseUrl}/api/koda-calendar.ics?${params.toString()}`;
}

function formatAccountDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
}

function getThemeName(themeId: ThemeId) {
  return themeOptions.find((theme) => theme.id === themeId)?.name ?? 'KODA Dark';
}

function SettingRow({
  disabled,
  meta,
  onPress,
  title,
  value,
}: {
  disabled?: boolean;
  meta: string;
  onPress: () => void;
  title: string;
  value: boolean;
}) {
  return (
    <Pressable disabled={disabled} onPress={onPress} style={[styles.profileSettingRow, disabled && !value && styles.profileSettingRowDisabled]}>
      <View style={styles.profileSettingText}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowMeta}>{meta}</Text>
      </View>
      <View style={[styles.profileSwitchTrack, value && styles.profileSwitchTrackActive, disabled && !value && styles.profileSwitchTrackDisabled]}>
        <View style={[styles.profileSwitchThumb, value && styles.profileSwitchThumbActive]} />
      </View>
    </Pressable>
  );
}

function getApiBaseUrl() {
  if (env.kodaApiUrl) {
    return env.kodaApiUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'https://koda-life.vercel.app';
}

function getWidgetPlannerItems(items: PlannerItem[]) {
  const today = toDateKey(new Date());

  return items
    .filter((item) => !item.done && item.date >= today)
    .sort((left, right) => {
      const dateCompare = left.date.localeCompare(right.date);
      if (dateCompare) return dateCompare;
      if (!left.time && right.time) return -1;
      if (left.time && !right.time) return 1;
      return left.time.localeCompare(right.time);
    })
    .slice(0, 5);
}

function formatWidgetDate(item: PlannerItem) {
  const date = dateFromKey(item.date);
  const today = toDateKey(new Date());
  const tomorrow = toDateKey(addDays(new Date(), 1));
  const day = item.date === today ? 'сегодня' : item.date === tomorrow ? 'завтра' : `${date.getDate()}.${String(date.getMonth() + 1).padStart(2, '0')}`;

  return item.time ? `${day} ${item.time}` : day;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateFromKey(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day || 1);
}

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function EmptyProfilePlus({ minHeight }: { minHeight: number }) {
  return (
    <View style={[styles.profileEmpty, { minHeight }]}>
      <Plus color={accent} size={24} />
    </View>
  );
}

