-- =====================================================================
-- SeuQuebraGalho — schema do Supabase (fase 1)
--
-- COMO USAR:
--   1. No painel do Supabase, abra "SQL Editor" → "New query".
--   2. Cole este arquivo inteiro e clique em "Run".
--   3. Depois rode também o arquivo sql/seed.sql (dados iniciais).
--
-- SEGURANÇA: todas as tabelas ficam com RLS ligada e SEM nenhuma policy.
-- Isso bloqueia qualquer acesso pela chave pública (anon). Só o servidor,
-- usando a service_role key (que nunca vai para o navegador), enxerga os
-- dados. É o comportamento que queremos: o cliente nunca fala com o banco
-- direto, sempre pelo nosso backend.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Profissionais (gerenciados por nós, não se cadastram sozinhos)
-- ---------------------------------------------------------------------
create table if not exists public.profissionais (
  id              uuid primary key default gen_random_uuid(),
  nome            text        not null,
  telefone        text        not null,          -- formato E.164 sem '+', ex: 5555999998888
  especialidades  text[]      not null default '{}',
  ativo           boolean     not null default true,
  criado_em       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Serviços oferecidos (alimenta o formulário e a tabela de preços)
-- ---------------------------------------------------------------------
create table if not exists public.servicos (
  id          text primary key,                  -- ex: 'chuveiro'
  nome        text    not null,
  descricao   text    not null default '',
  preco_base  numeric(10,2),                     -- referência "a partir de"; null = sob orçamento
  ordem       int     not null default 0,
  ativo       boolean not null default true
);

-- ---------------------------------------------------------------------
-- Chamados (o coração da operação)
-- ---------------------------------------------------------------------
create table if not exists public.chamados (
  id                  uuid primary key default gen_random_uuid(),
  codigo              text unique not null,       -- ex: 'SQG-4823', mostrado ao cliente

  -- o que o cliente pediu
  servico_id          text        references public.servicos(id),
  descricao           text        not null,
  urgente             boolean     not null default false,

  -- quando
  data_preferida      date,
  turno_preferido     text        check (turno_preferido in ('manha','tarde','noite')),
  data_alternativa    date,
  turno_alternativo   text        check (turno_alternativo in ('manha','tarde','noite')),

  -- onde e quem  (dado pessoal: nunca sai em notificação, só no painel)
  cliente_nome        text        not null,
  cliente_telefone    text        not null,
  cliente_email       text,
  endereco            text        not null,
  bairro              text        not null,

  -- ciclo de vida
  status              text        not null default 'novo'
                        check (status in ('novo','em_analise','orcado','agendado','concluido','cancelado')),
  profissional_id     uuid        references public.profissionais(id) on delete set null,
  agendado_para       timestamptz,

  -- dinheiro: o profissional recebe do cliente e repassa a taxa para nós
  valor_cobrado       numeric(10,2),
  taxa_percentual     numeric(5,2) not null default 20.00,
  taxa_valor          numeric(10,2) generated always as
                        (round(coalesce(valor_cobrado,0) * taxa_percentual / 100.0, 2)) stored,
  repasse_recebido    boolean     not null default false,

  observacoes_internas text       not null default '',
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now()
);

create index if not exists chamados_status_idx    on public.chamados (status, criado_em desc);
create index if not exists chamados_codigo_idx    on public.chamados (codigo);
create index if not exists chamados_prof_idx      on public.chamados (profissional_id, status);
create index if not exists chamados_criado_em_idx on public.chamados (criado_em desc);

-- ---------------------------------------------------------------------
-- Fotos do chamado
--
-- Guardamos só o caminho no Storage. O arquivo vive num bucket PRIVADO e
-- só é exibido via URL assinada de curta duração, gerada pelo servidor
-- para quem está logado no painel.
-- ---------------------------------------------------------------------
create table if not exists public.chamado_fotos (
  id            uuid primary key default gen_random_uuid(),
  chamado_id    uuid not null references public.chamados(id) on delete cascade,
  storage_path  text not null,
  largura       int,
  altura        int,
  bytes         int,
  criado_em     timestamptz not null default now()
);

create index if not exists chamado_fotos_chamado_idx on public.chamado_fotos (chamado_id);

-- ---------------------------------------------------------------------
-- atualizado_em automático
-- ---------------------------------------------------------------------
create or replace function public.tocar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists chamados_atualizado_em on public.chamados;
create trigger chamados_atualizado_em
  before update on public.chamados
  for each row execute function public.tocar_atualizado_em();

-- ---------------------------------------------------------------------
-- RLS: liga em tudo e NÃO cria policy nenhuma.
-- Resultado: chave anon/pública não lê nem escreve nada. Só a service_role
-- (usada apenas no servidor) tem acesso, pois ela ignora RLS por definição.
-- ---------------------------------------------------------------------
alter table public.profissionais  enable row level security;
alter table public.servicos       enable row level security;
alter table public.chamados       enable row level security;
alter table public.chamado_fotos  enable row level security;

-- ---------------------------------------------------------------------
-- Bucket privado das fotos
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chamados',
  'chamados',
  false,                                -- PRIVADO: sem URL pública, só assinada
  8388608,                              -- 8 MB por arquivo
  array['image/jpeg','image/webp']      -- só o que o nosso re-encode produz
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Sem policies em storage.objects para o bucket 'chamados':
-- upload e leitura acontecem exclusivamente pelo servidor com service_role.

-- ---------------------------------------------------------------------
-- LGPD — retenção de fotos
--
-- Foto da casa + endereço é dado pessoal. Esta função apaga os REGISTROS
-- de fotos de chamados concluídos/cancelados há mais de 90 dias.
-- Rode periodicamente (Supabase → Database → Cron) e limpe também os
-- arquivos no Storage pelo endpoint /admin/retencao do servidor.
-- ---------------------------------------------------------------------
create or replace function public.limpar_fotos_antigas(dias int default 90)
returns table (storage_path text)
language sql
as $$
  delete from public.chamado_fotos f
  using public.chamados c
  where f.chamado_id = c.id
    and c.status in ('concluido','cancelado')
    and c.atualizado_em < now() - (dias || ' days')::interval
  returning f.storage_path;
$$;
