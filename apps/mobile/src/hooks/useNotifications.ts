import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useSession } from './useSession';

export interface NotificationCounts {
  unreadTotal: number;
  unreadSupport: number;
}

/**
 * Unread counts for the bell and the Support tab badge (§71).
 *
 * Realtime is used where it is stable, with a refresh on demand as the
 * fallback — the counter must be reliable more than it must be instant (§75).
 */
export function useNotificationCounts(): NotificationCounts & { refresh: () => Promise<void> } {
  const { session } = useSession();
  const [counts, setCounts] = useState<NotificationCounts>({ unreadTotal: 0, unreadSupport: 0 });

  const refresh = useCallback(async () => {
    if (!session?.user) {
      setCounts({ unreadTotal: 0, unreadSupport: 0 });
      return;
    }
    const { data } = await supabase
      .from('notification_counts')
      .select('unread_total, unread_support')
      .eq('user_id', session.user.id)
      .maybeSingle();

    setCounts({
      unreadTotal: data?.unread_total ?? 0,
      unreadSupport: data?.unread_support ?? 0,
    });
  }, [session?.user?.id]);

  useEffect(() => {
    void refresh();
    if (!session?.user) return;

    const channel = supabase
      .channel(`notifications:${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${session.user.id}`,
        },
        () => {
          void refresh();
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, session?.user?.id]);

  return { ...counts, refresh };
}
