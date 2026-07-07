import { Mail, Sparkles } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { isSupabaseConfigured } from '../../config/env';
import { supabase } from '../../lib/supabase';

type AuthScreenProps = {
  onAuthenticated: () => void;
};

export function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function signInWithEmail() {
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setMessage('Введи email, чтобы продолжить.');
      return;
    }

    if (!isSupabaseConfigured()) {
      onAuthenticated();
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: cleanEmail,
      options: { shouldCreateUser: true },
    });
    setIsLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Проверь почту: мы отправили ссылку для входа.');
  }

  async function signInWithGoogle() {
    if (!isSupabaseConfigured()) {
      onAuthenticated();
      return;
    }

    setIsLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
    setIsLoading(false);

    if (error) {
      setMessage(error.message);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.logo}>
        <Sparkles size={28} color="#050505" strokeWidth={2.4} />
      </View>

      <Text style={styles.title}>Твоя жизнь — персонаж, которого ты развиваешь</Text>
      <Text style={styles.subtitle}>KODA превращает цели в будущую версию тебя и маленькие ежедневные квесты.</Text>

      <View style={styles.form}>
        <View style={styles.inputWrap}>
          <Mail size={18} color="#A8A8A8" strokeWidth={2.2} />
          <TextInput
            autoCapitalize="none"
            keyboardType="email-address"
            onChangeText={setEmail}
            placeholder="Электронная почта"
            placeholderTextColor="#777777"
            style={styles.input}
            value={email}
          />
        </View>

        <Pressable disabled={isLoading} onPress={signInWithEmail} style={styles.primaryButton}>
          <Text style={styles.primaryText}>{isLoading ? 'Секунду...' : 'Войти по email'}</Text>
        </Pressable>

        <Pressable disabled={isLoading} onPress={signInWithGoogle} style={styles.secondaryButton}>
          <Text style={styles.secondaryText}>Войти через Google</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: 'center',
    backgroundColor: '#050505',
    flex: 1,
    justifyContent: 'center',
    padding: 28,
  },
  logo: {
    alignItems: 'center',
    backgroundColor: '#F1F1F1',
    borderRadius: 18,
    height: 64,
    justifyContent: 'center',
    marginBottom: 28,
    width: 64,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 0,
    lineHeight: 33,
    maxWidth: 360,
    textAlign: 'center',
  },
  subtitle: {
    color: '#B9B9B9',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 16,
    maxWidth: 380,
    textAlign: 'center',
  },
  form: {
    gap: 12,
    marginTop: 34,
    width: '100%',
    maxWidth: 390,
  },
  inputWrap: {
    alignItems: 'center',
    borderColor: '#2A2A2A',
    borderRadius: 24,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 50,
    paddingHorizontal: 16,
  },
  input: {
    color: '#FFFFFF',
    flex: 1,
    fontSize: 15,
    minHeight: 48,
  },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: '#F1F1F1',
    borderRadius: 24,
    minHeight: 50,
    justifyContent: 'center',
  },
  primaryText: {
    color: '#050505',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2A2A2A',
    borderRadius: 24,
    borderWidth: 1,
    minHeight: 50,
    justifyContent: 'center',
  },
  secondaryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  message: {
    color: '#B9B9B9',
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
});
