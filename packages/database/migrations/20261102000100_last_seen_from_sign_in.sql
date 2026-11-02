-- "Último acesso" no painel vinha sempre vazio.
--
-- O aplicativo grava `profiles.last_seen_at` ao abrir, mas a gravação nunca
-- saía do aparelho: a consulta do supabase-js só é enviada quando alguém a
-- espera (`await` ou `.then`), e a chamada era feita com `void`. Em 2 de
-- novembro nenhum dos 11 perfis tinha o campo preenchido, embora 9 tivessem
-- entrado no app.
--
-- O aplicativo foi corrigido, mas a correção só chega a quem instalar a versão
-- nova. Por isso o banco passa a registrar também o próprio login: cada vez
-- que o Supabase Auth atualiza `auth.users.last_sign_in_at`, o perfil recebe o
-- mesmo horário. Assim o painel mostra um dado real já agora, para todas as
-- versões do app.

create or replace function public.sync_last_seen_from_sign_in()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if new.last_sign_in_at is not null then
    update public.profiles
       set last_seen_at = greatest(coalesce(last_seen_at, new.last_sign_in_at), new.last_sign_in_at)
     where id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.sync_last_seen_from_sign_in() from public, anon, authenticated;

drop trigger if exists users_sync_last_seen on auth.users;
create trigger users_sync_last_seen
  after update of last_sign_in_at on auth.users
  for each row
  when (new.last_sign_in_at is distinct from old.last_sign_in_at)
  execute function public.sync_last_seen_from_sign_in();

-- Quem já entrou antes desta migration ganha o horário do último login.
update public.profiles p
   set last_seen_at = u.last_sign_in_at
  from auth.users u
 where u.id = p.id
   and u.last_sign_in_at is not null
   and (p.last_seen_at is null or p.last_seen_at < u.last_sign_in_at);
