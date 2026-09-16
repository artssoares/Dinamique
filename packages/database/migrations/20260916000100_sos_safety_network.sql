-- ============================================================================
-- Botão de emergência (SOS) e rede de alerta entre motoristas.
--
-- É o dado mais sensível que este schema já guardou: onde alguém está, agora,
-- no pior momento do dia dele. Três regras moldam tudo abaixo e nenhuma delas
-- é negociável no cliente:
--
--   1. Nada acontece sem consentimento explícito. Sem `sos_consent_at` a
--      função de disparo recusa, não importa o que a tela mande.
--   2. Ninguém lê a posição de outra pessoa fora de um alerta ativo. A busca
--      por quem está perto roda numa função `security definer` que devolve
--      DISTÂNCIA e id, nunca coordenada, e a linha do alerta só é legível
--      por quem foi avisado, enquanto ele está ativo.
--   3. O limite de disparos é do banco, não da tela. Uma tela pode ser
--      recarregada; a função não.
--
-- O PostGIS entra aqui e em nenhum outro lugar. `ST_DWithin` sobre
-- `geography` mede em metros sobre o elipsoide e usa o índice GIST, que é a
-- diferença entre uma varredura da tabela inteira e uma busca por caixa.
-- ============================================================================

-- A Supabase traz o PostGIS disponível mas NÃO instalado, e o lugar dela para
-- extensões é o schema `extensions`, nunca `public`, que é o schema que a API
-- expõe. O CI usa a imagem `postgis/postgis` pelo mesmo motivo: o teste tem de
-- rodar o mesmo comando que a produção roda.
create extension if not exists postgis with schema extensions;

begin;

-- Tudo o que vem abaixo declara colunas `geography` e chama `ST_*`. O tipo é
-- resolvido pelo search_path na hora de criar a tabela, então ele é declarado
-- aqui em vez de qualificado vinte vezes. `set local` morre no commit e não
-- vaza para a migration seguinte nem para o setup.sql concatenado.
set local search_path = public, extensions;

create type sos_alert_status as enum ('active', 'cancelled', 'ended', 'expired');

-- ---------------------------------------------------------------------------
-- Consentimento, participação e como te reconhecer
--
-- Fica em `user_preferences` porque é 1:1 com o motorista e a tabela já é
-- escrita pelo próprio dono (ver 000550_grants). Um alerta não serve para nada
-- se quem chega não sabe qual carro procurar, e é por isso que cor e placa
-- moram junto da preferência: são dados do alerta, não do veículo.
--
-- Da placa guardamos SÓ as três primeiras letras. Não é uma máscara na tela:
-- é o que existe no banco. Máscara se contorna lendo a coluna; ausência não.
-- ---------------------------------------------------------------------------
alter table user_preferences
  add column sos_consent_at timestamptz,
  add column sos_network_opt_in boolean not null default false,
  add column sos_vehicle_colour text
    check (sos_vehicle_colour is null or length(btrim(sos_vehicle_colour)) between 2 and 30),
  add column sos_plate_prefix text
    check (sos_plate_prefix is null or sos_plate_prefix ~ '^[A-Z]{3}$');

comment on column user_preferences.sos_consent_at is
  'Quando o motorista aceitou a tela de consentimento do SOS. Nulo = função desligada.';
comment on column user_preferences.sos_network_opt_in is
  'Aceitou RECEBER alertas de outros motoristas e, com isso, ser encontrável por distância.';
comment on column user_preferences.sos_plate_prefix is
  'As três primeiras letras da placa. A placa inteira nunca é armazenada.';

-- ---------------------------------------------------------------------------
-- Contatos de emergência: no máximo 3, garantido pelo banco
--
-- O limite é um `slot` de 1 a 3 com unicidade por usuário, e não um gatilho que
-- conta linhas: contar linhas tem corrida entre duas inserções simultâneas, um
-- índice único não tem.
-- ---------------------------------------------------------------------------
create table emergency_contacts (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles(id) on delete cascade,
  slot       smallint not null check (slot between 1 and 3),
  name       text not null check (length(btrim(name)) > 0),
  -- Dígitos, com ou sem o + do país. Frouxo de propósito: recusar o telefone
  -- de alguém por formato, numa tela de emergência, é pior que aceitar um
  -- número que o discador vai resolver.
  phone      text not null check (btrim(phone) ~ '^\+?[0-9]{10,15}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slot)
);

create index emergency_contacts_user_idx on emergency_contacts (user_id);

create trigger emergency_contacts_updated_at before update on emergency_contacts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Onde os participantes da rede estão
--
-- Uma linha por motorista, sobrescrita: isto é presença, não histórico. O
-- trajeto de uma jornada já mora em `journey_routes`, é opt-in próprio e não
-- alimenta esta tabela.
--
-- Ninguém, nem administrador, lê a linha de outra pessoa. A única coisa que
-- consulta esta tabela é `sos_nearby_drivers`, que roda como dona e devolve id
-- e distância. A coordenada não sai daqui.
-- ---------------------------------------------------------------------------
create table driver_locations (
  user_id    uuid primary key references profiles(id) on delete cascade,
  position   geography(point, 4326) not null,
  accuracy_m integer check (accuracy_m is null or accuracy_m >= 0),
  updated_at timestamptz not null default now()
);

-- O índice que faz o ST_DWithin valer a pena.
create index driver_locations_position_idx on driver_locations using gist (position);
-- E o que permite varrer só o que está velho na hora da limpeza.
create index driver_locations_updated_idx on driver_locations (updated_at);

comment on table driver_locations is
  'Presença dos participantes da rede de alerta. Nunca legível por outro usuário.';

-- ---------------------------------------------------------------------------
-- Os alertas
--
-- Esta tabela é, ao mesmo tempo, o estado do alerta e o registro de auditoria
-- pedido pela LGPD: quem, quando, onde, e se foi cancelado. Por isso a linha
-- de um alerta cancelado ou encerrado continua existindo com a posição. O que
-- muda é que ela deixa de ser legível por quem foi avisado (ver a política de
-- select abaixo).
--
-- O carro é copiado para cá no momento do disparo em vez de lido por join. Duas
-- razões: quem recebe o alerta não pode ter permissão de ler o veículo nem as
-- preferências de outra pessoa, e o que foi avisado tem de continuar sendo o
-- que foi avisado mesmo que o motorista troque de carro depois.
-- ---------------------------------------------------------------------------
create table sos_alerts (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references profiles(id) on delete cascade,
  -- Nulo só no registro de um alerta abortado antes de existir posição.
  position       geography(point, 4326),
  -- As mesmas coordenadas em dois números, derivadas da coluna acima.
  --
  -- Não é duplicação por conveniência: a API devolve uma coluna `geography`
  -- como WKB hexadecimal (`0101000020E6100000…`), que nenhum mapa do
  -- aplicativo consome. Quem recebe o alerta precisa de latitude e longitude
  -- para desenhar o ponto, e uma coluna gerada mantém a geografia como única
  -- fonte, não há como as duas discordarem.
  lat            double precision generated always as (ST_Y(position::geometry)) stored,
  lon            double precision generated always as (ST_X(position::geometry)) stored,
  accuracy_m     integer check (accuracy_m is null or accuracy_m >= 0),
  status         sos_alert_status not null default 'active',
  vehicle_label  text,
  vehicle_colour text,
  plate_prefix   text,
  notified_count integer not null default 0 check (notified_count >= 0),
  created_at     timestamptz not null default now(),
  -- Trinta minutos. Depois disso o compartilhamento para sozinho, mesmo que
  -- ninguém toque em nada, inclusive se o celular do motorista morreu.
  expires_at     timestamptz not null,
  cancelled_at   timestamptz,
  ended_at       timestamptz,
  -- Disparos do modo demonstração do link de teste. Nunca avisam ninguém e
  -- nunca entram em relatório.
  is_demo        boolean not null default false
);

create index sos_alerts_user_idx on sos_alerts (user_id, created_at desc);
create index sos_alerts_live_idx on sos_alerts (expires_at) where status = 'active';

comment on table sos_alerts is
  'Estado e auditoria de cada disparo do SOS, cancelamentos incluídos.';

-- Quem foi avisado de qual alerta. É o que autoriza a leitura da linha do
-- alerta e é a outra metade da auditoria: quantas pessoas realmente receberam.
create table sos_alert_recipients (
  alert_id    uuid not null references sos_alerts(id) on delete cascade,
  user_id     uuid not null references profiles(id) on delete cascade,
  distance_m  integer not null check (distance_m >= 0),
  notified_at timestamptz not null default now(),
  primary key (alert_id, user_id)
);

create index sos_alert_recipients_user_idx on sos_alert_recipients (user_id, notified_at desc);

-- ---------------------------------------------------------------- limites ----
-- Um alerta a cada 10 minutos, três por dia. Ficam aqui, e não em
-- `app_settings`, porque a tela também precisa saber o número para explicar a
-- recusa, e dois lugares editáveis divergem. A tela mostra; o banco decide.
create or replace function sos_min_interval() returns interval
language sql immutable set search_path = public, extensions as $$ select interval '10 minutes' $$;

create or replace function sos_daily_limit() returns integer
language sql immutable set search_path = public, extensions as $$ select 3 $$;

/** Raio da rede, em metros. */
create or replace function sos_radius_m() returns integer
language sql immutable set search_path = public, extensions as $$ select 5000 $$;

/** Quanto tempo um alerta fica ativo, e quanto tempo uma presença vale. */
create or replace function sos_alert_ttl() returns interval
language sql immutable set search_path = public, extensions as $$ select interval '30 minutes' $$;

-- ------------------------------------------------------------------ RLS ----
alter table emergency_contacts   enable row level security;
alter table driver_locations     enable row level security;
alter table sos_alerts           enable row level security;
alter table sos_alert_recipients enable row level security;

-- Contatos de emergência: só o dono, e o administrador TAMBÉM NÃO.
-- É o telefone de um terceiro que nunca usou o Dinamique e nunca concordou com
-- nada. O `is_admin()` que as outras tabelas de usuário carregam existe para
-- dar suporte a quem pede ajuda; aqui ele só criaria uma lista de telefones de
-- familiares legível pelo painel.
create policy emergency_contacts_select_own on emergency_contacts
  for select using (user_id = auth.uid());
create policy emergency_contacts_insert_own on emergency_contacts
  for insert with check (user_id = auth.uid());
create policy emergency_contacts_update_own on emergency_contacts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy emergency_contacts_delete_own on emergency_contacts
  for delete using (user_id = auth.uid());

-- Presença: só a própria linha, em qualquer operação. Sem exceção de
-- administrador: a busca por proximidade não passa por aqui, ela roda como
-- dona da função.
create policy driver_locations_select_own on driver_locations
  for select using (user_id = auth.uid());
create policy driver_locations_delete_own on driver_locations
  for delete using (user_id = auth.uid());

-- Alertas. A terceira cláusula é a regra inteira do capítulo de privacidade:
-- quem foi avisado lê o alerta ENQUANTO ele está ativo, e só.
create policy sos_alerts_select_visible on sos_alerts
  for select using (
    user_id = auth.uid()
    or is_admin()
    or (
      status = 'active'
      and expires_at > now()
      and exists (
        select 1 from sos_alert_recipients r
        where r.alert_id = sos_alerts.id and r.user_id = auth.uid()
      )
    )
  );

-- Nenhuma política de insert/update/delete: disparar, cancelar e encerrar
-- passam pelas funções abaixo, que é onde os limites são verificados.

-- Só a própria linha. Deliberadamente SEM uma cláusula para o dono do alerta,
-- por duas razões que apontam para o mesmo lugar:
--
--   * privacidade: quem pediu socorro precisa saber QUANTAS pessoas foram
--     avisadas, e esse número está em `sos_alerts.notified_count`. Quem são
--     elas é a lista de quem estava por perto, e isso não é dele;
--   * recursão: a política de `sos_alerts` consulta esta tabela, então uma
--     cláusula aqui consultando `sos_alerts` de volta faz o Postgres recusar a
--     consulta inteira com "infinite recursion detected in policy". Não é
--     teoria: foi o que aconteceu na primeira versão deste arquivo.
create policy sos_alert_recipients_select_own on sos_alert_recipients
  for select using (user_id = auth.uid() or is_admin());

-- --------------------------------------------------------------- grants ----
grant select on emergency_contacts, driver_locations, sos_alerts, sos_alert_recipients
  to authenticated;
grant insert, update, delete on emergency_contacts to authenticated;
-- Apagar a própria presença é a versão imediata de "parar de compartilhar", e
-- não deve depender de uma função ter respondido.
grant delete on driver_locations to authenticated;

-- ---------------------------------------------------------------------------
-- Quem está por perto
--
-- Devolve id e distância. NUNCA coordenada: é o que permite que a busca
-- atravesse o RLS sem que a posição de ninguém atravesse com ela.
--
-- Os filtros, em ordem de importância: participou da rede, consentiu, não é o
-- próprio, a presença é recente, a conta é real, e está dentro do raio.
-- `ST_DWithin` fica por último de propósito: é o único que usa índice, e o
-- planner prefere reduzir antes de medir.
-- ---------------------------------------------------------------------------
create or replace function sos_nearby_drivers(
  p_point   geography,
  p_exclude uuid,
  p_radius_m integer default null
)
returns table (user_id uuid, distance_m integer)
language sql
stable
security definer
set search_path = public, extensions
as $$
  select dl.user_id,
         round(ST_Distance(dl.position, p_point))::integer as distance_m
  from driver_locations dl
  join user_preferences up on up.user_id = dl.user_id
  join profiles p          on p.id = dl.user_id
  where up.sos_network_opt_in
    and up.sos_consent_at is not null
    and dl.user_id <> p_exclude
    and dl.updated_at > now() - sos_alert_ttl()
    and p.blocked_at is null
    and not p.is_demo
    and ST_DWithin(dl.position, p_point, coalesce(p_radius_m, sos_radius_m()))
  order by 2;
$$;

-- Ninguém chama isto direto. Ela recebe um ponto arbitrário, e responder
-- "quantos motoristas existem em volta deste ponto" para qualquer ponto é um
-- mapa da base montado uma consulta por vez.
revoke execute on function sos_nearby_drivers(geography, uuid, integer)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publicar a própria posição
--
-- Só grava de quem entrou na rede e consentiu. Um `false` de volta não é erro:
-- é a resposta honesta de que nada foi gravado, e a tela usa isso para não
-- dizer que está compartilhando quando não está.
-- ---------------------------------------------------------------------------
create or replace function sos_share_location(
  p_lat      double precision,
  p_lon      double precision,
  p_accuracy integer default null
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_ok   boolean;
begin
  if v_user is null then
    raise exception 'sos_auth_required';
  end if;

  if p_lat is null or p_lon is null
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'sos_invalid_position';
  end if;

  select up.sos_network_opt_in and up.sos_consent_at is not null
    into v_ok
  from user_preferences up
  where up.user_id = v_user;

  if coalesce(v_ok, false) = false then
    return false;
  end if;

  insert into driver_locations (user_id, position, accuracy_m, updated_at)
  values (v_user, ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography,
          p_accuracy, now())
  on conflict (user_id) do update
    set position = excluded.position,
        accuracy_m = excluded.accuracy_m,
        updated_at = now();

  return true;
end;
$$;

revoke execute on function sos_share_location(double precision, double precision, integer)
  from public, anon;
grant execute on function sos_share_location(double precision, double precision, integer)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Disparar
--
-- Aqui moram os limites. Não porque o cliente seja malicioso, mas porque uma
-- tela recarregada, um toque duplo ou um aplicativo reinstalado apagam
-- qualquer contagem que viva nele, e a rede inteira paga por isso.
--
-- Um alerta cancelado não conta para nenhum dos dois limites: o cancelamento
-- de cinco segundos existe justamente para o alarme falso não custar nada. O
-- mesmo vale para um disparo de demonstração, ver o `if` em volta dos limites.
--
-- O dia é o dia do motorista (America/Sao_Paulo), o mesmo fuso em que
-- `daily_totals` agrupa. Vinte e quatro horas corridas puniriam quem trabalha
-- virando a noite.
-- ---------------------------------------------------------------------------
create or replace function sos_trigger(
  p_lat      double precision,
  p_lon      double precision,
  p_accuracy integer default null,
  p_demo     boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user     uuid := auth.uid();
  v_prefs    record;
  v_point    geography;
  v_alert    sos_alerts;
  v_recent   integer;
  v_today    integer;
  v_label    text;
  v_notified integer := 0;
  v_demo     boolean := coalesce(p_demo, false);
begin
  if v_user is null then
    raise exception 'sos_auth_required';
  end if;

  if p_lat is null or p_lon is null
     or p_lat not between -90 and 90 or p_lon not between -180 and 180 then
    raise exception 'sos_invalid_position';
  end if;

  select up.sos_consent_at, up.sos_vehicle_colour, up.sos_plate_prefix
    into v_prefs
  from user_preferences up
  where up.user_id = v_user;

  if v_prefs.sos_consent_at is null then
    raise exception 'sos_consent_required';
  end if;

  -- Os dois limites, e o `if` em volta deles.
  --
  -- Uma demonstração não acorda ninguém, não chama a polícia e não avisa
  -- contato nenhum: ela não tem contra o que ser limitada, nem pode consumir o
  -- limite do alerta de verdade. Quem testa a função para entender como ela
  -- funciona e é assaltado oito minutos depois não pode ser recusado por causa
  -- do teste. Por isso um disparo de demonstração não é contado E não é
  -- contra nada: as duas metades, senão a regra vale para um lado só.
  if not v_demo then
    select count(*)::integer into v_recent
    from sos_alerts a
    where a.user_id = v_user
      and a.status <> 'cancelled'
      and not a.is_demo
      and a.created_at > now() - sos_min_interval();

    if v_recent > 0 then
      raise exception 'sos_rate_limited';
    end if;

    select count(*)::integer into v_today
    from sos_alerts a
    where a.user_id = v_user
      and a.status <> 'cancelled'
      and not a.is_demo
      and (a.created_at at time zone 'America/Sao_Paulo')::date
          = (now() at time zone 'America/Sao_Paulo')::date;

    if v_today >= sos_daily_limit() then
      raise exception 'sos_daily_limit';
    end if;
  end if;

  v_point := ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography;

  -- O carro, como quem chega vai procurá-lo: marca, modelo e ano do catálogo,
  -- ou o que o motorista escreveu quando o catálogo não tinha o veículo dele.
  select coalesce(
           nullif(btrim(concat_ws(' ', mk.name, md.name, uv.model_year)), ''),
           uv.custom_label
         )
    into v_label
  from user_vehicles uv
  left join vehicle_versions vv on vv.id = uv.version_id
  left join vehicle_models   md on md.id = vv.model_id
  left join vehicle_makes    mk on mk.id = md.make_id
  where uv.user_id = v_user and uv.archived_at is null
  order by uv.is_primary desc, uv.created_at
  limit 1;

  insert into sos_alerts (
    user_id, position, accuracy_m, status, vehicle_label, vehicle_colour,
    plate_prefix, expires_at, is_demo
  )
  values (
    v_user, v_point, p_accuracy, 'active', v_label, v_prefs.sos_vehicle_colour,
    v_prefs.sos_plate_prefix, now() + sos_alert_ttl(), v_demo
  )
  returning * into v_alert;

  -- Um disparo de demonstração existe para a pessoa ver a tela funcionando. Ele
  -- registra e expira como qualquer outro, e não acorda ninguém.
  if not v_alert.is_demo then
    insert into sos_alert_recipients (alert_id, user_id, distance_m)
    select v_alert.id, n.user_id, n.distance_m
    from sos_nearby_drivers(v_point, v_user) n;

    select count(*)::integer into v_notified
    from sos_alert_recipients r where r.alert_id = v_alert.id;

    -- A notificação interna vai direto, sem passar por `send_notification`.
    -- Aquela função respeita a preferência por categoria, e é exatamente o que
    -- NÃO deve valer aqui: quem entrou na rede de alerta já disse que quer
    -- receber isto, e um aviso de socorro não pode cair numa caixa que a
    -- pessoa silenciou meses atrás pensando em promoções.
    insert into user_notifications (user_id, category, title, body, deep_link, cta_label)
    select r.user_id,
           'system',
           'Motorista pedindo socorro perto de você',
           'Não se aproxime. Ligue 190 e informe a localização.',
           '/sos/received',
           'Ver o alerta'
    from sos_alert_recipients r
    where r.alert_id = v_alert.id;

    if v_notified > 0 then
      update sos_alerts set notified_count = v_notified where id = v_alert.id;
    end if;
  end if;

  return jsonb_build_object(
    'alert_id',   v_alert.id,
    'notified',   v_notified,
    'radius_m',   sos_radius_m(),
    'expires_at', v_alert.expires_at,
    'is_demo',    v_alert.is_demo
  );
end;
$$;

revoke execute on function sos_trigger(double precision, double precision, integer, boolean)
  from public, anon;
grant execute on function sos_trigger(double precision, double precision, integer, boolean)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Encerrar, e parar de compartilhar no mesmo movimento
--
-- `p_cancelled` separa as duas saídas para a auditoria: "era alarme falso" e
-- "estou bem agora" são fatos diferentes sobre o mesmo alerta.
-- ---------------------------------------------------------------------------
create or replace function sos_close(p_alert_id uuid, p_cancelled boolean default false)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_rows integer;
begin
  if v_user is null then
    raise exception 'sos_auth_required';
  end if;

  update sos_alerts
     -- O `case` devolve `text`, e a coluna é um enum: sem o cast explícito o
     -- Postgres recusa a atribuição em tempo de execução.
     set status       = (case when p_cancelled then 'cancelled' else 'ended' end)::sos_alert_status,
         cancelled_at = case when p_cancelled then now() else cancelled_at end,
         ended_at     = case when p_cancelled then ended_at else now() end
   where id = p_alert_id
     and user_id = v_user
     and status = 'active';

  get diagnostics v_rows = row_count;

  -- A posição para de ser publicada junto com o alerta, e não no próximo
  -- batimento da tela. Quem participa da rede volta a publicar quando o
  -- aplicativo estiver aberto de novo.
  delete from driver_locations where user_id = v_user;

  return v_rows > 0;
end;
$$;

revoke execute on function sos_close(uuid, boolean) from public, anon;
grant execute on function sos_close(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- O alerta que morreu na contagem de cinco segundos
--
-- Registrado porque a auditoria pede "se foi cancelado", e um cancelamento que
-- não deixa linha nenhuma é indistinguível de um disparo que nunca houve. Não
-- avisa ninguém, não conta limite, e a posição é opcional: se o GPS ainda não
-- tinha respondido, o registro vale sem ela.
-- ---------------------------------------------------------------------------
create or replace function sos_log_aborted(
  p_lat double precision default null,
  p_lon double precision default null
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user uuid := auth.uid();
  v_id   uuid;
begin
  if v_user is null then
    raise exception 'sos_auth_required';
  end if;

  insert into sos_alerts (
    user_id, position, status, expires_at, cancelled_at
  )
  values (
    v_user,
    case
      when p_lat is null or p_lon is null then null
      else ST_SetSRID(ST_MakePoint(p_lon, p_lat), 4326)::geography
    end,
    'cancelled',
    now(),
    now()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function sos_log_aborted(double precision, double precision)
  from public, anon;
grant execute on function sos_log_aborted(double precision, double precision)
  to authenticated;

-- ---------------------------------------------------------------------------
-- A limpeza que não depende de ninguém estar com o aplicativo aberto
--
-- Trinta minutos é o prazo prometido na tela de consentimento, e é esta função
-- que o cumpre: ela vale mesmo se o celular do motorista apagou no meio do
-- alerta. Agendada com pg_cron (ver supabase/functions/README.md).
-- ---------------------------------------------------------------------------
create or replace function sos_expire_alerts()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_expired integer;
begin
  update sos_alerts
     set status = 'expired'
   where status = 'active' and expires_at <= now();

  get diagnostics v_expired = row_count;

  -- Presença velha não é presença. Some sozinha pelo mesmo prazo, para um
  -- alerta nunca ser encaminhado a alguém que passou ali há uma hora.
  delete from driver_locations where updated_at <= now() - sos_alert_ttl();

  return v_expired;
end;
$$;

revoke execute on function sos_expire_alerts() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Nada para quem não está logado
--
-- A Supabase concede `select` em toda tabela nova ao papel `anon` por default
-- privileges, e o Postgres concede `execute` em toda função nova ao pseudo-papel
-- PUBLIC, do qual `anon` herda. O RLS destas tabelas já não devolveria linha
-- nenhuma sem sessão, mas "a política salva" é uma defesa a menos do que "não
-- há permissão", e este é o assunto errado para depender de uma só.
-- ---------------------------------------------------------------------------
revoke all on emergency_contacts, driver_locations, sos_alerts, sos_alert_recipients
  from anon;
-- As quatro constantes são chamadas só de dentro das funções acima, que rodam
-- como donas. O cliente conhece os mesmos números pela sua própria cópia (ver
-- packages/business-logic/src/safety.ts), e quem decide continua sendo o banco.
revoke execute on function sos_min_interval() from public, anon, authenticated;
revoke execute on function sos_daily_limit() from public, anon, authenticated;
revoke execute on function sos_radius_m()    from public, anon, authenticated;
revoke execute on function sos_alert_ttl()   from public, anon, authenticated;

commit;
