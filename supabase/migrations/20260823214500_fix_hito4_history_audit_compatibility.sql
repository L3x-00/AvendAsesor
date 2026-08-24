-- Preserve the Hito 3 owner-deletion contract for legacy/incomplete local data.
-- Real API callers are profile-verified before this RPC; only those callers emit
-- a user-attributed Hito 4 audit event.

create or replace function public.delete_chat_conversation(
  p_user_id uuid,
  p_conversation_id uuid
)
returns table (id uuid, deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.chat_conversations%rowtype;
begin
  if p_user_id is null or p_conversation_id is null then
    raise exception using errcode = '22023', message = 'A chat user and conversation are required';
  end if;

  select * into target_conversation
  from public.chat_conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.user_id = p_user_id
    and not conversation.is_deleted
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat conversation was not found';
  end if;

  return query
  update public.chat_conversations as conversation
  set is_deleted = true, deleted_at = now()
  where conversation.id = target_conversation.id
  returning conversation.id, conversation.deleted_at;

  if exists (
    select 1
    from public.profiles as profile
    where profile.id = p_user_id
  ) then
    perform private.record_operational_audit(
      p_user_id,
      'chat_history_deleted',
      'chat_conversation',
      target_conversation.id,
      '{}'::jsonb
    );
  end if;
end;
$$;
