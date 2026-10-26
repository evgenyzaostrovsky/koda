import { activeBg, activeText, bg, panel, panelSoft, line, text, muted, faint } from '../koda/theme';
import { Lock, User } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { supabase } from '../../lib/supabase';

type AuthMode = 'login' | 'register';

function cleanLogin(value: string) {
  return value.trim().toLowerCase();
}

function loginEmail(username: string) {
  return `${username}@koda-life.vercel.app`;
}

export function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>('login');
  const [login, setLogin] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordRepeat, setPasswordRepeat] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function resolveLoginEmail(loginValue: string) {
    const value = cleanLogin(loginValue);
    if (value.includes('@')) return value;

    const { data, error } = await (supabase as any).rpc('get_email_by_username', { login_value: value });
    if (error || !data) return loginEmail(value);

    return data;
  }

  async function signIn() {
    const cleanPassword = password.trim();
    if (!login.trim() || !cleanPassword) {
      setMessage('Введи логин и пароль.');
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setMessage('Нет связи с сервером. Для входа в аккаунт нужен интернет. Сохранённая история останется на устройстве.');
      return;
    }

    setIsLoading(true);
    const resolvedEmail = await resolveLoginEmail(login);

    if (!resolvedEmail) {
      setIsLoading(false);
      setMessage('Пользователь не найден.');
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: resolvedEmail,
      password: cleanPassword,
    });
    setIsLoading(false);
    const connectionFailed = error && (error.name === 'AuthRetryableFetchError' || error.status === 0 || (error.status ?? 0) >= 500);
    setMessage(error ? connectionFailed ? 'Нет связи с сервером. Для входа в аккаунт нужен интернет. Сохранённая история останется на устройстве.' : 'Неверный логин или пароль.' : '');
  }

  async function register() {
    const username = cleanLogin(login);
    const cleanName = name.trim();
    const cleanPassword = password.trim();

    if (!username || !cleanName || !cleanPassword || !passwordRepeat.trim()) {
      setMessage('Заполни все поля.');
      return;
    }

    if (!/^[a-z0-9_]{3,24}$/.test(username)) {
      setMessage('Логин: 3-24 символа, латиница, цифры или _.');
      return;
    }

    if (cleanPassword.length < 6) {
      setMessage('Пароль минимум 6 символов.');
      return;
    }

    if (cleanPassword !== passwordRepeat.trim()) {
      setMessage('Пароли не совпадают.');
      return;
    }

    setIsLoading(true);
    const email = loginEmail(username);
    const backendResult = await registerOnBackend({ name: cleanName, password: cleanPassword, username });

    if (!backendResult.ok) {
      setIsLoading(false);
      setMessage(backendResult.error);
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password: cleanPassword,
    });

    setIsLoading(false);
    setMessage(error ? authErrorMessage(error.message) : '');
  }

  const submit = mode === 'login' ? signIn : register;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.screen} style={{flex:1,backgroundColor:bg}}>
      <View style={styles.panel}>
        <Text style={styles.logo}>koda life</Text>

        <View style={styles.tabs}>
          <Pressable onPress={() => setMode('login')} style={[styles.tab, mode === 'login' && styles.tabActive]}>
            <Text style={[styles.tabText, mode === 'login' && styles.tabTextActive]}>Вход</Text>
          </Pressable>
          <Pressable onPress={() => setMode('register')} style={[styles.tab, mode === 'register' && styles.tabActive]}>
            <Text style={[styles.tabText, mode === 'register' && styles.tabTextActive]}>Регистрация</Text>
          </Pressable>
        </View>

        <AuthInput icon="user" onChangeText={setLogin} placeholder="логин" value={login} />

        {mode === 'register' ? (
          <AuthInput icon="user" onChangeText={setName} placeholder="имя" value={name} />
        ) : null}

        <AuthInput icon="lock" onChangeText={setPassword} onSubmitEditing={submit} placeholder="пароль" secureTextEntry value={password} />

        {mode === 'register' ? (
          <AuthInput
            icon="lock"
            onChangeText={setPasswordRepeat}
            onSubmitEditing={submit}
            placeholder="повторить пароль"
            secureTextEntry
            value={passwordRepeat}
          />
        ) : null}

        <Pressable disabled={isLoading} onPress={submit} style={[styles.button, isLoading && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>{isLoading ? 'Секунду...' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}</Text>
        </Pressable>

        {message ? <Text style={[styles.message, message.includes('создан') && styles.messageSuccess]}>{message}</Text> : null}
      </View>
    </ScrollView>
  );
}

async function registerOnBackend({
  name,
  password,
  username,
}: {
  name: string;
  password: string;
  username: string;
}): Promise<{ error: string; ok: false } | { ok: true }> {
  try {
    const response = await fetch(`${getApiBaseUrl()}/api/auth-register`, {
      body: JSON.stringify({ name, password, username }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST',
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return { error: authErrorMessage(String(data.error || 'Не удалось создать аккаунт.')), ok: false };
    }

    return { ok: true };
  } catch {
    return { error: 'Backend регистрации недоступен. Попробуй ещё раз.', ok: false };
  }
}

function getApiBaseUrl() {
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }

  return 'https://koda-life.vercel.app';
}

function authErrorMessage(message: string) {
  const cleanMessage = message.toLowerCase();

  if (cleanMessage.includes('already')) return 'Такой логин уже занят.';
  if (cleanMessage.includes('email not confirmed')) return 'Email confirmation включён в Supabase. Backend должен подтвердить пользователя.';
  if (cleanMessage.includes('service_role') || cleanMessage.includes('bearer token') || cleanMessage.includes('not allowed') || cleanMessage.includes('admin')) return 'На Vercel нужен SUPABASE_SERVICE_ROLE_KEY для простой регистрации.';
  if (cleanMessage.includes('password')) return 'Пароль слишком простой или короткий.';
  if (cleanMessage.includes('email')) return 'Не удалось создать технический email для логина.';
  if (cleanMessage.includes('invalid')) return 'Проверь формат логина и пароль.';

  return message;
}

function AuthInput({
  icon,
  keyboardType,
  onChangeText,
  onSubmitEditing,
  placeholder,
  secureTextEntry,
  value,
}: {
  icon: 'lock' | 'user';
  keyboardType?: 'default' | 'email-address';
  onChangeText: (value: string) => void;
  onSubmitEditing?: () => void;
  placeholder: string;
  secureTextEntry?: boolean;
  value: string;
}) {
  const iconColor = muted;
  const iconNode = icon === 'lock' ? <Lock size={18} color={iconColor} /> : <User size={18} color={iconColor} />;

  return (
    <View style={styles.inputWrap}>
      {iconNode}
      <TextInput
        accessibilityLabel={placeholder}
        autoCapitalize="none"
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        placeholder={placeholder}
        placeholderTextColor={faint}
        secureTextEntry={secureTextEntry}
        style={styles.input}
        value={value}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: bg,
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  panel: {
    backgroundColor: panel,
    borderColor: line,
    borderRadius: 28,
    borderWidth: 1,
    gap: 16,
    maxWidth: 420,
    padding: 28,
    width: '100%',
  },
  logo: { color: text, fontSize: 26, fontWeight: '600', letterSpacing: -0.8, marginBottom: 5, textAlign: 'center' },
  tabs: {
    borderColor: line,
    backgroundColor: panelSoft,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 4,
  },
  tab: {
    alignItems: 'center',
    borderRadius: 999,
    flex: 1,
    minHeight: 42,
    justifyContent: 'center',
  },
  tabActive: { backgroundColor: activeBg },
  tabText: { color: muted, fontSize: 13 },
  tabTextActive: { color: activeText, fontWeight: '700' },
  inputWrap: {
    alignItems: 'center',
    borderColor: line,
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 54,
    paddingHorizontal: 16,
  },
  input: {
    color: text,
    flex: 1,
    fontSize: 15,
    minHeight: 52,
  },
  button: {
    alignItems: 'center',
    backgroundColor: activeBg,
    borderRadius: 999,
    minHeight: 52,
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.55 },
  buttonText: { color: activeText, fontSize: 14, fontWeight: '700' },
  message: { color: muted, fontSize: 13, lineHeight: 19 },
  messageSuccess: { color: text },
});
