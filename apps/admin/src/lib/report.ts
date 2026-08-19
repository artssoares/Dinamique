import type { Cents } from '@dinamique/types';

/**
 * Report Builder (§93, §94).
 *
 * Um relatório é: dimensões (como agrupar) + filtros (o que incluir). As
 * métricas são sempre as mesmas, porque inventar métrica por relatório é o
 * caminho mais curto para dois números diferentes com o mesmo nome.
 */

export const DIMENSIONS = [
  { key: 'city', label: 'Cidade' },
  { key: 'state', label: 'Estado' },
  { key: 'gender', label: 'Gênero' },
  { key: 'age_band', label: 'Faixa etária' },
  { key: 'plan', label: 'Plano' },
  { key: 'acquisition_source', label: 'Origem de aquisição' },
  { key: 'vehicle_type', label: 'Tipo de veículo' },
  { key: 'vehicle_label', label: 'Veículo' },
  { key: 'fuel_type', label: 'Combustível' },
  { key: 'ownership', label: 'Situação do veículo' },
] as const;

export type DimensionKey = (typeof DIMENSIONS)[number]['key'];

export interface ReportFilters {
  city?: string;
  state?: string;
  plan?: string;
  workMode?: string;
  vehicleType?: string;
  acquisitionSource?: string;
  ageBand?: string;
  /** Cadastros a partir desta data. */
  createdFrom?: string;
  createdTo?: string;
}

export interface ReportRow {
  dimension: string;
  users: number;
  grossRevenue: Cents;
  netProfit: Cents;
  totalExpenses: Cents;
  workedSeconds: number;
  distance: number;
  /** Nulos quando não há denominador – a mesma regra do aplicativo (§6). */
  revenuePerHour: Cents | null;
  revenuePerKm: Cents | null;
  costPerKm: Cents | null;
  proUsers: number;
  conversionRate: number | null;
  activeLast30d: number;
  retentionRate: number | null;
}

interface UserRow {
  user_id: string;
  plan: string;
  is_trial: boolean;
  last_seen_at: string | null;
  [key: string]: unknown;
}

interface FinancialRow {
  user_id: string;
  gross_revenue: number;
  net_profit: number;
  total_expenses: number;
  worked_seconds: number;
  distance: number;
}

/**
 * Agrega em memória, e não em SQL dinâmico.
 *
 * O volume aqui é de milhares de usuários, não de milhões, e montar SQL a
 * partir de entrada do usuário é a porta de entrada clássica de injeção. Se um
 * dia o volume exigir, a troca é por uma função no banco com dimensões
 * validadas – não por concatenação de string.
 */
export function buildReport(
  users: UserRow[],
  financials: FinancialRow[],
  dimension: DimensionKey,
): ReportRow[] {
  const byUser = new Map(financials.map((row) => [row.user_id, row]));
  const groups = new Map<string, { users: UserRow[]; financials: FinancialRow[] }>();

  for (const user of users) {
    const raw = user[dimension];
    const key = raw === null || raw === undefined || raw === '' ? 'Não informado' : String(raw);
    const group = groups.get(key) ?? { users: [], financials: [] };
    group.users.push(user);
    const financial = byUser.get(user.user_id);
    if (financial) group.financials.push(financial);
    groups.set(key, group);
  }

  const thirtyDaysAgo = Date.now() - 30 * 86_400_000;

  return [...groups.entries()]
    .map(([dimensionValue, group]) => {
      const sum = (key: keyof FinancialRow) =>
        group.financials.reduce((acc, row) => acc + (Number(row[key]) || 0), 0);

      const grossRevenue = sum('gross_revenue');
      const totalExpenses = sum('total_expenses');
      const workedSeconds = sum('worked_seconds');
      const distance = sum('distance');

      const proUsers = group.users.filter((u) => u.plan === 'pro' && !u.is_trial).length;
      const active = group.users.filter(
        (u) => u.last_seen_at !== null && Date.parse(u.last_seen_at) >= thirtyDaysAgo,
      ).length;

      const perUnit = (amount: number, units: number): Cents | null =>
        units > 0 ? Math.round(amount / units) : null;

      return {
        dimension: dimensionValue,
        users: group.users.length,
        grossRevenue,
        netProfit: sum('net_profit'),
        totalExpenses,
        workedSeconds,
        distance,
        revenuePerHour: perUnit(grossRevenue, workedSeconds / 3600),
        revenuePerKm: perUnit(grossRevenue, distance / 1000),
        costPerKm: perUnit(totalExpenses, distance / 1000),
        proUsers,
        conversionRate: group.users.length > 0 ? proUsers / group.users.length : null,
        activeLast30d: active,
        retentionRate: group.users.length > 0 ? active / group.users.length : null,
      };
    })
    .sort((a, b) => b.users - a.users);
}
