import { NextResponse, type NextRequest } from 'next/server';
import { toCsv, toXlsx, type Sheet, type Workbook } from '@dinamique/exports';
import { formatDuration } from '@dinamique/utils';
import { requireAdmin } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';
import { buildReport, DIMENSIONS, type DimensionKey } from '@/lib/report';

export const dynamic = 'force-dynamic';

const ANALYST_ROLES = ['superadmin', 'admin', 'analyst'] as const;

/**
 * Exportação do relatório atual (§95).
 *
 * Os mesmos filtros da tela vêm pela URL, então o arquivo é exatamente o que
 * está na tela. Toda exportação é registrada no Audit Log – exportar dados
 * agregados de usuários é uma ação sensível.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin([...ANALYST_ROLES]);

  const params = request.nextUrl.searchParams;
  const dimension = (params.get('dim') ?? 'city') as DimensionKey;
  const format = params.get('format') === 'csv' ? 'csv' : 'xlsx';

  if (!DIMENSIONS.some((d) => d.key === dimension)) {
    return NextResponse.json({ error: 'Dimensão inválida.' }, { status: 400 });
  }

  const supabase = getServiceClient();

  let usersQuery = supabase
    .from('analytics_users')
    .select('user_id, city, state, gender, age_band, plan, is_trial, last_seen_at, work_modes, acquisition_source, vehicle_type, vehicle_label, fuel_type, ownership, created_at')
    .limit(20000);

  const eq = (column: string, key: string) => {
    const value = params.get(key);
    if (value && value.trim() !== '') usersQuery = usersQuery.eq(column, value.trim());
  };

  eq('city', 'city');
  eq('state', 'state');
  eq('plan', 'plan');
  eq('vehicle_type', 'vehicleType');
  eq('acquisition_source', 'source');
  eq('age_band', 'ageBand');

  const workMode = params.get('workMode');
  if (workMode) usersQuery = usersQuery.contains('work_modes', [workMode]);
  const from = params.get('from');
  if (from) usersQuery = usersQuery.gte('created_at', from);
  const to = params.get('to');
  if (to) usersQuery = usersQuery.lte('created_at', `${to}T23:59:59`);

  const { data: userRows, error } = await usersQuery;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const users = (userRows as Record<string, any>[] | null) ?? [];

  const { data: financialRows } = await supabase
    .from('analytics_user_financials')
    .select('user_id, gross_revenue, net_profit, total_expenses, worked_seconds, distance')
    .in('user_id', users.length > 0 ? users.map((u) => u.user_id) : ['00000000-0000-0000-0000-000000000000']);

  const report = buildReport(users as never, (financialRows as never) ?? [], dimension);

  const toReais = (cents: number) => Math.round(cents) / 100;

  const sheet: Sheet = {
    name: 'Relatório',
    columns: [
      { key: 'dimensao', header: DIMENSIONS.find((d) => d.key === dimension)!.label, format: 'text', width: 24 },
      { key: 'usuarios', header: 'Usuários', format: 'number', width: 12 },
      { key: 'faturamento', header: 'Faturamento', format: 'currency', width: 16 },
      { key: 'lucro', header: 'Lucro estimado', format: 'currency', width: 16 },
      { key: 'despesas', header: 'Despesas', format: 'currency', width: 16 },
      { key: 'horas', header: 'Tempo trabalhado', format: 'text', width: 16 },
      { key: 'porHora', header: 'R$/hora', format: 'currency', width: 12 },
      { key: 'porKm', header: 'R$/km', format: 'currency', width: 12 },
      { key: 'custoKm', header: 'Custo/km', format: 'currency', width: 12 },
      { key: 'pro', header: 'Assinantes Pro', format: 'number', width: 14 },
      { key: 'conversao', header: 'Conversão %', format: 'number', width: 14 },
      { key: 'retencao', header: 'Retenção 30d %', format: 'number', width: 16 },
    ],
    rows: report.map((row) => ({
      dimensao: row.dimension,
      usuarios: row.users,
      faturamento: toReais(row.grossRevenue),
      lucro: toReais(row.netProfit),
      despesas: toReais(row.totalExpenses),
      horas: formatDuration(row.workedSeconds),
      // Métrica sem denominador fica em branco, nunca zero (§6).
      porHora: row.revenuePerHour !== null ? toReais(row.revenuePerHour) : null,
      porKm: row.revenuePerKm !== null ? toReais(row.revenuePerKm) : null,
      custoKm: row.costPerKm !== null ? toReais(row.costPerKm) : null,
      pro: row.proUsers,
      conversao: row.conversionRate !== null ? Math.round(row.conversionRate * 1000) / 10 : null,
      retencao: row.retentionRate !== null ? Math.round(row.retentionRate * 1000) / 10 : null,
    })),
    totals: {
      dimensao: 'Total',
      usuarios: report.reduce((acc, row) => acc + row.users, 0),
      faturamento: toReais(report.reduce((acc, row) => acc + row.grossRevenue, 0)),
      lucro: toReais(report.reduce((acc, row) => acc + row.netProfit, 0)),
      despesas: toReais(report.reduce((acc, row) => acc + row.totalExpenses, 0)),
      pro: report.reduce((acc, row) => acc + row.proUsers, 0),
    },
  };

  const filters = Object.fromEntries(params.entries());

  await supabase.from('exports').insert({
    user_id: admin.userId,
    scope: `report:${dimension}`,
    format,
    filters,
    row_count: report.length,
  });

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'report.export',
    metadata: { dimension, format, filters, rows: report.length, users: users.length },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `dinamique-relatorio-${dimension}-${stamp}.${format}`;

  if (format === 'csv') {
    return new NextResponse(toCsv(sheet), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });
  }

  const workbook: Workbook = { fileName, sheets: [sheet] };
  const bytes = toXlsx(workbook);

  return new NextResponse(bytes as unknown as BodyInit, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    },
  });
}
