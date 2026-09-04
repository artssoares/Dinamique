-- ============================================================================
-- A jornada de teste com trajeto, sempre no dia de hoje, em toda conta de teste.
--
-- DESENVOLVIMENTO E DEMONSTRAÇÃO. Existe para haver um mapa (e um filme) para
-- abrir sem ter que sair dirigindo. Duas funções:
--
--   refresh_demo_journey()        mantém no dia certo TODAS as jornadas marcadas
--                                 com `note = 'demo-recap'`, uma por conta.
--   clone_demo_journey(user_id)   copia a jornada de demonstração (ganhos,
--                                 gastos e trajeto) para outra conta de teste.
--
-- O problema que a primeira resolve: o Histórico abre na semana corrente. Uma
-- jornada de sábado passado tem tudo certo no banco, aparece no relatório
-- mensal, e mesmo assim some da tela que a pessoa abre primeiro. Depois de uns
-- dias o material de teste simplesmente desaparece, e parece que o aplicativo
-- quebrou.
--
-- O problema que a segunda resolve: a jornada de demonstração vivia numa conta
-- só. Quem entrava com outra conta de teste abria o Histórico e não via mapa
-- nenhum, e concluía que o mapa não estava no ar.
--
-- Run:  psql -d <db> -f seed/002_demo_route.sql
-- Dar a jornada a uma conta:
--       select clone_demo_journey(id) from auth.users where email = 'alguem@exemplo.com';
-- Undo: select cron.unschedule('demo-journey-hoje');
--       drop function public.refresh_demo_journey();
--       drop function public.clone_demo_journey(uuid);
-- ============================================================================

-- `security definer` porque o cron roda fora de qualquer sessão de usuário e
-- as tabelas estão atrás de RLS. O `search_path` fixo é obrigatório junto: sem
-- ele, um schema no caminho de quem chama decide o que estas linhas atingem.
create or replace function public.refresh_demo_journey()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  demo record;
  -- O dia local do motorista, não o dia UTC. Em São Paulo a meia-noite UTC é
  -- 21h do dia anterior, então `current_date` moveria a jornada cedo demais.
  v_new date := (now() at time zone 'America/Sao_Paulo')::date;
  v_days integer;
begin
  -- Uma por conta: cada conta de teste tem a sua cópia, e todas andam juntas.
  for demo in
    select id, (started_at at time zone 'America/Sao_Paulo')::date as local_day
    from journeys
    where note = 'demo-recap'
  loop
    v_days := v_new - demo.local_day;
    if v_days = 0 then continue; end if;

    -- O horário do dia é preservado: a jornada começa de manhã e termina no
    -- começo da tarde, que é o que faz o tempo trabalhado parecer um turno.
    update journeys
       set started_at = started_at + make_interval(days => v_days),
           ended_at   = ended_at   + make_interval(days => v_days)
     where id = demo.id;

    -- Os ganhos e os gastos andam junto, ou o dia fica com mapa e sem dinheiro.
    update revenues set date = date + v_days where journey_id = demo.id;
    update expenses set date = date + v_days where journey_id = demo.id;
    update journey_routes
       set captured_at = captured_at + make_interval(days => v_days)
     where journey_id = demo.id;
  end loop;
end;
$$;

-- Copia a jornada de demonstração mais recente para outra conta. Não faz nada
-- se a conta já tem a sua, e não faz nada se não existe nenhuma para copiar:
-- um banco sem a jornada de demonstração é o caso normal, não um erro.
--
-- O veículo não é copiado (a outra conta pode não ter nenhum), e o trajeto vai
-- inteiro, com a mesma polyline: é o que faz o mapa e o filme aparecerem.
create or replace function public.clone_demo_journey(target_user uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  source_id uuid;
  new_id uuid;
begin
  if exists (select 1 from journeys where user_id = target_user and note = 'demo-recap') then
    return null;
  end if;

  select j.id into source_id
  from journeys j
  join journey_routes r on r.journey_id = j.id
  where j.note = 'demo-recap' and j.user_id <> target_user
  order by j.started_at desc
  limit 1;

  if source_id is null then return null; end if;

  insert into journeys (
    user_id, vehicle_id, status, started_at, ended_at, paused_seconds,
    odometer_start, odometer_end, distance_override, distance_gps,
    route_point_count, distance_source, note
  )
  select target_user, null, status, started_at, ended_at, paused_seconds,
         odometer_start, odometer_end, distance_override, distance_gps,
         route_point_count, distance_source, note
  from journeys where id = source_id
  returning id into new_id;

  insert into revenues (user_id, journey_id, platform_id, date, amount, tips, trip_count)
  select target_user, new_id, platform_id, date, amount, tips, trip_count
  from revenues where journey_id = source_id;

  insert into expenses (user_id, journey_id, category_id, vehicle_id, date, amount)
  select target_user, new_id, category_id, null, date, amount
  from expenses where journey_id = source_id;

  insert into journey_routes (journey_id, user_id, polyline, point_count, precision, captured_at)
  select new_id, target_user, polyline, point_count, precision, captured_at
  from journey_routes where journey_id = source_id;

  return new_id;
end;
$$;

-- Nada disto é chamável pelo aplicativo. Só o cron e a service role.
revoke all on function public.refresh_demo_journey() from public, anon, authenticated;
revoke all on function public.clone_demo_journey(uuid) from public, anon, authenticated;

-- 03:05 UTC é 00:05 em Brasília: a jornada muda de dia junto com o calendário,
-- e não no meio da tarde de quem está testando.
select cron.unschedule(jobid) from cron.job where jobname = 'demo-journey-hoje';
select cron.schedule(
  'demo-journey-hoje',
  '5 3 * * *',
  $$select public.refresh_demo_journey()$$
);

select public.refresh_demo_journey();
