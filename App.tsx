import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { AuthScreen } from './src/features/auth/AuthScreen';
import { KodaApp } from './src/features/koda/KodaApp';
import { isSupabaseConfigured } from './src/config/env';
import { registerServiceWorker } from './src/lib/serviceWorker';
import { supabase } from './src/lib/supabase';

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

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session ?? null);
      setIsLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
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
      * { scrollbar-width: none !important; }
      *::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingScreen}>
        <ActivityIndicator color="#ff6b16" />
      </View>
    );
  }

  if (uiAuditMode || !isSupabaseConfigured()) {
    return <KodaApp />;
  }

  return session?.user ? <KodaApp onSignOut={() => supabase.auth.signOut()} userId={session.user.id} /> : <AuthScreen />;
}

const styles = StyleSheet.create({
  loadingScreen: {
    alignItems: 'center',
    backgroundColor: '#050605',
    flex: 1,
    justifyContent: 'center',
  },
});
