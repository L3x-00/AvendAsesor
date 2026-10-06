-- Página física inequívoca: cada fuente conserva también el total de páginas
-- de la versión PDF que sustentó la respuesta. La numeración impresa no se
-- infiere aquí porque no existe una señal fiable en todos los documentos.

alter table public.chat_message_sources
  add column pdf_page_count integer;

update public.chat_message_sources as source
set pdf_page_count = version.page_count
from public.document_versions as version
where version.id = source.document_version_id
  and version.document_id = source.document_id
  and source.pdf_page_count is null;

alter table public.chat_message_sources
  alter column pdf_page_count set not null;

do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'chat_message_sources_pdf_page_count_check'
      and conrelid = 'public.chat_message_sources'::regclass
  ) then
    alter table public.chat_message_sources
      add constraint chat_message_sources_pdf_page_count_check
        check (pdf_page_count between 1 and 300);
  end if;
end;
$$;

-- Completa el snapshot en cada cita nueva y valida que documento y versión
-- coincidan. Los datos históricos quedan protegidos por el trigger existente.
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
    document.issuance_year,
    version.page_count
  into
    new.document_situation,
    new.document_type,
    new.resolution_number,
    new.issuance_year,
    new.pdf_page_count
  from public.documents as document
  join public.document_versions as version
    on version.id = new.document_version_id
    and version.document_id = document.id
  where document.id = new.document_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A cited source document version was not found';
  end if;

  return new;
end;
$$;

drop trigger chat_message_sources_protect_document_situation
  on public.chat_message_sources;

create trigger chat_message_sources_protect_document_situation
before update of
  document_id,
  document_version_id,
  document_situation,
  document_type,
  resolution_number,
  issuance_year,
  pdf_page_count
on public.chat_message_sources
for each row execute procedure private.prevent_chat_source_situation_mutation();

-- Retrieval entrega el total de la versión aprobada junto con la página física.
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
  mime_type text,
  pdf_page_count integer,
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
    cited_version.mime_type,
    cited_version.page_count,
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
  join public.document_versions as cited_version
    on cited_version.id = result.document_version_id
    and cited_version.document_id = result.document_id
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

-- El historial conserva el total como parte del snapshot de la fuente.
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
      'documentId', source.document_id,
      'documentVersionId', source.document_version_id,
      'documentTitle', source.document_title,
      'documentType', source.document_type,
      'resolutionNumber', source.resolution_number,
      'issuanceYear', source.issuance_year,
      'documentSituation', source.document_situation,
      'moduleName', source.module_name,
      'relatedModuleName', detected_module.name,
      'relatedSubmoduleName', detected_submodule.name,
      'versionNumber', source.version_number,
      'mimeType', version.mime_type,
      'pdfPageCount', source.pdf_page_count,
      'pageStart', source.page_start,
      'pageEnd', source.page_end,
      'sectionTitle', source.section_title,
      'articleReference', source.article_reference,
      'numeralReference', source.numeral_reference,
      'relevanceScore', source.relevance_score
    ) order by source.source_rank) as items
    from public.chat_message_sources as source
    join public.document_versions as version
      on version.id = source.document_version_id
      and version.document_id = source.document_id
    where source.message_id = message.id
  ) as sources on true;

  return result;
end;
$$;

revoke all on function public.get_chat_conversation(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_chat_conversation(uuid, uuid, integer)
  to service_role;
