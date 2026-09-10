import { describe, expect, it, vi } from 'vitest';

// O módulo é um hook e arrasta o cliente do banco e o expo-router junto. O que
// está sob teste aqui são as duas funções puras que ele exporta.
vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/hooks/useSession', () => ({ useSession: () => ({ session: null }) }));
vi.mock('@/hooks/useReloadOnFocus', () => ({ useReloadOnFocus: () => {} }));

const { hasEntries, summariseRows } = await import('./useSummary');

function row(over: Partial<Parameters<typeof hasEntries>[0]> = {}) {
  return {
    date: '2026-09-08',
    gross_revenue: 0,
    tips: 0,
    total_expenses: 0,
    vehicle_expenses: 0,
    net_profit: 0,
    worked_seconds: 0,
    distance: 0,
    trip_count: 0,
    ...over,
  };
}

describe('hasEntries', () => {
  // O bug: os Insights contavam um dia só quando havia faturamento ou tempo, e
  // o Histórico contava também quando havia gasto. Quem parou em casa e lançou
  // só o combustível via o mesmo período com uma quantidade de dias em cada
  // aba, e a média por dia saía dividida pelo denominador errado.
  it('counts a day that only has a cost', () => {
    expect(hasEntries(row({ total_expenses: 9000, net_profit: -9000 }))).toBe(true);
  });

  it('counts a day with money or with time', () => {
    expect(hasEntries(row({ gross_revenue: 5000 }))).toBe(true);
    expect(hasEntries(row({ worked_seconds: 3600 }))).toBe(true);
  });

  it('leaves an empty day out', () => {
    expect(hasEntries(row())).toBe(false);
  });
});

describe('summariseRows', () => {
  it('does not count tips twice', () => {
    // `gross_revenue` na view já inclui as gorjetas.
    const summary = summariseRows([row({ gross_revenue: 10_000, tips: 2000 })]);
    expect(summary.grossRevenue).toBe(10_000);
    expect(summary.tips).toBe(2000);
  });

  it('splits the vehicle share out of the total cost', () => {
    const summary = summariseRows([
      row({ gross_revenue: 20_000, total_expenses: 8000, vehicle_expenses: 5000 }),
    ]);
    expect(summary.totalExpenses).toBe(8000);
    expect(summary.vehicleExpenses).toBe(5000);
    expect(summary.netProfit).toBe(12_000);
  });

  it('gives cost per hour and cost per km from the period', () => {
    const summary = summariseRows([
      row({
        gross_revenue: 30_000,
        total_expenses: 6000,
        vehicle_expenses: 4000,
        worked_seconds: 7200,
        distance: 100_000,
      }),
    ]);
    expect(summary.costPerHour).toBe(3000);
    // Só o custo do veículo entra no R$/km (§6).
    expect(summary.costPerKm).toBe(40);
  });

  // Sem denominador não há métrica: um traço, nunca um zero.
  it('returns null rather than zero when there is no time and no distance', () => {
    const summary = summariseRows([row({ gross_revenue: 5000, total_expenses: 1000 })]);
    expect(summary.costPerHour).toBeNull();
    expect(summary.costPerKm).toBeNull();
    expect(summary.revenuePerKm).toBeNull();
  });
});
