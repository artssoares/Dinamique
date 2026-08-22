-- ============================================================================
-- Captura de trajeto por GPS.
--
-- Até aqui a distância de uma jornada só existia se o motorista digitasse. Este
-- arquivo abre espaço para o aparelho medir sozinho — sem nunca passar por cima
-- do que a pessoa escreveu (ver §6 e `journeyDistance()`).
--
-- Uma rota é o dado mais sensível do schema: ela diz onde alguém estava, hora a
-- hora. Por isso ela é opt-in, vive numa tabela própria que o motorista pode
-- esvaziar sozinho, expira por padrão, e nunca entra no benchmark.
-- ============================================================================

-- Qual medida acabou valendo para a jornada. É registro, não regra: a ordem de
-- resolução vive em `journeyDistance()` e na view `daily_totals`, e ramificar
-- nesta coluna reintroduziria justamente a divergência que ela descreve.
create type distance_source as enum ('manual', 'odometer', 'gps');

alter table journeys
  add column distance_gps integer
    check (distance_gps is null or distance_gps > 0),
  add column route_point_count integer
    check (route_point_count is null or route_point_count >= 0),
  add column distance_source distance_source;

comment on column journeys.distance_gps is
  'Metros medidos pelo GPS. Nunca vence o que o motorista digitou (§6).';

-- ---------------------------------------------------------------------------
-- O desenho do trajeto mora numa tabela à parte, e não numa coluna em
-- `journeys`, por quatro motivos concretos:
--
--   1. Uma rota simplificada de 1000 pontos dá ~7 KB de ASCII. O Postgres faria
--      TOAST disso de qualquer jeito, então a coluna teria o custo de I/O da
--      tabela separada sem nenhum dos benefícios dela.
--   2. `select * from journeys` acontece em toda tela de histórico. Separando,
--      essa consulta nunca arrasta o desenho junto.
--   3. Apagar trajetos por LGPD vira um delete de uma tabela só, com o
--      histórico financeiro intacto.
--   4. A poda por retenção nunca encosta numa linha de dinheiro.
--
-- `distance_gps` e `route_point_count` ficam em `journeys` justamente para que
-- `daily_totals` não precise de join: aquela view é o grão de tudo que vem
-- depois.
-- ---------------------------------------------------------------------------
create table journey_routes (
  journey_id  uuid primary key references journeys(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  -- Polyline codificada do Google. O formato está em packages/utils/polyline.ts.
  polyline    text not null,
  point_count integer not null check (point_count > 0),
  precision   smallint not null default 5 check (precision between 1 and 9),
  captured_at timestamptz not null default now()
);

create index journey_routes_user_idx on journey_routes (user_id);

-- ------------------------------------------------------------------ RLS ----
-- As mesmas quatro políticas de linha própria que o loop de
-- 20260818000500_rls.sql aplica. Escritas à mão aqui porque aquele arquivo já
-- rodou: mexer nele seria no-op nas instalações existentes e duplicata nas novas.
alter table journey_routes enable row level security;

create policy journey_routes_select_own on journey_routes
  for select using (user_id = auth.uid() or is_admin());

-- `journey_id` é a chave primária, então checar só o `user_id` deixaria alguém
-- ocupar a linha da jornada de outro: não conseguiria ler nada, mas bloquearia
-- para sempre o upsert do dono. A jornada tem de ser sua também.
create policy journey_routes_insert_own on journey_routes
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from journeys j where j.id = journey_id and j.user_id = auth.uid()
    )
  );
create policy journey_routes_update_own on journey_routes
  for update using (user_id = auth.uid())
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from journeys j where j.id = journey_id and j.user_id = auth.uid()
    )
  );
create policy journey_routes_delete_own on journey_routes
  for delete using (user_id = auth.uid());

-- `grant select on all tables` em 20260818000550_grants.sql valeu uma vez só,
-- para as tabelas que existiam naquele momento. Uma tabela nova precisa do seu.
grant select, insert, update, delete on journey_routes to authenticated;

-- ---------------------------------------------------------- preferências ----
alter table user_preferences
  -- Nada é capturado enquanto isto for falso. Opt-in, nunca opt-out (§LGPD).
  add column route_capture_enabled boolean not null default false,
  -- Corta as pontas do trajeto no que sai do aparelho como imagem.
  add column route_trim_shared boolean not null default true,
  -- Marca que já perguntamos uma vez. Quem disse "agora não" não é perguntado
  -- de novo a cada jornada — muda de ideia nas configurações, se quiser.
  add column route_capture_prompted boolean not null default false,
  -- O padrão expira. Nulo significa "guardar para sempre" e só é alcançável
  -- por escolha explícita nas configurações — a coluna tem `default 90` para
  -- que ninguém acabe guardando a vida inteira por omissão.
  add column route_retention_days integer default 90
    check (route_retention_days is null or route_retention_days > 0);

-- ------------------------------------------------------------- retenção ----
-- A poda não pode depender de o cliente abrir o aplicativo: quem desinstala é
-- exatamente quem mais precisa que o trajeto suma. Roda pelo agendador.
create or replace function prune_expired_routes()
returns integer
language plpgsql
security definer
-- `extensions` entra junto por causa de 20260818001600: uma função nossa que
-- fixa só `public` fica cega para os operadores instalados lá.
set search_path = public, extensions
as $$
declare
  removed integer;
begin
  with expired as (
    delete from journey_routes r
    using user_preferences p
    where p.user_id = r.user_id
      and p.route_retention_days is not null
      and r.captured_at < now() - make_interval(days => p.route_retention_days)
    returning 1
  )
  select count(*)::integer into removed from expired;
  return removed;
end;
$$;

-- Ninguém chama isto pelo aplicativo. Segue o padrão de 20260818001500.
revoke execute on function prune_expired_routes() from public, anon, authenticated;

-- Uma função que ninguém chama não apaga nada. Sem este agendamento, a
-- retenção prometida na tela de privacidade e no DATABASE.md simplesmente
-- nunca aconteceria — e ninguém perceberia, porque a falha é silenciosa.
--
-- O `pg_cron` existe na Supabase mas não no Postgres do teste, então o
-- agendamento é condicional. Se a extensão não estiver disponível, o aviso
-- aparece na saída da migration e o passo fica documentado no SETUP.md.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule(
      'prune-expired-routes',
      '30 4 * * *',
      $cron$select prune_expired_routes();$cron$
    );
  else
    raise notice
      'pg_cron indisponível: agende prune_expired_routes() manualmente (SETUP.md §8).';
  end if;
exception when others then
  -- Um projeto sem permissão para criar extensões não pode falhar a migration
  -- inteira por causa do agendador. O aviso é o que leva alguém ao SETUP.md.
  raise notice 'não foi possível agendar prune_expired_routes(): %', sqlerrm;
end;
$$;

-- ----------------------------------------------------------------- view ----
-- `daily_totals` reescrita apenas para que o coalesce da distância conheça o
-- GPS. A ordem tem de bater EXATAMENTE com `journeyDistance()` em
-- packages/business-logic/src/financials.ts — se as duas divergirem, o app e o
-- histórico mostram números diferentes para o mesmo dia.
--
-- O `nullif` é proposital: a constraint já proíbe zero, mas escrever assim faz
-- o SQL e o TypeScript se lerem igual, e deixa óbvio que os dois pulam o zero.
create or replace view daily_totals
with (security_invoker = true) as
with revenue_days as (
  select user_id, date,
         sum(amount + tips)::bigint as gross_revenue,
         sum(tips)::bigint as tips,
         coalesce(sum(trip_count), 0)::integer as trip_count
  from revenues group by user_id, date
),
expense_days as (
  select e.user_id, e.date,
         sum(e.amount)::bigint as total_expenses,
         sum(e.amount) filter (where c.is_vehicle_cost)::bigint as vehicle_expenses
  from expenses e
  join expense_categories c on c.id = e.category_id
  group by e.user_id, e.date
),
journey_days as (
  select user_id,
         (started_at at time zone 'America/Sao_Paulo')::date as date,
         sum(
           greatest(0, extract(epoch from (ended_at - started_at))::integer - paused_seconds)
         )::integer as worked_seconds,
         sum(
           coalesce(distance_override,
                    case when odometer_end > odometer_start
                         then odometer_end - odometer_start end,
                    nullif(distance_gps, 0),
                    0)
         )::bigint as distance,
         count(*)::integer as journey_count
  from journeys
  where status = 'completed' and ended_at is not null
  group by user_id, (started_at at time zone 'America/Sao_Paulo')::date
)
select
  coalesce(r.user_id, e.user_id, j.user_id) as user_id,
  coalesce(r.date, e.date, j.date) as date,
  coalesce(r.gross_revenue, 0) as gross_revenue,
  coalesce(r.tips, 0) as tips,
  coalesce(r.trip_count, 0) as trip_count,
  coalesce(e.total_expenses, 0) as total_expenses,
  coalesce(e.vehicle_expenses, 0) as vehicle_expenses,
  coalesce(r.gross_revenue, 0) - coalesce(e.total_expenses, 0) as net_profit,
  coalesce(j.worked_seconds, 0) as worked_seconds,
  coalesce(j.distance, 0) as distance,
  coalesce(j.journey_count, 0) as journey_count
from revenue_days r
full outer join expense_days e on e.user_id = r.user_id and e.date = r.date
full outer join journey_days j
  on j.user_id = coalesce(r.user_id, e.user_id) and j.date = coalesce(r.date, e.date);
