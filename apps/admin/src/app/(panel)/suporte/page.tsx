import Link from 'next/link';
import { STATUS_LABELS, PRIORITY_LABELS, isAwaitingTeam } from '@dinamique/business-logic';
import type { SupportPriority, SupportTicketStatus } from '@dinamique/types';
import { requireAdmin, SUPPORT_ROLES } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

interface TicketRow {
  id: string;
  reference: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  created_at: string;
  last_message_at: string;
  profiles: { first_name: string; email: string; city: string | null } | null;
  support_categories: { name: string } | null;
  assigned: { first_name: string } | null;
}

const FILTERS = [
  { key: 'unanswered', label: 'Não respondidos' },
  { key: 'new', label: 'Novos' },
  { key: 'in_progress', label: 'Em atendimento' },
  { key: 'awaiting_user', label: 'Aguardando usuário' },
  { key: 'resolved', label: 'Resolvidos' },
  { key: 'closed', label: 'Fechados' },
  { key: 'all', label: 'Todos' },
] as const;

/** The team's inbox (§72, §73). */
export default async function SupportInbox({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; sort?: string }>;
}) {
  await requireAdmin(SUPPORT_ROLES);
  const params = await searchParams;
  const filter = params.filter ?? 'unanswered';
  const sort = params.sort ?? 'recent';

  const supabase = await getSessionClient();

  let query = supabase
    .from('support_tickets')
    .select(
      'id, reference, subject, status, priority, created_at, last_message_at, ' +
        'profiles!support_tickets_user_id_fkey(first_name, email, city), ' +
        'support_categories(name), ' +
        'assigned:profiles!support_tickets_assigned_admin_id_fkey(first_name)',
    );

  if (filter !== 'all' && filter !== 'unanswered') {
    query = query.eq('status', filter);
  }

  query = query.order(
    sort === 'oldest' ? 'created_at' : sort === 'priority' ? 'priority' : 'last_message_at',
    { ascending: sort === 'oldest' },
  );

  const { data } = await query;
  let tickets = (data as unknown as TicketRow[] | null) ?? [];

  // "Não respondidos" spans several statuses, so it is applied after the query
  // using the same predicate the app and the badge counter use.
  if (filter === 'unanswered') {
    tickets = tickets.filter((ticket) => isAwaitingTeam(ticket.status));
  }

  return (
    <>
      <h1 className="page-title">Suporte</h1>
      <p className="page-subtitle">
        {tickets.length} {tickets.length === 1 ? 'atendimento' : 'atendimentos'} nesta visão.
      </p>

      <div className="filters">
        {FILTERS.map((option) => (
          <Link
            key={option.key}
            href={`/suporte?filter=${option.key}&sort=${sort}`}
            className="chip"
            aria-pressed={filter === option.key}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="filters">
        {[
          { key: 'recent', label: 'Última interação' },
          { key: 'oldest', label: 'Mais antigos' },
          { key: 'priority', label: 'Prioridade' },
        ].map((option) => (
          <Link
            key={option.key}
            href={`/suporte?filter=${filter}&sort=${option.key}`}
            className="chip"
            aria-pressed={sort === option.key}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        {tickets.length === 0 ? (
          <div className="empty">Nenhum atendimento nesta visão.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Assunto</th>
                <th>Categoria</th>
                <th>Status</th>
                <th>Prioridade</th>
                <th>Responsável</th>
                <th>Última interação</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr key={ticket.id}>
                  <td>
                    <Link href={`/suporte/${ticket.id}`}>
                      <div style={{ fontWeight: 600 }}>{ticket.profiles?.first_name ?? '—'}</div>
                      <div className="small muted">{ticket.profiles?.email ?? ''}</div>
                    </Link>
                  </td>
                  <td>
                    <Link href={`/suporte/${ticket.id}`}>
                      {ticket.subject}
                      <div className="small muted mono">{ticket.reference}</div>
                    </Link>
                  </td>
                  <td className="small">{ticket.support_categories?.name ?? '—'}</td>
                  <td>
                    <span className={`badge ${statusTone(ticket.status)}`}>
                      {STATUS_LABELS[ticket.status]}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${priorityTone(ticket.priority)}`}>
                      {PRIORITY_LABELS[ticket.priority]}
                    </span>
                  </td>
                  <td className="small">{ticket.assigned?.first_name ?? <span className="muted">—</span>}</td>
                  <td className="small mono">
                    {new Date(ticket.last_message_at).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

function statusTone(status: SupportTicketStatus): string {
  if (status === 'resolved' || status === 'closed') return 'badge-success';
  if (status === 'awaiting_user') return 'badge-accent';
  if (status === 'new') return 'badge-brand';
  return 'badge-neutral';
}

function priorityTone(priority: SupportPriority): string {
  if (priority === 'urgent') return 'badge-danger';
  if (priority === 'high') return 'badge-warning';
  return 'badge-neutral';
}
