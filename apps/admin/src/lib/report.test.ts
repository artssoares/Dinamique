import { describe, expect, it } from 'vitest';
import { buildReport } from './report';

const users = [
  { user_id: 'a', city: 'São Paulo', plan: 'pro', is_trial: false, last_seen_at: new Date().toISOString() },
  { user_id: 'b', city: 'São Paulo', plan: 'free', is_trial: false, last_seen_at: new Date().toISOString() },
  { user_id: 'c', city: 'Curitiba', plan: 'free', is_trial: false, last_seen_at: null },
  { user_id: 'd', city: null, plan: 'free', is_trial: false, last_seen_at: null },
];

const financials = [
  { user_id: 'a', gross_revenue: 100000, net_profit: 70000, total_expenses: 30000, worked_seconds: 36000, distance: 500000 },
  { user_id: 'b', gross_revenue: 50000, net_profit: 30000, total_expenses: 20000, worked_seconds: 18000, distance: 250000 },
  { user_id: 'c', gross_revenue: 40000, net_profit: 25000, total_expenses: 15000, worked_seconds: 0, distance: 0 },
];

describe('buildReport', () => {
  it('agrupa pela dimensão escolhida', () => {
    const rows = buildReport(users, financials, 'city');
    expect(rows.map((row) => row.dimension)).toEqual(['São Paulo', 'Curitiba', 'Não informado']);
    expect(rows[0]!.users).toBe(2);
  });

  it('soma os valores do grupo', () => {
    const rows = buildReport(users, financials, 'city');
    const sp = rows.find((row) => row.dimension === 'São Paulo')!;
    expect(sp.grossRevenue).toBe(150000);
    expect(sp.netProfit).toBe(100000);
  });

  it('calcula conversão e retenção', () => {
    const rows = buildReport(users, financials, 'city');
    const sp = rows.find((row) => row.dimension === 'São Paulo')!;
    expect(sp.proUsers).toBe(1);
    expect(sp.conversionRate).toBe(0.5);
    expect(sp.retentionRate).toBe(1);

    const curitiba = rows.find((row) => row.dimension === 'Curitiba')!;
    expect(curitiba.retentionRate).toBe(0);
  });

  it('devolve null quando não há denominador (§6)', () => {
    const rows = buildReport(users, financials, 'city');
    const curitiba = rows.find((row) => row.dimension === 'Curitiba')!;
    expect(curitiba.revenuePerHour).toBeNull();
    expect(curitiba.revenuePerKm).toBeNull();
    expect(curitiba.costPerKm).toBeNull();

    const sp = rows.find((row) => row.dimension === 'São Paulo')!;
    expect(sp.revenuePerKm).toBe(200);
  });

  it('agrupa valores ausentes em "Não informado" em vez de descartar', () => {
    const rows = buildReport(users, financials, 'city');
    expect(rows.find((row) => row.dimension === 'Não informado')?.users).toBe(1);
  });

  it('conta usuário sem dado financeiro, mas não inventa faturamento', () => {
    const rows = buildReport(users, financials, 'city');
    const semDados = rows.find((row) => row.dimension === 'Não informado')!;
    expect(semDados.users).toBe(1);
    expect(semDados.grossRevenue).toBe(0);
    expect(semDados.revenuePerKm).toBeNull();
  });
});
