-- Hito 4 / Fase 2: private history pagination and owner-initiated soft deletion.
-- This migration adds new RPCs without replacing the Hito 3 read contract.

create function public.list_chat_conversations_page(
  p_user_id uuid,
  p_limit integer default 21,
  p_cursor_updated_at timestamptz default null,
  p_cursor_id uuid default null
)
returns table (
  id uuid,
  selected_module_id uuid,
  title text,
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
    conversation.title,
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

create function public.delete_chat_conversation(
  p_user_id uuid,
  p_conversation_id uuid
)
returns table (
  id uuid,
  deleted_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.chat_conversations%rowtype;
begin
  if p_user_id is null or p_conversation_id is null then
    raise exception using
      errcode = '22023',
      message = 'A chat user and conversation are required';
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

  return query
  update public.chat_conversations
  set
    is_deleted = true,
    deleted_at = now()
  where id = target_conversation.id
  returning chat_conversations.id, chat_conversations.deleted_at;
end;
$$;

revoke all on function public.list_chat_conversations_page(uuid, integer, timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.delete_chat_conversation(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.list_chat_conversations_page(uuid, integer, timestamptz, uuid)
  to service_role;
grant execute on function public.delete_chat_conversation(uuid, uuid)
  to service_role;

