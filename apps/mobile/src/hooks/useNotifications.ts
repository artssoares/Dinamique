import { useCallback, useEffect, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useSession } from './useSession';

export interface NotificationCounts {
  unreadTotal: number;
  unreadSupport: number;
}

/**
 * One realtime channel per user, shared by every caller of the hook.
 *
 * Supabase keys channels by topic. Two components asking for
 * `notifications:<user>` get the same channel object back, and calling `.on()`
 * on a channel that has already subscribed throws — which blanked the whole
 * app, because the header, the tab bar and the "Mais" screen all read the
 * unread count. Refcounting one channel here fixes that and opens one socket
 * topic instead of three.
 */
const listeners = new Set<() => void>();
let channel: RealtimeChannel | null = null;
let channelUserId: string | null = null;

function attach(userId: string, onChange: () => void): () => void {
  listeners.add(onChange);

  if (channel && channelUserId !== userId) {
    void supabase.removeChannel(channel);
    channel = null;
    channelUserId = null;
  }

  if (!channel) {
    channelUserId = userId;
    channel = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${userId}`,
        },
        () => {
          for (const listener of listeners) listener();
        },
      )
      .subscribe();
  }

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && channel) {
      void supabase.removeChannel(channel);
      channel = null;
      channelUserId = null;
    }
  };
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
    const userId = session?.user?.id;
    if (!userId) return;
    return attach(userId, () => {
      void refresh();
    });
  }, [refresh, session?.user?.id]);

  return { ...counts, refresh };
}
