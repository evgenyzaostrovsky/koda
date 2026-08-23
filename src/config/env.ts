export const env = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '',
  vapidPublicKey:
    process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ||
    'BBII4oTtKY_ogz6yZ71leoNKbmx8G80n7SWIsNaYripb7wdsBQ6bpgBAvTC0pLZfP48UaS6TR4c3JIxCqbH2yhY',
  kodaApiUrl:
    process.env.EXPO_PUBLIC_KODA_API_URL ||
    (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3333'),
};

export function isSupabaseConfigured() {
  return Boolean(env.supabaseUrl && env.supabaseAnonKey);
}

export function assertSupabaseConfigured() {
  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    throw new Error('Supabase is not configured. Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY.');
  }
}
