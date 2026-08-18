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
