import { NextResponse } from 'next/server';
import { authenticateRequest } from '@/lib/billing-auth';
import { getAppUrl, getStripe } from '@/lib/stripe';
import { getServiceClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Portal do cliente: trocar cartão, ver faturas, cancelar.
 *
 * É o próprio Stripe que atende – não reconstruímos gestão de assinatura, e o
 * cancelamento volta para nós como webhook. Um botão de cancelar caseiro
 * dependeria de nós lembrarmos de avisar o Stripe; assim é o contrário.
 */
export async function POST(request: Request) {
  const identity = await authenticateRequest(request);
  if (!identity) {
    return NextResponse.json({ error: 'não autenticado' }, { status: 401 });
  }

  const supabase = getServiceClient();
  const { data: customer } = await supabase
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('user_id', identity.userId)
    .maybeSingle();

  if (!customer?.stripe_customer_id) {
    return NextResponse.json({ error: 'sem assinatura', code: 'no_subscription' }, { status: 404 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customer.stripe_customer_id as string,
    return_url: `${getAppUrl().replace(/\/$/, '')}/plan`,
    locale: 'pt-BR',
  });

  return NextResponse.json({ url: session.url });
}
