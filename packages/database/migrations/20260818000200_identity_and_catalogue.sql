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
