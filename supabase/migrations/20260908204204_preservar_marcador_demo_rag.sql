-- The demo marker is a server-controlled boundary.  Keep it when an
-- administrator edits arbitrary document metadata so a fictitious PDF cannot
-- become live RAG evidence by accidentally replacing the JSON object.
create or replace function private.preserve_demo_seed_marker()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.metadata ? 'demoSeed' then
    new.metadata := pg_catalog.jsonb_set(
      coalesce(new.metadata, '{}'::jsonb),
      array['demoSeed']::text[],
      old.metadata -> 'demoSeed',
      true
    );
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_demo_seed_marker() from public, anon, authenticated;

drop trigger if exists documents_preserve_demo_seed_marker on public.documents;
create trigger documents_preserve_demo_seed_marker
before update of metadata on public.documents
for each row execute function private.preserve_demo_seed_marker();

-- Keep the same boundary in the citation trigger as a defense in depth for
-- callers that attempt to write a source without going through retrieval.
create or replace function private.validate_chat_message_source_live_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  canonical_document_title text;
  canonical_version_number integer;
  canonical_page_start integer;
  canonical_page_end integer;
  canonical_section_title text;
  canonical_article_reference text;
  canonical_numeral_reference text;
  canonical_module_name text;
begin
  select
    document.title,
    version.version_number,
    chunk.page_start,
    chunk.page_end,
    chunk.section_title,
    chunk.article_reference,
    chunk.numeral_reference
  into
    canonical_document_title,
    canonical_version_number,
    canonical_page_start,
    canonical_page_end,
    canonical_section_title,
    canonical_article_reference,
    canonical_numeral_reference
  from public.document_chunks as chunk
  join public.documents as document
    on document.id = chunk.document_id
  join public.document_versions as version
    on version.id = chunk.document_version_id
    and version.document_id = chunk.document_id
  where chunk.id = new.chunk_id
    and chunk.document_id = new.document_id
    and chunk.document_version_id = new.document_version_id
    and not document.is_deleted
    and not (document.metadata ? 'demoSeed')
    and document.approved_version_id = chunk.document_version_id
    and version.ingestion_status = 'indexed'
    and (
      (document.situation = 'current' and document.publication_status = 'active')
      or (
        document.situation in ('replaced', 'archived')
        and document.publication_status = 'inactive'
      )
    )
    and exists (
      select 1
      from public.document_modules as document_module
      join public.modules as linked_module
        on linked_module.id = document_module.module_id
      left join public.modules as parent_module
        on parent_module.id = linked_module.parent_module_id
      where document_module.document_id = document.id
        and linked_module.is_active
        and not linked_module.is_deleted
        and (
          parent_module.id is null
          or (parent_module.is_active and not parent_module.is_deleted)
        )
    );

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A cited source is no longer eligible as active evidence';
  end if;

  canonical_module_name := null;
  if new.module_id is not null then
    select cited_module.name into canonical_module_name
    from public.modules as cited_module
    where cited_module.id = new.module_id
      and cited_module.is_active
      and not cited_module.is_deleted
      and exists (
        select 1
        from public.document_modules as document_module
        join public.modules as linked_module
          on linked_module.id = document_module.module_id
        left join public.modules as parent_module
          on parent_module.id = linked_module.parent_module_id
        where document_module.document_id = new.document_id
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
      raise exception using
        errcode = '23503',
        message = 'A cited source module is no longer eligible as active evidence';
    end if;
  end if;

  new.document_title := canonical_document_title;
  new.module_name := canonical_module_name;
  new.version_number := canonical_version_number;
  new.page_start := canonical_page_start;
  new.page_end := canonical_page_end;
  new.section_title := canonical_section_title;
  new.article_reference := canonical_article_reference;
  new.numeral_reference := canonical_numeral_reference;
  return new;
end;
$$;

revoke all on function private.validate_chat_message_source_live_evidence()
  from public, anon, authenticated;
