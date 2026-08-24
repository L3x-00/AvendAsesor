-- The link introduced by the preceding hardening migration cannot be inferred
-- safely from a pre-existing chat transcript. Hito 3 has no remote data, so a
-- fail-closed guard is safer than guessing and corrupting traceability.
do $$
begin
  if exists (
    select 1
    from public.chat_messages
    where role <> 'user'::public.chat_message_role
      and in_reply_to_message_id is null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Chat reply hardening requires a dedicated legacy-history migration';
  end if;
end;
$$;

create function private.prevent_completed_question_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.role = 'user'
    and (
      new.role is distinct from old.role
      or new.conversation_id is distinct from old.conversation_id
    )
    and exists (
      select 1
      from public.chat_messages as reply
      where reply.in_reply_to_message_id = old.id
    ) then
    raise exception 'A completed user message cannot change role or conversation';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_completed_question_mutation() from public;

create trigger chat_messages_prevent_completed_question_mutation
before update of role, conversation_id
on public.chat_messages
for each row execute procedure private.prevent_completed_question_mutation();
