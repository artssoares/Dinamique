-- ============================================================================
-- Dinamique — instalação completa
--
-- Cole este arquivo inteiro no SQL Editor do seu projeto Supabase e execute.
-- Ele cria o schema, as políticas de segurança, as funções e os dados iniciais.
--
-- Gerado a partir de packages/database/migrations. NÃO edite este arquivo:
-- altere a migration correspondente e rode `pnpm --filter @dinamique/database
-- run build:setup`.
--
-- Arquivos incluídos (18):
--   20260818000100_extensions_and_enums.sql
--   20260818000200_identity_and_catalogue.sql
--   20260818000300_operations.sql
--   20260818000400_growth_support_admin.sql
--   20260818000500_rls.sql
--   20260818000550_grants.sql
--   20260818000600_functions_and_views.sql
--   20260818000700_reference_data.sql
--   20260818000800_vehicle_catalogue.sql
--   20260818000900_storage.sql
--   20260818001000_benchmark.sql
--   20260818001100_notifications_engine.sql
--   20260818001200_analytics_views.sql
--   20260818001300_vehicle_import.sql
--   20260818001400_billing.sql
--   20260818001500_security_hardening.sql
--   20260818001600_extensions_schema.sql
--   20260821000100_journey_gps_routes.sql
-- ============================================================================


-- ==========================================================================
-- 20260818000100_extensions_and_enums.sql
-- ==========================================================================

-- ============================================================================
-- Dinamique — extensions, enums and shared helpers
--
-- Conventions used across every migration:
--   * money is stored as BIGINT cents; there is no NUMERIC currency anywhere
--   * distance is INTEGER metres, volume is INTEGER millilitres, duration is
--     INTEGER seconds — integers only, so no float drift reaches a driver
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


-- ==========================================================================
-- 20260818000200_identity_and_catalogue.sql
-- ==========================================================================

-- ============================================================================
-- Identity, preferences and the admin-managed catalogues
-- ============================================================================

-- --------------------------------------------------------------- profiles --
create table profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  first_name             text not null check (length(trim(first_name)) between 1 and 60),
  last_name              text,
  preferred_name         text,
  email                  citext not null,
  phone                  text,
  avatar_path            text,
  city                   text,
  state                  char(2),
  birth_date             date,
  -- Voluntary demographics (§88). Free text rather than an enum so a user is
  -- never forced into a category that does not describe them.
  gender                 text,
  work_modes             work_mode[] not null default '{}',
  onboarding_completed_at timestamptz,
  tour_completed_at      timestamptz,
  blocked_at             timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  last_seen_at           timestamptz,
  -- Marca contas criadas pelo seed de demonstração. Elas são excluídas do
  -- benchmark para não contaminar a mediana de usuários reais (§122).
  is_demo                boolean not null default false
);

create index profiles_last_seen_idx on profiles (last_seen_at desc nulls last);
create index profiles_city_state_idx on profiles (state, city);
create index profiles_created_idx on profiles (created_at desc);
create index profiles_demo_idx on profiles (is_demo) where is_demo;

create trigger profiles_updated_at before update on profiles
  for each row execute function set_updated_at();

create table user_preferences (
  user_id          uuid primary key references profiles(id) on delete cascade,
  theme            theme_preference not null default 'system',
  locale           text not null default 'pt-BR',
  currency         char(3) not null default 'BRL',
  -- Opt-in to contributing anonymised rows to the benchmark pool (§44, §108).
  benchmark_opt_in boolean not null default true,
  push_enabled     boolean not null default true,
  push_token       text,
  updated_at       timestamptz not null default now()
);

create trigger user_preferences_updated_at before update on user_preferences
  for each row execute function set_updated_at();

-- Per-category notification opt-outs (§58).
create table notification_preferences (
  user_id  uuid not null references profiles(id) on delete cascade,
  category notification_category not null,
  in_app   boolean not null default true,
  push     boolean not null default true,
  primary key (user_id, category)
);

-- ------------------------------------------------------------- platforms --
create table platforms (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  logo_path  text,
  work_modes work_mode[] not null default '{}',
  is_active  boolean not null default true,
  sort_order integer not null default 0
);

create table user_platforms (
  user_id     uuid not null references profiles(id) on delete cascade,
  platform_id uuid not null references platforms(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (user_id, platform_id)
);

-- ------------------------------------------------------ vehicle catalogue --
-- Three levels (make → model → version) because consumption figures only make
-- sense at version level, while the UI picks progressively (§32).
create table vehicle_makes (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  is_active boolean not null default true
);

create table vehicle_models (
  id      uuid primary key default gen_random_uuid(),
  make_id uuid not null references vehicle_makes(id) on delete cascade,
  name    text not null,
  vehicle_type vehicle_type not null default 'car',
  is_active boolean not null default true,
  unique (make_id, name)
);

create table vehicle_versions (
  id                  uuid primary key default gen_random_uuid(),
  model_id            uuid not null references vehicle_models(id) on delete cascade,
  name                text,
  year_from           smallint,
  year_to             smallint,
  engine              text,
  fuel_type           fuel_type,
  -- Metres per litre, so no float km values are stored (10.8 km/l → 10800).
  urban_consumption   integer check (urban_consumption is null or urban_consumption > 0),
  highway_consumption integer check (highway_consumption is null or highway_consumption > 0),
  is_active           boolean not null default true,
  unique (model_id, name, year_from)
);

create index vehicle_models_make_idx on vehicle_models (make_id);
create index vehicle_versions_model_idx on vehicle_versions (model_id);

-- ----------------------------------------------------------- user vehicle --
create table user_vehicles (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references profiles(id) on delete cascade,
  vehicle_type            vehicle_type not null,
  version_id              uuid references vehicle_versions(id) on delete set null,
  -- Free-text fallback when the catalogue has no match; the driver is never
  -- blocked by a missing row in our data.
  custom_label            text,
  model_year              smallint,
  fuel_type               fuel_type,
  ownership               vehicle_ownership not null default 'owned',
  estimated_consumption   integer check (estimated_consumption is null or estimated_consumption > 0),
  measured_consumption    integer check (measured_consumption is null or measured_consumption > 0),
  -- Only ever true after the user explicitly accepted the measured figure (§31).
  use_measured_consumption boolean not null default false,
  is_primary              boolean not null default false,
  archived_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint vehicle_identified check (version_id is not null or custom_label is not null)
);

create index user_vehicles_user_idx on user_vehicles (user_id) where archived_at is null;
-- At most one primary vehicle per user, enforced by the database rather than
-- by hope.
create unique index user_vehicles_one_primary_idx
  on user_vehicles (user_id) where is_primary and archived_at is null;

create trigger user_vehicles_updated_at before update on user_vehicles
  for each row execute function set_updated_at();

-- ------------------------------------------------------------ categories --
create table expense_categories (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  name            text not null,
  -- Only vehicle-attributable costs feed cost-per-km (§35).
  is_vehicle_cost boolean not null default true,
  is_active       boolean not null default true,
  sort_order      integer not null default 0
);

create table maintenance_types (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  name       text not null,
  is_active  boolean not null default true,
  sort_order integer not null default 0
);


-- ==========================================================================
-- 20260818000300_operations.sql
-- ==========================================================================

-- ============================================================================
-- The operational core: journeys, revenues, expenses, fuel, maintenance,
-- goals and the manual obligation trackers.
-- ============================================================================

create table journeys (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  vehicle_id        uuid references user_vehicles(id) on delete set null,
  status            journey_status not null default 'active',
  started_at        timestamptz not null,
  ended_at          timestamptz,
  -- Sum of paused intervals; excluded from worked time.
  paused_seconds    integer not null default 0 check (paused_seconds >= 0),
  paused_at         timestamptz,
  -- Metres. Both null is normal — distance is optional in V1 (§6).
  odometer_start    integer check (odometer_start is null or odometer_start >= 0),
  odometer_end      integer check (odometer_end is null or odometer_end >= 0),
  distance_override integer check (distance_override is null or distance_override > 0),
  note              text,
  -- Set client-side so an offline journey keeps its original identity on sync.
  client_id         uuid,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint journey_ends_after_start check (ended_at is null or ended_at >= started_at),
  constraint journey_odometer_increases check (
    odometer_start is null or odometer_end is null or odometer_end >= odometer_start
  )
);

create index journeys_user_started_idx on journeys (user_id, started_at desc);
create unique index journeys_client_id_idx on journeys (user_id, client_id) where client_id is not null;
-- A user can only have one journey running at a time.
create unique index journeys_one_active_idx
  on journeys (user_id) where status in ('active', 'paused');

create trigger journeys_updated_at before update on journeys
  for each row execute function set_updated_at();

create table revenues (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  journey_id  uuid references journeys(id) on delete set null,
  platform_id uuid references platforms(id) on delete set null,
  date        date not null,
  amount      bigint not null check (amount >= 0),
  tips        bigint not null default 0 check (tips >= 0),
  trip_count  integer check (trip_count is null or trip_count >= 0),
  note        text,
  client_id   uuid,
  created_at  timestamptz not null default now()
);

create index revenues_user_date_idx on revenues (user_id, date desc);
create index revenues_journey_idx on revenues (journey_id);
create index revenues_platform_date_idx on revenues (platform_id, date);
create unique index revenues_client_id_idx on revenues (user_id, client_id) where client_id is not null;

create table expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  journey_id  uuid references journeys(id) on delete set null,
  category_id uuid not null references expense_categories(id),
  vehicle_id  uuid references user_vehicles(id) on delete set null,
  date        date not null,
  amount      bigint not null check (amount >= 0),
  note        text,
  client_id   uuid,
  created_at  timestamptz not null default now()
);

create index expenses_user_date_idx on expenses (user_id, date desc);
create index expenses_journey_idx on expenses (journey_id);
create index expenses_category_date_idx on expenses (category_id, date);
create unique index expenses_client_id_idx on expenses (user_id, client_id) where client_id is not null;

create table fuel_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles(id) on delete cascade,
  vehicle_id      uuid references user_vehicles(id) on delete set null,
  journey_id      uuid references journeys(id) on delete set null,
  -- Mirrors into expenses so fuel counts as a cost exactly once.
  expense_id      uuid references expenses(id) on delete set null,
  date            date not null,
  fuel_type       fuel_type not null,
  total_amount    bigint not null check (total_amount >= 0),
  price_per_litre bigint check (price_per_litre is null or price_per_litre > 0),
  volume          integer check (volume is null or volume > 0),
  odometer        integer check (odometer is null or odometer >= 0),
  station         text,
  client_id       uuid,
  created_at      timestamptz not null default now()
);

create index fuel_logs_user_date_idx on fuel_logs (user_id, date desc);
create index fuel_logs_vehicle_odometer_idx on fuel_logs (vehicle_id, odometer)
  where odometer is not null;

create table maintenance_logs (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  vehicle_id        uuid references user_vehicles(id) on delete set null,
  type_id           uuid references maintenance_types(id),
  expense_id        uuid references expenses(id) on delete set null,
  date              date not null,
  amount            bigint not null check (amount >= 0),
  odometer          integer check (odometer is null or odometer >= 0),
  next_due_odometer integer check (next_due_odometer is null or next_due_odometer >= 0),
  next_due_date     date,
  note              text,
  created_at        timestamptz not null default now()
);

create index maintenance_user_date_idx on maintenance_logs (user_id, date desc);
create index maintenance_next_due_idx on maintenance_logs (user_id, next_due_date)
  where next_due_date is not null;

-- Stated once, then apportioned across a window (§33). Never a real cash
-- movement — the UI must always label it as an estimate.
create table recurring_costs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  vehicle_id  uuid references user_vehicles(id) on delete set null,
  category_id uuid not null references expense_categories(id),
  label       text not null,
  amount      bigint not null check (amount >= 0),
  period      recurring_period not null default 'monthly',
  start_date  date not null default current_date,
  end_date    date,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create index recurring_costs_user_idx on recurring_costs (user_id) where is_active;

-- ---------------------------------------------------------------- goals ----
create table goals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  period     goal_period not null,
  basis      goal_basis not null default 'gross',
  target     bigint not null check (target > 0),
  start_date date not null default current_date,
  end_date   date,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One live goal per period per user; history is kept by deactivating, not
-- deleting, so past performance stays explainable.
create unique index goals_one_active_per_period_idx
  on goals (user_id, period) where is_active;

create trigger goals_updated_at before update on goals
  for each row execute function set_updated_at();

-- ------------------------------------------------- obligations & reminders --
create table free_flow_records (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  operator   text not null,
  passed_at  date not null,
  amount     bigint check (amount is null or amount >= 0),
  due_date   date,
  status     free_flow_status not null default 'to_check',
  remind_at  timestamptz,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index free_flow_user_status_idx on free_flow_records (user_id, status);
create index free_flow_remind_idx on free_flow_records (remind_at) where remind_at is not null;

create trigger free_flow_updated_at before update on free_flow_records
  for each row execute function set_updated_at();

create table fines (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  description       text not null,
  issued_at         date not null,
  amount            bigint not null check (amount >= 0),
  due_date          date,
  discount_amount   bigint check (discount_amount is null or discount_amount >= 0),
  discount_deadline date,
  points            smallint check (points is null or points >= 0),
  status            fine_status not null default 'pending',
  remind_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index fines_user_status_idx on fines (user_id, status);

create trigger fines_updated_at before update on fines
  for each row execute function set_updated_at();

-- Cached daily score (§45). Recomputed rather than trusted — it exists so the
-- Home screen does not re-aggregate a month of rows on every open.
create table daily_scores (
  user_id      uuid not null references profiles(id) on delete cascade,
  date         date not null,
  score        numeric(3,1) not null check (score between 0 and 10),
  components   jsonb not null default '{}'::jsonb,
  computed_at  timestamptz not null default now(),
  primary key (user_id, date)
);


-- ==========================================================================
-- 20260818000400_growth_support_admin.sql
-- ==========================================================================

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


-- ==========================================================================
-- 20260818000500_rls.sql
-- ==========================================================================

-- ============================================================================
-- Row Level Security.
--
-- Default posture: every table is locked, and access is granted back
-- explicitly. The client only ever holds the anon key, so anything reachable
-- from the app is reachable through these policies and nothing else.
-- The service role bypasses RLS and is used ONLY server-side (§9, §118).
-- ============================================================================

-- Authorisation predicates. Defined here because they read admin_users, and
-- SECURITY DEFINER so an RLS policy calling them does not recurse into that
-- table's own policies.
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid() and is_active
  );
$$;

create or replace function has_admin_role(required admin_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from admin_users
    where user_id = auth.uid() and is_active and role = any(required)
  );
$$;

alter table profiles                enable row level security;
alter table user_preferences        enable row level security;
alter table notification_preferences enable row level security;
alter table user_platforms          enable row level security;
alter table user_vehicles           enable row level security;
alter table journeys                enable row level security;
alter table revenues                enable row level security;
alter table expenses                enable row level security;
alter table fuel_logs               enable row level security;
alter table maintenance_logs        enable row level security;
alter table recurring_costs         enable row level security;
alter table goals                   enable row level security;
alter table free_flow_records       enable row level security;
alter table fines                   enable row level security;
alter table daily_scores            enable row level security;
alter table subscriptions           enable row level security;
alter table support_tickets         enable row level security;
alter table support_messages        enable row level security;
alter table influencer_applications enable row level security;
alter table influencers             enable row level security;
alter table promotion_codes         enable row level security;
alter table referrals               enable row level security;
alter table discount_benefits       enable row level security;
alter table user_attribution        enable row level security;
alter table user_notifications      enable row level security;
alter table admin_users             enable row level security;
alter table admin_logs              enable row level security;
alter table saved_reports           enable row level security;
alter table exports                 enable row level security;
alter table analytics_events        enable row level security;
alter table campaigns               enable row level security;

-- Reference catalogues are readable by any signed-in user and writable only by
-- admins with the content role.
alter table platforms          enable row level security;
alter table expense_categories enable row level security;
alter table maintenance_types  enable row level security;
alter table support_categories enable row level security;
alter table vehicle_makes      enable row level security;
alter table vehicle_models     enable row level security;
alter table vehicle_versions   enable row level security;
alter table tour_steps         enable row level security;
alter table insight_rules      enable row level security;
alter table plans              enable row level security;
alter table app_settings       enable row level security;

-- ------------------------------------------------------------- profiles ----
create policy profiles_select_self on profiles
  for select using (id = auth.uid() or is_admin());

create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- Admin writes to profiles go through the admin panel's server routes, which
-- use the service role. No blanket admin UPDATE policy is granted here.

-- ------------------------------------------- user-owned operational data ----
-- Same shape for every table a driver owns: read/write your own rows, admins
-- may read for support and analytics but never write.
do $$
declare
  t text;
begin
  foreach t in array array[
    'user_preferences', 'notification_preferences', 'user_platforms',
    'user_vehicles', 'journeys', 'revenues', 'expenses', 'fuel_logs',
    'maintenance_logs', 'recurring_costs', 'goals', 'free_flow_records',
    'fines', 'daily_scores'
  ]
  loop
    execute format($f$
      create policy %1$s_select_own on %1$I
        for select using (user_id = auth.uid() or is_admin());
      create policy %1$s_insert_own on %1$I
        for insert with check (user_id = auth.uid());
      create policy %1$s_update_own on %1$I
        for update using (user_id = auth.uid()) with check (user_id = auth.uid());
      create policy %1$s_delete_own on %1$I
        for delete using (user_id = auth.uid());
    $f$, t);
  end loop;
end;
$$;

-- ---------------------------------------------------------- monetisation ---
-- Plans are granted by the server, never claimed by the client.
create policy subscriptions_select_own on subscriptions
  for select using (user_id = auth.uid() or is_admin());

-- --------------------------------------------------------------- support ---
create policy support_tickets_select_own on support_tickets
  for select using (user_id = auth.uid() or is_admin());

create policy support_tickets_insert_own on support_tickets
  for insert with check (user_id = auth.uid());

-- A user may close their own ticket when it is solved (§68) but may not
-- reassign it, reprioritise it or resurrect a closed one.
create policy support_tickets_update_own on support_tickets
  for update using (user_id = auth.uid() and status <> 'closed')
  with check (user_id = auth.uid());

create policy support_tickets_agent_all on support_tickets
  for all using (has_admin_role(array['superadmin', 'admin', 'support']::admin_role[]))
  with check (has_admin_role(array['superadmin', 'admin', 'support']::admin_role[]));

-- Internal notes are invisible to the user at the row level. Even a query that
-- forgets to filter them cannot leak one (§74).
create policy support_messages_select_own on support_messages
  for select using (
    (not is_internal_note and exists (
      select 1 from support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid()
    ))
    or is_admin()
  );

create policy support_messages_insert_own on support_messages
  for insert with check (
    author_kind = 'user'
    and author_id = auth.uid()
    and not is_internal_note
    and exists (
      select 1 from support_tickets t
      where t.id = ticket_id and t.user_id = auth.uid() and t.status <> 'closed'
    )
  );

create policy support_messages_agent_all on support_messages
  for all using (has_admin_role(array['superadmin', 'admin', 'support']::admin_role[]))
  with check (has_admin_role(array['superadmin', 'admin', 'support']::admin_role[]));

-- ---------------------------------------------------------------- growth ---
create policy influencer_apps_select_own on influencer_applications
  for select using (user_id = auth.uid() or is_admin());

create policy influencer_apps_insert_own on influencer_applications
  for insert with check (user_id = auth.uid() and status = 'submitted');

create policy influencers_select_own on influencers
  for select using (user_id = auth.uid() or is_admin());

-- A user reads their own codes. Redeeming someone else's happens server-side
-- during signup, so no cross-user SELECT is needed here.
create policy promotion_codes_select_own on promotion_codes
  for select using (owner_user_id = auth.uid() or is_admin());

-- "Minhas indicações" (§86): the referrer sees the rows they generated. The
-- referred user's identity is exposed only through the restricted view below.
create policy referrals_select_involved on referrals
  for select using (
    referrer_user_id = auth.uid() or referred_user_id = auth.uid() or is_admin()
  );

create policy discount_benefits_select_own on discount_benefits
  for select using (user_id = auth.uid() or is_admin());

create policy user_attribution_select_own on user_attribution
  for select using (user_id = auth.uid() or is_admin());

-- ---------------------------------------------------------- notifications --
create policy notifications_select_own on user_notifications
  for select using (user_id = auth.uid() or is_admin());

-- A user may only ever mark their own notification as read; they cannot write
-- a notification to themselves or to anyone else.
create policy notifications_update_own on user_notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ----------------------------------------------------------------- admin ---
create policy admin_users_select on admin_users
  for select using (user_id = auth.uid() or is_admin());

create policy admin_logs_select on admin_logs
  for select using (is_admin());

create policy saved_reports_own on saved_reports
  for all using (owner_admin_id = auth.uid() and is_admin())
  with check (owner_admin_id = auth.uid() and is_admin());

create policy exports_select_own on exports
  for select using (user_id = auth.uid() or is_admin());

-- Events are written by the client and read only by admins — a user cannot
-- read the event stream, not even their own.
create policy analytics_insert_own on analytics_events
  for insert with check (user_id = auth.uid() or user_id is null);

create policy analytics_select_admin on analytics_events
  for select using (has_admin_role(array['superadmin', 'admin', 'analyst']::admin_role[]));

-- ---------------------------------------------------- reference catalogues --
do $$
declare
  t text;
begin
  foreach t in array array[
    'platforms', 'expense_categories', 'maintenance_types', 'support_categories',
    'vehicle_makes', 'vehicle_models', 'vehicle_versions', 'tour_steps',
    'insight_rules', 'plans', 'campaigns'
  ]
  loop
    execute format($f$
      create policy %1$s_read_all on %1$I
        for select using (auth.role() = 'authenticated');
      create policy %1$s_write_admin on %1$I
        for all using (has_admin_role(array['superadmin', 'admin', 'content']::admin_role[]))
        with check (has_admin_role(array['superadmin', 'admin', 'content']::admin_role[]));
    $f$, t);
  end loop;
end;
$$;

-- app_settings can hold operational configuration; only superadmins touch it.
create policy app_settings_read on app_settings
  for select using (auth.role() = 'authenticated');
create policy app_settings_write on app_settings
  for all using (has_admin_role(array['superadmin']::admin_role[]))
  with check (has_admin_role(array['superadmin']::admin_role[]));


-- ==========================================================================
-- 20260818000550_grants.sql
-- ==========================================================================

-- ============================================================================
-- Table privileges.
--
-- RLS decides WHICH ROWS a request may touch; GRANTs decide whether the role
-- may touch the table at all. Supabase bootstraps broad defaults on new
-- projects, but we state ours explicitly so the security posture lives in the
-- repository rather than in whatever the project was created with (§118).
--
-- Nothing is granted to `anon`: every screen in Dinamique requires a session.
-- ============================================================================

grant usage on schema public to authenticated, service_role;

-- Read access to the authenticated role, narrowed to rows by RLS.
grant select on all tables in schema public to authenticated;

-- Write access only where a user legitimately creates their own data.
grant insert, update, delete on
  user_preferences, notification_preferences, user_platforms, user_vehicles,
  journeys, revenues, expenses, fuel_logs, maintenance_logs, recurring_costs,
  goals, free_flow_records, fines, daily_scores
to authenticated;

grant update on profiles to authenticated;

-- Support: a user opens tickets and writes messages; the RLS policies above
-- restrict them to their own non-internal messages.
grant insert, update on support_tickets to authenticated;
grant insert on support_messages to authenticated;

-- Marcar como lida é a ÚNICA coisa que o usuário faz numa notificação. Um
-- grant de update na tabela inteira deixaria ele reescrever o próprio título e
-- corpo — inofensivo para os outros, mas é dado nosso e não dele.
grant update (read_at) on user_notifications to authenticated;

-- Influencer applications are user-submitted.
grant insert, update on influencer_applications to authenticated;

-- Analytics is append-only from the client.
grant insert on analytics_events to authenticated;
grant usage, select on sequence analytics_events_id_seq to authenticated;

-- Admin-managed catalogues are writable through RLS-checked policies; the
-- policies do the gating, the grant just makes the table reachable.
grant insert, update, delete on
  platforms, expense_categories, maintenance_types, support_categories,
  vehicle_makes, vehicle_models, vehicle_versions, tour_steps, insight_rules,
  plans, campaigns, app_settings, saved_reports
to authenticated;

-- Everything else — subscriptions, promotion_codes, referrals,
-- discount_benefits, user_attribution, admin_users, admin_logs, exports — is
-- READ-ONLY to the client on purpose. Value is granted by SECURITY DEFINER
-- functions or by the service role, never claimed by the app.

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all functions in schema public to service_role;

-- Future tables inherit the same posture.
alter default privileges in schema public
  grant select on tables to authenticated;
alter default privileges in schema public
  grant all on tables to service_role;


-- ==========================================================================
-- 20260818000600_functions_and_views.sql
-- ==========================================================================

-- ============================================================================
-- Server-side business functions and the read models the apps query.
--
-- Anything that grants value (a plan, a discount, a referral) lives here and
-- runs with SECURITY DEFINER, because the client must never be able to claim
-- it for itself (§118).
-- ============================================================================

-- --------------------------------------------------------------- signup ----
-- Minimal accent folding so we do not depend on the unaccent extension being
-- available on every Supabase tier.
create or replace function unaccent_simple(input text)
returns text
language sql
immutable
as $$
  select translate(
    input,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

-- A new account is set up in one transaction: profile, preferences, 7-day
-- trial, personal referral code, and first-touch attribution.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text;
  v_code       text;
  v_suffix     text;
  v_attempt    integer := 0;
begin
  v_first_name := coalesce(
    nullif(trim(split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1)), ''),
    split_part(new.email, '@', 1)
  );

  insert into profiles (id, first_name, email)
  values (new.id, left(v_first_name, 60), new.email);

  insert into user_preferences (user_id) values (new.id);

  -- Every new user gets 7 days of Pro (§57).
  insert into subscriptions (user_id, plan, source, started_at, expires_at)
  values (new.id, 'pro', 'trial', now(), now() + interval '7 days');

  -- Personal referral code, e.g. ARTHUR26. Retries on collision; the unique
  -- index is the real guarantee, this loop just avoids surfacing the error.
  loop
    v_attempt := v_attempt + 1;
    v_suffix := upper(substr(translate(encode(gen_random_bytes(4), 'base64'),
                                       '+/=0O1IL', 'ABCDEFGH'), 1, 2));
    v_code := upper(regexp_replace(unaccent_simple(v_first_name), '[^A-Za-z]', '', 'g'));
    v_code := case when length(v_code) >= 3 then left(v_code, 8) else 'DRIVER' end || v_suffix;

    begin
      insert into promotion_codes (code, kind, owner_user_id, benefit_amount)
      values (v_code, 'referral', new.id,
              coalesce((select (value #>> '{}')::bigint from app_settings
                        where key = 'referral_discount_amount'), 1000));
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------ code redemption ----
-- Applies a referral/influencer/campaign code to the CALLING user. Every
-- antifraud rule from §85 is enforced here, inside one transaction, so a
-- client cannot skip any of them.
create or replace function redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code    promotion_codes%rowtype;
  v_benefit_id uuid;
  v_referral_id uuid;
  v_validity_days integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_code from promotion_codes
  where code = upper(trim(p_code)) for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_code.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', v_code.status::text);
  end if;
  if v_code.starts_at is not null and v_code.starts_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_started');
  end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_code.max_uses is not null and v_code.use_count >= v_code.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  -- You cannot refer yourself.
  if v_code.owner_user_id = v_user_id then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  -- One origin per account, forever.
  if exists (select 1 from user_attribution where user_id = v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_attributed');
  end if;

  -- A blocked referrer earns nothing.
  if v_code.owner_user_id is not null and exists (
    select 1 from profiles where id = v_code.owner_user_id and blocked_at is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'referrer_blocked');
  end if;

  v_validity_days := coalesce(
    (select (value #>> '{}')::integer from app_settings where key = 'referral_benefit_validity_days'),
    90
  );

  if v_code.kind = 'referral' and v_code.owner_user_id is not null then
    insert into referrals (referrer_user_id, referred_user_id, code_id)
    values (v_code.owner_user_id, v_user_id, v_code.id)
    returning id into v_referral_id;
  end if;

  if v_code.benefit_amount > 0 then
    insert into discount_benefits (user_id, code_id, referral_id, amount, expires_at)
    values (v_user_id, v_code.id, v_referral_id, v_code.benefit_amount,
            now() + make_interval(days => v_validity_days))
    returning id into v_benefit_id;
  end if;

  insert into user_attribution (
    user_id, source, medium, code_id, influencer_id, referrer_user_id, signup_origin
  ) values (
    v_user_id,
    case v_code.kind when 'referral' then 'referral' when 'influencer' then 'influencer'
                     else 'campaign' end,
    v_code.kind::text,
    v_code.id,
    v_code.influencer_id,
    v_code.owner_user_id,
    'code'
  );

  update promotion_codes
  set use_count = use_count + 1,
      status = case
        when max_uses is not null and use_count + 1 >= max_uses then 'exhausted'::code_status
        else status
      end
  where id = v_code.id;

  insert into analytics_events (user_id, event, properties)
  values (v_user_id, 'promotion_code_used',
          jsonb_build_object('code', v_code.code, 'kind', v_code.kind));

  return jsonb_build_object(
    'ok', true,
    'kind', v_code.kind,
    'benefit_amount', v_code.benefit_amount,
    'benefit_id', v_benefit_id
  );
end;
$$;

revoke all on function redeem_code(text) from public;
grant execute on function redeem_code(text) to authenticated;

-- ------------------------------------------------------ support helpers ----
-- Marks every support notification for a ticket as read when the user opens
-- the conversation (§71).
create or replace function mark_ticket_read(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from support_tickets where id = p_ticket_id and user_id = auth.uid()
  ) then
    raise exception 'ticket not found';
  end if;

  update support_messages
  set read_by_user_at = now()
  where ticket_id = p_ticket_id and read_by_user_at is null and author_kind <> 'user';

  update user_notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and category = 'support'
    and deep_link = '/support/' || p_ticket_id::text;
end;
$$;

grant execute on function mark_ticket_read(uuid) to authenticated;

-- ---------------------------------------------------------------- views ----
-- Read models. The apps query these instead of assembling joins in three
-- different places (§106).

-- A user's current plan, resolved from all their grants.
create or replace view current_plans
with (security_invoker = true) as
select
  p.id as user_id,
  coalesce(s.plan, 'free') as plan,
  s.source,
  s.expires_at,
  s.source = 'trial' as is_trial
from profiles p
left join lateral (
  select sub.plan, sub.source, sub.expires_at
  from subscriptions sub
  where sub.user_id = p.id
    and sub.plan = 'pro'
    and sub.cancelled_at is null
    and sub.started_at <= now()
    and (sub.expires_at is null or sub.expires_at > now())
  order by
    case sub.source
      when 'subscription' then 5 when 'partnership' then 4 when 'courtesy' then 3
      when 'promotion' then 2 else 1
    end desc,
    sub.expires_at desc nulls first
  limit 1
) s on true;

-- One row per user per calendar day: the grain every summary, insight and
-- benchmark is built from (§106).
create or replace view daily_totals
with (security_invoker = true) as
with revenue_days as (
  select user_id, date,
         sum(amount + tips)::bigint as gross_revenue,
         sum(tips)::bigint as tips,
         coalesce(sum(trip_count), 0)::integer as trip_count
  from revenues group by user_id, date
),
expense_days as (
  select e.user_id, e.date,
         sum(e.amount)::bigint as total_expenses,
         sum(e.amount) filter (where c.is_vehicle_cost)::bigint as vehicle_expenses
  from expenses e
  join expense_categories c on c.id = e.category_id
  group by e.user_id, e.date
),
journey_days as (
  select user_id,
         (started_at at time zone 'America/Sao_Paulo')::date as date,
         sum(
           greatest(0, extract(epoch from (ended_at - started_at))::integer - paused_seconds)
         )::integer as worked_seconds,
         sum(
           coalesce(distance_override,
                    case when odometer_end > odometer_start
                         then odometer_end - odometer_start end,
                    0)
         )::bigint as distance,
         count(*)::integer as journey_count
  from journeys
  where status = 'completed' and ended_at is not null
  group by user_id, (started_at at time zone 'America/Sao_Paulo')::date
)
select
  coalesce(r.user_id, e.user_id, j.user_id) as user_id,
  coalesce(r.date, e.date, j.date) as date,
  coalesce(r.gross_revenue, 0) as gross_revenue,
  coalesce(r.tips, 0) as tips,
  coalesce(r.trip_count, 0) as trip_count,
  coalesce(e.total_expenses, 0) as total_expenses,
  coalesce(e.vehicle_expenses, 0) as vehicle_expenses,
  coalesce(r.gross_revenue, 0) - coalesce(e.total_expenses, 0) as net_profit,
  coalesce(j.worked_seconds, 0) as worked_seconds,
  coalesce(j.distance, 0) as distance,
  coalesce(j.journey_count, 0) as journey_count
from revenue_days r
full outer join expense_days e on e.user_id = r.user_id and e.date = r.date
full outer join journey_days j
  on j.user_id = coalesce(r.user_id, e.user_id) and j.date = coalesce(r.date, e.date);

-- "Minhas indicações" (§86): first name, date and status only. The referred
-- user's email, city and earnings are not exposed to the referrer.
create or replace view my_referrals
with (security_invoker = true) as
select
  r.id,
  r.referrer_user_id,
  p.first_name as referred_first_name,
  r.created_at,
  r.status
from referrals r
join profiles p on p.id = r.referred_user_id
where r.referrer_user_id = auth.uid();

-- Unread bell count, so the app does not fetch rows just to count them.
create or replace view notification_counts
with (security_invoker = true) as
select
  user_id,
  count(*)::integer as unread_total,
  count(*) filter (where category = 'support')::integer as unread_support
from user_notifications
where read_at is null
group by user_id;


-- ==========================================================================
-- 20260818000700_reference_data.sql
-- ==========================================================================

-- ============================================================================
-- Reference data. This is product configuration, not demo content — it ships
-- to production and is editable from the admin panel afterwards.
-- ============================================================================

insert into plans (code, name, price) values
  ('free', 'Free', 0),
  ('pro',  'Pro',  2990)
on conflict (code) do nothing;

insert into app_settings (key, value, description) values
  ('referral_discount_amount', '1000'::jsonb,
   'Desconto em centavos concedido ao usuário indicado (§83).'),
  ('referral_benefit_validity_days', '90'::jsonb,
   'Validade do benefício de indicação, em dias.'),
  ('referral_remainder_policy', '"forfeit"'::jsonb,
   'O que acontece quando a cobrança é menor que o desconto: forfeit | keep_remainder (§84).'),
  ('benchmark_min_sample', '20'::jsonb,
   'Amostra mínima de usuários para exibir um benchmark (§44).'),
  ('trial_days', '7'::jsonb, 'Duração do trial Pro para novos usuários (§57).')
on conflict (key) do nothing;

insert into platforms (slug, name, work_modes, sort_order) values
  ('uber',          'Uber',           '{rideshare}',           10),
  ('99',            '99',             '{rideshare}',           20),
  ('indrive',       'inDrive',        '{rideshare}',           30),
  ('ifood',         'iFood',          '{delivery}',            40),
  ('rappi',         'Rappi',          '{delivery}',            50),
  ('lalamove',      'Lalamove',       '{delivery}',            60),
  ('loggi',         'Loggi',          '{delivery}',            70),
  ('amazon',        'Amazon Flex',    '{delivery}',            80),
  ('mercado-livre', 'Mercado Livre',  '{delivery}',            90),
  ('shopee',        'Shopee',         '{delivery}',           100),
  ('taxi',          'Táxi',           '{taxi}',               110),
  ('particular',    'Particular',     '{private}',            120),
  ('outros',        'Outros',         '{rideshare,delivery,taxi,private}', 999)
on conflict (slug) do nothing;

-- is_vehicle_cost drives cost-per-km: a meal is a cost of working, not a cost
-- of running the car, so it must not inflate R$/km (§35).
insert into expense_categories (slug, name, is_vehicle_cost, sort_order) values
  ('combustivel',    'Combustível',    true,  10),
  ('alimentacao',    'Alimentação',    false, 20),
  ('estacionamento', 'Estacionamento', true,  30),
  ('pedagio',        'Pedágio',        true,  40),
  ('free-flow',      'Free Flow',      true,  50),
  ('lavagem',        'Lavagem',        true,  60),
  ('manutencao',     'Manutenção',     true,  70),
  ('pneus',          'Pneus',          true,  80),
  ('oleo',           'Óleo',           true,  90),
  ('multas',         'Multas',         true, 100),
  ('aluguel',        'Aluguel',        true, 110),
  ('financiamento',  'Financiamento',  true, 120),
  ('seguro',         'Seguro',         true, 130),
  ('ipva',           'IPVA',           true, 140),
  ('licenciamento',  'Licenciamento',  true, 150),
  ('celular',        'Celular',        false, 160),
  ('internet',       'Internet',       false, 170),
  ('outros',         'Outros',         false, 999)
on conflict (slug) do nothing;

insert into maintenance_types (slug, name, sort_order) values
  ('oleo',       'Troca de óleo',  10),
  ('pneus',      'Pneus',          20),
  ('freios',     'Freios',         30),
  ('bateria',    'Bateria',        40),
  ('suspensao',  'Suspensão',      50),
  ('revisao',    'Revisão',        60),
  ('outros',     'Outros',        999)
on conflict (slug) do nothing;

insert into support_categories (slug, name, sort_order) values
  ('conta',              'Minha conta',           10),
  ('assinatura',         'Assinatura e pagamento',20),
  ('veiculo',            'Veículo',               30),
  ('jornada',            'Jornada',               40),
  ('receitas-despesas',  'Receitas e despesas',   50),
  ('metas',              'Metas',                 60),
  ('relatorios',         'Relatórios',            70),
  ('problema-tecnico',   'Problema técnico',      80),
  ('sugestao',           'Sugestão',              90),
  ('outro',              'Outro',                999)
on conflict (slug) do nothing;

insert into tour_steps (slug, title, description, sort_order) values
  ('meta-do-dia',   'Sua meta do dia',      'Acompanhe aqui quanto falta para bater sua meta.', 10),
  ('iniciar',       'Comece sua jornada',   'Toque aqui quando começar a trabalhar.',           20),
  ('registrar',     'Registre em segundos', 'Use o + para lançar ganhos e gastos.',             30),
  ('lucro',         'Seu lucro de verdade', 'Aqui você vê quanto realmente sobrou.',            40),
  ('insights',      'Seus insights',        'O Dinamique interpreta seus números para você.',   50),
  ('notificacoes',  'Notificações',         'Avisos e respostas do suporte aparecem no sino.',  60)
on conflict (slug) do nothing;

insert into insight_rules (key, thresholds) values
  ('profit_per_hour_trend',   '{"trendChange": 0.05}'::jsonb),
  ('worked_less_earned_more', '{}'::jsonb),
  ('fuel_share',              '{"fuelShare": 0.20}'::jsonb),
  ('cost_per_km_trend',       '{"trendChange": 0.05}'::jsonb),
  ('best_weekday',            '{}'::jsonb),
  ('weekday_below_average',   '{"weekdayGap": 0.10}'::jsonb),
  ('goal_streak',             '{"goalStreak": 3}'::jsonb)
on conflict (key) do nothing;

-- Notification categories default to on; a user tunes them in Preferences.
create or replace function seed_notification_preferences()
returns trigger
language plpgsql
as $$
begin
  insert into notification_preferences (user_id, category)
  select new.id, unnest(enum_range(null::notification_category))
  on conflict do nothing;
  return new;
end;
$$;

create trigger profiles_seed_notification_prefs after insert on profiles
  for each row execute function seed_notification_preferences();


-- ==========================================================================
-- 20260818000800_vehicle_catalogue.sql
-- ==========================================================================

-- ============================================================================
-- Catálogo inicial de veículos.
--
-- Modelos mais usados por motoristas de aplicativo e entregadores no Brasil.
-- O consumo é armazenado em metros por litro (10,8 km/l = 10800) e vem de
-- valores de referência — o consumo real medido do usuário sempre prevalece
-- depois que ele aceita a troca (§31).
--
-- O Admin pode editar e importar mais modelos por CSV/XLSX.
-- ============================================================================

-- Insere marca, modelo e versão de uma vez, sem duplicar nada.
create or replace function seed_vehicle(
  p_make text,
  p_model text,
  p_type vehicle_type,
  p_version text,
  p_year_from integer,
  p_engine text,
  p_fuel fuel_type,
  p_urban integer,
  p_highway integer
)
returns void
language plpgsql
as $$
declare
  v_make_id  uuid;
  v_model_id uuid;
begin
  insert into vehicle_makes (name) values (p_make)
  on conflict (name) do nothing;
  select id into v_make_id from vehicle_makes where name = p_make;

  insert into vehicle_models (make_id, name, vehicle_type)
  values (v_make_id, p_model, p_type)
  on conflict (make_id, name) do nothing;
  select id into v_model_id from vehicle_models
  where make_id = v_make_id and name = p_model;

  insert into vehicle_versions (
    model_id, name, year_from, engine, fuel_type, urban_consumption, highway_consumption
  )
  values (v_model_id, p_version, p_year_from::smallint, p_engine, p_fuel, p_urban, p_highway)
  on conflict (model_id, name, year_from) do nothing;
end;
$$;

do $$
begin
  -- ----------------------------------------------------------- carros ------
  perform seed_vehicle('Chevrolet','Onix','car','1.0 LT',2020,'1.0','gasoline',12500,15400);
  perform seed_vehicle('Chevrolet','Onix','car','1.0 Turbo',2021,'1.0 T','gasoline',11800,14900);
  perform seed_vehicle('Chevrolet','Onix Plus','car','1.0 Turbo LT',2021,'1.0 T','gasoline',11600,14700);
  perform seed_vehicle('Chevrolet','Prisma','car','1.4 LT',2018,'1.4','gasoline',10900,13600);
  perform seed_vehicle('Chevrolet','Spin','car','1.8 LT',2019,'1.8','gasoline',9200,11800);
  perform seed_vehicle('Chevrolet','Cobalt','car','1.8 LTZ',2019,'1.8','gasoline',9500,12200);

  perform seed_vehicle('Fiat','Argo','car','1.0 Drive',2020,'1.0','gasoline',12200,14800);
  perform seed_vehicle('Fiat','Cronos','car','1.3 Drive',2021,'1.3','gasoline',11400,14100);
  perform seed_vehicle('Fiat','Mobi','car','1.0 Like',2021,'1.0','gasoline',12800,15300);
  perform seed_vehicle('Fiat','Uno','car','1.0 Attractive',2018,'1.0','gasoline',12100,14600);
  perform seed_vehicle('Fiat','Siena','car','1.4 EL',2016,'1.4','gasoline',10500,13400);
  perform seed_vehicle('Fiat','Grand Siena','car','1.4 Attractive',2019,'1.4','gasoline',10700,13500);
  perform seed_vehicle('Fiat','Strada','car','1.4 Endurance',2021,'1.4','gasoline',9800,12600);

  perform seed_vehicle('Volkswagen','Gol','car','1.0 MPI',2019,'1.0','gasoline',11900,14500);
  perform seed_vehicle('Volkswagen','Voyage','car','1.6 MSI',2019,'1.6','gasoline',10300,13300);
  perform seed_vehicle('Volkswagen','Polo','car','1.0 MPI',2021,'1.0','gasoline',11700,14400);
  perform seed_vehicle('Volkswagen','Virtus','car','1.0 TSI',2021,'1.0 T','gasoline',11500,14900);
  perform seed_vehicle('Volkswagen','Saveiro','car','1.6 Robust',2020,'1.6','gasoline',9600,12500);

  perform seed_vehicle('Hyundai','HB20','car','1.0 Vision',2021,'1.0','gasoline',12300,14900);
  perform seed_vehicle('Hyundai','HB20S','car','1.0 Vision',2021,'1.0','gasoline',12100,14800);
  perform seed_vehicle('Hyundai','Creta','car','1.6 Attitude',2021,'1.6','gasoline',9700,12400);

  perform seed_vehicle('Renault','Kwid','car','1.0 Zen',2021,'1.0','gasoline',13200,15600);
  perform seed_vehicle('Renault','Sandero','car','1.0 Life',2020,'1.0','gasoline',11800,14300);
  perform seed_vehicle('Renault','Logan','car','1.0 Life',2020,'1.0','gasoline',11600,14200);
  perform seed_vehicle('Renault','Duster','car','1.6 Dynamique',2020,'1.6','gasoline',9300,11900);

  perform seed_vehicle('Toyota','Etios','car','1.5 XS',2019,'1.5','gasoline',11200,14000);
  perform seed_vehicle('Toyota','Yaris','car','1.5 XL',2021,'1.5','gasoline',11400,14200);
  perform seed_vehicle('Toyota','Corolla','car','2.0 XEi',2021,'2.0','gasoline',10100,13800);
  perform seed_vehicle('Toyota','Corolla','car','1.8 Hybrid',2021,'1.8 H','gasoline',17600,16400);

  perform seed_vehicle('Honda','Civic','car','2.0 EXL',2020,'2.0','gasoline',10300,13900);
  perform seed_vehicle('Honda','City','car','1.5 EX',2020,'1.5','gasoline',11000,13700);
  perform seed_vehicle('Honda','Fit','car','1.5 LX',2019,'1.5','gasoline',11300,13800);
  perform seed_vehicle('Honda','HR-V','car','1.8 EX',2020,'1.8','gasoline',9800,12700);

  perform seed_vehicle('Nissan','March','car','1.0 S',2019,'1.0','gasoline',11900,14400);
  perform seed_vehicle('Nissan','Versa','car','1.6 SV',2021,'1.6','gasoline',10600,13600);
  perform seed_vehicle('Nissan','Kicks','car','1.6 S',2021,'1.6','gasoline',10200,13100);

  perform seed_vehicle('Ford','Ka','car','1.0 SE',2019,'1.0','gasoline',12000,14600);
  perform seed_vehicle('Ford','Ka Sedan','car','1.5 SE',2019,'1.5','gasoline',10800,13500);

  perform seed_vehicle('Peugeot','208','car','1.6 Allure',2019,'1.6','gasoline',10400,13200);
  perform seed_vehicle('Citroën','C3','car','1.2 Live',2021,'1.2','gasoline',11500,14100);

  -- ------------------------------------------------------------ motos ------
  perform seed_vehicle('Honda','CG 160','motorcycle','Fan',2021,'160','gasoline',40000,45000);
  perform seed_vehicle('Honda','CG 160','motorcycle','Titan',2021,'160','gasoline',39000,44000);
  perform seed_vehicle('Honda','CG 160','motorcycle','Start',2021,'160','gasoline',41000,46000);
  perform seed_vehicle('Honda','Biz 125','motorcycle','ES',2021,'125','gasoline',45000,48000);
  perform seed_vehicle('Honda','Pop 110i','motorcycle','Pop',2021,'110','gasoline',50000,52000);
  perform seed_vehicle('Honda','CB 300F','motorcycle','Twister',2022,'300','gasoline',30000,34000);
  perform seed_vehicle('Honda','XRE 190','motorcycle','ABS',2021,'190','gasoline',34000,38000);
  perform seed_vehicle('Honda','PCX 150','motorcycle','DLX',2021,'150','gasoline',38000,40000);

  perform seed_vehicle('Yamaha','Factor 150','motorcycle','ED',2021,'150','gasoline',40000,44000);
  perform seed_vehicle('Yamaha','Fazer 250','motorcycle','ABS',2021,'250','gasoline',30000,34000);
  perform seed_vehicle('Yamaha','NMax 160','motorcycle','ABS',2021,'160','gasoline',37000,39000);
  perform seed_vehicle('Yamaha','Crosser 150','motorcycle','S',2021,'150','gasoline',36000,40000);
  perform seed_vehicle('Yamaha','YBR 150','motorcycle','Factor',2019,'150','gasoline',41000,45000);

  perform seed_vehicle('Shineray','Jet 50','motorcycle','Jet',2021,'50','gasoline',55000,57000);
  perform seed_vehicle('Haojue','DK 150','motorcycle','DK',2021,'150','gasoline',38000,42000);

  -- ------------------------------------------------------- elétricos -------
  -- Consumo elétrico não se mede em km/l. Fica null até existir um campo
  -- próprio para kWh/100 km, e a interface simplesmente não mostra o número.
  perform seed_vehicle('BYD','Dolphin','electric','Mini',2023,'EV','electric',null,null);
  perform seed_vehicle('Renault','Kwid E-Tech','electric','Zen',2023,'EV','electric',null,null);
  perform seed_vehicle('JAC','E-JS1','electric','E-JS1',2022,'EV','electric',null,null);
end;
$$;


-- ==========================================================================
-- 20260818000900_storage.sql
-- ==========================================================================

-- ============================================================================
-- Buckets de arquivos e suas políticas.
--
-- Regra central: cada usuário só enxerga e grava dentro da própria pasta, e o
-- caminho sempre começa com o id dele. Isso é verificado pelo banco, não pelo
-- aplicativo (§118).
-- ============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  -- Fotos de perfil são públicas para leitura: aparecem no app e no Admin, e
  -- URLs assinadas para cada avatar seriam caras sem ganho real de privacidade.
  ('avatars', 'avatars', true, 2097152,
   array['image/jpeg','image/png','image/webp']),
  -- Anexos de suporte são privados e lidos por URL assinada.
  ('support-attachments', 'support-attachments', false, 5242880,
   array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do nothing;

-- ------------------------------------------------------------- avatars -----
create policy "avatar leitura pública"
  on storage.objects for select
  using (bucket_id = 'avatars');

-- `foldername(name)[1]` é a primeira pasta do caminho: o id do usuário.
create policy "avatar upload próprio"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar troca própria"
  on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatar remoção própria"
  on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- --------------------------------------------- anexos do suporte -----------
create policy "anexo leitura do dono ou da equipe"
  on storage.objects for select
  using (
    bucket_id = 'support-attachments'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or is_admin()
    )
  );

create policy "anexo upload próprio"
  on storage.objects for insert
  with check (
    bucket_id = 'support-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );


-- ==========================================================================
-- 20260818001000_benchmark.sql
-- ==========================================================================

-- ============================================================================
-- Benchmark anônimo (§44).
--
-- Duas regras que não se negociam:
--   1. um grupo com menos que o mínimo de usuários não produz NADA — nem um
--      número aproximado, nem um aviso com valor. Nada.
--   2. só saem daqui medianas e o tamanho da amostra. Nenhuma linha de outro
--      usuário é visível para ninguém.
--
-- Só entram no cálculo usuários que optaram por participar
-- (`user_preferences.benchmark_opt_in`).
-- ============================================================================

-- Uma linha por usuário nos últimos 90 dias. É a base do agregado e NUNCA é
-- exposta diretamente: só a view agregada abaixo tem política de leitura.
create or replace view benchmark_user_metrics as
select
  d.user_id,
  p.city,
  p.state,
  p.work_modes,
  sum(d.gross_revenue)                                         as gross_revenue,
  sum(d.net_profit)                                            as net_profit,
  sum(d.worked_seconds)                                        as worked_seconds,
  sum(d.distance)                                              as distance,
  case when sum(d.distance) > 0
       then round(sum(d.gross_revenue)::numeric / sum(d.distance) * 1000)
  end                                                          as revenue_per_km,
  case when sum(d.worked_seconds) > 0
       then round(sum(d.net_profit)::numeric / sum(d.worked_seconds) * 3600)
  end                                                          as profit_per_hour
from daily_totals d
join profiles p on p.id = d.user_id
join user_preferences up on up.user_id = d.user_id
where up.benchmark_opt_in
  and not p.is_demo
  and d.date >= current_date - 90
group by d.user_id, p.city, p.state, p.work_modes
-- Um usuário com meio dia de histórico distorce a mediana sem informar nada.
having sum(d.worked_seconds) > 0;

-- Agregado por cidade e modalidade. O mínimo de amostra é lido de app_settings
-- para o Admin poder subir o valor, mas o piso de 20 é aplicado no SQL e não
-- pode ser burlado por configuração (§44).
create or replace function benchmark_min_sample()
returns integer
language sql
stable
as $$
  select greatest(
    20,
    coalesce((select (value #>> '{}')::integer from app_settings where key = 'benchmark_min_sample'), 20)
  );
$$;

create or replace view benchmark_buckets
with (security_invoker = true) as
select
  city,
  state,
  work_mode,
  count(*)::integer                                                     as sample_size,
  percentile_cont(0.5) within group (order by revenue_per_km)::bigint   as median_revenue_per_km,
  percentile_cont(0.5) within group (order by profit_per_hour)::bigint  as median_profit_per_hour
from (
  select m.*, unnest(coalesce(nullif(m.work_modes, '{}'), array['rideshare'::work_mode])) as work_mode
  from benchmark_user_metrics m
) expanded
group by city, state, work_mode
having count(*) >= benchmark_min_sample();

-- Agregado nacional por modalidade, para quando a cidade não tiver amostra.
create or replace view benchmark_national
with (security_invoker = true) as
select
  work_mode,
  count(*)::integer                                                     as sample_size,
  percentile_cont(0.5) within group (order by revenue_per_km)::bigint   as median_revenue_per_km,
  percentile_cont(0.5) within group (order by profit_per_hour)::bigint  as median_profit_per_hour
from (
  select m.*, unnest(coalesce(nullif(m.work_modes, '{}'), array['rideshare'::work_mode])) as work_mode
  from benchmark_user_metrics m
) expanded
group by work_mode
having count(*) >= benchmark_min_sample();

-- As views agregadas são legíveis por qualquer usuário autenticado; a view por
-- usuário não recebe grant nenhum e continua inacessível pelo cliente.
grant select on benchmark_buckets, benchmark_national to authenticated;


-- ==========================================================================
-- 20260818001100_notifications_engine.sql
-- ==========================================================================

-- ============================================================================
-- Motor de notificações (§58, §99, §100).
--
-- Duas peças:
--   1. `send_notification` — cria notificações para um público segmentado,
--      respeitando a preferência de cada usuário por categoria;
--   2. `process_reminders` — transforma lembretes vencidos (Free Flow, multas,
--      manutenção) em notificações. Roda por agendamento.
-- ============================================================================

-- Público-alvo de um envio (§100). Todos os filtros são opcionais e se somam.
create type notification_audience as (
  user_ids   uuid[],
  cities     text[],
  states     text[],
  work_modes work_mode[],
  plans      plan_code[],
  -- Ativos nos últimos N dias; null ignora o filtro.
  active_within_days integer,
  inactive_for_days  integer
);

/**
 * Resolve o público em ids de usuário. Separado do envio para o Admin poder
 * mostrar "isto vai para 1.243 pessoas" antes de mandar.
 */
create or replace function resolve_audience(p_audience notification_audience)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from profiles p
  left join current_plans cp on cp.user_id = p.id
  where p.blocked_at is null
    and not p.is_demo
    and (p_audience.user_ids   is null or p.id = any(p_audience.user_ids))
    and (p_audience.cities     is null or p.city = any(p_audience.cities))
    and (p_audience.states     is null or p.state = any(p_audience.states))
    and (p_audience.work_modes is null or p.work_modes && p_audience.work_modes)
    and (p_audience.plans      is null or cp.plan = any(p_audience.plans))
    and (p_audience.active_within_days is null
         or p.last_seen_at >= now() - make_interval(days => p_audience.active_within_days))
    and (p_audience.inactive_for_days is null
         or p.last_seen_at is null
         or p.last_seen_at < now() - make_interval(days => p_audience.inactive_for_days));
$$;

/**
 * Cria as notificações. Quem desativou a categoria não recebe — a preferência
 * do usuário é verificada aqui, não na tela que dispara (§58).
 *
 * Retorna quantas foram efetivamente criadas.
 */
create or replace function send_notification(
  p_audience  notification_audience,
  p_category  notification_category,
  p_title     text,
  p_body      text,
  p_deep_link text default null,
  p_cta_label text default null,
  p_image_path text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with recipients as (
    select u.id as user_id
    from resolve_audience(p_audience) u(id)
    left join notification_preferences np
      on np.user_id = u.id and np.category = p_category
    -- Sem linha de preferência, o padrão é receber.
    where coalesce(np.in_app, true)
  ),
  inserted as (
    insert into user_notifications (user_id, category, title, body, deep_link, cta_label, image_path)
    select user_id, p_category, p_title, p_body, p_deep_link, p_cta_label, p_image_path
    from recipients
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function send_notification(notification_audience, notification_category, text, text, text, text, text) from public;
revoke all on function resolve_audience(notification_audience) from public;

/**
 * Lembretes vencidos viram notificações (§50, §51, §34).
 *
 * É idempotente: cada lembrete é limpo depois de virar notificação, então
 * rodar duas vezes no mesmo minuto não duplica nada.
 */
create or replace function process_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_count integer;
begin
  -- Free Flow
  with due as (
    select id, user_id, operator from free_flow_records
    where remind_at is not null and remind_at <= now() and status <> 'paid'
    for update skip locked
  ),
  sent as (
    insert into user_notifications (user_id, category, title, body, deep_link)
    select user_id, 'free_flow', 'Passagem de Free Flow',
           'Você registrou uma passagem em ' || operator || '. Já conferiu o pagamento?',
           '/costs/free-flow'
    from due
    returning 1
  ),
  cleared as (
    update free_flow_records set remind_at = null
    where id in (select id from due)
    returning 1
  )
  select count(*)::integer into v_count from sent;
  v_total := v_total + v_count;

  -- Multas: avisamos antes de o desconto acabar, que é o prazo que importa.
  with due as (
    select id, user_id, description, discount_deadline from fines
    where status = 'pending'
      and discount_deadline is not null
      and discount_deadline <= current_date + 3
      and remind_at is null
    for update skip locked
  ),
  sent as (
    insert into user_notifications (user_id, category, title, body, deep_link)
    select user_id, 'fines', 'Prazo de desconto acabando',
           'A multa "' || description || '" tem desconto até ' ||
           to_char(discount_deadline, 'DD/MM') || '.',
           '/costs/fines'
    from due
    returning 1
  ),
  marked as (
    update fines set remind_at = now()
    where id in (select id from due)
    returning 1
  )
  select count(*)::integer into v_count from sent;
  v_total := v_total + v_count;

  -- Manutenção por data
  with due as (
    select m.id, m.user_id, coalesce(t.name, 'Manutenção') as type_name, m.next_due_date
    from maintenance_logs m
    left join maintenance_types t on t.id = m.type_id
    where m.next_due_date is not null and m.next_due_date <= current_date + 7
    -- `for update of m` trava só maintenance_logs: o Postgres recusa travar o
    -- lado anulável de um LEFT JOIN.
    for update of m skip locked
  ),
  sent as (
    insert into user_notifications (user_id, category, title, body, deep_link)
    select user_id, 'maintenance', 'Manutenção chegando',
           type_name || ' prevista para ' || to_char(next_due_date, 'DD/MM') || '.',
           '/costs/maintenance'
    from due
    returning 1
  ),
  cleared as (
    update maintenance_logs set next_due_date = null
    where id in (select id from due)
    returning 1
  )
  select count(*)::integer into v_count from sent;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

revoke all on function process_reminders() from public;


-- ==========================================================================
-- 20260818001200_analytics_views.sql
-- ==========================================================================

-- ============================================================================
-- Camada analítica (§87–96, §106).
--
-- Consultas de relatório NUNCA batem direto nas tabelas operacionais quentes.
-- Estas views são a superfície que o Admin consulta; quando o volume exigir,
-- viram materialized views atualizadas por agendamento, sem mudar a consulta
-- de quem chama.
--
-- Todas excluem contas de demonstração.
-- ============================================================================

-- Uma linha por usuário com tudo que os relatórios cruzam (§93, §94).
-- É a tabela-fato da camada analítica.
create or replace view analytics_users as
select
  p.id                                   as user_id,
  p.city,
  p.state,
  p.gender,
  case
    when p.birth_date is null then null
    when extract(year from age(p.birth_date)) < 25 then '18-24'
    when extract(year from age(p.birth_date)) < 35 then '25-34'
    when extract(year from age(p.birth_date)) < 45 then '35-44'
    when extract(year from age(p.birth_date)) < 55 then '45-54'
    else '55+'
  end                                    as age_band,
  p.work_modes,
  p.created_at,
  p.last_seen_at,
  p.blocked_at is not null               as is_blocked,
  coalesce(cp.plan, 'free')              as plan,
  cp.source                              as plan_source,
  coalesce(cp.is_trial, false)           as is_trial,
  -- Origem de aquisição (§91, §96). Sem atribuição, o cadastro é orgânico.
  coalesce(ua.source, 'organic')         as acquisition_source,
  ua.campaign                            as acquisition_campaign,
  ua.influencer_id,
  ua.code_id,
  pc.code                                as acquisition_code,
  v.label                                as vehicle_label,
  v.vehicle_type,
  v.fuel_type,
  v.ownership,
  v.model_year
from profiles p
left join current_plans cp on cp.user_id = p.id
left join user_attribution ua on ua.user_id = p.id
left join promotion_codes pc on pc.id = ua.code_id
left join lateral (
  select
    -- `concat_ws` com todos os campos nulos devolve string VAZIA, não null,
    -- então sem o nullif o coalesce nunca cairia para custom_label e veículos
    -- fora do catálogo apareceriam em branco nos relatórios.
    coalesce(
      nullif(trim(concat_ws(' ', mk.name, md.name, vv.name)), ''),
      uv.custom_label
    )                     as label,
    uv.vehicle_type,
    uv.fuel_type,
    uv.ownership,
    uv.model_year
  from user_vehicles uv
  left join vehicle_versions vv on vv.id = uv.version_id
  left join vehicle_models md on md.id = vv.model_id
  left join vehicle_makes mk on mk.id = md.make_id
  where uv.user_id = p.id and uv.archived_at is null
  order by uv.is_primary desc
  limit 1
) v on true
where not p.is_demo;

-- Números financeiros por usuário, prontos para média e mediana (§92).
create or replace view analytics_user_financials as
select
  d.user_id,
  min(d.date)                                                     as first_day,
  max(d.date)                                                     as last_day,
  count(*)::integer                                               as active_days,
  sum(d.gross_revenue)                                            as gross_revenue,
  sum(d.total_expenses)                                           as total_expenses,
  sum(d.net_profit)                                               as net_profit,
  sum(d.worked_seconds)                                           as worked_seconds,
  sum(d.distance)                                                 as distance,
  sum(d.trip_count)                                               as trip_count,
  case when sum(d.worked_seconds) > 0
       then round(sum(d.gross_revenue)::numeric / sum(d.worked_seconds) * 3600) end as revenue_per_hour,
  case when sum(d.worked_seconds) > 0
       then round(sum(d.net_profit)::numeric / sum(d.worked_seconds) * 3600) end    as profit_per_hour,
  case when sum(d.distance) > 0
       then round(sum(d.gross_revenue)::numeric / sum(d.distance) * 1000) end       as revenue_per_km,
  case when sum(d.distance) > 0
       then round(sum(d.total_expenses)::numeric / sum(d.distance) * 1000) end      as cost_per_km
from daily_totals d
join analytics_users u on u.user_id = d.user_id
group by d.user_id;

-- Aquisição por origem (§90, §96): quantidade E qualidade.
create or replace view analytics_acquisition as
select
  u.acquisition_source                                          as source,
  u.acquisition_campaign                                        as campaign,
  u.acquisition_code                                            as code,
  u.influencer_id,
  count(*)::integer                                             as signups,
  count(*) filter (where u.plan = 'pro' and not u.is_trial)::integer as pro_users,
  count(*) filter (where u.is_trial)::integer                   as trial_users,
  count(*) filter (where u.last_seen_at >= now() - interval '30 days')::integer as active_30d,
  -- Conversão é o que separa volume de qualidade; sem ela um influenciador com
  -- 1.000 cadastros parece melhor que um com 100 que assinam.
  case when count(*) > 0
       then round(count(*) filter (where u.plan = 'pro' and not u.is_trial)::numeric
                  / count(*) * 100, 1) end                       as conversion_rate,
  case when count(*) > 0
       then round(count(*) filter (where u.last_seen_at >= now() - interval '30 days')::numeric
                  / count(*) * 100, 1) end                       as retention_30d
from analytics_users u
group by u.acquisition_source, u.acquisition_campaign, u.acquisition_code, u.influencer_id;

-- Desempenho por influenciador (§97).
create or replace view analytics_influencers as
select
  i.id                                                          as influencer_id,
  i.display_name,
  i.status,
  pc.code,
  pc.use_count,
  count(u.user_id)::integer                                     as signups,
  count(u.user_id) filter (where u.plan = 'pro' and not u.is_trial)::integer as pro_users,
  case when count(u.user_id) > 0
       then round(count(u.user_id) filter (where u.plan = 'pro' and not u.is_trial)::numeric
                  / count(u.user_id) * 100, 1) end               as conversion_rate,
  count(u.user_id) filter (where u.last_seen_at >= now() - interval '30 days')::integer as active_30d
from influencers i
left join promotion_codes pc on pc.influencer_id = i.id
left join analytics_users u on u.influencer_id = i.id
group by i.id, i.display_name, i.status, pc.code, pc.use_count;

-- Desempenho por plataforma (§91).
create or replace view analytics_platforms as
select
  pl.name                                                        as platform,
  count(distinct r.user_id)::integer                             as users,
  sum(r.amount + r.tips)                                         as gross_revenue,
  sum(r.trip_count)                                              as trips,
  case when sum(r.trip_count) > 0
       then round(sum(r.amount + r.tips)::numeric / sum(r.trip_count)) end as average_ticket
from revenues r
join platforms pl on pl.id = r.platform_id
join analytics_users u on u.user_id = r.user_id
group by pl.name;

-- Desempenho por veículo (§90).
create or replace view analytics_vehicles as
select
  u.vehicle_label,
  u.vehicle_type,
  u.fuel_type,
  u.ownership,
  count(*)::integer                                              as users,
  round(avg(u.model_year))                                       as average_year,
  round(avg(f.revenue_per_km))                                   as average_revenue_per_km,
  round(avg(f.cost_per_km))                                      as average_cost_per_km
from analytics_users u
left join analytics_user_financials f on f.user_id = u.user_id
where u.vehicle_label is not null
group by u.vehicle_label, u.vehicle_type, u.fuel_type, u.ownership;

-- Métricas de suporte (§92).
create or replace view analytics_support as
select
  count(*)::integer                                                       as total_tickets,
  count(*) filter (where t.status not in ('resolved','closed'))::integer  as open_tickets,
  count(*) filter (where t.status = 'resolved')::integer                  as resolved_tickets,
  count(*) filter (where t.status in ('new','awaiting_agent','in_progress'))::integer as unanswered,
  -- Tickets sem resposta ficam FORA da média, não entram como zero (§92).
  round(avg(extract(epoch from (t.first_agent_reply_at - t.created_at)))
        filter (where t.first_agent_reply_at is not null))                  as avg_first_response_seconds,
  round(avg(extract(epoch from (t.resolved_at - t.created_at)))
        filter (where t.resolved_at is not null))                           as avg_resolution_seconds
from support_tickets t
join analytics_users u on u.user_id = t.user_id;

create or replace view analytics_support_categories as
select
  coalesce(sc.name, 'Sem categoria')                             as category,
  count(*)::integer                                              as tickets,
  count(*) filter (where t.status in ('resolved','closed'))::integer as resolved
from support_tickets t
left join support_categories sc on sc.id = t.category_id
join analytics_users u on u.user_id = t.user_id
group by sc.name;

grant select on
  analytics_users, analytics_user_financials, analytics_acquisition,
  analytics_influencers, analytics_platforms, analytics_vehicles,
  analytics_support, analytics_support_categories
to authenticated;


-- ==========================================================================
-- 20260818001300_vehicle_import.sql
-- ==========================================================================

-- ============================================================================
-- Importação de veículos pelo Admin (§101).
--
-- `seed_vehicle` recebe enums, mas o PostgREST manda tudo como texto JSON e a
-- resolução de sobrecarga não é confiável nesse caminho. Esta função aceita
-- texto e valida a conversão, devolvendo um erro legível em vez de estourar.
-- ============================================================================

create or replace function import_vehicle(
  p_make    text,
  p_model   text,
  p_type    text default 'car',
  p_version text default null,
  p_year_from integer default null,
  p_engine  text default null,
  p_fuel    text default null,
  p_urban   integer default null,
  p_highway integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type vehicle_type;
  v_fuel fuel_type;
begin
  if coalesce(trim(p_make), '') = '' or coalesce(trim(p_model), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'marca e modelo são obrigatórios');
  end if;

  begin
    v_type := coalesce(nullif(trim(p_type), ''), 'car')::vehicle_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', format('tipo inválido: %s', p_type));
  end;

  begin
    v_fuel := nullif(trim(p_fuel), '')::fuel_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', format('combustível inválido: %s', p_fuel));
  end;

  -- Consumo zero não existe; a constraint rejeitaria, então tratamos antes.
  if coalesce(p_urban, 1) <= 0 or coalesce(p_highway, 1) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'consumo precisa ser maior que zero');
  end if;

  perform seed_vehicle(
    trim(p_make), trim(p_model), v_type, nullif(trim(p_version), ''),
    p_year_from, nullif(trim(p_engine), ''), v_fuel, p_urban, p_highway
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function import_vehicle(text, text, text, text, integer, text, text, integer, integer) from public;
grant execute on function import_vehicle(text, text, text, text, integer, text, text, integer, integer) to service_role;

-- As funções criadas depois do grant amplo precisam do seu próprio.
grant execute on function seed_vehicle(text, text, vehicle_type, text, integer, text, fuel_type, integer, integer) to service_role;
grant execute on function send_notification(notification_audience, notification_category, text, text, text, text, text) to service_role;
grant execute on function resolve_audience(notification_audience) to service_role;
grant execute on function process_reminders() to service_role;


-- ==========================================================================
-- 20260818001400_billing.sql
-- ==========================================================================

-- ============================================================================
-- Cobrança com Stripe (§56, §57).
--
-- Princípio que vale para tudo aqui: o CLIENTE NUNCA ESCREVE ESTADO DE
-- COBRANÇA. Ele só lê. Quem concede plano é o webhook do Stripe, rodando com
-- a service role, depois de validar a assinatura da requisição.
--
-- O Stripe é a fonte da verdade sobre o que foi pago; o nosso banco guarda o
-- reflexo disso para o aplicativo não precisar consultar o Stripe a cada tela.
-- ============================================================================

create type billing_interval as enum ('month', 'year');

create type billing_status as enum (
  'incomplete',        -- checkout iniciado, pagamento não confirmado
  'trialing',
  'active',
  'past_due',          -- cobrança falhou, ainda em período de tentativa
  'canceled',
  'unpaid'
);

-- ------------------------------------------------------- catálogo de preços --
-- Os preços vivem aqui e não no código: mudar valor é decisão comercial e não
-- deve exigir novo build do aplicativo nem da loja.
create table billing_prices (
  id               uuid primary key default gen_random_uuid(),
  plan             plan_code not null default 'pro',
  interval         billing_interval not null,
  -- Centavos. R$ 19,90 = 1990.
  amount           bigint not null check (amount > 0),
  currency         char(3) not null default 'BRL',
  -- Id do preço no Stripe (price_...). Null enquanto não foi criado lá.
  stripe_price_id  text unique,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Um preço ativo por combinação de plano e periodicidade.
create unique index billing_prices_active_idx
  on billing_prices (plan, interval) where is_active;

create trigger billing_prices_updated_at before update on billing_prices
  for each row execute function set_updated_at();

insert into billing_prices (plan, interval, amount) values
  ('pro', 'month', 1990),
  ('pro', 'year',  4990);

-- ------------------------------------------------------------- clientes -----
-- O id de cliente no Stripe fica fora de `profiles` porque é dado de cobrança,
-- não de perfil: assim o RLS de perfil não precisa protegê-lo caso a caso.
create table billing_customers (
  user_id            uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------- assinaturas -----
-- `subscriptions` já existia para concessões manuais (cortesia, trial). Aqui
-- ela ganha o vínculo com o Stripe, sem virar uma segunda tabela paralela —
-- a resolução de plano efetivo continua sendo uma só (§57).
alter table subscriptions
  add column stripe_subscription_id text unique,
  add column stripe_price_id        text,
  add column billing_interval       billing_interval,
  add column billing_status         billing_status,
  -- Fim do período pago. É o que decide até quando o Pro vale.
  add column current_period_end     timestamptz,
  -- Cancelamento agendado: o usuário cancelou mas o período já pago continua.
  add column cancel_at_period_end   boolean not null default false;

create index subscriptions_stripe_idx on subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ------------------------------------------------------------- eventos ------
-- O Stripe reenvia webhooks. Sem registro de idempotência, um reenvio de
-- `invoice.paid` concederia o plano duas vezes e um `subscription.deleted`
-- fora de ordem poderia revogar um plano já renovado.
create table billing_events (
  stripe_event_id text primary key,
  type            text not null,
  -- Momento em que o Stripe gerou o evento; usado para descartar eventos que
  -- chegam fora de ordem.
  event_created_at timestamptz not null,
  payload         jsonb not null,
  processed_at    timestamptz not null default now(),
  error           text
);

create index billing_events_type_idx on billing_events (type, processed_at desc);

-- ------------------------------------------------------------- segurança ----
alter table billing_prices    enable row level security;
alter table billing_customers enable row level security;
alter table billing_events    enable row level security;

-- Preços são públicos para quem está logado: a tela precisa mostrá-los.
create policy billing_prices_read on billing_prices
  for select using (auth.role() = 'authenticated');

-- O usuário vê o próprio vínculo com o Stripe; escrever, nunca.
create policy billing_customers_read_own on billing_customers
  for select using (user_id = auth.uid() or is_admin());

-- Eventos de webhook são registro interno: só administradores leem.
create policy billing_events_read_admin on billing_events
  for select using (has_admin_role(array['superadmin', 'admin']::admin_role[]));

-- O cliente só LÊ preços. Nem sequer existe grant de escrita: o Admin altera
-- preço pela service role, então dar permissão a `authenticated` seria
-- superfície sem uso — e em tabela que decide cobrança, superfície sem uso é
-- risco puro.
grant select on billing_prices, billing_customers to authenticated;
grant all on billing_prices, billing_customers, billing_events to service_role;

-- ------------------------------------------------------------- funções ------

/**
 * Aplica o resultado de um evento do Stripe.
 *
 * Concentrar a escrita numa função só evita que cada tipo de evento no webhook
 * invente sua própria forma de atualizar a assinatura — que é como estados
 * inconsistentes aparecem.
 *
 * Devolve o id da linha de assinatura afetada.
 */
create or replace function apply_subscription_state(
  p_user_id              uuid,
  p_stripe_subscription_id text,
  p_stripe_price_id      text,
  p_interval             billing_interval,
  p_status               billing_status,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into subscriptions (
    user_id, plan, source, started_at, expires_at,
    stripe_subscription_id, stripe_price_id, billing_interval, billing_status,
    current_period_end, cancel_at_period_end,
    cancelled_at
  )
  values (
    p_user_id, 'pro', 'subscription', now(),
    -- `expires_at` é o campo que a resolução de plano já usava; mantê-lo em dia
    -- significa que nada mais precisa saber que existe Stripe no meio.
    p_current_period_end,
    p_stripe_subscription_id, p_stripe_price_id, p_interval, p_status,
    p_current_period_end, p_cancel_at_period_end,
    case when p_status in ('canceled', 'unpaid') then now() end
  )
  on conflict (stripe_subscription_id) do update set
    stripe_price_id      = excluded.stripe_price_id,
    billing_interval     = excluded.billing_interval,
    billing_status       = excluded.billing_status,
    current_period_end   = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    expires_at           = excluded.expires_at,
    cancelled_at         = case
      when excluded.billing_status in ('canceled', 'unpaid') then now()
      else null
    end
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function apply_subscription_state(uuid, text, text, billing_interval, billing_status, timestamptz, boolean) from public;
grant execute on function apply_subscription_state(uuid, text, text, billing_interval, billing_status, timestamptz, boolean) to service_role;

/**
 * Consome o desconto de indicação numa cobrança (§84).
 *
 * Marca o benefício como usado e registra onde foi aplicado. Só faz efeito uma
 * vez — a condição `status = 'granted'` é a trava, e ela é atômica.
 */
create or replace function consume_discount_benefit(
  p_user_id uuid,
  p_applied_to text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_benefit discount_benefits%rowtype;
begin
  update discount_benefits
  set status = 'used', used_at = now(), applied_to = p_applied_to
  where id = (
    select id from discount_benefits
    where user_id = p_user_id
      and status = 'granted'
      and (expires_at is null or expires_at > now())
    order by created_at
    limit 1
    for update skip locked
  )
  returning * into v_benefit;

  if not found then
    return jsonb_build_object('applied', false);
  end if;

  insert into analytics_events (user_id, event, properties)
  values (p_user_id, 'referral_discount_used',
          jsonb_build_object('amount', v_benefit.amount, 'applied_to', p_applied_to));

  return jsonb_build_object('applied', true, 'amount', v_benefit.amount);
end;
$$;

revoke all on function consume_discount_benefit(uuid, text) from public;
grant execute on function consume_discount_benefit(uuid, text) to service_role;

-- Marca a indicação como convertida quando o indicado vira assinante (§87).
create or replace function mark_referral_converted(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update referrals
  set status = 'converted', converted_at = now()
  where referred_user_id = p_user_id and status <> 'converted';
$$;

revoke all on function mark_referral_converted(uuid) from public;
grant execute on function mark_referral_converted(uuid) to service_role;


-- ==========================================================================
-- 20260818001500_security_hardening.sql
-- ==========================================================================

-- ============================================================================
-- Correção de segurança encontrada pelo verificador da Supabase.
--
-- Dois furos reais, ambos invisíveis nos testes locais porque o ambiente de
-- teste não reproduzia dois comportamentos da Supabase. Estão corrigidos aqui
-- e o ambiente de teste passou a reproduzi-los (test/supabase_shim.sql).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FURO 1 — views analíticas ignoravam o Row Level Security
--
-- No Postgres 15+, uma view SEM `security_invoker` roda com as permissões de
-- quem a criou, e não de quem consulta. Como as views analíticas tinham
-- `grant select ... to authenticated`, QUALQUER motorista logado conseguia
-- ler o faturamento, o lucro, a cidade e o plano de TODOS os outros pelo
-- endpoint /rest/v1/analytics_user_financials.
--
-- Isso contradiz diretamente a regra de que um usuário comum nunca vê dado
-- individual de outro (§108).
--
-- Com `security_invoker = true` a view passa a respeitar as políticas de quem
-- consulta: o administrador continua vendo tudo (as políticas já preveem
-- `is_admin()`), e o motorista passa a ver apenas a própria linha.
-- ---------------------------------------------------------------------------

alter view analytics_users               set (security_invoker = true);
alter view analytics_user_financials     set (security_invoker = true);
alter view analytics_acquisition         set (security_invoker = true);
alter view analytics_influencers         set (security_invoker = true);
alter view analytics_platforms           set (security_invoker = true);
alter view analytics_vehicles            set (security_invoker = true);
alter view analytics_support             set (security_invoker = true);
alter view analytics_support_categories  set (security_invoker = true);

-- `benchmark_user_metrics` é a exceção deliberada: ela PRECISA enxergar todos
-- os usuários, porque calcular uma mediana sobre uma única pessoa não é
-- mediana. A proteção aqui não é o RLS — é o fato de ninguém poder lê-la.
-- Só as views agregadas derivadas dela são legíveis, e elas nunca devolvem
-- linha de usuário, apenas mediana e tamanho de amostra com mínimo de 20 (§44).
revoke all on benchmark_user_metrics from anon, authenticated;

-- Consequência que só apareceu ao testar: com a view de base bloqueada, as
-- views agregadas precisam rodar com as permissões do dono para continuarem
-- enxergando todos os usuários. Sem isso o benchmark quebra com
-- "permission denied for view benchmark_user_metrics".
--
-- A proteção do benchmark nunca foi o RLS: é o fato de a view de base não ter
-- grant nenhum, de as agregadas devolverem só mediana e tamanho de amostra, e
-- do mínimo de 20 usuários por grupo (§44).
alter view benchmark_buckets  set (security_invoker = false);
alter view benchmark_national set (security_invoker = false);

-- ---------------------------------------------------------------------------
-- FURO 2 — funções de servidor eram chamáveis por qualquer um
--
-- A Supabase concede EXECUTE em novas funções para `anon` e `authenticated`
-- por padrão (alter default privileges). O `revoke ... from public` que as
-- migrations faziam NÃO remove uma concessão feita diretamente a esses papéis.
--
-- Resultado: `apply_subscription_state` estava acessível sem login em
-- /rest/v1/rpc/apply_subscription_state — qualquer pessoa na internet podia
-- conceder Pro vitalício a si mesma. `consume_discount_benefit` permitia
-- queimar o desconto de outro usuário, e `send_notification` permitia disparar
-- notificação para toda a base.
--
-- A revogação agora nomeia os papéis explicitamente.
--
-- E há uma SEGUNDA porta, encontrada pelo teste depois da primeira correção:
-- o próprio Postgres concede EXECUTE ao pseudo-papel PUBLIC em toda função
-- nova. `anon` herda de PUBLIC. Ou seja, revogar de `anon` e `authenticated`
-- não bastava — a função continuava chamável sem login pela herança. Por isso
-- todo `revoke` abaixo nomeia `public` junto com os dois papéis.
-- ---------------------------------------------------------------------------

-- Somente o servidor (service_role) executa estas.
revoke execute on function apply_subscription_state(uuid, text, text, billing_interval, billing_status, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function consume_discount_benefit(uuid, text) from public, anon, authenticated;
revoke execute on function mark_referral_converted(uuid) from public, anon, authenticated;
revoke execute on function send_notification(notification_audience, notification_category, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function resolve_audience(notification_audience) from public, anon, authenticated;
revoke execute on function process_reminders() from public, anon, authenticated;
revoke execute on function import_vehicle(text, text, text, text, integer, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function seed_vehicle(text, text, vehicle_type, text, integer, text, fuel_type, integer, integer) from public, anon, authenticated;

-- Funções de gatilho: são executadas pelo próprio gatilho, nunca por chamada
-- direta. Chamá-las pela API não faria nada útil, mas não há motivo para a
-- porta existir.
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;
revoke execute on function support_message_touch_ticket() from public, anon, authenticated;
revoke execute on function user_attribution_is_immutable() from public, anon, authenticated;
revoke execute on function seed_notification_preferences() from public, anon, authenticated;
revoke execute on function unaccent_simple(text) from public, anon, authenticated;

-- Estas continuam abertas ao usuário logado DE PROPÓSITO, e só a ele:
--   redeem_code      — resgatar um código é ação do próprio usuário; todas as
--                      regras antifraude rodam dentro dela
--   mark_ticket_read — marcar o próprio atendimento como lido
revoke execute on function redeem_code(text) from public, anon;
revoke execute on function mark_ticket_read(uuid) from public, anon;
grant execute on function redeem_code(text) to authenticated;
grant execute on function mark_ticket_read(uuid) to authenticated;

-- `handle_new_user` é disparada pelo gatilho em auth.users, que roda sob o
-- papel do serviço de autenticação da Supabase. O Postgres não checa EXECUTE
-- na hora de disparar um gatilho (a checagem acontece ao criar o gatilho), mas
-- quebrar o cadastro seria caro demais para se apoiar só nisso: o grant
-- explícito abaixo mantém o cadastro funcionando de qualquer forma.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function handle_new_user() to supabase_auth_admin';
  end if;
end
$$;

-- `is_admin`, `has_admin_role` e `benchmark_min_sample` NÃO são revogadas:
-- elas são chamadas de dentro das políticas de RLS e das views. Sem permissão
-- de execução, toda política que as usa passaria a falhar. Além disso, elas
-- respondem apenas sobre quem está perguntando ou sobre uma configuração
-- pública — não expõem nada.

-- ---------------------------------------------------------------------------
-- Endurecimento adicional: search_path fixo
--
-- Sem `search_path` fixo, uma função SECURITY DEFINER pode ser induzida a
-- chamar um objeto plantado em outro schema. Nenhuma destas é explorável hoje,
-- mas fixar o caminho é gratuito.
-- ---------------------------------------------------------------------------

alter function set_updated_at()                set search_path = public;
alter function support_message_touch_ticket()  set search_path = public;
alter function user_attribution_is_immutable() set search_path = public;
alter function unaccent_simple(text)           set search_path = public;
alter function seed_notification_preferences() set search_path = public;
alter function seed_vehicle(text, text, vehicle_type, text, integer, text, fuel_type, integer, integer) set search_path = public;
alter function benchmark_min_sample()          set search_path = public;


-- ==========================================================================
-- 20260818001600_extensions_schema.sql
-- ==========================================================================

-- ============================================================================
-- Correção: o cadastro quebrava porque as extensões não moram em `public`.
--
-- Erro real, no primeiro cadastro do projeto em produção:
--
--   function gen_random_bytes(integer) does not exist
--   CONTEXT: PL/pgSQL function handle_new_user() line 26
--
-- Numa Supabase, `pgcrypto` e `citext` já vêm instaladas no schema
-- `extensions`, não em `public`. O `create extension if not exists` das nossas
-- migrations, portanto, não faz nada — a extensão já existe, em outro lugar.
--
-- Isso sozinho não seria problema: a busca padrão da Supabase inclui
-- `extensions`. O problema é que toda função nossa fixa `set search_path =
-- public`, justamente para não poder ser enganada por um objeto plantado em
-- outro schema. Com o caminho preso em `public`, `gen_random_bytes` some.
--
-- E o cadastro é o pior lugar possível para isso acontecer: a função roda
-- dentro do gatilho de criação de conta, então a conta inteira falha e o
-- aplicativo devolve um erro genérico. Ninguém conseguia se cadastrar.
--
-- O teste local não pegou porque instalava as extensões em `public` — mais uma
-- diferença entre o ambiente de teste e a Supabase real. O shim foi corrigido
-- junto com esta migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Parte 1 — o cadastro deixa de depender de extensão nenhuma
--
-- O sufixo do código de indicação são dois caracteres aleatórios. Não precisa
-- de aleatoriedade criptográfica, e não vale a pena que o caminho mais crítico
-- do produto inteiro dependa de onde uma extensão foi instalada. `md5`,
-- `random` e `clock_timestamp` são do próprio Postgres e existem sempre.
--
-- O `translate` continua trocando caracteres ambíguos: o md5 devolve 0-9a-f, e
-- o `0` e o `1` viram `G` e `H` para ninguém confundir com `O` e `I` ao ditar
-- o código por telefone.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_first_name text;
  v_code       text;
  v_suffix     text;
  v_attempt    integer := 0;
begin
  v_first_name := coalesce(
    nullif(trim(split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1)), ''),
    split_part(new.email, '@', 1)
  );

  insert into profiles (id, first_name, email)
  values (new.id, left(v_first_name, 60), new.email);

  insert into user_preferences (user_id) values (new.id);

  -- Every new user gets 7 days of Pro (§57).
  insert into subscriptions (user_id, plan, source, started_at, expires_at)
  values (new.id, 'pro', 'trial', now(), now() + interval '7 days');

  -- Personal referral code, e.g. ARTHUR26. Retries on collision; the unique
  -- index is the real guarantee, this loop just avoids surfacing the error.
  loop
    v_attempt := v_attempt + 1;
    v_suffix := upper(substr(
      translate(md5(random()::text || clock_timestamp()::text), '01', 'GH'), 1, 2));
    v_code := upper(regexp_replace(unaccent_simple(v_first_name), '[^A-Za-z]', '', 'g'));
    v_code := case when length(v_code) >= 3 then left(v_code, 8) else 'DRIVER' end || v_suffix;

    begin
      insert into promotion_codes (code, kind, owner_user_id, benefit_amount)
      values (v_code, 'referral', new.id,
              coalesce((select (value #>> '{}')::bigint from app_settings
                        where key = 'referral_discount_amount'), 1000));
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Parte 2 — toda função passa a enxergar o schema `extensions`
--
-- `gen_random_bytes` era só o primeiro a estourar. A mesma armadilha existe
-- para o tipo `citext`, usado em `profiles.email`: o operador de comparação
-- entre dois citext também é procurado pelo search_path, então qualquer
-- consulta por e-mail dentro de uma função quebraria do mesmo jeito, mais
-- tarde e mais difícil de achar.
--
-- Percorrer o catálogo em vez de listar nome por nome é de propósito: uma
-- função criada amanhã com `set search_path = public` cairia na mesma armadilha
-- silenciosamente, e listar à mão é justamente o tipo de coisa que se esquece.
--
-- Continua fechado: `extensions` pertence ao dono do banco e não é gravável
-- por `anon` nem por `authenticated`, então nada pode ser plantado ali.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proconfig is not null
      and exists (
        select 1 from unnest(p.proconfig) c
        where c like 'search\_path=%' and c not like '%extensions%'
      )
  loop
    execute format('alter function %s set search_path = public, extensions', r.assinatura);
  end loop;
end
$$;


-- ==========================================================================
-- 20260821000100_journey_gps_routes.sql
-- ==========================================================================

-- ============================================================================
-- Captura de trajeto por GPS.
--
-- Até aqui a distância de uma jornada só existia se o motorista digitasse. Este
-- arquivo abre espaço para o aparelho medir sozinho — sem nunca passar por cima
-- do que a pessoa escreveu (ver §6 e `journeyDistance()`).
--
-- Uma rota é o dado mais sensível do schema: ela diz onde alguém estava, hora a
-- hora. Por isso ela é opt-in, vive numa tabela própria que o motorista pode
-- esvaziar sozinho, expira por padrão, e nunca entra no benchmark.
-- ============================================================================

-- Qual medida acabou valendo para a jornada. É registro, não regra: a ordem de
-- resolução vive em `journeyDistance()` e na view `daily_totals`, e ramificar
-- nesta coluna reintroduziria justamente a divergência que ela descreve.
create type distance_source as enum ('manual', 'odometer', 'gps');

alter table journeys
  add column distance_gps integer
    check (distance_gps is null or distance_gps > 0),
  add column route_point_count integer
    check (route_point_count is null or route_point_count >= 0),
  add column distance_source distance_source;

comment on column journeys.distance_gps is
  'Metros medidos pelo GPS. Nunca vence o que o motorista digitou (§6).';

-- ---------------------------------------------------------------------------
-- O desenho do trajeto mora numa tabela à parte, e não numa coluna em
-- `journeys`, por quatro motivos concretos:
--
--   1. Uma rota simplificada de 1000 pontos dá ~7 KB de ASCII. O Postgres faria
--      TOAST disso de qualquer jeito, então a coluna teria o custo de I/O da
--      tabela separada sem nenhum dos benefícios dela.
--   2. `select * from journeys` acontece em toda tela de histórico. Separando,
--      essa consulta nunca arrasta o desenho junto.
--   3. Apagar trajetos por LGPD vira um delete de uma tabela só, com o
--      histórico financeiro intacto.
--   4. A poda por retenção nunca encosta numa linha de dinheiro.
--
-- `distance_gps` e `route_point_count` ficam em `journeys` justamente para que
-- `daily_totals` não precise de join: aquela view é o grão de tudo que vem
-- depois.
-- ---------------------------------------------------------------------------
create table journey_routes (
  journey_id  uuid primary key references journeys(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  -- Polyline codificada do Google. O formato está em packages/utils/polyline.ts.
  polyline    text not null,
  point_count integer not null check (point_count > 0),
  precision   smallint not null default 5 check (precision between 1 and 9),
  captured_at timestamptz not null default now()
);

create index journey_routes_user_idx on journey_routes (user_id);

-- ------------------------------------------------------------------ RLS ----
-- As mesmas quatro políticas de linha própria que o loop de
-- 20260818000500_rls.sql aplica. Escritas à mão aqui porque aquele arquivo já
-- rodou: mexer nele seria no-op nas instalações existentes e duplicata nas novas.
alter table journey_routes enable row level security;

create policy journey_routes_select_own on journey_routes
  for select using (user_id = auth.uid() or is_admin());

-- `journey_id` é a chave primária, então checar só o `user_id` deixaria alguém
-- ocupar a linha da jornada de outro: não conseguiria ler nada, mas bloquearia
-- para sempre o upsert do dono. A jornada tem de ser sua também.
create policy journey_routes_insert_own on journey_routes
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from journeys j where j.id = journey_id and j.user_id = auth.uid()
    )
  );
create policy journey_routes_update_own on journey_routes
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from journeys j where j.id = journey_id and j.user_id = auth.uid()
    )
  );
create policy journey_routes_delete_own on journey_routes
  for delete using (user_id = auth.uid());

-- `grant select on all tables` em 20260818000550_grants.sql valeu uma vez só,
-- para as tabelas que existiam naquele momento. Uma tabela nova precisa do seu.
grant select, insert, update, delete on journey_routes to authenticated;

-- ---------------------------------------------------------- preferências ----
alter table user_preferences
  -- Nada é capturado enquanto isto for falso. Opt-in, nunca opt-out (§LGPD).
  add column route_capture_enabled boolean not null default false,
  -- Corta as pontas do trajeto no que sai do aparelho como imagem.
  add column route_trim_shared boolean not null default true,
  -- Marca que já perguntamos uma vez. Quem disse "agora não" não é perguntado
  -- de novo a cada jornada — muda de ideia nas configurações, se quiser.
  add column route_capture_prompted boolean not null default false,
  -- O padrão expira. Nulo significa "guardar para sempre" e só é alcançável
  -- por escolha explícita nas configurações — a coluna tem `default 90` para
  -- que ninguém acabe guardando a vida inteira por omissão.
  add column route_retention_days integer default 90
    check (route_retention_days is null or route_retention_days > 0);

-- ------------------------------------------------------------- retenção ----
-- A poda não pode depender de o cliente abrir o aplicativo: quem desinstala é
-- exatamente quem mais precisa que o trajeto suma. Roda pelo agendador.
create or replace function prune_expired_routes()
returns integer
language plpgsql
security definer
-- `extensions` entra junto por causa de 20260818001600: uma função nossa que
-- fixa só `public` fica cega para os operadores instalados lá.
set search_path = public, extensions
as $$
declare
  removed integer;
begin
  with expired as (
    delete from journey_routes r
    using user_preferences p
    where p.user_id = r.user_id
      and p.route_retention_days is not null
      and r.captured_at < now() - make_interval(days => p.route_retention_days)
    returning 1
  )
  select count(*)::integer into removed from expired;
  return removed;
end;
$$;

-- Ninguém chama isto pelo aplicativo. Segue o padrão de 20260818001500.
revoke execute on function prune_expired_routes() from public, anon, authenticated;

-- Uma função que ninguém chama não apaga nada. Sem este agendamento, a
-- retenção prometida na tela de privacidade e no DATABASE.md simplesmente
-- nunca aconteceria — e ninguém perceberia, porque a falha é silenciosa.
--
-- O `pg_cron` existe na Supabase mas não no Postgres do teste, então o
-- agendamento é condicional. Se a extensão não estiver disponível, o aviso
-- aparece na saída da migration e o passo fica documentado no SETUP.md.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'prune-expired-routes',
      '30 4 * * *',
      $cron$select prune_expired_routes();$cron$
    );
  else
    raise notice
      'pg_cron indisponível: agende prune_expired_routes() manualmente (SETUP.md §8).';
  end if;
exception when others then
  -- Um projeto sem permissão para criar extensões não pode falhar a migration
  -- inteira por causa do agendador. O aviso é o que leva alguém ao SETUP.md.
  raise notice 'não foi possível agendar prune_expired_routes(): %', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------- view ----
-- `daily_totals` reescrita apenas para que o coalesce da distância conheça o
-- GPS. A ordem tem de bater EXATAMENTE com `journeyDistance()` em
-- packages/business-logic/src/financials.ts — se as duas divergirem, o app e o
-- histórico mostram números diferentes para o mesmo dia.
--
-- O `nullif` é proposital: a constraint já proíbe zero, mas escrever assim faz
-- o SQL e o TypeScript se lerem igual, e deixa óbvio que os dois pulam o zero.
create or replace view daily_totals
with (security_invoker = true) as
with revenue_days as (
  select user_id, date,
         sum(amount + tips)::bigint as gross_revenue,
         sum(tips)::bigint as tips,
         coalesce(sum(trip_count), 0)::integer as trip_count
  from revenues group by user_id, date
),
expense_days as (
  select e.user_id, e.date,
         sum(e.amount)::bigint as total_expenses,
         sum(e.amount) filter (where c.is_vehicle_cost)::bigint as vehicle_expenses
  from expenses e
  join expense_categories c on c.id = e.category_id
  group by e.user_id, e.date
),
journey_days as (
  select user_id,
         (started_at at time zone 'America/Sao_Paulo')::date as date,
         sum(
           greatest(0, extract(epoch from (ended_at - started_at))::integer - paused_seconds)
         )::integer as worked_seconds,
         sum(
           coalesce(distance_override,
                    case when odometer_end > odometer_start
                         then odometer_end - odometer_start end,
                    nullif(distance_gps, 0),
                    0)
         )::bigint as distance,
         count(*)::integer as journey_count
  from journeys
  where status = 'completed' and ended_at is not null
  group by user_id, (started_at at time zone 'America/Sao_Paulo')::date
)
select
  coalesce(r.user_id, e.user_id, j.user_id) as user_id,
  coalesce(r.date, e.date, j.date) as date,
  coalesce(r.gross_revenue, 0) as gross_revenue,
  coalesce(r.tips, 0) as tips,
  coalesce(r.trip_count, 0) as trip_count,
  coalesce(e.total_expenses, 0) as total_expenses,
  coalesce(e.vehicle_expenses, 0) as vehicle_expenses,
  coalesce(r.gross_revenue, 0) - coalesce(e.total_expenses, 0) as net_profit,
  coalesce(j.worked_seconds, 0) as worked_seconds,
  coalesce(j.distance, 0) as distance,
  coalesce(j.journey_count, 0) as journey_count
from revenue_days r
full outer join expense_days e on e.user_id = r.user_id and e.date = r.date
full outer join journey_days j
  on j.user_id = coalesce(r.user_id, e.user_id) and j.date = coalesce(r.date, e.date);
