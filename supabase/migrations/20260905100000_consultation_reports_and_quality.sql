-- Consultas y reportes: casos privados de calidad, reportes y sugerencias.
--
-- The legacy `unanswered_questions` queue is intentionally left intact. Its
-- privacy-redaction trigger remains the compatibility path for historical
-- operations; the new case model takes immutable snapshots from the canonical
-- chat records through server-only RPCs.

do $$
begin
  create type public.consultation_case_kind as enum (
    'automatic_alert',
    'teacher_report',
    'teacher_suggestion'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.consultation_case_status as enum (
    'pending',
    'in_review',
    'resolved',
    'discarded'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.consultation_case_issue as enum (
    'support_insufficient',
    'support_partial',
    'stale_document',
    'citation_insufficient',
    'possible_contradiction',
    'low_confidence',
    'technical_error',
    'ambiguous_request',
    'teacher_report',
    'teacher_suggestion'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.consultation_report_reason as enum (
    'answer_not_relevant',
    'information_outdated',
    'citation_does_not_support',
    'missing_information',
    'answer_unclear',
    'other'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.consultation_attachment_kind as enum (
    'report_image',
    'suggestion_file'
  );
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.consultation_attachment_disposition as enum (
    'pending_review',
    'incorporated',
    'not_incorporated'
  );
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.consultation_turns (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  user_message_id uuid not null unique references public.chat_messages (id) on delete restrict,
  answer_message_id uuid unique references public.chat_messages (id) on delete restrict,
  requested_module_id uuid references public.modules (id) on delete restrict,
  detected_module_id uuid references public.modules (id) on delete restrict,
  detected_submodule_id uuid references public.modules (id) on delete restrict,
  retrieval_scope text not null default 'current'
    check (retrieval_scope in ('current', 'historical', 'archived_explicit')),
  top_relevance_score real check (top_relevance_score is null or top_relevance_score between 0 and 1),
  answer_role public.chat_message_role,
  quality_signals jsonb not null default '[]'::jsonb
    check (jsonb_typeof(quality_signals) = 'array'),
  -- The full answer remains immutable in chat_messages. This stores only the
  -- bounded, concrete answer fragments that a deterministic quality control
  -- marked for review, keyed by the corresponding signal.
  quality_excerpts jsonb not null default '{}'::jsonb
    constraint consultation_turns_quality_excerpts_object_check
    check (jsonb_typeof(quality_excerpts) = 'object'),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  check (
    detected_submodule_id is null
    or detected_module_id is not null
  )
);

-- Keep a re-run safe upgrade path for local environments where this migration
-- was previously exercised before quality excerpts were introduced.
alter table public.consultation_turns
  add column if not exists quality_excerpts jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.consultation_turns'::regclass
      and conname = 'consultation_turns_quality_excerpts_object_check'
  ) then
    alter table public.consultation_turns
      add constraint consultation_turns_quality_excerpts_object_check
      check (jsonb_typeof(quality_excerpts) = 'object');
  end if;
end;
$$;

create table if not exists public.consultation_cases (
  id uuid primary key default gen_random_uuid(),
  kind public.consultation_case_kind not null,
  issue_type public.consultation_case_issue not null,
  status public.consultation_case_status not null default 'pending',
  legacy_unanswered_question_id uuid unique
    references public.unanswered_questions (id) on delete restrict,
  consultation_turn_id uuid references public.consultation_turns (id) on delete restrict,
  conversation_id uuid references public.chat_conversations (id) on delete restrict,
  user_id uuid references public.profiles (id) on delete restrict,
  user_message_id uuid references public.chat_messages (id) on delete restrict,
  answer_message_id uuid references public.chat_messages (id) on delete restrict,
  requested_module_id uuid references public.modules (id) on delete restrict,
  detected_module_id uuid references public.modules (id) on delete restrict,
  detected_submodule_id uuid references public.modules (id) on delete restrict,
  requested_module_name text,
  detected_module_name text,
  detected_submodule_name text,
  retrieval_scope text check (retrieval_scope is null or retrieval_scope in ('current', 'historical', 'archived_explicit')),
  top_relevance_score real check (top_relevance_score is null or top_relevance_score between 0 and 1),
  question_snapshot text check (question_snapshot is null or char_length(question_snapshot) between 1 and 8_000),
  answer_snapshot text check (answer_snapshot is null or char_length(answer_snapshot) between 1 and 20_000),
  review_excerpt text check (review_excerpt is null or char_length(review_excerpt) between 1 and 2_000),
  report_reason public.consultation_report_reason,
  reporter_comment text check (reporter_comment is null or char_length(btrim(reporter_comment)) between 1 and 2_000),
  client_submission_id uuid unique,
  snapshot_complete boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    detected_submodule_id is null
    or detected_module_id is not null
  )
);

create table if not exists public.consultation_case_sources (
  id uuid primary key default gen_random_uuid(),
  consultation_case_id uuid not null references public.consultation_cases (id) on delete restrict,
  chat_source_id uuid references public.chat_message_sources (id) on delete restrict,
  document_id uuid references public.documents (id) on delete restrict,
  document_version_id uuid references public.document_versions (id) on delete restrict,
  root_module_id uuid references public.modules (id) on delete restrict,
  submodule_id uuid references public.modules (id) on delete restrict,
  document_title text not null check (char_length(btrim(document_title)) between 1 and 500),
  document_situation public.document_situation not null,
  version_number integer not null check (version_number > 0),
  page_start integer not null check (page_start > 0),
  page_end integer not null check (page_end >= page_start),
  section_title text,
  article_reference text,
  numeral_reference text,
  evidence_excerpt text,
  relevance_score real not null check (relevance_score between 0 and 1),
  source_rank integer not null check (source_rank > 0),
  created_at timestamptz not null default now(),
  unique (consultation_case_id, chat_source_id)
);

create table if not exists public.consultation_case_attachments (
  id uuid primary key default gen_random_uuid(),
  consultation_case_id uuid not null references public.consultation_cases (id) on delete restrict,
  uploaded_by uuid not null references public.profiles (id) on delete restrict,
  attachment_kind public.consultation_attachment_kind not null,
  storage_bucket text not null default 'consultation-case-attachments'
    check (storage_bucket = 'consultation-case-attachments'),
  storage_path text not null unique check (char_length(btrim(storage_path)) between 1 and 1_024),
  original_file_name text not null check (char_length(btrim(original_file_name)) between 1 and 255),
  mime_type text not null check (
    mime_type in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  file_size_bytes bigint not null check (file_size_bytes between 1 and 10_485_760),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  disposition public.consultation_attachment_disposition not null default 'pending_review',
  incorporated_document_id uuid references public.documents (id) on delete restrict,
  created_at timestamptz not null default now(),
  check (
    (disposition = 'incorporated' and incorporated_document_id is not null)
    or (disposition <> 'incorporated' and incorporated_document_id is null)
  ),
  constraint consultation_case_attachments_report_image_mime_check check (
    attachment_kind <> 'report_image'
    or mime_type in ('image/jpeg', 'image/png', 'image/webp')
  )
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.consultation_case_attachments'::regclass
      and conname = 'consultation_case_attachments_report_image_mime_check'
  ) then
    alter table public.consultation_case_attachments
      add constraint consultation_case_attachments_report_image_mime_check
      check (
        attachment_kind <> 'report_image'
        or mime_type in ('image/jpeg', 'image/png', 'image/webp')
      );
  end if;
end;
$$;

create table if not exists public.consultation_case_document_links (
  consultation_case_id uuid not null references public.consultation_cases (id) on delete restrict,
  document_id uuid not null references public.documents (id) on delete restrict,
  linked_by uuid not null references public.profiles (id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (consultation_case_id, document_id)
);

create table if not exists public.consultation_case_events (
  id uuid primary key default gen_random_uuid(),
  consultation_case_id uuid not null references public.consultation_cases (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete restrict,
  event_type text not null check (
    event_type in (
      'case_created',
      'status_changed',
      'note_added',
      'routing_corrected',
      'document_linked',
      'document_unlinked',
      'attachment_decided',
      'attachment_accessed',
      'legacy_review_imported'
    )
  ),
  note text check (note is null or char_length(btrim(note)) between 1 and 2_000),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  legacy_review_id uuid unique references public.unanswered_question_reviews (id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.consultation_turns enable row level security;
alter table public.consultation_cases enable row level security;
alter table public.consultation_case_sources enable row level security;
alter table public.consultation_case_attachments enable row level security;
alter table public.consultation_case_document_links enable row level security;
alter table public.consultation_case_events enable row level security;

revoke all on table public.consultation_turns from public, anon, authenticated;
revoke all on table public.consultation_cases from public, anon, authenticated;
revoke all on table public.consultation_case_sources from public, anon, authenticated;
revoke all on table public.consultation_case_attachments from public, anon, authenticated;
revoke all on table public.consultation_case_document_links from public, anon, authenticated;
revoke all on table public.consultation_case_events from public, anon, authenticated;

grant all on table public.consultation_turns to service_role;
grant all on table public.consultation_cases to service_role;
grant all on table public.consultation_case_sources to service_role;
grant all on table public.consultation_case_attachments to service_role;
grant all on table public.consultation_case_document_links to service_role;
grant all on table public.consultation_case_events to service_role;

create index if not exists consultation_turns_created_at_idx
  on public.consultation_turns (created_at desc, id);
create index if not exists consultation_turns_detected_module_created_idx
  on public.consultation_turns (detected_module_id, created_at desc, id)
  where detected_module_id is not null;
create index if not exists consultation_turns_detected_submodule_created_idx
  on public.consultation_turns (detected_submodule_id, created_at desc, id)
  where detected_submodule_id is not null;
create index if not exists consultation_cases_status_created_idx
  on public.consultation_cases (status, created_at desc, id);
create index if not exists consultation_cases_issue_created_idx
  on public.consultation_cases (issue_type, created_at desc, id);
create index if not exists consultation_cases_detected_module_created_idx
  on public.consultation_cases (detected_module_id, created_at desc, id)
  where detected_module_id is not null;
create index if not exists consultation_cases_detected_submodule_created_idx
  on public.consultation_cases (detected_submodule_id, created_at desc, id)
  where detected_submodule_id is not null;
create index if not exists consultation_cases_open_answer_review_idx
  on public.consultation_cases (created_at desc, answer_message_id, issue_type, id)
  where status in ('pending', 'in_review')
    and answer_message_id is not null
    and kind in ('automatic_alert', 'teacher_report');
create unique index if not exists consultation_cases_automatic_turn_issue_key
  on public.consultation_cases (consultation_turn_id, issue_type)
  where kind = 'automatic_alert' and consultation_turn_id is not null;
create index if not exists consultation_case_sources_case_rank_idx
  on public.consultation_case_sources (consultation_case_id, source_rank, id);
create index if not exists consultation_case_attachments_case_idx
  on public.consultation_case_attachments (consultation_case_id, created_at, id);
create unique index if not exists consultation_case_attachments_idempotency_key
  on public.consultation_case_attachments (
    consultation_case_id,
    attachment_kind,
    sha256
  );
create unique index if not exists consultation_case_single_report_image_key
  on public.consultation_case_attachments (consultation_case_id)
  where attachment_kind = 'report_image';
create index if not exists consultation_case_events_case_created_idx
  on public.consultation_case_events (consultation_case_id, created_at, id);

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'consultation-case-attachments',
  'consultation-case-attachments',
  false,
  10_485_760,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Consultation attachments deny anonymous access'
  ) then
    create policy "Consultation attachments deny anonymous access"
      on storage.objects as restrictive for all to anon
      using (bucket_id <> 'consultation-case-attachments')
      with check (bucket_id <> 'consultation-case-attachments');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Consultation attachments deny authenticated direct access'
  ) then
    create policy "Consultation attachments deny authenticated direct access"
      on storage.objects as restrictive for all to authenticated
      using (bucket_id <> 'consultation-case-attachments')
      with check (bucket_id <> 'consultation-case-attachments');
  end if;
end;
$$;

create or replace function private.prevent_consultation_case_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Consultation case events are append-only';
end;
$$;

drop trigger if exists consultation_case_events_append_only on public.consultation_case_events;
create trigger consultation_case_events_append_only
before update or delete on public.consultation_case_events
for each row execute procedure private.prevent_consultation_case_event_mutation();

revoke all on function private.prevent_consultation_case_event_mutation() from public;

create or replace function private.require_active_consultation_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_user_id
      and profile.account_status = 'active'
      and (
        profile.access_expires_at is null
        or profile.access_expires_at >= now()
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active user may submit a consultation report';
  end if;
end;
$$;

create or replace function private.require_active_consultation_administrator(
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator(p_actor_id);

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_actor_id
      and profile.role in ('admin', 'superadmin')
      and profile.account_status = 'active'
      and (
        profile.access_expires_at is null
        or profile.access_expires_at >= now()
      )
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active administrator may perform this operation';
  end if;
end;
$$;

create or replace function private.consultation_module_context(p_module_id uuid)
returns table (
  root_module_id uuid,
  root_module_name text,
  submodule_id uuid,
  submodule_name text
)
language sql
security definer
set search_path = ''
as $$
  select
    coalesce(parent.id, module.id) as root_module_id,
    coalesce(parent.name, module.name) as root_module_name,
    case when parent.id is null then null else module.id end as submodule_id,
    case when parent.id is null then null else module.name end as submodule_name
  from public.modules as module
  left join public.modules as parent on parent.id = module.parent_module_id
  where module.id = p_module_id
    and module.is_active
    and not module.is_deleted
    and (
      parent.id is null
      or (parent.is_active and not parent.is_deleted)
    );
$$;

create or replace function private.consultation_period_start(p_period text)
returns timestamptz
language plpgsql
stable
set search_path = ''
as $$
declare
  local_now timestamp := timezone('America/Lima', now());
begin
  if p_period = 'today' then
    return date_trunc('day', local_now) at time zone 'America/Lima';
  end if;

  if p_period = 'week' then
    return date_trunc('week', local_now) at time zone 'America/Lima';
  end if;

  if p_period = 'month' then
    return date_trunc('month', local_now) at time zone 'America/Lima';
  end if;

  raise exception using
    errcode = '22023',
    message = 'The consultation period is invalid';
end;
$$;

create or replace function private.validate_consultation_routing(
  p_detected_module_id uuid,
  p_detected_submodule_id uuid,
  p_requested_module_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_context record;
  detected_context record;
  submodule_context record;
begin
  if p_requested_module_id is not null then
    select * into requested_context
    from private.consultation_module_context(p_requested_module_id);
    if not found then
      raise exception using
        errcode = '23503',
        message = 'The requested module is unavailable';
    end if;
  end if;

  if p_detected_module_id is not null then
    select * into detected_context
    from private.consultation_module_context(p_detected_module_id);
    if not found or detected_context.root_module_id <> p_detected_module_id then
      raise exception using
        errcode = '23503',
        message = 'The detected root module is invalid';
    end if;
  end if;

  if p_detected_submodule_id is not null then
    if p_detected_module_id is null then
      raise exception using
        errcode = '22023',
        message = 'A detected submodule requires its root module';
    end if;

    select * into submodule_context
    from private.consultation_module_context(p_detected_submodule_id);
    if not found
      or submodule_context.root_module_id <> p_detected_module_id
      or submodule_context.submodule_id <> p_detected_submodule_id then
      raise exception using
        errcode = '23503',
        message = 'The detected submodule is invalid';
    end if;
  end if;
end;
$$;

-- A detected route is a quality assertion, not merely a label. Every cited
-- document must actually be associated with that root (and, when disclosed,
-- with that exact submodule) before the completed answer is persisted.
create or replace function private.validate_consultation_answer_routing(
  p_answer_message_id uuid,
  p_detected_module_id uuid,
  p_detected_submodule_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_detected_module_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.chat_message_sources as source
    where source.message_id = p_answer_message_id
  ) then
    raise exception using
      errcode = '23503',
      message = 'A detected route requires a cited source';
  end if;

  if exists (
    select 1
    from public.chat_message_sources as source
    where source.message_id = p_answer_message_id
      and not exists (
        select 1
        from public.document_modules as document_module
        cross join lateral private.consultation_module_context(
          document_module.module_id
        ) as source_context
        where document_module.document_id = source.document_id
          and source_context.root_module_id = p_detected_module_id
          and (
            p_detected_submodule_id is null
            or source_context.submodule_id = p_detected_submodule_id
          )
      )
  ) then
    raise exception using
      errcode = '23503',
      message = 'The detected route is not supported by every cited source';
  end if;
end;
$$;

create or replace function private.insert_consultation_case_event(
  p_case_id uuid,
  p_actor_id uuid,
  p_event_type text,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_legacy_review_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.consultation_case_events (
    consultation_case_id,
    actor_id,
    event_type,
    note,
    metadata,
    legacy_review_id
  )
  values (
    p_case_id,
    p_actor_id,
    p_event_type,
    nullif(btrim(coalesce(p_note, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    p_legacy_review_id
  )
  on conflict (legacy_review_id) where legacy_review_id is not null do nothing;
end;
$$;

create or replace function private.snapshot_consultation_case_sources(
  p_case_id uuid,
  p_answer_message_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_answer_message_id is null then
    return;
  end if;

  insert into public.consultation_case_sources (
    consultation_case_id,
    chat_source_id,
    document_id,
    document_version_id,
    root_module_id,
    submodule_id,
    document_title,
    document_situation,
    version_number,
    page_start,
    page_end,
    section_title,
    article_reference,
    numeral_reference,
    evidence_excerpt,
    relevance_score,
    source_rank
  )
  select
    p_case_id,
    source.id,
    source.document_id,
    source.document_version_id,
    coalesce(parent.id, source_module.id),
    case when parent.id is null then null else source_module.id end,
    source.document_title,
    source.document_situation,
    source.version_number,
    source.page_start,
    source.page_end,
    source.section_title,
    source.article_reference,
    source.numeral_reference,
    nullif(left(chunk.chunk_content, 2_000), ''),
    source.relevance_score,
    source.source_rank
  from public.chat_message_sources as source
  left join public.document_chunks as chunk on chunk.id = source.chunk_id
  left join public.modules as source_module on source_module.id = source.module_id
  left join public.modules as parent on parent.id = source_module.parent_module_id
  where source.message_id = p_answer_message_id
  on conflict (consultation_case_id, chat_source_id) do nothing;
end;
$$;

revoke all on function private.require_active_consultation_user(uuid) from public, anon, authenticated;
revoke all on function private.require_active_consultation_administrator(uuid) from public, anon, authenticated;
revoke all on function private.consultation_module_context(uuid) from public, anon, authenticated;
revoke all on function private.consultation_period_start(text) from public, anon, authenticated;
revoke all on function private.validate_consultation_routing(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.validate_consultation_answer_routing(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.insert_consultation_case_event(uuid, uuid, text, text, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.snapshot_consultation_case_sources(uuid, uuid) from public, anon, authenticated;

create or replace function private.consultation_answer_citations_are_complete(
  p_answer text,
  p_sources jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  source_count integer;
  source_index integer;
begin
  if p_sources is null or jsonb_typeof(p_sources) <> 'array' then
    return false;
  end if;

  source_count := jsonb_array_length(p_sources);
  if source_count = 0 then
    return false;
  end if;

  for source_index in 1..source_count loop
    if position('[' || source_index::text || ']' in coalesce(p_answer, '')) = 0 then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create or replace function private.consultation_answer_has_uncited_substantive_paragraph(
  p_answer text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  claim text;
begin
  for claim in
    select btrim(value)
    from regexp_split_to_table(
      regexp_replace(
        replace(coalesce(p_answer, ''), E'\\r', ''),
        E'([.!?]+)((\\s*\\[[1-9][0-9]*\\])*)\\s*',
        E'\\1\\2\\n',
        'g'
      ),
      E'\\n+'
    ) as value
  loop
    if char_length(regexp_replace(claim, E'\\[[1-9][0-9]*\\]', '', 'g')) >= 30
      and claim !~ E'\\[[1-9][0-9]*\\]' then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function private.consultation_has_possible_contradiction(
  p_answer_message_id uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with cited_evidence as (
    select
      coalesce(
        nullif(lower(btrim(source.article_reference)), ''),
        nullif(lower(btrim(source.section_title)), ''),
        'source:' || source.id::text
      ) as legal_anchor,
      source.document_id,
      lower(chunk.chunk_content) as evidence
    from public.chat_message_sources as source
    join public.document_chunks as chunk on chunk.id = source.chunk_id
    where source.message_id = p_answer_message_id
  ), classified as (
    select
      legal_anchor,
      document_id,
      case
        when evidence ~ '(no procede|no corresponde|prohibid[oa]|improcedente)' then 'negative'
        when evidence ~ '(procede|corresponde|permitid[oa]|admisible)' then 'positive'
        else null
      end as position
    from cited_evidence
  )
  select exists (
    select 1
    from classified
    where position is not null
    group by legal_anchor
    having count(distinct document_id) > 1
      and count(distinct position) > 1
  );
$$;

create or replace function private.create_automatic_consultation_case(
  p_consultation_turn_id uuid,
  p_issue_type public.consultation_case_issue
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_turn public.consultation_turns%rowtype;
  created_case_id uuid;
  requested_root_name text;
  detected_root_name text;
  detected_submodule_name text;
  existing_case_id uuid;
begin
  if p_issue_type not in (
    'support_insufficient',
    'support_partial',
    'stale_document',
    'citation_insufficient',
    'possible_contradiction',
    'low_confidence',
    'technical_error',
    'ambiguous_request'
  ) then
    raise exception using
      errcode = '22023',
      message = 'The automatic consultation issue is invalid';
  end if;

  select * into target_turn
  from public.consultation_turns as turn
  where turn.id = p_consultation_turn_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Consultation turn was not found';
  end if;

  select id into existing_case_id
  from public.consultation_cases as existing_case
  where existing_case.kind = 'automatic_alert'
    and existing_case.consultation_turn_id = target_turn.id
    and existing_case.issue_type = p_issue_type;

  if found then
    return existing_case_id;
  end if;

  if target_turn.requested_module_id is not null then
    select root_module_name into requested_root_name
    from private.consultation_module_context(target_turn.requested_module_id);
  end if;

  if target_turn.detected_module_id is not null then
    select root_module_name, submodule_name
    into detected_root_name, detected_submodule_name
    from private.consultation_module_context(
      coalesce(target_turn.detected_submodule_id, target_turn.detected_module_id)
    );
  end if;

  insert into public.consultation_cases (
    kind,
    issue_type,
    consultation_turn_id,
    conversation_id,
    user_id,
    user_message_id,
    answer_message_id,
    requested_module_id,
    detected_module_id,
    detected_submodule_id,
    requested_module_name,
    detected_module_name,
    detected_submodule_name,
    retrieval_scope,
    top_relevance_score,
    question_snapshot,
    answer_snapshot,
    review_excerpt
  )
  select
    'automatic_alert',
    p_issue_type,
    target_turn.id,
    target_turn.conversation_id,
    target_turn.user_id,
    target_turn.user_message_id,
    target_turn.answer_message_id,
    target_turn.requested_module_id,
    target_turn.detected_module_id,
    target_turn.detected_submodule_id,
    requested_root_name,
    detected_root_name,
    detected_submodule_name,
    target_turn.retrieval_scope,
    target_turn.top_relevance_score,
    question.content,
    answer.content,
    coalesce(
      nullif(
        btrim(target_turn.quality_excerpts ->> p_issue_type::text),
        ''
      ),
      case p_issue_type
      when 'support_insufficient' then 'No se encontró sustento documental suficiente para responder la consulta.'
      when 'support_partial' then 'La respuesta podría contener más afirmaciones sustantivas que referencias verificables.'
      when 'stale_document' then 'Posible uso de documentación no vigente: una fuente cambió de vigencia durante la respuesta.'
      when 'citation_insufficient' then 'La respuesta no contiene referencias completas para todas las fuentes persistidas.'
      when 'possible_contradiction' then 'Fuentes con el mismo ancla normativa contienen señales textuales opuestas; requiere criterio humano.'
      when 'low_confidence' then 'La mejor coincidencia documental quedó cerca del umbral de recuperación.'
      when 'technical_error' then 'La consulta no se completó por un fallo técnico y requiere seguimiento.'
      when 'ambiguous_request' then 'La consulta requiere mayor precisión o selección de un tema aplicable.'
      else null
      end
    )
  from public.chat_messages as question
  left join public.chat_messages as answer on answer.id = target_turn.answer_message_id
  where question.id = target_turn.user_message_id
  returning id into created_case_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The canonical consultation messages are unavailable';
  end if;

  perform private.snapshot_consultation_case_sources(
    created_case_id,
    target_turn.answer_message_id
  );
  perform private.insert_consultation_case_event(
    created_case_id,
    null,
    'case_created',
    null,
    jsonb_build_object('origin', 'automatic_alert', 'issueType', p_issue_type::text)
  );

  return created_case_id;
exception
  when unique_violation then
    select id into existing_case_id
    from public.consultation_cases as existing_case
    where existing_case.kind = 'automatic_alert'
      and existing_case.consultation_turn_id = p_consultation_turn_id
      and existing_case.issue_type = p_issue_type;
    if found then return existing_case_id; end if;
    raise;
end;
$$;

create or replace function public.begin_chat_turn_with_consultation_routing(
  p_user_id uuid,
  p_conversation_id uuid default null,
  p_selected_module_id uuid default null,
  p_question text default null
)
returns table (
  conversation_id uuid,
  user_message_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  started_turn record;
begin
  perform private.require_active_consultation_user(p_user_id);

  select * into started_turn
  from public.begin_chat_turn(
    p_user_id,
    p_conversation_id,
    p_selected_module_id,
    p_question
  );

  insert into public.consultation_turns (
    conversation_id,
    user_id,
    user_message_id,
    requested_module_id
  )
  values (
    started_turn.conversation_id,
    p_user_id,
    started_turn.user_message_id,
    p_selected_module_id
  )
  on conflict on constraint consultation_turns_user_message_id_key do nothing;

  return query
  select started_turn.conversation_id, started_turn.user_message_id;
end;
$$;

create or replace function public.complete_chat_turn_with_consultation_case(
  p_user_id uuid,
  p_conversation_id uuid,
  p_user_message_id uuid,
  p_answer_role public.chat_message_role,
  p_answer text,
  p_sources jsonb default '[]'::jsonb,
  p_unanswered_reason public.unanswered_question_reason default null,
  p_top_relevance_score real default null,
  p_faq_question_fingerprint text default null,
  p_detected_module_id uuid default null,
  p_detected_submodule_id uuid default null,
  p_retrieval_scope text default 'current',
  p_quality_signals jsonb default '[]'::jsonb
)
returns table (
  answer_message_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed_answer_message_id uuid;
  target_turn public.consultation_turns%rowtype;
  normalized_signals text[] := array[]::text[];
  normalized_excerpts jsonb := '{}'::jsonb;
  signal_payload jsonb;
  raw_excerpts jsonb;
  signal_item jsonb;
  signal_name text;
  excerpt_key text;
  excerpt_value jsonb;
  excerpt_text text;
  existing_signal text;
begin
  perform private.require_active_consultation_user(p_user_id);

  if p_retrieval_scope not in ('current', 'historical', 'archived_explicit') then
    raise exception using errcode = '22023', message = 'The retrieval scope is invalid';
  end if;

  if p_quality_signals is null then
    raise exception using errcode = '22023', message = 'Consultation quality signals are required';
  end if;

  -- The original array shape remains accepted for compatibility. New callers
  -- may additionally pass bounded answer excerpts as
  -- { signals: [...], excerpts: { signal: "answer fragment" } }.
  if jsonb_typeof(p_quality_signals) = 'array' then
    signal_payload := p_quality_signals;
    raw_excerpts := '{}'::jsonb;
  elsif jsonb_typeof(p_quality_signals) = 'object' then
    signal_payload := coalesce(p_quality_signals -> 'signals', '[]'::jsonb);
    raw_excerpts := coalesce(p_quality_signals -> 'excerpts', '{}'::jsonb);
    if jsonb_typeof(signal_payload) <> 'array'
      or jsonb_typeof(raw_excerpts) <> 'object' then
      raise exception using errcode = '22023', message = 'Consultation quality payload is invalid';
    end if;
  else
    raise exception using errcode = '22023', message = 'Consultation quality signals must be an array';
  end if;

  perform private.validate_consultation_routing(
    p_detected_module_id,
    p_detected_submodule_id,
    null
  );

  select * into target_turn
  from public.consultation_turns as turn
  where turn.user_message_id = p_user_message_id
    and turn.user_id = p_user_id
    and turn.conversation_id = p_conversation_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Consultation turn was not found';
  end if;

  select completed.answer_message_id into completed_answer_message_id
  from public.complete_chat_turn_with_learning_v2(
    p_user_id,
    p_conversation_id,
    p_user_message_id,
    p_answer_role,
    p_answer,
    p_sources,
    p_unanswered_reason,
    p_top_relevance_score,
    p_faq_question_fingerprint
  ) as completed;

  perform private.validate_consultation_answer_routing(
    completed_answer_message_id,
    p_detected_module_id,
    p_detected_submodule_id
  );

  for signal_item in select value from jsonb_array_elements(signal_payload) as item(value) loop
    signal_name := nullif(btrim(signal_item #>> '{}'), '');
    if signal_name is null
      or signal_name not in (
        'support_insufficient',
        'support_partial',
        'stale_document',
        'citation_insufficient',
        'possible_contradiction',
        'low_confidence',
        'technical_error',
        'ambiguous_request'
      ) then
      raise exception using errcode = '22023', message = 'A consultation quality signal is invalid';
    end if;
    if not (signal_name = any(normalized_signals)) then
      normalized_signals := array_append(normalized_signals, signal_name);
    end if;
  end loop;

  if p_answer_role = 'no_evidence'
    and not ('support_insufficient' = any(normalized_signals)) then
    normalized_signals := array_append(normalized_signals, 'support_insufficient');
  end if;

  if p_answer_role = 'clarification'
    and not ('ambiguous_request' = any(normalized_signals)) then
    normalized_signals := array_append(normalized_signals, 'ambiguous_request');
  end if;

  if p_answer_role = 'assistant'
    and jsonb_array_length(
      case
        when jsonb_typeof(p_sources) = 'array' then p_sources
        else '[]'::jsonb
      end
    ) = 0
    and not ('support_insufficient' = any(normalized_signals)) then
    normalized_signals := array_append(normalized_signals, 'support_insufficient');
  end if;

  if p_answer_role = 'assistant'
    and not private.consultation_answer_citations_are_complete(p_answer, p_sources)
    and not ('citation_insufficient' = any(normalized_signals)) then
    normalized_signals := array_append(normalized_signals, 'citation_insufficient');
  end if;

  if p_answer_role = 'assistant'
    and private.consultation_answer_has_uncited_substantive_paragraph(p_answer)
    and not ('support_partial' = any(normalized_signals)) then
    normalized_signals := array_append(normalized_signals, 'support_partial');
  end if;

  if p_answer_role = 'assistant'
    and p_retrieval_scope = 'current'
    and exists (
      select 1
      from public.chat_message_sources as source
      where source.message_id = completed_answer_message_id
        and source.document_situation <> 'current'
    )
    and not ('stale_document' = any(normalized_signals)) then
    normalized_signals := array_append(normalized_signals, 'stale_document');
  end if;

  if p_answer_role = 'assistant'
    and private.consultation_has_possible_contradiction(completed_answer_message_id)
    and not ('possible_contradiction' = any(normalized_signals)) then
    normalized_signals := array_append(normalized_signals, 'possible_contradiction');
  end if;

  for excerpt_key, excerpt_value in
    select key, value from jsonb_each(raw_excerpts)
  loop
    excerpt_text := nullif(btrim(excerpt_value #>> '{}'), '');
    if excerpt_key not in (
      'support_insufficient', 'support_partial', 'stale_document',
      'citation_insufficient', 'possible_contradiction', 'low_confidence',
      'technical_error', 'ambiguous_request'
    )
      or not (excerpt_key = any(normalized_signals))
      or jsonb_typeof(excerpt_value) <> 'string'
      or excerpt_text is null
      or char_length(excerpt_text) > 2_000 then
      raise exception using errcode = '22023', message = 'A consultation quality excerpt is invalid';
    end if;
    normalized_excerpts := normalized_excerpts || jsonb_build_object(excerpt_key, excerpt_text);
  end loop;

  update public.consultation_turns
  set
    answer_message_id = completed_answer_message_id,
    answer_role = p_answer_role,
    detected_module_id = p_detected_module_id,
    detected_submodule_id = p_detected_submodule_id,
    retrieval_scope = p_retrieval_scope,
    top_relevance_score = p_top_relevance_score,
    quality_signals = to_jsonb(normalized_signals),
    quality_excerpts = normalized_excerpts,
    completed_at = now()
  where id = target_turn.id;

  foreach existing_signal in array normalized_signals loop
    perform private.create_automatic_consultation_case(
      target_turn.id,
      existing_signal::public.consultation_case_issue
    );
  end loop;

  return query select completed_answer_message_id;
end;
$$;

revoke all on function private.consultation_answer_citations_are_complete(text, jsonb) from public, anon, authenticated;
revoke all on function private.consultation_answer_has_uncited_substantive_paragraph(text) from public, anon, authenticated;
revoke all on function private.consultation_has_possible_contradiction(uuid) from public, anon, authenticated;
revoke all on function private.create_automatic_consultation_case(uuid, public.consultation_case_issue) from public, anon, authenticated;
revoke all on function public.begin_chat_turn_with_consultation_routing(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.complete_chat_turn_with_consultation_case(
  uuid, uuid, uuid, public.chat_message_role, text, jsonb,
  public.unanswered_question_reason, real, text, uuid, uuid, text, jsonb
) from public, anon, authenticated;
grant execute on function public.begin_chat_turn_with_consultation_routing(uuid, uuid, uuid, text) to service_role;
grant execute on function public.complete_chat_turn_with_consultation_case(
  uuid, uuid, uuid, public.chat_message_role, text, jsonb,
  public.unanswered_question_reason, real, text, uuid, uuid, text, jsonb
) to service_role;

create or replace function public.record_consultation_technical_failure(
  p_user_id uuid,
  p_conversation_id uuid,
  p_user_message_id uuid,
  p_error_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_turn public.consultation_turns%rowtype;
  normalized_error_code text := nullif(btrim(coalesce(p_error_code, '')), '');
begin
  perform private.require_active_consultation_user(p_user_id);

  if normalized_error_code is null
    or char_length(normalized_error_code) not between 1 and 100
    or normalized_error_code !~ '^[A-Z0-9_]+$' then
    raise exception using errcode = '22023', message = 'The technical error code is invalid';
  end if;

  select * into target_turn
  from public.consultation_turns as turn
  where turn.user_id = p_user_id
    and turn.conversation_id = p_conversation_id
    and turn.user_message_id = p_user_message_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Consultation turn was not found';
  end if;

  update public.consultation_turns
  set
    quality_signals = (
      select to_jsonb(array_agg(distinct signal order by signal))
      from unnest(
        array_append(
          array(
            select jsonb_array_elements_text(target_turn.quality_signals)
          ),
          'technical_error'
        )
      ) as signal
    ),
    completed_at = coalesce(completed_at, now())
  where id = target_turn.id;

  perform private.create_automatic_consultation_case(
    target_turn.id,
    'technical_error'
  );

  update public.consultation_cases
  set review_excerpt = 'La consulta no se completó por un fallo técnico (' || normalized_error_code || ') y requiere seguimiento.'
  where consultation_turn_id = target_turn.id
    and kind = 'automatic_alert'
    and issue_type = 'technical_error';
end;
$$;

create or replace function public.create_teacher_consultation_case(
  p_user_id uuid,
  p_kind public.consultation_case_kind,
  p_answer_message_id uuid default null,
  p_conversation_id uuid default null,
  p_report_reason public.consultation_report_reason default null,
  p_comment text default null,
  p_client_submission_id uuid default null
)
returns table (
  consultation_case_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_comment text := nullif(btrim(coalesce(p_comment, '')), '');
  target_case_id uuid;
  existing_case public.consultation_cases%rowtype;
  target_conversation public.chat_conversations%rowtype;
  target_answer public.chat_messages%rowtype;
  target_question public.chat_messages%rowtype;
  target_turn public.consultation_turns%rowtype;
  requested_context record;
  detected_context record;
begin
  perform private.require_active_consultation_user(p_user_id);

  if p_kind not in ('teacher_report', 'teacher_suggestion') then
    raise exception using errcode = '22023', message = 'The teacher case kind is invalid';
  end if;
  if p_client_submission_id is null then
    raise exception using errcode = '22023', message = 'A submission identifier is required';
  end if;
  if normalized_comment is not null
    and char_length(normalized_comment) not between 1 and 2_000 then
    raise exception using errcode = '22023', message = 'The teacher comment is invalid';
  end if;

  select * into existing_case
  from public.consultation_cases as existing
  where existing.client_submission_id = p_client_submission_id;
  if found then
    if existing_case.user_id <> p_user_id or existing_case.kind <> p_kind then
      raise exception using errcode = '23505', message = 'The submission identifier conflicts with an existing case';
    end if;
    return query select existing_case.id;
    return;
  end if;

  if p_kind = 'teacher_report' then
    if p_answer_message_id is null or p_report_reason is null then
      raise exception using errcode = '22023', message = 'A report requires its answer and reason';
    end if;

    select conversation.* into target_conversation
    from public.chat_messages as answer
    join public.chat_conversations as conversation on conversation.id = answer.conversation_id
    where answer.id = p_answer_message_id
      and answer.role in ('assistant', 'clarification', 'no_evidence')
      and answer.in_reply_to_message_id is not null
      and conversation.user_id = p_user_id
      and not conversation.is_deleted
    for update of conversation;

    if not found then
      raise exception using errcode = 'P0002', message = 'The report answer was not found';
    end if;

    select * into target_answer
    from public.chat_messages
    where id = p_answer_message_id;
    select * into target_question
    from public.chat_messages
    where id = target_answer.in_reply_to_message_id
      and conversation_id = target_conversation.id
      and role = 'user';
    if not found then
      raise exception using errcode = 'P0002', message = 'The canonical report question was not found';
    end if;

    select * into target_turn
    from public.consultation_turns as turn
    where turn.user_message_id = target_question.id;

    if target_turn.requested_module_id is not null then
      select * into requested_context
      from private.consultation_module_context(target_turn.requested_module_id);
    elsif target_conversation.selected_module_id is not null then
      select * into requested_context
      from private.consultation_module_context(target_conversation.selected_module_id);
    end if;
    if target_turn.detected_module_id is not null then
      select * into detected_context
      from private.consultation_module_context(
        coalesce(target_turn.detected_submodule_id, target_turn.detected_module_id)
      );
    end if;

    insert into public.consultation_cases (
      kind,
      issue_type,
      consultation_turn_id,
      conversation_id,
      user_id,
      user_message_id,
      answer_message_id,
      requested_module_id,
      detected_module_id,
      detected_submodule_id,
      requested_module_name,
      detected_module_name,
      detected_submodule_name,
      retrieval_scope,
      top_relevance_score,
      question_snapshot,
      answer_snapshot,
      report_reason,
      reporter_comment,
      client_submission_id,
      snapshot_complete
    )
    values (
      'teacher_report',
      'teacher_report',
      target_turn.id,
      target_conversation.id,
      p_user_id,
      target_question.id,
      target_answer.id,
      coalesce(target_turn.requested_module_id, target_conversation.selected_module_id),
      target_turn.detected_module_id,
      target_turn.detected_submodule_id,
      requested_context.root_module_name,
      detected_context.root_module_name,
      detected_context.submodule_name,
      target_turn.retrieval_scope,
      target_turn.top_relevance_score,
      target_question.content,
      target_answer.content,
      p_report_reason,
      normalized_comment,
      p_client_submission_id,
      target_turn.id is not null
    )
    returning id into target_case_id;

    perform private.snapshot_consultation_case_sources(target_case_id, target_answer.id);
  else
    if normalized_comment is null then
      raise exception using errcode = '22023', message = 'A suggestion requires a comment';
    end if;
    if p_report_reason is not null or p_answer_message_id is not null then
      raise exception using errcode = '22023', message = 'A suggestion cannot report an answer';
    end if;

    if p_conversation_id is not null then
      select * into target_conversation
      from public.chat_conversations as conversation
      where conversation.id = p_conversation_id
        and conversation.user_id = p_user_id
        and not conversation.is_deleted;
      if not found then
        raise exception using errcode = 'P0002', message = 'The suggestion conversation was not found';
      end if;
      if target_conversation.selected_module_id is not null then
        select * into requested_context
        from private.consultation_module_context(target_conversation.selected_module_id);
      end if;
    end if;

    insert into public.consultation_cases (
      kind,
      issue_type,
      conversation_id,
      user_id,
      requested_module_id,
      requested_module_name,
      reporter_comment,
      client_submission_id,
      snapshot_complete
    )
    values (
      'teacher_suggestion',
      'teacher_suggestion',
      target_conversation.id,
      p_user_id,
      target_conversation.selected_module_id,
      requested_context.root_module_name,
      normalized_comment,
      p_client_submission_id,
      true
    )
    returning id into target_case_id;
  end if;

  perform private.insert_consultation_case_event(
    target_case_id,
    p_user_id,
    'case_created',
    null,
    jsonb_build_object('origin', p_kind::text)
  );

  return query select target_case_id;
end;
$$;

create or replace function public.authorize_teacher_consultation_case_attachment(
  p_user_id uuid,
  p_consultation_case_id uuid,
  p_attachment_kind public.consultation_attachment_kind
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_active_consultation_user(p_user_id);

  if not exists (
    select 1
    from public.consultation_cases as consultation_case
    where consultation_case.id = p_consultation_case_id
      and consultation_case.user_id = p_user_id
      and consultation_case.status in ('pending', 'in_review')
      and (
        (consultation_case.kind = 'teacher_report' and p_attachment_kind = 'report_image')
        or (consultation_case.kind = 'teacher_suggestion' and p_attachment_kind = 'suggestion_file')
      )
  ) then
    raise exception using errcode = '42501', message = 'The attachment is not allowed for this consultation case';
  end if;
end;
$$;

create or replace function public.register_teacher_consultation_case_attachment(
  p_user_id uuid,
  p_consultation_case_id uuid,
  p_attachment_kind public.consultation_attachment_kind,
  p_storage_path text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256 text
)
returns table (
  attachment_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_attachment_id uuid;
begin
  perform public.authorize_teacher_consultation_case_attachment(
    p_user_id,
    p_consultation_case_id,
    p_attachment_kind
  );

  if p_storage_path is null
    or p_storage_path <> (
      p_consultation_case_id::text || '/' || p_sha256 || case p_mime_type
        when 'image/jpeg' then '.jpg'
        when 'image/png' then '.png'
        when 'image/webp' then '.webp'
        when 'application/pdf' then '.pdf'
        when 'application/msword' then '.doc'
        when 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then '.docx'
        else ''
      end
    )
    or p_original_file_name is null
    or char_length(btrim(p_original_file_name)) not between 1 and 255
    or p_mime_type not in (
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    or p_file_size_bytes not between 1 and 10485760
    or p_sha256 is null
    or p_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'The attachment metadata is invalid';
  end if;

  if p_attachment_kind = 'report_image' and p_mime_type not in ('image/jpeg', 'image/png', 'image/webp') then
    raise exception using errcode = '22023', message = 'A report attachment must be an image';
  end if;

  if p_attachment_kind = 'report_image' and exists (
    select 1
    from public.consultation_case_attachments as attachment
    where attachment.consultation_case_id = p_consultation_case_id
      and attachment.attachment_kind = 'report_image'
      and attachment.sha256 <> p_sha256
  ) then
    raise exception using
      errcode = '23505',
      message = 'A report can have only one image attachment';
  end if;

  insert into public.consultation_case_attachments (
    consultation_case_id,
    uploaded_by,
    attachment_kind,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes,
    sha256
  )
  values (
    p_consultation_case_id,
    p_user_id,
    p_attachment_kind,
    p_storage_path,
    btrim(p_original_file_name),
    p_mime_type,
    p_file_size_bytes,
    p_sha256
  )
  on conflict (consultation_case_id, attachment_kind, sha256) do nothing
  returning id into created_attachment_id;

  if created_attachment_id is null then
    select attachment.id into created_attachment_id
    from public.consultation_case_attachments as attachment
    where attachment.consultation_case_id = p_consultation_case_id
      and attachment.attachment_kind = p_attachment_kind
      and attachment.sha256 = p_sha256;
  else
    perform private.insert_consultation_case_event(
      p_consultation_case_id,
      p_user_id,
      'note_added',
      null,
      jsonb_build_object(
        'attachmentId', created_attachment_id,
        'attachmentKind', p_attachment_kind::text,
        'mimeType', p_mime_type,
        'origin', 'teacher_upload'
      )
    );
  end if;

  return query select created_attachment_id;
end;
$$;

revoke all on function public.record_consultation_technical_failure(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.create_teacher_consultation_case(
  uuid, public.consultation_case_kind, uuid, uuid,
  public.consultation_report_reason, text, uuid
) from public, anon, authenticated;
revoke all on function public.authorize_teacher_consultation_case_attachment(
  uuid, uuid, public.consultation_attachment_kind
) from public, anon, authenticated;
revoke all on function public.register_teacher_consultation_case_attachment(
  uuid, uuid, public.consultation_attachment_kind, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.record_consultation_technical_failure(uuid, uuid, uuid, text) to service_role;
grant execute on function public.create_teacher_consultation_case(
  uuid, public.consultation_case_kind, uuid, uuid,
  public.consultation_report_reason, text, uuid
) to service_role;
grant execute on function public.authorize_teacher_consultation_case_attachment(
  uuid, uuid, public.consultation_attachment_kind
) to service_role;
grant execute on function public.register_teacher_consultation_case_attachment(
  uuid, uuid, public.consultation_attachment_kind, text, text, text, bigint, text
) to service_role;

drop trigger if exists consultation_cases_set_updated_at on public.consultation_cases;
create trigger consultation_cases_set_updated_at
before update on public.consultation_cases
for each row execute procedure private.set_updated_at();

create or replace function public.get_consultation_reports_dashboard(
  p_actor_id uuid,
  p_period text default 'month'
)
returns table (
  period text,
  period_start timestamptz,
  period_end timestamptz,
  total_questions bigint,
  answers_with_incidents bigint,
  no_support bigint,
  teacher_reports bigint,
  teacher_suggestions bigint,
  documents_suggested bigint,
  top_consulted_module jsonb,
  top_consulted_submodule jsonb,
  top_incident_module jsonb,
  top_incident_submodule jsonb,
  consultation_modules jsonb,
  consultation_submodules jsonb,
  incident_modules jsonb,
  incident_submodules jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_at timestamptz;
  -- A dashboard/list call may follow a write in the same transaction.  `now()`
  -- is frozen at transaction start and would exclude that just-created turn
  -- from the half-open reporting range; take one concrete wall-clock boundary.
  end_at timestamptz := clock_timestamp();
  ranked_consultation_modules jsonb;
  ranked_consultation_submodules jsonb;
  ranked_incident_modules jsonb;
  ranked_incident_submodules jsonb;
begin
  perform private.require_active_consultation_administrator(p_actor_id);
  start_at := private.consultation_period_start(p_period);

  select coalesce(jsonb_agg(item.payload order by item.count_value desc, item.name, item.id), '[]'::jsonb)
  into ranked_consultation_modules
  from (
    select
      root.id,
      root.name,
      count(*)::bigint as count_value,
      jsonb_build_object('id', root.id, 'name', root.name, 'count', count(*)::bigint) as payload
    from public.consultation_turns as turn
    cross join lateral private.consultation_module_context(
      coalesce(turn.detected_module_id, turn.requested_module_id)
    ) as route_context
    join public.modules as root on root.id = route_context.root_module_id
    where turn.created_at >= start_at and turn.created_at < end_at
    group by root.id, root.name
    order by count(*) desc, root.name, root.id
    limit 5
  ) as item;

  select coalesce(jsonb_agg(item.payload order by item.count_value desc, item.name, item.id), '[]'::jsonb)
  into ranked_consultation_submodules
  from (
    select
      submodule.id,
      submodule.name,
      count(*)::bigint as count_value,
      jsonb_build_object(
        'id', submodule.id,
        'name', submodule.name,
        'moduleId', root.id,
        'moduleName', root.name,
        'count', count(*)::bigint
      ) as payload
    from public.consultation_turns as turn
    join public.modules as submodule on submodule.id = turn.detected_submodule_id
    join public.modules as root on root.id = turn.detected_module_id
    where turn.created_at >= start_at and turn.created_at < end_at
    group by submodule.id, submodule.name, root.id, root.name
    order by count(*) desc, submodule.name, submodule.id
    limit 5
  ) as item;

  select coalesce(jsonb_agg(item.payload order by item.count_value desc, item.name, item.id), '[]'::jsonb)
  into ranked_incident_modules
  from (
    select
      root.id,
      root.name,
      count(*)::bigint as count_value,
      jsonb_build_object('id', root.id, 'name', root.name, 'count', count(*)::bigint) as payload
    from public.consultation_cases as consultation_case
    cross join lateral private.consultation_module_context(
      coalesce(
        consultation_case.detected_module_id,
        consultation_case.requested_module_id
      )
    ) as route_context
    join public.modules as root on root.id = route_context.root_module_id
    where consultation_case.created_at >= start_at and consultation_case.created_at < end_at
    group by root.id, root.name
    order by count(*) desc, root.name, root.id
    limit 5
  ) as item;

  select coalesce(jsonb_agg(item.payload order by item.count_value desc, item.name, item.id), '[]'::jsonb)
  into ranked_incident_submodules
  from (
    select
      submodule.id,
      submodule.name,
      count(*)::bigint as count_value,
      jsonb_build_object(
        'id', submodule.id,
        'name', submodule.name,
        'moduleId', root.id,
        'moduleName', root.name,
        'count', count(*)::bigint
      ) as payload
    from public.consultation_cases as consultation_case
    join public.modules as submodule on submodule.id = consultation_case.detected_submodule_id
    join public.modules as root on root.id = consultation_case.detected_module_id
    where consultation_case.created_at >= start_at and consultation_case.created_at < end_at
    group by submodule.id, submodule.name, root.id, root.name
    order by count(*) desc, submodule.name, submodule.id
    limit 5
  ) as item;

  return query
  select
    p_period,
    start_at,
    end_at,
    (select count(*) from public.consultation_turns as turn where turn.created_at >= start_at and turn.created_at < end_at),
    (
      select count(distinct consultation_case.consultation_turn_id)
      from public.consultation_cases as consultation_case
      where consultation_case.created_at >= start_at
        and consultation_case.created_at < end_at
        and consultation_case.consultation_turn_id is not null
    ),
    (
      select count(*)
      from public.consultation_cases as consultation_case
      where consultation_case.created_at >= start_at
        and consultation_case.created_at < end_at
        and consultation_case.issue_type = 'support_insufficient'
    ),
    (
      select count(*)
      from public.consultation_cases as consultation_case
      where consultation_case.created_at >= start_at
        and consultation_case.created_at < end_at
        and consultation_case.kind = 'teacher_report'
    ),
    (
      select count(*)
      from public.consultation_cases as consultation_case
      where consultation_case.created_at >= start_at
        and consultation_case.created_at < end_at
        and consultation_case.kind = 'teacher_suggestion'
    ),
    (
      select count(*)
      from public.consultation_case_attachments as attachment
      join public.consultation_cases as consultation_case
        on consultation_case.id = attachment.consultation_case_id
      where attachment.created_at >= start_at
        and attachment.created_at < end_at
        and consultation_case.kind = 'teacher_suggestion'
        and attachment.attachment_kind = 'suggestion_file'
        -- Images are useful suggestion evidence but are not a submitted
        -- document/norm. Keep this metric faithful to its visible label.
        and attachment.mime_type in (
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        )
    ),
    coalesce(ranked_consultation_modules -> 0, 'null'::jsonb),
    coalesce(ranked_consultation_submodules -> 0, 'null'::jsonb),
    coalesce(ranked_incident_modules -> 0, 'null'::jsonb),
    coalesce(ranked_incident_submodules -> 0, 'null'::jsonb),
    ranked_consultation_modules,
    ranked_consultation_submodules,
    ranked_incident_modules,
    ranked_incident_submodules;
end;
$$;

create or replace function public.list_consultation_cases(
  p_actor_id uuid,
  p_period text default 'month',
  p_status text default null,
  p_kind text default null,
  p_issue_type text default null,
  p_module_id uuid default null,
  p_submodule_id uuid default null,
  p_query text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  kind public.consultation_case_kind,
  issue_type public.consultation_case_issue,
  status public.consultation_case_status,
  conversation_id uuid,
  requested_module_id uuid,
  detected_module_id uuid,
  detected_submodule_id uuid,
  requested_module_name text,
  detected_module_name text,
  detected_submodule_name text,
  question_snapshot text,
  answer_snapshot text,
  review_excerpt text,
  report_reason public.consultation_report_reason,
  reporter_comment text,
  top_relevance_score real,
  attachment_count bigint,
  source_count bigint,
  linked_document_count bigint,
  created_at timestamptz,
  updated_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_at timestamptz;
  -- Keep the range boundary current even when the caller created a case in
  -- this transaction immediately before requesting the list.
  end_at timestamptz := clock_timestamp();
  normalized_query text := nullif(btrim(coalesce(p_query, '')), '');
begin
  perform private.require_active_consultation_administrator(p_actor_id);
  start_at := private.consultation_period_start(p_period);

  if p_limit not between 1 and 100 or p_offset < 0 then
    raise exception using errcode = '22023', message = 'The consultation case page is invalid';
  end if;
  if p_status is not null and p_status not in ('pending', 'in_review', 'resolved', 'discarded') then
    raise exception using errcode = '22023', message = 'The consultation case status is invalid';
  end if;
  if p_kind is not null and p_kind not in ('automatic_alert', 'teacher_report', 'teacher_suggestion') then
    raise exception using errcode = '22023', message = 'The consultation case kind is invalid';
  end if;
  if p_issue_type is not null and p_issue_type not in (
    'support_insufficient', 'support_partial', 'stale_document', 'citation_insufficient',
    'possible_contradiction', 'low_confidence', 'technical_error', 'ambiguous_request',
    'teacher_report', 'teacher_suggestion'
  ) then
    raise exception using errcode = '22023', message = 'The consultation case issue is invalid';
  end if;
  if normalized_query is not null and char_length(normalized_query) > 200 then
    raise exception using errcode = '22023', message = 'The consultation search text is invalid';
  end if;

  return query
  with filtered as materialized (
    select consultation_case.*
    from public.consultation_cases as consultation_case
    where consultation_case.created_at >= start_at
      and consultation_case.created_at < end_at
      and (p_status is null or consultation_case.status::text = p_status)
      and (p_kind is null or consultation_case.kind::text = p_kind)
      and (p_issue_type is null or consultation_case.issue_type::text = p_issue_type)
      and (
        p_module_id is null
        or exists (
          select 1
          from private.consultation_module_context(
            coalesce(
              consultation_case.detected_module_id,
              consultation_case.requested_module_id
            )
          ) as route_context
          where route_context.root_module_id = p_module_id
        )
      )
      and (p_submodule_id is null or consultation_case.detected_submodule_id = p_submodule_id)
      and (
        normalized_query is null
        or consultation_case.question_snapshot ilike '%' || normalized_query || '%'
        or consultation_case.answer_snapshot ilike '%' || normalized_query || '%'
        or consultation_case.reporter_comment ilike '%' || normalized_query || '%'
        or consultation_case.review_excerpt ilike '%' || normalized_query || '%'
      )
  ), counted as (
    select filtered.*, count(*) over () as matched_total
    from filtered
  )
  select
    consultation_case.id,
    consultation_case.kind,
    consultation_case.issue_type,
    consultation_case.status,
    consultation_case.conversation_id,
    consultation_case.requested_module_id,
    consultation_case.detected_module_id,
    consultation_case.detected_submodule_id,
    consultation_case.requested_module_name,
    consultation_case.detected_module_name,
    consultation_case.detected_submodule_name,
    consultation_case.question_snapshot,
    consultation_case.answer_snapshot,
    consultation_case.review_excerpt,
    consultation_case.report_reason,
    consultation_case.reporter_comment,
    consultation_case.top_relevance_score,
    coalesce(attachments.count_value, 0)::bigint,
    coalesce(sources.count_value, 0)::bigint,
    coalesce(links.count_value, 0)::bigint,
    consultation_case.created_at,
    consultation_case.updated_at,
    consultation_case.matched_total
  from counted as consultation_case
  left join lateral (
    select count(*)::bigint as count_value
    from public.consultation_case_attachments as attachment
    where attachment.consultation_case_id = consultation_case.id
  ) as attachments on true
  left join lateral (
    select count(*)::bigint as count_value
    from public.consultation_case_sources as source
    where source.consultation_case_id = consultation_case.id
  ) as sources on true
  left join lateral (
    select count(*)::bigint as count_value
    from public.consultation_case_document_links as link
    where link.consultation_case_id = consultation_case.id
  ) as links on true
  order by consultation_case.created_at desc, consultation_case.id desc
  limit p_limit offset p_offset;
end;
$$;

-- A topic is the most specific route the system actually detected. The module
-- initially selected by the teacher is intentionally never used as a topic:
-- it can be unrelated to the question.
create or replace function public.list_consultation_topics(
  p_actor_id uuid,
  p_period text default 'month',
  p_limit integer default 5
)
returns table (
  id uuid,
  name text,
  module_id uuid,
  module_name text,
  topic_kind text,
  count_value bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_at timestamptz;
  end_at timestamptz := clock_timestamp();
begin
  perform private.require_active_consultation_administrator(p_actor_id);
  start_at := private.consultation_period_start(p_period);

  if p_limit not between 1 and 10 then
    raise exception using errcode = '22023', message = 'The consultation topic limit is invalid';
  end if;

  return query
  select
    coalesce(submodule.id, root.id),
    coalesce(submodule.name, root.name),
    root.id,
    root.name,
    case when submodule.id is null then 'module' else 'submodule' end,
    count(*)::bigint
  from public.consultation_turns as turn
  join public.modules as root on root.id = turn.detected_module_id
  left join public.modules as submodule on submodule.id = turn.detected_submodule_id
  where turn.detected_module_id is not null
    and turn.created_at >= start_at
    and turn.created_at < end_at
  group by root.id, root.name, submodule.id, submodule.name
  order by count(*) desc, coalesce(submodule.name, root.name), coalesce(submodule.id, root.id)
  limit p_limit;
end;
$$;

-- The dashboard must expose answers that need a human decision first,
-- independently from its chronological working queue. A response can produce
-- several alerts and a teacher report, so group them by answer to avoid
-- inflating its priority. Resolved/discarded cases and suggestions are not
-- candidates for this answer-quality queue.
drop function if exists public.list_consultation_review_priorities(uuid, text, integer);
create or replace function public.list_consultation_review_priorities(
  p_actor_id uuid,
  p_period text default 'month',
  p_limit integer default 5
)
returns table (
  case_id uuid,
  answer_message_id uuid,
  question_snapshot text,
  answer_snapshot text,
  review_excerpt text,
  detected_module_name text,
  detected_submodule_name text,
  created_at timestamptz,
  issue_types text[],
  open_case_count bigint,
  priority text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_at timestamptz;
  end_at timestamptz := clock_timestamp();
begin
  perform private.require_active_consultation_administrator(p_actor_id);
  start_at := private.consultation_period_start(p_period);

  if p_limit not between 1 and 10 then
    raise exception using errcode = '22023', message = 'The consultation priority limit is invalid';
  end if;

  return query
  with open_answer_cases as materialized (
    select
      consultation_case.*,
      case consultation_case.issue_type
        when 'support_insufficient' then 4
        when 'stale_document' then 4
        when 'possible_contradiction' then 4
        when 'citation_insufficient' then 3
        when 'support_partial' then 3
        when 'teacher_report' then 3
        when 'low_confidence' then 2
        else 0
      end as severity
    from public.consultation_cases as consultation_case
    where consultation_case.created_at >= start_at
      and consultation_case.created_at < end_at
      and consultation_case.status in ('pending', 'in_review')
      and consultation_case.answer_message_id is not null
      and consultation_case.kind in ('automatic_alert', 'teacher_report')
      and consultation_case.issue_type in (
        'support_insufficient', 'stale_document', 'possible_contradiction',
        'citation_insufficient', 'support_partial', 'teacher_report',
        'low_confidence'
      )
  ), grouped as (
    select
      (array_agg(answer_case.id order by answer_case.severity desc, answer_case.created_at asc, answer_case.id))[1] as representative_case_id,
      answer_case.answer_message_id,
      (array_agg(answer_case.question_snapshot order by answer_case.severity desc, answer_case.created_at asc, answer_case.id))[1] as representative_question,
      (array_agg(answer_case.answer_snapshot order by answer_case.severity desc, answer_case.created_at asc, answer_case.id))[1] as representative_answer,
      (array_agg(answer_case.review_excerpt order by answer_case.severity desc, answer_case.created_at asc, answer_case.id))[1] as representative_excerpt,
      (array_agg(answer_case.detected_module_name order by answer_case.severity desc, answer_case.created_at asc, answer_case.id))[1] as representative_module,
      (array_agg(answer_case.detected_submodule_name order by answer_case.severity desc, answer_case.created_at asc, answer_case.id))[1] as representative_submodule,
      min(answer_case.created_at) as first_created_at,
      array_agg(distinct answer_case.issue_type::text order by answer_case.issue_type::text) as grouped_issue_types,
      count(*)::bigint as grouped_case_count,
      count(distinct answer_case.issue_type)::integer as issue_variety,
      max(answer_case.severity) as max_severity
    from open_answer_cases as answer_case
    group by answer_case.answer_message_id
  )
  select
    summary.representative_case_id,
    summary.answer_message_id,
    summary.representative_question,
    summary.representative_answer,
    summary.representative_excerpt,
    summary.representative_module,
    summary.representative_submodule,
    summary.first_created_at,
    summary.grouped_issue_types,
    summary.grouped_case_count,
    case summary.max_severity when 4 then 'critical' when 3 then 'high' else 'medium' end
  from grouped as summary
  order by summary.max_severity desc, summary.issue_variety desc, summary.first_created_at asc, summary.answer_message_id
  limit p_limit;
end;
$$;

revoke all on function public.get_consultation_reports_dashboard(uuid, text) from public, anon, authenticated;
revoke all on function public.list_consultation_cases(
  uuid, text, text, text, text, uuid, uuid, text, integer, integer
) from public, anon, authenticated;
revoke all on function public.list_consultation_topics(uuid, text, integer)
  from public, anon, authenticated;
revoke all on function public.list_consultation_review_priorities(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_consultation_reports_dashboard(uuid, text) to service_role;
grant execute on function public.list_consultation_cases(
  uuid, text, text, text, text, uuid, uuid, text, integer, integer
) to service_role;
grant execute on function public.list_consultation_topics(uuid, text, integer)
  to service_role;
grant execute on function public.list_consultation_review_priorities(uuid, text, integer)
  to service_role;

create or replace function public.get_consultation_case_detail(
  p_actor_id uuid,
  p_consultation_case_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  perform private.require_active_consultation_administrator(p_actor_id);

  select jsonb_build_object(
    'case', jsonb_build_object(
      'id', consultation_case.id,
      'kind', consultation_case.kind,
      'issueType', consultation_case.issue_type,
      'status', consultation_case.status,
      'conversationId', consultation_case.conversation_id,
      'consultationTurnId', consultation_case.consultation_turn_id,
      'requestedModuleId', consultation_case.requested_module_id,
      'detectedModuleId', consultation_case.detected_module_id,
      'detectedSubmoduleId', consultation_case.detected_submodule_id,
      'requestedModuleName', consultation_case.requested_module_name,
      'detectedModuleName', consultation_case.detected_module_name,
      'detectedSubmoduleName', consultation_case.detected_submodule_name,
      'retrievalScope', consultation_case.retrieval_scope,
      'topRelevanceScore', consultation_case.top_relevance_score,
      'questionSnapshot', consultation_case.question_snapshot,
      'answerSnapshot', consultation_case.answer_snapshot,
      'reviewExcerpt', consultation_case.review_excerpt,
      'reportReason', consultation_case.report_reason,
      'reporterComment', consultation_case.reporter_comment,
      'snapshotComplete', consultation_case.snapshot_complete,
      'createdAt', consultation_case.created_at,
      'updatedAt', consultation_case.updated_at
    ),
    'sources', coalesce(sources.items, '[]'::jsonb),
    'attachments', coalesce(attachments.items, '[]'::jsonb),
    'linkedDocuments', coalesce(linked_documents.items, '[]'::jsonb),
    'events', coalesce(events.items, '[]'::jsonb)
  ) into result
  from public.consultation_cases as consultation_case
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', source.id,
      'documentId', source.document_id,
      'documentVersionId', source.document_version_id,
      'documentTitle', source.document_title,
      'documentSituation', source.document_situation,
      'rootModuleId', source.root_module_id,
      'submoduleId', source.submodule_id,
      'versionNumber', source.version_number,
      'pageStart', source.page_start,
      'pageEnd', source.page_end,
      'sectionTitle', source.section_title,
      'articleReference', source.article_reference,
      'numeralReference', source.numeral_reference,
      'evidenceExcerpt', source.evidence_excerpt,
      'relevanceScore', source.relevance_score,
      'sourceRank', source.source_rank
    ) order by source.source_rank, source.id) as items
    from public.consultation_case_sources as source
    where source.consultation_case_id = consultation_case.id
  ) as sources on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', attachment.id,
      'attachmentKind', attachment.attachment_kind,
      'originalFileName', attachment.original_file_name,
      'mimeType', attachment.mime_type,
      'fileSizeBytes', attachment.file_size_bytes,
      'sha256', attachment.sha256,
      'disposition', attachment.disposition,
      'incorporatedDocumentId', attachment.incorporated_document_id,
      'createdAt', attachment.created_at
    ) order by attachment.created_at, attachment.id) as items
    from public.consultation_case_attachments as attachment
    where attachment.consultation_case_id = consultation_case.id
  ) as attachments on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', document.id,
      'title', document.title,
      'situation', document.situation,
      'publicationStatus', document.publication_status,
      'linkedAt', link.linked_at,
      'linkedBy', link.linked_by
    ) order by link.linked_at desc, document.id) as items
    from public.consultation_case_document_links as link
    join public.documents as document on document.id = link.document_id
    where link.consultation_case_id = consultation_case.id
  ) as linked_documents on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', event.id,
      'eventType', event.event_type,
      'note', event.note,
      'metadata', event.metadata,
      'actorId', event.actor_id,
      'actorName', profile.full_name,
      'createdAt', event.created_at
    ) order by event.created_at, event.id) as items
    from public.consultation_case_events as event
    left join public.profiles as profile on profile.id = event.actor_id
    where event.consultation_case_id = consultation_case.id
  ) as events on true
  where consultation_case.id = p_consultation_case_id;

  if result is null then
    raise exception using errcode = 'P0002', message = 'Consultation case was not found';
  end if;

  return result;
end;
$$;

create or replace function public.update_consultation_case(
  p_actor_id uuid,
  p_consultation_case_id uuid,
  p_status text default null,
  p_note text default null,
  p_change_routing boolean default false,
  p_detected_module_id uuid default null,
  p_detected_submodule_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.consultation_cases%rowtype;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
  routing_context record;
  previous_status public.consultation_case_status;
begin
  perform private.require_active_consultation_administrator(p_actor_id);

  if p_status is not null and p_status not in ('pending', 'in_review', 'resolved', 'discarded') then
    raise exception using errcode = '22023', message = 'The consultation case status is invalid';
  end if;
  if normalized_note is not null and char_length(normalized_note) not between 1 and 2_000 then
    raise exception using errcode = '22023', message = 'The consultation case note is invalid';
  end if;
  if p_status is null and normalized_note is null and not p_change_routing then
    raise exception using errcode = '22023', message = 'The consultation case update has no effect';
  end if;

  select * into target_case
  from public.consultation_cases as consultation_case
  where consultation_case.id = p_consultation_case_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Consultation case was not found';
  end if;

  previous_status := target_case.status;

  if p_change_routing then
    perform private.validate_consultation_routing(
      p_detected_module_id,
      p_detected_submodule_id,
      null
    );
    if p_detected_module_id is not null then
      select * into routing_context
      from private.consultation_module_context(
        coalesce(p_detected_submodule_id, p_detected_module_id)
      );
    end if;
    update public.consultation_cases
    set
      detected_module_id = p_detected_module_id,
      detected_submodule_id = p_detected_submodule_id,
      detected_module_name = routing_context.root_module_name,
      detected_submodule_name = routing_context.submodule_name
    where id = target_case.id;
    perform private.insert_consultation_case_event(
      target_case.id,
      p_actor_id,
      'routing_corrected',
      null,
      jsonb_build_object(
        'previousModuleId', target_case.detected_module_id,
        'previousSubmoduleId', target_case.detected_submodule_id,
        'moduleId', p_detected_module_id,
        'submoduleId', p_detected_submodule_id
      )
    );
  end if;

  if p_status is not null and p_status::public.consultation_case_status is distinct from previous_status then
    update public.consultation_cases
    set status = p_status::public.consultation_case_status
    where id = target_case.id;
    perform private.insert_consultation_case_event(
      target_case.id,
      p_actor_id,
      'status_changed',
      null,
      jsonb_build_object('previousStatus', previous_status::text, 'status', p_status)
    );
  end if;

  if normalized_note is not null then
    perform private.insert_consultation_case_event(
      target_case.id,
      p_actor_id,
      'note_added',
      normalized_note,
      '{}'::jsonb
    );
  end if;
end;
$$;

create or replace function public.link_consultation_case_document(
  p_actor_id uuid,
  p_consultation_case_id uuid,
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer := 0;
begin
  perform private.require_active_consultation_administrator(p_actor_id);

  if not exists (
    select 1 from public.consultation_cases where id = p_consultation_case_id
  ) then
    raise exception using errcode = 'P0002', message = 'Consultation case was not found';
  end if;
  if not exists (
    select 1 from public.documents where id = p_document_id and not is_deleted
  ) then
    raise exception using errcode = 'P0002', message = 'The document was not found';
  end if;

  insert into public.consultation_case_document_links (
    consultation_case_id,
    document_id,
    linked_by
  )
  values (p_consultation_case_id, p_document_id, p_actor_id)
  on conflict do nothing;
  get diagnostics affected_rows = row_count;

  if affected_rows > 0 then
    perform private.insert_consultation_case_event(
      p_consultation_case_id,
      p_actor_id,
      'document_linked',
      null,
      jsonb_build_object('documentId', p_document_id)
    );
  end if;
end;
$$;

create or replace function public.unlink_consultation_case_document(
  p_actor_id uuid,
  p_consultation_case_id uuid,
  p_document_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer := 0;
begin
  perform private.require_active_consultation_administrator(p_actor_id);

  delete from public.consultation_case_document_links
  where consultation_case_id = p_consultation_case_id
    and document_id = p_document_id;
  get diagnostics affected_rows = row_count;

  if affected_rows = 0 then
    raise exception using errcode = 'P0002', message = 'The document link was not found';
  end if;

  perform private.insert_consultation_case_event(
    p_consultation_case_id,
    p_actor_id,
    'document_unlinked',
    null,
    jsonb_build_object('documentId', p_document_id)
  );
end;
$$;

create or replace function public.decide_consultation_case_attachment(
  p_actor_id uuid,
  p_consultation_case_id uuid,
  p_attachment_id uuid,
  p_disposition text,
  p_document_id uuid default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attachment public.consultation_case_attachments%rowtype;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
begin
  perform private.require_active_consultation_administrator(p_actor_id);

  if p_disposition not in ('incorporated', 'not_incorporated') then
    raise exception using errcode = '22023', message = 'The attachment decision is invalid';
  end if;
  if normalized_note is not null and char_length(normalized_note) not between 1 and 2_000 then
    raise exception using errcode = '22023', message = 'The attachment decision note is invalid';
  end if;

  select * into target_attachment
  from public.consultation_case_attachments as attachment
  where attachment.id = p_attachment_id
    and attachment.consultation_case_id = p_consultation_case_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'The consultation attachment was not found';
  end if;

  if p_disposition = 'incorporated' then
    if target_attachment.attachment_kind <> 'suggestion_file' then
      raise exception using
        errcode = '22023',
        message = 'Only a suggested document may be incorporated';
    end if;
    if p_document_id is null or not exists (
      select 1
      from public.consultation_case_document_links as link
      where link.consultation_case_id = p_consultation_case_id
        and link.document_id = p_document_id
    ) then
      raise exception using errcode = '23503', message = 'An incorporated attachment requires a linked document';
    end if;
  elsif p_document_id is not null then
    raise exception using errcode = '22023', message = 'Only an incorporated attachment may reference a document';
  end if;

  update public.consultation_case_attachments
  set
    disposition = p_disposition::public.consultation_attachment_disposition,
    incorporated_document_id = p_document_id
  where id = target_attachment.id;

  perform private.insert_consultation_case_event(
    p_consultation_case_id,
    p_actor_id,
    'attachment_decided',
    normalized_note,
    jsonb_build_object(
      'attachmentId', target_attachment.id,
      'previousDisposition', target_attachment.disposition::text,
      'disposition', p_disposition,
      'documentId', p_document_id
    )
  );
end;
$$;

create or replace function public.authorize_consultation_case_attachment_download(
  p_actor_id uuid,
  p_consultation_case_id uuid,
  p_attachment_id uuid
)
returns table (
  storage_bucket text,
  storage_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_attachment public.consultation_case_attachments%rowtype;
begin
  perform private.require_active_consultation_administrator(p_actor_id);

  select * into target_attachment
  from public.consultation_case_attachments as attachment
  where attachment.id = p_attachment_id
    and attachment.consultation_case_id = p_consultation_case_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'The consultation attachment was not found';
  end if;

  perform private.insert_consultation_case_event(
    p_consultation_case_id,
    p_actor_id,
    'attachment_accessed',
    null,
    jsonb_build_object('attachmentId', target_attachment.id)
  );

  return query select target_attachment.storage_bucket, target_attachment.storage_path;
end;
$$;

revoke all on function public.get_consultation_case_detail(uuid, uuid) from public, anon, authenticated;
revoke all on function public.update_consultation_case(uuid, uuid, text, text, boolean, uuid, uuid) from public, anon, authenticated;
revoke all on function public.link_consultation_case_document(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.unlink_consultation_case_document(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.decide_consultation_case_attachment(uuid, uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.authorize_consultation_case_attachment_download(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.get_consultation_case_detail(uuid, uuid) to service_role;
grant execute on function public.update_consultation_case(uuid, uuid, text, text, boolean, uuid, uuid) to service_role;
grant execute on function public.link_consultation_case_document(uuid, uuid, uuid) to service_role;
grant execute on function public.unlink_consultation_case_document(uuid, uuid, uuid) to service_role;
grant execute on function public.decide_consultation_case_attachment(uuid, uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.authorize_consultation_case_attachment_download(uuid, uuid, uuid) to service_role;

-- Keep the discreet detected route visible after the teacher reloads a
-- conversation. The route is derived only from the immutable turn owned by
-- the already-authorized conversation; it does not expose another user's data.
create or replace function public.get_chat_conversation(
  p_user_id uuid,
  p_conversation_id uuid,
  p_limit integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.chat_conversations%rowtype;
  result jsonb;
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Message limit must be between 1 and 100';
  end if;

  select * into target_conversation
  from public.chat_conversations
  where id = p_conversation_id
    and user_id = p_user_id
    and not is_deleted;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat conversation was not found';
  end if;

  with recent_messages as (
    select *
    from public.chat_messages
    where conversation_id = target_conversation.id
    order by created_at desc, id desc
    limit p_limit
  ), ordered_messages as (
    select * from recent_messages order by created_at, id
  )
  select jsonb_build_object(
    'conversation', jsonb_build_object(
      'id', target_conversation.id,
      'selectedModuleId', target_conversation.selected_module_id,
      'title', target_conversation.title,
      'createdAt', target_conversation.created_at,
      'updatedAt', target_conversation.updated_at
    ),
    'messages', coalesce(jsonb_agg(jsonb_build_object(
      'id', message.id,
      'inReplyToMessageId', message.in_reply_to_message_id,
      'role', message.role,
      'content', message.content,
      'createdAt', message.created_at,
      'sources', coalesce(sources.items, '[]'::jsonb)
    ) order by message.created_at, message.id), '[]'::jsonb)
  ) into result
  from ordered_messages as message
  left join public.consultation_turns as consultation_turn
    on consultation_turn.answer_message_id = message.id
  left join public.modules as detected_module
    on detected_module.id = consultation_turn.detected_module_id
  left join public.modules as detected_submodule
    on detected_submodule.id = consultation_turn.detected_submodule_id
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', source.id,
      'rank', source.source_rank,
      'documentTitle', source.document_title,
      'documentSituation', source.document_situation,
      'moduleName', source.module_name,
      'relatedModuleName', detected_module.name,
      'relatedSubmoduleName', detected_submodule.name,
      'versionNumber', source.version_number,
      'pageStart', source.page_start,
      'pageEnd', source.page_end,
      'sectionTitle', source.section_title,
      'articleReference', source.article_reference,
      'numeralReference', source.numeral_reference,
      'relevanceScore', source.relevance_score
    ) order by source.source_rank) as items
    from public.chat_message_sources as source
    where source.message_id = message.id
  ) as sources on true;

  return result;
end;
$$;

revoke all on function public.get_chat_conversation(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_chat_conversation(uuid, uuid, integer)
  to service_role;

-- Backfill every canonical user turn, not only the legacy unanswered queue.
-- That keeps the first dashboard accurate for the currently selected period
-- while preserving the historical queue as a separate compatibility source
-- for automatic cases below. Existing rows win, so this remains idempotent.
insert into public.consultation_turns (
  conversation_id,
  user_id,
  user_message_id,
  answer_message_id,
  requested_module_id,
  retrieval_scope,
  top_relevance_score,
  answer_role,
  quality_signals,
  created_at,
  completed_at
)
select
  conversation.id,
  conversation.user_id,
  question.id,
  answer.id,
  conversation.selected_module_id,
  'current',
  unanswered.top_relevance_score,
  answer.role,
  to_jsonb(array_remove(array[
    case unanswered.reason
      when 'insufficient_evidence' then 'support_insufficient'
      when 'ambiguous_request' then 'ambiguous_request'
    end
  ], null)),
  question.created_at,
  answer.created_at
from public.chat_messages as question
join public.chat_conversations as conversation
  on conversation.id = question.conversation_id
left join public.unanswered_questions as unanswered
  on unanswered.message_id = question.id
left join lateral (
  select reply.*
  from public.chat_messages as reply
  where reply.conversation_id = conversation.id
    and reply.in_reply_to_message_id = question.id
    and reply.role in ('assistant', 'clarification', 'no_evidence')
  order by reply.created_at, reply.id
  limit 1
) as answer on true
where question.role = 'user'
on conflict (user_message_id) do nothing;

insert into public.consultation_cases (
  kind,
  issue_type,
  status,
  legacy_unanswered_question_id,
  consultation_turn_id,
  conversation_id,
  user_id,
  user_message_id,
  answer_message_id,
  requested_module_id,
  requested_module_name,
  retrieval_scope,
  top_relevance_score,
  question_snapshot,
  answer_snapshot,
  review_excerpt,
  snapshot_complete,
  created_at,
  updated_at
)
select
  'automatic_alert',
  case unanswered.reason
    when 'insufficient_evidence' then 'support_insufficient'::public.consultation_case_issue
    when 'ambiguous_request' then 'ambiguous_request'::public.consultation_case_issue
  end,
  case unanswered.status
    when 'pending_review' then 'pending'::public.consultation_case_status
    when 'resolved' then 'resolved'::public.consultation_case_status
    when 'dismissed' then 'discarded'::public.consultation_case_status
  end,
  unanswered.id,
  turn.id,
  unanswered.conversation_id,
  unanswered.user_id,
  unanswered.message_id,
  turn.answer_message_id,
  unanswered.selected_module_id,
  module_context.root_module_name,
  turn.retrieval_scope,
  unanswered.top_relevance_score,
  question.content,
  answer.content,
  unanswered.question,
  question.id is not null,
  unanswered.created_at,
  coalesce(unanswered.reviewed_at, unanswered.created_at)
from public.unanswered_questions as unanswered
left join public.consultation_turns as turn on turn.user_message_id = unanswered.message_id
left join public.chat_messages as question on question.id = unanswered.message_id
left join public.chat_messages as answer on answer.id = turn.answer_message_id
left join lateral (
  select *
  from private.consultation_module_context(unanswered.selected_module_id)
) as module_context on unanswered.selected_module_id is not null
on conflict (legacy_unanswered_question_id) do nothing;

insert into public.consultation_case_sources (
  consultation_case_id,
  chat_source_id,
  document_id,
  document_version_id,
  root_module_id,
  submodule_id,
  document_title,
  document_situation,
  version_number,
  page_start,
  page_end,
  section_title,
  article_reference,
  numeral_reference,
  evidence_excerpt,
  relevance_score,
  source_rank
)
select
  consultation_case.id,
  source.id,
  source.document_id,
  source.document_version_id,
  coalesce(parent.id, source_module.id),
  case when parent.id is null then null else source_module.id end,
  source.document_title,
  source.document_situation,
  source.version_number,
  source.page_start,
  source.page_end,
  source.section_title,
  source.article_reference,
  source.numeral_reference,
  nullif(left(chunk.chunk_content, 2_000), ''),
  source.relevance_score,
  source.source_rank
from public.consultation_cases as consultation_case
join public.chat_message_sources as source on source.message_id = consultation_case.answer_message_id
left join public.document_chunks as chunk on chunk.id = source.chunk_id
left join public.modules as source_module on source_module.id = source.module_id
left join public.modules as parent on parent.id = source_module.parent_module_id
where consultation_case.legacy_unanswered_question_id is not null
on conflict (consultation_case_id, chat_source_id) do nothing;

insert into public.consultation_case_events (
  consultation_case_id,
  actor_id,
  event_type,
  note,
  metadata
)
select
  consultation_case.id,
  null,
  'case_created',
  null,
  jsonb_build_object('origin', 'legacy_unanswered_question')
from public.consultation_cases as consultation_case
where consultation_case.legacy_unanswered_question_id is not null
  and not exists (
    select 1
    from public.consultation_case_events as event
    where event.consultation_case_id = consultation_case.id
      and event.event_type = 'case_created'
      and event.metadata ->> 'origin' = 'legacy_unanswered_question'
  );

insert into public.consultation_case_events (
  consultation_case_id,
  actor_id,
  event_type,
  note,
  metadata,
  legacy_review_id,
  created_at
)
select
  consultation_case.id,
  review.reviewer_id,
  'legacy_review_imported',
  review.review_note,
  jsonb_build_object(
    'previousStatus', review.previous_status::text,
    'status', review.decision::text,
    'category', review.category::text
  ),
  review.id,
  review.reviewed_at
from public.unanswered_question_reviews as review
join public.consultation_cases as consultation_case
  on consultation_case.legacy_unanswered_question_id = review.unanswered_question_id
on conflict (legacy_review_id) where legacy_review_id is not null do nothing;

-- The established search RPC remains stable for existing callers.  This
-- companion returns the exact root/submodule associations used by the result,
-- allowing the chat and the control centre to disclose the detected route
-- without changing the approved retrieval contract.
create or replace function public.search_document_chunks_with_consultation_context(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_selected_module_id uuid default null,
  p_match_threshold real default 0.70,
  p_match_count integer default 5,
  p_retrieval_scope text default 'current'
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_situation public.document_situation,
  version_number integer,
  page_start integer,
  page_end integer,
  section_title text,
  article_reference text,
  numeral_reference text,
  chunk_content text,
  semantic_score real,
  lexical_score real,
  module_ids uuid[],
  module_names text[],
  module_associations jsonb
)
language sql
security definer
set search_path = ''
as $$
  select
    result.chunk_id,
    result.document_id,
    result.document_version_id,
    result.document_title,
    result.document_situation,
    result.version_number,
    result.page_start,
    result.page_end,
    result.section_title,
    result.article_reference,
    result.numeral_reference,
    result.chunk_content,
    result.semantic_score,
    result.lexical_score,
    result.module_ids,
    result.module_names,
    coalesce(associations.items, '[]'::jsonb) as module_associations
  from public.search_document_chunks_by_situation(
    p_query_embedding,
    p_query_text,
    p_selected_module_id,
    p_match_threshold,
    p_match_count,
    p_retrieval_scope
  ) as result
  cross join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'rootModuleId', coalesce(parent.id, module.id),
        'rootModuleName', coalesce(parent.name, module.name),
        'submoduleId', case when parent.id is null then null else module.id end,
        'submoduleName', case when parent.id is null then null else module.name end
      )
      order by coalesce(parent.name, module.name), module.name, module.id
    ) as items
    from (
      select distinct module.id, module.name, module.parent_module_id
      from public.document_modules as document_module
      join public.modules as module on module.id = document_module.module_id
      left join public.modules as parent on parent.id = module.parent_module_id
      where document_module.document_id = result.document_id
        and module.is_active
        and not module.is_deleted
        and (parent.id is null or (parent.is_active and not parent.is_deleted))
    ) as module
    left join public.modules as parent on parent.id = module.parent_module_id
  ) as associations;
$$;

revoke all on function public.search_document_chunks_with_consultation_context(
  extensions.vector, text, uuid, real, integer, text
) from public, anon, authenticated;
grant execute on function public.search_document_chunks_with_consultation_context(
  extensions.vector, text, uuid, real, integer, text
) to service_role;
