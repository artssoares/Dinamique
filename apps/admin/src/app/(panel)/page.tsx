import { formatCents } from '@dinamique/utils';
import { isAwaitingTeam, isOpen } from '@dinamique/business-logic';
import { requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

/**
 * Operational dashboard (§86). Only counts that are actually derivable from
 * the current schema are shown — a KPI tile with no real query behind it would
 * be a lie dressed as a metric (§131).
 */
export default async function Dashboard() {
  await requireAdmin();
  const supabase = await getSessionClient();

  const since = (days: number) =>
    new Date(Date.now() - days * 86_400_000).toISOString();

  const [profiles, tickets, plans, referrals, benefits] = await Promise.all([
    supabase.from('profiles').select('id, created_at, last_seen_at'),
    supabase.from('support_tickets').select('status'),
    supabase.from('current_plans').select('plan, is_trial'),
    supabase.from('referrals').select('id, status'),
    supabase.from('discount_benefits').select('amount, status'),
  ]);

  const users = (profiles.data as { created_at: string; last_seen_at: string | null }[] | null) ?? [];
  const ticketRows = (tickets.data as { status: string }[] | null) ?? [];
  const planRows = (plans.data as { plan: string; is_trial: boolean }[] | null) ?? [];
  const referralRows = (referrals.data as { status: string }[] | null) ?? [];
  const benefitRows = (benefits.data as { amount: number; status: string }[] | null) ?? [];

  const activeSince = (days: number) =>
    users.filter((u) => u.last_seen_at !== null && u.last_seen_at >= since(days)).length;

  const proUsers = planRows.filter((p) => p.plan === 'pro' && !p.is_trial).length;
  const trialUsers = planRows.filter((p) => p.is_trial).length;

  const stats = [
    { label: 'Usuários totais', value: users.length },
    { label: 'Novos (7 dias)', value: users.filter((u) => u.created_at >= since(7)).length },
    { label: 'Ativos hoje (DAU)', value: activeSince(1) },
    { label: 'Ativos 7 dias (WAU)', value: activeSince(7) },
    { label: 'Ativos 30 dias (MAU)', value: activeSince(30) },
    { label: 'Inativos 30+ dias', value: users.length - activeSince(30) },
    { label: 'Assinantes Pro', value: proUsers },
    { label: 'Em trial', value: trialUsers },
    { label: 'Tickets em aberto', value: ticketRows.filter((t) => isOpen(t.status as never)).length },
    { label: 'Aguardando resposta', value: ticketRows.filter((t) => isAwaitingTeam(t.status as never)).length },
    { label: 'Indicações', value: referralRows.length },
    {
      label: 'Descontos concedidos',
      value: formatCents(benefitRows.reduce((acc, b) => acc + b.amount, 0)),
    },
    {
      label: 'Descontos utilizados',
      value: formatCents(
        benefitRows.filter((b) => b.status === 'used').reduce((acc, b) => acc + b.amount, 0),
      ),
    },
  ];

  return (
    <>
      <h1 className="page-title">Dashboard</h1>
      <p className="page-subtitle">Visão geral da operação.</p>

      <div className="stat-grid">
        {stats.map((stat) => (
          <div key={stat.label} className="card">
            <div className="stat-label">{stat.label}</div>
            <div className="stat-value mono">{stat.value}</div>
          </div>
        ))}
      </div>
    </>
  );
}
