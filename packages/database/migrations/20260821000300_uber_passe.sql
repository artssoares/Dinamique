-- ============================================================================
-- Uber Passe
--
-- Em alguns pontos de São Paulo — aeroportos, terminais, alguns shoppings —
-- o motorista paga uma taxa de acesso para poder embarcar passageiro ali.
-- Sai do bolso dele durante a jornada e some do lucro, então precisa existir
-- como categoria: sem ela o dinheiro vira "Outros" e o motorista não
-- consegue ver quanto o passe custou no mês.
--
-- is_vehicle_cost = true pelo mesmo motivo do pedágio e do estacionamento
-- (§35): é o carro entrando num lugar, não uma despesa pessoal do dia.
-- ============================================================================

insert into expense_categories (slug, name, is_vehicle_cost, sort_order) values
  ('uber-passe', 'Uber Passe', true, 45)
on conflict (slug) do nothing;
