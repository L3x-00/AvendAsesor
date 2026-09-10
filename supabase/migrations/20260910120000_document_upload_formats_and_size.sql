-- Ampliar la carga de documentos: además de PDF, admitir Word (.docx, .doc) y
-- Markdown (.md), y subir el límite de tamaño de 20 MiB a 50 MiB para que el
-- cliente pueda probar con documentos reales y pesados.
--
-- No se altera la funcionalidad existente: el PDF conserva su validación y su
-- flujo. Los demás formatos se almacenan (su indexación RAG llega cuando se
-- active el worker). El `mime_type` real se deriva de la extensión del nombre
-- de archivo, que la API ya validó contra los bytes reales del contenido, así
-- que las firmas de las RPC no cambian (menor superficie/riesgo).

-- 1) Derivar el MIME real a partir de la extensión validada por la API.
create or replace function private.document_mime_type_for(p_file_name text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when lower(p_file_name) like '%.docx' then
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    when lower(p_file_name) like '%.doc' then 'application/msword'
    when lower(p_file_name) like '%.md' or lower(p_file_name) like '%.markdown'
      then 'text/markdown'
    else 'application/pdf'
  end;
$$;

revoke all on function private.document_mime_type_for(text)
  from public, anon, authenticated;
grant execute on function private.document_mime_type_for(text) to service_role;

-- 2) Relajar el CHECK de `mime_type` (antes solo 'application/pdf') al conjunto
--    admitido. Se localiza el constraint por su definición para no depender del
--    nombre autogenerado. Las filas existentes son PDF y satisfacen el nuevo
--    CHECK, así que la validación no falla.
do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'document_versions'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%mime_type%'
  loop
    execute format(
      'alter table public.document_versions drop constraint %I',
      constraint_name
    );
  end loop;
end
$$;

alter table public.document_versions
  add constraint document_versions_mime_type_check
  check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/markdown'
    )
  );

-- 3) Recrear las RPC de carga con el MIME derivado. Misma firma exacta que
--    20260903120000; solo cambia el literal 'application/pdf' del INSERT por el
--    MIME real. `create or replace` conserva los permisos ya otorgados.
create or replace function public.create_governed_document_with_initial_version(
  p_document_id uuid,
  p_version_id uuid,
  p_title text,
  p_document_type text,
  p_issuing_entity text,
  p_issuance_year smallint,
  p_resolution_number text,
  p_article_reference text,
  p_metadata jsonb,
  p_module_ids uuid[],
  p_storage_path text,
  p_original_file_name text,
  p_file_size_bytes bigint,
  p_page_count integer,
  p_sha256 text,
  p_actor_id uuid,
  p_situation public.document_situation default 'current',
  p_reason text default null,
  p_replacement_document_id uuid default null,
  p_replacement_date date default null,
  p_replacement_year smallint default null,
  p_observation text default null,
  p_archive_reason_code public.document_archive_reason default null,
  p_archive_reason_detail text default null,
  p_processing_error text default null
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_document public.documents%rowtype;
begin
  if p_module_ids is null or cardinality(p_module_ids) = 0 then
    raise exception using errcode = '22023', message = 'At least one module association is required';
  end if;

  if exists (
    select 1 from unnest(p_module_ids) as supplied(module_id)
    group by module_id having count(*) > 1
  ) then
    raise exception using errcode = '23505', message = 'A document cannot link the same module more than once';
  end if;

  if p_situation = 'current' then
    if p_reason is not null or p_replacement_document_id is not null
      or p_replacement_date is not null or p_replacement_year is not null
      or p_observation is not null or p_archive_reason_code is not null
      or p_archive_reason_detail is not null then
      raise exception using errcode = '22023', message = 'A current document cannot contain archival data';
    end if;
  elsif p_situation = 'archived' then
    if p_archive_reason_code is null or p_archive_reason_code = 'REPLACED_BY_NEWER' then
      raise exception using errcode = '22023', message = 'A valid archive reason is required';
    end if;
    if (p_archive_reason_code = 'OTHER') <> (p_archive_reason_detail is not null) then
      raise exception using errcode = '22023', message = 'Custom archive reason is inconsistent';
    end if;
    if p_reason is not null or p_replacement_document_id is not null
      or p_replacement_date is not null or p_replacement_year is not null then
      raise exception using errcode = '22023', message = 'Archived documents cannot contain replacement data';
    end if;
  else
    if p_reason is null or (p_replacement_date is null and p_replacement_year is null) then
      raise exception using errcode = '22023', message = 'Replacement reason and date or year are required';
    end if;
    if p_archive_reason_code is not null and p_archive_reason_code <> 'REPLACED_BY_NEWER' then
      raise exception using errcode = '22023', message = 'Replacement archive reason is invalid';
    end if;
  end if;

  insert into public.documents (
    id, title, document_type, issuing_entity, issuance_year,
    resolution_number, article_reference, metadata, situation,
    publication_status, deactivated_at, deactivated_by, deactivation_reason,
    replacement_document_id, replacement_date, replacement_year,
    replacement_reason, replacement_observation, archive_reason_code,
    archive_reason_detail, archive_observation, created_by, updated_by
  ) values (
    p_document_id, p_title, p_document_type, p_issuing_entity, p_issuance_year,
    p_resolution_number, p_article_reference, p_metadata, p_situation,
    (case when p_situation = 'current' then 'active' else 'inactive' end)::public.document_publication_status,
    case when p_situation = 'current' then null else now() end,
    case when p_situation = 'current' then null else p_actor_id end,
    case
      when p_situation = 'replaced' then btrim(p_reason)
      when p_situation = 'archived' then coalesce(btrim(p_archive_reason_detail), p_archive_reason_code::text)
      else null
    end,
    case when p_situation = 'replaced' then p_replacement_document_id else null end,
    case when p_situation = 'replaced' then p_replacement_date else null end,
    case when p_situation = 'replaced' then p_replacement_year else null end,
    case when p_situation = 'replaced' then btrim(p_reason) else null end,
    case when p_situation = 'replaced' then btrim(p_observation) else null end,
    case
      when p_situation = 'replaced' then 'REPLACED_BY_NEWER'::public.document_archive_reason
      when p_situation = 'archived' then p_archive_reason_code
      else null
    end,
    case when p_situation = 'archived' then btrim(p_archive_reason_detail) else null end,
    case when p_situation = 'archived' then btrim(p_observation) else null end,
    p_actor_id, p_actor_id
  );

  insert into public.document_versions (
    id, document_id, version_number, storage_path, original_file_name,
    mime_type, file_size_bytes, page_count, sha256, uploaded_by
  ) values (
    p_version_id, p_document_id, 1, p_storage_path, p_original_file_name,
    private.document_mime_type_for(p_original_file_name), p_file_size_bytes, p_page_count, p_sha256, p_actor_id
  );

  update public.documents
  set current_version_id = p_version_id, updated_by = p_actor_id
  where id = p_document_id
  returning * into created_document;

  insert into public.document_modules (document_id, module_id, created_by)
  select p_document_id, supplied.module_id, p_actor_id
  from unnest(p_module_ids) as supplied(module_id);

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
    p_document_id, p_version_id, 'created',
    jsonb_strip_nulls(jsonb_build_object(
      'moduleCount', cardinality(p_module_ids),
      'situation', p_situation,
      'technicalStatus', case when p_processing_error is null then 'pending_approval' else 'error' end,
      'processingError', p_processing_error
    )), p_actor_id
  );

  insert into public.document_audit_events (document_id, action, details, actor_id)
  select p_document_id, 'module_linked', jsonb_build_object('moduleId', supplied.module_id), p_actor_id
  from unnest(p_module_ids) as supplied(module_id);

  select * into created_document from public.documents where id = p_document_id;
  return created_document;
end;
$$;

create or replace function public.add_governed_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_file_size_bytes bigint,
  p_page_count integer,
  p_sha256 text,
  p_actor_id uuid,
  p_processing_error text default null
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
  select * into target_document from public.documents
  where id = p_document_id and not is_deleted for update;
  if not found then raise exception using errcode = 'P0002', message = 'Document was not found'; end if;

  select coalesce(max(version_number), 0) + 1 into next_version_number
  from public.document_versions where document_id = p_document_id;

  insert into public.document_versions (
    id, document_id, version_number, storage_path, original_file_name,
    mime_type, file_size_bytes, page_count, sha256, uploaded_by
  ) values (
    p_version_id, p_document_id, next_version_number, p_storage_path,
    p_original_file_name, private.document_mime_type_for(p_original_file_name), p_file_size_bytes, p_page_count,
    p_sha256, p_actor_id
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
      'processingError', p_processing_error
    )), p_actor_id
  );
  return target_document;
end;
$$;

-- 4) Ampliar el bucket privado: 50 MiB y los MIME admitidos.
update storage.buckets
set
  file_size_limit = 52_428_800,
  allowed_mime_types = array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/markdown'
  ]::text[]
where id = 'normative-documents';
