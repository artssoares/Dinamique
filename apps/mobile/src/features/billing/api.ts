import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import type { BillingInterval } from '@dinamique/billing';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';

/**
 * Cobrança vista do aplicativo.
 *
 * O aplicativo NUNCA fala com o Stripe direto: ele pede uma sessão ao nosso
 * servidor, que é quem tem a chave secreta, e abre a URL devolvida. Assim
 * nenhuma chave de cobrança existe dentro do aparelho.
 */

const BILLING_URL = process.env.EXPO_PUBLIC_BILLING_URL;

export type BillingError =
  | 'not_configured'
  | 'not_authenticated'
  | 'already_subscribed'
  | 'no_subscription'
  | 'unavailable'
  | 'cancelled';

export type BillingResult =
  | { ok: true; completed: boolean }
  | { ok: false; error: BillingError; message: string };

const MESSAGES: Record<BillingError, string> = {
  not_configured: 'A assinatura ainda não está disponível neste aplicativo.',
  not_authenticated: 'Sua sessão expirou. Entre novamente e tente de novo.',
  already_subscribed: 'Você já tem uma assinatura ativa.',
  no_subscription: 'Você ainda não tem uma assinatura para gerenciar.',
  unavailable: 'Não conseguimos abrir o pagamento agora. Tente em instantes.',
  cancelled: 'Pagamento não concluído.',
};

async function callBilling(path: string, body?: unknown): Promise<{ url?: string; code?: string } | null> {
  if (!BILLING_URL) return null;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;

  const response = await fetch(`${BILLING_URL.replace(/\/$/, '')}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // O servidor descobre quem é o usuário validando este token. Nada de
      // mandar user_id no corpo.
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as { url?: string; code?: string };
  if (!response.ok) return { code: payload.code ?? 'unavailable' };
  return payload;
}

export async function startCheckout(interval: BillingInterval): Promise<BillingResult> {
  if (!BILLING_URL) {
    return { ok: false, error: 'not_configured', message: MESSAGES.not_configured };
  }

  void track('subscription_started', { interval, stage: 'checkout_opened' });

  let result: { url?: string; code?: string } | null;
  try {
    result = await callBilling('/api/billing/checkout', { interval });
  } catch {
    return { ok: false, error: 'unavailable', message: MESSAGES.unavailable };
  }

  if (!result) {
    return { ok: false, error: 'not_authenticated', message: MESSAGES.not_authenticated };
  }
  if (!result.url) {
    const code = (result.code ?? 'unavailable') as BillingError;
    return { ok: false, error: code, message: MESSAGES[code] ?? MESSAGES.unavailable };
  }

  return openAndWait(result.url);
}

export async function openPortal(): Promise<BillingResult> {
  if (!BILLING_URL) {
    return { ok: false, error: 'not_configured', message: MESSAGES.not_configured };
  }

  let result: { url?: string; code?: string } | null;
  try {
    result = await callBilling('/api/billing/portal');
  } catch {
    return { ok: false, error: 'unavailable', message: MESSAGES.unavailable };
  }

  if (!result?.url) {
    const code = (result?.code ?? 'unavailable') as BillingError;
    return { ok: false, error: code, message: MESSAGES[code] ?? MESSAGES.unavailable };
  }

  return openAndWait(result.url);
}

/**
 * Abre o Stripe e espera o usuário voltar.
 *
 * "Voltou" não significa "pagou": quem confirma o pagamento é o webhook. Por
 * isso a tela recarrega o plano ao retornar, em vez de assumir sucesso – se a
 * confirmação ainda não chegou, o usuário vê o estado real e não uma promessa.
 */
async function openAndWait(url: string): Promise<BillingResult> {
  if (Platform.OS === 'web') {
    globalThis.location.href = url;
    return { ok: true, completed: false };
  }

  const result = await WebBrowser.openAuthSessionAsync(url, 'dinamique://assinatura');
  return { ok: true, completed: result.type === 'success' };
}
