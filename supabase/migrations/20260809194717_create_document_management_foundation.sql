create type public.document_publication_status as enum ('active', 'inactive');

create type public.document_ingestion_status as enum ('pending');

create type public.document_audit_action as enum (
  'created',
  'metadata_updated',
  'version_added',
  'activated',
  'deactivated',
  'logically_deleted',
  'restored',
  'module_linked',
  'module_unlinked'
);

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  parent_module_id uuid references public.modules (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 2 and 255),
  code text not null check (code ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  description text,
  sort_order integer not null default 0 check (sort_order >= 0),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  is_active boolean not null default true,
  deactivated_at timestamptz,
  -- Audit actor identifiers deliberately have no FK: a future SUPERADMIN may
  -- permanently remove an account without erasing or invalidating history.
  deactivated_by uuid,
  deactivation_reason text check (
    deactivation_reason is null or char_length(btrim(deactivation_reason)) between 2 and 500
  ),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text check (
    deletion_reason is null or char_length(btrim(deletion_reason)) between 2 and 500
  ),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint modules_code_key unique (code),
  constraint modules_deactivation_audit_check check (
    (is_active and deactivated_at is null and deactivated_by is null and deactivation_reason is null)
    or (not is_active and deactivated_at is not null and deactivated_by is not null)
  ),
  constraint modules_logical_deletion_audit_check check (
    (not is_deleted and deleted_at is null and deleted_by is null and deletion_reason is null)
    or (is_deleted and deleted_at is not null and deleted_by is not null and not is_active)
  )
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 2 and 500),
  document_type text not null check (document_type ~ '^[A-Z][A-Z0-9_]{1,63}$'),
  issuing_entity text check (
    issuing_entity is null or char_length(btrim(issuing_entity)) between 2 and 255
  ),
  issuance_year smallint check (issuance_year is null or issuance_year between 1800 and 2200),
  resolution_number text check (
    resolution_number is null or char_length(btrim(resolution_number)) between 1 and 120
  ),
  article_reference text check (
    article_reference is null or char_length(btrim(article_reference)) between 1 and 120
  ),
  publication_status public.document_publication_status not null default 'active',
  deactivated_at timestamptz,
  deactivated_by uuid,
  deactivation_reason text check (
    deactivation_reason is null or char_length(btrim(deactivation_reason)) between 2 and 500
  ),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text check (
    deletion_reason is null or char_length(btrim(deletion_reason)) between 2 and 500
  ),
  current_version_id uuid,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  constraint documents_deactivation_audit_check check (
    (publication_status = 'active' and deactivated_at is null and deactivated_by is null and deactivation_reason is null)
    or (publication_status = 'inactive' and deactivated_at is not null and deactivated_by is not null)
  ),
  constraint documents_logical_deletion_audit_check check (
    (not is_deleted and deleted_at is null and deleted_by is null and deletion_reason is null)
    or (
      is_deleted
      and deleted_at is not null
      and deleted_by is not null
      and publication_status = 'inactive'
    )
  )
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  storage_bucket text not null default 'normative-documents' check (storage_bucket = 'normative-documents'),
  storage_path text not null check (char_length(btrim(storage_path)) between 1 and 1_024),
  original_file_name text not null check (char_length(btrim(original_file_name)) between 1 and 255),
  mime_type text not null check (mime_type = 'application/pdf'),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 20_971_520),
  page_count integer not null check (page_count between 1 and 300),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  ingestion_status public.document_ingestion_status not null default 'pending',
  ingestion_updated_at timestamptz not null default now(),
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid,
  constraint document_versions_document_version_number_key unique (document_id, version_number),
  constraint document_versions_document_id_id_key unique (document_id, id),
  constraint document_versions_storage_path_key unique (storage_path)
);

alter table public.documents
  add constraint documents_current_version_belongs_to_document_fkey
  foreign key (id, current_version_id)
  references public.document_versions (document_id, id)
  deferrable initially deferred;

create table public.document_modules (
  document_id uuid not null references public.documents (id) on delete restrict,
  module_id uuid not null references public.modules (id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid,
  primary key (document_id, module_id)
);

create table public.document_audit_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  document_version_id uuid,
  action public.document_audit_action not null,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  occurred_at timestamptz not null default now(),
  actor_id uuid,
  constraint document_audit_events_version_belongs_to_document_fkey
    foreign key (document_id, document_version_id)
    references public.document_versions (document_id, id)
    deferrable initially immediate
);

create index modules_active_hierarchy_order_idx
  on public.modules (parent_module_id, sort_order, name)
  where not is_deleted;

create index documents_current_version_idx on public.documents (current_version_id);

create index documents_active_type_year_idx
  on public.documents (document_type, issuance_year desc)
  where not is_deleted and publication_status = 'active';

create index document_versions_document_version_idx
  on public.document_versions (document_id, version_number desc);

create index document_versions_pending_ingestion_idx
  on public.document_versions (uploaded_at)
  where ingestion_status = 'pending';

create index document_modules_module_document_idx
  on public.document_modules (module_id, document_id);

create index document_audit_events_document_occurred_idx
  on public.document_audit_events (document_id, occurred_at desc);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create function private.prevent_module_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_module_id is null then
    return new;
  end if;

  if new.parent_module_id = new.id then
    raise exception 'A module cannot be its own parent';
  end if;

  if exists (
    with recursive ancestors as (
      select id, parent_module_id
      from public.modules
      where id = new.parent_module_id

      union all

      select parent.id, parent.parent_module_id
      from public.modules as parent
      join ancestors on parent.id = ancestors.parent_module_id
    )
    select 1 from ancestors where id = new.id
  ) then
    raise exception 'A module cannot be assigned below one of its descendants';
  end if;

  return new;
end;
$$;

create function private.prevent_document_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
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
    -- Hito 2 creates only the initial pending state. Hito 3 must replace this
    -- guard explicitly when it introduces a controlled ingestion workflow.
    or new.ingestion_status is distinct from old.ingestion_status
    or new.ingestion_updated_at is distinct from old.ingestion_updated_at
    or new.uploaded_at is distinct from old.uploaded_at
    or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'Document versions are immutable; create a new version instead';
  end if;

  return new;
end;
$$;

create function private.require_active_document_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.documents as document
    where document.id = new.id
      and document.publication_status = 'active'
      and document.current_version_id is null
  ) then
    raise exception 'An active document must reference a current version';
  end if;

  return null;
end;
$$;

create function private.prevent_document_version_deletion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Document versions cannot be deleted';
end;
$$;

create function private.prevent_document_audit_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Document audit events are append-only';
end;
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.prevent_module_cycle() from public;
revoke all on function private.prevent_document_version_mutation() from public;
revoke all on function private.require_active_document_version() from public;
revoke all on function private.prevent_document_version_deletion() from public;
revoke all on function private.prevent_document_audit_event_mutation() from public;

create trigger modules_set_updated_at
before update on public.modules
for each row execute procedure private.set_updated_at();

create trigger modules_prevent_cycles
before insert or update of parent_module_id on public.modules
for each row execute procedure private.prevent_module_cycle();

create trigger documents_set_updated_at
before update on public.documents
for each row execute procedure private.set_updated_at();

create constraint trigger documents_require_current_version_when_active
after insert or update on public.documents
deferrable initially deferred
for each row execute procedure private.require_active_document_version();

create trigger document_versions_prevent_mutation
before update on public.document_versions
for each row execute procedure private.prevent_document_version_mutation();

create trigger document_versions_prevent_deletion
before delete on public.document_versions
for each row execute procedure private.prevent_document_version_deletion();

create trigger document_audit_events_append_only
before update or delete on public.document_audit_events
for each row execute procedure private.prevent_document_audit_event_mutation();

alter table public.modules enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.document_modules enable row level security;
alter table public.document_audit_events enable row level security;

revoke all on table public.modules from public;
revoke all on table public.documents from public;
revoke all on table public.document_versions from public;
revoke all on table public.document_modules from public;
revoke all on table public.document_audit_events from public;

revoke all on table public.modules from anon, authenticated;
revoke all on table public.documents from anon, authenticated;
revoke all on table public.document_versions from anon, authenticated;
revoke all on table public.document_modules from anon, authenticated;
revoke all on table public.document_audit_events from anon, authenticated;

grant all on table public.modules to service_role;
grant all on table public.documents to service_role;
grant all on table public.document_versions to service_role;
grant all on table public.document_modules to service_role;
grant all on table public.document_audit_events to service_role;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'normative-documents',
  'normative-documents',
  false,
  20_971_520,
  array['application/pdf']::text[]
)
on conflict (id) do update
set
  name = excluded.name,
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Normative documents deny anonymous Storage access"
on storage.objects
as restrictive
for all
to anon
using (bucket_id <> 'normative-documents')
with check (bucket_id <> 'normative-documents');

create policy "Normative documents deny direct authenticated Storage access"
on storage.objects
as restrictive
for all
to authenticated
using (bucket_id <> 'normative-documents')
with check (bucket_id <> 'normative-documents');
