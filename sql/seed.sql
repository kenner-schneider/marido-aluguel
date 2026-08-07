-- =====================================================================
-- SeuQuebraGalho — dados iniciais
-- Rode DEPOIS de sql/schema.sql, no SQL Editor do Supabase.
--
-- AJUSTE ANTES DE RODAR: os preços abaixo são os do MVP demonstrativo.
-- Troque pelos valores reais de Santa Maria, e substitua os profissionais
-- de exemplo pelos nomes e telefones reais da equipe de vocês.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Serviços  (preco_base = "a partir de"; null significa sob orçamento)
-- ---------------------------------------------------------------------
insert into public.servicos (id, nome, descricao, preco_base, ordem) values
  ('chuveiro',   'Chuveiro e elétrica',   'Troca de chuveiro e resistência, tomadas, interruptores, luminárias e ventilador de teto.', 90.00,  1),
  ('hidraulica', 'Hidráulica',            'Torneiras, sifões, descargas, registros e vazamentos.',                                     110.00, 2),
  ('montagem',   'Montagem de móveis',    'Montagem e desmontagem de móveis, ajustes e reforços.',                                      85.00,  3),
  ('instalacao', 'Instalações',           'Suporte de TV, cortinas, persianas, prateleiras, quadros e espelhos.',                       95.00,  4),
  ('reparos',    'Reparos gerais',        'Portas, fechaduras, pequenos consertos do dia a dia.',                                       90.00,  5),
  ('outro',      'Outro serviço',         'Descreva o que precisa e avaliamos sem compromisso.',                                        null,   6)
on conflict (id) do update
  set nome       = excluded.nome,
      descricao  = excluded.descricao,
      preco_base = excluded.preco_base,
      ordem      = excluded.ordem;

-- ---------------------------------------------------------------------
-- Profissionais  — SUBSTITUA pelos reais da equipe
-- telefone no formato E.164 sem '+': 55 + DDD + número
-- ---------------------------------------------------------------------
insert into public.profissionais (nome, telefone, especialidades) values
  ('Carlos Andrade', '5555999990001', array['chuveiro','instalacao','reparos']),
  ('Márcio Souza',   '5555999990002', array['chuveiro','hidraulica','reparos']),
  ('Edson Ferreira', '5555999990003', array['montagem','instalacao','reparos'])
on conflict do nothing;
