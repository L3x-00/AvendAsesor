-- Descargas exhaustivas del catálogo: autoriza la versión aprobada e indexada
-- sin depender de que el documento haya aparecido en el top-k del RAG.

create table public.chat_catalog_access_events (
  id uuid primary key default gen_random_uuid(),
  document_version_id uuid not null
    references public.document_versions (id) on delete restrict,
  user_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index chat_catalog_access_events_version_occurred_idx
  on public.chat_catalog_access_events (document_version_id, occurred_at desc);

create index chat_catalog_access_events_user_occurred_idx
  on public.chat_catalog_access_events (user_id, occurred_at desc);

alter table public.chat_catalog_access_events enable row level security;

revoke all on table public.chat_catalog_access_events
  from public, anon, authenticated, service_role;
grant select on table public.chat_catalog_access_events to service_role;

create function public.authorize_chat_catalog_download(
  p_user_id uuid,
  p_document_version_id uuid
)
returns table (
  document_version_id uuid,
  storage_bucket text,
  storage_path text,
  original_file_name text,
  mime_type text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  authorized_version_id uuid;
  authorized_bucket text;
  authorized_path text;
  authorized_file_name text;
  authorized_mime_type text;
begin
  if p_user_id is null or p_document_version_id is null then
    raise exception using
      errcode = '22023',
      message = 'A chat user and document version are required';
  end if;

  select
    version.id,
    version.storage_bucket,
    version.storage_path,
    version.original_file_name,
    version.mime_type
  into
    authorized_version_id,
    authorized_bucket,
    authorized_path,
    authorized_file_name,
    authorized_mime_type
  from public.profiles as profile
  cross join public.document_versions as version
  join public.documents as document
    on document.id = version.document_id
    and document.approved_version_id = version.id
  where profile.id = p_user_id
    and profile.role in ('docente', 'admin', 'superadmin')
    and profile.account_status = 'active'
    and (
      profile.access_expires_at is null
      or profile.access_expires_at >= now()
    )
    and version.id = p_document_version_id
    and version.ingestion_status = 'indexed'
    and not document.is_deleted
    and document.situation = 'current'
    and document.publication_status = 'active'
    and not coalesce(document.metadata ? 'demoSeed', false)
    and exists (
      select 1
      from public.document_modules as document_module
      join public.modules as module
        on module.id = document_module.module_id
      left join public.modules as parent
        on parent.id = module.parent_module_id
      where document_module.document_id = document.id
        and module.is_active
        and not module.is_deleted
        and (
          parent.id is null
          or (parent.is_active and not parent.is_deleted)
        )
    );

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Chat catalog document was not found';
  end if;

  insert into public.chat_catalog_access_events (
    document_version_id,
    user_id
  )
  values (authorized_version_id, p_user_id);

  return query
  select
    authorized_version_id,
    authorized_bucket,
    authorized_path,
    authorized_file_name,
    authorized_mime_type;
end;
$$;

revoke all on function public.authorize_chat_catalog_download(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.authorize_chat_catalog_download(uuid, uuid)
  to service_role;
