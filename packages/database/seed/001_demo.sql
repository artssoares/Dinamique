-- ============================================================================
-- Demonstration data.
--
-- DEVELOPMENT AND DEMO ONLY. Every row created here is tagged so it can be
-- identified and removed; none of it may ever reach production (§122, §131).
--
-- Creates:
--   * Arthur – São Paulo, Uber + 99, ~30 days of realistic history
--   * enough additional users for benchmarks to clear the 20-user minimum
--   * support tickets, an influencer application, referrals and codes
--
-- Run:  psql -d <db> -f seed/001_demo.sql
-- Undo: select demo_teardown();
-- ============================================================================

-- `profiles.is_demo` faz parte do schema (migration 000200); aqui só marcamos
-- as contas criadas, para que o teardown seja exato em vez de "apagar tudo que
-- parece falso".

create or replace function demo_teardown()
returns void
language plpgsql
as $$
begin
  delete from auth.users where id in (select id from profiles where is_demo);
  delete from promotion_codes where code like 'DEMO%';
  raise notice 'Demo data removed.';
end;
$$;

do $$
declare
  v_arthur       uuid := '11111111-1111-4111-8111-111111111111';
  v_uber         uuid;
  v_99           uuid;
  v_ifood        uuid;
  v_fuel_cat     uuid;
  v_food_cat     uuid;
  v_toll_cat     uuid;
  v_support_cat  uuid;
  v_vehicle      uuid;
  v_journey      uuid;
  v_ticket       uuid;
  v_day          date;
  v_offset       integer;
  v_gross        bigint;
  v_seconds      integer;
  v_distance     integer;
  v_peer         uuid;
  v_peer_name    text;
  v_cities       text[] := array['São Paulo','Rio de Janeiro','Belo Horizonte','Curitiba','Porto Alegre','Salvador'];
  v_states       text[] := array['SP','RJ','MG','PR','RS','BA'];
  i              integer;
begin
  select id into v_uber  from platforms where slug = 'uber';
  select id into v_99    from platforms where slug = '99';
  select id into v_ifood from platforms where slug = 'ifood';
  select id into v_fuel_cat from expense_categories where slug = 'combustivel';
  select id into v_food_cat from expense_categories where slug = 'alimentacao';
  select id into v_toll_cat from expense_categories where slug = 'pedagio';
  select id into v_support_cat from support_categories where slug = 'relatorios';

  -- ------------------------------------------------------------ Arthur ----
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_arthur, 'arthur@demo.dinamique.app', '{"full_name": "Arthur Soares"}'::jsonb)
  on conflict (id) do nothing;

  update profiles
  set city = 'São Paulo', state = 'SP', work_modes = '{rideshare}',
      onboarding_completed_at = now() - interval '30 days',
      last_seen_at = now() - interval '8 minutes',
      is_demo = true
  where id = v_arthur;

  insert into user_platforms (user_id, platform_id)
  values (v_arthur, v_uber), (v_arthur, v_99)
  on conflict do nothing;

  insert into user_vehicles (
    user_id, vehicle_type, custom_label, model_year, fuel_type, ownership,
    estimated_consumption, is_primary
  )
  values (v_arthur, 'car', 'Honda Civic EXL 2.0', 2020, 'gasoline', 'owned', 10800, true)
  returning id into v_vehicle;

  insert into goals (user_id, period, basis, target)
  values (v_arthur, 'monthly', 'gross', 700000),
         (v_arthur, 'daily',   'gross',  30000);

  -- 30 days of history. Deterministic pseudo-variation keyed on the day
  -- number, so the demo looks organic but reseeds identically.
  for v_offset in 0..29 loop
    v_day := current_date - v_offset;

    -- Sundays off, Fridays strongest – matches how the insights read.
    continue when extract(dow from v_day) = 0;

    v_gross    := 24000 + ((v_offset * 3137) % 16000)
                  + case when extract(dow from v_day) = 5 then 9000 else 0 end;
    v_seconds  := 25200 + ((v_offset * 911) % 12600);
    v_distance := 140000 + ((v_offset * 2237) % 90000);

    insert into journeys (
      user_id, vehicle_id, status, started_at, ended_at, distance_override
    )
    values (
      v_arthur, v_vehicle, 'completed',
      (v_day + time '07:00') at time zone 'America/Sao_Paulo',
      (v_day + time '07:00' + make_interval(secs => v_seconds)) at time zone 'America/Sao_Paulo',
      v_distance
    )
    returning id into v_journey;

    insert into revenues (user_id, journey_id, platform_id, date, amount, trip_count)
    values
      (v_arthur, v_journey, v_uber, v_day, (v_gross * 0.68)::bigint, 7 + (v_offset % 5)),
      (v_arthur, v_journey, v_99,   v_day, (v_gross * 0.32)::bigint, 3 + (v_offset % 3));

    insert into expenses (user_id, journey_id, category_id, vehicle_id, date, amount)
    values
      (v_arthur, v_journey, v_fuel_cat, v_vehicle, v_day, 7000 + ((v_offset * 331) % 3500)),
      (v_arthur, v_journey, v_food_cat, null,      v_day, 2200 + ((v_offset * 173) % 1600));

    if v_offset % 4 = 0 then
      insert into expenses (user_id, journey_id, category_id, vehicle_id, date, amount)
      values (v_arthur, v_journey, v_toll_cat, v_vehicle, v_day, 1150);
    end if;

    -- A fuel log every five days, with a rising odometer so measured
    -- consumption becomes computable.
    if v_offset % 5 = 0 then
      insert into fuel_logs (
        user_id, vehicle_id, journey_id, date, fuel_type,
        total_amount, price_per_litre, volume, odometer, station
      )
      values (
        v_arthur, v_vehicle, v_journey, v_day, 'gasoline',
        18000, 589, 30560, 82000000 + (29 - v_offset) * 210000, 'Posto Ipiranga'
      );
    end if;
  end loop;

  -- Support conversation, mid-flight
  -- O ticket precisa ser mais antigo que suas mensagens, senão o tempo até a
  -- primeira resposta sai negativo nos relatórios.
  insert into support_tickets (
    user_id, category_id, subject, status, app_version, created_at, first_agent_reply_at
  )
  values (v_arthur, v_support_cat, 'Não consigo exportar meu relatório', 'awaiting_user', '0.1.0',
          now() - interval '2 days' - interval '10 minutes', null)
  returning id into v_ticket;

  insert into support_messages (ticket_id, author_kind, author_id, body, created_at)
  values (v_ticket, 'user', v_arthur,
          'Bom dia! Quando tento exportar o mês de agosto o arquivo não abre.',
          now() - interval '2 days');

  insert into support_messages (ticket_id, author_kind, body, is_internal_note, created_at)
  values (v_ticket, 'agent',
          'Usuário Pro desde julho. Verificar se o export está estourando o limite de linhas.',
          true, now() - interval '2 days' + interval '10 minutes');

  insert into support_messages (ticket_id, author_kind, body, created_at)
  values (v_ticket, 'agent',
          'Olá Arthur! Verificamos sua solicitação e identificamos o problema. Já estamos corrigindo.',
          now() - interval '1 day');

  insert into user_notifications (user_id, category, title, body, deep_link)
  values (v_arthur, 'support', 'Suporte Dinamique', 'Você recebeu uma nova resposta.',
          '/support/' || v_ticket::text);

  -- Influencer application awaiting review
  insert into influencer_applications (
    user_id, name, email, city, state, instagram, tiktok,
    followers_estimate, content_type, message
  )
  values (v_arthur, 'Arthur Soares', 'arthur@demo.dinamique.app', 'São Paulo', 'SP',
          '@arthurdirige', '@arthurdirige', 48200, 'Motoristas de aplicativo',
          'Faço conteúdo sobre rentabilidade para motoristas há 3 anos.');

  -- A campaign code, so the admin codes page has something real in it
  insert into promotion_codes (code, kind, benefit_amount, max_uses, expires_at)
  values ('DEMOVERAO', 'campaign', 1500, 500, now() + interval '60 days')
  on conflict (code) do nothing;

  -- ------------------------------------------------- peers for benchmark ---
  -- 60 usuários. O mínimo de 20 vale POR GRUPO (cidade × modalidade), não no
  -- total: com 24 usuários espalhados, nenhum grupo chegava ao mínimo e o
  -- benchmark corretamente não aparecia. 60 fazem São Paulo/aplicativo cruzar
  -- a linha, para o demo mostrar o recurso funcionando de verdade.
  for i in 1..60 loop
    v_peer := gen_random_uuid();
    v_peer_name := 'Motorista ' || i;

    insert into auth.users (id, email, raw_user_meta_data)
    values (v_peer, 'demo' || i || '@demo.dinamique.app',
            jsonb_build_object('full_name', v_peer_name));

    update profiles
    -- Dois terços em São Paulo, como na base real, para o grupo maior ter
    -- amostra suficiente.
    set city = case when i % 3 = 0 then v_cities[1 + (i % 6)] else 'São Paulo' end,
        state = case when i % 3 = 0 then v_states[1 + (i % 6)] else 'SP' end,
        work_modes = case when i % 5 = 0 then '{delivery}'::work_mode[]
                          when i % 11 = 0 then '{taxi}'::work_mode[]
                          else '{rideshare}'::work_mode[] end,
        onboarding_completed_at = now() - make_interval(days => 20 + i),
        last_seen_at = now() - make_interval(days => (i % 45)),
        is_demo = true
    where id = v_peer;

    -- Um veículo por motorista, escolhido do catálogo, para os relatórios de
    -- veículo terem o que agrupar.
    insert into user_vehicles (user_id, vehicle_type, version_id, ownership, model_year,
                               fuel_type, estimated_consumption, is_primary)
    select v_peer,
           case when i % 5 = 0 then 'motorcycle'::vehicle_type else 'car'::vehicle_type end,
           vv.id,
           (array['owned','financed','rented']::vehicle_ownership[])[1 + (i % 3)],
           coalesce(vv.year_from, 2020),
           vv.fuel_type,
           vv.urban_consumption,
           true
    from vehicle_versions vv
    join vehicle_models vm on vm.id = vv.model_id
    where vm.vehicle_type = case when i % 5 = 0 then 'motorcycle'::vehicle_type else 'car'::vehicle_type end
    order by md5(vv.id::text || i::text)
    limit 1;

    -- Two weeks of history each: enough for medians to be meaningful.
    for v_offset in 0..13 loop
      v_day := current_date - v_offset;
      continue when extract(dow from v_day) = 0;

      v_gross    := 18000 + ((i * 1741 + v_offset * 617) % 26000);
      v_seconds  := 21600 + ((i * 523 + v_offset * 311) % 16200);
      v_distance := 110000 + ((i * 1301 + v_offset * 907) % 120000);

      insert into journeys (user_id, status, started_at, ended_at, distance_override)
      values (v_peer, 'completed',
              (v_day + time '08:00') at time zone 'America/Sao_Paulo',
              (v_day + time '08:00' + make_interval(secs => v_seconds)) at time zone 'America/Sao_Paulo',
              v_distance)
      returning id into v_journey;

      insert into revenues (user_id, journey_id, platform_id, date, amount, trip_count)
      values (v_peer, v_journey,
              case when i % 3 = 0 then v_ifood else v_uber end,
              v_day, v_gross, 6 + (i % 9));

      insert into expenses (user_id, journey_id, category_id, date, amount)
      values (v_peer, v_journey, v_fuel_cat, v_day, 6000 + ((i * 271 + v_offset * 89) % 4200));
    end loop;

    -- A few tickets and referrals so the admin lists are not empty.
    if i % 6 = 0 then
      insert into support_tickets (user_id, subject, status, created_at)
      values (v_peer, 'Dúvida sobre o cálculo de lucro',
              case when i % 12 = 0 then 'new'::support_ticket_status
                   else 'in_progress'::support_ticket_status end,
              now() - make_interval(days => (i % 9) + 1))
      returning id into v_ticket;

      insert into support_messages (ticket_id, author_kind, author_id, body, created_at)
      values (v_ticket, 'user', v_peer, 'O lucro mostrado considera o combustível?',
              now() - make_interval(days => (i % 9) + 1));

      -- Parte dos tickets já respondida, para o relatório de SLA ter dado.
      if i % 12 <> 0 then
        insert into support_messages (ticket_id, author_kind, body, created_at)
        values (v_ticket, 'agent', 'Considera sim: o combustível entra como despesa.',
                now() - make_interval(days => (i % 9) + 1) + make_interval(hours => 2 + (i % 5)));
      end if;
    end if;

    if i % 4 = 0 then
      insert into referrals (referrer_user_id, referred_user_id, code_id)
      select v_arthur, v_peer, id from promotion_codes
      where owner_user_id = v_arthur and kind = 'referral'
      on conflict do nothing;

      insert into discount_benefits (user_id, code_id, amount, status, expires_at, used_at)
      select v_peer, id, 1000,
             case when i % 8 = 0 then 'used'::benefit_status else 'granted'::benefit_status end,
             now() + interval '90 days',
             case when i % 8 = 0 then now() - interval '3 days' else null end
      from promotion_codes where owner_user_id = v_arthur and kind = 'referral';
    end if;
  end loop;

  raise notice 'Dados de demonstração criados: Arthur + 60 motoristas, ~30 e ~14 dias de histórico.';
  raise notice 'Remove it with: select demo_teardown();';
end;
$$;
