import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * Supabase client for the app.
 *
 * The anon key is the ONLY key that may exist here. It is public by design and
 * useless without a session, because every table is behind Row Level Security.
 * The service role key bypasses RLS and never leaves the server (§9, §118).
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Supabase não configurado. Copie apps/mobile/.env.example para .env e preencha ' +
      'EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY.',
  );
}

export const supabase = createClient(url, anonKey, {
  auth: {
    // On web the SDK uses localStorage; AsyncStorage is native-only.
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native has no URL to parse a session out of.
    detectSessionInUrl: Platform.OS === 'web',
  },
});
