-- A demo library can be visible to administrators without becoming evidence for
-- live teacher answers.  Every document carrying the stable demo seed marker is
-- excluded; ordinary documents keep their current retrieval behaviour.
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
language plpgsql
security definer
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
    or p_retrieval_scope not in ('current', 'historical', 'archived_explicit') then
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
      -- The last approved version remains available while a newer PDF is
      -- processing or awaiting approval. No unapproved version can be cited.
      and document.approved_version_id = chunk.document_version_id
      and version.ingestion_status::text = 'indexed'
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
            or (document.situation in ('replaced', 'archived') and document.publication_status = 'inactive')
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
          and (
            parent.id is null
            or (parent.is_active and not parent.is_deleted)
          )
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
    limit least(80, p_match_count * 8)
  ), ranked as (
    select
      nearest.*,
      (1 - nearest.matched_distance)::real as matched_semantic_score,
      row_number() over (
        partition by nearest.matched_document_situation
        order by nearest.matched_distance, nearest.matched_lexical_score desc,
          nearest.matched_chunk_id
      ) as situation_rank
    from nearest
    where nearest.matched_distance <= 1 - p_match_threshold
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
        and (
          parent.id is null
          or (parent.is_active and not parent.is_deleted)
        )
    ) as scope
  ) as module_data
  order by prioritized.situation_rank, prioritized.situation_priority,
    prioritized.matched_distance, prioritized.matched_lexical_score desc,
    prioritized.matched_chunk_id
  limit p_match_count;
end;
$$;

revoke all on function public.search_document_chunks_by_situation(
  extensions.vector, text, uuid, real, integer, text
) from public, anon, authenticated;
grant execute on function public.search_document_chunks_by_situation(
  extensions.vector, text, uuid, real, integer, text
) to service_role;

-- Keep the retired-but-still-callable current-situation RPC subject to the
-- same guard.  This prevents a future service-role caller from bypassing the
-- contextual search path accidentally.
create or replace function public.search_document_chunks(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_selected_module_id uuid default null,
  p_match_threshold real default 0.70,
  p_match_count integer default 5
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
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
security definer
set search_path = pg_catalog
as $$
begin
  if char_length(btrim(p_query_text)) not between 1 and 8_000
    or p_match_threshold not between 0 and 1
    or p_match_count not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Invalid document search parameters';
  end if;

  perform set_config(
    'hnsw.ef_search',
    greatest(40, least(200, p_match_count * 20))::text,
    true
  );
  perform set_config('hnsw.iterative_scan', 'strict_order', true);

  return query
  with nearest as materialized (
    select
      chunk.id as matched_chunk_id,
      chunk.document_id as matched_document_id,
      chunk.document_version_id as matched_document_version_id,
      document.title as matched_document_title,
      version.version_number as matched_version_number,
      chunk.page_start as matched_page_start,
      chunk.page_end as matched_page_end,
      chunk.section_title as matched_section_title,
      chunk.article_reference as matched_article_reference,
      chunk.numeral_reference as matched_numeral_reference,
      chunk.chunk_content as matched_chunk_content,
      chunk.embedding OPERATOR(extensions.<=>) p_query_embedding as matched_distance,
      ts_rank_cd(
        chunk.content_tsv,
        websearch_to_tsquery('spanish', p_query_text)
      )::real as matched_lexical_score
    from public.document_chunks as chunk
    join public.documents as document on document.id = chunk.document_id
    join public.document_versions as version
      on version.id = chunk.document_version_id
      and version.document_id = chunk.document_id
    where document.publication_status = 'active'
      and not document.is_deleted
      and not (document.metadata ? 'demoSeed')
      and document.current_version_id = chunk.document_version_id
      and version.ingestion_status::text = 'indexed'
      and exists (
        select 1
        from public.document_modules as document_module
        join public.modules as module on module.id = document_module.module_id
        where document_module.document_id = chunk.document_id
          and module.is_active
          and not module.is_deleted
      )
      and (
        p_selected_module_id is null
        or exists (
          select 1
          from public.document_modules as selected_document_module
          join public.modules as selected_module
            on selected_module.id = selected_document_module.module_id
          where selected_document_module.document_id = chunk.document_id
            and selected_document_module.module_id = p_selected_module_id
            and selected_module.is_active
            and not selected_module.is_deleted
        )
      )
    order by chunk.embedding OPERATOR(extensions.<=>) p_query_embedding
    limit p_match_count
  ), ranked as (
    select
      nearest.*,
      (1 - nearest.matched_distance)::real as matched_semantic_score
    from nearest
    where nearest.matched_distance <= 1 - p_match_threshold
  )
  select
    ranked.matched_chunk_id,
    ranked.matched_document_id,
    ranked.matched_document_version_id,
    ranked.matched_document_title,
    ranked.matched_version_number,
    ranked.matched_page_start,
    ranked.matched_page_end,
    ranked.matched_section_title,
    ranked.matched_article_reference,
    ranked.matched_numeral_reference,
    ranked.matched_chunk_content,
    ranked.matched_semantic_score,
    ranked.matched_lexical_score,
    coalesce(module_data.module_ids, array[]::uuid[]),
    coalesce(module_data.module_names, array[]::text[])
  from ranked
  cross join lateral (
    select
      array_agg(module.id order by module.name, module.id) as module_ids,
      array_agg(module.name order by module.name, module.id) as module_names
    from public.document_modules as document_module
    join public.modules as module on module.id = document_module.module_id
    where document_module.document_id = ranked.matched_document_id
      and module.is_active
      and not module.is_deleted
  ) as module_data
  order by ranked.matched_distance, ranked.matched_lexical_score desc, ranked.matched_chunk_id;
end;
$$;

revoke all on function public.search_document_chunks(
  extensions.vector, text, uuid, real, integer
) from public, anon, authenticated;
grant execute on function public.search_document_chunks(
  extensions.vector, text, uuid, real, integer
) to service_role;
