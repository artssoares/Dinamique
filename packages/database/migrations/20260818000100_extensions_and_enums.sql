-- ============================================================================
-- Dinamique – extensions, enums and shared helpers
--
-- Conventions used across every migration:
--   * money is stored as BIGINT cents; there is no NUMERIC currency anywhere
--   * distance is INTEGER metres, volume is INTEGER millilitres, duration is
--     INTEGER seconds – integers only, so no float drift reaches a driver
--   * every user-owned table carries user_id and is protected by RLS
--   * timestamps are TIMESTAMPTZ; calendar days are DATE (a driver's "day" is
--     local, not a UTC window)
-- ============================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------- enums ----
create type work_mode as enum ('rideshare', 'delivery', 'taxi', 'private');
create type vehicle_type as enum ('car', 'motorcycle', 'bicycle', 'electric');
create type vehicle_ownership as enum ('owned', 'financed', 'rented');
create type fuel_type as enum ('gasoline', 'ethanol', 'diesel', 'cng', 'electric');
create type journey_status as enum ('active', 'paused', 'completed', 'discarded');
create type goal_basis as enum ('gross', 'net');
create type goal_period as enum ('daily', 'weekly', 'monthly', 'yearly');
create type recurring_period as enum ('weekly', 'monthly', 'yearly');
create type free_flow_status as enum ('to_check', 'pending', 'paid');
create type fine_status as enum ('pending', 'paid', 'appealed');
create type plan_code as enum ('free', 'pro');
create type plan_source as enum ('subscription', 'trial', 'courtesy', 'partnership', 'promotion');
create type support_ticket_status as enum (
  'new', 'awaiting_agent', 'in_progress', 'awaiting_user', 'resolved', 'closed'
);
create type support_priority as enum ('normal', 'high', 'urgent');
create type support_author_kind as enum ('user', 'agent', 'system');
create type influencer_status as enum (
  'submitted', 'under_review', 'approved', 'rejected', 'suspended'
);
create type code_kind as enum ('referral', 'influencer', 'campaign', 'partnership', 'promotion');
create type code_status as enum ('active', 'inactive', 'expired', 'exhausted');
create type benefit_status as enum ('granted', 'used', 'expired', 'revoked');
create type referral_status as enum ('signed_up', 'onboarded', 'converted', 'invalid');
create type notification_category as enum (
  'support', 'goals', 'maintenance', 'free_flow', 'fines', 'subscription',
  'system', 'news', 'insights', 'summaries', 'promotions'
);
create type admin_role as enum ('superadmin', 'admin', 'support', 'content', 'analyst');
create type theme_preference as enum ('light', 'dark', 'system');

-- -------------------------------------------------------------- helpers ----

-- Keeps updated_at honest without every writer having to remember it.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
