-- ============================================================================
-- Server-side business functions and the read models the apps query.
--
-- Anything that grants value (a plan, a discount, a referral) lives here and
-- runs with SECURITY DEFINER, because the client must never be able to claim
-- it for itself (§118).
-- ============================================================================

-- --------------------------------------------------------------- signup ----
-- Minimal accent folding so we do not depend on the unaccent extension being
-- available on every Supabase tier.
create or replace function unaccent_simple(input text)
returns text
language sql
immutable
as $$
  select translate(
    input,
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  );
$$;

-- A new account is set up in one transaction: profile, preferences, 7-day
-- trial, personal referral code, and first-touch attribution.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first_name text;
  v_code       text;
  v_suffix     text;
  v_attempt    integer := 0;
begin
  v_first_name := coalesce(
    nullif(trim(split_part(new.raw_user_meta_data ->> 'full_name', ' ', 1)), ''),
    split_part(new.email, '@', 1)
  );

  insert into profiles (id, first_name, email)
  values (new.id, left(v_first_name, 60), new.email);

  insert into user_preferences (user_id) values (new.id);

  -- Every new user gets 7 days of Pro (§57).
  insert into subscriptions (user_id, plan, source, started_at, expires_at)
  values (new.id, 'pro', 'trial', now(), now() + interval '7 days');

  -- Personal referral code, e.g. ARTHUR26. Retries on collision; the unique
  -- index is the real guarantee, this loop just avoids surfacing the error.
  loop
    v_attempt := v_attempt + 1;
    v_suffix := upper(substr(translate(encode(gen_random_bytes(4), 'base64'),
                                       '+/=0O1IL', 'ABCDEFGH'), 1, 2));
    v_code := upper(regexp_replace(unaccent_simple(v_first_name), '[^A-Za-z]', '', 'g'));
    v_code := case when length(v_code) >= 3 then left(v_code, 8) else 'DRIVER' end || v_suffix;

    begin
      insert into promotion_codes (code, kind, owner_user_id, benefit_amount)
      values (v_code, 'referral', new.id,
              coalesce((select (value #>> '{}')::bigint from app_settings
                        where key = 'referral_discount_amount'), 1000));
      exit;
    exception when unique_violation then
      if v_attempt >= 8 then raise; end if;
    end;
  end loop;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ------------------------------------------------------ code redemption ----
-- Applies a referral/influencer/campaign code to the CALLING user. Every
-- antifraud rule from §85 is enforced here, inside one transaction, so a
-- client cannot skip any of them.
create or replace function redeem_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code    promotion_codes%rowtype;
  v_benefit_id uuid;
  v_referral_id uuid;
  v_validity_days integer;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select * into v_code from promotion_codes
  where code = upper(trim(p_code)) for update;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_code.status <> 'active' then
    return jsonb_build_object('ok', false, 'reason', v_code.status::text);
  end if;
  if v_code.starts_at is not null and v_code.starts_at > now() then
    return jsonb_build_object('ok', false, 'reason', 'not_started');
  end if;
  if v_code.expires_at is not null and v_code.expires_at <= now() then
    return jsonb_build_object('ok', false, 'reason', 'expired');
  end if;
  if v_code.max_uses is not null and v_code.use_count >= v_code.max_uses then
    return jsonb_build_object('ok', false, 'reason', 'exhausted');
  end if;

  -- You cannot refer yourself.
  if v_code.owner_user_id = v_user_id then
    return jsonb_build_object('ok', false, 'reason', 'self_referral');
  end if;

  -- One origin per account, forever.
  if exists (select 1 from user_attribution where user_id = v_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'already_attributed');
  end if;

  -- A blocked referrer earns nothing.
  if v_code.owner_user_id is not null and exists (
    select 1 from profiles where id = v_code.owner_user_id and blocked_at is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'referrer_blocked');
  end if;

  v_validity_days := coalesce(
    (select (value #>> '{}')::integer from app_settings where key = 'referral_benefit_validity_days'),
    90
  );

  if v_code.kind = 'referral' and v_code.owner_user_id is not null then
    insert into referrals (referrer_user_id, referred_user_id, code_id)
    values (v_code.owner_user_id, v_user_id, v_code.id)
    returning id into v_referral_id;
  end if;

  if v_code.benefit_amount > 0 then
    insert into discount_benefits (user_id, code_id, referral_id, amount, expires_at)
    values (v_user_id, v_code.id, v_referral_id, v_code.benefit_amount,
            now() + make_interval(days => v_validity_days))
    returning id into v_benefit_id;
  end if;

  insert into user_attribution (
    user_id, source, medium, code_id, influencer_id, referrer_user_id, signup_origin
  ) values (
    v_user_id,
    case v_code.kind when 'referral' then 'referral' when 'influencer' then 'influencer'
                     else 'campaign' end,
    v_code.kind::text,
    v_code.id,
    v_code.influencer_id,
    v_code.owner_user_id,
    'code'
  );

  update promotion_codes
  set use_count = use_count + 1,
      status = case
        when max_uses is not null and use_count + 1 >= max_uses then 'exhausted'::code_status
        else status
      end
  where id = v_code.id;

  insert into analytics_events (user_id, event, properties)
  values (v_user_id, 'promotion_code_used',
          jsonb_build_object('code', v_code.code, 'kind', v_code.kind));

  return jsonb_build_object(
    'ok', true,
    'kind', v_code.kind,
    'benefit_amount', v_code.benefit_amount,
    'benefit_id', v_benefit_id
  );
end;
$$;

revoke all on function redeem_code(text) from public;
grant execute on function redeem_code(text) to authenticated;

-- ------------------------------------------------------ support helpers ----
-- Marks every support notification for a ticket as read when the user opens
-- the conversation (§71).
create or replace function mark_ticket_read(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from support_tickets where id = p_ticket_id and user_id = auth.uid()
  ) then
    raise exception 'ticket not found';
  end if;

  update support_messages
  set read_by_user_at = now()
  where ticket_id = p_ticket_id and read_by_user_at is null and author_kind <> 'user';

  update user_notifications
  set read_at = now()
  where user_id = auth.uid()
    and read_at is null
    and category = 'support'
    and deep_link = '/support/' || p_ticket_id::text;
end;
$$;

grant execute on function mark_ticket_read(uuid) to authenticated;

-- ---------------------------------------------------------------- views ----
-- Read models. The apps query these instead of assembling joins in three
-- different places (§106).

-- A user's current plan, resolved from all their grants.
create or replace view current_plans
with (security_invoker = true) as
select
  p.id as user_id,
  coalesce(s.plan, 'free') as plan,
  s.source,
  s.expires_at,
  s.source = 'trial' as is_trial
from profiles p
left join lateral (
  select sub.plan, sub.source, sub.expires_at
  from subscriptions sub
  where sub.user_id = p.id
    and sub.plan = 'pro'
    and sub.cancelled_at is null
    and sub.started_at <= now()
    and (sub.expires_at is null or sub.expires_at > now())
  order by
    case sub.source
      when 'subscription' then 5 when 'partnership' then 4 when 'courtesy' then 3
      when 'promotion' then 2 else 1
    end desc,
    sub.expires_at desc nulls first
  limit 1
) s on true;

-- One row per user per calendar day: the grain every summary, insight and
-- benchmark is built from (§106).
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

-- "Minhas indicações" (§86): first name, date and status only. The referred
-- user's email, city and earnings are not exposed to the referrer.
create or replace view my_referrals
with (security_invoker = true) as
select
  r.id,
  r.referrer_user_id,
  p.first_name as referred_first_name,
  r.created_at,
  r.status
from referrals r
join profiles p on p.id = r.referred_user_id
where r.referrer_user_id = auth.uid();

-- Unread bell count, so the app does not fetch rows just to count them.
create or replace view notification_counts
with (security_invoker = true) as
select
  user_id,
  count(*)::integer as unread_total,
  count(*) filter (where category = 'support')::integer as unread_support
from user_notifications
where read_at is null
group by user_id;
