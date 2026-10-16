-- CU-04: una aclaración vuelve a poder cerrarse sin fuentes.
--
-- El contrato del 2026-08-27 (secure_chat_context_and_source_access)
-- exigía de una a diez fuentes para toda aclaración. El 2026-10-14 la API
-- dejó de adjuntar citas a las aclaraciones (no se muestran fuentes hasta que
-- la persona precise el caso: TSK-0082/PR #109, reforzado en TSK-0086/PR #111),
-- pero el contrato no se actualizó: cada aclaración respondía 22023 y el chat
-- mostraba «Esta consulta no se completó por un problema técnico» en lugar de
-- pedir precisión. Esta migración admite también cero fuentes y conserva la
-- exigencia de motivo ambiguous_request. Una aclaración sustentada (hasta
-- diez fuentes) sigue permitida, así que la migración es compatible con la
-- revisión anterior y con la actual.
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
AS $function$
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
    -- CU-04: una aclaración no está obligada a citar evidencia. Desde el
    -- 2026-10-14 la API no muestra citas ni fuentes hasta que la persona
    -- precise el caso (TSK-0082) y envía '[]'; una aclaración que sí cite
    -- evidencia sigue admitiendo de una a diez fuentes.
    if jsonb_array_length(p_sources) not between 0 and 10
      or p_unanswered_reason is distinct from 'ambiguous_request' then
      raise exception using
        errcode = '22023',
        message = 'A clarification requires zero to ten sources and an ambiguous-request reason';
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
$function$
