-- Una norma nombrada por número no puede ser sustituida por un documento
-- semánticamente parecido. El filtro ocurre antes del ranking vectorial y
-- conserva exactamente las reglas vigentes de aprobación, situación y módulo.

create or replace function private.search_document_chunks_filtered(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_selected_module_id uuid default null,
  p_match_threshold real default 0.70,
  p_match_count integer default 5,
  p_retrieval_scope text default 'current',
  p_exact_reference_keys text[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_situation public.document_situation,
  version_number integer,
  page_start integer,
  page_end integer,
  section_title text,
  article_reference text,
  numeral_reference text,
  chunk_content text,
  semantic_score real,
  lexical_score real,
  module_ids uuid[],
  module_names text[]
)
language plpgsql
set search_path = ''
as $$
begin
  if p_query_embedding is null
    or p_query_text is null
    or char_length(btrim(p_query_text)) not between 1 and 8_000
    or p_match_threshold is null
    or p_match_threshold not between 0 and 1
    or p_match_count is null
    or p_match_count not between 1 and 10
    or p_retrieval_scope is null
    or p_retrieval_scope not in ('current', 'historical', 'archived_explicit')
    or (
      p_exact_reference_keys is not null
      and (
        cardinality(p_exact_reference_keys) not between 1 and 5
        or exists (
          select 1
          from pg_catalog.unnest(p_exact_reference_keys) as requested(reference_key)
          where requested.reference_key is null
            or requested.reference_key !~ '^[A-Z]{2,10}:[A-Z0-9]{4,64}$'
            or pg_catalog.split_part(requested.reference_key, ':', 1) not in (
              'DL', 'DS', 'DIRECTIVA', 'LEY', 'RD', 'RM', 'RSG', 'RVM'
            )
        )
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid document search parameters';
  end if;

  perform pg_catalog.set_config(
    'hnsw.ef_search',
    greatest(40, least(200, p_match_count * 20))::text,
    true
  );
  perform pg_catalog.set_config('hnsw.iterative_scan', 'strict_order', true);

  return query
  with nearest as materialized (
    select
      chunk.id as matched_chunk_id,
      chunk.document_id as matched_document_id,
      chunk.document_version_id as matched_document_version_id,
      document.title as matched_document_title,
      document.situation as matched_document_situation,
      version.version_number as matched_version_number,
      chunk.page_start as matched_page_start,
      chunk.page_end as matched_page_end,
      chunk.section_title as matched_section_title,
      chunk.article_reference as matched_article_reference,
      chunk.numeral_reference as matched_numeral_reference,
      chunk.chunk_content as matched_chunk_content,
      chunk.embedding operator(extensions.<=>) p_query_embedding as matched_distance,
      pg_catalog.ts_rank_cd(
        chunk.content_tsv,
        pg_catalog.websearch_to_tsquery('spanish', p_query_text)
      )::real as matched_lexical_score
    from public.document_chunks as chunk
    join public.documents as document on document.id = chunk.document_id
    join public.document_versions as version
      on version.id = chunk.document_version_id
      and version.document_id = chunk.document_id
    where not document.is_deleted
      and not (document.metadata ? 'demoSeed')
      and private.document_version_is_approved_evidence(
        document.id,
        chunk.document_version_id
      )
      and version.ingestion_status::text = 'indexed'
      and (
        p_exact_reference_keys is null
        or exists (
          select 1
          from pg_catalog.unnest(p_exact_reference_keys) as requested(reference_key)
          where document.document_type = case pg_catalog.split_part(
            requested.reference_key,
            ':',
            1
          )
              when 'DL' then 'DECRETO_LEGISLATIVO'
              when 'DS' then 'DECRETO_SUPREMO'
              when 'DIRECTIVA' then 'DIRECTIVA'
              when 'LEY' then 'LEY'
              when 'RD' then 'RESOLUCION_DIRECTORAL'
              when 'RM' then 'RESOLUCION_MINISTERIAL'
              when 'RSG' then 'OTRO'
              when 'RVM' then 'RESOLUCION_VICEMINISTERIAL'
            end
            and (
              pg_catalog.split_part(requested.reference_key, ':', 1) <> 'RSG'
              or pg_catalog.regexp_replace(
                pg_catalog.upper(
                  coalesce(document.resolution_number, '')
                  || ' '
                  || document.title
                ),
                '[^A-Z0-9]',
                '',
                'g'
              ) like '%RSG%'
              or pg_catalog.regexp_replace(
                pg_catalog.upper(document.title),
                '[^A-Z0-9]',
                '',
                'g'
              ) like '%RESOLUCIONDESECRETARIAGENERAL%'
            )
            and nullif(pg_catalog.btrim(document.resolution_number), '') is not null
            and pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                pg_catalog.upper(document.resolution_number),
                '[^A-Z0-9]',
                '',
                'g'
              ),
              '^((DECRETOLEGISLATIVO|DECRETOSUPREMO|DIRECTIVA|RESOLUCIONDESECRETARIAGENERAL|RESOLUCIONVICEMINISTERIAL|RESOLUCIONMINISTERIAL|RESOLUCIONDIRECTORAL|RSG|RVM|RM|RD|DS|DL|LEY))?(N(RO|UMERO)?)?',
              '',
              'g'
            ) = pg_catalog.split_part(
              requested.reference_key,
              ':',
              2
            )
        )
      )
      and (
        (
          p_retrieval_scope = 'current'
          and document.situation = 'current'
          and document.publication_status = 'active'
        )
        or (
          p_retrieval_scope = 'historical'
          and (
            (document.situation = 'current' and document.publication_status = 'active')
            or (document.situation = 'replaced' and document.publication_status = 'inactive')
          )
        )
        or (
          p_retrieval_scope = 'archived_explicit'
          and (
            (document.situation = 'current' and document.publication_status = 'active')
            or (
              document.situation in ('replaced', 'archived')
              and document.publication_status = 'inactive'
            )
          )
        )
      )
      and exists (
        select 1
        from public.document_modules as document_module
        join public.modules as module on module.id = document_module.module_id
        left join public.modules as parent on parent.id = module.parent_module_id
        where document_module.document_id = chunk.document_id
          and module.is_active
          and not module.is_deleted
          and (parent.id is null or (parent.is_active and not parent.is_deleted))
      )
      and (
        p_selected_module_id is null
        or exists (
          select 1
          from public.document_modules as selected_document_module
          join public.modules as selected_module
            on selected_module.id = selected_document_module.module_id
          left join public.modules as selected_parent
            on selected_parent.id = selected_module.parent_module_id
          where selected_document_module.document_id = chunk.document_id
            and (
              selected_document_module.module_id = p_selected_module_id
              or selected_module.parent_module_id = p_selected_module_id
            )
            and selected_module.is_active
            and not selected_module.is_deleted
            and (
              selected_parent.id is null
              or (selected_parent.is_active and not selected_parent.is_deleted)
            )
        )
      )
    order by chunk.embedding operator(extensions.<=>) p_query_embedding
    -- La búsqueda semántica conserva su límite de candidatos. En la ruta
    -- exacta se inspeccionan todos los fragmentos de los pocos documentos ya
    -- filtrados, para que un documento largo no desplace a otra norma pedida.
    limit case
      when p_exact_reference_keys is null then least(80, p_match_count * 8)
      else null
    end
  ), ranked as (
    select
      nearest.*,
      (1 - nearest.matched_distance)::real as matched_semantic_score,
      row_number() over (
        partition by nearest.matched_document_situation
        order by nearest.matched_distance,
          nearest.matched_lexical_score desc,
          nearest.matched_chunk_id
      ) as situation_rank,
      row_number() over (
        partition by nearest.matched_document_id
        order by nearest.matched_distance,
          nearest.matched_lexical_score desc,
          nearest.matched_chunk_id
      ) as document_rank
    from nearest
    where p_exact_reference_keys is not null
      or nearest.matched_distance <= 1 - p_match_threshold
  ), prioritized as (
    select
      ranked.*,
      case
        when p_retrieval_scope = 'historical'
          and ranked.matched_document_situation = 'current' then 0
        when p_retrieval_scope = 'historical' then 1
        when p_retrieval_scope = 'archived_explicit'
          and ranked.matched_document_situation = 'archived' then 0
        when p_retrieval_scope = 'archived_explicit'
          and ranked.matched_document_situation = 'current' then 1
        when p_retrieval_scope = 'archived_explicit' then 2
        else 0
      end as situation_priority
    from ranked
  )
  select
    prioritized.matched_chunk_id,
    prioritized.matched_document_id,
    prioritized.matched_document_version_id,
    prioritized.matched_document_title,
    prioritized.matched_document_situation,
    prioritized.matched_version_number,
    prioritized.matched_page_start,
    prioritized.matched_page_end,
    prioritized.matched_section_title,
    prioritized.matched_article_reference,
    prioritized.matched_numeral_reference,
    prioritized.matched_chunk_content,
    prioritized.matched_semantic_score,
    prioritized.matched_lexical_score,
    coalesce(module_data.module_ids, array[]::uuid[]),
    coalesce(module_data.module_names, array[]::text[])
  from prioritized
  cross join lateral (
    select
      array_agg(scope.module_id order by scope.module_name, scope.module_id) as module_ids,
      array_agg(scope.module_name order by scope.module_name, scope.module_id) as module_names
    from (
      select distinct
        coalesce(parent.id, module.id) as module_id,
        coalesce(parent.name, module.name) as module_name
      from public.document_modules as document_module
      join public.modules as module on module.id = document_module.module_id
      left join public.modules as parent on parent.id = module.parent_module_id
      where document_module.document_id = prioritized.matched_document_id
        and module.is_active
        and not module.is_deleted
        and (parent.id is null or (parent.is_active and not parent.is_deleted))
    ) as scope
  ) as module_data
  order by case
      when p_exact_reference_keys is not null then prioritized.document_rank
      else 1
    end,
    prioritized.situation_rank,
    prioritized.situation_priority,
    prioritized.matched_distance,
    prioritized.matched_lexical_score desc,
    prioritized.matched_chunk_id
  limit p_match_count;
end;
$$;

revoke all on function private.search_document_chunks_filtered(
  extensions.vector, text, uuid, real, integer, text, text[]
) from public, anon, authenticated;

-- Conserva el contrato de la búsqueda general y centraliza sus reglas en el
-- helper filtrable. Sus permisos existentes se mantienen con CREATE OR REPLACE.
create or replace function public.search_document_chunks_by_situation(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_selected_module_id uuid default null,
  p_match_threshold real default 0.70,
  p_match_count integer default 5,
  p_retrieval_scope text default 'current'
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_situation public.document_situation,
  version_number integer,
  page_start integer,
  page_end integer,
  section_title text,
  article_reference text,
  numeral_reference text,
  chunk_content text,
  semantic_score real,
  lexical_score real,
  module_ids uuid[],
  module_names text[]
)
language sql
security definer
set search_path = ''
as $$
  select *
  from private.search_document_chunks_filtered(
    p_query_embedding,
    p_query_text,
    p_selected_module_id,
    p_match_threshold,
    p_match_count,
    p_retrieval_scope,
    null
  );
$$;

create or replace function public.search_document_chunks_by_exact_references(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_reference_keys text[],
  p_match_count integer default 5,
  p_retrieval_scope text default 'current'
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_type text,
  resolution_number text,
  issuance_year smallint,
  document_situation public.document_situation,
  version_number integer,
  mime_type text,
  pdf_page_count integer,
  page_start integer,
  page_end integer,
  section_title text,
  article_reference text,
  numeral_reference text,
  chunk_content text,
  semantic_score real,
  lexical_score real,
  module_ids uuid[],
  module_names text[],
  module_associations jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    result.chunk_id,
    result.document_id,
    result.document_version_id,
    result.document_title,
    cited_document.document_type,
    cited_document.resolution_number,
    cited_document.issuance_year,
    result.document_situation,
    result.version_number,
    cited_version.mime_type,
    cited_version.page_count,
    result.page_start,
    result.page_end,
    result.section_title,
    result.article_reference,
    result.numeral_reference,
    result.chunk_content,
    result.semantic_score,
    result.lexical_score,
    result.module_ids,
    result.module_names,
    coalesce(associations.items, '[]'::jsonb) as module_associations
  from private.search_document_chunks_filtered(
    p_query_embedding,
    p_query_text,
    null,
    0,
    p_match_count,
    p_retrieval_scope,
    p_reference_keys
  ) as result
  join public.documents as cited_document
    on cited_document.id = result.document_id
  join public.document_versions as cited_version
    on cited_version.id = result.document_version_id
    and cited_version.document_id = result.document_id
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'rootModuleId', coalesce(parent.id, module.id),
        'rootModuleName', coalesce(parent.name, module.name),
        'submoduleId', case when parent.id is null then null else module.id end,
        'submoduleName', case when parent.id is null then null else module.name end
      )
      order by coalesce(parent.name, module.name), module.name, module.id
    ) as items
    from (
      select distinct module.id, module.name, module.parent_module_id
      from public.document_modules as document_module
      join public.modules as module on module.id = document_module.module_id
      where document_module.document_id = result.document_id
        and module.is_active
        and not module.is_deleted
    ) as module
    left join public.modules as parent on parent.id = module.parent_module_id
  ) as associations;
$$;

revoke all on function public.search_document_chunks_by_exact_references(
  extensions.vector, text, text[], integer, text
) from public, anon, authenticated;
grant execute on function public.search_document_chunks_by_exact_references(
  extensions.vector, text, text[], integer, text
) to service_role;

comment on function public.search_document_chunks_by_exact_references(
  extensions.vector, text, text[], integer, text
) is 'Returns only approved evidence whose registered number or title matches a requested exact-reference candidate; the caller verifies complete coverage and never substitutes a semantically similar document.';
