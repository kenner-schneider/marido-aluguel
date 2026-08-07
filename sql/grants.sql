-- =====================================================================
-- Permissões de acesso — rode no SQL Editor depois do schema.sql
--
-- POR QUE ISTO EXISTE:
-- Com a opção "Automatically expose new tables" desligada (recomendado),
-- o Supabase não concede privilégios automaticamente nas tabelas novas.
-- A service_role ignora RLS, mas ainda precisa do GRANT no nível da tabela.
--
-- Concedemos SÓ para service_role (usada apenas pelo nosso servidor) e
-- revogamos explicitamente de anon/authenticated. Resultado: quem tiver a
-- chave pública não lê nem escreve nada, em nenhuma tabela.
-- =====================================================================

grant usage on schema public to service_role;

grant all privileges on
  public.profissionais,
  public.servicos,
  public.chamados,
  public.chamado_fotos
to service_role;

grant usage, select on all sequences in schema public to service_role;

-- Trava explícita das chaves públicas (defesa em profundidade: a RLS sem
-- policy já bloquearia, mas sem GRANT nem chega a ser avaliada).
revoke all privileges on
  public.profissionais,
  public.servicos,
  public.chamados,
  public.chamado_fotos
from anon, authenticated;

-- Tabelas criadas daqui pra frente seguem o mesmo padrão automaticamente.
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant usage, select on sequences to service_role;

-- Confirmação: deve listar as 4 tabelas apenas com service_role.
select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privilegios
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('profissionais','servicos','chamados','chamado_fotos')
  and grantee in ('anon','authenticated','service_role')
group by table_name, grantee
order by table_name, grantee;
