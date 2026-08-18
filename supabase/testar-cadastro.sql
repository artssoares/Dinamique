-- ============================================================================
-- DESCOBRE POR QUE O CADASTRO FALHOU.
--
-- Cole no SQL Editor da Supabase e clique em Run. Não cria nada de verdade:
-- tudo é desfeito no fim (rollback).
--
-- O cadastro tem duas metades, e este teste diz qual delas quebrou:
--
--   metade 1 — o BANCO: criar o perfil, o teste grátis e o código de indicação
--   metade 2 — o EMAIL: enviar a mensagem de confirmação
--
-- Se aparecer a linha "CADASTRO OK NO BANCO", a metade 1 está boa e o problema
-- é a metade 2 (email). Se der erro vermelho, o erro é a resposta.
-- ============================================================================

begin;

insert into auth.users (id, email, raw_user_meta_data)
values (gen_random_uuid(), 'teste-dinamique@example.com', '{"full_name": "Teste Dinamique"}'::jsonb);

select
  'CADASTRO OK NO BANCO' as resultado,
  (select count(*) from profiles              where email = 'teste-dinamique@example.com') as perfil,
  (select count(*) from subscriptions         where user_id = (select id from profiles where email = 'teste-dinamique@example.com')) as teste_gratis,
  (select count(*) from promotion_codes       where owner_user_id = (select id from profiles where email = 'teste-dinamique@example.com')) as codigo_indicacao,
  (select count(*) from notification_preferences where user_id = (select id from profiles where email = 'teste-dinamique@example.com')) as preferencias;

rollback;

-- Confere também se o gatilho do cadastro existe. Tem que devolver 1 linha.
select tgname as gatilho_do_cadastro
from pg_trigger
where tgrelid = 'auth.users'::regclass
  and not tgisinternal;
