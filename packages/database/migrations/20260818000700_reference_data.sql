-- ============================================================================
-- Reference data. This is product configuration, not demo content – it ships
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
