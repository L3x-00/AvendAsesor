-- Tipo y número de la norma en cada cita: la fuente guarda el tipo documental
-- (RM, RD, RV, DS, M…), el número de resolución y el año de emisión para
-- mostrarlos en las referencias y permitir que el modelo los nombre.
-- La captura ocurre en el trigger existente: no se toca la función de cierre.

alter table public.chat_message_sources
  add column document_type text,
  add column resolution_number text,
  add column issuance_year smallint;

alter table public.chat_message_sources
  add constraint chat_message_sources_document_type_check
    check (
      document_type is null
      or char_length(btrim(document_type)) between 1 and 64
    ),
  add constraint chat_message_sources_resolution_number_check
    check (
      resolution_number is null
      or char_length(btrim(resolution_number)) between 1 and 255
    ),
  add constraint chat_message_sources_issuance_year_check
    check (issuance_year is null or issuance_year between 1900 and 2100);

-- Backfill de fuentes ya persistidas (idempotente; el documento vivo manda).
update public.chat_message_sources as source
set
  document_type = document.document_type,
  resolution_number = document.resolution_number,
  issuance_year = document.issuance_year
from public.documents as document
where document.id = source.document_id
  and source.document_type is null;

create or replace function private.capture_chat_source_document_situation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select
    document.situation,
    document.document_type,
    document.resolution_number,
    document.issuance_year
  into
    new.document_situation,
    new.document_type,
    new.resolution_number,
    new.issuance_year
  from public.documents as document
  where document.id = new.document_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A cited source document was not found';
  end if;

  return new;
end;
$$;

drop trigger chat_message_sources_protect_document_situation
  on public.chat_message_sources;

create trigger chat_message_sources_protect_document_situation
before update of
  document_id,
  document_situation,
  document_type,
  resolution_number,
  issuance_year
on public.chat_message_sources
for each row execute procedure private.prevent_chat_source_situation_mutation();

-- La RPC de retrieval añade tipo, número y año del documento citado. Cambia el
-- tipo de retorno: se recrea (drop/create) manteniendo firma y permisos.
drop function if exists public.search_document_chunks_with_consultation_context(
  extensions.vector, text, uuid, real, integer, text
);

create function public.search_document_chunks_with_consultation_context(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_selected_module_id uuid default null,
  p_match_threshold real default 0.70,
  p_match_count integer default 5,
  p_retrieval_scope text default 'current'
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_type text,
  resolution_number text,
  issuance_year smallint,
  document_situation public.document_situation,
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
  module_names text[],
  module_associations jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    result.chunk_id,
    result.document_id,
    result.document_version_id,
    result.document_title,
    cited_document.document_type,
    cited_document.resolution_number,
    cited_document.issuance_year,
    result.document_situation,
    result.version_number,
    result.page_start,
    result.page_end,
    result.section_title,
    result.article_reference,
    result.numeral_reference,
    result.chunk_content,
    result.semantic_score,
    result.lexical_score,
    result.module_ids,
    result.module_names,
    coalesce(associations.items, '[]'::jsonb) as module_associations
  from public.search_document_chunks_by_situation(
    p_query_embedding,
    p_query_text,
    p_selected_module_id,
    p_match_threshold,
    p_match_count,
    p_retrieval_scope
  ) as result
  join public.documents as cited_document
    on cited_document.id = result.document_id
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'rootModuleId', coalesce(parent.id, module.id),
        'rootModuleName', coalesce(parent.name, module.name),
        'submoduleId', case when parent.id is null then null else module.id end,
        'submoduleName', case when parent.id is null then null else module.name end
      )
      order by coalesce(parent.name, module.name), module.name, module.id
    ) as items
    from (
      select distinct module.id, module.name, module.parent_module_id
      from public.document_modules as document_module
      join public.modules as module on module.id = document_module.module_id
      left join public.modules as parent on parent.id = module.parent_module_id
      where document_module.document_id = result.document_id
        and module.is_active
        and not module.is_deleted
        and (parent.id is null or (parent.is_active and not parent.is_deleted))
    ) as module
    left join public.modules as parent on parent.id = module.parent_module_id
  ) as associations;
$$;

revoke all on function public.search_document_chunks_with_consultation_context(
  extensions.vector, text, uuid, real, integer, text
) from public, anon, authenticated;
grant execute on function public.search_document_chunks_with_consultation_context(
  extensions.vector, text, uuid, real, integer, text
) to service_role;

-- El historial devuelve el snapshot ampliado para que la UI muestre el tipo y
-- el número de la norma también al recargar una conversación.
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
