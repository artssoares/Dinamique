-- ============================================================================
-- Motor de notificações (§58, §99, §100).
--
-- Duas peças:
--   1. `send_notification` – cria notificações para um público segmentado,
--      respeitando a preferência de cada usuário por categoria;
--   2. `process_reminders` – transforma lembretes vencidos (Free Flow, multas,
--      manutenção) em notificações. Roda por agendamento.
-- ============================================================================

-- Público-alvo de um envio (§100). Todos os filtros são opcionais e se somam.
create type notification_audience as (
  user_ids   uuid[],
  cities     text[],
  states     text[],
  work_modes work_mode[],
  plans      plan_code[],
  -- Ativos nos últimos N dias; null ignora o filtro.
  active_within_days integer,
  inactive_for_days  integer
);

/**
 * Resolve o público em ids de usuário. Separado do envio para o Admin poder
 * mostrar "isto vai para 1.243 pessoas" antes de mandar.
 */
create or replace function resolve_audience(p_audience notification_audience)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.id
  from profiles p
  left join current_plans cp on cp.user_id = p.id
  where p.blocked_at is null
    and not p.is_demo
    and (p_audience.user_ids   is null or p.id = any(p_audience.user_ids))
    and (p_audience.cities     is null or p.city = any(p_audience.cities))
    and (p_audience.states     is null or p.state = any(p_audience.states))
    and (p_audience.work_modes is null or p.work_modes && p_audience.work_modes)
    and (p_audience.plans      is null or cp.plan = any(p_audience.plans))
    and (p_audience.active_within_days is null
         or p.last_seen_at >= now() - make_interval(days => p_audience.active_within_days))
    and (p_audience.inactive_for_days is null
         or p.last_seen_at is null
         or p.last_seen_at < now() - make_interval(days => p_audience.inactive_for_days));
$$;

/**
 * Cria as notificações. Quem desativou a categoria não recebe – a preferência
 * do usuário é verificada aqui, não na tela que dispara (§58).
 *
 * Retorna quantas foram efetivamente criadas.
 */
create or replace function send_notification(
  p_audience  notification_audience,
  p_category  notification_category,
  p_title     text,
  p_body      text,
  p_deep_link text default null,
  p_cta_label text default null,
  p_image_path text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with recipients as (
    select u.id as user_id
    from resolve_audience(p_audience) u(id)
    left join notification_preferences np
      on np.user_id = u.id and np.category = p_category
    -- Sem linha de preferência, o padrão é receber.
    where coalesce(np.in_app, true)
  ),
  inserted as (
    insert into user_notifications (user_id, category, title, body, deep_link, cta_label, image_path)
    select user_id, p_category, p_title, p_body, p_deep_link, p_cta_label, p_image_path
    from recipients
    returning 1
  )
  select count(*)::integer into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function send_notification(notification_audience, notification_category, text, text, text, text, text) from public;
revoke all on function resolve_audience(notification_audience) from public;

/**
 * Lembretes vencidos viram notificações (§50, §51, §34).
 *
 * É idempotente: cada lembrete é limpo depois de virar notificação, então
 * rodar duas vezes no mesmo minuto não duplica nada.
 */
create or replace function process_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total integer := 0;
  v_count integer;
begin
  -- Free Flow
  with due as (
    select id, user_id, operator from free_flow_records
    where remind_at is not null and remind_at <= now() and status <> 'paid'
    for update skip locked
  ),
  sent as (
    insert into user_notifications (user_id, category, title, body, deep_link)
    select user_id, 'free_flow', 'Passagem de Free Flow',
           'Você registrou uma passagem em ' || operator || '. Já conferiu o pagamento?',
           '/costs/free-flow'
    from due
    returning 1
  ),
  cleared as (
    update free_flow_records set remind_at = null
    where id in (select id from due)
    returning 1
  )
  select count(*)::integer into v_count from sent;
  v_total := v_total + v_count;

  -- Multas: avisamos antes de o desconto acabar, que é o prazo que importa.
  with due as (
    select id, user_id, description, discount_deadline from fines
    where status = 'pending'
      and discount_deadline is not null
      and discount_deadline <= current_date + 3
      and remind_at is null
    for update skip locked
  ),
  sent as (
    insert into user_notifications (user_id, category, title, body, deep_link)
    select user_id, 'fines', 'Prazo de desconto acabando',
           'A multa "' || description || '" tem desconto até ' ||
           to_char(discount_deadline, 'DD/MM') || '.',
           '/costs/fines'
    from due
    returning 1
  ),
  marked as (
    update fines set remind_at = now()
    where id in (select id from due)
    returning 1
  )
  select count(*)::integer into v_count from sent;
  v_total := v_total + v_count;

  -- Manutenção por data
  with due as (
    select m.id, m.user_id, coalesce(t.name, 'Manutenção') as type_name, m.next_due_date
    from maintenance_logs m
    left join maintenance_types t on t.id = m.type_id
    where m.next_due_date is not null and m.next_due_date <= current_date + 7
    -- `for update of m` trava só maintenance_logs: o Postgres recusa travar o
    -- lado anulável de um LEFT JOIN.
    for update of m skip locked
  ),
  sent as (
    insert into user_notifications (user_id, category, title, body, deep_link)
    select user_id, 'maintenance', 'Manutenção chegando',
           type_name || ' prevista para ' || to_char(next_due_date, 'DD/MM') || '.',
           '/costs/maintenance'
    from due
    returning 1
  ),
  cleared as (
    update maintenance_logs set next_due_date = null
    where id in (select id from due)
    returning 1
  )
  select count(*)::integer into v_count from sent;
  v_total := v_total + v_count;

  return v_total;
end;
$$;

revoke all on function process_reminders() from public;
