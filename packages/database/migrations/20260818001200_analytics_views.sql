-- ============================================================================
-- Camada analítica (§87–96, §106).
--
-- Consultas de relatório NUNCA batem direto nas tabelas operacionais quentes.
-- Estas views são a superfície que o Admin consulta; quando o volume exigir,
-- viram materialized views atualizadas por agendamento, sem mudar a consulta
-- de quem chama.
--
-- Todas excluem contas de demonstração.
-- ============================================================================

-- Uma linha por usuário com tudo que os relatórios cruzam (§93, §94).
-- É a tabela-fato da camada analítica.
create or replace view analytics_users as
select
  p.id                                   as user_id,
  p.city,
  p.state,
  p.gender,
  case
    when p.birth_date is null then null
    when extract(year from age(p.birth_date)) < 25 then '18-24'
    when extract(year from age(p.birth_date)) < 35 then '25-34'
    when extract(year from age(p.birth_date)) < 45 then '35-44'
    when extract(year from age(p.birth_date)) < 55 then '45-54'
    else '55+'
  end                                    as age_band,
  p.work_modes,
  p.created_at,
  p.last_seen_at,
  p.blocked_at is not null               as is_blocked,
  coalesce(cp.plan, 'free')              as plan,
  cp.source                              as plan_source,
  coalesce(cp.is_trial, false)           as is_trial,
  -- Origem de aquisição (§91, §96). Sem atribuição, o cadastro é orgânico.
  coalesce(ua.source, 'organic')         as acquisition_source,
  ua.campaign                            as acquisition_campaign,
  ua.influencer_id,
  ua.code_id,
  pc.code                                as acquisition_code,
  v.label                                as vehicle_label,
  v.vehicle_type,
  v.fuel_type,
  v.ownership,
  v.model_year
from profiles p
left join current_plans cp on cp.user_id = p.id
left join user_attribution ua on ua.user_id = p.id
left join promotion_codes pc on pc.id = ua.code_id
left join lateral (
  select
    -- `concat_ws` com todos os campos nulos devolve string VAZIA, não null,
    -- então sem o nullif o coalesce nunca cairia para custom_label e veículos
    -- fora do catálogo apareceriam em branco nos relatórios.
    coalesce(
      nullif(trim(concat_ws(' ', mk.name, md.name, vv.name)), ''),
      uv.custom_label
    )                     as label,
    uv.vehicle_type,
    uv.fuel_type,
    uv.ownership,
    uv.model_year
  from user_vehicles uv
  left join vehicle_versions vv on vv.id = uv.version_id
  left join vehicle_models md on md.id = vv.model_id
  left join vehicle_makes mk on mk.id = md.make_id
  where uv.user_id = p.id and uv.archived_at is null
  order by uv.is_primary desc
  limit 1
) v on true
where not p.is_demo;

-- Números financeiros por usuário, prontos para média e mediana (§92).
create or replace view analytics_user_financials as
select
  d.user_id,
  min(d.date)                                                     as first_day,
  max(d.date)                                                     as last_day,
  count(*)::integer                                               as active_days,
  sum(d.gross_revenue)                                            as gross_revenue,
  sum(d.total_expenses)                                           as total_expenses,
  sum(d.net_profit)                                               as net_profit,
  sum(d.worked_seconds)                                           as worked_seconds,
  sum(d.distance)                                                 as distance,
  sum(d.trip_count)                                               as trip_count,
  case when sum(d.worked_seconds) > 0
       then round(sum(d.gross_revenue)::numeric / sum(d.worked_seconds) * 3600) end as revenue_per_hour,
  case when sum(d.worked_seconds) > 0
       then round(sum(d.net_profit)::numeric / sum(d.worked_seconds) * 3600) end    as profit_per_hour,
  case when sum(d.distance) > 0
       then round(sum(d.gross_revenue)::numeric / sum(d.distance) * 1000) end       as revenue_per_km,
  case when sum(d.distance) > 0
       then round(sum(d.total_expenses)::numeric / sum(d.distance) * 1000) end      as cost_per_km
from daily_totals d
join analytics_users u on u.user_id = d.user_id
group by d.user_id;

-- Aquisição por origem (§90, §96): quantidade E qualidade.
create or replace view analytics_acquisition as
select
  u.acquisition_source                                          as source,
  u.acquisition_campaign                                        as campaign,
  u.acquisition_code                                            as code,
  u.influencer_id,
  count(*)::integer                                             as signups,
  count(*) filter (where u.plan = 'pro' and not u.is_trial)::integer as pro_users,
  count(*) filter (where u.is_trial)::integer                   as trial_users,
  count(*) filter (where u.last_seen_at >= now() - interval '30 days')::integer as active_30d,
  -- Conversão é o que separa volume de qualidade; sem ela um influenciador com
  -- 1.000 cadastros parece melhor que um com 100 que assinam.
  case when count(*) > 0
       then round(count(*) filter (where u.plan = 'pro' and not u.is_trial)::numeric
                  / count(*) * 100, 1) end                       as conversion_rate,
  case when count(*) > 0
       then round(count(*) filter (where u.last_seen_at >= now() - interval '30 days')::numeric
                  / count(*) * 100, 1) end                       as retention_30d
from analytics_users u
group by u.acquisition_source, u.acquisition_campaign, u.acquisition_code, u.influencer_id;

-- Desempenho por influenciador (§97).
create or replace view analytics_influencers as
select
  i.id                                                          as influencer_id,
  i.display_name,
  i.status,
  pc.code,
  pc.use_count,
  count(u.user_id)::integer                                     as signups,
  count(u.user_id) filter (where u.plan = 'pro' and not u.is_trial)::integer as pro_users,
  case when count(u.user_id) > 0
       then round(count(u.user_id) filter (where u.plan = 'pro' and not u.is_trial)::numeric
                  / count(u.user_id) * 100, 1) end               as conversion_rate,
  count(u.user_id) filter (where u.last_seen_at >= now() - interval '30 days')::integer as active_30d
from influencers i
left join promotion_codes pc on pc.influencer_id = i.id
left join analytics_users u on u.influencer_id = i.id
group by i.id, i.display_name, i.status, pc.code, pc.use_count;

-- Desempenho por plataforma (§91).
create or replace view analytics_platforms as
select
  pl.name                                                        as platform,
  count(distinct r.user_id)::integer                             as users,
  sum(r.amount + r.tips)                                         as gross_revenue,
  sum(r.trip_count)                                              as trips,
  case when sum(r.trip_count) > 0
       then round(sum(r.amount + r.tips)::numeric / sum(r.trip_count)) end as average_ticket
from revenues r
join platforms pl on pl.id = r.platform_id
join analytics_users u on u.user_id = r.user_id
group by pl.name;

-- Desempenho por veículo (§90).
create or replace view analytics_vehicles as
select
  u.vehicle_label,
  u.vehicle_type,
  u.fuel_type,
  u.ownership,
  count(*)::integer                                              as users,
  round(avg(u.model_year))                                       as average_year,
  round(avg(f.revenue_per_km))                                   as average_revenue_per_km,
  round(avg(f.cost_per_km))                                      as average_cost_per_km
from analytics_users u
left join analytics_user_financials f on f.user_id = u.user_id
where u.vehicle_label is not null
group by u.vehicle_label, u.vehicle_type, u.fuel_type, u.ownership;

-- Métricas de suporte (§92).
create or replace view analytics_support as
select
  count(*)::integer                                                       as total_tickets,
  count(*) filter (where t.status not in ('resolved','closed'))::integer  as open_tickets,
  count(*) filter (where t.status = 'resolved')::integer                  as resolved_tickets,
  count(*) filter (where t.status in ('new','awaiting_agent','in_progress'))::integer as unanswered,
  -- Tickets sem resposta ficam FORA da média, não entram como zero (§92).
  round(avg(extract(epoch from (t.first_agent_reply_at - t.created_at)))
        filter (where t.first_agent_reply_at is not null))                  as avg_first_response_seconds,
  round(avg(extract(epoch from (t.resolved_at - t.created_at)))
        filter (where t.resolved_at is not null))                           as avg_resolution_seconds
from support_tickets t
join analytics_users u on u.user_id = t.user_id;

create or replace view analytics_support_categories as
select
  coalesce(sc.name, 'Sem categoria')                             as category,
  count(*)::integer                                              as tickets,
  count(*) filter (where t.status in ('resolved','closed'))::integer as resolved
from support_tickets t
left join support_categories sc on sc.id = t.category_id
join analytics_users u on u.user_id = t.user_id
group by sc.name;

grant select on
  analytics_users, analytics_user_financials, analytics_acquisition,
  analytics_influencers, analytics_platforms, analytics_vehicles,
  analytics_support, analytics_support_categories
to authenticated;
