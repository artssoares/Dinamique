import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { AnalyticsEvent } from '@dinamique/types';
import { supabase } from './supabase.js';

/**
 * Product analytics (§110). Fire-and-forget on purpose: a failed event must
 * never surface to a driver or block what they were doing.
 */
export async function track(
  event: AnalyticsEvent,
  properties: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from('analytics_events').insert({
      user_id: data.user?.id ?? null,
      event,
      properties,
      app_version: Constants.expoConfig?.version ?? null,
      platform: Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    });
  } catch {
    // Swallowed deliberately — analytics is never worth an error state.
  }
}
