import type { Cents, Timestamp, UUID } from '@dinamique/types';
import type { BillingInterval } from './prices';

/**
 * Montagem da sessão de checkout e aplicação do desconto de indicação.
 *
 * Nada aqui fala com o Stripe: são as decisões que precedem a chamada, e é
 * onde um erro custa dinheiro (desconto aplicado duas vezes, cobrança sem o
 * desconto que o usuário tinha direito).
 */

export interface DiscountBenefit {
  id: UUID;
  amount: Cents;
  status: 'granted' | 'used' | 'expired' | 'revoked';
  expiresAt: Timestamp | null;
}

/** Id fixo do cupom no Stripe. Criado sob demanda se ainda não existir. */
export const REFERRAL_COUPON_ID = 'dinamique-indicacao-10';

export interface CheckoutPlan {
  interval: BillingInterval;
  stripePriceId: string;
  amount: Cents;
}

export interface CheckoutDecision {
  stripePriceId: string;
  /** Cupom a aplicar, ou null. */
  couponId: string | null;
  discountAmount: Cents;
  /** O que o usuário paga nesta primeira cobrança. */
  chargeAmount: Cents;
  metadata: Record<string, string>;
}

export function isBenefitUsable(benefit: DiscountBenefit | null, now: Timestamp): boolean {
  if (!benefit) return false;
  if (benefit.status !== 'granted') return false;
  if (benefit.amount <= 0) return false;
  if (benefit.expiresAt && Date.parse(benefit.expiresAt) <= Date.parse(now)) return false;
  return true;
}

/**
 * Decide o que mandar para o Stripe.
 *
 * O desconto nunca produz cobrança negativa: se o benefício é maior que o
 * preço, o Stripe zera a fatura e a diferença se perde — que é a política
 * padrão configurada (§84). Isso é declarado aqui em vez de descoberto no
 * extrato.
 */
export function decideCheckout(input: {
  userId: UUID;
  plan: CheckoutPlan;
  benefit: DiscountBenefit | null;
  now: Timestamp;
}): CheckoutDecision {
  const { userId, plan, benefit, now } = input;

  const usable = isBenefitUsable(benefit, now);
  const discountAmount = usable ? Math.min(benefit!.amount, plan.amount) : 0;

  return {
    stripePriceId: plan.stripePriceId,
    couponId: usable ? REFERRAL_COUPON_ID : null,
    discountAmount,
    chargeAmount: Math.max(0, plan.amount - discountAmount),
    // O user_id viaja em metadata porque é assim que o webhook descobre de
    // quem é a assinatura. Sem ele, o pagamento chega órfão.
    metadata: {
      user_id: userId,
      interval: plan.interval,
      ...(usable ? { benefit_id: benefit!.id } : {}),
    },
  };
}

/**
 * URLs de retorno do checkout.
 *
 * O aplicativo abre o Stripe num navegador e volta por deep link; a web volta
 * para a própria página. As duas usam o mesmo par para o webhook não precisar
 * saber de onde veio.
 */
export function buildReturnUrls(baseUrl: string): { successUrl: string; cancelUrl: string } {
  const base = baseUrl.replace(/\/$/, '');
  return {
    successUrl: `${base}/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/assinatura/cancelado`,
  };
}
