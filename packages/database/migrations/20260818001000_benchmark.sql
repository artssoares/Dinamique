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
