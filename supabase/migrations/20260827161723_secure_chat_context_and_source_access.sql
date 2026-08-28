-- CU-04/05/06/08: bounded owned context, evidence-backed clarifications,
-- stable citation identifiers, and private source access.

create table public.chat_source_access_events (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.chat_message_sources (id) on delete restrict,
  user_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index chat_source_access_events_source_occurred_idx
  on public.chat_source_access_events (source_id, occurred_at desc);

create index chat_source_access_events_user_occurred_idx
  on public.chat_source_access_events (user_id, occurred_at desc);

alter table public.chat_source_access_events enable row level security;

revoke all on table public.chat_source_access_events
  from public, anon, authenticated, service_role;
grant select on table public.chat_source_access_events to service_role;

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
      select
        source.value ->> 'chunkId' as chunk_id,
        source.value ->> 'sourceId' as source_id
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
      join public.documents as document on document.id = chunk.document_id
      join public.document_versions as version
        on version.id = chunk.document_version_id
        and version.document_id = chunk.document_id
      where chunk.id = source_chunk_id;

      if not found then
        raise exception using errcode = 'P0002', message = 'A cited document chunk was not found';
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
  if p_limit not between 1 and 100 then
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

create function public.get_chat_conversation_context(
  p_user_id uuid,
  p_conversation_id uuid,
  p_message_limit integer default 12,
  p_character_limit integer default 10_000
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
  if p_user_id is null or p_conversation_id is null then
    raise exception using errcode = '22023', message = 'A chat user and conversation are required';
  end if;
  if p_message_limit not between 1 and 20
    or p_character_limit not between 1_000 and 16_000 then
    raise exception using errcode = '22023', message = 'Chat context bounds are invalid';
  end if;

  select * into target_conversation
  from public.chat_conversations
  where id = p_conversation_id
    and user_id = p_user_id
    and not is_deleted;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat conversation was not found';
  end if;

  with candidates as (
    select
      message.id,
      message.role,
      left(message.content, least(2_000, p_character_limit)) as content,
      message.created_at,
      row_number() over (order by message.created_at desc, message.id desc) as ordinal
    from public.chat_messages as message
    where message.conversation_id = target_conversation.id
    order by message.created_at desc, message.id desc
    limit p_message_limit
  ), ranked as (
    select
      candidates.*,
      sum(char_length(candidates.content)) over (
        order by candidates.created_at desc, candidates.id desc
        rows between unbounded preceding and current row
      ) as running_characters
    from candidates
  ), bounded as (
    select *
    from ranked
    where running_characters <= p_character_limit
  )
  select jsonb_build_object(
    'conversationId', target_conversation.id,
    'selectedModuleId', target_conversation.selected_module_id,
    'messages', coalesce(jsonb_agg(jsonb_build_object(
      'role', bounded.role,
      'content', bounded.content
    ) order by bounded.created_at, bounded.id), '[]'::jsonb)
  ) into result
  from bounded;

  return result;
end;
$$;

create function public.authorize_chat_source_download(
  p_user_id uuid,
  p_source_id uuid
)
returns table (
  source_id uuid,
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized_source_id uuid;
  authorized_bucket text;
  authorized_path text;
begin
  if p_user_id is null or p_source_id is null then
    raise exception using errcode = '22023', message = 'A chat user and source are required';
  end if;

  select
    source.id,
    version.storage_bucket,
    version.storage_path
  into
    authorized_source_id,
    authorized_bucket,
    authorized_path
  from public.chat_message_sources as source
  join public.chat_messages as message on message.id = source.message_id
  join public.chat_conversations as conversation
    on conversation.id = message.conversation_id
  join public.document_versions as version
    on version.id = source.document_version_id
    and version.document_id = source.document_id
  where source.id = p_source_id
    and message.role in ('assistant', 'clarification')
    and conversation.user_id = p_user_id
    and not conversation.is_deleted;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat source was not found';
  end if;

  insert into public.chat_source_access_events (source_id, user_id)
  values (authorized_source_id, p_user_id);

  return query select authorized_source_id, authorized_bucket, authorized_path;
end;
$$;

revoke all on function public.complete_chat_turn(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real)
  from public, anon, authenticated;
revoke all on function public.get_chat_conversation(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.get_chat_conversation_context(uuid, uuid, integer, integer)
  from public, anon, authenticated;
revoke all on function public.authorize_chat_source_download(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.complete_chat_turn(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real)
  to service_role;
grant execute on function public.get_chat_conversation(uuid, uuid, integer)
  to service_role;
grant execute on function public.get_chat_conversation_context(uuid, uuid, integer, integer)
  to service_role;
grant execute on function public.authorize_chat_source_download(uuid, uuid)
  to service_role;
