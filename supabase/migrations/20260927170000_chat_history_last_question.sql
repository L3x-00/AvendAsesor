-- Historial del chat: guarda la última pregunta y un snapshot del módulo o
-- submódulo elegido. Así el historial agrupa por tema (con "Consultas
-- generales" para los chats libres) sin depender de joins que cambien después.

alter table public.chat_conversations
  add column last_question text,
  add column selected_module_name text,
  add column selected_module_parent_id uuid references public.modules (id) on delete set null,
  add column selected_module_parent_name text;

alter table public.chat_conversations
  add constraint chat_conversations_last_question_check
    check (
      last_question is null
      or char_length(btrim(last_question)) between 1 and 8_000
    ),
  add constraint chat_conversations_selected_module_name_check
    check (
      selected_module_name is null
      or char_length(btrim(selected_module_name)) between 1 and 255
    ),
  add constraint chat_conversations_selected_module_parent_name_check
    check (
      selected_module_parent_name is null
      or char_length(btrim(selected_module_parent_name)) between 1 and 255
    );

-- Backfill: el título (primera pregunta) es la última conocida; nombres desde
-- el módulo vivo para que las conversaciones viejas también se agrupen.
update public.chat_conversations as conversation
set
  selected_module_name = module.name,
  selected_module_parent_id = parent.id,
  selected_module_parent_name = parent.name
from public.modules as module
left join public.modules as parent on parent.id = module.parent_module_id
where module.id = conversation.selected_module_id;

update public.chat_conversations
set last_question = coalesce(last_question, title)
where last_question is null;

-- Cada turno actualiza la última pregunta y, al crear la conversación, captura
-- el nombre del módulo y de su padre (submódulo).
create or replace function public.begin_chat_turn(
  p_user_id uuid,
  p_conversation_id uuid default null,
  p_selected_module_id uuid default null,
  p_question text default null
)
returns table (
  conversation_id uuid,
  user_message_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.chat_conversations%rowtype;
  created_message_id uuid;
  normalized_question text := btrim(coalesce(p_question, ''));
  module_name text;
  module_parent_id uuid;
  module_parent_name text;
begin
  if char_length(normalized_question) not between 1 and 8_000 then
    raise exception using
      errcode = '22023',
      message = 'A chat question must contain between 1 and 8000 characters';
  end if;

  if p_conversation_id is null then
    if p_selected_module_id is not null and not exists (
      select 1
      from public.modules as module
      where module.id = p_selected_module_id
        and module.is_active
        and not module.is_deleted
    ) then
      raise exception using
        errcode = '23503',
        message = 'The selected module is unavailable';
    end if;

    if p_selected_module_id is not null then
      select module.name, parent.id, parent.name
      into module_name, module_parent_id, module_parent_name
      from public.modules as module
      left join public.modules as parent on parent.id = module.parent_module_id
      where module.id = p_selected_module_id;
    end if;

    insert into public.chat_conversations (
      user_id,
      selected_module_id,
      title,
      last_question,
      selected_module_name,
      selected_module_parent_id,
      selected_module_parent_name
    )
    values (
      p_user_id,
      p_selected_module_id,
      left(normalized_question, 255),
      normalized_question,
      module_name,
      module_parent_id,
      module_parent_name
    )
    returning * into target_conversation;
  else
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

    if p_selected_module_id is distinct from target_conversation.selected_module_id then
      raise exception using
        errcode = '22023',
        message = 'The selected module must match the existing conversation';
    end if;

    update public.chat_conversations
    set updated_at = now(), last_question = normalized_question
    where id = target_conversation.id
    returning * into target_conversation;
  end if;

  insert into public.chat_messages (conversation_id, role, content)
  values (target_conversation.id, 'user', normalized_question)
  returning id into created_message_id;

  return query
  select target_conversation.id, created_message_id;
end;
$$;

-- La página del historial devuelve la última pregunta y el snapshot de tema.
drop function if exists public.list_chat_conversations_page(
  uuid, integer, timestamptz, uuid
);

create function public.list_chat_conversations_page(
  p_user_id uuid,
  p_limit integer default 21,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  selected_module_id uuid,
  selected_module_name text,
  selected_module_parent_id uuid,
  selected_module_parent_name text,
  title text,
  last_question text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'A chat user is required';
  end if;

  -- One extra item is requested by the API to produce a stable next cursor.
  if p_limit not between 1 and 51 then
    raise exception using
      errcode = '22023',
      message = 'The chat page limit must be between 1 and 51';
  end if;

  if (p_cursor_updated_at is null) <> (p_cursor_id is null) then
    raise exception using
      errcode = '22023',
      message = 'A chat cursor must contain both updated timestamp and id';
  end if;

  return query
  select
    conversation.id,
    conversation.selected_module_id,
    conversation.selected_module_name,
    conversation.selected_module_parent_id,
    conversation.selected_module_parent_name,
    conversation.title,
    conversation.last_question,
    conversation.created_at,
    conversation.updated_at
  from public.chat_conversations as conversation
  where conversation.user_id = p_user_id
    and not conversation.is_deleted
    and (
      p_cursor_updated_at is null
      or (conversation.updated_at, conversation.id)
        < (p_cursor_updated_at, p_cursor_id)
    )
  order by conversation.updated_at desc, conversation.id desc
  limit p_limit;
end;
$$;

revoke all on function public.list_chat_conversations_page(
  uuid, integer, timestamptz, uuid
) from public, anon, authenticated;
grant execute on function public.list_chat_conversations_page(
  uuid, integer, timestamptz, uuid
) to service_role;

-- El detalle de la conversación también expone la última pregunta y el tema.
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
      'selectedModuleName', target_conversation.selected_module_name,
      'selectedModuleParentId', target_conversation.selected_module_parent_id,
      'selectedModuleParentName', target_conversation.selected_module_parent_name,
      'title', target_conversation.title,
      'lastQuestion', target_conversation.last_question,
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
  left join public.consultation_turns as consultation_turn
    on consultation_turn.answer_message_id = message.id
  left join public.modules as detected_module
    on detected_module.id = consultation_turn.detected_module_id
  left join public.modules as detected_submodule
    on detected_submodule.id = consultation_turn.detected_submodule_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', source.id,
      'rank', source.source_rank,
      'documentTitle', source.document_title,
      'documentType', source.document_type,
      'resolutionNumber', source.resolution_number,
      'issuanceYear', source.issuance_year,
      'documentSituation', source.document_situation,
      'moduleName', source.module_name,
      'relatedModuleName', detected_module.name,
      'relatedSubmoduleName', detected_submodule.name,
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
