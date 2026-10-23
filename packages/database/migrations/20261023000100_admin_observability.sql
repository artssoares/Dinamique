-- ============================================================================
-- Observabilidade do painel: erros do aplicativo e a área de testes.
--
-- Duas perguntas que o painel ainda não conseguia responder:
--
--   1. "o que quebrou para os usuários?"  → app_errors / app_error_events
--   2. "o aplicativo inteiro ainda funciona?" → qa_suites / qa_cases /
--      qa_runs / qa_results
--
-- Erros chegam agrupados, não um por ocorrência. Uma tela que quebra para
-- duzentos motoristas é UM problema com duzentas ocorrências, e uma lista de
-- duzentas linhas iguais esconde exatamente isso.
-- ============================================================================

-- Ordem crescente de gravidade de propósito: o `greatest()` abaixo depende
-- dela para que uma ocorrência fatal promova um problema antes classificado
-- como aviso, e nunca o contrário.
create type app_error_severity as enum ('warning', 'error', 'fatal');
create type app_error_status   as enum ('new', 'investigating', 'resolved', 'ignored');

-- Um problema distinto. A identidade é a `fingerprint`, não o id, porque é ela
-- que decide se a falha de agora é a mesma de ontem.
create table app_errors (
  id              bigserial primary key,
  fingerprint     text not null unique,
  source          text not null check (source in ('mobile', 'admin', 'server')),
  severity        app_error_severity not null default 'error',
  title           text not null,
  detail          text,
  screen          text,
  app_version     text,
  platform        text check (platform in ('ios', 'android', 'web', 'admin')),
  occurrences     integer not null default 1,
  context         jsonb not null default '{}'::jsonb,
  status          app_error_status not null default 'new',
  note            text,
  resolved_by     uuid references profiles(id) on delete set null,
  resolved_at     timestamptz,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now()
);

create index app_errors_status_idx on app_errors (status, last_seen_at desc);
create index app_errors_last_seen_idx on app_errors (last_seen_at desc);

-- Cada ocorrência. Serve para duas coisas que o agrupado não dá: quantos
-- usuários distintos foram atingidos, e se a falha parou depois da correção.
create table app_error_events (
  id          bigserial primary key,
  error_id    bigint not null references app_errors(id) on delete cascade,
  user_id     uuid references profiles(id) on delete set null,
  app_version text,
  platform    text,
  context     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index app_error_events_error_idx on app_error_events (error_id, created_at desc);
create index app_error_events_user_idx on app_error_events (user_id, created_at desc);

-- Quantos usuários distintos cada problema atingiu. Uma coluna contada na hora
-- da escrita mentiria no dia em que uma conta fosse apagada.
create or replace view app_error_impact
with (security_invoker = true) as
  select
    error_id,
    count(*)                                   as occurrence_count,
    count(distinct user_id)                    as affected_users,
    max(created_at)                            as newest_at
  from app_error_events
  group by error_id;

-- ----------------------------------------------------------------------------
-- Registro de erro: a única porta de entrada.
--
-- SECURITY DEFINER porque o aplicativo não tem (e não pode ter) permissão de
-- escrita em app_errors: senão qualquer um reabriria, reescreveria ou
-- apagaria o histórico de falhas. A função aceita só o que ela mesma valida.
-- ----------------------------------------------------------------------------
create or replace function report_app_error(
  p_source      text,
  p_title       text,
  p_detail      text default null,
  p_screen      text default null,
  p_severity    text default 'error',
  p_app_version text default null,
  p_platform    text default null,
  p_context     jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
-- `extensions` entra junto porque numa Supabase é lá que moram pgcrypto e
-- citext, e um search_path preso em `public` cega a função para elas.
set search_path = public, extensions
as $$
declare
  v_source      text := lower(coalesce(p_source, 'mobile'));
  v_severity    app_error_severity;
  v_title       text := nullif(btrim(p_title), '');
  v_screen      text := nullif(btrim(p_screen), '');
  v_signature   text;
  v_fingerprint text;
  v_error_id    bigint;
begin
  if v_title is null then
    return null;
  end if;

  if v_source not in ('mobile', 'admin', 'server') then
    v_source := 'mobile';
  end if;

  begin
    v_severity := lower(coalesce(p_severity, 'error'))::app_error_severity;
  exception when others then
    v_severity := 'error';
  end;

  -- Agrupamento. Tiramos da assinatura o que muda a cada ocorrência — ids,
  -- números, horários — para que a MESMA falha não apareça como cem falhas.
  v_signature := lower(left(v_title, 300));
  v_signature := regexp_replace(v_signature, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', '<id>', 'g');
  v_signature := regexp_replace(v_signature, '[0-9]+', '<n>', 'g');
  v_signature := regexp_replace(v_signature, '\s+', ' ', 'g');

  v_fingerprint := md5(v_source || '|' || coalesce(v_screen, '') || '|' || v_signature);

  insert into app_errors (
    fingerprint, source, severity, title, detail, screen, app_version, platform, context
  )
  values (
    v_fingerprint, v_source, v_severity, left(v_title, 500), left(p_detail, 8000),
    v_screen, p_app_version, p_platform, coalesce(p_context, '{}'::jsonb)
  )
  on conflict (fingerprint) do update set
    occurrences  = app_errors.occurrences + 1,
    last_seen_at = now(),
    detail       = coalesce(left(excluded.detail, 8000), app_errors.detail),
    app_version  = coalesce(excluded.app_version, app_errors.app_version),
    platform     = coalesce(excluded.platform, app_errors.platform),
    severity     = greatest(app_errors.severity, excluded.severity),
    -- Um problema marcado como resolvido que volta a acontecer deixa de estar
    -- resolvido. Quem decidiu ignorar continua ignorando.
    status       = case when app_errors.status = 'resolved' then 'new'::app_error_status
                        else app_errors.status end,
    resolved_at  = case when app_errors.status = 'resolved' then null else app_errors.resolved_at end
  returning id into v_error_id;

  insert into app_error_events (error_id, user_id, app_version, platform, context)
  values (v_error_id, auth.uid(), p_app_version, p_platform, coalesce(p_context, '{}'::jsonb));

  return v_error_id;
end;
$$;

comment on function report_app_error is
  'Registra uma falha do aplicativo, agrupada por assinatura. Única porta de escrita em app_errors.';

-- ============================================================================
-- Área de testes.
--
-- Um roteiro escrito (suítes → casos) e uma execução (rodada → resultados).
-- O roteiro é editável no painel porque quem testa é quem sabe o que mudou;
-- um roteiro fixo no código envelhece em uma semana.
-- ============================================================================

create type qa_result_status as enum ('pass', 'fail', 'blocked', 'skipped');

create table qa_suites (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  position    integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table qa_cases (
  id          uuid primary key default gen_random_uuid(),
  suite_id    uuid not null references qa_suites(id) on delete cascade,
  title       text not null,
  steps       text,
  expected    text,
  is_critical boolean not null default false,
  position    integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index qa_cases_suite_idx on qa_cases (suite_id, position);

create table qa_runs (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  app_version text,
  platform    text,
  started_by  uuid references profiles(id) on delete set null,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  note        text
);

create index qa_runs_started_idx on qa_runs (started_at desc);

create table qa_results (
  id        uuid primary key default gen_random_uuid(),
  run_id    uuid not null references qa_runs(id) on delete cascade,
  case_id   uuid not null references qa_cases(id) on delete cascade,
  status    qa_result_status not null,
  note      text,
  error_id  bigint references app_errors(id) on delete set null,
  tested_by uuid references profiles(id) on delete set null,
  tested_at timestamptz not null default now(),
  -- Um caso tem UM resultado por rodada. Sem isto, marcar "passou" e depois
  -- "falhou" deixaria as duas linhas e a rodada não teria resposta.
  unique (run_id, case_id)
);

create index qa_results_run_idx on qa_results (run_id);

create trigger qa_suites_updated_at before update on qa_suites
  for each row execute function set_updated_at();
create trigger qa_cases_updated_at before update on qa_cases
  for each row execute function set_updated_at();

-- Placar de cada rodada, para a lista não ter de somar no navegador.
create or replace view qa_run_summary
with (security_invoker = true) as
  select
    r.id as run_id,
    count(res.id)                                                  as tested,
    count(*) filter (where res.status = 'pass')                     as passed,
    count(*) filter (where res.status = 'fail')                     as failed,
    count(*) filter (where res.status = 'blocked')                  as blocked,
    count(*) filter (where res.status = 'skipped')                  as skipped
  from qa_runs r
  left join qa_results res on res.run_id = r.id
  group by r.id;

-- ============================================================================
-- Atividade dos usuários, numa lista só.
--
-- O painel precisa de UMA linha do tempo, e os fatos moram em quatro tabelas.
-- A view junta os quatro; a frase em português é montada no código, onde pode
-- ser testada.
-- ============================================================================
create or replace view admin_activity_feed
with (security_invoker = true) as
    select
      'event'::text        as kind,
      e.created_at         as at,
      e.user_id            as user_id,
      e.event              as code,
      e.properties         as detail,
      e.platform           as platform,
      e.app_version        as app_version
    from analytics_events e
  union all
    select 'account', p.created_at, p.id, 'account_created', '{}'::jsonb, null, null
    from profiles p
  union all
    select
      'plan',
      s.created_at,
      s.user_id,
      'plan_granted',
      jsonb_build_object('plan', s.plan, 'source', s.source, 'expires_at', s.expires_at),
      null,
      null
    from subscriptions s
  union all
    select
      'error',
      ev.created_at,
      ev.user_id,
      'app_error',
      jsonb_build_object('error_id', er.id, 'title', er.title, 'screen', er.screen),
      ev.platform,
      ev.app_version
    from app_error_events ev
    join app_errors er on er.id = ev.error_id;

-- ============================================================================
-- Segurança
-- ============================================================================

alter table app_errors       enable row level security;
alter table app_error_events enable row level security;
alter table qa_suites        enable row level security;
alter table qa_cases         enable row level security;
alter table qa_runs          enable row level security;
alter table qa_results       enable row level security;

-- Erros são lidos só por admin. Um usuário não lê nem os próprios: o texto de
-- uma falha carrega caminho de arquivo, consulta e, às vezes, dado de outro.
create policy app_errors_select_admin on app_errors
  for select using (is_admin());

create policy app_errors_update_admin on app_errors
  for update using (has_admin_role(array['superadmin', 'admin']::admin_role[]))
  with check (has_admin_role(array['superadmin', 'admin']::admin_role[]));

create policy app_error_events_select_admin on app_error_events
  for select using (is_admin());

-- O roteiro de testes: todo admin lê, quem opera escreve.
do $$
declare
  t text;
begin
  foreach t in array array['qa_suites', 'qa_cases', 'qa_runs', 'qa_results'] loop
    execute format('create policy %I_select_admin on %I for select using (is_admin())', t, t);
    execute format(
      'create policy %I_write_admin on %I for all using (has_admin_role(array[''superadmin'', ''admin'', ''support'']::admin_role[])) with check (has_admin_role(array[''superadmin'', ''admin'', ''support'']::admin_role[]))',
      t, t
    );
  end loop;
end $$;

-- O cliente nunca escreve em app_errors direto; escreve chamando a função.
grant select on app_errors, app_error_events, app_error_impact to authenticated;
grant select, insert, update, delete on qa_suites, qa_cases, qa_runs, qa_results to authenticated;
grant select on qa_run_summary, admin_activity_feed to authenticated;

-- Reportar exige sessão, e isto é uma escolha com um custo conhecido.
--
-- Sem sessão (a tela de login, o cadastro) a falha NÃO chega aqui. Seria bom
-- que chegasse. Mas abrir esta função para `anon` abriria uma porta de escrita
-- no banco para qualquer um que tenha a chave pública — que é pública — e a
-- regra deste projeto é que nada nosso seja chamável sem login. Perder a falha
-- da tela de login é mais barato do que ter uma tabela que estranhos enchem.
--
-- Os dois nomes no `revoke` são necessários, pelos dois caminhos que abrem uma
-- função nova: o Postgres concede EXECUTE ao pseudo-papel PUBLIC, de que
-- `anon` herda, e a Supabase concede a `anon` direto por `alter default
-- privileges`. Revogar de um só deixaria o outro de pé — foi o que a
-- 20260818001500_security_hardening.sql aprendeu da primeira vez.
revoke execute on function report_app_error(text, text, text, text, text, text, text, jsonb)
  from public, anon;
grant execute on function report_app_error(text, text, text, text, text, text, text, jsonb)
  to authenticated;

-- ============================================================================
-- Roteiro inicial: o aplicativo inteiro, área por área.
--
-- Editável no painel depois. Está aqui para que a área de testes não nasça
-- vazia, que é o que faz ninguém usá-la.
-- ============================================================================
with suite as (
  insert into qa_suites (name, description, position) values
    ('Conta e primeiro acesso', 'Cadastro, login, recuperação de senha e onboarding.', 10),
    ('Veículo',                 'Cadastro do veículo pelo catálogo e à mão.',           20),
    ('Jornada',                 'Começar, pausar, retomar e encerrar o dia.',           30),
    ('Ganhos e gastos',         'Lançar corrida, gasto, abastecimento e recorrentes.',   40),
    ('Números e metas',         'Resumo do dia, histórico, metas e nota do dia.',        50),
    ('Insights e comparativo',  'Frases de insight e o comparativo com outros.',         60),
    ('Plano e assinatura',      'Teste grátis, limites do plano free e compra do Pro.',  70),
    ('Indicações e códigos',    'Indicar amigo, resgatar código, benefícios.',           80),
    ('Suporte',                 'Abrir ticket, responder e acompanhar.',                 90),
    ('Notificações',            'Receber, abrir e silenciar notificações.',             100),
    ('Exportar dados',          'Gerar e compartilhar o relatório do motorista.',       110),
    ('Segurança e SOS',         'Rede de alerta, disparo e cancelamento do SOS.',       120),
    ('Offline',                 'Lançar sem internet e sincronizar depois.',            130),
    ('Aparência e acessibilidade', 'Tema claro/escuro, fontes grandes, contraste.',     140),
    ('Painel administrativo',   'As telas do próprio painel.',                          150)
  returning id, name
)
insert into qa_cases (suite_id, title, steps, expected, is_critical, position)
select suite.id, c.title, c.steps, c.expected, c.is_critical, c.position
from suite
join (values
  -- Conta e primeiro acesso
  ('Conta e primeiro acesso', 'Criar conta nova com email e senha', 'Abrir o app sem estar logado, toque em "Criar conta", preencher nome, email e senha.', 'A conta é criada, o perfil aparece e o onboarding abre.', true, 10),
  ('Conta e primeiro acesso', 'Entrar com conta existente', 'Informar email e senha corretos.', 'Entra direto na tela inicial.', true, 20),
  ('Conta e primeiro acesso', 'Senha errada mostra mensagem clara', 'Informar a senha errada de propósito.', 'Aparece "Email ou senha incorretos", sem código técnico.', false, 30),
  ('Conta e primeiro acesso', 'Recuperar senha', 'Pedir recuperação de senha e abrir o link do email.', 'Consegue definir uma senha nova e entrar com ela.', true, 40),
  ('Conta e primeiro acesso', 'Onboarding até o fim', 'Responder todas as etapas do onboarding.', 'Chega na tela inicial e o onboarding não volta a abrir.', true, 50),
  ('Conta e primeiro acesso', 'Sair da conta', 'Usar "Sair" no menu.', 'Volta para a tela de login e não dá para voltar sem entrar.', false, 60),
  ('Conta e primeiro acesso', 'Apagar a conta', 'Pedir exclusão da conta pelo menu.', 'A conta e os dados são apagados e o app volta ao login.', false, 70),
  -- Veículo
  ('Veículo', 'Cadastrar carro pelo catálogo', 'Escolher marca, modelo e versão na lista.', 'O veículo é salvo com o consumo de referência preenchido.', true, 10),
  ('Veículo', 'Cadastrar veículo fora do catálogo', 'Usar "Não encontrei meu veículo" e digitar à mão.', 'Salva sem travar e o app continua funcionando sem consumo de referência.', false, 20),
  ('Veículo', 'Trocar o veículo principal', 'Cadastrar um segundo veículo e marcá-lo como principal.', 'Só um fica como principal.', false, 30),
  ('Veículo', 'Cadastrar moto', 'Escolher o tipo moto.', 'Os campos se ajustam ao tipo e salva.', false, 40),
  -- Jornada
  ('Jornada', 'Começar uma jornada', 'Toque em começar na aba Registrar.', 'A jornada aparece como ativa na tela inicial, com o tempo contando.', true, 10),
  ('Jornada', 'Pausar e retomar', 'Pausar, esperar um minuto, retomar.', 'O tempo pausado não conta como tempo trabalhado.', true, 20),
  ('Jornada', 'Encerrar a jornada com quilometragem', 'Encerrar informando o odômetro final.', 'A distância do dia aparece correta no resumo.', true, 30),
  ('Jornada', 'Encerrar sem informar distância', 'Encerrar deixando a distância em branco.', 'O resumo mostra os valores por hora e omite os por km, sem mostrar zero.', true, 40),
  ('Jornada', 'Não deixar duas jornadas abertas', 'Com uma jornada ativa, tentar começar outra.', 'O app impede e explica que já existe uma em andamento.', false, 50),
  -- Ganhos e gastos
  ('Ganhos e gastos', 'Lançar uma corrida', 'Informar valor e plataforma.', 'O ganho entra no total do dia na hora.', true, 10),
  ('Ganhos e gastos', 'Lançar um gasto', 'Escolher categoria e valor.', 'O gasto abate do lucro do dia.', true, 20),
  ('Ganhos e gastos', 'Lançar abastecimento', 'Informar litros, valor e tipo de combustível.', 'O consumo médio e o custo por km se atualizam.', true, 30),
  ('Ganhos e gastos', 'Custo recorrente', 'Cadastrar um custo mensal (aluguel, seguro).', 'O valor é rateado nos dias e aparece no custo por km.', false, 40),
  ('Ganhos e gastos', 'Apagar um lançamento', 'Apagar uma corrida lançada.', 'O total do dia volta ao que era.', false, 50),
  ('Ganhos e gastos', 'Centavos e vírgula', 'Digitar 12,50 e 1.234,56.', 'Os valores salvam exatos, sem arredondar errado.', true, 60),
  -- Números e metas
  ('Números e metas', 'Resumo do dia', 'Abrir a tela inicial depois de lançar ganhos e gastos.', 'Lucro, R$/hora e R$/km batem com a conta feita à mão.', true, 10),
  ('Números e metas', 'Histórico por dia', 'Abrir o histórico e navegar entre dias.', 'Cada dia mostra os próprios números.', false, 20),
  ('Números e metas', 'Criar meta', 'Criar meta semanal de lucro.', 'A barra de progresso acompanha os lançamentos.', false, 30),
  ('Números e metas', 'Meta atingida', 'Lançar o suficiente para bater a meta.', 'O app avisa que a meta foi atingida.', false, 40),
  ('Números e metas', 'Nota do dia', 'Fechar um dia completo.', 'A nota aparece e é explicada em texto.', false, 50),
  -- Insights
  ('Insights e comparativo', 'Ver insights', 'Abrir a aba de insights com histórico suficiente.', 'As frases fazem sentido e citam números reais.', false, 10),
  ('Insights e comparativo', 'Comparativo sem gente suficiente', 'Abrir o comparativo numa base pequena.', 'Explica que faltam participantes em vez de mostrar número inventado.', true, 20),
  -- Plano
  ('Plano e assinatura', 'Teste grátis de 7 dias', 'Criar conta nova e abrir a tela de plano.', 'Mostra o teste ativo e quantos dias faltam.', true, 10),
  ('Plano e assinatura', 'Limite do plano free', 'Com o teste expirado, usar um recurso Pro.', 'Explica o limite e oferece o Pro, sem travar o app.', true, 20),
  ('Plano e assinatura', 'Assinar o Pro', 'Completar a compra.', 'O plano vira Pro e os recursos liberam.', false, 30),
  ('Plano e assinatura', 'Cancelar a assinatura', 'Cancelar pelo portal.', 'Continua Pro até o fim do período pago.', false, 40),
  -- Indicações
  ('Indicações e códigos', 'Compartilhar meu código', 'Abrir "Minhas indicações" e compartilhar.', 'O código é o mesmo sempre e o compartilhamento abre.', false, 10),
  ('Indicações e códigos', 'Resgatar código de amigo', 'Criar conta nova e resgatar o código.', 'O benefício é concedido para os dois.', false, 20),
  ('Indicações e códigos', 'Não aceitar o próprio código', 'Tentar resgatar o próprio código.', 'O app recusa e explica.', true, 30),
  ('Indicações e códigos', 'Não aceitar o mesmo código duas vezes', 'Resgatar o mesmo código de novo.', 'O app recusa.', true, 40),
  -- Suporte
  ('Suporte', 'Abrir um ticket', 'Escolher categoria, escrever e enviar.', 'O ticket aparece na lista com número.', true, 10),
  ('Suporte', 'Receber resposta', 'Responder pelo painel e voltar ao app.', 'A resposta aparece e o aviso de não lida some.', true, 20),
  ('Suporte', 'Nota interna não aparece', 'Escrever nota interna no painel.', 'O usuário não vê a nota de jeito nenhum.', true, 30),
  -- Notificações
  ('Notificações', 'Receber notificação', 'Disparar uma notificação pelo painel.', 'Chega no aparelho e na caixa do app.', false, 10),
  ('Notificações', 'Abrir pelo aviso', 'Toque na notificação.', 'Abre a tela certa.', false, 20),
  ('Notificações', 'Silenciar uma categoria', 'Desligar uma categoria nas configurações.', 'Para de receber dessa categoria.', false, 30),
  -- Exportar
  ('Exportar dados', 'Gerar relatório', 'Escolher o período e gerar.', 'O arquivo sai com os números do período.', false, 10),
  ('Exportar dados', 'Compartilhar o arquivo', 'Usar o compartilhamento do aparelho.', 'Abre o menu de compartilhar com o arquivo anexado.', false, 20),
  -- SOS
  ('Segurança e SOS', 'Cadastrar contato de emergência', 'Adicionar um contato.', 'O contato fica salvo e aparece na lista.', false, 10),
  ('Segurança e SOS', 'Disparar o SOS', 'Segurar o botão até o fim da contagem.', 'O alerta é criado e os contatos são avisados.', true, 20),
  ('Segurança e SOS', 'Cancelar durante a contagem', 'Soltar/cancelar antes do fim.', 'Nenhum alerta é enviado.', true, 30),
  -- Offline
  ('Offline', 'Lançar sem internet', 'Ativar o modo avião e lançar uma corrida.', 'O app aceita, avisa que está offline e guarda.', true, 10),
  ('Offline', 'Sincronizar ao voltar', 'Desligar o modo avião.', 'O lançamento sobe e não duplica.', true, 20),
  -- Aparência
  ('Aparência e acessibilidade', 'Tema escuro', 'Trocar para escuro.', 'Todas as telas ficam legíveis, sem texto apagado.', false, 10),
  ('Aparência e acessibilidade', 'Fonte grande do sistema', 'Aumentar a fonte no sistema operacional.', 'Nada é cortado nem some.', false, 20),
  -- Painel
  ('Painel administrativo', 'Entrar no painel', 'Abrir dinamique.com.br/admin e entrar.', 'Entra e vê o dashboard.', true, 10),
  ('Painel administrativo', 'Quem não é admin não entra', 'Entrar com uma conta comum.', 'Mostra "sem acesso" e nenhum dado.', true, 20),
  ('Painel administrativo', 'Cadastrar outro admin', 'Promover uma conta em Administradores.', 'A conta passa a entrar no painel.', false, 30),
  ('Painel administrativo', 'Conceder Pro a um usuário', 'Usar a ficha do usuário.', 'O plano muda e o usuário é avisado.', false, 40),
  ('Painel administrativo', 'Ver atividades e erros', 'Abrir Atividades e Erros.', 'As listas carregam com texto compreensível.', false, 50)
) as c(suite_name, title, steps, expected, is_critical, position)
  on c.suite_name = suite.name;
