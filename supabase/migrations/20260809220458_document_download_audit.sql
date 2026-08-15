alter type public.document_audit_action
  add value if not exists 'download_url_generated';

create function public.record_document_download_url(
  p_document_id uuid,
  p_document_version_id uuid,
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
    from public.document_versions
    where document_id = p_document_id
      and id = p_document_version_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'Document version was not found';
  end if;

  insert into public.document_audit_events (
    document_id,
    document_version_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    p_document_version_id,
    'download_url_generated',
    jsonb_build_object('ttlSeconds', 60),
    p_actor_id
  );
end;
$$;

revoke all on function public.record_document_download_url(uuid, uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.record_document_download_url(uuid, uuid, uuid)
  to service_role;
