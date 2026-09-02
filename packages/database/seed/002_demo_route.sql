-- ============================================================================
-- A jornada de teste com trajeto, sempre no dia de hoje.
--
-- DESENVOLVIMENTO E DEMONSTRAÇÃO. Não cria dado nenhum: só mantém no dia certo
-- a jornada marcada com `note = 'demo-recap'`, que existe para haver um mapa
-- para abrir sem ter que sair dirigindo.
--
-- O problema que isto resolve: o Histórico abre na semana corrente. Uma jornada
-- de sábado passado tem tudo certo no banco, aparece no relatório mensal, e
-- mesmo assim some da tela que a pessoa abre primeiro. Depois de uns dias o
-- material de teste simplesmente desaparece, e parece que o aplicativo quebrou.
--
-- Run:  psql -d <db> -f seed/002_demo_route.sql
-- Undo: select cron.unschedule('demo-journey-hoje');
--       drop function public.refresh_demo_journey();
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
  v_journey uuid;
  v_old date;
  -- O dia local do motorista, não o dia UTC. Em São Paulo a meia-noite UTC é
  -- 21h do dia anterior, então `current_date` moveria a jornada cedo demais.
  v_new date := (now() at time zone 'America/Sao_Paulo')::date;
  v_days integer;
begin
  select id, (started_at at time zone 'America/Sao_Paulo')::date
    into v_journey, v_old
  from journeys
  where note = 'demo-recap'
  order by started_at desc
  limit 1;

  -- Um banco sem a jornada de demonstração é o caso normal, não um erro.
  if v_journey is null then return; end if;

  v_days := v_new - v_old;
  if v_days = 0 then return; end if;

  -- O horário do dia é preservado: a jornada começa de manhã e termina no
  -- começo da tarde, que é o que faz o tempo trabalhado parecer um turno.
  update journeys
     set started_at = started_at + make_interval(days => v_days),
         ended_at   = ended_at   + make_interval(days => v_days)
   where id = v_journey;

  -- Os ganhos e os gastos andam junto, ou o dia fica com mapa e sem dinheiro.
  update revenues set date = date + v_days where journey_id = v_journey;
  update expenses set date = date + v_days where journey_id = v_journey;
  update journey_routes
     set captured_at = captured_at + make_interval(days => v_days)
   where journey_id = v_journey;
end;
$$;

-- Nada disto é chamável pelo aplicativo. Só o cron e a service role.
revoke all on function public.refresh_demo_journey() from public, anon, authenticated;

-- 03:05 UTC é 00:05 em Brasília: a jornada muda de dia junto com o calendário,
-- e não no meio da tarde de quem está testando.
select cron.unschedule(jobid) from cron.job where jobname = 'demo-journey-hoje';
select cron.schedule(
  'demo-journey-hoje',
  '5 3 * * *',
  $$select public.refresh_demo_journey()$$
);

select public.refresh_demo_journey();
