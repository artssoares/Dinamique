-- ============================================================================
-- Database behaviour tests: signup, referral antifraud, RLS isolation and
-- support internal-note confidentiality.
--
-- Run with: pnpm --filter @dinamique/database test
-- Any FAIL line means a security or business rule regressed.
-- ============================================================================
\set ON_ERROR_STOP on
\pset pager off

create or replace function assert(condition boolean, label text)
returns void language plpgsql as $$
begin
  if condition then raise notice 'PASS  %', label;
  else raise exception 'FAIL  %', label;
  end if;
end;
$$;

-- Simulates an authenticated request the way PostgREST does.
create or replace function login_as(p_user uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p_user::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  execute 'set local role authenticated';
end;
$$;

do $$
declare
  v_arthur uuid := gen_random_uuid();
  v_marcos uuid := gen_random_uuid();
  v_eve    uuid := gen_random_uuid();
  v_admin  uuid := gen_random_uuid();
  v_code   text;
  v_result jsonb;
  v_ticket uuid;
  v_count  integer;
begin
  -- ------------------------------------------------------------- signup ---
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_arthur, 'arthur@example.com', '{"full_name": "Arthur Soares"}'::jsonb),
         (v_marcos, 'marcos@example.com', '{"full_name": "Marcos Lima"}'::jsonb),
         (v_eve,    'eve@example.com',    '{"full_name": "Eve Silva"}'::jsonb),
         (v_admin,  'admin@example.com',  '{"full_name": "Admin User"}'::jsonb);

  perform assert(
    (select count(*) from profiles where id in (v_arthur, v_marcos, v_eve)) = 3,
    'signup creates a profile for every new auth user');

  perform assert(
    (select first_name from profiles where id = v_arthur) = 'Arthur',
    'signup derives the first name from user metadata');

  perform assert(
    (select count(*) from subscriptions
     where user_id = v_arthur and source = 'trial' and plan = 'pro') = 1,
    'signup grants a 7-day Pro trial (§57)');

  perform assert(
    (select plan from current_plans where user_id = v_arthur) = 'pro'
    and (select is_trial from current_plans where user_id = v_arthur),
    'a new user resolves to Pro on trial');

  select code into v_code from promotion_codes where owner_user_id = v_arthur;
  perform assert(v_code like 'ARTHUR%', 'signup issues a personal referral code: ' || v_code);

  perform assert(
    (select count(*) from notification_preferences where user_id = v_arthur) > 0,
    'signup seeds notification preferences');

  -- ---------------------------------------------- referral: happy path ---
  perform login_as(v_marcos);
  v_result := redeem_code(v_code);
  reset role;

  perform assert(v_result ->> 'ok' = 'true', 'a valid referral code is accepted');
  perform assert((v_result ->> 'benefit_amount')::bigint = 1000,
    'the referred user receives R$ 10 (§83)');
  perform assert(
    (select count(*) from referrals
     where referrer_user_id = v_arthur and referred_user_id = v_marcos) = 1,
    'the referral is recorded against both users');
  perform assert(
    (select amount from discount_benefits where user_id = v_marcos) = 1000,
    'a discount benefit is granted to the REFERRED user, not the referrer');
  perform assert(
    (select count(*) from discount_benefits where user_id = v_arthur) = 0,
    'the referrer receives no automatic benefit (§83)');
  perform assert(
    (select use_count from promotion_codes where code = v_code) = 1,
    'the code use counter increments');

  -- ------------------------------------------------- referral: antifraud ---
  perform login_as(v_arthur);
  v_result := redeem_code(v_code);
  reset role;
  perform assert(v_result ->> 'reason' = 'self_referral',
    'a user cannot redeem their own code (§85)');

  perform login_as(v_marcos);
  v_result := redeem_code(v_code);
  reset role;
  perform assert(v_result ->> 'reason' = 'already_attributed',
    'a code cannot be redeemed twice by the same account (§85)');

  perform login_as(v_eve);
  v_result := redeem_code('NAOEXISTE');
  reset role;
  perform assert(v_result ->> 'reason' = 'not_found', 'an unknown code is rejected');

  -- Expired code
  insert into promotion_codes (code, kind, benefit_amount, expires_at)
  values ('EXPIRADO1', 'campaign', 500, now() - interval '1 day');
  perform login_as(v_eve);
  v_result := redeem_code('EXPIRADO1');
  reset role;
  perform assert(v_result ->> 'reason' = 'expired', 'an expired code is rejected (§85)');

  -- Exhausted code
  insert into promotion_codes (code, kind, benefit_amount, max_uses, use_count)
  values ('ESGOTADO1', 'campaign', 500, 5, 5);
  perform login_as(v_eve);
  v_result := redeem_code('ESGOTADO1');
  reset role;
  perform assert(v_result ->> 'reason' = 'exhausted', 'a code past its use limit is rejected');

  -- Attribution is first-touch and immutable (§91)
  begin
    update user_attribution set source = 'hacked' where user_id = v_marcos;
    perform assert(false, 'attribution should be immutable');
  exception when others then
    perform assert(true, 'first-touch attribution cannot be overwritten (§91)');
  end;

  -- ------------------------------------------------------------- RLS -----
  insert into revenues (user_id, date, amount) values (v_arthur, current_date, 30000);
  insert into revenues (user_id, date, amount) values (v_marcos, current_date, 10000);

  perform login_as(v_marcos);
  select count(*) into v_count from revenues;
  reset role;
  perform assert(v_count = 1, 'a user only sees their own revenue rows (RLS)');

  -- Writing a row on someone else's behalf must be refused.
  perform login_as(v_eve);
  begin
    insert into revenues (user_id, date, amount) values (v_arthur, current_date, 99999);
    reset role;
    perform assert(false, 'cross-user insert should be blocked by RLS');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'a user cannot write rows owned by someone else (RLS)');
  end;

  -- ------------------------------------------- support confidentiality ---
  insert into support_tickets (user_id, subject) values (v_arthur, 'Não consigo exportar')
  returning id into v_ticket;

  insert into support_messages (ticket_id, author_kind, author_id, body)
  values (v_ticket, 'user', v_arthur, 'Bom dia, o Excel não abre.');

  insert into support_messages (ticket_id, author_kind, body, is_internal_note)
  values (v_ticket, 'agent', 'Cliente já reclamou disso 3x – verificar plano.', true);

  insert into support_messages (ticket_id, author_kind, body)
  values (v_ticket, 'agent', 'Olá Arthur, vamos verificar!');

  perform login_as(v_arthur);
  select count(*) into v_count from support_messages where ticket_id = v_ticket;
  reset role;
  perform assert(v_count = 2,
    'internal notes are invisible to the user at row level (§74)');

  perform assert(
    (select first_agent_reply_at is not null from support_tickets where id = v_ticket),
    'the first agent reply timestamp is recorded for SLA reporting (§92)');

  perform assert(
    (select last_message_at from support_tickets where id = v_ticket)
      = (select max(created_at) from support_messages
         where ticket_id = v_ticket and not is_internal_note),
    'an internal note does not count as user-visible activity');

  -- A user cannot forge a message as the support team.
  perform login_as(v_arthur);
  begin
    insert into support_messages (ticket_id, author_kind, author_id, body)
    values (v_ticket, 'agent', v_arthur, 'Você ganhou Pro grátis!');
    reset role;
    perform assert(false, 'user should not be able to post as an agent');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'a user cannot impersonate the support team (RLS)');
  end;

  -- ------------------------------------------------------ admin access ---
  insert into admin_users (user_id, role) values (v_admin, 'support');

  perform login_as(v_admin);
  select count(*) into v_count from support_messages where ticket_id = v_ticket;
  reset role;
  perform assert(v_count = 3, 'an admin sees internal notes');

  perform login_as(v_admin);
  select count(*) into v_count from revenues;
  reset role;
  perform assert(v_count = 2, 'an admin can read user data for support');

  -- ------------------------------------------------- structural guards ---
  begin
    insert into referrals (referrer_user_id, referred_user_id, code_id)
    values (v_eve, v_eve, (select id from promotion_codes where owner_user_id = v_arthur));
    perform assert(false, 'self-referral row should be rejected');
  exception when check_violation then
    perform assert(true, 'the database itself rejects a self-referral row (§85)');
  end;

  begin
    insert into referrals (referrer_user_id, referred_user_id, code_id)
    values (v_eve, v_marcos, (select id from promotion_codes where owner_user_id = v_arthur));
    perform assert(false, 'a second attribution should be rejected');
  exception when unique_violation then
    perform assert(true, 'a referred account can only ever have one referrer (§85)');
  end;

  begin
    insert into journeys (user_id, started_at, status) values (v_arthur, now(), 'active');
    insert into journeys (user_id, started_at, status) values (v_arthur, now(), 'active');
    perform assert(false, 'two active journeys should be rejected');
  exception when unique_violation then
    perform assert(true, 'a user can only have one journey running at a time');
  end;

  raise notice '';
  raise notice 'ALL DATABASE TESTS PASSED';
end;
$$;

-- ============================================================================
-- Segunda bateria: motor de notificações e lembretes.
-- ============================================================================
do $$
declare
  v_a uuid := gen_random_uuid();
  v_b uuid := gen_random_uuid();
  v_c uuid := gen_random_uuid();
  v_sent integer;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_a, 'sp@example.com', '{"full_name":"Ana Paulista"}'::jsonb),
    (v_b, 'rj@example.com', '{"full_name":"Bruno Carioca"}'::jsonb),
    (v_c, 'off@example.com','{"full_name":"Carla Silenciosa"}'::jsonb);

  update profiles set city='São Paulo', state='SP', work_modes='{rideshare}' where id=v_a;
  update profiles set city='Rio de Janeiro', state='RJ', work_modes='{delivery}' where id=v_b;
  update profiles set city='São Paulo', state='SP', work_modes='{rideshare}' where id=v_c;

  -- Carla desligou notificações promocionais.
  update notification_preferences set in_app=false
  where user_id=v_c and category='promotions';

  -- Segmentação por cidade
  select send_notification(
    row(null, array['São Paulo'], null, null, null, null, null)::notification_audience,
    'news', 'Novidade', 'Chegou o relatório em Excel.', null, null, null
  ) into v_sent;
  perform assert(v_sent = 2, 'segmentação por cidade atinge só quem é da cidade (§100)');

  -- Preferência do usuário é respeitada
  select send_notification(
    row(null, array['São Paulo'], null, null, null, null, null)::notification_audience,
    'promotions', 'Promoção', 'Pro com desconto.', null, null, null
  ) into v_sent;
  perform assert(v_sent = 1, 'quem desativou a categoria não recebe (§58)');

  -- Segmentação por modalidade
  select send_notification(
    row(null, null, null, array['delivery']::work_mode[], null, null, null)::notification_audience,
    'news', 'Delivery', 'Novidade para entregadores.', null, null, null
  ) into v_sent;
  perform assert(v_sent = 1, 'segmentação por modalidade funciona');

  -- Contas de demonstração ficam de fora de qualquer envio
  update profiles set is_demo = true where id = v_b;
  select send_notification(
    row(null, null, null, array['delivery']::work_mode[], null, null, null)::notification_audience,
    'news', 'Delivery', 'Segunda tentativa.', null, null, null
  ) into v_sent;
  perform assert(v_sent = 0, 'contas de demonstração nunca recebem envio real');
  update profiles set is_demo = false where id = v_b;

  -- ------------------------------------------------------------ lembretes --
  insert into free_flow_records (user_id, operator, passed_at, remind_at)
  values (v_a, 'Bandeirantes', current_date, now() - interval '1 hour');

  insert into fines (user_id, description, issued_at, amount, discount_deadline)
  values (v_a, 'Velocidade', current_date, 19500, current_date + 1);

  insert into maintenance_logs (user_id, date, amount, next_due_date)
  values (v_a, current_date, 30000, current_date + 2);

  select process_reminders() into v_sent;
  perform assert(v_sent = 3, 'lembretes vencidos viram notificações (§50, §51, §34)');

  -- Rodar de novo não pode duplicar nada.
  select process_reminders() into v_sent;
  perform assert(v_sent = 0, 'processar lembretes duas vezes não duplica notificações');

  perform assert(
    (select count(*) from user_notifications
     where user_id = v_a and category = 'free_flow') = 1,
    'a notificação de Free Flow aponta para a categoria certa');

  raise notice '';
  raise notice 'TESTES DE NOTIFICAÇÃO PASSARAM';
end;
$$;

-- ============================================================================
-- Terceira bateria: permissões finas.
-- ============================================================================
do $$
declare
  v_user uuid := gen_random_uuid();
  v_note uuid;
begin
  insert into auth.users (id, email) values (v_user, 'grants@example.com');

  insert into user_notifications (user_id, category, title, body)
  values (v_user, 'system', 'Original', 'Corpo original')
  returning id into v_note;

  -- Marcar como lida precisa funcionar.
  perform login_as(v_user);
  update user_notifications set read_at = now() where id = v_note;
  reset role;
  perform assert(
    (select read_at is not null from user_notifications where id = v_note),
    'o usuário consegue marcar a própria notificação como lida');

  -- Reescrever o texto NÃO pode.
  perform login_as(v_user);
  begin
    update user_notifications set title = 'ADULTERADO' where id = v_note;
    reset role;
    perform assert(false, 'usuário não deveria reescrever o texto da notificação');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'o usuário não pode reescrever o texto da notificação');
  end;

  -- Criar notificação para si mesmo também não.
  perform login_as(v_user);
  begin
    insert into user_notifications (user_id, category, title, body)
    values (v_user, 'promotions', 'Ganhei Pro', 'Sério');
    reset role;
    perform assert(false, 'usuário não deveria criar notificação');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'o usuário não pode criar notificação para si mesmo');
  end;

  -- E não pode se dar um plano.
  perform login_as(v_user);
  begin
    insert into subscriptions (user_id, plan, source) values (v_user, 'pro', 'subscription');
    reset role;
    perform assert(false, 'usuário não deveria conceder plano a si mesmo');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'o usuário não pode conceder Pro a si mesmo');
  end;

  -- Nem criar um código de indicação com o benefício que quiser.
  perform login_as(v_user);
  begin
    insert into promotion_codes (code, kind, owner_user_id, benefit_amount)
    values ('GRATIS99', 'campaign', v_user, 9900000);
    reset role;
    perform assert(false, 'usuário não deveria criar código promocional');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'o usuário não pode criar código promocional');
  end;

  raise notice '';
  raise notice 'TESTES DE PERMISSÃO PASSARAM';
end;
$$;

-- ============================================================================
-- Quarta bateria: cobrança.
-- ============================================================================
do $$
declare
  v_user  uuid := gen_random_uuid();
  v_ref   uuid := gen_random_uuid();
  v_code  text;
  v_sub   uuid;
  v_res   jsonb;
  v_end   timestamptz := now() + interval '30 days';
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_ref,  'indicador@example.com', '{"full_name":"Indicador"}'::jsonb),
    (v_user, 'assinante@example.com', '{"full_name":"Assinante"}'::jsonb);

  -- Preços vieram da migration com os valores comerciais.
  perform assert(
    (select amount from billing_prices where interval = 'month' and is_active) = 1990,
    'preço mensal é R$ 19,90');
  perform assert(
    (select amount from billing_prices where interval = 'year' and is_active) = 4990,
    'preço anual é R$ 49,90');

  -- O assinante entrou por indicação e ganhou o desconto.
  select code into v_code from promotion_codes where owner_user_id = v_ref;
  perform login_as(v_user);
  perform redeem_code(v_code);
  reset role;

  perform assert(
    (select amount from discount_benefits where user_id = v_user and status = 'granted') = 1000,
    'o indicado recebeu R$ 10 de desconto');

  -- ------------------------------------------------- assinatura ativada -----
  select apply_subscription_state(
    v_user, 'sub_teste', 'price_mensal', 'month'::billing_interval,
    'active'::billing_status, v_end, false
  ) into v_sub;

  perform assert(
    (select plan from current_plans where user_id = v_user) = 'pro',
    'assinatura ativa concede Pro');
  perform assert(
    (select expires_at from subscriptions where id = v_sub) = v_end,
    'o fim do período pago vira a validade do plano');

  -- Reprocessar o MESMO evento não pode criar segunda assinatura.
  perform apply_subscription_state(
    v_user, 'sub_teste', 'price_mensal', 'month'::billing_interval,
    'active'::billing_status, v_end, false
  );
  perform assert(
    (select count(*) from subscriptions where stripe_subscription_id = 'sub_teste') = 1,
    'reenvio do webhook não duplica assinatura');

  -- ---------------------------------------------------- desconto usado ------
  select consume_discount_benefit(v_user, 'sub_teste') into v_res;
  perform assert((v_res ->> 'applied')::boolean, 'o desconto é consumido na assinatura');
  perform assert((v_res ->> 'amount')::bigint = 1000, 'o valor consumido é R$ 10');

  -- E não pode ser usado de novo numa renovação.
  select consume_discount_benefit(v_user, 'sub_teste') into v_res;
  perform assert(not (v_res ->> 'applied')::boolean,
    'o desconto vale uma vez só, mesmo na renovação (§85)');

  perform mark_referral_converted(v_user);
  perform assert(
    (select status from referrals where referred_user_id = v_user) = 'converted',
    'a indicação é marcada como convertida quando o indicado assina (§87)');

  -- -------------------------------------------------- cobrança falhando -----
  perform apply_subscription_state(
    v_user, 'sub_teste', 'price_mensal', 'month'::billing_interval,
    'past_due'::billing_status, v_end, false
  );
  perform assert(
    (select plan from current_plans where user_id = v_user) = 'pro',
    'past_due mantém o Pro enquanto o Stripe ainda tenta cobrar');

  -- ------------------------------------------------------- cancelamento -----
  perform apply_subscription_state(
    v_user, 'sub_teste', 'price_mensal', 'month'::billing_interval,
    'canceled'::billing_status, now() - interval '1 day', false
  );

  -- A assinatura paga deixa de valer imediatamente...
  perform assert(
    (select count(*) from subscriptions
     where stripe_subscription_id = 'sub_teste'
       and cancelled_at is not null) = 1,
    'cancelamento marca a assinatura como cancelada');

  -- ...mas o trial de 7 dias do cadastro continua de pé, e isso está certo:
  -- quem cancela dentro do período de teste não perde os dias que sobraram.
  perform assert(
    (select plan from current_plans where user_id = v_user) = 'pro'
    and (select is_trial from current_plans where user_id = v_user),
    'cancelar a assinatura paga não tira o trial que ainda está valendo');

  -- Sem o trial, aí sim volta para o Free.
  update subscriptions set cancelled_at = now()
  where user_id = v_user and source = 'trial';

  perform assert(
    (select plan from current_plans where user_id = v_user) = 'free',
    'sem assinatura e sem trial, o usuário volta ao Free');

  -- --------------------------------------------- cancelamento agendado ------
  perform apply_subscription_state(
    v_user, 'sub_agendada', 'price_anual', 'year'::billing_interval,
    'active'::billing_status, v_end, true
  );
  perform assert(
    (select plan from current_plans where user_id = v_user) = 'pro',
    'cancelamento agendado mantém o acesso até o fim do período pago');
  perform assert(
    (select cancel_at_period_end from subscriptions where stripe_subscription_id = 'sub_agendada'),
    'o cancelamento agendado fica registrado');

  -- ------------------------------------------------------- permissões -------
  perform login_as(v_user);
  begin
    insert into billing_prices (plan, interval, amount) values ('pro', 'month', 1);
    reset role;
    perform assert(false, 'usuário não deveria criar preço');
  exception when others then
    reset role;
    perform assert(true, 'o usuário não pode inventar um preço para si');
  end;

  perform login_as(v_user);
  begin
    update subscriptions set billing_status = 'active', expires_at = now() + interval '10 years'
    where user_id = v_user;
    reset role;
    perform assert(
      (select plan from current_plans where user_id = v_user) = 'pro'
      and (select count(*) from subscriptions
           where user_id = v_user and expires_at > now() + interval '5 years') = 0,
      'o usuário não consegue estender a própria assinatura');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'o usuário não pode alterar a própria assinatura');
  end;

  raise notice '';
  raise notice 'TESTES DE COBRANÇA PASSARAM';
end;
$$;

-- ============================================================================
-- Quinta bateria: superfície exposta pela API.
--
-- Esta bateria existe porque um furo real passou despercebido: as funções de
-- servidor estavam chamáveis SEM LOGIN no projeto de produção, e os testes não
-- pegaram porque o ambiente local não reproduzia os default privileges da
-- Supabase. Agora reproduz, e estas asserções falham se alguém adicionar uma
-- função nova sem trancar a porta.
-- ============================================================================
do $$
declare
  v_aberta text;
  v_view   text;
begin
  -- A verificação é por LISTA DE PERMISSÃO, não por lista de proibição: toda
  -- função nossa é considerada fechada até prova em contrário. Assim, uma
  -- função criada amanhã sem `revoke` quebra este teste sozinha, sem ninguém
  -- precisar lembrar de vir aqui adicioná-la.
  --
  -- Ficam de fora as funções que vêm de extensões (citext, pgcrypto), que o
  -- Postgres instala abertas e não expõem nada nosso, e as duas ajudantes
  -- deste próprio arquivo de teste.

  -- Nada nosso pode ser executável SEM LOGIN.
  --
  -- Atenção ao detalhe que causou a segunda rodada de correção: o Postgres
  -- concede EXECUTE ao pseudo-papel PUBLIC em toda função nova, e `anon`
  -- herda de PUBLIC. Por isso `has_function_privilege` continua verdadeiro
  -- mesmo depois de revogar de `anon` – só revogar de `public` fecha.
  select string_agg(p.proname, ', ' order by p.proname) into v_aberta
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid
        and d.classid = 'pg_proc'::regclass
        and d.deptype = 'e'
    )
    and p.proname not in (
      -- Abertas de propósito: só respondem sobre quem está perguntando ou
      -- sobre uma configuração pública, e são usadas dentro das políticas
      -- de RLS – sem execução, toda política que as usa falharia.
      'is_admin', 'has_admin_role', 'benchmark_min_sample',
      -- Ajudantes deste arquivo de teste, que não existem em produção.
      'assert', 'login_as'
    )
    and has_function_privilege('anon', p.oid, 'EXECUTE');

  perform assert(v_aberta is null,
    'nenhuma função nossa é chamável sem login' ||
    coalesce(' – ABERTAS: ' || v_aberta, ''));

  -- Nem por usuário logado, salvo as duas que são ação dele mesmo.
  select string_agg(p.proname, ', ' order by p.proname) into v_aberta
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
    and not exists (
      select 1 from pg_depend d
      where d.objid = p.oid
        and d.classid = 'pg_proc'::regclass
        and d.deptype = 'e'
    )
    and p.proname not in (
      'is_admin', 'has_admin_role', 'benchmark_min_sample',
      'assert', 'login_as',
      -- Ações do próprio usuário: resgatar um código (com todo o antifraude
      -- rodando dentro) e marcar o próprio atendimento como lido.
      'redeem_code', 'mark_ticket_read',
      -- O SOS. São as quatro portas que o motorista precisa abrir por conta
      -- própria: publicar a própria posição, pedir socorro, encerrar e
      -- registrar o alarme falso, e cada uma verifica consentimento, dono e
      -- limite por dentro. A busca por quem está perto NÃO está aqui, de
      -- propósito: ela recebe um ponto qualquer, e responder "quantos
      -- motoristas há em volta deste ponto" para qualquer ponto é um mapa da
      -- base montado uma consulta por vez.
      'sos_share_location', 'sos_trigger', 'sos_close', 'sos_log_aborted',
      -- Excluir a própria conta. A App Store exige que o botão esteja dentro
      -- do aplicativo (5.1.1(v)) e a LGPD dá o mesmo direito, então esta porta
      -- tem de abrir para o usuário logado. Ela não recebe id nenhum: age
      -- sempre sobre `auth.uid()`, e por isso não há a quem ela possa apagar
      -- além de quem a chamou.
      'delete_my_account'
    )
    and has_function_privilege('authenticated', p.oid, 'EXECUTE');

  perform assert(v_aberta is null,
    'nenhuma função de servidor é chamável por usuário logado' ||
    coalesce(' – ABERTAS: ' || v_aberta, ''));

  -- O que É para o usuário chamar continua funcionando. Um `revoke` largo
  -- demais quebraria o resgate de código e o suporte sem quebrar nada acima,
  -- então as duas portas que devem ficar abertas são afirmadas explicitamente.
  perform assert(
    has_function_privilege('authenticated', 'redeem_code(text)'::regprocedure, 'EXECUTE'),
    'o usuário logado continua podendo resgatar um código');
  perform assert(
    not has_function_privilege('anon', 'redeem_code(text)'::regprocedure, 'EXECUTE'),
    'resgatar código exige login');
  perform assert(
    has_function_privilege('authenticated', 'mark_ticket_read(uuid)'::regprocedure, 'EXECUTE'),
    'o usuário logado continua podendo marcar o atendimento como lido');
  perform assert(
    not has_function_privilege('anon', 'mark_ticket_read(uuid)'::regprocedure, 'EXECUTE'),
    'marcar atendimento como lido exige login');
  perform assert(
    has_function_privilege('authenticated', 'delete_my_account()'::regprocedure, 'EXECUTE'),
    'o usuário logado continua podendo excluir a própria conta');
  perform assert(
    not has_function_privilege('anon', 'delete_my_account()'::regprocedure, 'EXECUTE'),
    'excluir conta exige login');

  -- O cadastro depende do gatilho em auth.users: se o papel de autenticação
  -- da Supabase existir, ele precisa continuar podendo executá-lo.
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    perform assert(
      has_function_privilege('supabase_auth_admin', 'handle_new_user()'::regprocedure, 'EXECUTE'),
      'o serviço de autenticação continua podendo criar a conta');
  end if;

  -- Toda view legível pelo usuário precisa respeitar o RLS, com uma exceção
  -- nomeada: as agregadas do benchmark, que existem justamente para cruzar
  -- usuários e nunca devolvem linha individual.
  select string_agg(c.relname, ', ') into v_view
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'v'
    and has_table_privilege('authenticated', c.oid, 'SELECT')
    and coalesce(
          (select option_value from pg_options_to_table(c.reloptions)
           where option_name = 'security_invoker'), 'false') <> 'true'
    and c.relname not in ('benchmark_buckets', 'benchmark_national');

  perform assert(v_view is null,
    'toda view legível pelo usuário respeita o RLS' ||
    coalesce(' – IGNORAM: ' || v_view, ''));

  -- A view por usuário do benchmark não pode ser lida por ninguém.
  perform assert(
    not has_table_privilege('authenticated', 'benchmark_user_metrics'::regclass, 'SELECT'),
    'a base do benchmark não é legível pelo usuário');

  raise notice '';
  raise notice 'TESTES DE SUPERFÍCIE EXPOSTA PASSARAM';
end;
$$;

-- ============================================================================
-- Sexta bateria: as extensões não moram em `public`.
--
-- Numa Supabase, `pgcrypto` e `citext` vêm instaladas no schema `extensions`.
-- Toda função nossa fixa o `search_path` por segurança, e um caminho preso em
-- `public` faz `gen_random_bytes` e o operador de comparação de `citext`
-- sumirem – em produção, e só em produção.
--
-- Foi assim que o cadastro quebrou: ninguém conseguia criar conta, e o teste
-- local passava porque instalava as extensões em `public`.
-- ============================================================================
do $$
declare
  v_presa  text;
  v_user   uuid := gen_random_uuid();
begin
  perform assert(
    (select nspname from pg_namespace n
     join pg_extension e on e.extnamespace = n.oid
     where e.extname = 'pgcrypto') = 'extensions',
    'o ambiente de teste instala as extensões onde a Supabase instala');

  -- Nenhuma função pode ter o caminho preso só em `public`.
  select string_agg(p.proname, ', ' order by p.proname) into v_presa
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proconfig is not null
    and exists (
      select 1 from unnest(p.proconfig) c
      where c like 'search\_path=%' and c not like '%extensions%'
    );

  perform assert(v_presa is null,
    'nenhuma função fica cega para o schema extensions' ||
    coalesce(' – PRESAS EM public: ' || v_presa, ''));

  -- E o caminho crítico de verdade: criar uma conta ponta a ponta.
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_user, 'extensoes@example.com', '{"full_name": "Teste Extensoes"}'::jsonb);

  perform assert(
    (select count(*) from profiles where id = v_user) = 1,
    'o cadastro funciona com as extensões fora de public');
  perform assert(
    (select code from promotion_codes where owner_user_id = v_user) ~ '^[A-Z]+[2-9A-H]{2}$',
    'o código de indicação sai sem caracteres ambíguos: ' ||
    (select code from promotion_codes where owner_user_id = v_user));

  raise notice '';
  raise notice 'TESTES DE EXTENSÕES PASSARAM';
end;
$$;

-- ============================================================================
-- Sexta bateria: produtos vendidos dentro do carro.
-- ============================================================================
do $$
declare
  v_dono  uuid := gen_random_uuid();
  v_outro uuid := gen_random_uuid();
  v_agua  uuid;
  v_conta integer;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_dono,  'vendedor@example.com', '{"full_name":"Vera Vendedora"}'::jsonb),
    (v_outro, 'curioso@example.com',  '{"full_name":"Caio Curioso"}'::jsonb);

  perform assert(
    (select sells_products from profiles where id = v_dono) = false,
    'ninguém vende nada até dizer que vende');

  insert into products (user_id, name, unit_price, unit_cost)
  values (v_dono, 'Água', 500, 150) returning id into v_agua;

  -- O mesmo produto duas vezes divide os números sem motivo. Espaço e caixa
  -- não fazem dois produtos diferentes.
  begin
    insert into products (user_id, name, unit_price) values (v_dono, '  ÁGUA ', 600);
    perform assert(false, 'produto repetido deveria ser recusado');
  exception when unique_violation then
    perform assert(true, 'o mesmo produto não entra duas vezes, nem com outra caixa');
  end;

  -- A venda É uma receita, então tudo que já somava receita soma a venda.
  insert into revenues (user_id, product_id, date, amount, quantity)
  values (v_dono, v_agua, current_date, 1500, 3);

  perform assert(
    (select gross_revenue from daily_totals
     where user_id = v_dono and date = current_date) = 1500,
    'a venda entra no total do dia sem ninguém precisar somar duas tabelas');

  perform assert(
    coalesce((select trip_count from daily_totals
              where user_id = v_dono and date = current_date), 0) = 0,
    'vender três perfumes não vira três corridas');

  -- Uma linha é receita de aplicativo OU venda de produto. As duas ao mesmo
  -- tempo contariam o valor duas vezes na quebra por aplicativo.
  begin
    insert into revenues (user_id, product_id, platform_id, date, amount, quantity)
    values (v_dono, v_agua, (select id from platforms limit 1), current_date, 100, 1);
    perform assert(false, 'receita de aplicativo e de produto na mesma linha deveria ser recusada');
  exception when check_violation then
    perform assert(true, 'uma receita é de aplicativo ou de produto, nunca das duas');
  end;

  -- Tirar um produto de circulação não pode apagar o que já foi vendido.
  update products set is_active = false where id = v_agua;
  select count(*) into v_conta from revenues where product_id = v_agua;
  perform assert(v_conta = 1, 'desativar o produto preserva as vendas antigas');

  -- E o nome volta a ficar livre, porque o índice único só vale para ativos.
  insert into products (user_id, name, unit_price) values (v_dono, 'Água', 700);

  -- ------------------------------------------------------------ isolamento --
  perform login_as(v_outro);
  perform assert(
    (select count(*) from products where user_id = v_dono) = 0,
    'ninguém vê o catálogo de produtos de outra pessoa');

  begin
    insert into products (user_id, name, unit_price) values (v_dono, 'Intruso', 100);
    perform assert(false, 'inserir produto no catálogo alheio deveria ser recusado');
  exception when insufficient_privilege then
    perform assert(true, 'ninguém cadastra produto na conta de outra pessoa');
  end;
  reset role;

  raise notice '';
  raise notice 'TESTES DE PRODUTOS PASSARAM';
end;
$$;

-- ============================================================================
-- Trajetos de GPS.
--
-- Uma rota diz onde alguém esteve, hora a hora — é o dado mais sensível do
-- schema. E `daily_totals` passou a conhecer o GPS, o que dá duas garantias
-- para testar dos dois lados: ele preenche quando não digitaram nada, e some
-- quando digitaram.
-- ============================================================================
do $$
declare
  v_ana    uuid := gen_random_uuid();
  v_bruno  uuid := gen_random_uuid();
  v_j      uuid;
  v_count  integer;
  v_dist   bigint;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_ana,   'ana.rota@example.com',   '{"full_name": "Ana Rocha"}'::jsonb),
         (v_bruno, 'bruno.rota@example.com', '{"full_name": "Bruno Dias"}'::jsonb);

  -- --------------------------------------------------------- propriedade ---
  insert into journeys (user_id, started_at, ended_at, status, distance_gps, route_point_count)
  values (v_ana, now() - interval '8 hours', now(), 'completed', 34200, 180)
  returning id into v_j;

  perform login_as(v_ana);
  insert into journey_routes (journey_id, user_id, polyline, point_count)
  values (v_j, v_ana, '_p~iF~ps|U_ulLnnqC', 2);
  select count(*) into v_count from journey_routes;
  reset role;
  perform assert(v_count = 1, 'um motorista guarda o próprio trajeto');

  perform login_as(v_bruno);
  select count(*) into v_count from journey_routes;
  reset role;
  perform assert(v_count = 0, 'um motorista não enxerga o trajeto de outro (§9)');

  -- Anexar uma rota à jornada alheia seria descobrir por onde ela andou.
  perform login_as(v_bruno);
  begin
    insert into journey_routes (journey_id, user_id, polyline, point_count)
    values (v_j, v_ana, 'abc', 1);
    reset role;
    perform assert(false, 'cross-user route insert should be blocked');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'ninguém anexa um trajeto à jornada de outro (RLS)');
  end;

  -- E nem ocupando a linha em nome próprio: `journey_id` é a chave primária,
  -- então isso bloquearia para sempre o upsert do dono da jornada.
  perform login_as(v_bruno);
  begin
    insert into journey_routes (journey_id, user_id, polyline, point_count)
    values (v_j, v_bruno, 'abc', 1);
    reset role;
    perform assert(false, 'squatting another driver''s journey row should be blocked');
  exception when insufficient_privilege then
    reset role;
    perform assert(true, 'ninguém ocupa a linha de trajeto da jornada de outro');
  end;

  -- ------------------------------------------------------------- cascata ---
  perform login_as(v_ana);
  delete from journeys where id = v_j;
  reset role;
  perform assert(
    (select count(*) from journey_routes where journey_id = v_j) = 0,
    'apagar a jornada apaga o trajeto junto');

  -- ------------------------------------------------- daily_totals e o GPS ---
  -- Sem nada digitado, o GPS preenche.
  insert into journeys (user_id, started_at, ended_at, status, distance_gps)
  values (v_ana, current_date + interval '9 hours', current_date + interval '17 hours',
          'completed', 34200);

  select distance into v_dist from daily_totals
  where user_id = v_ana and date = current_date;
  perform assert(v_dist = 34200,
    'daily_totals usa o GPS quando ninguém digitou km, valor: ' || coalesce(v_dist::text, 'null'));

  -- Com km digitado, o número da pessoa vence e o GPS é ignorado.
  insert into journeys (user_id, started_at, ended_at, status,
                        distance_gps, distance_override)
  values (v_bruno, current_date + interval '9 hours', current_date + interval '17 hours',
          'completed', 34200, 41000);

  select distance into v_dist from daily_totals
  where user_id = v_bruno and date = current_date;
  perform assert(v_dist = 41000,
    'o km digitado vence o GPS em daily_totals (§6), valor: ' || coalesce(v_dist::text, 'null'));

  -- E o par de odômetro continua vencendo o GPS.
  insert into journeys (user_id, started_at, ended_at, status,
                        odometer_start, odometer_end, distance_gps)
  values (v_bruno, current_date - interval '15 hours', current_date - interval '9 hours',
          'completed', 100000, 152000, 34200);

  select distance into v_dist from daily_totals
  where user_id = v_bruno and date = (current_date - interval '15 hours')::date;
  perform assert(v_dist = 52000,
    'o par de odômetro vence o GPS em daily_totals, valor: ' || coalesce(v_dist::text, 'null'));

  -- --------------------------------------------------------- preferências ---
  perform assert(
    (select route_capture_enabled from user_preferences where user_id = v_ana) = false,
    'a captura de trajeto nasce desligada — opt-in, nunca opt-out');
  perform assert(
    (select route_trim_shared from user_preferences where user_id = v_ana) = true,
    'esconder as pontas do trajeto ao compartilhar já vem ligado');
  perform assert(
    (select route_capture_prompted from user_preferences where user_id = v_ana) = false,
    'ninguém foi perguntado ainda sobre a captura de trajeto');
  perform assert(
    (select route_retention_days from user_preferences where user_id = v_ana) = 90,
    'o trajeto expira por padrão, sem ninguém precisar escolher');

  -- "Sempre" é uma escolha legítima, e tem de caber na coluna.
  perform login_as(v_ana);
  update user_preferences set route_retention_days = null where user_id = v_ana;
  reset role;
  perform assert(
    (select route_retention_days from user_preferences where user_id = v_ana) is null,
    'guardar para sempre é alcançável por escolha explícita');

  -- ------------------------------------------------------------ retenção ---
  perform assert(
    has_function_privilege('authenticated', 'prune_expired_routes()', 'execute') = false,
    'a poda de trajetos não é chamável pelo aplicativo');

  -- --------------------------------------------- o contador não é o desenho ---
  -- `route_point_count` é trilha de auditoria, não prova de existência: fica
  -- para trás quando o trajeto é apagado, seja pela retenção, seja pelo botão
  -- "apagar meus trajetos". Quem quiser saber se há desenho tem de perguntar a
  -- `journey_routes`. Isto está aqui para que a diferença não vire suposição.
  perform login_as(v_ana);
  insert into journeys (user_id, started_at, ended_at, status, distance_gps, route_point_count)
  values (v_ana, now() - interval '3 hours', now(), 'completed', 12000, 90)
  returning id into v_j;
  insert into journey_routes (journey_id, user_id, polyline, point_count)
  values (v_j, v_ana, 'abcdef', 90);

  delete from journey_routes where journey_id = v_j;
  reset role;

  perform assert(
    (select route_point_count from journeys where id = v_j) = 90,
    'apagar o trajeto não zera o contador na jornada');
  perform assert(
    (select count(*) from journeys j
       join journey_routes r on r.journey_id = j.id
      where j.id = v_j) = 0,
    'só journey_routes sabe se ainda existe desenho');

  raise notice '';
  raise notice 'TESTES DE TRAJETO PASSARAM';
end;
$$;

-- ============================================================================
-- Corrigir um dia que já passou.
--
-- O aplicativo passou a poder gravar em qualquer dia até hoje, e a tela do dia
-- deixa apagar lançamento por lançamento. Duas coisas precisam ser verdade e
-- nenhuma delas é óbvia.
--
-- A primeira é o fuso. Uma jornada lançada à mão é carimbada ao meio-dia local
-- porque `daily_totals` agrupa jornadas pelo dia em São Paulo: carimbar à
-- meia-noite põe o tempo trabalhado no dia anterior, e o motorista vê as horas
-- somindo do dia que acabou de preencher.
--
-- A segunda é o que uma exclusão leva junto. Apagar a jornada tem de zerar o
-- tempo e deixar o dinheiro em paz, porque o ganho existe mesmo quando a
-- jornada foi lançada errado.
-- ============================================================================
do $$
declare
  v_carla uuid := gen_random_uuid();
  v_dia   date := current_date - 4;
  v_cat   uuid;
  v_plat  uuid;
  v_j     uuid;
  v_r     uuid;
  v_row   record;

  -- O carimbo que a tela usa: meio-dia no fuso em que o dia do motorista é
  -- contado, o mesmo que a view usa para agrupar.
  v_meio_dia timestamptz := (v_dia::timestamp + interval '12 hours')
                            at time zone 'America/Sao_Paulo';
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_carla, 'carla.dia@example.com', '{"full_name": "Carla Dias"}'::jsonb);

  select id into v_cat  from expense_categories where slug = 'combustivel';
  select id into v_plat from platforms          where slug = 'uber';

  perform login_as(v_carla);

  -- "Informar tempo e km deste dia": 6 horas e 90 km, de cabeça.
  insert into journeys (user_id, status, started_at, ended_at, paused_seconds, distance_override)
  values (v_carla, 'completed', v_meio_dia, v_meio_dia + interval '6 hours', 0, 90000)
  returning id into v_j;

  insert into revenues (user_id, date, amount, tips, trip_count, platform_id)
  values (v_carla, v_dia, 24000, 0, 18, v_plat)
  returning id into v_r;

  insert into expenses (user_id, date, amount, category_id)
  values (v_carla, v_dia, 7000, v_cat);

  select * into v_row from daily_totals where user_id = v_carla and date = v_dia;

  perform assert(v_row.date = v_dia,
    'a jornada carimbada ao meio-dia cai no dia escolhido, não no anterior');
  perform assert(v_row.worked_seconds = 21600,
    'seis horas informadas viram 21600 segundos trabalhados');
  perform assert(v_row.distance = 90000,
    'os 90 km digitados chegam ao histórico');
  perform assert(v_row.net_profit = 17000,
    'o lucro do dia corrigido é o que entrou menos o que saiu');
  perform assert(v_row.trip_count = 18,
    'as corridas informadas num dia anterior contam no ticket médio');

  -- "Corrigir tempo e km" preserva o início, que é um fato observado, e move
  -- só o fim, que é o que o motorista está corrigindo.
  update journeys
     set ended_at = started_at + interval '8 hours', distance_override = 120000
   where id = v_j;

  select * into v_row from daily_totals where user_id = v_carla and date = v_dia;
  perform assert(v_row.date = v_dia and v_row.worked_seconds = 28800 and v_row.distance = 120000,
    'corrigir para 8 horas e 120 km muda os números e não muda o dia');

  -- Apagar a jornada não pode levar o dinheiro junto: `revenues.journey_id` é
  -- `on delete set null` justamente para isso.
  delete from journeys where id = v_j;

  select * into v_row from daily_totals where user_id = v_carla and date = v_dia;
  perform assert(v_row.gross_revenue = 24000,
    'apagar a jornada preserva o ganho lançado nela');
  perform assert(coalesce(v_row.worked_seconds, 0) = 0,
    'apagar a jornada zera o tempo trabalhado do dia');

  delete from revenues where id = v_r;
  select * into v_row from daily_totals where user_id = v_carla and date = v_dia;
  perform assert(v_row.net_profit = -7000,
    'apagar o ganho deixa o dia negativo em vez de sumir com o gasto');

  reset role;

  raise notice '';
  raise notice 'TESTES DE DIA ANTERIOR PASSARAM';
end;
$$;

-- ============================================================================
-- Botão de emergência e rede de alerta entre motoristas.
--
-- As afirmações abaixo são, uma a uma, as promessas que a tela de
-- consentimento faz ao motorista. Se alguma delas quebrar, a função tem de
-- sair do ar até voltar a valer.
--
-- Três pontos em São Paulo: quem pede socorro, alguém a ~1 km e alguém a
-- ~22 km. As distâncias são reais: é o `ST_DWithin` sobre `geography` que
-- está sendo afirmado, não uma aritmética nossa.
-- ============================================================================
do $$
declare
  v_pede   uuid := gen_random_uuid();   -- quem dispara
  v_perto  uuid := gen_random_uuid();   -- na rede, a 1,1 km
  v_longe  uuid := gen_random_uuid();   -- na rede, a 22 km
  v_fora   uuid := gen_random_uuid();   -- ao lado, mas não entrou na rede
  v_alerta uuid;
  v_result jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data) values
    (v_pede,  'sos.pede@example.com',  '{"full_name":"Paulo Pede"}'::jsonb),
    (v_perto, 'sos.perto@example.com', '{"full_name":"Pedro Perto"}'::jsonb),
    (v_longe, 'sos.longe@example.com', '{"full_name":"Lara Longe"}'::jsonb),
    (v_fora,  'sos.fora@example.com',  '{"full_name":"Fabio Fora"}'::jsonb);

  -- ------------------------------------------------- sem consentimento ----
  perform login_as(v_pede);
  begin
    perform sos_trigger(-23.5505, -46.6333);
    perform assert(false, 'disparar sem consentimento deveria ser recusado');
  exception when raise_exception then
    perform assert(sqlerrm = 'sos_consent_required',
      'sem consentimento a função recusa, e a tela não decide isso');
  end;

  -- Publicar posição sem estar na rede não grava nada, e diz que não gravou em
  -- vez de estourar: é assim que a tela sabe não prometer compartilhamento.
  perform assert(sos_share_location(-23.5505, -46.6333) = false,
    'quem não entrou na rede não tem posição publicada');
  perform assert((select count(*) from driver_locations where user_id = v_pede) = 0,
    'e nada foi gravado mesmo assim');
  reset role;

  -- ---------------------------------------------- a rede se posiciona -----
  perform login_as(v_perto);
  update user_preferences
     set sos_consent_at = now(), sos_network_opt_in = true,
         sos_vehicle_colour = 'Prata', sos_plate_prefix = 'ABC'
   where user_id = v_perto;
  perform assert(sos_share_location(-23.5605, -46.6333, 12) = true,
    'quem entrou na rede publica a própria posição');
  reset role;

  perform login_as(v_longe);
  update user_preferences set sos_consent_at = now(), sos_network_opt_in = true
   where user_id = v_longe;
  perform sos_share_location(-23.7505, -46.6333, 12);
  reset role;

  -- Este aceitou o SOS para si, mas NÃO quis receber alerta de ninguém.
  perform login_as(v_fora);
  update user_preferences set sos_consent_at = now(), sos_network_opt_in = false
   where user_id = v_fora;
  perform assert(sos_share_location(-23.5510, -46.6333) = false,
    'quem não participa da rede não é encontrável, nem publicando');
  reset role;

  -- ----------------------------------------------------- ninguém espia ----
  perform login_as(v_pede);
  perform assert((select count(*) from driver_locations) = 0,
    'a posição de outro motorista não é legível por ninguém');
  reset role;

  -- -------------------------------------------------------- o disparo -----
  perform login_as(v_pede);
  update user_preferences
     set sos_consent_at = now(), sos_vehicle_colour = 'Preto', sos_plate_prefix = 'XYZ'
   where user_id = v_pede;

  v_result := sos_trigger(-23.5505, -46.6333, 15);
  v_alerta := (v_result ->> 'alert_id')::uuid;

  perform assert((v_result ->> 'notified')::integer = 1,
    'o alerta avisa quem está dentro de 5 km e mais ninguém: ' || (v_result ->> 'notified'));
  perform assert((v_result ->> 'radius_m')::integer = 5000,
    'o raio da rede é de 5 km');
  perform assert(
    (select plate_prefix from sos_alerts where id = v_alerta) = 'XYZ'
    and (select vehicle_colour from sos_alerts where id = v_alerta) = 'Preto',
    'o alerta carrega a cor e as três letras da placa, nunca a placa inteira');

  -- Quem disparou sabe QUANTOS foram avisados. Quem eles são é a lista de quem
  -- estava por perto, e isso não é dele.
  perform assert((select notified_count from sos_alerts where id = v_alerta) = 1,
    'o dono do alerta vê quantas pessoas foram avisadas');
  perform assert((select count(*) from sos_alert_recipients) = 0,
    'e não vê quem elas são');
  reset role;

  -- O leque de destinatários, conferido por fora do RLS: aqui o que está sendo
  -- afirmado é o raio, não quem consegue lê-lo.
  perform assert(
    (select count(*) from sos_alert_recipients where alert_id = v_alerta and user_id = v_perto) = 1,
    'o motorista a 1 km foi avisado');
  perform assert(
    (select count(*) from sos_alert_recipients where alert_id = v_alerta and user_id = v_longe) = 0,
    'o motorista a 22 km não foi avisado');
  perform assert(
    (select count(*) from sos_alert_recipients where alert_id = v_alerta and user_id = v_fora) = 0,
    'quem não entrou na rede não foi avisado, mesmo estando ao lado');
  perform assert(
    (select count(*) from user_notifications
     where user_id = v_perto and deep_link = '/sos/received') = 1,
    'quem foi avisado recebe a notificação dentro do aplicativo');

  -- ------------------------------------- o que quem recebeu consegue ler ---
  perform login_as(v_perto);
  perform assert((select count(*) from sos_alerts where id = v_alerta) = 1,
    'quem foi avisado lê o alerta enquanto ele está ativo');
  reset role;

  -- Encerrar fecha a janela de leitura e para de publicar a posição no mesmo
  -- movimento, não no próximo batimento da tela.
  perform login_as(v_pede);
  perform assert(sos_close(v_alerta) = true, 'o dono encerra o próprio alerta');
  perform assert(sos_close(gen_random_uuid()) = false, 'não se encerra alerta que não é seu');
  perform assert((select count(*) from sos_alerts where id = v_alerta) = 1,
    'o dono continua vendo o próprio histórico de alertas');
  reset role;

  perform login_as(v_perto);
  perform assert((select count(*) from sos_alerts where id = v_alerta) = 0,
    'alerta encerrado deixa de ser legível por quem foi avisado');
  reset role;

  -- --------------------------------------------- expiração sem ninguém ----
  -- A promessa dos 30 minutos vale mesmo se o celular do motorista apagou no
  -- meio do alerta: quem a cumpre é a função agendada, não a tela.
  --
  -- Encerrar um alerta NÃO devolve o direito de disparar outro na hora: um
  -- alerta encerrado continua contando para o intervalo de dez minutos, senão
  -- o limite seria contornável encerrando e disparando de novo. Por isso o
  -- primeiro é envelhecido antes do segundo.
  update sos_alerts set created_at = created_at - interval '11 minutes'
   where user_id = v_pede;

  perform login_as(v_perto);
  perform sos_share_location(-23.5605, -46.6333);
  reset role;

  perform login_as(v_pede);
  v_alerta := (sos_trigger(-23.5505, -46.6333) ->> 'alert_id')::uuid;
  reset role;

  update sos_alerts set expires_at = now() - interval '1 minute' where id = v_alerta;
  update driver_locations set updated_at = now() - interval '2 hours';

  perform sos_expire_alerts();
  perform assert((select status from sos_alerts where id = v_alerta) = 'expired',
    'o alerta expira sozinho passados os 30 minutos');
  perform assert((select count(*) from driver_locations) = 0,
    'presença velha é apagada junto, para ninguém ser avisado por onde passou');

  perform login_as(v_perto);
  perform assert((select count(*) from sos_alerts where id = v_alerta) = 0,
    'e quem foi avisado deixa de ler o alerta expirado');
  reset role;

  perform login_as(v_pede);
  begin
    perform sos_expire_alerts();
    perform assert(false, 'a expiração não deveria ser chamável pelo aplicativo');
  exception when insufficient_privilege then
    perform assert(true, 'a expiração de alertas não é chamável pelo aplicativo');
  end;
  reset role;

  -- ---------------------------------------------------------- limites -----
  -- Por último, porque envelhecer os registros para testar o limite diário
  -- atrapalharia qualquer coisa afirmada depois.
  perform login_as(v_pede);
  begin
    perform sos_trigger(-23.5505, -46.6333);
    perform assert(false, 'dois alertas em dez minutos deveriam ser recusados');
  exception when raise_exception then
    perform assert(sqlerrm = 'sos_rate_limited',
      'o intervalo mínimo entre alertas é verificado no banco');
  end;

  -- O alarme falso abortado na contagem de cinco segundos: fica registrado
  -- para auditoria e não consome limite nenhum.
  perform sos_log_aborted(-23.5505, -46.6333);
  perform assert(
    (select count(*) from sos_alerts
     where user_id = v_pede and status = 'cancelled' and cancelled_at is not null) = 1,
    'o alerta cancelado antes de disparar fica registrado');
  reset role;

  -- Um disparo de demonstração não acorda ninguém e não gasta limite: quem
  -- testa a função para entender como ela funciona e é assaltado oito minutos
  -- depois não pode ser recusado por causa do teste.
  perform login_as(v_pede);
  perform assert(
    (sos_trigger(-23.5505, -46.6333, null, true) ->> 'notified')::integer = 0,
    'um disparo de demonstração não avisa ninguém');
  begin
    perform sos_trigger(-23.5505, -46.6333);
    perform assert(false, 'o limite continua valendo para o disparo de verdade');
  exception when raise_exception then
    perform assert(sqlerrm = 'sos_rate_limited',
      'a demonstração não gastou o limite, quem gastou foi o alerta de verdade');
  end;
  reset role;

  -- Ela existe no registro, marcada como demonstração, e não entra na contagem.
  perform assert(
    (select count(*) from sos_alerts where user_id = v_pede and is_demo) = 1,
    'o disparo de demonstração fica registrado como demonstração');

  -- A janela em volta da meia-noite local é a única em que isto não pode ser
  -- afirmado: não existe como ter três alertas de hoje com mais de dez minutos
  -- de idade às 00:05. É uma propriedade da regra, não do teste.
  if (now() at time zone 'America/Sao_Paulo')::time > time '00:30' then
    update sos_alerts set created_at = created_at - interval '11 minutes'
     where user_id = v_pede;

    -- O terceiro passa: dos registros de hoje, dois valem (encerrado e
    -- expirado); o cancelado e o de demonstração não contam. Se qualquer um
    -- dos dois contasse, esta chamada já falharia aqui.
    perform login_as(v_pede);
    perform sos_trigger(-23.5505, -46.6333);
    reset role;

    update sos_alerts set created_at = created_at - interval '11 minutes'
     where user_id = v_pede;

    perform login_as(v_pede);
    begin
      perform sos_trigger(-23.5505, -46.6333);
      perform assert(false, 'o quarto alerta do dia deveria ser recusado');
    exception when raise_exception then
      perform assert(sqlerrm = 'sos_daily_limit',
        'três alertas por dia é o limite, e um cancelamento não gasta nenhum deles');
    end;
    reset role;
  else
    raise notice 'SKIP  limite diário (a execução caiu na virada do dia local)';
  end if;

  -- --------------------------------------------- contatos de emergência ---
  perform login_as(v_pede);
  insert into emergency_contacts (user_id, slot, name, phone) values
    (v_pede, 1, 'Mãe',   '11999990001'),
    (v_pede, 2, 'Irmão', '11999990002'),
    (v_pede, 3, 'Amigo', '11999990003');

  begin
    insert into emergency_contacts (user_id, slot, name, phone)
    values (v_pede, 4, 'Quarto', '11999990004');
    perform assert(false, 'o quarto contato deveria ser recusado');
  exception when check_violation then
    perform assert(true, 'o banco recusa o quarto contato de emergência');
  end;

  begin
    insert into emergency_contacts (user_id, slot, name, phone)
    values (v_pede, 1, 'Repetido', '11999990005');
    perform assert(false, 'dois contatos no mesmo lugar deveriam ser recusados');
  exception when unique_violation then
    perform assert(true, 'um lugar da lista guarda um contato só');
  end;
  reset role;

  perform login_as(v_perto);
  perform assert((select count(*) from emergency_contacts) = 0,
    'o telefone da família de outra pessoa não é legível');
  reset role;

  -- O administrador também não. É o telefone de um terceiro que nunca usou o
  -- aplicativo e nunca concordou com nada.
  perform assert(
    (select count(*) from pg_policy p
     join pg_class c on c.oid = p.polrelid
     where c.relname = 'emergency_contacts'
       and pg_get_expr(p.polqual, p.polrelid) like '%is_admin%') = 0,
    'nenhuma política de contato de emergência abre exceção para administrador');

  raise notice '';
  raise notice 'TESTES DE SOS PASSARAM';
end;
$$;

-- ============================================================================
-- Excluir a própria conta
--
-- A função é a única do schema que apaga uma conta inteira, então o que ela
-- NÃO apaga importa tanto quanto o que apaga. Os dois lados são afirmados
-- aqui: some tudo de quem pediu, e não encosta em mais ninguém.
-- ============================================================================
do $$
declare
  v_sai    uuid := gen_random_uuid();
  v_fica   uuid := gen_random_uuid();
  v_result jsonb;
begin
  insert into auth.users (id, email, raw_user_meta_data)
  values (v_sai,  'sai@example.com',  '{"full_name": "Quem Sai"}'::jsonb),
         (v_fica, 'fica@example.com', '{"full_name": "Quem Fica"}'::jsonb);

  insert into revenues (user_id, date, amount) values
    (v_sai,  current_date, 12345),
    (v_fica, current_date, 54321);

  -- Cobrança em aberto no Stripe. É o único rastro que precisa sobreviver:
  -- a conta some daqui e a assinatura continua lá, cobrando.
  insert into billing_customers (user_id, stripe_customer_id)
  values (v_sai, 'cus_exclusao_teste');
  insert into subscriptions
    (user_id, plan, source, stripe_subscription_id, billing_status)
  values (v_sai, 'pro', 'subscription', 'sub_exclusao_teste', 'active');

  -- Um arquivo na pasta do usuário, que nenhum cascade alcança.
  insert into storage.objects (bucket_id, name)
  values ('avatars', v_sai::text || '/foto.jpg');

  -- Sem sessão, não apaga nada. A função lê `auth.uid()` e nunca um id vindo
  -- de fora, então esta é a única forma de chamá-la sem dono.
  perform set_config('request.jwt.claim.sub', '', true);
  v_result := delete_my_account();
  perform assert(v_result ->> 'reason' = 'not_authenticated',
    'excluir conta sem sessão é recusado');
  perform assert((select count(*) from profiles where id = v_sai) = 1,
    'a recusa não apagou nada');

  perform login_as(v_sai);
  v_result := delete_my_account();
  reset role;

  perform assert(v_result ->> 'ok' = 'true',
    'o usuário exclui a própria conta');
  perform assert((select count(*) from auth.users where id = v_sai) = 0,
    'a conta some de auth.users');
  perform assert((select count(*) from profiles where id = v_sai) = 0,
    'o perfil some junto');
  perform assert((select count(*) from revenues where user_id = v_sai) = 0,
    'os ganhos somem pelo cascade');
  perform assert(
    (select count(*) from storage.objects where name like v_sai::text || '/%') = 0,
    'os arquivos da pasta do usuário somem junto');

  -- E nada além disso.
  perform assert((select count(*) from auth.users where id = v_fica) = 1,
    'a conta de outra pessoa continua de pé');
  perform assert((select count(*) from revenues where user_id = v_fica) = 1,
    'os ganhos de outra pessoa continuam lá');

  perform assert(
    (select count(*) from account_deletions
     where stripe_subscription_id = 'sub_exclusao_teste'
       and stripe_customer_id = 'cus_exclusao_teste'
       and had_active_billing) = 1,
    'a assinatura a encerrar no Stripe fica registrada');

  -- A tabela de pendências não é um arquivo de ex-usuários: ela não tem
  -- coluna para nome, e-mail ou id de usuário, e isto falha se alguém criar
  -- uma.
  perform assert(
    (select count(*) from information_schema.columns
     where table_schema = 'public'
       and table_name = 'account_deletions'
       and column_name in ('user_id', 'email', 'name', 'phone')) = 0,
    'o registro de exclusão não guarda dado pessoal');

  -- Nem o usuário logado lê essa tabela: ela existe para a service role.
  perform login_as(v_fica);
  perform assert((select count(*) from account_deletions) = 0,
    'a lista de pendências de cobrança não é legível pelo usuário');
  reset role;

  raise notice '';
  raise notice 'TESTES DE EXCLUSÃO DE CONTA PASSARAM';
end;
$$;
