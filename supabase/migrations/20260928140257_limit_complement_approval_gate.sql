-- Las cargas reemplazantes antiguas siguen permitidas; solo un complemento exige base aprobada.
create or replace function public.add_governed_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_file_size_bytes bigint,
  p_page_count integer,
  p_sha256 text,
  p_actor_id uuid,
  p_processing_error text default null,
  p_issuance_year smallint default null,
  p_version_relation text default null
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  next_version_number integer;
begin
  if p_version_relation is not null
    and p_version_relation not in ('replaces', 'complements') then
    raise exception using
      errcode = '22023',
      message = 'The version relation is invalid';
  end if;

  select * into target_document from public.documents
  where id = p_document_id and not is_deleted for update;
  if not found then raise exception using errcode = 'P0002', message = 'Document was not found'; end if;
  if p_version_relation = 'complements' and target_document.approval_status <> 'ready' then
    raise exception using errcode = '22023', message = 'Approve the current version before adding another';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_version_number
  from public.document_versions where document_id = p_document_id;

  insert into public.document_versions (
    id, document_id, version_number, storage_path, original_file_name,
    mime_type, file_size_bytes, page_count, sha256, uploaded_by,
    issuance_year, version_relation
  ) values (
    p_version_id, p_document_id, next_version_number, p_storage_path,
    p_original_file_name,
    case
      when lower(p_original_file_name) like '%.docx' then
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      when lower(p_original_file_name) like '%.doc' then 'application/msword'
      when lower(p_original_file_name) like '%.md'
        or lower(p_original_file_name) like '%.markdown' then 'text/markdown'
      else 'application/pdf'
    end,
    p_file_size_bytes, p_page_count,
    p_sha256, p_actor_id,
    p_issuance_year, p_version_relation
  );

  update public.documents
  set current_version_id = p_version_id, approval_status = 'pending_approval',
    approval_updated_at = now(), approval_updated_by = p_actor_id,
    updated_by = p_actor_id
  where id = p_document_id returning * into target_document;

  if p_processing_error is not null then
    perform private.set_document_ingestion_status(p_version_id, 'failed');
    update public.document_ingestion_jobs
    set status = 'failed', last_error_code = 'UNREADABLE_PDF',
      last_error_message = left(p_processing_error, 1000), completed_at = now(), updated_at = now()
    where document_version_id = p_version_id;
  end if;

  insert into public.document_audit_events (
    document_id, document_version_id, action, details, actor_id
  ) values (
    p_document_id, p_version_id, 'version_added',
    jsonb_strip_nulls(jsonb_build_object(
      'versionNumber', next_version_number,
      'technicalStatus', case when p_processing_error is null then 'pending_approval' else 'error' end,
      'processingError', p_processing_error,
      'issuanceYear', p_issuance_year,
      'versionRelation', p_version_relation
    )), p_actor_id
  );
  return target_document;
end;
$$;
