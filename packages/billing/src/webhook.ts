import type { Timestamp, UUID } from '@dinamique/types';
import type { BillingInterval } from './prices';

/**
 * Tradução de eventos do Stripe para o nosso estado de assinatura.
 *
 * Fica isolado da biblioteca do Stripe de propósito: é a parte onde um engano
 * concede ou revoga plano indevidamente, e precisa ser testável sem rede,
 * sem chave e sem SDK.
 */

export type BillingStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

/** Eventos que realmente mudam alguma coisa. O resto é ignorado de propósito. */
export const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.paid',
  'invoice.payment_failed',
] as const;

export type HandledEvent = (typeof HANDLED_EVENTS)[number];

export function isHandledEvent(type: string): type is HandledEvent {
  return (HANDLED_EVENTS as readonly string[]).includes(type);
}

/** Recorte mínimo do que precisamos de um evento do Stripe. */
export interface StripeEventInput {
  id: string;
  type: string;
  /** Segundos desde a época, como o Stripe envia. */
  created: number;
  data: {
    object: Record<string, unknown>;
  };
}

export interface SubscriptionState {
  userId: UUID;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  stripePriceId: string | null;
  interval: BillingInterval | null;
  status: BillingStatus;
  currentPeriodEnd: Timestamp | null;
  cancelAtPeriodEnd: boolean;
}

export type WebhookOutcome =
  | { action: 'ignore'; reason: string }
  | { action: 'apply'; state: SubscriptionState; grantsPro: boolean }
  | { action: 'error'; reason: string };

/**
 * O Stripe usa mais estados do que precisamos. `incomplete_expired` e
 * `paused` viram cancelamento porque, do ponto de vista do usuário, o efeito é
 * o mesmo: o Pro não vale mais.
 */
export function mapStripeStatus(status: unknown): BillingStatus {
  switch (status) {
    case 'trialing':
      return 'trialing';
    case 'active':
      return 'active';
    case 'past_due':
      return 'past_due';
    case 'unpaid':
      return 'unpaid';
    case 'incomplete':
      return 'incomplete';
    case 'canceled':
    case 'incomplete_expired':
    case 'paused':
      return 'canceled';
    default:
      return 'incomplete';
  }
}

/**
 * Estados em que o Pro continua valendo.
 *
 * `past_due` mantém o acesso: a cobrança falhou mas o Stripe ainda vai tentar
 * de novo, e cortar o acesso de um motorista por um cartão que recusou na
 * primeira tentativa é hostil. Quem decide o corte é o `unpaid`, que vem
 * depois de todas as tentativas.
 */
export function grantsPro(status: BillingStatus): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}

function toTimestamp(value: unknown): Timestamp | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function intervalFrom(object: Record<string, unknown>): BillingInterval | null {
  const items = object.items as { data?: { price?: Record<string, unknown> }[] } | undefined;
  const price = items?.data?.[0]?.price;
  const recurring = price?.recurring as { interval?: unknown } | undefined;
  if (recurring?.interval === 'month') return 'month';
  if (recurring?.interval === 'year') return 'year';
  return null;
}

function priceIdFrom(object: Record<string, unknown>): string | null {
  const items = object.items as { data?: { price?: { id?: unknown } }[] } | undefined;
  const id = items?.data?.[0]?.price?.id;
  return typeof id === 'string' ? id : null;
}

/**
 * O id do usuário viaja em `metadata.user_id`, gravado quando criamos a sessão
 * de checkout. Sem ele não há como saber de quem é a assinatura, e conceder
 * plano a um palpite seria pior que falhar.
 */
function userIdFrom(object: Record<string, unknown>): UUID | null {
  const metadata = object.metadata as Record<string, unknown> | undefined;
  const value = metadata?.user_id;
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function interpretEvent(event: StripeEventInput): WebhookOutcome {
  if (!isHandledEvent(event.type)) {
    return { action: 'ignore', reason: `evento não tratado: ${event.type}` };
  }

  const object = event.data.object;

  // Faturas apontam para a assinatura; o estado real vem no evento de
  // assinatura que o Stripe manda junto. Aqui só registramos e seguimos.
  if (event.type === 'invoice.paid' || event.type === 'invoice.payment_failed') {
    return { action: 'ignore', reason: 'fatura registrada; o estado vem no evento da assinatura' };
  }

  if (event.type === 'checkout.session.completed') {
    const mode = object.mode;
    if (mode !== 'subscription') {
      return { action: 'ignore', reason: 'checkout que não é de assinatura' };
    }
    // A sessão concluída confirma quem é o cliente, mas o estado da assinatura
    // chega no evento próprio dela. Tratamos aqui só o vínculo.
    return { action: 'ignore', reason: 'sessão concluída; o estado vem no evento da assinatura' };
  }

  const userId = userIdFrom(object);
  if (!userId) {
    return { action: 'error', reason: 'assinatura sem user_id em metadata' };
  }

  const subscriptionId = object.id;
  if (typeof subscriptionId !== 'string') {
    return { action: 'error', reason: 'assinatura sem id' };
  }

  const customer = object.customer;
  const customerId = typeof customer === 'string' ? customer : null;
  if (!customerId) {
    return { action: 'error', reason: 'assinatura sem cliente' };
  }

  const status =
    event.type === 'customer.subscription.deleted'
      ? 'canceled'
      : mapStripeStatus(object.status);

  const state: SubscriptionState = {
    userId,
    stripeSubscriptionId: subscriptionId,
    stripeCustomerId: customerId,
    stripePriceId: priceIdFrom(object),
    interval: intervalFrom(object),
    status,
    currentPeriodEnd: toTimestamp(object.current_period_end),
    cancelAtPeriodEnd: object.cancel_at_period_end === true,
  };

  return { action: 'apply', state, grantsPro: grantsPro(status) };
}

/**
 * O Stripe não garante ordem de entrega. Um `updated` antigo chegando depois
 * de um `deleted` novo reativaria uma assinatura cancelada.
 */
export function isStaleEvent(
  event: StripeEventInput,
  lastProcessedAt: Timestamp | null,
): boolean {
  if (!lastProcessedAt) return false;
  return event.created * 1000 < Date.parse(lastProcessedAt);
}
