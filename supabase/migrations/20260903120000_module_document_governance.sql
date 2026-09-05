-- TSK-0035: governed module hierarchy and documentary-management contract.
-- The migration preserves every stored PDF and every historical version.

create type public.document_approval_status as enum (
  'pending_approval',
  'ready'
);

create type public.document_archive_reason as enum (
  'NOT_APPLICABLE',
  'DEROGATED_OR_EXPIRED',
  'DUPLICATE',
  'UPLOADED_BY_ERROR',
  'INCOMPLETE_INFORMATION',
  'PENDING_VALIDATION',
  'HISTORICAL_ANTECEDENT',
  'REPLACED_BY_NEWER',
  'OTHER'
);

alter table public.documents
  add column approval_status public.document_approval_status not null default 'pending_approval',
  add column approval_updated_at timestamptz not null default now(),
  add column approval_updated_by uuid,
  add column approved_version_id uuid,
  add column archive_reason_code public.document_archive_reason,
  add column archive_reason_detail text,
  add column archive_observation text;

alter table public.documents
  add constraint documents_approved_version_belongs_to_document_fkey
  foreign key (id, approved_version_id)
  references public.document_versions (document_id, id)
  deferrable initially deferred;

-- Keep old direct writers safe while storing only governed taxonomy values.
-- Administrative RPC/API calls remain strict; this compatibility layer avoids
-- breaking historical ingestion fixtures or integrations during deployment.
create function private.normalize_legacy_document_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.document_type not in (
    'RESOLUCION_MINISTERIAL', 'RESOLUCION_VICEMINISTERIAL',
    'RESOLUCION_DIRECTORAL', 'DECRETO_SUPREMO', 'DECRETO_LEGISLATIVO',
    'LEY', 'REGLAMENTO', 'DIRECTIVA', 'NORMA_TECNICA', 'OFICIO',
    'MEMORANDUM', 'COMUNICADO', 'CRONOGRAMA', 'ANEXO', 'INFORME',
    'INFOGRAFIA', 'OTRO'
  ) then
    new.metadata := new.metadata || jsonb_build_object(
      'documentTypeOther', coalesce(nullif(btrim(new.document_type), ''), 'No especificado')
    );
    new.document_type := 'OTRO';
  end if;

  if upper(btrim(new.issuing_entity)) in (
    'MINEDU', 'MTPE', 'UGEL', 'DRE_GRE', 'SERVIR', 'SUNAFIL', 'MEF',
    'PCM', 'CONGRESO_REPUBLICA', 'TRIBUNAL_CONSTITUCIONAL',
    'DEFENSORIA_PUEBLO', 'GOBIERNO_REGIONAL', 'OTRA_INSTITUCION'
  ) then
    new.issuing_entity := upper(btrim(new.issuing_entity));
  elsif upper(btrim(new.issuing_entity)) = 'DRE/GRE' then
    new.issuing_entity := 'DRE_GRE';
  end if;

  if new.issuing_entity is null or new.issuing_entity not in (
    'MINEDU', 'MTPE', 'UGEL', 'DRE_GRE', 'SERVIR', 'SUNAFIL', 'MEF',
    'PCM', 'CONGRESO_REPUBLICA', 'TRIBUNAL_CONSTITUCIONAL',
    'DEFENSORIA_PUEBLO', 'GOBIERNO_REGIONAL', 'OTRA_INSTITUCION'
  ) then
    new.metadata := new.metadata || jsonb_build_object(
      'issuingEntityOther', coalesce(nullif(btrim(new.issuing_entity), ''), 'No especificada')
    );
    new.issuing_entity := 'OTRA_INSTITUCION';
  end if;

  new.issuance_year := coalesce(
    new.issuance_year,
    extract(year from coalesce(new.created_at, now()))::smallint
  );
  if nullif(btrim(new.metadata ->> 'specificDependency'), '') is null then
    new.metadata := new.metadata || jsonb_build_object(
      'specificDependency', 'No especificada'
    );
  end if;

  if new.document_type = 'OTRO'
    and nullif(btrim(new.metadata ->> 'documentTypeOther'), '') is null
    and tg_op = 'UPDATE'
    and old.document_type = 'OTRO'
  then
    new.metadata := new.metadata || jsonb_build_object(
      'documentTypeOther', old.metadata ->> 'documentTypeOther'
    );
  end if;

  if new.issuing_entity = 'OTRA_INSTITUCION'
    and nullif(btrim(new.metadata ->> 'issuingEntityOther'), '') is null
    and tg_op = 'UPDATE'
    and old.issuing_entity = 'OTRA_INSTITUCION'
  then
    new.metadata := new.metadata || jsonb_build_object(
      'issuingEntityOther', old.metadata ->> 'issuingEntityOther'
    );
  end if;

  if new.situation = 'archived' and new.archive_reason_code is null then
    if nullif(btrim(new.deactivation_reason), '') is null then
      new.archive_reason_code := 'NOT_APPLICABLE';
      new.archive_reason_detail := null;
    else
      new.archive_reason_code := 'OTHER';
      new.archive_reason_detail := btrim(new.deactivation_reason);
    end if;
  elsif new.situation = 'replaced' and new.archive_reason_code is null then
    new.archive_reason_code := 'REPLACED_BY_NEWER';
    new.archive_reason_detail := null;
  end if;

  return new;
end;
$$;

revoke all on function private.normalize_legacy_document_metadata() from public;

create trigger documents_normalize_legacy_metadata
before insert or update of document_type, issuing_entity, issuance_year, metadata
on public.documents
for each row execute procedure private.normalize_legacy_document_metadata();

-- Existing indexed content was already available to the teacher application,
-- therefore it remains approved after the schema is introduced.
update public.documents as document
set
  approval_status = 'ready',
  approval_updated_at = document.updated_at,
  approval_updated_by = document.updated_by,
  approved_version_id = document.current_version_id
from public.document_versions as version
where version.id = document.current_version_id
  and version.document_id = document.id
  and version.ingestion_status = 'indexed';

-- Normalize legacy free-form taxonomy without losing the original value.
update public.documents
set
  metadata = metadata || jsonb_build_object('documentTypeOther', document_type),
  document_type = 'OTRO'
where document_type not in (
  'RESOLUCION_MINISTERIAL', 'RESOLUCION_VICEMINISTERIAL',
  'RESOLUCION_DIRECTORAL', 'DECRETO_SUPREMO', 'DECRETO_LEGISLATIVO',
  'LEY', 'REGLAMENTO', 'DIRECTIVA', 'NORMA_TECNICA', 'OFICIO',
  'MEMORANDUM', 'COMUNICADO', 'CRONOGRAMA', 'ANEXO', 'INFORME',
  'INFOGRAFIA', 'OTRO'
);

update public.documents
set
  metadata = metadata || jsonb_build_object(
    'issuingEntityOther', coalesce(issuing_entity, 'No especificada')
  ),
  issuing_entity = 'OTRA_INSTITUCION'
where issuing_entity is null
  or issuing_entity not in (
    'MINEDU', 'MTPE', 'UGEL', 'DRE_GRE', 'SERVIR', 'SUNAFIL', 'MEF',
    'PCM', 'CONGRESO_REPUBLICA', 'TRIBUNAL_CONSTITUCIONAL',
    'DEFENSORIA_PUEBLO', 'GOBIERNO_REGIONAL', 'OTRA_INSTITUCION'
  );

update public.documents
set
  issuance_year = extract(year from created_at)::smallint
where issuance_year is null;

update public.documents
set metadata = metadata || jsonb_build_object(
  'specificDependency', 'No especificada'
)
where nullif(btrim(metadata ->> 'specificDependency'), '') is null;

alter table public.documents
  add column governed_metadata_search_vector tsvector generated always as (
    setweight(to_tsvector('spanish', coalesce(metadata ->> 'documentTypeOther', '')), 'B')
    || setweight(to_tsvector('spanish', coalesce(metadata ->> 'issuingEntityOther', '')), 'B')
    || setweight(to_tsvector('spanish', coalesce(metadata ->> 'specificDependency', '')), 'B')
    || setweight(to_tsvector('spanish', coalesce(metadata ->> 'additionalDetail', '')), 'C')
  ) stored;

create index documents_governed_metadata_search_idx
  on public.documents using gin (governed_metadata_search_vector);

update public.documents
set archive_reason_code = case
  when situation = 'replaced' then 'REPLACED_BY_NEWER'::public.document_archive_reason
  when situation = 'archived' then 'NOT_APPLICABLE'::public.document_archive_reason
  else null
end
where situation <> 'current';

alter table public.documents
  alter column issuing_entity set not null,
  alter column issuance_year set not null;

alter table public.documents
  add constraint documents_governed_type_check check (
    document_type in (
      'RESOLUCION_MINISTERIAL', 'RESOLUCION_VICEMINISTERIAL',
      'RESOLUCION_DIRECTORAL', 'DECRETO_SUPREMO', 'DECRETO_LEGISLATIVO',
      'LEY', 'REGLAMENTO', 'DIRECTIVA', 'NORMA_TECNICA', 'OFICIO',
      'MEMORANDUM', 'COMUNICADO', 'CRONOGRAMA', 'ANEXO', 'INFORME',
      'INFOGRAFIA', 'OTRO'
    )
  ),
  add constraint documents_governed_entity_check check (
    issuing_entity in (
      'MINEDU', 'MTPE', 'UGEL', 'DRE_GRE', 'SERVIR', 'SUNAFIL', 'MEF',
      'PCM', 'CONGRESO_REPUBLICA', 'TRIBUNAL_CONSTITUCIONAL',
      'DEFENSORIA_PUEBLO', 'GOBIERNO_REGIONAL', 'OTRA_INSTITUCION'
    )
  ),
  add constraint documents_dynamic_metadata_check check (
    nullif(btrim(metadata ->> 'specificDependency'), '') is not null
    and (
      (document_type = 'OTRO' and nullif(btrim(metadata ->> 'documentTypeOther'), '') is not null)
      or (document_type <> 'OTRO' and not (metadata ? 'documentTypeOther'))
    )
    and (
      (issuing_entity = 'OTRA_INSTITUCION' and nullif(btrim(metadata ->> 'issuingEntityOther'), '') is not null)
      or (issuing_entity <> 'OTRA_INSTITUCION' and not (metadata ? 'issuingEntityOther'))
    )
  ),
  add constraint documents_archive_reason_detail_check check (
    archive_reason_detail is null
    or char_length(btrim(archive_reason_detail)) between 2 and 500
  ),
  add constraint documents_archive_observation_check check (
    archive_observation is null
    or char_length(btrim(archive_observation)) between 2 and 1000
  ),
  add constraint documents_approval_version_check check (
    (approval_status = 'pending_approval' and approved_version_id is null)
    or (approval_status = 'ready' and approved_version_id = current_version_id)
    or (approval_status = 'pending_approval' and approved_version_id <> current_version_id)
  );

alter table public.documents drop constraint documents_situation_publication_check;
alter table public.documents
  add constraint documents_situation_publication_check check (
    (
      situation = 'current'
      and publication_status = 'active'
      and archive_reason_code is null
      and archive_reason_detail is null
      and archive_observation is null
      and replacement_document_id is null
      and replacement_date is null
      and replacement_year is null
      and replacement_reason is null
      and replacement_observation is null
    )
    or (
      situation = 'archived'
      and publication_status = 'inactive'
      and archive_reason_code is not null
      and (
        (archive_reason_code = 'OTHER' and archive_reason_detail is not null)
        or (archive_reason_code <> 'OTHER' and archive_reason_detail is null)
      )
      and replacement_document_id is null
      and replacement_date is null
      and replacement_year is null
      and replacement_reason is null
      and replacement_observation is null
    )
    or (
      situation = 'replaced'
      and publication_status = 'inactive'
      and archive_reason_code = 'REPLACED_BY_NEWER'
      and archive_reason_detail is null
      and replacement_reason is not null
      and (replacement_date is not null or replacement_year is not null)
    )
  );

create index documents_approved_version_idx
  on public.documents (approved_version_id)
  where approved_version_id is not null;

create index documents_technical_status_idx
  on public.documents (approval_status, situation, publication_status)
  where not is_deleted;

-- Only two navigational levels are supported: module and submodule.
create or replace function private.enforce_two_level_module_hierarchy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent public.modules%rowtype;
begin
  if new.parent_module_id is not null then
    if new.parent_module_id = new.id then
      raise exception using errcode = '23514', message = 'A module cannot be its own parent';
    end if;

    select * into parent
    from public.modules
    where id = new.parent_module_id
    for update;

    if not found or parent.is_deleted then
      raise exception using errcode = '23503', message = 'The parent module is unavailable';
    end if;

    if parent.parent_module_id is not null then
      raise exception using errcode = '23514', message = 'A submodule cannot contain another submodule';
    end if;

    if (
      (tg_op = 'INSERT' or old.parent_module_id is distinct from new.parent_module_id)
      and exists (
        select 1
        from public.document_modules as relation
        where relation.module_id = parent.id
      )
    ) then
      raise exception using
        errcode = '23514',
        message = 'Move directly associated documents before creating a submodule';
    end if;

    if new.is_active and not parent.is_active then
      raise exception using errcode = '23514', message = 'An active submodule requires an active parent';
    end if;

    if exists (
      select 1 from public.modules as child
      where child.parent_module_id = new.id and not child.is_deleted
    ) then
      raise exception using errcode = '23514', message = 'A module with submodules cannot become a submodule';
    end if;
  end if;

  if tg_op = 'UPDATE'
    and old.is_active
    and not new.is_active
    and exists (
      select 1 from public.modules as child
      where child.parent_module_id = new.id
        and child.is_active
        and not child.is_deleted
    ) then
    raise exception using errcode = '23514', message = 'Deactivate active submodules before deactivating their parent';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_two_level_module_hierarchy() from public;

create trigger modules_restrict_two_level_hierarchy
before insert or update of parent_module_id, is_active on public.modules
for each row execute procedure private.enforce_two_level_module_hierarchy();

create or replace function private.validate_document_module_association()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target public.modules%rowtype;
  parent public.modules%rowtype;
begin
  select * into target
  from public.modules
  where id = new.module_id
  for update;

  if not found or target.is_deleted or not target.is_active then
    raise exception using errcode = '23503', message = 'The selected module is unavailable';
  end if;

  if target.parent_module_id is null then
    if exists (
      select 1 from public.modules as child
      where child.parent_module_id = target.id and not child.is_deleted
    ) then
      raise exception using errcode = '23514', message = 'Documents must be linked to a submodule when submodules exist';
    end if;
  else
    select * into parent from public.modules where id = target.parent_module_id;
    if not found or parent.is_deleted or not parent.is_active then
      raise exception using errcode = '23503', message = 'The selected module hierarchy is unavailable';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.validate_document_module_association() from public;

create trigger document_modules_validate_association
before insert or update of module_id on public.document_modules
for each row execute procedure private.validate_document_module_association();

create function public.list_module_summaries(p_status text default 'all')
returns table (
  id uuid,
  parent_module_id uuid,
  name text,
  code text,
  description text,
  sort_order integer,
  metadata jsonb,
  is_active boolean,
  deactivated_at timestamptz,
  deactivated_by uuid,
  deactivation_reason text,
  is_deleted boolean,
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text,
  created_at timestamptz,
  created_by uuid,
  updated_at timestamptz,
  updated_by uuid,
  submodule_count bigint,
  document_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_status not in ('active', 'inactive', 'all') then
    raise exception using errcode = '22023', message = 'Module status filter is invalid';
  end if;

  return query
  select
    module.id,
    module.parent_module_id,
    module.name,
    module.code,
    module.description,
    module.sort_order,
    module.metadata,
    module.is_active,
    module.deactivated_at,
    module.deactivated_by,
    module.deactivation_reason,
    module.is_deleted,
    module.deleted_at,
    module.deleted_by,
    module.deletion_reason,
    module.created_at,
    module.created_by,
    module.updated_at,
    module.updated_by,
    (
      select count(*)
      from public.modules as child
      where child.parent_module_id = module.id and not child.is_deleted
    )::bigint,
    (
      select count(distinct relation.document_id)
      from public.document_modules as relation
      join public.documents as document
        on document.id = relation.document_id and not document.is_deleted
      where relation.module_id = module.id
        or (
          module.parent_module_id is null
          and relation.module_id in (
            select child.id from public.modules as child
            where child.parent_module_id = module.id and not child.is_deleted
          )
        )
    )::bigint
  from public.modules as module
  where not module.is_deleted
    and (p_status = 'all' or module.is_active = (p_status = 'active'))
  order by module.parent_module_id nulls first, module.sort_order, module.name, module.id;
end;
$$;

revoke all on function public.list_module_summaries(text) from public, anon, authenticated;
grant execute on function public.list_module_summaries(text) to service_role;

create function public.list_document_value_suggestions()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with dependencies as (
    select btrim(document.metadata ->> 'specificDependency') as value, count(*) as uses
    from public.documents as document
    where not document.is_deleted
      and nullif(btrim(document.metadata ->> 'specificDependency'), '') is not null
      and lower(btrim(document.metadata ->> 'specificDependency')) <> 'no especificada'
    group by btrim(document.metadata ->> 'specificDependency')
    order by uses desc, value
    limit 20
  ), details as (
    select btrim(document.metadata ->> 'additionalDetail') as value, count(*) as uses
    from public.documents as document
    where not document.is_deleted
      and nullif(btrim(document.metadata ->> 'additionalDetail'), '') is not null
    group by btrim(document.metadata ->> 'additionalDetail')
    order by uses desc, value
    limit 20
  )
  select jsonb_build_object(
    'specificDependencies', coalesce((select jsonb_agg(value order by uses desc, value) from dependencies), '[]'::jsonb),
    'additionalDetails', coalesce((select jsonb_agg(value order by uses desc, value) from details), '[]'::jsonb)
  );
$$;

revoke all on function public.list_document_value_suggestions() from public, anon, authenticated;
grant execute on function public.list_document_value_suggestions() to service_role;

-- Replace the original upload RPC with governed metadata, situation and an
-- explicit automatic-processing failure mode for unreadable PDF content.
drop function public.create_document_with_initial_version(
  uuid, uuid, text, text, text, smallint, text, text, jsonb, uuid[],
  text, text, bigint, integer, text, uuid
);

create function public.create_governed_document_with_initial_version(
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
    'application/pdf', p_file_size_bytes, p_page_count, p_sha256, p_actor_id
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

revoke all on function public.create_governed_document_with_initial_version(
  uuid, uuid, text, text, text, smallint, text, text, jsonb, uuid[],
  text, text, bigint, integer, text, uuid, public.document_situation, text,
  uuid, date, smallint, text, public.document_archive_reason, text, text
) from public, anon, authenticated;
grant execute on function public.create_governed_document_with_initial_version(
  uuid, uuid, text, text, text, smallint, text, text, jsonb, uuid[],
  text, text, bigint, integer, text, uuid, public.document_situation, text,
  uuid, date, smallint, text, public.document_archive_reason, text, text
) to service_role;

-- Backward-compatible overload retained for existing server integrations.
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
language sql
security invoker
set search_path = ''
as $$
  select public.create_governed_document_with_initial_version(
    p_document_id, p_version_id, p_title, p_document_type,
    p_issuing_entity, p_issuance_year, p_resolution_number,
    p_article_reference, p_metadata, p_module_ids, p_storage_path,
    p_original_file_name, p_file_size_bytes, p_page_count, p_sha256,
    p_actor_id, 'current'::public.document_situation, null, null, null,
    null, null, null, null, null
  );
$$;

revoke all on function public.create_document_with_initial_version(
  uuid, uuid, text, text, text, smallint, text, text, jsonb, uuid[],
  text, text, bigint, integer, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_document_with_initial_version(
  uuid, uuid, text, text, text, smallint, text, text, jsonb, uuid[],
  text, text, bigint, integer, text, uuid
) to service_role;

drop function public.add_document_version(
  uuid, uuid, text, text, bigint, integer, text, uuid
);

create function public.add_governed_document_version(
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
    p_original_file_name, 'application/pdf', p_file_size_bytes, p_page_count,
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

revoke all on function public.add_governed_document_version(uuid, uuid, text, text, bigint, integer, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.add_governed_document_version(uuid, uuid, text, text, bigint, integer, text, uuid, text)
  to service_role;

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
language sql
security invoker
set search_path = ''
as $$
  select public.add_governed_document_version(
    p_document_id, p_version_id, p_storage_path, p_original_file_name,
    p_file_size_bytes, p_page_count, p_sha256, p_actor_id, null
  );
$$;

revoke all on function public.add_document_version(
  uuid, uuid, text, text, bigint, integer, text, uuid
) from public, anon, authenticated;
grant execute on function public.add_document_version(
  uuid, uuid, text, text, bigint, integer, text, uuid
) to service_role;

create function public.set_document_technical_status(
  p_document_id uuid,
  p_technical_status public.document_approval_status,
  p_actor_id uuid
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.documents%rowtype;
  current_ingestion public.document_ingestion_status;
begin
  select document.*
  into target
  from public.documents as document
  where document.id = p_document_id and not document.is_deleted
  for update of document;

  if not found then raise exception using errcode = 'P0002', message = 'Document was not found'; end if;

  select version.ingestion_status
  into current_ingestion
  from public.document_versions as version
  where version.id = target.current_version_id
    and version.document_id = target.id;

  if p_technical_status is null then raise exception using errcode = '22023', message = 'Technical status is required'; end if;
  if p_technical_status = target.approval_status then
    raise exception using errcode = '22023', message = 'Technical status is unchanged';
  end if;
  if p_technical_status = 'ready' and current_ingestion <> 'indexed' then
    raise exception using errcode = '22023', message = 'Only an indexed PDF can be approved as ready';
  end if;

  update public.documents
  set
    approval_status = p_technical_status,
    approval_updated_at = now(),
    approval_updated_by = p_actor_id,
    approved_version_id = case when p_technical_status = 'ready' then current_version_id else null end,
    updated_by = p_actor_id
  where id = p_document_id returning * into target;

  insert into public.document_audit_events (document_id, action, details, actor_id)
  values (
    p_document_id, 'metadata_updated',
    jsonb_build_object('event', 'technical_status_changed', 'technicalStatus', p_technical_status),
    p_actor_id
  );
  return target;
end;
$$;

revoke all on function public.set_document_technical_status(uuid, public.document_approval_status, uuid)
  from public, anon, authenticated;
grant execute on function public.set_document_technical_status(uuid, public.document_approval_status, uuid)
  to service_role;

drop function public.set_document_situation(
  uuid, public.document_situation, uuid, text, uuid, date, smallint, text
);

create function public.set_governed_document_situation(
  p_document_id uuid,
  p_situation public.document_situation,
  p_actor_id uuid,
  p_reason text default null,
  p_replacement_document_id uuid default null,
  p_replacement_date date default null,
  p_replacement_year smallint default null,
  p_observation text default null,
  p_archive_reason_code public.document_archive_reason default null,
  p_archive_reason_detail text default null
)
returns public.documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.documents%rowtype;
begin
  select * into target from public.documents
  where id = p_document_id and not is_deleted for update;
  if not found then raise exception using errcode = 'P0002', message = 'Document was not found'; end if;
  if target.situation = p_situation then raise exception using errcode = '22023', message = 'Document situation is unchanged'; end if;

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
    if p_replacement_document_id = p_document_id then
      raise exception using errcode = '23514', message = 'A document cannot replace itself';
    end if;
    if p_replacement_document_id is not null and not exists (
      select 1 from public.documents as replacement
      where replacement.id = p_replacement_document_id
        and not replacement.is_deleted
    ) then
      raise exception using errcode = '23503', message = 'Replacement document is unavailable';
    end if;

    if p_replacement_document_id is not null and exists (
      select 1 from public.documents as replacement
      where replacement.id = p_replacement_document_id
        and replacement.situation <> 'current'
    ) then
      raise exception using errcode = '23503', message = 'Replacement document is unavailable';
    end if;
  end if;

  update public.documents
  set
    situation = p_situation,
    publication_status = (case when p_situation = 'current' then 'active' else 'inactive' end)::public.document_publication_status,
    deactivated_at = case when p_situation = 'current' then null else now() end,
    deactivated_by = case when p_situation = 'current' then null else p_actor_id end,
    deactivation_reason = case
      when p_situation = 'current' then null
      when p_situation = 'replaced' then btrim(p_reason)
      else coalesce(btrim(p_archive_reason_detail), p_archive_reason_code::text)
    end,
    replacement_document_id = case when p_situation = 'replaced' then p_replacement_document_id else null end,
    replacement_date = case when p_situation = 'replaced' then p_replacement_date else null end,
    replacement_year = case when p_situation = 'replaced' then p_replacement_year else null end,
    replacement_reason = case when p_situation = 'replaced' then btrim(p_reason) else null end,
    replacement_observation = case when p_situation = 'replaced' then btrim(p_observation) else null end,
    archive_reason_code = case
      when p_situation = 'replaced' then 'REPLACED_BY_NEWER'::public.document_archive_reason
      when p_situation = 'archived' then p_archive_reason_code
      else null
    end,
    archive_reason_detail = case when p_situation = 'archived' then btrim(p_archive_reason_detail) else null end,
    archive_observation = case when p_situation = 'archived' then btrim(p_observation) else null end,
    updated_by = p_actor_id
  where id = p_document_id returning * into target;

  insert into public.document_audit_events (document_id, action, details, actor_id)
  values (
    p_document_id,
    (case when p_situation = 'current' then 'activated' else 'deactivated' end)::public.document_audit_action,
    jsonb_strip_nulls(jsonb_build_object(
      'situation', p_situation, 'reason', p_reason,
      'archiveReasonCode', p_archive_reason_code,
      'archiveReasonDetail', p_archive_reason_detail,
      'replacementDocumentId', p_replacement_document_id,
      'replacementDate', p_replacement_date,
      'replacementYear', p_replacement_year,
      'observation', p_observation
    )), p_actor_id
  );
  return target;
end;
$$;

revoke all on function public.set_governed_document_situation(
  uuid, public.document_situation, uuid, text, uuid, date, smallint, text,
  public.document_archive_reason, text
) from public, anon, authenticated;
grant execute on function public.set_governed_document_situation(
  uuid, public.document_situation, uuid, text, uuid, date, smallint, text,
  public.document_archive_reason, text
) to service_role;

create function public.set_document_situation(
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
begin
  if p_situation = 'replaced'
    and p_replacement_date is null
    and p_replacement_year is null
  then
    raise exception using
      errcode = '22023',
      message = 'A replaced document requires a replacement date or year';
  end if;

  if p_situation = 'archived' then
    return public.set_governed_document_situation(
      p_document_id, p_situation, p_actor_id,
      null, null, null, null, p_observation,
      case
        when nullif(btrim(p_reason), '') is null
          then 'NOT_APPLICABLE'::public.document_archive_reason
        else 'OTHER'::public.document_archive_reason
      end,
      nullif(btrim(p_reason), '')
    );
  end if;

  return public.set_governed_document_situation(
    p_document_id, p_situation, p_actor_id, p_reason,
    p_replacement_document_id, p_replacement_date, p_replacement_year,
    p_observation, null, null
  );
end;
$$;

revoke all on function public.set_document_situation(
  uuid, public.document_situation, uuid, text, uuid, date, smallint, text
) from public, anon, authenticated;
grant execute on function public.set_document_situation(
  uuid, public.document_situation, uuid, text, uuid, date, smallint, text
) to service_role;

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
  if exists (
    select 1
    from public.documents as document
    where document.id = p_document_id
      and not document.is_deleted
      and document.situation = (
        case when p_is_active then 'current' else 'archived' end
      )::public.document_situation
  ) then
    return (
      select document
      from public.documents as document
      where document.id = p_document_id
    );
  end if;

  return public.set_governed_document_situation(
    p_document_id,
    (case when p_is_active then 'current' else 'archived' end)::public.document_situation,
    p_actor_id,
    null, null, null, null,
    null,
    case when p_is_active then null else 'OTHER'::public.document_archive_reason end,
    case when p_is_active then null else p_reason end
  );
end;
$$;

revoke all on function public.set_document_publication_status(uuid, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.set_document_publication_status(uuid, boolean, text, uuid)
  to service_role;

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
  where id = p_document_id and not is_deleted
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Document was not found';
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
    archive_reason_code = 'OTHER',
    archive_reason_detail = btrim(p_reason),
    archive_observation = null,
    is_deleted = true,
    deleted_at = now(),
    deleted_by = p_actor_id,
    deletion_reason = btrim(p_reason),
    updated_by = p_actor_id
  where id = p_document_id;

  insert into public.document_audit_events (document_id, action, details, actor_id)
  values (
    p_document_id,
    'logically_deleted'::public.document_audit_action,
    jsonb_build_object('reason', btrim(p_reason)),
    p_actor_id
  );
end;
$$;

revoke all on function public.logically_delete_document(uuid, text, uuid)
  from public, anon, authenticated;
grant execute on function public.logically_delete_document(uuid, text, uuid)
  to service_role;

-- Associations are relations, never physical PDF copies.
create or replace function public.link_document_module(
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
  if not exists (select 1 from public.documents where id = p_document_id and not is_deleted) then
    raise exception using errcode = 'P0002', message = 'Document was not found';
  end if;
  insert into public.document_modules(document_id, module_id, created_by)
  values (p_document_id, p_module_id, p_actor_id);
  insert into public.document_audit_events(document_id, action, details, actor_id)
  values (p_document_id, 'module_linked', jsonb_build_object('moduleId', p_module_id), p_actor_id);
end;
$$;

create or replace function public.unlink_document_module(
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
  perform 1 from public.documents where id = p_document_id and not is_deleted for update;
  if not found then raise exception using errcode = 'P0002', message = 'Document was not found'; end if;
  if (select count(*) from public.document_modules where document_id = p_document_id) <= 1 then
    raise exception using errcode = '23514', message = 'A document must retain at least one module association';
  end if;
  delete from public.document_modules where document_id = p_document_id and module_id = p_module_id;
  if not found then raise exception using errcode = 'P0002', message = 'Document association was not found'; end if;
  insert into public.document_audit_events(document_id, action, details, actor_id)
  values (p_document_id, 'module_unlinked', jsonb_build_object('moduleId', p_module_id), p_actor_id);
end;
$$;

-- Replace the library function to add all requested orderings and to derive
-- technical state from both automatic processing and manual approval.
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
  id uuid, title text, document_type text, issuing_entity text,
  issuance_year smallint, resolution_number text, article_reference text,
  publication_status public.document_publication_status,
  situation public.document_situation, replacement_document_id uuid,
  replacement_date date, replacement_year smallint, replacement_reason text,
  replacement_observation text, current_version_id uuid, metadata jsonb,
  created_at timestamptz, created_by uuid, created_by_name text,
  updated_at timestamptz, updated_by uuid,
  current_version_ingestion_status public.document_ingestion_status,
  current_version_uploaded_at timestamptz, module_associations jsonb,
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
  if p_technical_status is not null and p_technical_status not in ('ready', 'pending_approval', 'error') then
    raise exception using errcode = '22023', message = 'Technical status is invalid';
  end if;
  if p_sort not in ('newest', 'oldest', 'year', 'title', 'upload_date',
    'document_type', 'issuing_entity', 'situation', 'technical_status', 'module') then
    raise exception using errcode = '22023', message = 'Document sort is invalid';
  end if;
  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'Pagination is invalid';
  end if;
  if normalized_query is not null then search_query := websearch_to_tsquery('spanish', normalized_query); end if;

  return query
  with recursive module_filter as (
    select module.id from public.modules as module
    where p_module_id is not null and module.id = p_module_id and not module.is_deleted
    union all
    select child.id from public.modules as child
    join module_filter as parent on child.parent_module_id = parent.id
    where not child.is_deleted
  ), candidates as (
    select
      document.*,
      profile.full_name as created_by_name,
      version.uploaded_at as current_version_uploaded_at,
      case
        when version.id is null or version.ingestion_status = 'failed' then 'error'
        when version.ingestion_status = 'indexed' and document.approval_status = 'ready'
          and document.approved_version_id = document.current_version_id then 'ready'
        else 'pending_approval'
      end as technical_status,
      case
        when version.id is null or version.ingestion_status = 'failed' then 'failed'::public.document_ingestion_status
        when version.ingestion_status = 'indexed' and document.approval_status = 'ready'
          and document.approved_version_id = document.current_version_id then 'indexed'::public.document_ingestion_status
        else 'pending'::public.document_ingestion_status
      end as exposed_ingestion_status,
      coalesce(associations.items, '[]'::jsonb) as module_associations,
      coalesce(associations.first_name, '') as first_module_name
    from public.documents as document
    left join public.document_versions as version
      on version.id = document.current_version_id and version.document_id = document.id
    left join public.profiles as profile on profile.id = document.created_by
    left join lateral (
      select
        jsonb_agg(jsonb_build_object(
          'linked_module_id', linked.id,
          'linked_module_name', linked.name,
          'module_id', coalesce(parent.id, linked.id),
          'module_name', coalesce(parent.name, linked.name),
          'submodule_id', case when parent.id is null then null else linked.id end,
          'submodule_name', case when parent.id is null then null else linked.name end
        ) order by coalesce(parent.sort_order, linked.sort_order), linked.sort_order, linked.name, linked.id) as items,
        min(lower(coalesce(parent.name, linked.name))) as first_name
      from public.document_modules as relation
      join public.modules as linked on linked.id = relation.module_id and not linked.is_deleted
      left join public.modules as parent on parent.id = linked.parent_module_id and not parent.is_deleted
      where relation.document_id = document.id
    ) as associations on true
    where not document.is_deleted
      and (
        normalized_query is null
        or document.search_vector @@ search_query
        or document.governed_metadata_search_vector @@ search_query
      )
      and (p_issuance_year is null or document.issuance_year = p_issuance_year)
      and (p_document_type is null or document.document_type = p_document_type)
      and (
        p_issuing_entity is null
        or lower(document.issuing_entity) = lower(btrim(p_issuing_entity))
      )
      and (p_situation is null or document.situation = p_situation)
      and (p_module_id is null or exists (
        select 1 from public.document_modules as relation
        join module_filter on module_filter.id = relation.module_id
        where relation.document_id = document.id
      ))
      and (p_submodule_id is null or exists (
        select 1 from public.document_modules as relation
        where relation.document_id = document.id and relation.module_id = p_submodule_id
      ))
  ), filtered as (
    select * from candidates
    where p_technical_status is null or technical_status = p_technical_status
  )
  select
    filtered.id, filtered.title, filtered.document_type, filtered.issuing_entity,
    filtered.issuance_year, filtered.resolution_number, filtered.article_reference,
    filtered.publication_status, filtered.situation,
    filtered.replacement_document_id, filtered.replacement_date,
    filtered.replacement_year, filtered.replacement_reason,
    filtered.replacement_observation, filtered.current_version_id,
    filtered.metadata, filtered.created_at, filtered.created_by,
    filtered.created_by_name, filtered.updated_at, filtered.updated_by,
    filtered.exposed_ingestion_status, filtered.current_version_uploaded_at,
    filtered.module_associations, count(*) over ()
  from filtered
  order by
    case when p_sort = 'newest' then filtered.current_version_uploaded_at end desc nulls last,
    case when p_sort = 'oldest' then filtered.current_version_uploaded_at end asc nulls last,
    case when p_sort = 'year' then filtered.issuance_year end desc nulls last,
    case when p_sort = 'title' then lower(filtered.title) end,
    case when p_sort = 'upload_date' then filtered.created_at end desc nulls last,
    case when p_sort = 'document_type' then filtered.document_type end,
    case when p_sort = 'issuing_entity' then filtered.issuing_entity end,
    case when p_sort = 'situation' then filtered.situation::text end,
    case when p_sort = 'technical_status' then filtered.technical_status end,
    case when p_sort = 'module' then filtered.first_module_name end,
    filtered.id
  limit p_limit offset p_offset;
end;
$$;

revoke all on function public.list_document_library(
  text, smallint, text, text, uuid, uuid, public.document_situation,
  text, text, integer, integer
) from public, anon, authenticated;
grant execute on function public.list_document_library(
  text, smallint, text, text, uuid, uuid, public.document_situation,
  text, text, integer, integer
) to service_role;
