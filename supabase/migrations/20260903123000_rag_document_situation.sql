-- Retrieval governed by document situation. Current questions remain restricted
-- to vigente material; historical questions may consult replaced material and
-- archived material remains opt-in only. Citation history keeps the situation
-- that applied when the answer was produced.

alter table public.chat_message_sources
  add column document_situation public.document_situation;

-- Every source persisted before this migration came from the legacy retrieval
-- function, which admitted active/current documents only.
update public.chat_message_sources
set document_situation = 'current'
where document_situation is null;

alter table public.chat_message_sources
  alter column document_situation set not null;

create function private.capture_chat_source_document_situation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select document.situation
  into new.document_situation
  from public.documents as document
  where document.id = new.document_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A cited source document was not found';
  end if;

  return new;
end;
$$;

create function private.prevent_chat_source_situation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'A persisted chat source situation is immutable';
end;
$$;

create trigger chat_message_sources_capture_document_situation
before insert on public.chat_message_sources
for each row execute procedure private.capture_chat_source_document_situation();

create trigger chat_message_sources_protect_document_situation
before update of document_id, document_situation on public.chat_message_sources
for each row execute procedure private.prevent_chat_source_situation_mutation();

revoke all on function private.capture_chat_source_document_situation()
  from public, anon, authenticated;
revoke all on function private.prevent_chat_source_situation_mutation()
  from public, anon, authenticated;

-- Revalidate every citation against the approved PDF version and the complete
-- active hierarchy. A main-module citation is valid when the physical
-- association belongs to one of its direct submodules.
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
    and document.approved_version_id = chunk.document_version_id
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

revoke all on function private.validate_chat_message_source_live_evidence()
  from public, anon, authenticated;

create function public.search_document_chunks_by_situation(
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

-- Citation persistence accepts a main-module scope for documents physically
-- associated with one of its submodules. It also revalidates the approved,
-- indexed version at commit time so an unapproved or stale PDF cannot be
-- persisted as answer evidence after a concurrent lifecycle change.
create or replace function public.complete_chat_turn(
  p_user_id uuid,
  p_conversation_id uuid,
  p_user_message_id uuid,
  p_answer_role public.chat_message_role,
  p_answer text,
  p_sources jsonb default '[]'::jsonb,
  p_unanswered_reason public.unanswered_question_reason default null,
  p_top_relevance_score real default null
)
returns table (
  answer_message_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.chat_conversations%rowtype;
  normalized_answer text := btrim(coalesce(p_answer, ''));
  created_answer_message_id uuid;
  existing_answer_message_id uuid;
  source_item jsonb;
  source_id uuid;
  source_chunk_id uuid;
  source_module_id uuid;
  source_score real;
  source_rank integer := 0;
  source_document_id uuid;
  source_document_version_id uuid;
  source_document_title text;
  source_version_number integer;
  source_page_start integer;
  source_page_end integer;
  source_section_title text;
  source_article_reference text;
  source_numeral_reference text;
  source_module_name text;
begin
  if p_answer_role is null
    or p_answer_role not in ('assistant', 'clarification', 'no_evidence') then
    raise exception using
      errcode = '22023',
      message = 'Only assistant, clarification or no-evidence replies may complete a chat turn';
  end if;

  if char_length(normalized_answer) not between 1 and 20_000 then
    raise exception using
      errcode = '22023',
      message = 'A chat answer must contain between 1 and 20000 characters';
  end if;

  if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    raise exception using errcode = '22023', message = 'Chat sources must be an array';
  end if;

  if p_top_relevance_score is not null
    and p_top_relevance_score not between 0 and 1 then
    raise exception using
      errcode = '22023',
      message = 'The top relevance score must be between zero and one';
  end if;

  if p_answer_role = 'assistant' then
    if jsonb_array_length(p_sources) not between 1 and 10
      or p_unanswered_reason is not null then
      raise exception using
        errcode = '22023',
        message = 'An assistant answer requires one to ten sources and no unanswered reason';
    end if;
  elsif p_answer_role = 'clarification' then
    if jsonb_array_length(p_sources) not between 1 and 10
      or p_unanswered_reason is distinct from 'ambiguous_request' then
      raise exception using
        errcode = '22023',
        message = 'A clarification requires one to ten sources and an ambiguous-request reason';
    end if;
  elsif jsonb_array_length(p_sources) <> 0
    or p_unanswered_reason is distinct from 'insufficient_evidence' then
    raise exception using
      errcode = '22023',
      message = 'A no-evidence reply requires no sources and an insufficient-evidence reason';
  end if;

  if p_answer_role in ('assistant', 'clarification') and exists (
    select 1
    from (
      select source.value ->> 'chunkId' as chunk_id
      from jsonb_array_elements(p_sources) as source(value)
    ) as supplied
    group by supplied.chunk_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'A chat reply cannot cite the same chunk more than once';
  end if;

  if p_answer_role in ('assistant', 'clarification') and exists (
    select 1
    from (
      select source.value ->> 'sourceId' as source_id
      from jsonb_array_elements(p_sources) as source(value)
      where nullif(source.value ->> 'sourceId', '') is not null
    ) as supplied
    group by supplied.source_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'A chat reply cannot reuse a citation identifier';
  end if;

  select * into target_conversation
  from public.chat_conversations
  where id = p_conversation_id
    and user_id = p_user_id
    and not is_deleted
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat conversation was not found';
  end if;

  perform 1
  from public.chat_messages
  where id = p_user_message_id
    and conversation_id = target_conversation.id
    and role = 'user';

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat user message was not found';
  end if;

  select message.id into existing_answer_message_id
  from public.chat_messages as message
  where message.in_reply_to_message_id = p_user_message_id;

  if found then
    return query select existing_answer_message_id;
    return;
  end if;

  insert into public.chat_messages (
    conversation_id,
    role,
    content,
    in_reply_to_message_id
  )
  values (
    target_conversation.id,
    p_answer_role,
    normalized_answer,
    p_user_message_id
  )
  returning id into created_answer_message_id;

  if p_answer_role in ('assistant', 'clarification') then
    for source_item in
      select value
      from jsonb_array_elements(p_sources) as source(value)
    loop
      source_rank := source_rank + 1;
      source_id := coalesce(
        nullif(source_item ->> 'sourceId', '')::uuid,
        gen_random_uuid()
      );
      source_chunk_id := (source_item ->> 'chunkId')::uuid;
      source_module_id := nullif(source_item ->> 'moduleId', '')::uuid;
      source_score := (source_item ->> 'relevanceScore')::real;

      if source_id is null or source_chunk_id is null or source_score is null
        or source_score not between 0 and 1 then
        raise exception using errcode = '22023', message = 'A chat source is invalid';
      end if;

      select
        chunk.document_id,
        chunk.document_version_id,
        document.title,
        version.version_number,
        chunk.page_start,
        chunk.page_end,
        chunk.section_title,
        chunk.article_reference,
        chunk.numeral_reference
      into
        source_document_id,
        source_document_version_id,
        source_document_title,
        source_version_number,
        source_page_start,
        source_page_end,
        source_section_title,
        source_article_reference,
        source_numeral_reference
      from public.document_chunks as chunk
      join public.documents as document
        on document.id = chunk.document_id
        and not document.is_deleted
        and document.approved_version_id = chunk.document_version_id
      join public.document_versions as version
        on version.id = chunk.document_version_id
        and version.document_id = chunk.document_id
        and version.ingestion_status = 'indexed'
      where chunk.id = source_chunk_id;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'A cited document chunk was not found';
      end if;

      if target_conversation.selected_module_id is not null
        and not exists (
          select 1
          from public.document_modules as document_module
          join public.modules as linked_module
            on linked_module.id = document_module.module_id
          left join public.modules as parent_module
            on parent_module.id = linked_module.parent_module_id
          where document_module.document_id = source_document_id
            and (
              linked_module.id = target_conversation.selected_module_id
              or linked_module.parent_module_id = target_conversation.selected_module_id
            )
            and linked_module.is_active
            and not linked_module.is_deleted
            and (
              parent_module.id is null
              or (parent_module.is_active and not parent_module.is_deleted)
            )
        ) then
        raise exception using
          errcode = '23503',
          message = 'A cited source is no longer eligible as active evidence';
      end if;

      source_module_name := null;
      if source_module_id is not null then
        select cited_module.name into source_module_name
        from public.modules as cited_module
        where cited_module.id = source_module_id
          and cited_module.is_active
          and not cited_module.is_deleted
          and exists (
            select 1
            from public.document_modules as document_module
            join public.modules as linked_module
              on linked_module.id = document_module.module_id
            left join public.modules as parent_module
              on parent_module.id = linked_module.parent_module_id
            where document_module.document_id = source_document_id
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
          raise exception using errcode = '23503', message = 'A cited source module is invalid';
        end if;
      end if;

      insert into public.chat_message_sources (
        id,
        message_id,
        chunk_id,
        document_id,
        document_version_id,
        module_id,
        document_title,
        module_name,
        version_number,
        page_start,
        page_end,
        section_title,
        article_reference,
        numeral_reference,
        relevance_score,
        source_rank
      )
      values (
        source_id,
        created_answer_message_id,
        source_chunk_id,
        source_document_id,
        source_document_version_id,
        source_module_id,
        source_document_title,
        source_module_name,
        source_version_number,
        source_page_start,
        source_page_end,
        source_section_title,
        source_article_reference,
        source_numeral_reference,
        source_score,
        source_rank
      );
    end loop;
  end if;

  if p_answer_role <> 'assistant' then
    insert into public.unanswered_questions (
      user_id,
      conversation_id,
      message_id,
      selected_module_id,
      question,
      reason,
      top_relevance_score
    )
    select
      p_user_id,
      target_conversation.id,
      p_user_message_id,
      target_conversation.selected_module_id,
      message.content,
      p_unanswered_reason,
      p_top_relevance_score
    from public.chat_messages as message
    where message.id = p_user_message_id;
  end if;

  update public.chat_conversations
  set updated_at = now()
  where id = target_conversation.id;

  return query select created_answer_message_id;
end;
$$;

revoke all on function public.complete_chat_turn(
  uuid, uuid, uuid, public.chat_message_role, text, jsonb,
  public.unanswered_question_reason, real
) from public, anon, authenticated;
grant execute on function public.complete_chat_turn(
  uuid, uuid, uuid, public.chat_message_role, text, jsonb,
  public.unanswered_question_reason, real
) to service_role;

create or replace function public.get_chat_conversation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.chat_conversations%rowtype;
  result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Message limit must be between 1 and 100';
  end if;

  select * into target_conversation
  from public.chat_conversations
  where id = p_conversation_id
    and user_id = p_user_id
    and not is_deleted;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat conversation was not found';
  end if;

  with recent_messages as (
    select *
    from public.chat_messages
    where conversation_id = target_conversation.id
    order by created_at desc, id desc
    limit p_limit
  ), ordered_messages as (
    select * from recent_messages order by created_at, id
  )
  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', target_conversation.id,
      'selectedModuleId', target_conversation.selected_module_id,
      'title', target_conversation.title,
      'createdAt', target_conversation.created_at,
      'updatedAt', target_conversation.updated_at
    ),
    'messages', coalesce(jsonb_agg(jsonb_build_object(
      'id', message.id,
      'inReplyToMessageId', message.in_reply_to_message_id,
      'role', message.role,
      'content', message.content,
      'createdAt', message.created_at,
      'sources', coalesce(sources.items, '[]'::jsonb)
    ) order by message.created_at, message.id), '[]'::jsonb)
  ) into result
  from ordered_messages as message
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', source.id,
      'rank', source.source_rank,
      'documentTitle', source.document_title,
      'documentSituation', source.document_situation,
      'moduleName', source.module_name,
      'versionNumber', source.version_number,
      'pageStart', source.page_start,
      'pageEnd', source.page_end,
      'sectionTitle', source.section_title,
      'articleReference', source.article_reference,
      'numeralReference', source.numeral_reference,
      'relevanceScore', source.relevance_score
    ) order by source.source_rank) as items
    from public.chat_message_sources as source
    where source.message_id = message.id
  ) as sources on true;

  return result;
end;
$$;

revoke all on function public.get_chat_conversation(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_chat_conversation(uuid, uuid, integer)
  to service_role;
