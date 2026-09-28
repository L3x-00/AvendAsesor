-- El acceso firmado ya distinguía apertura (inline) de descarga (attachment),
-- pero no se registraba. Se guarda esa intención en la auditoría y se exponen
-- contadores reales por documento para el panel administrativo.
-- Se conserva la firma de 3 argumentos (delegando) para no romper llamadas
-- desplegadas durante la ventana de despliegue.

create or replace function public.record_document_download_url(
  p_document_id uuid,
  p_document_version_id uuid,
  p_actor_id uuid,
  p_disposition text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_disposition is not null
    and p_disposition not in ('inline', 'attachment') then
    raise exception using
      errcode = '22023',
      message = 'The document disposition is invalid';
  end if;

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
    jsonb_build_object('ttlSeconds', 60, 'disposition', p_disposition),
    p_actor_id
  );
end;
$$;

create or replace function public.record_document_download_url(
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
  perform public.record_document_download_url(
    p_document_id,
    p_document_version_id,
    p_actor_id,
    null
  );
end;
$$;

revoke all on function public.record_document_download_url(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.record_document_download_url(uuid, uuid, uuid, text)
  to service_role;

revoke all on function public.record_document_download_url(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.record_document_download_url(uuid, uuid, uuid)
  to service_role;

create function public.get_document_usage_counters(p_document_id uuid)
returns table (
  opens integer,
  downloads integer,
  last_download_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select
    count(*) filter (
      where coalesce(usage.details ->> 'disposition', 'inline') <> 'attachment'
    )::integer as opens,
    count(*) filter (
      where usage.details ->> 'disposition' = 'attachment'
    )::integer as downloads,
    max(usage.occurred_at) filter (
      where usage.details ->> 'disposition' = 'attachment'
    ) as last_download_at
  from public.document_audit_events as usage
  where usage.document_id = p_document_id
    and usage.action = 'download_url_generated';
$$;

revoke all on function public.get_document_usage_counters(uuid)
  from public, anon, authenticated;
grant execute on function public.get_document_usage_counters(uuid)
  to service_role;
