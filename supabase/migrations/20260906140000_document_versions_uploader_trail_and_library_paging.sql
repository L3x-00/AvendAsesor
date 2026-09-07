-- TSK-0037 (deuda técnica): trazabilidad del responsable de cada versión y
-- coste de la biblioteca documental con volumen.
--
-- 1. TRAZABILIDAD. `document_versions.uploaded_by` no tenía integridad
--    referencial hacia `profiles`. Si un perfil se borraba, el historial de
--    versiones mostraba "Cuenta no disponible" y se perdía el rastro del
--    responsable sin dejar traza.
--
--    No se añade una FK: `profiles.id` cascadea desde `auth.users`, así que un
--    `on delete restrict` bloquearía el borrado de cualquier administrador que
--    haya cargado documentos —incluida la compensación de alta de usuarios— y
--    un `on delete set null` chocaría con el trigger de inmutabilidad, que
--    prohíbe modificar `uploaded_by`. Se desnormaliza el nombre en el momento
--    de la carga: el rastro pasa a ser inmutable e independiente de que el
--    perfil siga existiendo, que es justo lo que exige una auditoría.
--
-- 2. COSTE. Medido con 5.000 documentos en la base local:
--       join + lateral + orden + LIMIT 20, sin window ......  5,2 ms
--       lo mismo con count(*) over () ......................  9,1 ms
--       la RPC list_document_library completa .............. 177,0 ms
--    La diferencia no está en el ORDER BY ni en el window: está en que el
--    `jsonb_agg` de asociaciones se construía para TODAS las filas filtradas y
--    se descartaba para todas menos las 20 de la página. Ahora las claves de
--    orden se calculan con agregados escalares baratos y el JSON de
--    asociaciones se construye solo para la página ya recortada.

alter table public.document_versions
  add column if not exists uploaded_by_name text
    check (uploaded_by_name is null or char_length(btrim(uploaded_by_name)) between 1 and 160);

comment on column public.document_versions.uploaded_by_name
  is 'Nombre del administrador en el momento de la carga. Se conserva aunque su perfil desaparezca.';

update public.document_versions as version
set uploaded_by_name = profile.full_name
from public.profiles as profile
where profile.id = version.uploaded_by
  and version.uploaded_by_name is null;

-- Se captura en la inserción, no en cada RPC, para que cualquier ruta de carga
-- —presente o futura— deje el rastro sin tener que acordarse.
create or replace function private.capture_document_version_uploader_name()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.uploaded_by is not null and new.uploaded_by_name is null then
    select profile.full_name
    into new.uploaded_by_name
    from public.profiles as profile
    where profile.id = new.uploaded_by;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_document_version_uploader_name()
  from public, anon, authenticated;

drop trigger if exists document_versions_capture_uploader_name on public.document_versions;
create trigger document_versions_capture_uploader_name
before insert on public.document_versions
for each row execute procedure private.capture_document_version_uploader_name();

-- El nombre del responsable es parte del rastro inmutable de la versión.
create or replace function private.prevent_document_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_status text := old.ingestion_status::text;
  new_status text := new.ingestion_status::text;
  transition_allowed boolean := coalesce(
    current_setting('app.avend_ingestion_transition', true),
    ''
  ) = 'active';
begin
  if new.document_id is distinct from old.document_id
    or new.version_number is distinct from old.version_number
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.original_file_name is distinct from old.original_file_name
    or new.mime_type is distinct from old.mime_type
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.page_count is distinct from old.page_count
    or new.sha256 is distinct from old.sha256
    or new.uploaded_at is distinct from old.uploaded_at
    or new.uploaded_by is distinct from old.uploaded_by
    or new.uploaded_by_name is distinct from old.uploaded_by_name then
    raise exception 'Document versions are immutable; create a new version instead';
  end if;

  if old_status is distinct from new_status then
    if not transition_allowed then
      raise exception 'Document ingestion state is controlled by the ingestion worker';
    end if;

    if not (
      (old_status = 'pending' and new_status in ('processing', 'failed'))
      or (old_status = 'processing' and new_status in ('pending', 'indexed', 'failed'))
      or (old_status = 'failed' and new_status = 'pending')
      or (old_status = 'indexed' and new_status = 'pending')
    ) then
      raise exception 'Invalid document ingestion state transition: % -> %', old_status, new_status;
    end if;
  elsif new.ingestion_updated_at is distinct from old.ingestion_updated_at
    and not transition_allowed then
    raise exception 'Document ingestion state is controlled by the ingestion worker';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_document_version_mutation()
  from public, anon, authenticated;

-- La biblioteca deja de construir el JSON de asociaciones para filas que nunca
-- se devuelven. El contrato de columnas y el orden no cambian.
create or replace function public.list_document_library(
  p_query text default null,
  p_issuance_year smallint default null,
  p_document_type text default null,
  p_issuing_entity text default null,
  p_module_id uuid default null,
  p_submodule_id uuid default null,
  p_situation public.document_situation default null,
  p_technical_status text default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0,
  p_created_from date default null,
  p_created_to date default null,
  p_created_by uuid default null
)
returns table (
  id uuid, title text, document_type text, issuing_entity text,
  issuance_year smallint, resolution_number text, article_reference text,
  publication_status public.document_publication_status,
  situation public.document_situation, replacement_document_id uuid,
  replacement_date date, replacement_year smallint, replacement_reason text,
  replacement_observation text, current_version_id uuid, metadata jsonb,
  created_at timestamptz, created_by uuid, created_by_name text,
  updated_at timestamptz, updated_by uuid,
  current_version_ingestion_status public.document_ingestion_status,
  current_version_uploaded_at timestamptz, module_associations jsonb,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := nullif(btrim(p_query), '');
  search_query tsquery;
  normalized_reference text;
begin
  if normalized_query is not null and char_length(normalized_query) > 200 then
    raise exception using errcode = '22023', message = 'Search query is too long';
  end if;
  if p_technical_status is not null and p_technical_status not in ('ready', 'pending_approval', 'error') then
    raise exception using errcode = '22023', message = 'Technical status is invalid';
  end if;
  if p_sort not in ('newest', 'oldest', 'year', 'title', 'upload_date',
    'document_type', 'issuing_entity', 'situation', 'technical_status', 'module') then
    raise exception using errcode = '22023', message = 'Document sort is invalid';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Pagination is invalid';
  end if;
  if p_created_from is not null and p_created_to is not null
    and p_created_from > p_created_to then
    raise exception using errcode = '22023', message = 'Upload date range is invalid';
  end if;

  if normalized_query is not null then
    search_query := websearch_to_tsquery('public.spanish_unaccent', normalized_query);
    if search_query is null or numnode(search_query) = 0 then
      search_query := null;
    end if;
    normalized_reference := public.normalize_document_reference(normalized_query);
    if char_length(normalized_reference) < 3 then
      normalized_reference := null;
    end if;
  end if;

  return query
  with recursive module_filter as (
    select module.id from public.modules as module
    where p_module_id is not null and module.id = p_module_id and not module.is_deleted
    union all
    select child.id from public.modules as child
    join module_filter as parent on child.parent_module_id = parent.id
    where not child.is_deleted
  ), candidates as (
    select
      document.*,
      profile.full_name as created_by_name,
      version.uploaded_at as current_version_uploaded_at,
      case
        when version.id is null or version.ingestion_status = 'failed' then 'error'
        when version.ingestion_status = 'indexed' and document.approval_status = 'ready'
          and document.approved_version_id = document.current_version_id then 'ready'
        else 'pending_approval'
      end as technical_status,
      case
        when version.id is null or version.ingestion_status = 'failed' then 'failed'::public.document_ingestion_status
        when version.ingestion_status = 'indexed' and document.approval_status = 'ready'
          and document.approved_version_id = document.current_version_id then 'indexed'::public.document_ingestion_status
        else 'pending'::public.document_ingestion_status
      end as exposed_ingestion_status,
      -- Solo las claves de orden, con agregados escalares. El JSON de
      -- asociaciones se arma más abajo, ya sobre la página recortada.
      coalesce(location.first_sort, 2147483647) as first_module_sort,
      coalesce(location.first_name, '') as first_module_name
    from public.documents as document
    left join public.document_versions as version
      on version.id = document.current_version_id and version.document_id = document.id
    left join public.profiles as profile on profile.id = document.created_by
    left join lateral (
      select
        min(coalesce(parent.sort_order, linked.sort_order)) as first_sort,
        min(lower(coalesce(parent.name, linked.name))) as first_name
      from public.document_modules as relation
      join public.modules as linked on linked.id = relation.module_id and not linked.is_deleted
      left join public.modules as parent on parent.id = linked.parent_module_id and not parent.is_deleted
      where relation.document_id = document.id
    ) as location on true
    where not document.is_deleted
      and (
        normalized_query is null
        or (
          search_query is not null
          and (
            document.search_vector @@ search_query
            or document.governed_metadata_search_vector @@ search_query
          )
        )
        or (
          normalized_reference is not null
          and document.search_reference like '%' || normalized_reference || '%'
        )
      )
      and (p_issuance_year is null or document.issuance_year = p_issuance_year)
      and (p_document_type is null or document.document_type = p_document_type)
      and (
        p_issuing_entity is null
        or lower(document.issuing_entity) = lower(btrim(p_issuing_entity))
      )
      and (p_situation is null or document.situation = p_situation)
      and (p_created_by is null or document.created_by = p_created_by)
      and (
        p_created_from is null
        or (document.created_at at time zone 'America/Lima')::date >= p_created_from
      )
      and (
        p_created_to is null
        or (document.created_at at time zone 'America/Lima')::date <= p_created_to
      )
      and (p_module_id is null or exists (
        select 1 from public.document_modules as relation
        join module_filter on module_filter.id = relation.module_id
        where relation.document_id = document.id
      ))
      and (p_submodule_id is null or exists (
        select 1 from public.document_modules as relation
        where relation.document_id = document.id and relation.module_id = p_submodule_id
      ))
  ), filtered as (
    select * from candidates
    where p_technical_status is null or technical_status = p_technical_status
  ), paged as (
    select filtered.*, count(*) over () as page_total
    from filtered
    order by
      case when p_sort = 'newest' then filtered.current_version_uploaded_at end desc nulls last,
      case when p_sort = 'oldest' then filtered.current_version_uploaded_at end asc nulls last,
      case when p_sort = 'year' then filtered.issuance_year end desc nulls last,
      case when p_sort = 'title' then lower(filtered.title) end,
      case when p_sort = 'upload_date' then filtered.created_at end desc nulls last,
      case when p_sort = 'document_type' then filtered.document_type end,
      case when p_sort = 'issuing_entity' then filtered.issuing_entity end,
      case when p_sort = 'situation' then
        case filtered.situation
          when 'current' then 1
          when 'replaced' then 2
          when 'archived' then 3
        end
      end,
      case when p_sort = 'technical_status' then
        case filtered.technical_status
          when 'error' then 1
          when 'pending_approval' then 2
          when 'ready' then 3
        end
      end,
      case when p_sort = 'module' then filtered.first_module_sort end,
      case when p_sort = 'module' then filtered.first_module_name end,
      filtered.current_version_uploaded_at desc nulls last,
      filtered.id
    limit p_limit offset p_offset
  )
  select
    paged.id, paged.title, paged.document_type, paged.issuing_entity,
    paged.issuance_year, paged.resolution_number, paged.article_reference,
    paged.publication_status, paged.situation,
    paged.replacement_document_id, paged.replacement_date,
    paged.replacement_year, paged.replacement_reason,
    paged.replacement_observation, paged.current_version_id,
    paged.metadata, paged.created_at, paged.created_by,
    paged.created_by_name, paged.updated_at, paged.updated_by,
    paged.exposed_ingestion_status, paged.current_version_uploaded_at,
    coalesce(associations.items, '[]'::jsonb),
    paged.page_total
  from paged
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'linked_module_id', linked.id,
      'linked_module_name', linked.name,
      'module_id', coalesce(parent.id, linked.id),
      'module_name', coalesce(parent.name, linked.name),
      'submodule_id', case when parent.id is null then null else linked.id end,
      'submodule_name', case when parent.id is null then null else linked.name end
    ) order by coalesce(parent.sort_order, linked.sort_order), linked.sort_order, linked.name, linked.id) as items
    from public.document_modules as relation
    join public.modules as linked on linked.id = relation.module_id and not linked.is_deleted
    left join public.modules as parent on parent.id = linked.parent_module_id and not parent.is_deleted
    where relation.document_id = paged.id
  ) as associations on true
  order by
    case when p_sort = 'newest' then paged.current_version_uploaded_at end desc nulls last,
    case when p_sort = 'oldest' then paged.current_version_uploaded_at end asc nulls last,
    case when p_sort = 'year' then paged.issuance_year end desc nulls last,
    case when p_sort = 'title' then lower(paged.title) end,
    case when p_sort = 'upload_date' then paged.created_at end desc nulls last,
    case when p_sort = 'document_type' then paged.document_type end,
    case when p_sort = 'issuing_entity' then paged.issuing_entity end,
    case when p_sort = 'situation' then
      case paged.situation
        when 'current' then 1
        when 'replaced' then 2
        when 'archived' then 3
      end
    end,
    case when p_sort = 'technical_status' then
      case paged.technical_status
        when 'error' then 1
        when 'pending_approval' then 2
        when 'ready' then 3
      end
    end,
    case when p_sort = 'module' then paged.first_module_sort end,
    case when p_sort = 'module' then paged.first_module_name end,
    paged.current_version_uploaded_at desc nulls last,
    paged.id;
end;
$$;

revoke all on function public.list_document_library(
  text, smallint, text, text, uuid, uuid, public.document_situation,
  text, text, integer, integer, date, date, uuid
) from public, anon, authenticated;
grant execute on function public.list_document_library(
  text, smallint, text, text, uuid, uuid, public.document_situation,
  text, text, integer, integer, date, date, uuid
) to service_role;
