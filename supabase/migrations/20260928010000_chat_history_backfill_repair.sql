-- La migración 20260927170000 completó last_question con el título (primera
-- pregunta) y sus UPDATE activaron set_updated_at en todas las conversaciones.
-- Recuperamos la última pregunta y el orden real desde mensajes ya persistidos.
-- No se elimina ninguna conversación ni mensaje.

begin;

alter table public.chat_conversations
  disable trigger chat_conversations_set_updated_at;

with recovered as (
  select
    conversation.id,
    coalesce(nullif(left(btrim(last_user.content), 8_000), ''), conversation.title) as last_question,
    coalesce(last_message.created_at, conversation.created_at) as last_activity_at
  from public.chat_conversations as conversation
  left join lateral (
    select message.content
    from public.chat_messages as message
    where message.conversation_id = conversation.id
      and message.role = 'user'
    order by message.created_at desc, message.id desc
    limit 1
  ) as last_user on true
  left join lateral (
    select message.created_at
    from public.chat_messages as message
    where message.conversation_id = conversation.id
    order by message.created_at desc, message.id desc
    limit 1
  ) as last_message on true
)
update public.chat_conversations as conversation
set last_question = recovered.last_question,
    updated_at = greatest(conversation.created_at, recovered.last_activity_at)
from recovered
where conversation.id = recovered.id;

alter table public.chat_conversations
  enable trigger chat_conversations_set_updated_at;

commit;
