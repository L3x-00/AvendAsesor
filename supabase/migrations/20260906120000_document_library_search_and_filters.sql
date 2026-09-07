-- TSK-0037: auditoría de "Historial de documentos".
-- Corrige tres incumplimientos del criterio de aceptación del cliente sobre el
-- buscador ("buscar por título, número del documento, entidad o palabras
-- clave"), añade los dos filtros opcionales que el cliente enumeró (fecha de
-- carga y administrador que lo cargó) y hace que los ordenamientos coincidan
-- con lo que el panel muestra.
--
-- 1. La búsqueda era sensible a acentos: 'evaluacion' no encontraba
--    'Evaluación'. El corpus normativo peruano está lleno de tildes y ñ, y los
--    administradores escriben sin ellas.
-- 2. La búsqueda por número dependía del formato tecleado a mano: el parser de
--    PostgreSQL convierte 'RM-100-2026' en los lexemas 'rm', '-100', '-2026',
--    de modo que buscar '100-2026' devolvía cero. Se añade una comparación
--    normalizada alfanumérica que ignora guiones, espacios, barras y puntos.
-- 3. La entidad y el tipo documental solo eran buscables por su código interno
--    ('DRE_GRE'), no por la etiqueta que la propia interfaz muestra
--    ('DRE/GRE', 'Defensoría del Pueblo').

create extension if not exists unaccent with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- Configuración de búsqueda que ignora tildes y ñ en ambos sentidos: el texto
-- indexado y la consulta pasan por el mismo diccionario, de modo que
-- 'evaluación' y 'evaluacion' comparten lexema.
do $$
begin
  if not exists (
    select 1
    from pg_ts_config as config
    join pg_namespace as namespace on namespace.oid = config.cfgnamespace
    where config.cfgname = 'spanish_unaccent' and namespace.nspname = 'public'
  ) then
    create text search configuration public.spanish_unaccent (copy = pg_catalog.spanish);
    alter text search configuration public.spanish_unaccent
      alter mapping for hword, hword_part, word
      with extensions.unaccent, spanish_stem;
  end if;
end;
$$;

-- Reduce cualquier referencia documental a su esqueleto alfanumérico para que
-- 'RVM N.° 081-2025-MINEDU', 'RVM-081-2025-MINEDU' y '081/2025' se comparen
-- igual. Es IMMUTABLE para poder respaldarla con un índice.
create or replace function public.normalize_document_reference(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.lower(coalesce(p_value, '')),
    '[^a-z0-9]',
    '',
    'g'
  );
$$;

comment on function public.normalize_document_reference(text)
  is 'Alphanumeric skeleton of a normative reference so search ignores hyphens, spaces, slashes and dots.';

revoke all on function public.normalize_document_reference(text) from public, anon, authenticated;
grant execute on function public.normalize_document_reference(text) to service_role;

-- Las columnas generadas se recrean con la configuración sin acentos y se les
-- suma la etiqueta legible de entidad y de tipo documental, que es el texto que
-- el administrador ve en los desplegables y el que teclea en el buscador.
drop index if exists public.documents_library_search_idx;
drop index if exists public.documents_governed_metadata_search_idx;

alter table public.documents drop column if exists search_reference;
alter table public.documents drop column search_vector;
alter table public.documents drop column governed_metadata_search_vector;

alter table public.documents
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('public.spanish_unaccent', coalesce(title, '')), 'A')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(resolution_number, '')), 'A')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(issuing_entity, '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'keywords', '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(article_reference, '')), 'C')
  ) stored;

alter table public.documents
  add column governed_metadata_search_vector tsvector generated always as (
    setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'documentTypeOther', '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'issuingEntityOther', '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'specificDependency', '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'additionalDetail', '')), 'C')
    || setweight(to_tsvector('public.spanish_unaccent', case issuing_entity
        when 'MINEDU' then 'MINEDU Ministerio de Educacion'
        when 'MTPE' then 'MTPE Ministerio de Trabajo y Promocion del Empleo'
        when 'UGEL' then 'UGEL Unidad de Gestion Educativa Local'
        when 'DRE_GRE' then 'DRE GRE Direccion Regional de Educacion Gerencia Regional de Educacion'
        when 'SERVIR' then 'SERVIR Autoridad Nacional del Servicio Civil'
        when 'SUNAFIL' then 'SUNAFIL Superintendencia Nacional de Fiscalizacion Laboral'
        when 'MEF' then 'MEF Ministerio de Economia y Finanzas'
        when 'PCM' then 'PCM Presidencia del Consejo de Ministros'
        when 'CONGRESO_REPUBLICA' then 'Congreso de la Republica'
        when 'TRIBUNAL_CONSTITUCIONAL' then 'Tribunal Constitucional'
        when 'DEFENSORIA_PUEBLO' then 'Defensoria del Pueblo'
        when 'GOBIERNO_REGIONAL' then 'Gobierno Regional'
        when 'OTRA_INSTITUCION' then 'Otra institucion'
        else ''
      end), 'C')
    || setweight(to_tsvector('public.spanish_unaccent', case document_type
        when 'RESOLUCION_MINISTERIAL' then 'Resolucion Ministerial'
        when 'RESOLUCION_VICEMINISTERIAL' then 'Resolucion Viceministerial'
        when 'RESOLUCION_DIRECTORAL' then 'Resolucion Directoral'
        when 'DECRETO_SUPREMO' then 'Decreto Supremo'
        when 'DECRETO_LEGISLATIVO' then 'Decreto Legislativo'
        when 'LEY' then 'Ley'
        when 'REGLAMENTO' then 'Reglamento'
        when 'DIRECTIVA' then 'Directiva'
        when 'NORMA_TECNICA' then 'Norma Tecnica'
        when 'OFICIO' then 'Oficio'
        when 'MEMORANDUM' then 'Memorandum'
        when 'COMUNICADO' then 'Comunicado'
        when 'CRONOGRAMA' then 'Cronograma'
        when 'ANEXO' then 'Anexo'
        when 'INFORME' then 'Informe'
        when 'INFOGRAFIA' then 'Infografia'
        when 'OTRO' then 'Otro'
        else ''
      end), 'C')
  ) stored;

create index documents_library_search_idx
  on public.documents using gin (search_vector);

create index documents_governed_metadata_search_idx
  on public.documents using gin (governed_metadata_search_vector);

-- Esqueleto alfanumérico de número, título y entidad en una sola columna: hace
-- que '100-2026', '100/2026', '100 2026' y 'DRE/GRE' encuentren igual, sin
-- depender de cómo tecleó el número el administrador ni del tokenizador.
alter table public.documents
  add column search_reference text generated always as (
    public.normalize_document_reference(
      coalesce(resolution_number, '') || ' ' ||
      coalesce(title, '') || ' ' ||
      coalesce(issuing_entity, '')
    )
  ) stored;

create index documents_search_reference_idx
  on public.documents using gin (search_reference extensions.gin_trgm_ops)
  where not is_deleted;

-- Alimenta el filtro "Administrador que lo cargó" sin exponer la tabla de
-- perfiles al navegador.
create or replace function public.list_document_uploaders()
returns table (
  id uuid,
  full_name text,
  document_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    profile.id,
    profile.full_name,
    count(document.id)::bigint
  from public.profiles as profile
  join public.documents as document
    on document.created_by = profile.id and not document.is_deleted
  group by profile.id, profile.full_name
  order by profile.full_name, profile.id;
$$;

revoke all on function public.list_document_uploaders() from public, anon, authenticated;
grant execute on function public.list_document_uploaders() to service_role;

-- La biblioteca gana: búsqueda sin acentos, búsqueda por número tolerante al
-- formato, filtros por fecha de carga y por administrador, y ordenamientos que
-- siguen el mismo criterio que el panel muestra en pantalla.
drop function if exists public.list_document_library(
  text, smallint, text, text, uuid, uuid, public.document_situation,
  text, text, integer, integer
);
drop function if exists public.list_document_library(
  text, smallint, text, text, uuid, uuid, public.document_situation,
  text, text, integer, integer, date, date, uuid
);

create function public.list_document_library(
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
    -- Una consulta compuesta solo de stopwords produce un tsquery vacío que no
    -- casa con nada. Se descarta para no vaciar el listado en silencio.
    if search_query is null or numnode(search_query) = 0 then
      search_query := null;
    end if;
    -- Con menos de tres caracteres el índice de trigramas no aporta, así que la
    -- comparación normalizada solo entra a partir de esa longitud.
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
      coalesce(associations.items, '[]'::jsonb) as module_associations,
      coalesce(associations.first_sort, 2147483647) as first_module_sort,
      coalesce(associations.first_name, '') as first_module_name
    from public.documents as document
    left join public.document_versions as version
      on version.id = document.current_version_id and version.document_id = document.id
    left join public.profiles as profile on profile.id = document.created_by
    left join lateral (
      select
        jsonb_agg(jsonb_build_object(
          'linked_module_id', linked.id,
          'linked_module_name', linked.name,
          'module_id', coalesce(parent.id, linked.id),
          'module_name', coalesce(parent.name, linked.name),
          'submodule_id', case when parent.id is null then null else linked.id end,
          'submodule_name', case when parent.id is null then null else linked.name end
        ) order by coalesce(parent.sort_order, linked.sort_order), linked.sort_order, linked.name, linked.id) as items,
        min(coalesce(parent.sort_order, linked.sort_order)) as first_sort,
        min(lower(coalesce(parent.name, linked.name))) as first_name
      from public.document_modules as relation
      join public.modules as linked on linked.id = relation.module_id and not linked.is_deleted
      left join public.modules as parent on parent.id = linked.parent_module_id and not parent.is_deleted
      where relation.document_id = document.id
    ) as associations on true
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
  )
  select
    filtered.id, filtered.title, filtered.document_type, filtered.issuing_entity,
    filtered.issuance_year, filtered.resolution_number, filtered.article_reference,
    filtered.publication_status, filtered.situation,
    filtered.replacement_document_id, filtered.replacement_date,
    filtered.replacement_year, filtered.replacement_reason,
    filtered.replacement_observation, filtered.current_version_id,
    filtered.metadata, filtered.created_at, filtered.created_by,
    filtered.created_by_name, filtered.updated_at, filtered.updated_by,
    filtered.exposed_ingestion_status, filtered.current_version_uploaded_at,
    filtered.module_associations, count(*) over ()
  from filtered
  order by
    case when p_sort = 'newest' then filtered.current_version_uploaded_at end desc nulls last,
    case when p_sort = 'oldest' then filtered.current_version_uploaded_at end asc nulls last,
    case when p_sort = 'year' then filtered.issuance_year end desc nulls last,
    case when p_sort = 'title' then lower(filtered.title) end,
    case when p_sort = 'upload_date' then filtered.created_at end desc nulls last,
    case when p_sort = 'document_type' then filtered.document_type end,
    case when p_sort = 'issuing_entity' then filtered.issuing_entity end,
    -- Situación y estado técnico se ordenan por su ciclo de vida, no por el
    -- token interno en inglés: el listado alfabético entregaba "Archivado,
    -- Vigente, Reemplazado", que al cliente le parece roto.
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
    -- El módulo se ordena por el mismo sort_order curado que la sección
    -- Módulos, no por el nombre alfabético.
    case when p_sort = 'module' then filtered.first_module_sort end,
    case when p_sort = 'module' then filtered.first_module_name end,
    -- Dentro de cada grupo, lo más reciente primero en lugar de un UUID al azar.
    filtered.current_version_uploaded_at desc nulls last,
    filtered.id
  limit p_limit offset p_offset;
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
