import type { Cents } from '@dinamique/types';

/**
 * Catálogo de preços.
 *
 * Estes valores são o PADRÃO de instalação. A fonte da verdade em execução é a
 * tabela `billing_prices`, editável pelo Admin — mudar preço é decisão
 * comercial e não deve exigir novo build nem aprovação de loja.
 */

export type BillingInterval = 'month' | 'year';

export interface PriceDefinition {
  interval: BillingInterval;
  amount: Cents;
  currency: 'BRL';
  label: string;
}

export const DEFAULT_PRICES: Record<BillingInterval, PriceDefinition> = {
  month: { interval: 'month', amount: 1990, currency: 'BRL', label: 'Mensal' },
  year: { interval: 'year', amount: 4990, currency: 'BRL', label: 'Anual' },
};

export function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'month' || value === 'year';
}

/**
 * Quanto o plano anual custa por mês, para a tela poder comparar. Arredonda
 * para baixo em favor de não prometer um preço menor do que o real.
 */
export function monthlyEquivalent(annual: Cents): Cents {
  return Math.ceil(annual / 12);
}

/**
 * Economia do anual em relação a pagar 12 meses avulsos.
 * Devolve null quando o anual não é mais barato — nesse caso a tela não deve
 * anunciar economia nenhuma.
 */
export function annualSavings(
  monthly: Cents,
  annual: Cents,
): { amount: Cents; ratio: number } | null {
  const twelveMonths = monthly * 12;
  if (annual >= twelveMonths) return null;

  const amount = twelveMonths - annual;
  return { amount, ratio: amount / twelveMonths };
}
