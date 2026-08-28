-- Preserve the canonical user-message relationship in history payloads so
-- document generation never guesses a question from chronological position.

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
