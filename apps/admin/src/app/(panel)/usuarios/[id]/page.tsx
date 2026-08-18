import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ADMIN_ROLES, PLAN_SOURCES } from '@dinamique/types';
import { formatCents } from '@dinamique/utils';
import { PRIVILEGED_ROLES, requireAdmin } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { grantPlan, revokePlan, setAdminRole, toggleBlock } from '../actions';

export const dynamic = 'force-dynamic';

/** Ficha do usuário com as ações administrativas (§85, §82). */
export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin(PRIVILEGED_ROLES);
  const { id } = await params;
  const supabase = await getSessionClient();

  const [profileResult, planResult, grantsResult, adminResult, totalsResult, ticketsResult] =
    await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, email, phone, city, state, work_modes, blocked_at, created_at, last_seen_at, is_demo')
        .eq('id', id)
        .maybeSingle(),
      supabase.from('current_plans').select('plan, source, expires_at, is_trial').eq('user_id', id).maybeSingle(),
      supabase
        .from('subscriptions')
        .select('id, plan, source, started_at, expires_at, cancelled_at, note')
        .eq('user_id', id)
        .order('started_at', { ascending: false }),
      supabase.from('admin_users').select('role, is_active').eq('user_id', id).maybeSingle(),
      supabase.from('daily_totals').select('gross_revenue, net_profit, worked_seconds').eq('user_id', id),
      supabase.from('support_tickets').select('id, subject, status, last_message_at').eq('user_id', id).order('last_message_at', { ascending: false }).limit(5),
    ]);

  const profile = profileResult.data as Record<string, any> | null;
  if (!profile) notFound();

  const plan = planResult.data as Record<string, any> | null;
  const grants = (grantsResult.data as Record<string, any>[] | null) ?? [];
  const adminRow = adminResult.data as { role: string; is_active: boolean } | null;
  const totals = (totalsResult.data as { gross_revenue: number; net_profit: number; worked_seconds: number }[] | null) ?? [];
  const tickets = (ticketsResult.data as Record<string, any>[] | null) ?? [];

  const lifetime = totals.reduce(
    (acc, row) => ({
      gross: acc.gross + row.gross_revenue,
      net: acc.net + row.net_profit,
      seconds: acc.seconds + row.worked_seconds,
    }),
    { gross: 0, net: 0, seconds: 0 },
  );

  const isSelf = profile.id === admin.userId;

  return (
    <>
      <h1 className="page-title">
        {[profile.first_name, profile.last_name].filter(Boolean).join(' ')}
        {profile.is_demo ? <span className="badge badge-warning" style={{ marginLeft: 10 }}>DEMO</span> : null}
      </h1>
      <p className="page-subtitle">{profile.email}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)', gap: 20 }}>
        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="stat-grid">
            <div className="card">
              <div className="stat-label">Faturamento total</div>
              <div className="stat-value mono">{formatCents(lifetime.gross)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Lucro estimado</div>
              <div className="stat-value mono">{formatCents(lifetime.net)}</div>
            </div>
            <div className="card">
              <div className="stat-label">Horas trabalhadas</div>
              <div className="stat-value mono">{Math.round(lifetime.seconds / 3600)}</div>
            </div>
          </div>

          <div className="card">
            <div className="stat-label">DADOS</div>
            <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 16px', margin: 0 }}>
              <dt className="small muted">Cidade</dt>
              <dd className="small" style={{ margin: 0 }}>{[profile.city, profile.state].filter(Boolean).join('/') || '—'}</dd>
              <dt className="small muted">Telefone</dt>
              <dd className="small" style={{ margin: 0 }}>{profile.phone ?? '—'}</dd>
              <dt className="small muted">Modalidades</dt>
              <dd className="small" style={{ margin: 0 }}>{(profile.work_modes ?? []).join(', ') || '—'}</dd>
              <dt className="small muted">Cadastro</dt>
              <dd className="small mono" style={{ margin: 0 }}>{new Date(profile.created_at).toLocaleString('pt-BR')}</dd>
              <dt className="small muted">Último acesso</dt>
              <dd className="small mono" style={{ margin: 0 }}>
                {profile.last_seen_at ? new Date(profile.last_seen_at).toLocaleString('pt-BR') : 'nunca'}
              </dd>
            </dl>
          </div>

          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: 16 }} className="stat-label">HISTÓRICO DE PLANOS</div>
            {grants.length === 0 ? (
              <div className="empty">Nenhuma concessão registrada.</div>
            ) : (
              <table>
                <thead>
                  <tr><th>Origem</th><th>Início</th><th>Validade</th><th>Situação</th><th></th></tr>
                </thead>
                <tbody>
                  {grants.map((grant) => {
                    const active =
                      !grant.cancelled_at &&
                      (!grant.expires_at || new Date(grant.expires_at) > new Date());
                    return (
                      <tr key={grant.id}>
                        <td className="small">{grant.source}</td>
                        <td className="small mono">{new Date(grant.started_at).toLocaleDateString('pt-BR')}</td>
                        <td className="small mono">
                          {grant.expires_at ? new Date(grant.expires_at).toLocaleDateString('pt-BR') : 'sem prazo'}
                        </td>
                        <td>
                          <span className={`badge ${active ? 'badge-success' : 'badge-neutral'}`}>
                            {grant.cancelled_at ? 'cancelado' : active ? 'ativo' : 'expirado'}
                          </span>
                        </td>
                        <td>
                          {active ? (
                            <form action={revokePlan}>
                              <input type="hidden" name="userId" value={profile.id} />
                              <input type="hidden" name="grantId" value={grant.id} />
                              <button type="submit" className="button button-ghost">Cancelar</button>
                            </form>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {tickets.length > 0 ? (
            <div className="card" style={{ padding: 0 }}>
              <div style={{ padding: 16 }} className="stat-label">ATENDIMENTOS</div>
              <table>
                <tbody>
                  {tickets.map((ticket) => (
                    <tr key={ticket.id}>
                      <td><Link href={`/suporte/${ticket.id}`}>{ticket.subject}</Link></td>
                      <td className="small">{ticket.status}</td>
                      <td className="small mono">{new Date(ticket.last_message_at).toLocaleDateString('pt-BR')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
          <div className="card">
            <div className="stat-label">PLANO ATUAL</div>
            <div style={{ fontSize: 20, fontWeight: 700, margin: '4px 0 8px' }}>
              {plan?.plan === 'pro' ? (plan.is_trial ? 'Pro (teste)' : 'Pro') : 'Free'}
            </div>
            {plan?.expires_at ? (
              <div className="small muted">
                Até {new Date(plan.expires_at).toLocaleDateString('pt-BR')}
              </div>
            ) : null}
          </div>

          <form action={grantPlan} className="card" style={{ display: 'grid', gap: 10 }}>
            <input type="hidden" name="userId" value={profile.id} />
            <div className="stat-label">CONCEDER PRO</div>

            <label htmlFor="source" className="stat-label">ORIGEM</label>
            <select id="source" name="source" className="select" defaultValue="courtesy">
              {PLAN_SOURCES.filter((source) => source !== 'subscription').map((source) => (
                <option key={source} value={source}>{source}</option>
              ))}
            </select>

            <label htmlFor="days" className="stat-label">DIAS (VAZIO = SEM PRAZO)</label>
            <input id="days" name="days" className="input" type="number" min="1" placeholder="30" />

            <label htmlFor="note" className="stat-label">OBSERVAÇÃO</label>
            <input id="note" name="note" className="input" placeholder="Motivo da concessão" />

            <button type="submit" className="button">Conceder</button>
          </form>

          <form action={toggleBlock} className="card" style={{ display: 'grid', gap: 10 }}>
            <input type="hidden" name="userId" value={profile.id} />
            <input type="hidden" name="block" value={profile.blocked_at ? 'false' : 'true'} />
            <div className="stat-label">ACESSO</div>
            <div className="small muted">
              {profile.blocked_at
                ? `Bloqueado em ${new Date(profile.blocked_at).toLocaleDateString('pt-BR')}.`
                : 'Conta ativa.'}
            </div>
            <button type="submit" className="button button-ghost" disabled={isSelf}>
              {profile.blocked_at ? 'Desbloquear' : 'Bloquear'}
            </button>
          </form>

          <form action={setAdminRole} className="card" style={{ display: 'grid', gap: 10 }}>
            <input type="hidden" name="userId" value={profile.id} />
            <div className="stat-label">ACESSO ADMINISTRATIVO</div>

            <select
              name="role"
              className="select"
              defaultValue={adminRow?.is_active ? adminRow.role : ''}
              disabled={isSelf}
            >
              <option value="">Sem acesso</option>
              {ADMIN_ROLES.filter(
                // Só um superadmin cria outro superadmin.
                (role) => role !== 'superadmin' || admin.role === 'superadmin',
              ).map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>

            <button type="submit" className="button button-ghost" disabled={isSelf}>
              Salvar função
            </button>
            {isSelf ? (
              <div className="small muted">
                Você não pode alterar o próprio acesso administrativo.
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </>
  );
}
