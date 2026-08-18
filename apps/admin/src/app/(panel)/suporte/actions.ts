'use server';

import { revalidatePath } from 'next/cache';
import type { SupportPriority, SupportTicketStatus } from '@dinamique/types';
import { nextTicketStatus } from '@dinamique/business-logic';
import { requireAdmin, SUPPORT_ROLES } from '@/lib/auth';
import { logAdminAction } from '@/lib/audit';
import { getServiceClient } from '@/lib/supabase-server';

/**
 * Support Server Actions.
 *
 * Each one re-checks the caller's role before touching anything — a Server
 * Action is a public endpoint, and hiding a button is not authorisation (§118).
 */

export async function replyToTicket(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);

  const ticketId = String(formData.get('ticketId') ?? '');
  const body = String(formData.get('body') ?? '').trim();
  const isInternalNote = formData.get('internal') === 'on';
  if (!ticketId || body === '') return;

  const supabase = getServiceClient();

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('status, user_id')
    .eq('id', ticketId)
    .maybeSingle();
  if (!ticket) return;

  await supabase.from('support_messages').insert({
    ticket_id: ticketId,
    author_kind: 'agent',
    author_id: admin.userId,
    body,
    is_internal_note: isInternalNote,
  });

  // An internal note is a team memo: it must not move the ticket's state and
  // must never notify the user (§74).
  if (!isInternalNote) {
    await supabase
      .from('support_tickets')
      .update({
        status: nextTicketStatus(ticket.status as SupportTicketStatus, { type: 'agent_replied' }),
        assigned_admin_id: admin.userId,
      })
      .eq('id', ticketId);

    await supabase.from('user_notifications').insert({
      user_id: ticket.user_id,
      category: 'support',
      title: 'Suporte Dinamique',
      body: 'Você recebeu uma nova resposta.',
      deep_link: `/support/${ticketId}`,
    });
  }

  await logAdminAction({
    adminUserId: admin.userId,
    action: isInternalNote ? 'support.internal_note' : 'support.reply',
    targetTable: 'support_tickets',
    targetId: ticketId,
  });

  revalidatePath(`/suporte/${ticketId}`);
  revalidatePath('/suporte');
}

export async function assignTicket(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);
  const ticketId = String(formData.get('ticketId') ?? '');
  const assignee = String(formData.get('assignee') ?? '') || admin.userId;
  if (!ticketId) return;

  const supabase = getServiceClient();
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('status')
    .eq('id', ticketId)
    .maybeSingle();

  await supabase
    .from('support_tickets')
    .update({
      assigned_admin_id: assignee,
      status: ticket
        ? nextTicketStatus(ticket.status as SupportTicketStatus, { type: 'assigned' })
        : undefined,
    })
    .eq('id', ticketId);

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'support.assign',
    targetTable: 'support_tickets',
    targetId: ticketId,
    metadata: { assignee },
  });

  revalidatePath(`/suporte/${ticketId}`);
  revalidatePath('/suporte');
}

export async function updateTicket(formData: FormData) {
  const admin = await requireAdmin(SUPPORT_ROLES);
  const ticketId = String(formData.get('ticketId') ?? '');
  if (!ticketId) return;

  const status = formData.get('status') as SupportTicketStatus | null;
  const priority = formData.get('priority') as SupportPriority | null;
  const categoryId = formData.get('categoryId') as string | null;

  const patch: Record<string, unknown> = {};
  if (status) {
    patch.status = status;
    // Resolution timestamps power the SLA reports (§92) and must be set here,
    // not inferred later from message history.
    if (status === 'resolved') patch.resolved_at = new Date().toISOString();
    if (status === 'closed') patch.closed_at = new Date().toISOString();
  }
  if (priority) patch.priority = priority;
  if (categoryId) patch.category_id = categoryId;
  if (Object.keys(patch).length === 0) return;

  const supabase = getServiceClient();
  await supabase.from('support_tickets').update(patch).eq('id', ticketId);

  await logAdminAction({
    adminUserId: admin.userId,
    action: 'support.update',
    targetTable: 'support_tickets',
    targetId: ticketId,
    metadata: patch,
  });

  revalidatePath(`/suporte/${ticketId}`);
  revalidatePath('/suporte');
}
