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
  values (v_ticket, 'agent', 'Cliente já reclamou disso 3x — verificar plano.', true);

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
