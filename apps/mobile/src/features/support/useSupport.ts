import { useCallback, useEffect, useState } from 'react';
import type { SupportPriority, SupportTicketStatus } from '@dinamique/types';
import { supabase } from '@/lib/supabase';
import { track } from '@/lib/analytics';
import { useSession } from '@/hooks/useSession';

export interface SupportCategoryOption {
  id: string;
  name: string;
}

export interface TicketSummary {
  id: string;
  reference: string;
  subject: string;
  status: SupportTicketStatus;
  priority: SupportPriority;
  categoryName: string | null;
  lastMessageAt: string;
  hasUnread: boolean;
}

export interface TicketMessage {
  id: string;
  authorKind: 'user' | 'agent' | 'system';
  body: string;
  createdAt: string;
}

export function useSupportCategories(): SupportCategoryOption[] {
  const [categories, setCategories] = useState<SupportCategoryOption[]>([]);

  useEffect(() => {
    void supabase
      .from('support_categories')
      .select('id, name')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data }) => setCategories((data as SupportCategoryOption[] | null) ?? []));
  }, []);

  return categories;
}

export function useTickets(): { tickets: TicketSummary[]; loading: boolean; refresh: () => Promise<void> } {
  const { session } = useSession();
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setTickets([]);
      setLoading(false);
      return;
    }

    const { data } = await supabase
      .from('support_tickets')
      .select(
        'id, reference, subject, status, priority, last_message_at, support_categories(name), support_messages(read_by_user_at, author_kind)',
      )
      .eq('user_id', session.user.id)
      .order('last_message_at', { ascending: false });

    setTickets(
      ((data as Record<string, any>[] | null) ?? []).map((row) => ({
        id: String(row.id),
        reference: String(row.reference),
        subject: String(row.subject),
        status: row.status as SupportTicketStatus,
        priority: row.priority as SupportPriority,
        categoryName: row.support_categories?.name ?? null,
        lastMessageAt: String(row.last_message_at),
        // An unread ticket is one with a team message the user has not opened.
        hasUnread: (row.support_messages ?? []).some(
          (m: { read_by_user_at: string | null; author_kind: string }) =>
            m.author_kind !== 'user' && m.read_by_user_at === null,
        ),
      })),
    );
    setLoading(false);
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tickets, loading, refresh };
}

export function useTicketConversation(ticketId: string) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('support_messages')
      .select('id, author_kind, body, created_at')
      .eq('ticket_id', ticketId)
      .order('created_at');

    setMessages(
      ((data as Record<string, any>[] | null) ?? []).map((row) => ({
        id: String(row.id),
        authorKind: row.author_kind as TicketMessage['authorKind'],
        body: String(row.body),
        createdAt: String(row.created_at),
      })),
    );
    setLoading(false);
  }, [ticketId]);

  useEffect(() => {
    void refresh();

    // Opening the conversation clears its notifications (§71).
    void supabase.rpc('mark_ticket_read', { p_ticket_id: ticketId });

    const channel = supabase
      .channel(`ticket:${ticketId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticketId}` },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, ticketId]);

  const sendMessage = useCallback(
    async (body: string, authorId: string) => {
      const trimmed = body.trim();
      if (trimmed === '') return;

      await supabase.from('support_messages').insert({
        ticket_id: ticketId,
        author_kind: 'user',
        author_id: authorId,
        body: trimmed,
      });

      // The user replying pulls the ticket back into the team's queue.
      await supabase.from('support_tickets').update({ status: 'in_progress' }).eq('id', ticketId);

      void track('support_message_sent', { ticket_id: ticketId });
      await refresh();
    },
    [refresh, ticketId],
  );

  return { messages, loading, sendMessage, refresh };
}

export async function createTicket(input: {
  userId: string;
  categoryId: string | null;
  subject: string;
  message: string;
  appVersion: string | null;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: input.userId,
      category_id: input.categoryId,
      subject: input.subject.trim(),
      app_version: input.appVersion,
    })
    .select('id')
    .single();

  if (error || !data) return null;

  await supabase.from('support_messages').insert({
    ticket_id: data.id,
    author_kind: 'user',
    author_id: input.userId,
    body: input.message.trim(),
  });

  void track('support_ticket_created', { category_id: input.categoryId });
  return String(data.id);
}
