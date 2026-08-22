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

-- Events are written by the client and read only by admins – a user cannot
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
