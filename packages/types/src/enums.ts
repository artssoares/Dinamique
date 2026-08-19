/**
 * Domain enums. Every value here has a matching Postgres enum or a
 * `check` constraint in packages/database/migrations – keep them in sync.
 */

export const WORK_MODES = ['rideshare', 'delivery', 'taxi', 'private'] as const;
export type WorkMode = (typeof WORK_MODES)[number];

export const VEHICLE_TYPES = ['car', 'motorcycle', 'bicycle', 'electric'] as const;
export type VehicleType = (typeof VEHICLE_TYPES)[number];

export const VEHICLE_OWNERSHIPS = ['owned', 'financed', 'rented'] as const;
export type VehicleOwnership = (typeof VEHICLE_OWNERSHIPS)[number];

export const FUEL_TYPES = ['gasoline', 'ethanol', 'diesel', 'cng', 'electric'] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const JOURNEY_STATUSES = ['active', 'paused', 'completed', 'discarded'] as const;
export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

/** What a goal measures. Never conflate the two – see PRODUCT_RULES.md §36. */
export const GOAL_BASIS = ['gross', 'net'] as const;
export type GoalBasis = (typeof GOAL_BASIS)[number];

export const GOAL_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'] as const;
export type GoalPeriod = (typeof GOAL_PERIODS)[number];

export const RECURRING_COST_PERIODS = ['weekly', 'monthly', 'yearly'] as const;
export type RecurringCostPeriod = (typeof RECURRING_COST_PERIODS)[number];

export const FREE_FLOW_STATUSES = ['to_check', 'pending', 'paid'] as const;
export type FreeFlowStatus = (typeof FREE_FLOW_STATUSES)[number];

export const FINE_STATUSES = ['pending', 'paid', 'appealed'] as const;
export type FineStatus = (typeof FINE_STATUSES)[number];

export const PLAN_CODES = ['free', 'pro'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

/** Why a user currently holds their plan. Drives billing + admin reporting. */
export const PLAN_SOURCES = [
  'subscription',
  'trial',
  'courtesy',
  'partnership',
  'promotion',
] as const;
export type PlanSource = (typeof PLAN_SOURCES)[number];

export const SUPPORT_TICKET_STATUSES = [
  'new',
  'awaiting_agent',
  'in_progress',
  'awaiting_user',
  'resolved',
  'closed',
] as const;
export type SupportTicketStatus = (typeof SUPPORT_TICKET_STATUSES)[number];

export const SUPPORT_PRIORITIES = ['normal', 'high', 'urgent'] as const;
export type SupportPriority = (typeof SUPPORT_PRIORITIES)[number];

export const SUPPORT_AUTHOR_KINDS = ['user', 'agent', 'system'] as const;
export type SupportAuthorKind = (typeof SUPPORT_AUTHOR_KINDS)[number];

export const INFLUENCER_STATUSES = [
  'submitted',
  'under_review',
  'approved',
  'rejected',
  'suspended',
] as const;
export type InfluencerStatus = (typeof INFLUENCER_STATUSES)[number];

/** One code table serves referral / influencer / campaign / partnership / promo. */
export const CODE_KINDS = [
  'referral',
  'influencer',
  'campaign',
  'partnership',
  'promotion',
] as const;
export type CodeKind = (typeof CODE_KINDS)[number];

export const CODE_STATUSES = ['active', 'inactive', 'expired', 'exhausted'] as const;
export type CodeStatus = (typeof CODE_STATUSES)[number];

export const BENEFIT_STATUSES = ['granted', 'used', 'expired', 'revoked'] as const;
export type BenefitStatus = (typeof BENEFIT_STATUSES)[number];

export const REFERRAL_STATUSES = ['signed_up', 'onboarded', 'converted', 'invalid'] as const;
export type ReferralStatus = (typeof REFERRAL_STATUSES)[number];

export const NOTIFICATION_CATEGORIES = [
  'support',
  'goals',
  'maintenance',
  'free_flow',
  'fines',
  'subscription',
  'system',
  'news',
  'insights',
  'summaries',
  'promotions',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'both'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const ADMIN_ROLES = ['superadmin', 'admin', 'support', 'content', 'analyst'] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const THEME_PREFERENCES = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
