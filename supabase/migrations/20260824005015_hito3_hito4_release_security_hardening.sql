-- Corrective release hardening for the immutable Hito 3–4 migration chain.
-- This migration intentionally adds forward-only controls rather than rewriting
-- previously validated contracts, so every environment converges safely.

create function private.validate_chat_message_source_live_evidence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  canonical_document_title text;
  canonical_version_number integer;
  canonical_page_start integer;
  canonical_page_end integer;
  canonical_section_title text;
  canonical_article_reference text;
  canonical_numeral_reference text;
  canonical_module_name text;
begin
  select
    document.title,
    version.version_number,
    chunk.page_start,
    chunk.page_end,
    chunk.section_title,
    chunk.article_reference,
    chunk.numeral_reference
  into
    canonical_document_title,
    canonical_version_number,
    canonical_page_start,
    canonical_page_end,
    canonical_section_title,
    canonical_article_reference,
    canonical_numeral_reference
  from public.document_chunks as chunk
  join public.documents as document
    on document.id = chunk.document_id
  join public.document_versions as version
    on version.id = chunk.document_version_id
    and version.document_id = chunk.document_id
  where chunk.id = new.chunk_id
    and chunk.document_id = new.document_id
    and chunk.document_version_id = new.document_version_id
    and document.publication_status = 'active'
    and not document.is_deleted
    and document.current_version_id = chunk.document_version_id
    and version.ingestion_status = 'indexed'
    and exists (
      select 1
      from public.document_modules as document_module
      join public.modules as module on module.id = document_module.module_id
      where document_module.document_id = document.id
        and module.is_active
        and not module.is_deleted
    );

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A cited source is no longer eligible as active evidence';
  end if;

  if new.module_id is not null then
    select module.name into canonical_module_name
    from public.document_modules as document_module
    join public.modules as module on module.id = document_module.module_id
    where document_module.document_id = new.document_id
      and document_module.module_id = new.module_id
      and module.is_active
      and not module.is_deleted;

    if not found then
      raise exception using
        errcode = '23503',
        message = 'A cited source module is no longer eligible as active evidence';
    end if;
  end if;

  new.document_title := canonical_document_title;
  new.module_name := canonical_module_name;
  new.version_number := canonical_version_number;
  new.page_start := canonical_page_start;
  new.page_end := canonical_page_end;
  new.section_title := canonical_section_title;
  new.article_reference := canonical_article_reference;
  new.numeral_reference := canonical_numeral_reference;
  return new;
end;
$$;

revoke all on function private.validate_chat_message_source_live_evidence() from public;

create trigger chat_message_sources_require_live_evidence
before insert on public.chat_message_sources
for each row execute procedure private.validate_chat_message_source_live_evidence();

create function private.redact_unanswered_question_for_operations()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.question := case new.reason
    when 'ambiguous_request'::public.unanswered_question_reason then
      'Consulta ambigua: se requiere seleccionar el módulo aplicable.'
    when 'insufficient_evidence'::public.unanswered_question_reason then
      'Consulta sin evidencia: se requiere revisar la cobertura documental del módulo.'
    else
      'Consulta no resuelta: requiere revisión administrativa.'
  end;
  return new;
end;
$$;

revoke all on function private.redact_unanswered_question_for_operations() from public;

create trigger unanswered_questions_store_operational_summary
before insert or update of question, reason on public.unanswered_questions
for each row execute procedure private.redact_unanswered_question_for_operations();

create function private.prevent_unanswered_question_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Unanswered question reviews are append-only';
end;
$$;

revoke all on function private.prevent_unanswered_question_review_mutation() from public;

create trigger unanswered_question_reviews_append_only
before update or delete on public.unanswered_question_reviews
for each row execute procedure private.prevent_unanswered_question_review_mutation();

revoke all on table public.unanswered_question_reviews from service_role;

create or replace function private.require_administrator(p_reviewer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_reviewer_id
      and profile.role in ('admin', 'superadmin')
      and profile.account_status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active administrator may perform this operation';
  end if;
end;
$$;

revoke all on function private.require_administrator(uuid) from public;

create or replace function private.require_faq_memory_reviewer(p_reviewer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_reviewer_id
      and profile.role in ('admin', 'superadmin')
      and profile.account_status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active administrator may review FAQ memory candidates';
  end if;
end;
$$;

revoke all on function private.require_faq_memory_reviewer(uuid) from public;

create or replace function public.update_administrative_user(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_role public.app_role default null,
  p_account_status public.account_status default null,
  p_reason text default null
)
returns table (
  id uuid,
  full_name text,
  role public.app_role,
  account_status public.account_status,
  last_access_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  next_role public.app_role;
  next_status public.account_status;
  previous_role public.app_role;
  previous_status public.account_status;
  role_changed boolean;
  status_changed boolean;
begin
  perform private.require_superadministrator(p_actor_id);
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('avend.active-superadministrators', 0)
  );
  perform private.require_superadministrator(p_actor_id);

  if p_target_user_id is null or p_target_user_id = p_actor_id then
    raise exception using
      errcode = '22023',
      message = 'A superadministrator cannot change their own role or account status';
  end if;

  if normalized_reason is null or char_length(normalized_reason) not between 4 and 500 then
    raise exception using
      errcode = '22023',
      message = 'An administrative user change requires a reason';
  end if;

  select * into target
  from public.profiles as profile
  where profile.id = p_target_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Administrative user was not found';
  end if;

  next_role := coalesce(p_role, target.role);
  next_status := coalesce(p_account_status, target.account_status);
  previous_role := target.role;
  previous_status := target.account_status;
  role_changed := next_role is distinct from target.role;
  status_changed := next_status is distinct from target.account_status;

  if not role_changed and not status_changed then
    raise exception using
      errcode = '22023',
      message = 'The administrative user change has no effect';
  end if;

  if target.role = 'superadmin'
    and target.account_status = 'active'
    and (next_role <> 'superadmin' or next_status <> 'active')
    and not exists (
      select 1
      from public.profiles as profile
      where profile.id <> target.id
        and profile.role = 'superadmin'
        and profile.account_status = 'active'
    ) then
    raise exception using
      errcode = '23514',
      message = 'At least one active superadministrator must remain';
  end if;

  update public.profiles as profile
  set
    role = next_role,
    account_status = next_status,
    status_changed_at = case when status_changed and next_status = 'suspended' then now() else null end,
    status_changed_by = case when status_changed and next_status = 'suspended' then p_actor_id else null end,
    status_reason = case when status_changed and next_status = 'suspended' then normalized_reason else null end
  where profile.id = target.id
  returning * into target;

  if role_changed then
    perform private.record_operational_audit(
      p_actor_id,
      'user_role_changed',
      'profile',
      target.id,
      jsonb_build_object('fromRole', previous_role, 'toRole', next_role)
    );
  end if;

  if status_changed then
    perform private.record_operational_audit(
      p_actor_id,
      'user_status_changed',
      'profile',
      target.id,
      jsonb_build_object('fromStatus', previous_status, 'toStatus', next_status)
    );
  end if;

  return query
  select target.id, target.full_name, target.role, target.account_status, target.last_access_at;
end;
$$;

revoke all on function public.update_administrative_user(uuid, uuid, public.app_role, public.account_status, text) from public, anon, authenticated;
grant execute on function public.update_administrative_user(uuid, uuid, public.app_role, public.account_status, text) to service_role;
