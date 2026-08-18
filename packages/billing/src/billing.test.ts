import { describe, expect, it } from 'vitest';
import { annualSavings, isBillingInterval, monthlyEquivalent, DEFAULT_PRICES } from './prices';
import {
  grantsPro,
  interpretEvent,
  isHandledEvent,
  isStaleEvent,
  mapStripeStatus,
  type StripeEventInput,
} from './webhook';
import { buildReturnUrls, decideCheckout, isBenefitUsable, REFERRAL_COUPON_ID } from './checkout';

const NOW = '2026-08-18T12:00:00.000Z';

describe('preços', () => {
  it('usa os valores definidos comercialmente', () => {
    expect(DEFAULT_PRICES.month.amount).toBe(1990);
    expect(DEFAULT_PRICES.year.amount).toBe(4990);
  });

  it('calcula o equivalente mensal do anual arredondando para cima', () => {
    // R$ 49,90 / 12 = R$ 4,158… → R$ 4,16, para não prometer menos do que é.
    expect(monthlyEquivalent(4990)).toBe(416);
  });

  it('calcula a economia do anual', () => {
    const savings = annualSavings(1990, 4990)!;
    expect(savings.amount).toBe(1990 * 12 - 4990);
    expect(savings.ratio).toBeCloseTo(0.79, 2);
  });

  it('não anuncia economia quando o anual não é mais barato', () => {
    expect(annualSavings(1000, 12000)).toBeNull();
    expect(annualSavings(1000, 15000)).toBeNull();
  });

  it('valida a periodicidade', () => {
    expect(isBillingInterval('month')).toBe(true);
    expect(isBillingInterval('week')).toBe(false);
  });
});

describe('mapStripeStatus', () => {
  it('traduz os estados conhecidos', () => {
    expect(mapStripeStatus('active')).toBe('active');
    expect(mapStripeStatus('trialing')).toBe('trialing');
    expect(mapStripeStatus('past_due')).toBe('past_due');
    expect(mapStripeStatus('unpaid')).toBe('unpaid');
  });

  it('trata estados terminais como cancelamento', () => {
    expect(mapStripeStatus('canceled')).toBe('canceled');
    expect(mapStripeStatus('incomplete_expired')).toBe('canceled');
    expect(mapStripeStatus('paused')).toBe('canceled');
  });

  it('cai em incomplete diante de valor desconhecido, nunca em ativo', () => {
    expect(mapStripeStatus('coisa_nova_do_stripe')).toBe('incomplete');
    expect(mapStripeStatus(undefined)).toBe('incomplete');
    expect(mapStripeStatus(null)).toBe('incomplete');
  });
});

describe('grantsPro', () => {
  it('mantém o acesso enquanto o Stripe ainda tenta cobrar', () => {
    expect(grantsPro('active')).toBe(true);
    expect(grantsPro('trialing')).toBe(true);
    // Cortar acesso na primeira recusa do cartão seria hostil.
    expect(grantsPro('past_due')).toBe(true);
  });

  it('corta o acesso quando não há mais o que tentar', () => {
    expect(grantsPro('unpaid')).toBe(false);
    expect(grantsPro('canceled')).toBe(false);
    expect(grantsPro('incomplete')).toBe(false);
  });
});

function subscriptionEvent(over: Record<string, unknown> = {}, type = 'customer.subscription.updated'): StripeEventInput {
  return {
    id: 'evt_1',
    type,
    created: 1_800_000_000,
    data: {
      object: {
        id: 'sub_123',
        customer: 'cus_123',
        status: 'active',
        current_period_end: 1_800_600_000,
        cancel_at_period_end: false,
        metadata: { user_id: 'user-abc' },
        items: { data: [{ price: { id: 'price_mensal', recurring: { interval: 'month' } } }] },
        ...over,
      },
    },
  };
}

describe('interpretEvent', () => {
  it('reconhece os eventos que importam', () => {
    expect(isHandledEvent('customer.subscription.updated')).toBe(true);
    expect(isHandledEvent('customer.discount.created')).toBe(false);
  });

  it('ignora evento fora da lista em vez de tentar adivinhar', () => {
    const result = interpretEvent({ ...subscriptionEvent(), type: 'ping' });
    expect(result.action).toBe('ignore');
  });

  it('extrai o estado de uma assinatura ativa', () => {
    const result = interpretEvent(subscriptionEvent());
    expect(result.action).toBe('apply');
    if (result.action !== 'apply') return;

    expect(result.state.userId).toBe('user-abc');
    expect(result.state.stripeSubscriptionId).toBe('sub_123');
    expect(result.state.stripeCustomerId).toBe('cus_123');
    expect(result.state.stripePriceId).toBe('price_mensal');
    expect(result.state.interval).toBe('month');
    expect(result.state.status).toBe('active');
    expect(result.state.currentPeriodEnd).toBe('2027-01-22T06:40:00.000Z');
    expect(result.grantsPro).toBe(true);
  });

  it('lê a periodicidade anual', () => {
    const result = interpretEvent(
      subscriptionEvent({
        items: { data: [{ price: { id: 'price_anual', recurring: { interval: 'year' } } }] },
      }),
    );
    if (result.action !== 'apply') throw new Error('esperava apply');
    expect(result.state.interval).toBe('year');
  });

  it('trata o evento de exclusão como cancelamento, seja qual for o status', () => {
    const result = interpretEvent(
      subscriptionEvent({ status: 'active' }, 'customer.subscription.deleted'),
    );
    if (result.action !== 'apply') throw new Error('esperava apply');
    expect(result.state.status).toBe('canceled');
    expect(result.grantsPro).toBe(false);
  });

  it('reconhece cancelamento agendado sem cortar o acesso já pago', () => {
    const result = interpretEvent(subscriptionEvent({ cancel_at_period_end: true }));
    if (result.action !== 'apply') throw new Error('esperava apply');
    expect(result.state.cancelAtPeriodEnd).toBe(true);
    expect(result.grantsPro).toBe(true);
  });

  it('recusa assinatura sem user_id em vez de conceder plano a um palpite', () => {
    const result = interpretEvent(subscriptionEvent({ metadata: {} }));
    expect(result.action).toBe('error');
  });

  it('recusa assinatura sem cliente', () => {
    const result = interpretEvent(subscriptionEvent({ customer: null }));
    expect(result.action).toBe('error');
  });

  it('não confunde checkout avulso com assinatura', () => {
    const result = interpretEvent({
      id: 'evt_2',
      type: 'checkout.session.completed',
      created: 1_800_000_000,
      data: { object: { mode: 'payment' } },
    });
    expect(result.action).toBe('ignore');
  });

  it('deixa o estado para o evento da assinatura, não para a fatura', () => {
    const paid = interpretEvent({
      id: 'evt_3',
      type: 'invoice.paid',
      created: 1_800_000_000,
      data: { object: { subscription: 'sub_123' } },
    });
    expect(paid.action).toBe('ignore');
  });

  it('sobrevive a uma assinatura sem itens de preço', () => {
    const result = interpretEvent(subscriptionEvent({ items: undefined }));
    if (result.action !== 'apply') throw new Error('esperava apply');
    expect(result.state.stripePriceId).toBeNull();
    expect(result.state.interval).toBeNull();
  });
});

describe('isStaleEvent', () => {
  it('descarta evento mais antigo que o último processado', () => {
    // O evento é de 15/01/2027; se já processamos algo de 20/01, este chegou
    // fora de ordem e reaplicá-lo reativaria um estado vencido.
    expect(isStaleEvent(subscriptionEvent(), '2027-01-20T00:00:00.000Z')).toBe(true);
  });

  it('aceita evento mais novo que o último processado', () => {
    expect(isStaleEvent(subscriptionEvent(), '2027-01-01T00:00:00.000Z')).toBe(false);
  });

  it('aceita o primeiro evento de uma assinatura', () => {
    expect(isStaleEvent(subscriptionEvent(), null)).toBe(false);
  });
});

describe('decideCheckout', () => {
  const plan = { interval: 'month' as const, stripePriceId: 'price_mensal', amount: 1990 };

  it('cobra o preço cheio sem benefício', () => {
    const decision = decideCheckout({ userId: 'u1', plan, benefit: null, now: NOW });
    expect(decision.couponId).toBeNull();
    expect(decision.discountAmount).toBe(0);
    expect(decision.chargeAmount).toBe(1990);
  });

  it('aplica o desconto de indicação', () => {
    const decision = decideCheckout({
      userId: 'u1',
      plan,
      benefit: { id: 'b1', amount: 1000, status: 'granted', expiresAt: null },
      now: NOW,
    });
    expect(decision.couponId).toBe(REFERRAL_COUPON_ID);
    expect(decision.discountAmount).toBe(1000);
    expect(decision.chargeAmount).toBe(990);
    expect(decision.metadata.benefit_id).toBe('b1');
  });

  it('nunca produz cobrança negativa', () => {
    const decision = decideCheckout({
      userId: 'u1',
      plan: { ...plan, amount: 600 },
      benefit: { id: 'b1', amount: 1000, status: 'granted', expiresAt: null },
      now: NOW,
    });
    expect(decision.chargeAmount).toBe(0);
    expect(decision.discountAmount).toBe(600);
  });

  it('ignora benefício já usado, expirado ou revogado', () => {
    for (const status of ['used', 'expired', 'revoked'] as const) {
      const decision = decideCheckout({
        userId: 'u1',
        plan,
        benefit: { id: 'b1', amount: 1000, status, expiresAt: null },
        now: NOW,
      });
      expect(decision.couponId).toBeNull();
      expect(decision.chargeAmount).toBe(1990);
    }
  });

  it('ignora benefício vencido', () => {
    const decision = decideCheckout({
      userId: 'u1',
      plan,
      benefit: { id: 'b1', amount: 1000, status: 'granted', expiresAt: '2026-08-01T00:00:00.000Z' },
      now: NOW,
    });
    expect(decision.couponId).toBeNull();
  });

  it('sempre manda o user_id, que é como o webhook sabe de quem é', () => {
    const decision = decideCheckout({ userId: 'u1', plan, benefit: null, now: NOW });
    expect(decision.metadata.user_id).toBe('u1');
    expect(decision.metadata.interval).toBe('month');
  });
});

describe('isBenefitUsable', () => {
  it('rejeita ausência de benefício e valor zerado', () => {
    expect(isBenefitUsable(null, NOW)).toBe(false);
    expect(isBenefitUsable({ id: 'b', amount: 0, status: 'granted', expiresAt: null }, NOW)).toBe(false);
  });
});

describe('buildReturnUrls', () => {
  it('monta as URLs de retorno com o marcador de sessão do Stripe', () => {
    const urls = buildReturnUrls('https://app.dinamique.com.br/');
    expect(urls.successUrl).toBe(
      'https://app.dinamique.com.br/assinatura/sucesso?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(urls.cancelUrl).toBe('https://app.dinamique.com.br/assinatura/cancelado');
  });
});
