-- Una versión aprobada complementa las anteriores hasta el último reemplazo.
-- La RPC de carga impide saltar una aprobación, así que toda la cadena anterior
-- a la versión aprobada ya pasó por revisión.
create function private.document_version_is_approved_evidence(
  p_document_id uuid,
  p_version_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents as document
    join public.document_versions as approved
      on approved.id = document.approved_version_id
      and approved.document_id = document.id
    join public.document_versions as candidate
      on candidate.id = p_version_id
      and candidate.document_id = document.id
    where document.id = p_document_id
      and candidate.version_number <= approved.version_number
      and not exists (
        select 1 from public.document_versions as newer
        where newer.document_id = document.id
          and newer.version_number > candidate.version_number
          and newer.version_number <= approved.version_number
          and newer.version_relation is distinct from 'complements'
      )
  );
$$;

revoke all on function private.document_version_is_approved_evidence(uuid, uuid)
  from public, anon, authenticated;

create or replace function public.add_governed_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_file_size_bytes bigint,
  p_page_count integer,
  p_sha256 text,
  p_actor_id uuid,
  p_processing_error text default null,
  p_issuance_year smallint default null,
  p_version_relation text default null
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  next_version_number integer;
begin
  if p_version_relation is not null
    and p_version_relation not in ('replaces', 'complements') then
    raise exception using
      errcode = '22023',
      message = 'The version relation is invalid';
  end if;

  select * into target_document from public.documents
  where id = p_document_id and not is_deleted for update;
  if not found then raise exception using errcode = 'P0002', message = 'Document was not found'; end if;
  if target_document.approval_status <> 'ready' then
    raise exception using errcode = '22023', message = 'Approve the current version before adding another';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version_number
  from public.document_versions where document_id = p_document_id;

  insert into public.document_versions (
    id, document_id, version_number, storage_path, original_file_name,
    mime_type, file_size_bytes, page_count, sha256, uploaded_by,
    issuance_year, version_relation
  ) values (
    p_version_id, p_document_id, next_version_number, p_storage_path,
    p_original_file_name,
    case
      when lower(p_original_file_name) like '%.docx' then
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      when lower(p_original_file_name) like '%.doc' then 'application/msword'
      when lower(p_original_file_name) like '%.md'
        or lower(p_original_file_name) like '%.markdown' then 'text/markdown'
      else 'application/pdf'
    end,
    p_file_size_bytes, p_page_count,
    p_sha256, p_actor_id,
    p_issuance_year, p_version_relation
  );

  update public.documents
  set current_version_id = p_version_id, approval_status = 'pending_approval',
    approval_updated_at = now(), approval_updated_by = p_actor_id,
    updated_by = p_actor_id
  where id = p_document_id returning * into target_document;

  if p_processing_error is not null then
    perform private.set_document_ingestion_status(p_version_id, 'failed');
    update public.document_ingestion_jobs
    set status = 'failed', last_error_code = 'UNREADABLE_PDF',
      last_error_message = left(p_processing_error, 1000), completed_at = now(), updated_at = now()
    where document_version_id = p_version_id;
  end if;

  insert into public.document_audit_events (
    document_id, document_version_id, action, details, actor_id
  ) values (
    p_document_id, p_version_id, 'version_added',
    jsonb_strip_nulls(jsonb_build_object(
      'versionNumber', next_version_number,
      'technicalStatus', case when p_processing_error is null then 'pending_approval' else 'error' end,
      'processingError', p_processing_error,
      'issuanceYear', p_issuance_year,
      'versionRelation', p_version_relation
    )), p_actor_id
  );
  return target_document;
end;
$$;

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
      and private.document_version_is_approved_evidence(document.id, chunk.document_version_id)
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
      and private.document_version_is_approved_evidence(document.id, chunk.document_version_id)
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

create or replace function private.validate_chat_message_source_live_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  canonical_document_title text;
  canonical_version_number integer;
  canonical_page_start integer;
  canonical_page_end integer;
  canonical_section_title text;
  canonical_article_reference text;
  canonical_numeral_reference text;
  canonical_module_name text;
begin
  select
    document.title,
    version.version_number,
    chunk.page_start,
    chunk.page_end,
    chunk.section_title,
    chunk.article_reference,
    chunk.numeral_reference
  into
    canonical_document_title,
    canonical_version_number,
    canonical_page_start,
    canonical_page_end,
    canonical_section_title,
    canonical_article_reference,
    canonical_numeral_reference
  from public.document_chunks as chunk
  join public.documents as document
    on document.id = chunk.document_id
  join public.document_versions as version
    on version.id = chunk.document_version_id
    and version.document_id = chunk.document_id
  where chunk.id = new.chunk_id
    and chunk.document_id = new.document_id
    and chunk.document_version_id = new.document_version_id
    and not document.is_deleted
    and not (document.metadata ? 'demoSeed')
    and private.document_version_is_approved_evidence(document.id, chunk.document_version_id)
    and version.ingestion_status = 'indexed'
    and (
      (document.situation = 'current' and document.publication_status = 'active')
      or (
        document.situation in ('replaced', 'archived')
        and document.publication_status = 'inactive'
      )
    )
    and exists (
      select 1
      from public.document_modules as document_module
      join public.modules as linked_module
        on linked_module.id = document_module.module_id
      left join public.modules as parent_module
        on parent_module.id = linked_module.parent_module_id
      where document_module.document_id = document.id
        and linked_module.is_active
        and not linked_module.is_deleted
        and (
          parent_module.id is null
          or (parent_module.is_active and not parent_module.is_deleted)
        )
    );

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A cited source is no longer eligible as active evidence';
  end if;

  canonical_module_name := null;
  if new.module_id is not null then
    select cited_module.name into canonical_module_name
    from public.modules as cited_module
    where cited_module.id = new.module_id
      and cited_module.is_active
      and not cited_module.is_deleted
      and exists (
        select 1
        from public.document_modules as document_module
        join public.modules as linked_module
          on linked_module.id = document_module.module_id
        left join public.modules as parent_module
          on parent_module.id = linked_module.parent_module_id
        where document_module.document_id = new.document_id
          and (
            linked_module.id = cited_module.id
            or linked_module.parent_module_id = cited_module.id
          )
          and linked_module.is_active
          and not linked_module.is_deleted
          and (
            parent_module.id is null
            or (parent_module.is_active and not parent_module.is_deleted)
          )
      );

    if not found then
      raise exception using
        errcode = '23503',
        message = 'A cited source module is no longer eligible as active evidence';
    end if;
  end if;

  new.document_title := canonical_document_title;
  new.module_name := canonical_module_name;
  new.version_number := canonical_version_number;
  new.page_start := canonical_page_start;
  new.page_end := canonical_page_end;
  new.section_title := canonical_section_title;
  new.article_reference := canonical_article_reference;
  new.numeral_reference := canonical_numeral_reference;
  return new;
end;
$$;
