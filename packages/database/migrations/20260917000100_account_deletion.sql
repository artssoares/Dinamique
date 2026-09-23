-- ============================================================================
-- Excluir a própria conta.
--
-- Não é uma gentileza: a App Store exige (diretriz 5.1.1(v)) que todo
-- aplicativo que cria conta permita apagá-la de dentro do próprio aplicativo,
-- sem e-mail, sem ligação e sem formulário na web. A LGPD pede o mesmo pelo
-- direito de eliminação (art. 18, VI).
--
-- Quem apaga é o banco, não o aplicativo: uma única linha em `auth.users`
-- desaparece e todo o resto vai junto pelo `on delete cascade` já declarado em
-- cada tabela. Apagar tabela por tabela pelo cliente deixaria sempre uma para
-- trás, e seria uma lista para manter atualizada para sempre.
-- ============================================================================

-- ------------------------------------------------- cobrança a encerrar ------
-- A conta some do nosso banco, mas a assinatura vive no Stripe. Se o cliente
-- lá continuar existindo, a cobrança continua. Por isso o que o Stripe
-- precisa saber fica registrado aqui ANTES de a conta sumir.
--
-- Esta tabela não referencia `profiles` (ele deixa de existir) e não guarda
-- nome, e-mail nem telefone: só os identificadores do Stripe e a data. Ela é
-- o oposto de um arquivo de ex-usuários.
create table if not exists account_deletions (
  id                     uuid primary key default gen_random_uuid(),
  stripe_customer_id     text,
  stripe_subscription_id text,
  -- Havia assinatura valendo no momento da exclusão? É o que separa
  -- "cancelar no Stripe agora" de "não há nada a fazer".
  had_active_billing     boolean not null default false,
  settled_at             timestamptz,
  requested_at           timestamptz not null default now()
);

alter table account_deletions enable row level security;

-- Nenhuma política: nem `anon` nem `authenticated` leem ou escrevem aqui. Só
-- a service role (o painel) enxerga, porque só ela ignora o RLS.
comment on table account_deletions is
  'Pendências de cobrança deixadas por contas excluídas. Sem dado pessoal.';

-- ------------------------------------------------------------ a função ------
create or replace function delete_my_account()
returns jsonb
language plpgsql
security definer
-- `extensions` junto de `public`: é onde a Supabase instala pgcrypto e citext,
-- e uma função cega para esse schema quebra ao encostar em qualquer coluna
-- `citext`, como `profiles.email`.
set search_path = public, extensions
as $$
declare
  v_user_id  uuid := auth.uid();
  v_customer text;
  v_sub      text;
  v_active   boolean := false;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select bc.stripe_customer_id into v_customer
  from billing_customers bc where bc.user_id = v_user_id;

  select s.stripe_subscription_id,
         s.billing_status in ('trialing', 'active', 'past_due')
    into v_sub, v_active
  from subscriptions s
  where s.user_id = v_user_id
    and s.stripe_subscription_id is not null
  order by s.started_at desc
  limit 1;

  if v_customer is not null or v_sub is not null then
    insert into account_deletions
      (stripe_customer_id, stripe_subscription_id, had_active_billing)
    values (v_customer, v_sub, coalesce(v_active, false));
  end if;

  -- Os arquivos não estão em nenhuma tabela nossa, então o cascade não os
  -- alcança. O caminho sempre começa pelo id do usuário: é a mesma regra que
  -- as políticas do storage usam para decidir quem grava onde.
  --
  -- Num bloco próprio porque `storage.objects` pertence a outro papel na
  -- Supabase. Se um dia essa permissão mudar, a foto fica para trás, e isso é
  -- ruim; a conta não ser apagada seria pior, e é o que a loja e a lei
  -- cobram. A falha é anunciada para não passar em silêncio.
  begin
    delete from storage.objects
    where bucket_id in ('avatars', 'support-attachments')
      and (storage.foldername(name))[1] = v_user_id::text;
  exception when insufficient_privilege or undefined_table then
    raise warning 'delete_my_account: arquivos de % não puderam ser apagados', v_user_id;
  end;

  -- A linha de origem. `profiles` referencia `auth.users` com cascade, e todo
  -- o resto referencia `profiles`, então isto apaga a conta inteira.
  delete from auth.users where id = v_user_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Só o usuário logado, e só sobre si mesmo: a função nunca recebe um id, ela
-- lê `auth.uid()`. `public` junto porque `anon` herda dele (§ endurecimento).
revoke execute on function delete_my_account() from public, anon;
grant execute on function delete_my_account() to authenticated;
