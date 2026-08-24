-- DBA hardening pass: this migration is intentionally additive and remains
-- local until a separately approved, clean Hito 3 release is prepared.

-- A completed chat reply is an immutable outcome of exactly one user message.
-- The link prevents retries after a lost SSE completion from duplicating an
-- answer, its source snapshots or an unanswered-question record.
alter table public.chat_messages
  add column in_reply_to_message_id uuid
  references public.chat_messages (id) on delete restrict;

create unique index chat_messages_one_reply_per_question_idx
  on public.chat_messages (in_reply_to_message_id)
  where in_reply_to_message_id is not null;

create index chat_messages_conversation_created_id_idx
  on public.chat_messages (conversation_id, created_at, id);

drop index public.chat_messages_conversation_created_idx;

create index documents_live_list_order_idx
  on public.documents (updated_at desc, title, id)
  where not is_deleted;

create index unanswered_questions_pending_review_idx
  on public.unanswered_questions (created_at desc, id)
  where reviewed_at is null;

create function private.validate_chat_message_reply_link()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_message public.chat_messages%rowtype;
begin
  if new.role = 'user' then
    if new.in_reply_to_message_id is not null then
      raise exception 'A user message cannot reply to another message';
    end if;

    return new;
  end if;

  if new.in_reply_to_message_id is null then
    raise exception 'A non-user message must reply to a user message';
  end if;

  select * into parent_message
  from public.chat_messages
  where id = new.in_reply_to_message_id;

  if not found
    or parent_message.role <> 'user'
    or parent_message.conversation_id <> new.conversation_id then
    raise exception 'A chat reply must reference a user message in the same conversation';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_chat_message_reply_link() from public;

create trigger chat_messages_validate_reply_link
before insert or update of role, conversation_id, in_reply_to_message_id
on public.chat_messages
for each row execute procedure private.validate_chat_message_reply_link();

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
  if p_answer_role not in ('assistant', 'clarification', 'no_evidence') then
    raise exception using
      errcode = '22023',
      message = 'Only assistant, clarification or no-evidence replies may complete a chat turn';
  end if;

  if char_length(normalized_answer) not between 1 and 20_000 then
    raise exception using
      errcode = '22023',
      message = 'A chat answer must contain between 1 and 20000 characters';
  end if;

  if jsonb_typeof(p_sources) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'Chat sources must be an array';
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
  elsif jsonb_array_length(p_sources) <> 0
    or p_unanswered_reason is null
    or (p_answer_role = 'clarification'
      and p_unanswered_reason <> 'ambiguous_request')
    or (p_answer_role = 'no_evidence'
      and p_unanswered_reason <> 'insufficient_evidence') then
    raise exception using
      errcode = '22023',
      message = 'Non-answer replies require their matching unanswered reason and no sources';
  end if;

  if p_answer_role = 'assistant' and exists (
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
      message = 'A chat answer cannot cite the same chunk more than once';
  end if;

  select * into target_conversation
  from public.chat_conversations
  where id = p_conversation_id
    and user_id = p_user_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Chat conversation was not found';
  end if;

  perform 1
  from public.chat_messages
  where id = p_user_message_id
    and conversation_id = target_conversation.id
    and role = 'user';

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Chat user message was not found';
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

  if p_answer_role = 'assistant' then
    for source_item in
      select value
      from jsonb_array_elements(p_sources) as source(value)
    loop
      source_rank := source_rank + 1;
      source_chunk_id := (source_item ->> 'chunkId')::uuid;
      source_module_id := nullif(source_item ->> 'moduleId', '')::uuid;
      source_score := (source_item ->> 'relevanceScore')::real;

      if source_chunk_id is null or source_score is null
        or source_score not between 0 and 1 then
        raise exception using
          errcode = '22023',
          message = 'A chat source is invalid';
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
      join public.documents as document on document.id = chunk.document_id
      join public.document_versions as version
        on version.id = chunk.document_version_id
        and version.document_id = chunk.document_id
      where chunk.id = source_chunk_id;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'A cited document chunk was not found';
      end if;

      if target_conversation.selected_module_id is not null
        and not exists (
          select 1
          from public.document_modules
          where document_id = source_document_id
            and module_id = target_conversation.selected_module_id
        ) then
        raise exception using
          errcode = '23503',
          message = 'A cited source does not belong to the selected module';
      end if;

      source_module_name := null;
      if source_module_id is not null then
        select module.name into source_module_name
        from public.document_modules as document_module
        join public.modules as module on module.id = document_module.module_id
        where document_module.document_id = source_document_id
          and document_module.module_id = source_module_id;

        if not found then
          raise exception using
            errcode = '23503',
            message = 'A cited source module is invalid';
        end if;
      end if;

      insert into public.chat_message_sources (
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
  else
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
set search_path = extensions, pg_catalog
as $$
begin
  if char_length(btrim(p_query_text)) not between 1 and 8_000
    or p_match_threshold not between 0 and 1
    or p_match_count not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Invalid document search parameters';
  end if;

  -- pgvector 0.8+ can continue scanning when publication/module filters are
  -- selective. The raw distance order below is deliberately indexable by HNSW.
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

revoke all on function public.complete_chat_turn(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real) from public, anon, authenticated;
revoke all on function public.search_document_chunks(extensions.vector, text, uuid, real, integer) from public, anon, authenticated;

grant execute on function public.complete_chat_turn(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real) to service_role;
grant execute on function public.search_document_chunks(extensions.vector, text, uuid, real, integer) to service_role;
