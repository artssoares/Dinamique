-- ============================================================================
-- Correção de segurança encontrada pelo verificador da Supabase.
--
-- Dois furos reais, ambos invisíveis nos testes locais porque o ambiente de
-- teste não reproduzia dois comportamentos da Supabase. Estão corrigidos aqui
-- e o ambiente de teste passou a reproduzi-los (test/supabase_shim.sql).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FURO 1 – views analíticas ignoravam o Row Level Security
--
-- No Postgres 15+, uma view SEM `security_invoker` roda com as permissões de
-- quem a criou, e não de quem consulta. Como as views analíticas tinham
-- `grant select ... to authenticated`, QUALQUER motorista logado conseguia
-- ler o faturamento, o lucro, a cidade e o plano de TODOS os outros pelo
-- endpoint /rest/v1/analytics_user_financials.
--
-- Isso contradiz diretamente a regra de que um usuário comum nunca vê dado
-- individual de outro (§108).
--
-- Com `security_invoker = true` a view passa a respeitar as políticas de quem
-- consulta: o administrador continua vendo tudo (as políticas já preveem
-- `is_admin()`), e o motorista passa a ver apenas a própria linha.
-- ---------------------------------------------------------------------------

alter view analytics_users               set (security_invoker = true);
alter view analytics_user_financials     set (security_invoker = true);
alter view analytics_acquisition         set (security_invoker = true);
alter view analytics_influencers         set (security_invoker = true);
alter view analytics_platforms           set (security_invoker = true);
alter view analytics_vehicles            set (security_invoker = true);
alter view analytics_support             set (security_invoker = true);
alter view analytics_support_categories  set (security_invoker = true);

-- `benchmark_user_metrics` é a exceção deliberada: ela PRECISA enxergar todos
-- os usuários, porque calcular uma mediana sobre uma única pessoa não é
-- mediana. A proteção aqui não é o RLS – é o fato de ninguém poder lê-la.
-- Só as views agregadas derivadas dela são legíveis, e elas nunca devolvem
-- linha de usuário, apenas mediana e tamanho de amostra com mínimo de 20 (§44).
revoke all on benchmark_user_metrics from anon, authenticated;

-- Consequência que só apareceu ao testar: com a view de base bloqueada, as
-- views agregadas precisam rodar com as permissões do dono para continuarem
-- enxergando todos os usuários. Sem isso o benchmark quebra com
-- "permission denied for view benchmark_user_metrics".
--
-- A proteção do benchmark nunca foi o RLS: é o fato de a view de base não ter
-- grant nenhum, de as agregadas devolverem só mediana e tamanho de amostra, e
-- do mínimo de 20 usuários por grupo (§44).
alter view benchmark_buckets  set (security_invoker = false);
alter view benchmark_national set (security_invoker = false);

-- ---------------------------------------------------------------------------
-- FURO 2 – funções de servidor eram chamáveis por qualquer um
--
-- A Supabase concede EXECUTE em novas funções para `anon` e `authenticated`
-- por padrão (alter default privileges). O `revoke ... from public` que as
-- migrations faziam NÃO remove uma concessão feita diretamente a esses papéis.
--
-- Resultado: `apply_subscription_state` estava acessível sem login em
-- /rest/v1/rpc/apply_subscription_state – qualquer pessoa na internet podia
-- conceder Pro vitalício a si mesma. `consume_discount_benefit` permitia
-- queimar o desconto de outro usuário, e `send_notification` permitia disparar
-- notificação para toda a base.
--
-- A revogação agora nomeia os papéis explicitamente.
--
-- E há uma SEGUNDA porta, encontrada pelo teste depois da primeira correção:
-- o próprio Postgres concede EXECUTE ao pseudo-papel PUBLIC em toda função
-- nova. `anon` herda de PUBLIC. Ou seja, revogar de `anon` e `authenticated`
-- não bastava – a função continuava chamável sem login pela herança. Por isso
-- todo `revoke` abaixo nomeia `public` junto com os dois papéis.
-- ---------------------------------------------------------------------------

-- Somente o servidor (service_role) executa estas.
revoke execute on function apply_subscription_state(uuid, text, text, billing_interval, billing_status, timestamptz, boolean) from public, anon, authenticated;
revoke execute on function consume_discount_benefit(uuid, text) from public, anon, authenticated;
revoke execute on function mark_referral_converted(uuid) from public, anon, authenticated;
revoke execute on function send_notification(notification_audience, notification_category, text, text, text, text, text) from public, anon, authenticated;
revoke execute on function resolve_audience(notification_audience) from public, anon, authenticated;
revoke execute on function process_reminders() from public, anon, authenticated;
revoke execute on function import_vehicle(text, text, text, text, integer, text, text, integer, integer) from public, anon, authenticated;
revoke execute on function seed_vehicle(text, text, vehicle_type, text, integer, text, fuel_type, integer, integer) from public, anon, authenticated;

-- Funções de gatilho: são executadas pelo próprio gatilho, nunca por chamada
-- direta. Chamá-las pela API não faria nada útil, mas não há motivo para a
-- porta existir.
revoke execute on function handle_new_user() from public, anon, authenticated;
revoke execute on function set_updated_at() from public, anon, authenticated;
revoke execute on function support_message_touch_ticket() from public, anon, authenticated;
revoke execute on function user_attribution_is_immutable() from public, anon, authenticated;
revoke execute on function seed_notification_preferences() from public, anon, authenticated;
revoke execute on function unaccent_simple(text) from public, anon, authenticated;

-- Estas continuam abertas ao usuário logado DE PROPÓSITO, e só a ele:
--   redeem_code      – resgatar um código é ação do próprio usuário; todas as
--                      regras antifraude rodam dentro dela
--   mark_ticket_read – marcar o próprio atendimento como lido
revoke execute on function redeem_code(text) from public, anon;
revoke execute on function mark_ticket_read(uuid) from public, anon;
grant execute on function redeem_code(text) to authenticated;
grant execute on function mark_ticket_read(uuid) to authenticated;

-- `handle_new_user` é disparada pelo gatilho em auth.users, que roda sob o
-- papel do serviço de autenticação da Supabase. O Postgres não checa EXECUTE
-- na hora de disparar um gatilho (a checagem acontece ao criar o gatilho), mas
-- quebrar o cadastro seria caro demais para se apoiar só nisso: o grant
-- explícito abaixo mantém o cadastro funcionando de qualquer forma.
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function handle_new_user() to supabase_auth_admin';
  end if;
end
$$;

-- `is_admin`, `has_admin_role` e `benchmark_min_sample` NÃO são revogadas:
-- elas são chamadas de dentro das políticas de RLS e das views. Sem permissão
-- de execução, toda política que as usa passaria a falhar. Além disso, elas
-- respondem apenas sobre quem está perguntando ou sobre uma configuração
-- pública – não expõem nada.

-- ---------------------------------------------------------------------------
-- Endurecimento adicional: search_path fixo
--
-- Sem `search_path` fixo, uma função SECURITY DEFINER pode ser induzida a
-- chamar um objeto plantado em outro schema. Nenhuma destas é explorável hoje,
-- mas fixar o caminho é gratuito.
-- ---------------------------------------------------------------------------

alter function set_updated_at()                set search_path = public;
alter function support_message_touch_ticket()  set search_path = public;
alter function user_attribution_is_immutable() set search_path = public;
alter function unaccent_simple(text)           set search_path = public;
alter function seed_notification_preferences() set search_path = public;
alter function seed_vehicle(text, text, vehicle_type, text, integer, text, fuel_type, integer, integer) set search_path = public;
alter function benchmark_min_sample()          set search_path = public;
