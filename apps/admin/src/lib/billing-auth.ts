import { createClient } from '@supabase/supabase-js';
import { getServiceClient } from './supabase-server';

/**
 * Autenticação dos endpoints de cobrança.
 *
 * Estes endpoints são chamados pelo APLICATIVO, não pelo painel — então não
 * dá para usar cookies. O aplicativo manda o token de acesso do Supabase no
 * cabeçalho Authorization, e nós validamos o token contra o Supabase antes de
 * qualquer coisa.
 *
 * O id do usuário SEMPRE vem do token verificado. Nunca do corpo da
 * requisição: aceitar um user_id enviado pelo cliente deixaria qualquer pessoa
 * assinar em nome de outra.
 */

export interface BillingIdentity {
  userId: string;
  email: string;
}

export async function authenticateRequest(request: Request): Promise<BillingIdentity | null> {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  if (token === '') return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  // Uma conta bloqueada não assina: cobrar alguém que não pode usar o produto
  // seria péssimo, e destravar depois dá trabalho para os dois lados.
  const service = getServiceClient();
  const { data: profile } = await service
    .from('profiles')
    .select('blocked_at')
    .eq('id', data.user.id)
    .maybeSingle();

  if (profile?.blocked_at) return null;

  return { userId: data.user.id, email: data.user.email ?? '' };
}
