-- TD-006: separar lo que la persona escribió ("sí") de la pregunta efectiva
-- que se está respondiendo. El mensaje del historial conserva el texto literal;
-- `last_question` y la cola de consultas sin sustento usan la pregunta efectiva.
--
-- Se reemplazan las firmas de 4 argumentos por una de 5 con parámetro opcional,
-- por lo que las llamadas existentes siguen siendo válidas.

drop function if exists public.begin_chat_turn_with_consultation_routing(uuid, uuid, uuid, text);
drop function if exists public.begin_chat_turn(uuid, uuid, uuid, text);

create or replace function public.begin_chat_turn(
  p_user_id uuid,
  p_conversation_id uuid default null,
  p_selected_module_id uuid default null,
  p_question text default null,
  p_effective_question text default null
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
  normalized_effective text;
  module_name text;
  module_parent_id uuid;
  module_parent_name text;
begin
  if char_length(normalized_question) not between 1 and 8_000 then
    raise exception using
      errcode = '22023',
      message = 'A chat question must contain between 1 and 8000 characters';
  end if;

  normalized_effective := btrim(coalesce(p_effective_question, normalized_question));
  if char_length(normalized_effective) not between 1 and 8_000 then
    raise exception using
      errcode = '22023',
      message = 'The effective chat question must contain between 1 and 8000 characters';
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
      left(normalized_effective, 255),
      normalized_effective,
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
    set updated_at = now(), last_question = normalized_effective
    where id = target_conversation.id
    returning * into target_conversation;
  end if;

  -- El mensaje visible sigue siendo lo que la persona escribió.
  insert into public.chat_messages (conversation_id, role, content)
  values (target_conversation.id, 'user', normalized_question)
  returning id into created_message_id;

  return query
  select target_conversation.id, created_message_id;
end;
$$;

create or replace function public.begin_chat_turn_with_consultation_routing(
  p_user_id uuid,
  p_conversation_id uuid default null,
  p_selected_module_id uuid default null,
  p_question text default null,
  p_effective_question text default null
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
  started_turn record;
begin
  perform private.require_active_consultation_user(p_user_id);

  select * into started_turn
  from public.begin_chat_turn(
    p_user_id,
    p_conversation_id,
    p_selected_module_id,
    p_question,
    p_effective_question
  );

  insert into public.consultation_turns (
    conversation_id,
    user_id,
    user_message_id,
    requested_module_id
  )
  values (
    started_turn.conversation_id,
    p_user_id,
    started_turn.user_message_id,
    p_selected_module_id
  )
  on conflict on constraint consultation_turns_user_message_id_key do nothing;

  return query
  select started_turn.conversation_id, started_turn.user_message_id;
end;
$$;

revoke all on function public.begin_chat_turn(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_chat_turn(uuid, uuid, uuid, text, text) to service_role;
revoke all on function public.begin_chat_turn_with_consultation_routing(uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.begin_chat_turn_with_consultation_routing(uuid, uuid, uuid, text, text) to service_role;

notify pgrst, 'reload schema';
