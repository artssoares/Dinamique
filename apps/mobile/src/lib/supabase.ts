import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

/**
 * Cliente do Supabase.
 *
 * A chave anônima é a ÚNICA que pode existir aqui. Ela é pública por natureza e
 * inútil sem uma sessão, porque toda tabela está atrás de Row Level Security. A
 * service role ignora o RLS e nunca sai do servidor (§9, §118).
 *
 * Se as variáveis não estiverem configuradas, o aplicativo NÃO quebra: ele
 * mostra uma tela explicando o que falta. Uma tela branca sem explicação é a
 * pior forma de comunicar um erro de configuração.
 */

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

/**
 * Cliente falso usado só quando falta configuração. Toda chamada devolve um
 * erro claro em vez de estourar – assim uma tela que não checou o estado
 * mostra "não configurado" em vez de derrubar o aplicativo inteiro.
 */
function buildUnconfiguredClient(): SupabaseClient {
  const error = {
    message: 'Supabase não configurado neste aplicativo.',
    code: 'not_configured',
  };

  const result = Promise.resolve({ data: null, error });

  const query: Record<string, unknown> = {};
  const chain = new Proxy(query, {
    get(_target, prop) {
      if (prop === 'then') return result.then.bind(result);
      if (prop === 'catch') return result.catch.bind(result);
      if (prop === 'finally') return result.finally.bind(result);
      return () => chain;
    },
  });

  return {
    from: () => chain,
    rpc: () => chain,
    storage: { from: () => ({ upload: () => result, list: () => result, remove: () => result, getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
    channel: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }),
    removeChannel: () => {},
    auth: {
      getSession: async () => ({ data: { session: null }, error: null }),
      getUser: async () => ({ data: { user: null }, error: null }),
      signInWithPassword: async () => ({ data: null, error }),
      signUp: async () => ({ data: null, error }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  } as unknown as SupabaseClient;
}

export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        // Na web o SDK usa localStorage; AsyncStorage é só para nativo.
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : buildUnconfiguredClient();
