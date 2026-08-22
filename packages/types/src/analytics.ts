/**
 * Product analytics event names. Keep this list closed – an event that is not
 * here cannot be emitted, which is what keeps the warehouse queryable.
 */
export const ANALYTICS_EVENTS = [
  'signup_completed',
  'onboarding_completed',
  'profile_photo_added',
  'vehicle_added',
  'journey_started',
  'journey_paused',
  'journey_completed',
  'route_capture_enabled',
  'route_capture_denied',
  'route_replay_viewed',
  'route_story_shared',
  'revenue_added',
  'expense_added',
  'product_created',
  'product_sale_added',
  'fuel_added',
  'goal_created',
  'goal_reached',
  'insight_viewed',
  'notification_opened',
  'export_created',
  'trial_started',
  'trial_expired',
  'subscription_started',
  'subscription_cancelled',
  'support_ticket_created',
  'support_message_sent',
  'support_ticket_resolved',
  'referral_shared',
  'referral_signup_completed',
  'referral_discount_created',
  'referral_discount_used',
  'promotion_code_used',
  'influencer_application_submitted',
  'influencer_approved',
] as const;

export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

export interface AnalyticsEventRecord {
  id: string;
  userId: string | null;
  event: AnalyticsEvent;
  properties: Record<string, unknown>;
  appVersion: string | null;
  platform: 'ios' | 'android' | 'web' | 'admin' | null;
  createdAt: string;
}
