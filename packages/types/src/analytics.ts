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
  'journey_film_viewed',
  'journey_film_shared',
  'journey_film_failed',
  'revenue_added',
  'expense_added',
  // Correções em dias anteriores, separadas dos lançamentos normais: "quantas
  // pessoas voltam para consertar um dia" é outra pergunta.
  'revenue_edited',
  'expense_edited',
  'journey_added',
  'journey_edited',
  'entry_deleted',
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
  // Botão de emergência. O disparo e o cancelamento são contados porque a
  // proporção entre os dois é a única medida de alarme falso que existe, e
  // porque uma função de segurança que ninguém usa é uma função que não está
  // onde deveria estar. Nenhum deles carrega coordenada.
  'sos_consent_granted',
  'sos_consent_revoked',
  'sos_network_joined',
  'sos_network_left',
  'sos_alert_triggered',
  'sos_alert_aborted',
  'sos_alert_ended',
  'sos_alert_received',
  'sos_emergency_call',
  'account_deleted',
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
