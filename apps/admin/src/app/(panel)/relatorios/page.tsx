import Link from 'next/link';
import { formatCents, formatDuration, formatPercent } from '@dinamique/utils';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { buildReport, DIMENSIONS, type DimensionKey } from '@/lib/report';

export const dynamic = 'force-dynamic';

const ANALYST_ROLES = ['superadmin', 'admin', 'analyst'] as const;

/**
 * Relatórios com cruzamento de filtros (§93, §94).
 *
 * Os filtros vêm pela URL, então um relatório útil é só um link que se salva
 * ou se compartilha – sem precisar de um mecanismo de "relatórios salvos"
 * antes de existir demanda para ele.
 */
export default async function Reports({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireAdmin([...ANALYST_ROLES]);
  const params = await searchParams;
  const dimension = (params.dim ?? 'city') as DimensionKey;

  const supabase = await getSessionClient();

  let usersQuery = supabase
    .from('analytics_users')
    .select('user_id, city, state, gender, age_band, plan, is_trial, last_seen_at, work_modes, acquisition_source, vehicle_type, vehicle_label, fuel_type, ownership, created_at')
    .limit(5000);

  // Cada filtro é aplicado por igualdade em coluna conhecida – nunca por SQL
  // montado com texto do usuário.
  const eq = (column: string, key: string) => {
    const value = params[key];
    if (value && value.trim() !== '') usersQuery = usersQuery.eq(column, value.trim());
  };

  eq('city', 'city');
  eq('state', 'state');
  eq('plan', 'plan');
  eq('vehicle_type', 'vehicleType');
  eq('acquisition_source', 'source');
  eq('age_band', 'ageBand');

  if (params.workMode) usersQuery = usersQuery.contains('work_modes', [params.workMode]);
  if (params.from) usersQuery = usersQuery.gte('created_at', params.from);
  if (params.to) usersQuery = usersQuery.lte('created_at', `${params.to}T23:59:59`);

  const { data: userRows } = await usersQuery;
  const users = (userRows as Record<string, any>[] | null) ?? [];

  const { data: financialRows } = await supabase
    .from('analytics_user_financials')
    .select('user_id, gross_revenue, net_profit, total_expenses, worked_seconds, distance')
    .in('user_id', users.length > 0 ? users.map((u) => u.user_id) : ['00000000-0000-0000-0000-000000000000']);

  const report = buildReport(
    users as never,
    (financialRows as never) ?? [],
    dimension,
  );

  const exportHref = `/api/export/report?${new URLSearchParams(
    Object.entries({ ...params, dim: dimension }).filter(([, v]) => v) as [string, string][],
  ).toString()}`;

  return (
    <>
      <h1 className="page-title">Relatórios</h1>
      <p className="page-subtitle">
        {users.length.toLocaleString('pt-BR')} usuários no recorte atual. Contas de demonstração
        ficam de fora.
      </p>

      <form method="get" className="card" style={{ display: 'grid', gap: 12, marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
          <div>
            <label htmlFor="dim" className="stat-label">AGRUPAR POR</label>
            <select id="dim" name="dim" className="select" defaultValue={dimension}>
              {DIMENSIONS.map((option) => (
                <option key={option.key} value={option.key}>{option.label}</option>
              ))}
            </select>
          </div>
          <Input name="city" label="CIDADE" value={params.city} />
          <Input name="state" label="ESTADO" value={params.state} placeholder="SP" />
          <div>
            <label htmlFor="plan" className="stat-label">PLANO</label>
            <select id="plan" name="plan" className="select" defaultValue={params.plan ?? ''}>
              <option value="">Todos</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
            </select>
          </div>
          <div>
            <label htmlFor="workMode" className="stat-label">MODALIDADE</label>
            <select id="workMode" name="workMode" className="select" defaultValue={params.workMode ?? ''}>
              <option value="">Todas</option>
              <option value="rideshare">Aplicativo</option>
              <option value="delivery">Delivery</option>
              <option value="taxi">Táxi</option>
              <option value="private">Particular</option>
            </select>
          </div>
          <Input name="vehicleType" label="TIPO DE VEÍCULO" value={params.vehicleType} placeholder="car" />
          <Input name="source" label="ORIGEM" value={params.source} placeholder="organic" />
          <Input name="ageBand" label="FAIXA ETÁRIA" value={params.ageBand} placeholder="25-34" />
          <Input name="from" label="CADASTRO DE" value={params.from} type="date" />
          <Input name="to" label="CADASTRO ATÉ" value={params.to} type="date" />
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="submit" className="button">Aplicar</button>
          <Link href="/relatorios" className="button button-ghost">Limpar</Link>
          <a href={exportHref} className="button button-ghost">Exportar XLSX</a>
          <a href={`${exportHref}&format=csv`} className="button button-ghost">Exportar CSV</a>
        </div>
      </form>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {report.length === 0 ? (
          <div className="empty">Nenhum usuário neste recorte.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>{DIMENSIONS.find((d) => d.key === dimension)?.label}</th>
                <th>Usuários</th>
                <th>Faturamento</th>
                <th>Lucro</th>
                <th>Despesas</th>
                <th>Horas</th>
                <th>R$/hora</th>
                <th>R$/km</th>
                <th>Custo/km</th>
                <th>Pro</th>
                <th>Conversão</th>
                <th>Retenção 30d</th>
              </tr>
            </thead>
            <tbody>
              {report.map((row) => (
                <tr key={row.dimension}>
                  <td style={{ fontWeight: 600 }}>{row.dimension}</td>
                  <td className="small mono">{row.users}</td>
                  <td className="small mono">{formatCents(row.grossRevenue)}</td>
                  <td className="small mono">{formatCents(row.netProfit)}</td>
                  <td className="small mono">{formatCents(row.totalExpenses)}</td>
                  <td className="small mono">{formatDuration(row.workedSeconds)}</td>
                  <td className="small mono">{row.revenuePerHour !== null ? formatCents(row.revenuePerHour) : '–'}</td>
                  <td className="small mono">{row.revenuePerKm !== null ? formatCents(row.revenuePerKm) : '–'}</td>
                  <td className="small mono">{row.costPerKm !== null ? formatCents(row.costPerKm) : '–'}</td>
                  <td className="small mono">{row.proUsers}</td>
                  <td className="small mono">{row.conversionRate !== null ? formatPercent(row.conversionRate, 1) : '–'}</td>
                  <td className="small mono">{row.retentionRate !== null ? formatPercent(row.retentionRate, 1) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function Input({
  name,
  label,
  value,
  placeholder,
  type = 'text',
}: {
  name: string;
  label: string;
  value?: string;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={name} className="stat-label">{label}</label>
      <input
        id={name}
        name={name}
        className="input"
        type={type}
        defaultValue={value ?? ''}
        placeholder={placeholder}
      />
    </div>
  );
}
