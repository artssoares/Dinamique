# Resultado da aplicação da correção do cadastro

Projeto: **Dinamique Finanças** (`rwwfqmytvhqelvricniz`), região `us-west-2`, Postgres 17.6.

Arquivo aplicado: `packages/database/migrations/20260818001600_extensions_schema.sql`,
sem nenhuma alteração, com o nome de migration `extensions_schema_fix`.

## 1. A migration foi aplicada?

**Sim.** A ferramenta `apply_migration` devolveu:

```
{"success":true}
```

## 2. Conferência (passo 3)

### 2a. Funções do schema `public` que fixam o caminho de busca

Consulta:

```sql
select proname, proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proconfig is not null;
```

Saída literal:

```
[{"proname":"is_admin","proconfig":["search_path=public, extensions"]},
 {"proname":"has_admin_role","proconfig":["search_path=public, extensions"]},
 {"proname":"handle_new_user","proconfig":["search_path=public, extensions"]},
 {"proname":"benchmark_min_sample","proconfig":["search_path=public, extensions"]},
 {"proname":"mark_ticket_read","proconfig":["search_path=public, extensions"]},
 {"proname":"set_updated_at","proconfig":["search_path=public, extensions"]},
 {"proname":"support_message_touch_ticket","proconfig":["search_path=public, extensions"]},
 {"proname":"unaccent_simple","proconfig":["search_path=public, extensions"]},
 {"proname":"seed_notification_preferences","proconfig":["search_path=public, extensions"]},
 {"proname":"import_vehicle","proconfig":["search_path=public, extensions"]},
 {"proname":"seed_vehicle","proconfig":["search_path=public, extensions"]},
 {"proname":"send_notification","proconfig":["search_path=public, extensions"]},
 {"proname":"resolve_audience","proconfig":["search_path=public, extensions"]},
 {"proname":"mark_referral_converted","proconfig":["search_path=public, extensions"]},
 {"proname":"consume_discount_benefit","proconfig":["search_path=public, extensions"]},
 {"proname":"apply_subscription_state","proconfig":["search_path=public, extensions"]},
 {"proname":"user_attribution_is_immutable","proconfig":["search_path=public, extensions"]},
 {"proname":"process_reminders","proconfig":["search_path=public, extensions"]},
 {"proname":"redeem_code","proconfig":["search_path=public, extensions"]}]
```

São 19 funções, e **todas** as 19 têm `extensions` junto de `public`. Nenhuma
ficou com o caminho preso só em `public`. Era exatamente o que a correção
precisava fazer.

### 2b. Onde moram as extensões

Consulta:

```sql
select extname, nspname from pg_extension e join pg_namespace n on n.oid=e.extnamespace where extname in ('pgcrypto','citext');
```

Saída literal:

```
[{"extname":"pgcrypto","nspname":"extensions"},
 {"extname":"citext","nspname":"public"}]
```

Observação honesta sobre este resultado: o `pgcrypto` está mesmo no schema
`extensions`, como o diagnóstico previa — é ele que guarda o
`gen_random_bytes` que derrubava o cadastro. Já o `citext` está em `public`
neste projeto, e não em `extensions` como o comentário da migration supunha.
Isso não atrapalha nada: com o caminho de busca valendo `public, extensions`,
os dois são encontrados de qualquer jeito. Só vale registrar que a suposição
sobre o `citext` não se confirmou aqui. O verificador de segurança da Supabase
reclama disso separadamente (ver seção 4).

## 3. Teste do cadastro de ponta a ponta (passo 4)

Rodado exatamente como pedido, dentro de `begin` / `rollback`:

```sql
begin;
insert into auth.users (id, email, raw_user_meta_data)
values (gen_random_uuid(), 'teste-dinamique@example.com', '{"full_name": "Teste Dinamique"}'::jsonb);
select
  (select count(*) from profiles where email='teste-dinamique@example.com') as perfil,
  (select count(*) from subscriptions where user_id=(select id from profiles where email='teste-dinamique@example.com')) as teste_gratis,
  (select code from promotion_codes where owner_user_id=(select id from profiles where email='teste-dinamique@example.com')) as codigo;
rollback;
```

Saída literal:

```
[{"perfil":1,"teste_gratis":1,"codigo":"TESTE83"}]
```

Ou seja: perfil = 1, teste grátis = 1 e o código de indicação `TESTE83`, no
formato esperado. **Nenhum erro.** O cadastro voltou a funcionar.

Conferência de que não sobrou lixo no banco depois do `rollback`:

```sql
select (select count(*) from auth.users where email='teste-dinamique@example.com') as usuarios_auth,
       (select count(*) from profiles where email='teste-dinamique@example.com') as perfis;
```

Saída literal:

```
[{"usuarios_auth":0,"perfis":0}]
```

Zero e zero — o usuário de teste não existe mais, como esperado.

## 4. Alertas de segurança que sobraram (passo 5)

`get_advisors` com tipo `security` devolveu 10 alertas. Nenhum deles tem
relação com esta correção — todos já existiam antes e continuam de pé.
Nenhuma proteção foi desligada para fazer o cadastro funcionar.

**Nível ERRO (2):**

1. `security_definer_view` — a visão `public.benchmark_buckets` foi criada com
   a propriedade SECURITY DEFINER.
   https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view
2. `security_definer_view` — a visão `public.benchmark_national` foi criada com
   a propriedade SECURITY DEFINER.
   https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

**Nível AVISO (8):**

3. `extension_in_public` — a extensão `citext` está instalada no schema
   `public`; a Supabase recomenda movê-la para outro schema.
   https://supabase.com/docs/guides/database/database-linter?lint=0014_extension_in_public
4. `anon_security_definer_function_executable` — a função
   `public.has_admin_role(required public.admin_role[])` pode ser executada
   pelo papel `anon` (sem login) via `/rest/v1/rpc/has_admin_role`.
   https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
5. `anon_security_definer_function_executable` — a função `public.is_admin()`
   pode ser executada pelo papel `anon` (sem login) via `/rest/v1/rpc/is_admin`.
   https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
6. `authenticated_security_definer_function_executable` — a função
   `public.has_admin_role(required public.admin_role[])` pode ser executada
   pelo papel `authenticated`.
   https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
7. `authenticated_security_definer_function_executable` — a função
   `public.is_admin()` pode ser executada pelo papel `authenticated`.
   https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
8. `authenticated_security_definer_function_executable` — a função
   `public.mark_ticket_read(p_ticket_id uuid)` pode ser executada pelo papel
   `authenticated`.
   https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
9. `authenticated_security_definer_function_executable` — a função
   `public.redeem_code(p_code text)` pode ser executada pelo papel
   `authenticated`.
   https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
10. `auth_leaked_password_protection` — a proteção contra senhas vazadas está
    desligada. A Supabase pode checar as senhas contra a base do
    HaveIBeenPwned.org; hoje isso não está ativo.
    https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## 5. Erros

**Nenhum.** Todos os passos rodaram sem erro: a migration foi aplicada, as duas
conferências devolveram o esperado e o teste de cadastro passou com
perfil = 1, teste grátis = 1 e código `TESTE83`.
