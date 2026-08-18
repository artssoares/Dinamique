import { NextResponse } from 'next/server';
import {
  decideCheckout,
  isBillingInterval,
  REFERRAL_COUPON_ID,
  buildReturnUrls,
  type DiscountBenefit,
} from '@dinamique/billing';
import { authenticateRequest } from '@/lib/billing-auth';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { getServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Cria a sessão de checkout.
 *
 * O preço vem do BANCO, não do corpo da requisição. Aceitar um preço enviado
 * pelo cliente deixaria qualquer um assinar o Pro por um centavo.
 */
export async function POST(request: Request) {
  const identity = await authenticateRequest(request);
  if (!identity) {
    return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { interval?: unknown };
  if (!isBillingInterval(body.interval)) {
    return NextResponse.json({ error: 'periodicidade inválida' }, { status: 400 });
  }

  const supabase = getServiceClient();

  const { data: price } = await supabase
    .from('billing_prices')
    .select('amount, stripe_price_id')
    .eq('plan', 'pro')
    .eq('interval', body.interval)
    .eq('is_active', true)
    .maybeSingle();

  if (!price?.stripe_price_id) {
    return NextResponse.json(
      { error: 'plano ainda não configurado no Stripe' },
      { status: 503 },
    );
  }

  // Se já existe assinatura ativa, mandamos para o portal em vez de criar uma
  // segunda — cobrar duas vezes a mesma pessoa é o pior erro possível aqui.
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('stripe_subscription_id, billing_status')
    .eq('user_id', identity.userId)
    .not('stripe_subscription_id', 'is', null)
    .in('billing_status', ['active', 'trialing', 'past_due'])
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: 'já existe assinatura ativa', code: 'already_subscribed' },
      { status: 409 },
    );
  }

  const stripe = getStripe();

  const customerId = await ensureCustomer(identity.userId, identity.email);

  const { data: benefitRow } = await supabase
    .from('discount_benefits')
    .select('id, amount, status, expires_at')
    .eq('user_id', identity.userId)
    .eq('status', 'granted')
    .order('created_at')
    .limit(1)
    .maybeSingle();

  const benefit: DiscountBenefit | null = benefitRow
    ? {
        id: String(benefitRow.id),
        amount: Number(benefitRow.amount),
        status: benefitRow.status as DiscountBenefit['status'],
        expiresAt: (benefitRow.expires_at as string | null) ?? null,
      }
    : null;

  const decision = decideCheckout({
    userId: identity.userId,
    plan: {
      interval: body.interval,
      stripePriceId: price.stripe_price_id as string,
      amount: Number(price.amount),
    },
    benefit,
    now: new Date().toISOString(),
  });

  if (decision.couponId) {
    await ensureReferralCoupon(decision.discountAmount);
  }

  const urls = buildReturnUrls(getAppUrl());

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: decision.stripePriceId, quantity: 1 }],
    ...(decision.couponId ? { discounts: [{ coupon: decision.couponId }] } : {}),
    success_url: urls.successUrl,
    cancel_url: urls.cancelUrl,
    locale: 'pt-BR',
    // Os metadados vão TAMBÉM na assinatura: é de lá que o webhook lê o
    // user_id, e a sessão de checkout não sobrevive à renovação do ano
    // seguinte.
    metadata: decision.metadata,
    subscription_data: { metadata: decision.metadata },
    allow_promotion_codes: false,
  });

  return NextResponse.json({
    url: session.url,
    chargeAmount: decision.chargeAmount,
    discountAmount: decision.discountAmount,
  });
}

/** Um cliente do Stripe por usuário, reaproveitado entre assinaturas. */
async function ensureCustomer(userId: string, email: string): Promise<string> {
  const supabase = getServiceClient();

  const { data: existing } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing?.stripe_customer_id) return existing.stripe_customer_id as string;

  const customer = await getStripe().customers.create({
    email: email || undefined,
    metadata: { user_id: userId },
  });

  await supabase
    .from('billing_customers')
    .insert({ user_id: userId, stripe_customer_id: customer.id });

  return customer.id;
}

/**
 * Cupom do desconto de indicação, criado sob demanda.
 *
 * `duration: 'once'` é o que garante que o desconto vale só na primeira
 * cobrança — sem isso ele se repetiria em toda renovação (§83).
 */
async function ensureReferralCoupon(amountOff: number): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.coupons.retrieve(REFERRAL_COUPON_ID);
  } catch {
    await stripe.coupons.create({
      id: REFERRAL_COUPON_ID,
      amount_off: amountOff,
      currency: 'brl',
      duration: 'once',
      name: 'Indicação Dinamique',
    });
  }
}
