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
-- corpo – inofensivo para os outros, mas é dado nosso e não dele.
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

-- Everything else – subscriptions, promotion_codes, referrals,
-- discount_benefits, user_attribution, admin_users, admin_logs, exports – is
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
