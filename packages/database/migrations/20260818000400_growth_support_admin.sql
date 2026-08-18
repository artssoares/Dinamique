-- ============================================================================
-- Monetisation, support, growth (codes/referrals/influencers), notifications
-- and administration.
-- ============================================================================

-- --------------------------------------------------------- monetisation ----
create table plans (
  code        plan_code primary key,
  name        text not null,
  price       bigint not null default 0 check (price >= 0),
  is_active   boolean not null default true
);

-- One table for every way a user can hold Pro: a paid subscription, the
-- 7-day trial, an admin courtesy. The effective plan is resolved in
-- @dinamique/business-logic so the app and the panel cannot disagree (§57, §85).
create table subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references profiles(id) on delete cascade,
  plan               plan_code not null default 'pro',
  source             plan_source not null,
  started_at         timestamptz not null default now(),
  expires_at         timestamptz,
  cancelled_at       timestamptz,
  granted_by_admin_id uuid references profiles(id) on delete set null,
  note               text,
  created_at         timestamptz not null default now()
);

create index subscriptions_user_idx on subscriptions (user_id, started_at desc);
create index subscriptions_active_idx on subscriptions (expires_at)
  where cancelled_at is null;

-- ------------------------------------------------------------- support -----
create table support_categories (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0
);

-- Human-facing ticket references (DNQ-0001) come from a sequence rather than
-- a count(*), so two concurrent tickets can never collide.
create sequence support_ticket_reference_seq start 1000;

create table support_tickets (
  id                   uuid primary key default gen_random_uuid(),
  reference            text not null unique
                         default 'DNQ-' || lpad(nextval('support_ticket_reference_seq')::text, 4, '0'),
  user_id              uuid not null references profiles(id) on delete cascade,
  category_id          uuid references support_categories(id) on delete set null,
  subject              text not null check (length(trim(subject)) between 1 and 140),
  status               support_ticket_status not null default 'new',
  priority             support_priority not null default 'normal',
  assigned_admin_id    uuid references profiles(id) on delete set null,
  app_version          text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  first_agent_reply_at timestamptz,
  resolved_at          timestamptz,
  closed_at            timestamptz,
  last_message_at      timestamptz not null default now()
);

create index support_tickets_user_idx on support_tickets (user_id, last_message_at desc);
create index support_tickets_status_idx on support_tickets (status, last_message_at desc);
create index support_tickets_assigned_idx on support_tickets (assigned_admin_id)
  where status not in ('resolved', 'closed');

create trigger support_tickets_updated_at before update on support_tickets
  for each row execute function set_updated_at();

create table support_messages (
  id               uuid primary key default gen_random_uuid(),
  ticket_id        uuid not null references support_tickets(id) on delete cascade,
  author_kind      support_author_kind not null,
  author_id        uuid references profiles(id) on delete set null,
  body             text not null check (length(trim(body)) > 0),
  attachment_path  text,
  -- Internal notes must NEVER reach the user. RLS below enforces it at the
  -- database, not in a query the app might forget to filter (§74).
  is_internal_note boolean not null default false,
  created_at       timestamptz not null default now(),
  read_by_user_at  timestamptz
);

create index support_messages_ticket_idx on support_messages (ticket_id, created_at);

-- Keeps the ticket's activity clock in step with its conversation.
create or replace function support_message_touch_ticket()
returns trigger
language plpgsql
as $$
begin
  if new.is_internal_note then
    return new; -- an internal note is not activity the user can see
  end if;

  update support_tickets
  set last_message_at = new.created_at,
      first_agent_reply_at = case
        when new.author_kind = 'agent' and first_agent_reply_at is null
        then new.created_at else first_agent_reply_at
      end
  where id = new.ticket_id;

  return new;
end;
$$;

create trigger support_messages_touch_ticket after insert on support_messages
  for each row execute function support_message_touch_ticket();

-- ------------------------------------------------------------- growth ------
create table campaigns (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  starts_at  timestamptz,
  ends_at    timestamptz,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table influencers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete set null,
  display_name  text not null,
  status        influencer_status not null default 'approved',
  internal_note text,
  approved_at   timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger influencers_updated_at before update on influencers
  for each row execute function set_updated_at();

create table influencer_applications (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid references profiles(id) on delete set null,
  influencer_id       uuid references influencers(id) on delete set null,
  name                text not null,
  email               citext not null,
  phone               text,
  city                text not null,
  state               char(2) not null,
  instagram           text,
  tiktok              text,
  youtube             text,
  other_network       text,
  followers_estimate  integer check (followers_estimate is null or followers_estimate >= 0),
  content_type        text not null,
  message             text,
  status              influencer_status not null default 'submitted',
  reviewed_by_admin_id uuid references profiles(id) on delete set null,
  reviewed_at         timestamptz,
  internal_note       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index influencer_apps_status_idx on influencer_applications (status, created_at desc);
-- One open application per user; re-applying means updating the existing row.
create unique index influencer_apps_one_open_idx on influencer_applications (user_id)
  where user_id is not null and status in ('submitted', 'under_review');

create trigger influencer_apps_updated_at before update on influencer_applications
  for each row execute function set_updated_at();

-- ONE code table for referral / influencer / campaign / partnership /
-- promotion (§88). Three parallel systems would drift; this one will not.
create table promotion_codes (
  id             uuid primary key default gen_random_uuid(),
  code           text not null check (code = upper(code) and length(code) between 4 and 24),
  kind           code_kind not null,
  owner_user_id  uuid references profiles(id) on delete cascade,
  influencer_id  uuid references influencers(id) on delete cascade,
  campaign_id    uuid references campaigns(id) on delete set null,
  benefit_amount bigint not null default 1000 check (benefit_amount >= 0),
  starts_at      timestamptz,
  expires_at     timestamptz,
  max_uses       integer check (max_uses is null or max_uses > 0),
  use_count      integer not null default 0 check (use_count >= 0),
  status         code_status not null default 'active',
  created_by_admin_id uuid references profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create unique index promotion_codes_code_idx on promotion_codes (code);
create index promotion_codes_owner_idx on promotion_codes (owner_user_id);
create index promotion_codes_influencer_idx on promotion_codes (influencer_id);
-- Every user gets exactly one personal referral code.
create unique index promotion_codes_one_referral_per_user_idx
  on promotion_codes (owner_user_id) where kind = 'referral';

create trigger promotion_codes_updated_at before update on promotion_codes
  for each row execute function set_updated_at();

create table referrals (
  id               uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references profiles(id) on delete cascade,
  referred_user_id uuid not null references profiles(id) on delete cascade,
  code_id          uuid not null references promotion_codes(id) on delete restrict,
  status           referral_status not null default 'signed_up',
  created_at       timestamptz not null default now(),
  converted_at     timestamptz,
  -- Antifraude V1 (§85): a referred account can only ever appear once, and
  -- nobody can refer themselves. Both enforced by the database.
  constraint referral_not_self check (referrer_user_id <> referred_user_id),
  unique (referred_user_id)
);

create index referrals_referrer_idx on referrals (referrer_user_id, created_at desc);

create table discount_benefits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  code_id     uuid references promotion_codes(id) on delete set null,
  referral_id uuid references referrals(id) on delete set null,
  amount      bigint not null check (amount > 0),
  status      benefit_status not null default 'granted',
  expires_at  timestamptz,
  used_at     timestamptz,
  -- What the benefit was actually spent on, once billing exists.
  applied_to  text,
  created_at  timestamptz not null default now()
);

create index discount_benefits_user_idx on discount_benefits (user_id, status);
-- A referral produces at most one benefit; a benefit is consumed at most once.
create unique index discount_benefits_one_per_referral_idx
  on discount_benefits (referral_id) where referral_id is not null;

-- First-touch attribution, written once at signup and never overwritten (§91).
create table user_attribution (
  user_id          uuid primary key references profiles(id) on delete cascade,
  source           text,
  medium           text,
  campaign         text,
  code_id          uuid references promotion_codes(id) on delete set null,
  influencer_id    uuid references influencers(id) on delete set null,
  referrer_user_id uuid references profiles(id) on delete set null,
  signup_origin    text,
  captured_at      timestamptz not null default now()
);

create index user_attribution_code_idx on user_attribution (code_id);
create index user_attribution_influencer_idx on user_attribution (influencer_id);

-- Attribution is first-touch by construction: updates are rejected outright
-- rather than relying on every caller to remember (§91).
create or replace function user_attribution_is_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'user_attribution is first-touch and cannot be modified (user %)', old.user_id;
end;
$$;

create trigger user_attribution_no_update before update on user_attribution
  for each row execute function user_attribution_is_immutable();

-- ------------------------------------------------------- notifications -----
create table user_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  category   notification_category not null,
  title      text not null,
  body       text not null,
  deep_link  text,
  cta_label  text,
  image_path text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- Powers the bell badge without scanning the whole table.
create index user_notifications_unread_idx on user_notifications (user_id, created_at desc)
  where read_at is null;
create index user_notifications_user_idx on user_notifications (user_id, created_at desc);

-- --------------------------------------------------------------- admin -----
create table admin_users (
  user_id    uuid primary key references profiles(id) on delete cascade,
  role       admin_role not null,
  is_active  boolean not null default true,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger admin_users_updated_at before update on admin_users
  for each row execute function set_updated_at();

create table admin_logs (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid references profiles(id) on delete set null,
  action        text not null,
  target_table  text,
  target_id     text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index admin_logs_created_idx on admin_logs (created_at desc);
create index admin_logs_admin_idx on admin_logs (admin_user_id, created_at desc);
create index admin_logs_target_idx on admin_logs (target_table, target_id);

create table saved_reports (
  id            uuid primary key default gen_random_uuid(),
  owner_admin_id uuid not null references profiles(id) on delete cascade,
  name          text not null,
  definition    jsonb not null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger saved_reports_updated_at before update on saved_reports
  for each row execute function set_updated_at();

-- Every export is recorded — exports of user data are a privacy event (§95).
create table exports (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references profiles(id) on delete set null,
  scope      text not null,
  format     text not null check (format in ('xlsx', 'csv')),
  filters    jsonb not null default '{}'::jsonb,
  row_count  integer,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------- product analytics ----
create table analytics_events (
  id          bigserial primary key,
  user_id     uuid references profiles(id) on delete set null,
  event       text not null,
  properties  jsonb not null default '{}'::jsonb,
  app_version text,
  platform    text check (platform in ('ios', 'android', 'web', 'admin')),
  created_at  timestamptz not null default now()
);

create index analytics_events_event_idx on analytics_events (event, created_at desc);
create index analytics_events_user_idx on analytics_events (user_id, created_at desc);

-- Admin-tunable content and thresholds (§104, §105) so the important rules are
-- not hard-coded in a component nobody can reach.
create table insight_rules (
  key            text primary key,
  is_enabled     boolean not null default true,
  thresholds     jsonb not null default '{}'::jsonb,
  template       text,
  updated_at     timestamptz not null default now()
);

create table tour_steps (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  description text not null,
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  audience    work_mode[] not null default '{}',
  version     integer not null default 1
);

create table app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);
