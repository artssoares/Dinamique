'use server';

import { revalidatePath } from 'next/cache';
import { isBillingInterval } from '@dinamique/billing';
import { parseCents } from '@dinamique/utils';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getStripe } from '@/lib/stripe';
import { getServiceClient } from '@/lib/supabase-server';

const SUPERADMIN = ['superadmin'] as const;

/**
 * Publica os preços no Stripe.
 *
 * Preço no Stripe é imutável: mudar valor significa criar um preço novo e
 * desativar o antigo. Quem já assinava continua no preço que contratou, que é
 * o comportamento correto — e o motivo de guardarmos o id do preço em cada
 * assinatura.
 */
export async function syncPrices() {
  const admin = await requireAdmin([...SUPERADMIN]);
  const stripe = getStripe();
  const supabase = getServiceClient();

  const { data: prices } = await supabase
    .from('billing_prices')
    .select('id, interval, amount, currency, stripe_price_id')
    .eq('plan', 'pro')
    .eq('is_active', true);

  // Um produto só; as periodicidades são preços dele.
  const productId = await ensureProduct();

  for (const row of (prices as Record<string, any>[] | null) ?? []) {
    if (row.stripe_price_id) continue;

    const price = await stripe.prices.create({
      product: productId,
      currency: String(row.currency).toLowerCase(),
      unit_amount: Number(row.amount),
      recurring: { interval: row.interval as 'month' | 'year' },
      nickname: `Dinamique Pro ${row.interval === 'year' ? 'anual' : 'mensal'}`,
      metadata: { plan: 'pro', interval: String(row.interval) },
    });

    await supabase
      .from('billing_prices')
      .update({ stripe_price_id: price.id })
      .eq('id', row.id);
  }

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'billing.sync_prices',
    targetTable: 'billing_prices',
  });

  revalidatePath('/assinaturas');
}

async function ensureProduct(): Promise<string> {
  const stripe = getStripe();

  const existing = await stripe.products.search({
    query: "metadata['dinamique_plan']:'pro'",
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0].id;

  const product = await stripe.products.create({
    name: 'Dinamique Pro',
    description: 'Acesso completo ao Dinamique.',
    metadata: { dinamique_plan: 'pro' },
  });
  return product.id;
}

/**
 * Muda o valor de um plano.
 *
 * Cria um preço novo no Stripe e aposenta o anterior. Quem já assina não é
 * afetado — o Stripe cobra pelo preço que a assinatura carrega.
 */
export async function changePrice(formData: FormData) {
  const admin = await requireAdmin([...SUPERADMIN]);

  const interval = String(formData.get('interval') ?? '');
  const amount = parseCents(String(formData.get('amount') ?? ''));
  if (!isBillingInterval(interval) || amount === null || amount <= 0) return;

  const supabase = getServiceClient();

  // Desativa o preço atual antes de criar o novo: o índice único garante um
  // preço ativo por periodicidade, então a ordem importa.
  await supabase
    .from('billing_prices')
    .update({ is_active: false })
    .eq('plan', 'pro')
    .eq('interval', interval)
    .eq('is_active', true);

  await supabase.from('billing_prices').insert({
    plan: 'pro',
    interval,
    amount,
    is_active: true,
  });

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'billing.change_price',
    targetTable: 'billing_prices',
    metadata: { interval, amount },
  });

  revalidatePath('/assinaturas');
}
