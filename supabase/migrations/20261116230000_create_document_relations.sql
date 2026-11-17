-- Relaciones entre documentos normativos (Paso 3). Tabla nueva: no modifica
-- documents, document_chunks ni ninguna otra tabla existente.
--
-- Seguridad: RLS activo, sin acceso a anon/authenticated sobre la tabla. El
-- único acceso de lectura es el RPC con search_path fijo, que devuelve también
-- la identidad del documento fuente para poder citarlo. La lectura es global
-- al catálogo (no hay ACL por módulo en este Paso), pero solo devuelve
-- documentos activos y no eliminados, igual que la búsqueda de chunks.

create type public.document_relation_type as enum
  ('modifica', 'deroga', 'reglamenta', 'cita', 'complementa');

create table public.document_relations (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.documents(id),
  target_document_id uuid not null references public.documents(id),
  relation_type public.document_relation_type not null,
  evidence_chunk_id uuid references public.document_chunks(id),
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  constraint no_self_relation check (source_document_id <> target_document_id),
  constraint unique_relation unique (source_document_id, target_document_id, relation_type)
);

alter table public.document_relations enable row level security;

revoke all on table public.document_relations from anon, authenticated;
grant select on table public.document_relations to service_role;

create index document_relations_source_idx
  on public.document_relations (source_document_id);
create index document_relations_target_idx
  on public.document_relations (target_document_id);

--Una fila por documento fuente aunque no tenga relaciones: así el endpoint
--puede citar la norma consultada y responder «no hay relaciones registradas»
--sin inventar títulos.
create function public.get_related_documents(p_document_id uuid)
returns table (
  source_document_id uuid,
  source_title text,
  source_type text,
  source_year smallint,
  relation_id uuid,
  relation_type public.document_relation_type,
  notes text,
  target_document_id uuid,
  target_title text,
  target_type text,
  target_year smallint,
  evidence_chunk_id uuid
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    source.id,
    source.title,
    source.document_type,
    source.issuance_year,
    relation.id,
    relation.relation_type,
    relation.notes,
    target.id,
    target.title,
    target.document_type,
    target.issuance_year,
    relation.evidence_chunk_id
  from public.documents as source
  left join public.document_relations as relation
    on relation.source_document_id = source.id
   and exists (
     select 1
     from public.documents as valid_target
     where valid_target.id = relation.target_document_id
       and valid_target.publication_status = 'active'
       and not valid_target.is_deleted
   )
  left join public.documents as target
    on target.id = relation.target_document_id
  where source.id = p_document_id
    and source.publication_status = 'active'
    and not source.is_deleted
  order by
    relation.relation_type asc nulls last,
    target.issuance_year desc nulls last,
    target.title asc nulls last;
$$;

revoke all on function public.get_related_documents(uuid) from public, anon;
grant execute on function public.get_related_documents(uuid) to authenticated, service_role;
