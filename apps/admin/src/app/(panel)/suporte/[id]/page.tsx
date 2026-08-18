import { notFound } from 'next/navigation';
import { PRIORITY_LABELS, STATUS_LABELS } from '@dinamique/business-logic';
import {
  SUPPORT_PRIORITIES,
  SUPPORT_TICKET_STATUSES,
  type SupportPriority,
  type SupportTicketStatus,
} from '@dinamique/types';
import { requireAdmin, SUPPORT_ROLES } from '@/lib/auth';
import { getSessionClient } from '@/lib/supabase-server';
import { assignTicket, replyToTicket, updateTicket } from '../actions';

export const dynamic = 'force-dynamic';

interface MessageRow {
  id: string;
  author_kind: 'user' | 'agent' | 'system';
  body: string;
  is_internal_note: boolean;
  created_at: string;
  profiles: { first_name: string } | null;
}

/** One conversation, with everything the agent needs to act (§74). */
export default async function TicketDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin(SUPPORT_ROLES);
  const { id } = await params;
  const supabase = await getSessionClient();

  const [ticketResult, messagesResult, categoriesResult] = await Promise.all([
    supabase
      .from('support_tickets')
      .select(
        'id, reference, subject, status, priority, created_at, app_version, category_id, ' +
          'profiles!support_tickets_user_id_fkey(id, first_name, email, city, state, created_at), ' +
          'support_categories(name)',
      )
      .eq('id', id)
      .maybeSingle(),
    supabase
      .from('support_messages')
      .select('id, author_kind, body, is_internal_note, created_at, profiles(first_name)')
      .eq('ticket_id', id)
      .order('created_at'),
    supabase.from('support_categories').select('id, name').eq('is_active', true).order('sort_order'),
  ]);

  const ticket = ticketResult.data as Record<string, any> | null;
  if (!ticket) notFound();

  const messages = (messagesResult.data as unknown as MessageRow[] | null) ?? [];
  const categories = (categoriesResult.data as { id: string; name: string }[] | null) ?? [];
  const user = ticket.profiles as Record<string, any> | null;

  const { data: plan } = await supabase
    .from('current_plans')
    .select('plan, is_trial')
    .eq('user_id', user?.id)
    .maybeSingle();

  return (
    <>
      <h1 className="page-title">{ticket.subject}</h1>
      <p className="page-subtitle mono">{ticket.reference}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) minmax(260px, 1fr)', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {messages.map((message) => (
              <div
                key={message.id}
                style={{
                  padding: 14,
                  borderRadius: 'var(--radius-md)',
                  background: message.is_internal_note
                    ? 'var(--warning-subtle)'
                    : message.author_kind === 'user'
                      ? 'var(--bg-secondary)'
                      : 'var(--blue-50)',
                  // An internal note is visually unmistakable, so nobody pastes
                  // one into a reply by accident.
                  border: message.is_internal_note ? '1px dashed var(--warning-text)' : 'none',
                }}
              >
                <div className="small muted" style={{ marginBottom: 6, fontWeight: 600 }}>
                  {message.is_internal_note
                    ? '🔒 NOTA INTERNA — o usuário não vê isto'
                    : message.author_kind === 'user'
                      ? (user?.first_name ?? 'Usuário')
                      : `Dinamique · ${message.profiles?.first_name ?? 'equipe'}`}
                  {' · '}
                  {new Date(message.created_at).toLocaleString('pt-BR')}
                </div>
                <div style={{ whiteSpace: 'pre-wrap' }}>{message.body}</div>
              </div>
            ))}
          </div>

          <form action={replyToTicket} className="card" style={{ display: 'grid', gap: 12 }}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <label htmlFor="body" className="stat-label">
              Responder
            </label>
            <textarea
              id="body"
              name="body"
              className="textarea"
              placeholder="Escreva sua resposta ao usuário."
              required
            />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }} className="small">
              <input type="checkbox" name="internal" />
              Salvar como nota interna (não notifica e não aparece para o usuário)
            </label>
            <button type="submit" className="button" style={{ justifySelf: 'start' }}>
              Enviar
            </button>
          </form>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="stat-label">USUÁRIO</div>
            <div style={{ fontWeight: 600 }}>{user?.first_name}</div>
            <div className="small muted">{user?.email}</div>
            <div className="small muted">
              {[user?.city, user?.state].filter(Boolean).join(' · ') || '—'}
            </div>
            <div style={{ marginTop: 10 }}>
              <span className={`badge ${plan?.plan === 'pro' ? 'badge-brand' : 'badge-neutral'}`}>
                {plan?.plan === 'pro' ? (plan.is_trial ? 'PRO — TRIAL' : 'PRO') : 'FREE'}
              </span>
            </div>
            {ticket.app_version ? (
              <div className="small muted" style={{ marginTop: 8 }}>
                App {ticket.app_version}
              </div>
            ) : null}
          </div>

          <form action={assignTicket} className="card" style={{ display: 'grid', gap: 10 }}>
            <input type="hidden" name="ticketId" value={ticket.id} />
            <div className="stat-label">RESPONSÁVEL</div>
            <button type="submit" className="button button-ghost">
              Assumir este atendimento
            </button>
          </form>

          <form action={updateTicket} className="card" style={{ display: 'grid', gap: 10 }}>
            <input type="hidden" name="ticketId" value={ticket.id} />

            <label htmlFor="status" className="stat-label">
              STATUS
            </label>
            <select id="status" name="status" className="select" defaultValue={ticket.status}>
              {SUPPORT_TICKET_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {STATUS_LABELS[status as SupportTicketStatus]}
                </option>
              ))}
            </select>

            <label htmlFor="priority" className="stat-label">
              PRIORIDADE
            </label>
            <select id="priority" name="priority" className="select" defaultValue={ticket.priority}>
              {SUPPORT_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {PRIORITY_LABELS[priority as SupportPriority]}
                </option>
              ))}
            </select>

            <label htmlFor="categoryId" className="stat-label">
              CATEGORIA
            </label>
            <select
              id="categoryId"
              name="categoryId"
              className="select"
              defaultValue={ticket.category_id ?? ''}
            >
              <option value="">—</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>

            <button type="submit" className="button">
              Salvar alterações
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
