-- Local-only shim reproducing the parts of Supabase our migrations depend on.
-- Used to validate migrations against a plain Postgres in CI; it is NEVER
-- applied to a real Supabase project, which provides these itself.
create schema if not exists auth;

create table if not exists auth.users (
  id                 uuid primary key default gen_random_uuid(),
  email              text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at         timestamptz default now()
);

create or replace function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon');
$$;

do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;

do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

-- Papel do serviço de autenticação da Supabase. É ele quem insere em
-- auth.users, e portanto quem dispara o gatilho de criação de conta.
do $$ begin
  create role supabase_auth_admin nologin;
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------- extensões --
-- Numa Supabase, `pgcrypto` e `citext` JÁ VÊM instaladas, e no schema
-- `extensions` – não em `public`. O `create extension if not exists` das
-- migrations não muda isso: a extensão já existe, então o comando não faz
-- nada e ela continua onde estava.
--
-- Instalar em `public` aqui era uma mentira confortável: `gen_random_bytes`
-- ficava visível para qualquer função com `search_path = public`, e o
-- cadastro passava no teste enquanto quebrava em produção. Foi exatamente o
-- que aconteceu.
create schema if not exists extensions;
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext"   with schema extensions;

-- A busca padrão da Supabase inclui `extensions`, e é por isso que as
-- migrations conseguem declarar uma coluna `citext` sem qualificar o schema.
-- Sem esta linha o ambiente de teste ficaria MAIS restrito que a produção, e
-- passaria a acusar erro onde não há.
do $$ begin
  execute format(
    'alter database %I set search_path to "$user", public, extensions',
    current_database());
end $$;

-- ---------------------------------------------------------------- storage --
-- Reprodução mínima do schema de arquivos da Supabase, só o suficiente para
-- que as políticas dos buckets sejam validadas localmente.
create schema if not exists storage;

create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text not null,
  owner      uuid,
  created_at timestamptz default now()
);

alter table storage.objects enable row level security;

-- A Supabase expõe esta função; as políticas dependem dela para descobrir a
-- primeira pasta do caminho (que é sempre o id do usuário).
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

-- ---------------------------------------------------------------- padrões --
-- A Supabase concede EXECUTE em toda função nova para `anon` e `authenticated`
-- por meio de default privileges. O ambiente de teste NÃO reproduzia isso, e
-- foi por isso que os testes passaram enquanto `apply_subscription_state`
-- estava acessível sem login no projeto real.
--
-- Reproduzir o padrão aqui faz com que um `revoke ... from public` sozinho
-- volte a falhar no teste, como falha na produção.
alter default privileges in schema public grant execute on functions to anon, authenticated;
alter default privileges in schema public grant select on tables to anon, authenticated;
