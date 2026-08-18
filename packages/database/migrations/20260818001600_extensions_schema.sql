-- ============================================================================
-- Correção: o cadastro quebrava porque as extensões não moram em `public`.
--
-- Erro real, no primeiro cadastro do projeto em produção:
--
--   function gen_random_bytes(integer) does not exist
--   CONTEXT: PL/pgSQL function handle_new_user() line 26
--
-- Numa Supabase, `pgcrypto` e `citext` já vêm instaladas no schema
-- `extensions`, não em `public`. O `create extension if not exists` das nossas
-- migrations, portanto, não faz nada — a extensão já existe, em outro lugar.
--
-- Isso sozinho não seria problema: a busca padrão da Supabase inclui
-- `extensions`. O problema é que toda função nossa fixa `set search_path =
-- public`, justamente para não poder ser enganada por um objeto plantado em
-- outro schema. Com o caminho preso em `public`, `gen_random_bytes` some.
--
-- E o cadastro é o pior lugar possível para isso acontecer: a função roda
-- dentro do gatilho de criação de conta, então a conta inteira falha e o
-- aplicativo devolve um erro genérico. Ninguém conseguia se cadastrar.
--
-- O teste local não pegou porque instalava as extensões em `public` — mais uma
-- diferença entre o ambiente de teste e a Supabase real. O shim foi corrigido
-- junto com esta migration.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Parte 1 — o cadastro deixa de depender de extensão nenhuma
--
-- O sufixo do código de indicação são dois caracteres aleatórios. Não precisa
-- de aleatoriedade criptográfica, e não vale a pena que o caminho mais crítico
-- do produto inteiro dependa de onde uma extensão foi instalada. `md5`,
-- `random` e `clock_timestamp` são do próprio Postgres e existem sempre.
--
-- O `translate` continua trocando caracteres ambíguos: o md5 devolve 0-9a-f, e
-- o `0` e o `1` viram `G` e `H` para ninguém confundir com `O` e `I` ao ditar
-- o código por telefone.
-- ---------------------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
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
    v_suffix := upper(substr(
      translate(md5(random()::text || clock_timestamp()::text), '01', 'GH'), 1, 2));
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

-- ---------------------------------------------------------------------------
-- Parte 2 — toda função passa a enxergar o schema `extensions`
--
-- `gen_random_bytes` era só o primeiro a estourar. A mesma armadilha existe
-- para o tipo `citext`, usado em `profiles.email`: o operador de comparação
-- entre dois citext também é procurado pelo search_path, então qualquer
-- consulta por e-mail dentro de uma função quebraria do mesmo jeito, mais
-- tarde e mais difícil de achar.
--
-- Percorrer o catálogo em vez de listar nome por nome é de propósito: uma
-- função criada amanhã com `set search_path = public` cairia na mesma armadilha
-- silenciosamente, e listar à mão é justamente o tipo de coisa que se esquece.
--
-- Continua fechado: `extensions` pertence ao dono do banco e não é gravável
-- por `anon` nem por `authenticated`, então nada pode ser plantado ali.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as assinatura
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proconfig is not null
      and exists (
        select 1 from unnest(p.proconfig) c
        where c like 'search\_path=%' and c not like '%extensions%'
      )
  loop
    execute format('alter function %s set search_path = public, extensions', r.assinatura);
  end loop;
end
$$;
