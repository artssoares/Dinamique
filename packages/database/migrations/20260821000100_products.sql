-- ============================================================================
-- What the driver sells inside the car.
--
-- A lot of the money in this job does not come from the platform. Drivers sell
-- water, sweets, phone chargers and perfume to the passenger sitting behind
-- them, and until now the app had nowhere to put it: the only shape a ganho
-- could take was "an amount, from a platform". Someone who sold six perfumes
-- had to add up the total in their head and lie about which app it came from.
--
-- The design choice worth stating: a sale IS a revenue row, not a table of its
-- own. `revenues` already feeds the daily totals, the goals, the insights, the
-- history and the exports; giving sales a parallel table would mean teaching
-- all of that to add two numbers together, and every place that forgot would
-- quietly under-report. Two nullable columns on `revenues` cost nothing and
-- every existing calculation keeps working untouched.
-- ============================================================================

create table if not exists products (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 60),
  -- Integer cents, like every other amount in this schema. Never a float.
  unit_price bigint not null check (unit_price >= 0),
  -- What one unit cost the driver to buy. Optional, because plenty of people
  -- genuinely do not know; when it is known the app can show what actually
  -- stayed in the pocket instead of only what came in.
  unit_cost  bigint check (unit_cost is null or unit_cost >= 0),
  -- Removing a product must not remove the sales that referenced it, so this
  -- is a flag rather than a delete.
  is_active  boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_user_idx on products (user_id) where is_active;

-- The same product twice is a mistake, not a choice: two rows named "Água"
-- split the numbers for no reason. Case and surrounding spaces are folded, so
-- "  ÁGUA " and "Água" collide as they should. Accents are not folded: doing
-- that needs `unaccent`, which is not immutable and so cannot go in an index
-- without a wrapper, and "acai" against "açaí" is not worth that.
create unique index if not exists products_user_name_idx
  on products (user_id, lower(btrim(name))) where is_active;

drop trigger if exists products_updated_at on products;
create trigger products_updated_at before update on products
  for each row execute function set_updated_at();

-- ------------------------------------------------------------- the sale ----
alter table revenues
  add column if not exists product_id uuid references products(id) on delete set null,
  add column if not exists quantity integer check (quantity is null or quantity > 0);

create index if not exists revenues_product_date_idx on revenues (product_id, date);

-- A revenue row is either a platform's takings or a product sale. Both at once
-- is not a thing that can happen, and allowing it would double-count the
-- amount in the per-platform breakdown.
alter table revenues drop constraint if exists revenue_is_platform_or_product;
alter table revenues add constraint revenue_is_platform_or_product
  check (product_id is null or platform_id is null);

-- ------------------------------------------------- who is asked about it ----
-- Most drivers sell nothing, and an app that keeps offering an empty "Venda"
-- tab to them is noise. The onboarding asks once; everything about selling
-- stays out of the way for anyone who said no.
alter table profiles add column if not exists sells_products boolean not null default false;

-- ------------------------------------------------------------ the costs ----
-- Not a vehicle cost: a box of perfume does not belong in cost per kilometre.
insert into expense_categories (slug, name, is_vehicle_cost, sort_order) values
  ('produtos', 'Produtos para revenda', false, 180)
on conflict (slug) do nothing;

-- ---------------------------------------------------------------- access ----
alter table products enable row level security;

create policy products_select_own on products
  for select using (user_id = auth.uid() or is_admin());
create policy products_insert_own on products
  for insert with check (user_id = auth.uid());
create policy products_update_own on products
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy products_delete_own on products
  for delete using (user_id = auth.uid());

grant select on products to authenticated;
grant insert, update, delete on products to authenticated;
