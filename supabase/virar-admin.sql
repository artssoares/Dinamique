-- ============================================================================
-- Te transforma em administrador do painel.
--
-- Rode DEPOIS de criar sua conta no aplicativo – o comando procura pelo
-- e-mail que você usou no cadastro.
--
-- Troque o e-mail abaixo se tiver usado outro.
-- ============================================================================

insert into admin_users (user_id, role)
select id, 'superadmin'
from profiles
where email = 'thiagovieiralins@gmail.com'
on conflict (user_id) do update set role = 'superadmin', is_active = true;

-- Confere se deu certo: tem que aparecer uma linha com 'superadmin'.
select p.email, a.role, a.is_active
from admin_users a
join profiles p on p.id = a.user_id;
