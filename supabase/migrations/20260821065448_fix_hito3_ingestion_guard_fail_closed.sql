create or replace function private.prevent_document_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_status text := old.ingestion_status::text;
  new_status text := new.ingestion_status::text;
  transition_allowed boolean := coalesce(
    current_setting('app.avend_ingestion_transition', true),
    ''
  ) = 'active';
begin
  if new.document_id is distinct from old.document_id
    or new.version_number is distinct from old.version_number
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.original_file_name is distinct from old.original_file_name
    or new.mime_type is distinct from old.mime_type
    or new.file_size_bytes is distinct from old.file_size_bytes
    or new.page_count is distinct from old.page_count
    or new.sha256 is distinct from old.sha256
    or new.uploaded_at is distinct from old.uploaded_at
    or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'Document versions are immutable; create a new version instead';
  end if;

  if old_status is distinct from new_status then
    if not transition_allowed then
      raise exception 'Document ingestion state is controlled by the ingestion worker';
    end if;

    if not (
      (old_status = 'pending' and new_status in ('processing', 'failed'))
      or (old_status = 'processing' and new_status in ('pending', 'indexed', 'failed'))
      or (old_status = 'failed' and new_status = 'pending')
      or (old_status = 'indexed' and new_status = 'pending')
    ) then
      raise exception 'Invalid document ingestion state transition: % -> %', old_status, new_status;
    end if;
  elsif new.ingestion_updated_at is distinct from old.ingestion_updated_at
    and not transition_allowed then
    raise exception 'Document ingestion state is controlled by the ingestion worker';
  end if;

  return new;
end;
$$;
