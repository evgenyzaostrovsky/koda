import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Leaf } from 'lucide-react-native';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { KodaApp } from './src/features/koda/KodaApp';
import { isSupabaseConfigured } from './src/config/env';
import { registerServiceWorker } from './src/lib/serviceWorker';
import { supabase, authStorageKey } from './src/lib/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signOutDevice } from './src/lib/signOutDevice';
import { accent, bg, muted, text } from './src/features/koda/theme';

export default function App() {
  const uiAuditMode = process.env.EXPO_PUBLIC_KODA_UI_AUDIT === '1';
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let active = true;

    void registerServiceWorker();

    if (uiAuditMode || !isSupabaseConfigured()) {
      setIsLoading(false);
      return;
    }

    let authResolved = false;
    void AsyncStorage.getItem(authStorageKey).then(raw => {
      if (!active || authResolved || !raw) return;
      try {
        const cached = JSON.parse(raw);
        if (cached?.user?.id && cached?.access_token) { setSession(cached); setIsLoading(false); }
      } catch {}
    }).catch(() => undefined);

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) { setIsLoading(false); return; }
      authResolved = true;
      setSession(data.session ?? null);
      setIsLoading(false);
    }).catch(() => { if (active) setIsLoading(false); });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      // INITIAL_SESSION may be null when refreshing an expired token fails offline.
      // Keep the cached local session; an explicit SIGNED_OUT still clears it.
      if (_event === 'INITIAL_SESSION' && !nextSession) return;
      authResolved = true;
      setSession(nextSession);
      setIsLoading(false);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [uiAuditMode]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const style = document.createElement('style');
    style.id = 'koda-hidden-scrollbars';
    style.textContent = `
      * { scrollbar-width: thin; }
      *::-webkit-scrollbar { width: 6px; height: 6px; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <Leaf size={42} strokeWidth={1.6} color={accent} />
        <Text style={styles.loadingBrand}>KODA <Text style={styles.loadingBrandLight}>LIFE</Text></Text>
        <Text style={styles.loadingCaption}>Готовим твоё пространство</Text>
        <ActivityIndicator accessibilityLabel="Загрузка приложения" color={accent} style={styles.loadingIndicator} />
      </View>
    );
  }

  if (uiAuditMode || !isSupabaseConfigured()) {
    return <KodaApp />;
  }

  return session?.user ? <KodaApp onSignOut={() => { void signOutDevice(supabase, AsyncStorage, authStorageKey); }} userId={session.user.id} /> : <AuthScreen />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: bg,
    flex: 1,
    justifyContent: 'center',
    gap: 12,
  },
  loadingBrand: { color: text, fontSize: 25, fontWeight: '600', letterSpacing: 2.2 },
  loadingBrandLight: { fontWeight: '300' },
  loadingCaption: { color: muted, fontSize: 14 },
  loadingIndicator: { marginTop: 8 },
});
