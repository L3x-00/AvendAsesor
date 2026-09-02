-- TSK-0031: constraints, indexes and RPCs for the document library.
-- Kept in a separate transaction because the compatibility UPDATE in the
-- previous migration can leave pending foreign-key trigger events.
-- Object guards also support environments where the original monolithic
-- migration was already applied before this transactional split.

alter table public.documents
  alter column situation set not null;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_replacement_document_fkey'
  ) then
    alter table public.documents
      add constraint documents_replacement_document_fkey
      foreign key (replacement_document_id)
      references public.documents (id)
      on delete restrict;
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_replacement_not_self_check'
  ) then
    alter table public.documents
      add constraint documents_replacement_not_self_check check (
        replacement_document_id is null or replacement_document_id <> id
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_replacement_year_check'
  ) then
    alter table public.documents
      add constraint documents_replacement_year_check check (
        replacement_year is null or replacement_year between 1800 and 2200
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_replacement_reason_check'
  ) then
    alter table public.documents
      add constraint documents_replacement_reason_check check (
        replacement_reason is null
        or char_length(btrim(replacement_reason)) between 2 and 500
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_replacement_observation_check'
  ) then
    alter table public.documents
      add constraint documents_replacement_observation_check check (
        replacement_observation is null
        or char_length(btrim(replacement_observation)) between 2 and 1000
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_replacement_date_year_check'
  ) then
    alter table public.documents
      add constraint documents_replacement_date_year_check check (
        replacement_date is null
        or replacement_year is null
        or extract(year from replacement_date)::integer = replacement_year
      );
  end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.documents'::regclass
      and conname = 'documents_situation_publication_check'
  ) then
    alter table public.documents
      add constraint documents_situation_publication_check check (
        (
          situation = 'current'
          and publication_status = 'active'
          and replacement_document_id is null
          and replacement_date is null
          and replacement_year is null
          and replacement_reason is null
          and replacement_observation is null
        )
        or (
          situation = 'archived'
          and publication_status = 'inactive'
          and replacement_document_id is null
          and replacement_date is null
          and replacement_year is null
          and replacement_reason is null
          and replacement_observation is null
        )
        or (
          situation = 'replaced'
          and publication_status = 'inactive'
          and replacement_reason is not null
          and (replacement_date is not null or replacement_year is not null)
        )
      );
  end if;
end;
$$;

create index if not exists documents_replacement_document_idx
  on public.documents (replacement_document_id)
  where replacement_document_id is not null;

create index if not exists documents_library_situation_created_idx
  on public.documents (situation, created_at desc, id)
  where not is_deleted;

create index if not exists documents_library_year_created_idx
  on public.documents (issuance_year desc, created_at desc, id)
  where not is_deleted;

create index if not exists documents_library_type_created_idx
  on public.documents (document_type, created_at desc, id)
  where not is_deleted;

create index if not exists documents_library_entity_idx
  on public.documents (lower(issuing_entity), id)
  where not is_deleted and issuing_entity is not null;

create index if not exists documents_library_search_idx
  on public.documents using gin (search_vector);

create or replace function private.prevent_document_replacement_cycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.replacement_document_id is null then
    return new;
  end if;

  if new.replacement_document_id = new.id then
    raise exception using
      errcode = '23514',
      message = 'A document cannot replace itself';
  end if;

  if exists (
    with recursive replacement_chain as (
      select document.id, document.replacement_document_id
      from public.documents as document
      where document.id = new.replacement_document_id

      union all

      select document.id, document.replacement_document_id
      from public.documents as document
      join replacement_chain as chain
        on document.id = chain.replacement_document_id
    )
    select 1
    from replacement_chain
    where id = new.id
  ) then
    raise exception using
      errcode = '23514',
      message = 'A document replacement cycle is not allowed';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_document_replacement_cycle() from public;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger
    where tgrelid = 'public.documents'::regclass
      and tgname = 'documents_prevent_replacement_cycles'
      and not tgisinternal
  ) then
    create trigger documents_prevent_replacement_cycles
    before insert or update of replacement_document_id on public.documents
    for each row execute procedure private.prevent_document_replacement_cycle();
  end if;
end;
$$;

create or replace function public.set_document_situation(
  p_document_id uuid,
  p_situation public.document_situation,
  p_actor_id uuid,
  p_reason text default null,
  p_replacement_document_id uuid default null,
  p_replacement_date date default null,
  p_replacement_year smallint default null,
  p_observation text default null
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_document public.documents%rowtype;
  replacement_document public.documents%rowtype;
begin
  if p_situation is null then
    raise exception using
      errcode = '22023',
      message = 'Document situation is required';
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

  if target_document.situation = p_situation then
    raise exception using
      errcode = '22023',
      message = 'Document situation is unchanged';
  end if;

  if p_situation = 'current' then
    if p_reason is not null
      or p_replacement_document_id is not null
      or p_replacement_date is not null
      or p_replacement_year is not null
      or p_observation is not null then
      raise exception using
        errcode = '22023',
        message = 'A current document cannot contain replacement data';
    end if;
  elsif p_situation = 'archived' then
    if p_reason is null or char_length(btrim(p_reason)) not between 2 and 500 then
      raise exception using
        errcode = '22023',
        message = 'An archived document requires a reason';
    end if;

    if p_replacement_document_id is not null
      or p_replacement_date is not null
      or p_replacement_year is not null
      or p_observation is not null then
      raise exception using
        errcode = '22023',
        message = 'An archived document cannot contain replacement data';
    end if;
  else
    if p_reason is null or char_length(btrim(p_reason)) not between 2 and 500 then
      raise exception using
        errcode = '22023',
        message = 'A replaced document requires a reason';
    end if;

    if p_replacement_date is null and p_replacement_year is null then
      raise exception using
        errcode = '22023',
        message = 'A replaced document requires a replacement date or year';
    end if;

    if p_replacement_year is not null and p_replacement_year not between 1800 and 2200 then
      raise exception using
        errcode = '22023',
        message = 'Replacement year is invalid';
    end if;

    if p_replacement_date is not null
      and p_replacement_year is not null
      and extract(year from p_replacement_date)::integer <> p_replacement_year then
      raise exception using
        errcode = '22023',
        message = 'Replacement date and year do not match';
    end if;

    if p_observation is not null
      and char_length(btrim(p_observation)) not between 2 and 1000 then
      raise exception using
        errcode = '22023',
        message = 'Replacement observation is invalid';
    end if;

    if p_replacement_document_id is not null then
      select * into replacement_document
      from public.documents
      where id = p_replacement_document_id
        and not is_deleted
        and situation = 'current';

      if not found then
        raise exception using
          errcode = '23503',
          message = 'Replacement document is unavailable';
      end if;
    end if;
  end if;

  update public.documents
  set
    situation = p_situation,
    publication_status = case
      when p_situation = 'current' then 'active'::public.document_publication_status
      else 'inactive'::public.document_publication_status
    end,
    deactivated_at = case when p_situation = 'current' then null else now() end,
    deactivated_by = case when p_situation = 'current' then null else p_actor_id end,
    deactivation_reason = case when p_situation = 'current' then null else btrim(p_reason) end,
    replacement_document_id = case when p_situation = 'replaced' then p_replacement_document_id else null end,
    replacement_date = case when p_situation = 'replaced' then p_replacement_date else null end,
    replacement_year = case when p_situation = 'replaced' then p_replacement_year else null end,
    replacement_reason = case when p_situation = 'replaced' then btrim(p_reason) else null end,
    replacement_observation = case when p_situation = 'replaced' then btrim(p_observation) else null end,
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
    case
      when p_situation = 'current' then 'activated'::public.document_audit_action
      else 'deactivated'::public.document_audit_action
    end,
    jsonb_strip_nulls(jsonb_build_object(
      'situation', p_situation,
      'reason', p_reason,
      'replacementDocumentId', p_replacement_document_id,
      'replacementDate', p_replacement_date,
      'replacementYear', p_replacement_year,
      'observation', p_observation
    )),
    p_actor_id
  );

  return target_document;
end;
$$;

create or replace function public.set_document_publication_status(
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
begin
  return public.set_document_situation(
    p_document_id,
    case
      when p_is_active then 'current'::public.document_situation
      else 'archived'::public.document_situation
    end,
    p_actor_id,
    case when p_is_active then null else p_reason end,
    null,
    null,
    null,
    null
  );
end;
$$;

create or replace function public.logically_delete_document(
  p_document_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 2 and 500 then
    raise exception using
      errcode = '22023',
      message = 'Logical document deletion requires a reason';
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

  update public.documents
  set
    situation = 'archived',
    publication_status = 'inactive',
    deactivated_at = now(),
    deactivated_by = p_actor_id,
    deactivation_reason = btrim(p_reason),
    replacement_document_id = null,
    replacement_date = null,
    replacement_year = null,
    replacement_reason = null,
    replacement_observation = null,
    is_deleted = true,
    deleted_at = now(),
    deleted_by = p_actor_id,
    deletion_reason = btrim(p_reason),
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
    jsonb_build_object('reason', btrim(p_reason)),
    p_actor_id
  );
end;
$$;

create or replace function public.list_document_library(
  p_query text default null,
  p_issuance_year smallint default null,
  p_document_type text default null,
  p_issuing_entity text default null,
  p_module_id uuid default null,
  p_submodule_id uuid default null,
  p_situation public.document_situation default null,
  p_technical_status text default null,
  p_sort text default 'newest',
  p_limit integer default 25,
  p_offset integer default 0
)
returns table (
  id uuid,
  title text,
  document_type text,
  issuing_entity text,
  issuance_year smallint,
  resolution_number text,
  article_reference text,
  publication_status public.document_publication_status,
  situation public.document_situation,
  replacement_document_id uuid,
  replacement_date date,
  replacement_year smallint,
  replacement_reason text,
  replacement_observation text,
  current_version_id uuid,
  metadata jsonb,
  created_at timestamptz,
  created_by uuid,
  created_by_name text,
  updated_at timestamptz,
  updated_by uuid,
  current_version_ingestion_status public.document_ingestion_status,
  current_version_uploaded_at timestamptz,
  module_associations jsonb,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  normalized_query text := nullif(btrim(p_query), '');
  search_query tsquery;
begin
  if normalized_query is not null and char_length(normalized_query) > 200 then
    raise exception using errcode = '22023', message = 'Search query is too long';
  end if;

  if p_technical_status is not null
    and p_technical_status not in ('ready', 'pending_approval', 'error') then
    raise exception using errcode = '22023', message = 'Technical status is invalid';
  end if;

  if p_sort not in ('newest', 'oldest', 'year', 'title', 'upload_date') then
    raise exception using errcode = '22023', message = 'Document sort is invalid';
  end if;

  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Pagination is invalid';
  end if;

  if normalized_query is not null then
    search_query := websearch_to_tsquery('spanish', normalized_query);
  end if;

  return query
  with recursive module_filter as (
    select module.id
    from public.modules as module
    where p_module_id is not null
      and module.id = p_module_id
      and not module.is_deleted

    union all

    select child.id
    from public.modules as child
    join module_filter as parent on child.parent_module_id = parent.id
    where not child.is_deleted
  ),
  candidates as (
    select
      document.id,
      document.title,
      document.document_type,
      document.issuing_entity,
      document.issuance_year,
      document.resolution_number,
      document.article_reference,
      document.publication_status,
      document.situation,
      document.replacement_document_id,
      document.replacement_date,
      document.replacement_year,
      document.replacement_reason,
      document.replacement_observation,
      document.current_version_id,
      document.metadata,
      document.created_at,
      document.created_by,
      profile.full_name as created_by_name,
      document.updated_at,
      document.updated_by,
      version.ingestion_status as current_version_ingestion_status,
      version.uploaded_at as current_version_uploaded_at,
      case
        when version.id is null or version.ingestion_status = 'failed' then 'error'
        when version.ingestion_status = 'indexed' then 'ready'
        else 'pending_approval'
      end as derived_technical_status,
      coalesce(associations.items, '[]'::jsonb) as module_associations
    from public.documents as document
    left join public.document_versions as version
      on version.id = document.current_version_id
      and version.document_id = document.id
    left join public.profiles as profile on profile.id = document.created_by
    left join lateral (
      select jsonb_agg(
        jsonb_build_object(
          'linked_module_id', linked.id,
          'linked_module_name', linked.name,
          'module_id', coalesce(parent.id, linked.id),
          'module_name', coalesce(parent.name, linked.name),
          'submodule_id', case when parent.id is null then null else linked.id end,
          'submodule_name', case when parent.id is null then null else linked.name end
        )
        order by coalesce(parent.sort_order, linked.sort_order),
          coalesce(parent.name, linked.name), linked.sort_order, linked.name, linked.id
      ) as items
      from public.document_modules as relation
      join public.modules as linked
        on linked.id = relation.module_id
        and not linked.is_deleted
      left join public.modules as parent
        on parent.id = linked.parent_module_id
        and not parent.is_deleted
      where relation.document_id = document.id
    ) as associations on true
    where not document.is_deleted
      and (normalized_query is null or document.search_vector @@ search_query)
      and (p_issuance_year is null or document.issuance_year = p_issuance_year)
      and (p_document_type is null or document.document_type = p_document_type)
      and (p_issuing_entity is null or lower(document.issuing_entity) = lower(p_issuing_entity))
      and (p_situation is null or document.situation = p_situation)
      and (
        p_module_id is null
        or exists (
          select 1
          from public.document_modules as relation
          join module_filter on module_filter.id = relation.module_id
          where relation.document_id = document.id
        )
      )
      and (
        p_submodule_id is null
        or exists (
          select 1
          from public.document_modules as relation
          where relation.document_id = document.id
            and relation.module_id = p_submodule_id
        )
      )
  ),
  filtered as (
    select *
    from candidates
    where p_technical_status is null
      or derived_technical_status = p_technical_status
  )
  select
    filtered.id,
    filtered.title,
    filtered.document_type,
    filtered.issuing_entity,
    filtered.issuance_year,
    filtered.resolution_number,
    filtered.article_reference,
    filtered.publication_status,
    filtered.situation,
    filtered.replacement_document_id,
    filtered.replacement_date,
    filtered.replacement_year,
    filtered.replacement_reason,
    filtered.replacement_observation,
    filtered.current_version_id,
    filtered.metadata,
    filtered.created_at,
    filtered.created_by,
    filtered.created_by_name,
    filtered.updated_at,
    filtered.updated_by,
    filtered.current_version_ingestion_status,
    filtered.current_version_uploaded_at,
    filtered.module_associations,
    count(*) over () as total_count
  from filtered
  order by
    case when p_sort = 'newest' then filtered.current_version_uploaded_at end desc nulls last,
    case when p_sort = 'oldest' then filtered.current_version_uploaded_at end asc nulls last,
    case when p_sort = 'year' then filtered.issuance_year end desc nulls last,
    case when p_sort = 'title' then lower(filtered.title) end asc nulls last,
    case when p_sort = 'upload_date' then filtered.created_at end desc nulls last,
    filtered.id
  limit p_limit
  offset p_offset;
end;
$$;

revoke all on function private.prevent_document_replacement_cycle() from public;
revoke all on function public.set_document_situation(uuid, public.document_situation, uuid, text, uuid, date, smallint, text) from public, anon, authenticated;
revoke all on function public.set_document_publication_status(uuid, boolean, text, uuid) from public, anon, authenticated;
revoke all on function public.logically_delete_document(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.list_document_library(text, smallint, text, text, uuid, uuid, public.document_situation, text, text, integer, integer) from public, anon, authenticated;

grant execute on function public.set_document_situation(uuid, public.document_situation, uuid, text, uuid, date, smallint, text) to service_role;
grant execute on function public.set_document_publication_status(uuid, boolean, text, uuid) to service_role;
grant execute on function public.logically_delete_document(uuid, text, uuid) to service_role;
grant execute on function public.list_document_library(text, smallint, text, text, uuid, uuid, public.document_situation, text, text, integer, integer) to service_role;
