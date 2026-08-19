import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { interpretEvent, isStaleEvent, type StripeEventInput } from '@dinamique/billing';
import { getStripe, getWebhookSecret } from '@/lib/stripe';
import { getServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';
// A verificação de assinatura precisa do corpo EXATO como o Stripe enviou.
// Qualquer parsing antes disso invalida a assinatura.
export const runtime = 'nodejs';

/**
 * Webhook do Stripe. É ele quem concede e revoga o Pro.
 *
 * Quatro coisas acontecem antes de qualquer escrita, nesta ordem:
 *   1. a assinatura da requisição é verificada – sem isso, qualquer um manda
 *      um POST e ganha Pro de graça;
 *   2. o evento é conferido contra `billing_events` – o Stripe reenvia, e
 *      reprocessar concederia plano duas vezes;
 *   3. eventos fora de ordem são descartados – o Stripe não garante ordem, e
 *      um `updated` antigo depois de um `deleted` reativaria um cancelamento;
 *   4. o evento é interpretado por código puro e testado.
 */
export async function POST(request: Request) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'sem assinatura' }, { status: 400 });
  }

  const payload = await request.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(payload, signature, getWebhookSecret());
  } catch (error) {
    // Assinatura inválida é tentativa de fraude ou configuração errada. Nos
    // dois casos, nada é escrito.
    return NextResponse.json(
      { error: `assinatura inválida: ${error instanceof Error ? error.message : 'desconhecido'}` },
      { status: 400 },
    );
  }

  const supabase = getServiceClient();

  // Idempotência: se já processamos este evento, devolvemos 200 para o Stripe
  // parar de reenviar, sem repetir o efeito.
  const { data: seen } = await supabase
    .from('billing_events')
    .select('stripe_event_id')
    .eq('stripe_event_id', event.id)
    .maybeSingle();

  if (seen) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const input: StripeEventInput = {
    id: event.id,
    type: event.type,
    created: event.created,
    data: { object: event.data.object as unknown as Record<string, unknown> },
  };

  const outcome = interpretEvent(input);
  let error: string | null = null;

  if (outcome.action === 'error') {
    error = outcome.reason;
  } else if (outcome.action === 'apply') {
    const { state } = outcome;

    // Descarta evento que chegou fora de ordem.
    const { data: current } = await supabase
      .from('subscriptions')
      .select('updated_at')
      .eq('stripe_subscription_id', state.stripeSubscriptionId)
      .maybeSingle();

    const stale = isStaleEvent(input, (current?.updated_at as string | null) ?? null);

    if (stale) {
      error = 'evento fora de ordem, descartado';
    } else {
      await supabase.from('billing_customers').upsert(
        { user_id: state.userId, stripe_customer_id: state.stripeCustomerId },
        { onConflict: 'user_id' },
      );

      await supabase.rpc('apply_subscription_state', {
        p_user_id: state.userId,
        p_stripe_subscription_id: state.stripeSubscriptionId,
        p_stripe_price_id: state.stripePriceId,
        p_interval: state.interval,
        p_status: state.status,
        p_current_period_end: state.currentPeriodEnd,
        p_cancel_at_period_end: state.cancelAtPeriodEnd,
      });

      if (outcome.grantsPro) {
        await onSubscriptionActivated(state.userId, state.stripeSubscriptionId);
      }
    }
  }

  // O registro é gravado DEPOIS do efeito. Se algo falhar no meio, o Stripe
  // reenvia e nós reprocessamos – melhor repetir uma tentativa do que marcar
  // como processado algo que não chegou a acontecer.
  await supabase.from('billing_events').insert({
    stripe_event_id: event.id,
    type: event.type,
    event_created_at: new Date(event.created * 1000).toISOString(),
    payload: event.data.object as unknown as Record<string, unknown>,
    error,
  });

  return NextResponse.json({ received: true, action: outcome.action, error });
}

/**
 * Efeitos colaterais de uma assinatura que passou a valer: consumir o desconto
 * de indicação, marcar a indicação como convertida e avisar o usuário.
 *
 * Só roda uma vez porque `consume_discount_benefit` é atômico e a notificação
 * é condicionada ao consumo – uma renovação anual não dispara tudo de novo.
 */
async function onSubscriptionActivated(userId: string, subscriptionId: string): Promise<void> {
  const supabase = getServiceClient();

  const { data: consumed } = await supabase.rpc('consume_discount_benefit', {
    p_user_id: userId,
    p_applied_to: subscriptionId,
  });

  await supabase.rpc('mark_referral_converted', { p_user_id: userId });

  const result = consumed as { applied?: boolean; amount?: number } | null;

  await supabase.from('user_notifications').insert({
    user_id: userId,
    category: 'subscription',
    title: 'Bem-vindo ao Dinamique Pro',
    body: result?.applied
      ? 'Sua assinatura está ativa e seu desconto de indicação foi aplicado.'
      : 'Sua assinatura está ativa. Aproveite tudo que o Pro libera.',
    deep_link: '/plan',
  });

  await supabase.from('analytics_events').insert({
    user_id: userId,
    event: 'subscription_started',
    properties: { subscription_id: subscriptionId, discount_applied: result?.applied ?? false },
  });
}
