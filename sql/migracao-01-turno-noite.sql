-- =====================================================================
-- Migração 01 — adiciona o período da noite
--
-- COMO USAR: SQL Editor do Supabase → cole → Run.
-- Pode rodar mais de uma vez sem problema.
--
-- A tabela foi criada aceitando só 'manha' e 'tarde'. Sem soltar essa
-- restrição, qualquer chamado com turno 'noite' é recusado pelo banco.
-- =====================================================================

alter table public.chamados
  drop constraint if exists chamados_turno_preferido_check;

alter table public.chamados
  add constraint chamados_turno_preferido_check
  check (turno_preferido in ('manha','tarde','noite'));

alter table public.chamados
  drop constraint if exists chamados_turno_alternativo_check;

alter table public.chamados
  add constraint chamados_turno_alternativo_check
  check (turno_alternativo in ('manha','tarde','noite'));

-- Confirmação: deve listar as duas restrições já com 'noite'.
select con.conname as restricao,
       pg_get_constraintdef(con.oid) as definicao
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_namespace nsp on nsp.oid = rel.relnamespace
where nsp.nspname = 'public'
  and rel.relname = 'chamados'
  and con.conname like '%turno%'
order by con.conname;
