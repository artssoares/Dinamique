import { formatCents, formatDuration } from '@dinamique/utils';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const ANALYST_ROLES = ['superadmin', 'admin', 'analyst'] as const;

/**
 * Analytics de aquisição, plataformas, veículos e suporte (§90–92, §96, §97).
 *
 * Tudo vem das views analíticas, que já excluem contas de demonstração — uma
 * consulta de relatório nunca toca as tabelas operacionais direto (§106).
 */
export default async function Analytics() {
  await requireAdmin([...ANALYST_ROLES]);
  const supabase = await getSessionClient();

  const [acquisition, influencers, platforms, vehicles, support, categories] = await Promise.all([
    supabase.from('analytics_acquisition').select('*').order('signups', { ascending: false }).limit(30),
    supabase.from('analytics_influencers').select('*').order('signups', { ascending: false }).limit(30),
    supabase.from('analytics_platforms').select('*').order('gross_revenue', { ascending: false }),
    supabase.from('analytics_vehicles').select('*').order('users', { ascending: false }).limit(20),
    supabase.from('analytics_support').select('*').maybeSingle(),
    supabase.from('analytics_support_categories').select('*').order('tickets', { ascending: false }),
  ]);

  const rows = <T,>(result: { data: unknown }) => ((result.data as T[] | null) ?? []);
  const supportRow = support.data as Record<string, any> | null;

  return (
    <>
      <h1 className="page-title">Analytics</h1>
      <p className="page-subtitle">
        Aquisição, plataformas, veículos e suporte. Contas de demonstração ficam de fora.
      </p>

      <Section title="Aquisição por origem" hint="Conversão é o que separa volume de qualidade.">
        <Table
          headers={['Origem', 'Campanha', 'Código', 'Cadastros', 'Pro', 'Conversão', 'Ativos 30d', 'Retenção']}
          rows={rows<Record<string, any>>(acquisition).map((row) => [
            row.source,
            row.campaign ?? '—',
            row.code ?? '—',
            row.signups,
            row.pro_users,
            row.conversion_rate !== null ? `${row.conversion_rate}%` : '—',
            row.active_30d,
            row.retention_30d !== null ? `${row.retention_30d}%` : '—',
          ])}
          empty="Nenhum cadastro atribuído ainda."
        />
      </Section>

      <Section title="Influencers">
        <Table
          headers={['Influencer', 'Código', 'Status', 'Cadastros', 'Pro', 'Conversão', 'Ativos 30d']}
          rows={rows<Record<string, any>>(influencers).map((row) => [
            row.display_name,
            row.code ?? '—',
            row.status,
            row.signups,
            row.pro_users,
            row.conversion_rate !== null ? `${row.conversion_rate}%` : '—',
            row.active_30d,
          ])}
          empty="Nenhum influencer aprovado ainda."
        />
      </Section>

      <Section title="Plataformas">
        <Table
          headers={['Plataforma', 'Usuários', 'Faturamento', 'Corridas/entregas', 'Ticket médio']}
          rows={rows<Record<string, any>>(platforms).map((row) => [
            row.platform,
            row.users,
            formatCents(row.gross_revenue ?? 0),
            row.trips ?? '—',
            row.average_ticket !== null ? formatCents(row.average_ticket) : '—',
          ])}
          empty="Nenhuma receita registrada por plataforma."
        />
      </Section>

      <Section title="Veículos">
        <Table
          headers={['Veículo', 'Tipo', 'Combustível', 'Situação', 'Usuários', 'Ano médio', 'R$/km', 'Custo/km']}
          rows={rows<Record<string, any>>(vehicles).map((row) => [
            row.vehicle_label,
            row.vehicle_type,
            row.fuel_type ?? '—',
            row.ownership,
            row.users,
            row.average_year ?? '—',
            row.average_revenue_per_km !== null ? formatCents(row.average_revenue_per_km) : '—',
            row.average_cost_per_km !== null ? formatCents(row.average_cost_per_km) : '—',
          ])}
          empty="Nenhum veículo cadastrado."
        />
      </Section>

      <Section
        title="Suporte"
        hint="Tickets sem resposta ficam de fora das médias, em vez de entrarem como zero."
      >
        <div className="stat-grid" style={{ marginBottom: 12 }}>
          <Stat label="Tickets" value={supportRow?.total_tickets ?? 0} />
          <Stat label="Em aberto" value={supportRow?.open_tickets ?? 0} />
          <Stat label="Sem resposta" value={supportRow?.unanswered ?? 0} />
          <Stat
            label="Até a 1ª resposta"
            value={
              supportRow?.avg_first_response_seconds
                ? formatDuration(Number(supportRow.avg_first_response_seconds))
                : '—'
            }
          />
          <Stat
            label="Até resolver"
            value={
              supportRow?.avg_resolution_seconds
                ? formatDuration(Number(supportRow.avg_resolution_seconds))
                : '—'
            }
          />
        </div>

        <Table
          headers={['Categoria', 'Tickets', 'Resolvidos']}
          rows={rows<Record<string, any>>(categories).map((row) => [
            row.category,
            row.tickets,
            row.resolved,
          ])}
          empty="Nenhum ticket ainda."
        />
      </Section>
    </>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: 32 }}>
      <h2 style={{ fontSize: 17, margin: '0 0 4px' }}>{title}</h2>
      {hint ? <p className="small muted" style={{ margin: '0 0 12px' }}>{hint}</p> : null}
      {children}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card">
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
    </div>
  );
}

function Table({
  headers,
  rows,
  empty,
}: {
  headers: string[];
  rows: (string | number | null)[][];
  empty: string;
}) {
  if (rows.length === 0) {
    return <div className="card"><div className="empty">{empty}</div></div>;
  }

  return (
    <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className={typeof cell === 'number' ? 'small mono' : 'small'}>
                  {cell ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
