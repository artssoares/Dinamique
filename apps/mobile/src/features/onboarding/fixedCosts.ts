import type { RecurringCostPeriod } from '@dinamique/types';
import type { IconName } from '@dinamique/ui';

/**
 * The fixed costs worth asking about while someone is still setting the app
 * up, and the shape they are collected in.
 *
 * They are the difference between "faturei R$ 300 hoje" and "sobrou R$ 90":
 * rent, an instalment, insurance and the phone bill go out whether the car
 * moves or not, and until they are known every profit figure in the app is
 * optimistic. Asking later means asking someone who has already decided the
 * app tells them what they already knew.
 *
 * Each entry names a seeded `expense_categories.slug`, so nothing here invents
 * a category the database does not have.
 */
export interface FixedCostOption {
  slug: string;
  label: string;
  hint: string;
  icon: IconName;
  /** What most people pay it on, pre-selected so the answer is one tap. */
  period: RecurringCostPeriod;
}

export const FIXED_COST_OPTIONS: FixedCostOption[] = [
  { slug: 'seguro', label: 'Seguro', hint: 'Do veículo', icon: 'shield', period: 'monthly' },
  { slug: 'ipva', label: 'IPVA', hint: 'Imposto anual', icon: 'receipt', period: 'yearly' },
  {
    slug: 'licenciamento',
    label: 'Licenciamento',
    hint: 'Uma vez por ano',
    icon: 'flag',
    period: 'yearly',
  },
  { slug: 'celular', label: 'Celular', hint: 'Plano ou recarga', icon: 'phone', period: 'monthly' },
  { slug: 'internet', label: 'Internet', hint: 'Do celular ou de casa', icon: 'compass', period: 'monthly' },
  { slug: 'lavagem', label: 'Lavagem', hint: 'Lavar o carro', icon: 'star', period: 'monthly' },
  {
    slug: 'estacionamento',
    label: 'Estacionamento',
    hint: 'Vaga ou garagem fixa',
    icon: 'car',
    period: 'monthly',
  },
];

/** Categories the vehicle questions write to, on top of the ones above. */
export const VEHICLE_COST_SLUGS = ['financiamento', 'aluguel'] as const;

/** Every slug the onboarding needs an id for, in one query. */
export const ONBOARDING_COST_SLUGS = [
  ...FIXED_COST_OPTIONS.map((option) => option.slug),
  ...VEHICLE_COST_SLUGS,
];

export const PERIOD_LABELS: Record<RecurringCostPeriod, string> = {
  weekly: 'Por semana',
  monthly: 'Por mês',
  yearly: 'Por ano',
};

export const PERIOD_ORDER: RecurringCostPeriod[] = ['weekly', 'monthly', 'yearly'];

/**
 * The date the last instalment falls on, from how many are left.
 *
 * "Faltam 18 parcelas" is the number a driver has in their head; `end_date` is
 * what the table stores. Converting here means the question can stay in the
 * driver's terms.
 */
export function endDateFromInstalments(remaining: number, from: Date = new Date()): string | null {
  if (!Number.isFinite(remaining) || remaining <= 0) return null;
  const end = new Date(from.getTime());
  end.setMonth(end.getMonth() + Math.round(remaining));
  return end.toISOString().slice(0, 10);
}
