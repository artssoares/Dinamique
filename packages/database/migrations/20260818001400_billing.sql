-- ============================================================================
-- Cobrança com Stripe (§56, §57).
--
-- Princípio que vale para tudo aqui: o CLIENTE NUNCA ESCREVE ESTADO DE
-- COBRANÇA. Ele só lê. Quem concede plano é o webhook do Stripe, rodando com
-- a service role, depois de validar a assinatura da requisição.
--
-- O Stripe é a fonte da verdade sobre o que foi pago; o nosso banco guarda o
-- reflexo disso para o aplicativo não precisar consultar o Stripe a cada tela.
-- ============================================================================

create type billing_interval as enum ('month', 'year');

create type billing_status as enum (
  'incomplete',        -- checkout iniciado, pagamento não confirmado
  'trialing',
  'active',
  'past_due',          -- cobrança falhou, ainda em período de tentativa
  'canceled',
  'unpaid'
);

-- ------------------------------------------------------- catálogo de preços --
-- Os preços vivem aqui e não no código: mudar valor é decisão comercial e não
-- deve exigir novo build do aplicativo nem da loja.
create table billing_prices (
  id               uuid primary key default gen_random_uuid(),
  plan             plan_code not null default 'pro',
  interval         billing_interval not null,
  -- Centavos. R$ 19,90 = 1990.
  amount           bigint not null check (amount > 0),
  currency         char(3) not null default 'BRL',
  -- Id do preço no Stripe (price_...). Null enquanto não foi criado lá.
  stripe_price_id  text unique,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Um preço ativo por combinação de plano e periodicidade.
create unique index billing_prices_active_idx
  on billing_prices (plan, interval) where is_active;

create trigger billing_prices_updated_at before update on billing_prices
  for each row execute function set_updated_at();

insert into billing_prices (plan, interval, amount) values
  ('pro', 'month', 1990),
  ('pro', 'year',  4990);

-- ------------------------------------------------------------- clientes -----
-- O id de cliente no Stripe fica fora de `profiles` porque é dado de cobrança,
-- não de perfil: assim o RLS de perfil não precisa protegê-lo caso a caso.
create table billing_customers (
  user_id            uuid primary key references profiles(id) on delete cascade,
  stripe_customer_id text not null unique,
  created_at         timestamptz not null default now()
);

-- ---------------------------------------------------------- assinaturas -----
-- `subscriptions` já existia para concessões manuais (cortesia, trial). Aqui
-- ela ganha o vínculo com o Stripe, sem virar uma segunda tabela paralela –
-- a resolução de plano efetivo continua sendo uma só (§57).
alter table subscriptions
  add column stripe_subscription_id text unique,
  add column stripe_price_id        text,
  add column billing_interval       billing_interval,
  add column billing_status         billing_status,
  -- Fim do período pago. É o que decide até quando o Pro vale.
  add column current_period_end     timestamptz,
  -- Cancelamento agendado: o usuário cancelou mas o período já pago continua.
  add column cancel_at_period_end   boolean not null default false;

create index subscriptions_stripe_idx on subscriptions (stripe_subscription_id)
  where stripe_subscription_id is not null;

-- ------------------------------------------------------------- eventos ------
-- O Stripe reenvia webhooks. Sem registro de idempotência, um reenvio de
-- `invoice.paid` concederia o plano duas vezes e um `subscription.deleted`
-- fora de ordem poderia revogar um plano já renovado.
create table billing_events (
  stripe_event_id text primary key,
  type            text not null,
  -- Momento em que o Stripe gerou o evento; usado para descartar eventos que
  -- chegam fora de ordem.
  event_created_at timestamptz not null,
  payload         jsonb not null,
  processed_at    timestamptz not null default now(),
  error           text
);

create index billing_events_type_idx on billing_events (type, processed_at desc);

-- ------------------------------------------------------------- segurança ----
alter table billing_prices    enable row level security;
alter table billing_customers enable row level security;
alter table billing_events    enable row level security;

-- Preços são públicos para quem está logado: a tela precisa mostrá-los.
create policy billing_prices_read on billing_prices
  for select using (auth.role() = 'authenticated');

-- O usuário vê o próprio vínculo com o Stripe; escrever, nunca.
create policy billing_customers_read_own on billing_customers
  for select using (user_id = auth.uid() or is_admin());

-- Eventos de webhook são registro interno: só administradores leem.
create policy billing_events_read_admin on billing_events
  for select using (has_admin_role(array['superadmin', 'admin']::admin_role[]));

-- O cliente só LÊ preços. Nem sequer existe grant de escrita: o Admin altera
-- preço pela service role, então dar permissão a `authenticated` seria
-- superfície sem uso – e em tabela que decide cobrança, superfície sem uso é
-- risco puro.
grant select on billing_prices, billing_customers to authenticated;
grant all on billing_prices, billing_customers, billing_events to service_role;

-- ------------------------------------------------------------- funções ------

/**
 * Aplica o resultado de um evento do Stripe.
 *
 * Concentrar a escrita numa função só evita que cada tipo de evento no webhook
 * invente sua própria forma de atualizar a assinatura – que é como estados
 * inconsistentes aparecem.
 *
 * Devolve o id da linha de assinatura afetada.
 */
create or replace function apply_subscription_state(
  p_user_id              uuid,
  p_stripe_subscription_id text,
  p_stripe_price_id      text,
  p_interval             billing_interval,
  p_status               billing_status,
  p_current_period_end   timestamptz,
  p_cancel_at_period_end boolean
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into subscriptions (
    user_id, plan, source, started_at, expires_at,
    stripe_subscription_id, stripe_price_id, billing_interval, billing_status,
    current_period_end, cancel_at_period_end,
    cancelled_at
  )
  values (
    p_user_id, 'pro', 'subscription', now(),
    -- `expires_at` é o campo que a resolução de plano já usava; mantê-lo em dia
    -- significa que nada mais precisa saber que existe Stripe no meio.
    p_current_period_end,
    p_stripe_subscription_id, p_stripe_price_id, p_interval, p_status,
    p_current_period_end, p_cancel_at_period_end,
    case when p_status in ('canceled', 'unpaid') then now() end
  )
  on conflict (stripe_subscription_id) do update set
    stripe_price_id      = excluded.stripe_price_id,
    billing_interval     = excluded.billing_interval,
    billing_status       = excluded.billing_status,
    current_period_end   = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    expires_at           = excluded.expires_at,
    cancelled_at         = case
      when excluded.billing_status in ('canceled', 'unpaid') then now()
      else null
    end
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function apply_subscription_state(uuid, text, text, billing_interval, billing_status, timestamptz, boolean) from public;
grant execute on function apply_subscription_state(uuid, text, text, billing_interval, billing_status, timestamptz, boolean) to service_role;

/**
 * Consome o desconto de indicação numa cobrança (§84).
 *
 * Marca o benefício como usado e registra onde foi aplicado. Só faz efeito uma
 * vez – a condição `status = 'granted'` é a trava, e ela é atômica.
 */
create or replace function consume_discount_benefit(
  p_user_id uuid,
  p_applied_to text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_benefit discount_benefits%rowtype;
begin
  update discount_benefits
  set status = 'used', used_at = now(), applied_to = p_applied_to
  where id = (
    select id from discount_benefits
    where user_id = p_user_id
      and status = 'granted'
      and (expires_at is null or expires_at > now())
    order by created_at
    limit 1
    for update skip locked
  )
  returning * into v_benefit;

  if not found then
    return jsonb_build_object('applied', false);
  end if;

  insert into analytics_events (user_id, event, properties)
  values (p_user_id, 'referral_discount_used',
          jsonb_build_object('amount', v_benefit.amount, 'applied_to', p_applied_to));

  return jsonb_build_object('applied', true, 'amount', v_benefit.amount);
end;
$$;

revoke all on function consume_discount_benefit(uuid, text) from public;
grant execute on function consume_discount_benefit(uuid, text) to service_role;

-- Marca a indicação como convertida quando o indicado vira assinante (§87).
create or replace function mark_referral_converted(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update referrals
  set status = 'converted', converted_at = now()
  where referred_user_id = p_user_id and status <> 'converted';
$$;

revoke all on function mark_referral_converted(uuid) from public;
grant execute on function mark_referral_converted(uuid) to service_role;
