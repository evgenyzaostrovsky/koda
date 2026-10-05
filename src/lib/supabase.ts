import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import 'react-native-url-polyfill/auto';
import { env, isSupabaseConfigured } from '../config/env';
import type { Database } from '../types/database';

export const authStorageKey = `sb-${isSupabaseConfigured() ? new URL(env.supabaseUrl).hostname.split('.')[0] : 'placeholder'}-auth-token`;

export const supabase = createClient<Database>(
  isSupabaseConfigured() ? env.supabaseUrl : 'https://placeholder.supabase.co',
  isSupabaseConfigured() ? env.supabaseAnonKey : 'placeholder-anon-key',
  {
    global: { fetch: async (input, init) => {
      const controller = new AbortController();
      const abort = () => controller.abort();
      if (init?.signal?.aborted) controller.abort();
      init?.signal?.addEventListener('abort', abort, { once: true });
      const timeout = setTimeout(abort, 8000);
      try { return await fetch(input, { ...init, signal: controller.signal }); }
      finally { clearTimeout(timeout); init?.signal?.removeEventListener('abort', abort); }
    } },
    auth: {
      storageKey: authStorageKey,
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: Platform.OS === 'web',
    },
  },
);
