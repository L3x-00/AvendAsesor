create function public.create_document_with_initial_version(
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
  p_actor_id uuid
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_document public.documents%rowtype;
begin
  if p_module_ids is null then
    raise exception using
      errcode = '22023',
      message = 'Module identifiers are required';
  end if;

  if exists (
    select 1
    from unnest(p_module_ids) as supplied(module_id)
    group by module_id
    having count(*) > 1
  ) then
    raise exception using
      errcode = '23505',
      message = 'A document cannot link the same module more than once';
  end if;

  if exists (
    select 1
    from unnest(p_module_ids) as supplied(module_id)
    left join public.modules as module on module.id = supplied.module_id
    where module.id is null or module.is_deleted
  ) then
    raise exception using
      errcode = '23503',
      message = 'A selected module is unavailable';
  end if;

  insert into public.documents (
    id,
    title,
    document_type,
    issuing_entity,
    issuance_year,
    resolution_number,
    article_reference,
    metadata,
    created_by,
    updated_by
  )
  values (
    p_document_id,
    p_title,
    p_document_type,
    p_issuing_entity,
    p_issuance_year,
    p_resolution_number,
    p_article_reference,
    p_metadata,
    p_actor_id,
    p_actor_id
  );

  insert into public.document_versions (
    id,
    document_id,
    version_number,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes,
    page_count,
    sha256,
    uploaded_by
  )
  values (
    p_version_id,
    p_document_id,
    1,
    p_storage_path,
    p_original_file_name,
    'application/pdf',
    p_file_size_bytes,
    p_page_count,
    p_sha256,
    p_actor_id
  );

  update public.documents
  set
    current_version_id = p_version_id,
    updated_by = p_actor_id
  where id = p_document_id
  returning * into created_document;

  insert into public.document_modules (document_id, module_id, created_by)
  select p_document_id, supplied.module_id, p_actor_id
  from unnest(p_module_ids) as supplied(module_id);

  insert into public.document_audit_events (
    document_id,
    document_version_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    p_version_id,
    'created',
    jsonb_build_object('moduleCount', cardinality(p_module_ids)),
    p_actor_id
  );

  insert into public.document_audit_events (
    document_id,
    action,
    details,
    actor_id
  )
  select
    p_document_id,
    'module_linked',
    jsonb_build_object('moduleId', supplied.module_id),
    p_actor_id
  from unnest(p_module_ids) as supplied(module_id);

  return created_document;
end;
$$;

create function public.add_document_version(
  p_document_id uuid,
  p_version_id uuid,
  p_storage_path text,
  p_original_file_name text,
  p_file_size_bytes bigint,
  p_page_count integer,
  p_sha256 text,
  p_actor_id uuid
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
  select * into target_document
  from public.documents
  where id = p_document_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document was not found';
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version_number
  from public.document_versions
  where document_id = p_document_id;

  insert into public.document_versions (
    id,
    document_id,
    version_number,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes,
    page_count,
    sha256,
    uploaded_by
  )
  values (
    p_version_id,
    p_document_id,
    next_version_number,
    p_storage_path,
    p_original_file_name,
    'application/pdf',
    p_file_size_bytes,
    p_page_count,
    p_sha256,
    p_actor_id
  );

  update public.documents
  set
    current_version_id = p_version_id,
    updated_by = p_actor_id
  where id = p_document_id
  returning * into target_document;

  insert into public.document_audit_events (
    document_id,
    document_version_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    p_version_id,
    'version_added',
    jsonb_build_object('versionNumber', next_version_number),
    p_actor_id
  );

  return target_document;
end;
$$;

create function public.update_document_metadata(
  p_document_id uuid,
  p_patch jsonb,
  p_actor_id uuid
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
begin
  if jsonb_typeof(p_patch) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Document metadata patch must be an object';
  end if;

  select * into target_document
  from public.documents
  where id = p_document_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document was not found';
  end if;

  update public.documents
  set
    title = case when p_patch ? 'title' then p_patch ->> 'title' else target_document.title end,
    document_type = case when p_patch ? 'documentType' then p_patch ->> 'documentType' else target_document.document_type end,
    issuing_entity = case when p_patch ? 'issuingEntity' then p_patch ->> 'issuingEntity' else target_document.issuing_entity end,
    issuance_year = case when p_patch ? 'issuanceYear' then (p_patch ->> 'issuanceYear')::smallint else target_document.issuance_year end,
    resolution_number = case when p_patch ? 'resolutionNumber' then p_patch ->> 'resolutionNumber' else target_document.resolution_number end,
    article_reference = case when p_patch ? 'articleReference' then p_patch ->> 'articleReference' else target_document.article_reference end,
    metadata = case when p_patch ? 'metadata' then p_patch -> 'metadata' else target_document.metadata end,
    updated_by = p_actor_id
  where id = p_document_id
  returning * into target_document;

  insert into public.document_audit_events (
    document_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    'metadata_updated',
    p_patch,
    p_actor_id
  );

  return target_document;
end;
$$;

create function public.set_document_publication_status(
  p_document_id uuid,
  p_is_active boolean,
  p_reason text,
  p_actor_id uuid
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
begin
  select * into target_document
  from public.documents
  where id = p_document_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document was not found';
  end if;

  if not p_is_active and (p_reason is null or char_length(btrim(p_reason)) not between 2 and 500) then
    raise exception using
      errcode = '22023',
      message = 'An inactive document requires a reason';
  end if;

  update public.documents
  set
    publication_status = case when p_is_active then 'active'::public.document_publication_status else 'inactive'::public.document_publication_status end,
    deactivated_at = case when p_is_active then null else now() end,
    deactivated_by = case when p_is_active then null else p_actor_id end,
    deactivation_reason = case when p_is_active then null else p_reason end,
    updated_by = p_actor_id
  where id = p_document_id
  returning * into target_document;

  insert into public.document_audit_events (
    document_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    case when p_is_active then 'activated'::public.document_audit_action else 'deactivated'::public.document_audit_action end,
    case when p_is_active then '{}'::jsonb else jsonb_build_object('reason', p_reason) end,
    p_actor_id
  );

  return target_document;
end;
$$;

create function public.logically_delete_document(
  p_document_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 2 and 500 then
    raise exception using
      errcode = '22023',
      message = 'Logical document deletion requires a reason';
  end if;

  select * into target_document
  from public.documents
  where id = p_document_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document was not found';
  end if;

  update public.documents
  set
    publication_status = 'inactive',
    deactivated_at = now(),
    deactivated_by = p_actor_id,
    deactivation_reason = p_reason,
    is_deleted = true,
    deleted_at = now(),
    deleted_by = p_actor_id,
    deletion_reason = p_reason,
    updated_by = p_actor_id
  where id = p_document_id;

  insert into public.document_audit_events (
    document_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    'logically_deleted',
    jsonb_build_object('reason', p_reason),
    p_actor_id
  );
end;
$$;

create function public.link_document_module(
  p_document_id uuid,
  p_module_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
  from public.documents
  where id = p_document_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document was not found';
  end if;

  if not exists (
    select 1
    from public.modules
    where id = p_module_id
      and not is_deleted
  ) then
    raise exception using
      errcode = '23503',
      message = 'Module was not found';
  end if;

  insert into public.document_modules (document_id, module_id, created_by)
  values (p_document_id, p_module_id, p_actor_id);

  insert into public.document_audit_events (
    document_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    'module_linked',
    jsonb_build_object('moduleId', p_module_id),
    p_actor_id
  );
end;
$$;

create function public.unlink_document_module(
  p_document_id uuid,
  p_module_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform 1
  from public.documents
  where id = p_document_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document was not found';
  end if;

  delete from public.document_modules
  where document_id = p_document_id
    and module_id = p_module_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document module link was not found';
  end if;

  insert into public.document_audit_events (
    document_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    'module_unlinked',
    jsonb_build_object('moduleId', p_module_id),
    p_actor_id
  );
end;
$$;

revoke all on function public.create_document_with_initial_version(uuid, uuid, text, text, text, smallint, text, text, jsonb, uuid[], text, text, bigint, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.add_document_version(uuid, uuid, text, text, bigint, integer, text, uuid) from public, anon, authenticated;
revoke all on function public.update_document_metadata(uuid, jsonb, uuid) from public, anon, authenticated;
revoke all on function public.set_document_publication_status(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.logically_delete_document(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.link_document_module(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.unlink_document_module(uuid, uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_document_with_initial_version(uuid, uuid, text, text, text, smallint, text, text, jsonb, uuid[], text, text, bigint, integer, text, uuid) to service_role;
grant execute on function public.add_document_version(uuid, uuid, text, text, bigint, integer, text, uuid) to service_role;
grant execute on function public.update_document_metadata(uuid, jsonb, uuid) to service_role;
grant execute on function public.set_document_publication_status(uuid, boolean, text, uuid) to service_role;
grant execute on function public.logically_delete_document(uuid, text, uuid) to service_role;
grant execute on function public.link_document_module(uuid, uuid, uuid) to service_role;
grant execute on function public.unlink_document_module(uuid, uuid, uuid) to service_role;
