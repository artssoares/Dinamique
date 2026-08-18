-- ============================================================================
-- Importação de veículos pelo Admin (§101).
--
-- `seed_vehicle` recebe enums, mas o PostgREST manda tudo como texto JSON e a
-- resolução de sobrecarga não é confiável nesse caminho. Esta função aceita
-- texto e valida a conversão, devolvendo um erro legível em vez de estourar.
-- ============================================================================

create or replace function import_vehicle(
  p_make    text,
  p_model   text,
  p_type    text default 'car',
  p_version text default null,
  p_year_from integer default null,
  p_engine  text default null,
  p_fuel    text default null,
  p_urban   integer default null,
  p_highway integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type vehicle_type;
  v_fuel fuel_type;
begin
  if coalesce(trim(p_make), '') = '' or coalesce(trim(p_model), '') = '' then
    return jsonb_build_object('ok', false, 'reason', 'marca e modelo são obrigatórios');
  end if;

  begin
    v_type := coalesce(nullif(trim(p_type), ''), 'car')::vehicle_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', format('tipo inválido: %s', p_type));
  end;

  begin
    v_fuel := nullif(trim(p_fuel), '')::fuel_type;
  exception when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', format('combustível inválido: %s', p_fuel));
  end;

  -- Consumo zero não existe; a constraint rejeitaria, então tratamos antes.
  if coalesce(p_urban, 1) <= 0 or coalesce(p_highway, 1) <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'consumo precisa ser maior que zero');
  end if;

  perform seed_vehicle(
    trim(p_make), trim(p_model), v_type, nullif(trim(p_version), ''),
    p_year_from, nullif(trim(p_engine), ''), v_fuel, p_urban, p_highway
  );

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function import_vehicle(text, text, text, text, integer, text, text, integer, integer) from public;
grant execute on function import_vehicle(text, text, text, text, integer, text, text, integer, integer) to service_role;

-- As funções criadas depois do grant amplo precisam do seu próprio.
grant execute on function seed_vehicle(text, text, vehicle_type, text, integer, text, fuel_type, integer, integer) to service_role;
grant execute on function send_notification(notification_audience, notification_category, text, text, text, text, text) to service_role;
grant execute on function resolve_audience(notification_audience) to service_role;
grant execute on function process_reminders() to service_role;
