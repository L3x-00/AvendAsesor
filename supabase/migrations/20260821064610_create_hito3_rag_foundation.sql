-- Hito 3 keeps all derived RAG data server-side. PDFs and their immutable
-- versions remain the source of truth established in Hito 2.
create extension if not exists vector with schema extensions;

alter type public.document_ingestion_status add value if not exists 'processing';
alter type public.document_ingestion_status add value if not exists 'indexed';
alter type public.document_ingestion_status add value if not exists 'failed';

create type public.document_ingestion_job_status as enum (
  'pending',
  'processing',
  'completed',
  'failed'
);

create type public.chat_message_role as enum (
  'user',
  'assistant',
  'clarification',
  'no_evidence'
);

create type public.unanswered_question_reason as enum (
  'insufficient_evidence',
  'ambiguous_request'
);

-- The previous Hito 2 trigger intentionally allowed no ingestion transition.
-- File identity remains immutable; only the private worker transition protocol
-- may now change the derived state and its timestamp.
create or replace function private.prevent_document_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_status text := old.ingestion_status::text;
  new_status text := new.ingestion_status::text;
  transition_allowed boolean := coalesce(
    current_setting('app.avend_ingestion_transition', true),
    ''
  ) = 'active';
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
    or new.uploaded_at is distinct from old.uploaded_at
    or new.uploaded_by is distinct from old.uploaded_by then
    raise exception 'Document versions are immutable; create a new version instead';
  end if;

  if old_status is distinct from new_status then
    if not transition_allowed then
      raise exception 'Document ingestion state is controlled by the ingestion worker';
    end if;

    if not (
      (old_status = 'pending' and new_status in ('processing', 'failed'))
      or (old_status = 'processing' and new_status in ('pending', 'indexed', 'failed'))
      or (old_status = 'failed' and new_status = 'pending')
      or (old_status = 'indexed' and new_status = 'pending')
    ) then
      raise exception 'Invalid document ingestion state transition: % -> %', old_status, new_status;
    end if;
  elsif new.ingestion_updated_at is distinct from old.ingestion_updated_at
    and not transition_allowed then
    raise exception 'Document ingestion state is controlled by the ingestion worker';
  end if;

  return new;
end;
$$;

create function private.set_document_ingestion_status(
  p_document_version_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('pending', 'processing', 'indexed', 'failed') then
    raise exception using
      errcode = '22023',
      message = 'Unsupported document ingestion status';
  end if;

  perform set_config('app.avend_ingestion_transition', 'active', true);

  execute
    'update public.document_versions
     set ingestion_status = $1::public.document_ingestion_status,
         ingestion_updated_at = now()
     where id = $2'
  using p_status, p_document_version_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document version was not found';
  end if;
end;
$$;

revoke all on function private.set_document_ingestion_status(uuid, text) from public;

create table public.document_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  document_version_id uuid not null,
  status public.document_ingestion_job_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_token uuid,
  leased_at timestamptz,
  lease_expires_at timestamptz,
  last_error_code text check (
    last_error_code is null or last_error_code ~ '^[A-Z][A-Z0-9_]{1,63}$'
  ),
  last_error_message text check (
    last_error_message is null
    or char_length(btrim(last_error_message)) between 1 and 1_000
  ),
  requested_at timestamptz not null default now(),
  requested_by uuid,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint document_ingestion_jobs_version_key unique (document_version_id),
  constraint document_ingestion_jobs_version_belongs_to_document_fkey
    foreign key (document_id, document_version_id)
    references public.document_versions (document_id, id)
    on delete restrict,
  constraint document_ingestion_jobs_lease_check check (
    (status = 'processing'
      and lease_token is not null
      and leased_at is not null
      and lease_expires_at is not null
      and completed_at is null)
    or (status <> 'processing'
      and lease_token is null
      and leased_at is null
      and lease_expires_at is null)
  ),
  constraint document_ingestion_jobs_completion_check check (
    (status in ('completed', 'failed') and completed_at is not null)
    or (status not in ('completed', 'failed') and completed_at is null)
  )
);

create table public.document_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null,
  document_version_id uuid not null,
  chunk_index integer not null check (chunk_index >= 0),
  chunk_content text not null check (
    char_length(btrim(chunk_content)) between 1 and 20_000
  ),
  token_count integer not null check (token_count between 1 and 2_000),
  page_start integer not null check (page_start between 1 and 300),
  page_end integer not null check (page_end between page_start and 300),
  section_title text check (
    section_title is null or char_length(btrim(section_title)) between 1 and 255
  ),
  article_reference text check (
    article_reference is null or char_length(btrim(article_reference)) between 1 and 120
  ),
  numeral_reference text check (
    numeral_reference is null or char_length(btrim(numeral_reference)) between 1 and 120
  ),
  content_tsv tsvector generated always as (
    to_tsvector('spanish', chunk_content)
  ) stored,
  embedding extensions.vector(1536) not null,
  created_at timestamptz not null default now(),
  constraint document_chunks_version_chunk_index_key unique (
    document_version_id,
    chunk_index
  ),
  constraint document_chunks_version_belongs_to_document_fkey
    foreign key (document_id, document_version_id)
    references public.document_versions (document_id, id)
    on delete restrict
);

create table public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  selected_module_id uuid references public.modules (id) on delete restrict,
  title text check (
    title is null or char_length(btrim(title)) between 1 and 255
  ),
  is_deleted boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_conversations_logical_deletion_check check (
    (not is_deleted and deleted_at is null)
    or (is_deleted and deleted_at is not null)
  )
);

create table public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations (id) on delete restrict,
  role public.chat_message_role not null,
  content text not null check (char_length(btrim(content)) between 1 and 20_000),
  created_at timestamptz not null default now()
);

create table public.chat_message_sources (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.chat_messages (id) on delete restrict,
  chunk_id uuid references public.document_chunks (id) on delete set null,
  document_id uuid not null references public.documents (id) on delete restrict,
  document_version_id uuid not null,
  module_id uuid references public.modules (id) on delete set null,
  document_title text not null check (char_length(btrim(document_title)) between 1 and 500),
  module_name text,
  version_number integer not null check (version_number > 0),
  page_start integer not null check (page_start between 1 and 300),
  page_end integer not null check (page_end between page_start and 300),
  section_title text,
  article_reference text,
  numeral_reference text,
  relevance_score real not null check (relevance_score between 0 and 1),
  source_rank integer not null check (source_rank between 1 and 20),
  created_at timestamptz not null default now(),
  constraint chat_message_sources_message_rank_key unique (message_id, source_rank),
  constraint chat_message_sources_version_belongs_to_document_fkey
    foreign key (document_id, document_version_id)
    references public.document_versions (document_id, id)
    on delete restrict
);

create table public.unanswered_questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  conversation_id uuid references public.chat_conversations (id) on delete restrict,
  message_id uuid references public.chat_messages (id) on delete restrict,
  selected_module_id uuid references public.modules (id) on delete restrict,
  question text not null check (char_length(btrim(question)) between 1 and 8_000),
  reason public.unanswered_question_reason not null,
  top_relevance_score real check (top_relevance_score is null or top_relevance_score between 0 and 1),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);

create index document_ingestion_jobs_next_job_idx
  on public.document_ingestion_jobs (status, requested_at)
  where status in ('pending', 'processing');

create index document_chunks_document_version_idx
  on public.document_chunks (document_id, document_version_id, chunk_index);

create index document_chunks_embedding_hnsw_idx
  on public.document_chunks
  using hnsw (embedding extensions.vector_cosine_ops);

create index document_chunks_content_tsv_idx
  on public.document_chunks using gin (content_tsv);

create index chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc)
  where not is_deleted;

create index chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at);

create index chat_message_sources_message_idx
  on public.chat_message_sources (message_id, source_rank);

create index unanswered_questions_created_idx
  on public.unanswered_questions (created_at desc);

create trigger chat_conversations_set_updated_at
before update on public.chat_conversations
for each row execute procedure private.set_updated_at();

create function private.enqueue_document_version_ingestion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  insert into public.document_ingestion_jobs (
    document_id,
    document_version_id,
    requested_by
  )
  values (new.document_id, new.id, new.uploaded_by)
  on conflict (document_version_id) do nothing;

  return new;
end;
$$;

revoke all on function private.enqueue_document_version_ingestion() from public;

create trigger document_versions_enqueue_ingestion
after insert on public.document_versions
for each row execute procedure private.enqueue_document_version_ingestion();

-- Existing pending versions are queued when an Hito 2 environment is upgraded.
insert into public.document_ingestion_jobs (
  document_id,
  document_version_id,
  requested_by
)
select version.document_id, version.id, version.uploaded_by
from public.document_versions as version
on conflict (document_version_id) do nothing;

create function public.claim_document_ingestion_job(
  p_lease_seconds integer default 300
)
returns table (
  job_id uuid,
  lease_token uuid,
  document_id uuid,
  document_version_id uuid,
  storage_bucket text,
  storage_path text,
  page_count integer,
  sha256 text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate public.document_ingestion_jobs%rowtype;
  next_lease_token uuid;
begin
  if p_lease_seconds not between 30 and 900 then
    raise exception using
      errcode = '22023',
      message = 'Lease duration must be between 30 and 900 seconds';
  end if;

  loop
    select * into candidate
    from public.document_ingestion_jobs
    where (
      status = 'pending'
      or (status = 'processing' and lease_expires_at < now())
    )
    order by requested_at, id
    for update skip locked
    limit 1;

    if not found then
      return;
    end if;

    if candidate.status = 'processing'
      and candidate.attempt_count >= candidate.max_attempts then
      update public.document_ingestion_jobs
      set
        status = 'failed',
        lease_token = null,
        leased_at = null,
        lease_expires_at = null,
        last_error_code = 'LEASE_EXPIRED',
        last_error_message = 'The ingestion worker lease expired before completion.',
        completed_at = now(),
        updated_at = now()
      where id = candidate.id;

      perform private.set_document_ingestion_status(
        candidate.document_version_id,
        'failed'
      );
      continue;
    end if;

    next_lease_token := gen_random_uuid();

    update public.document_ingestion_jobs as job
    set
      status = 'processing',
      attempt_count = job.attempt_count + 1,
      lease_token = next_lease_token,
      leased_at = now(),
      lease_expires_at = now() + make_interval(secs => p_lease_seconds),
      last_error_code = null,
      last_error_message = null,
      completed_at = null,
      updated_at = now()
    where id = candidate.id;

    if candidate.status = 'pending' then
      perform private.set_document_ingestion_status(
        candidate.document_version_id,
        'processing'
      );
    end if;

    return query
    select
      candidate.id,
      next_lease_token,
      candidate.document_id,
      candidate.document_version_id,
      version.storage_bucket,
      version.storage_path,
      version.page_count,
      version.sha256,
      candidate.attempt_count + 1
    from public.document_versions as version
    where version.id = candidate.document_version_id;
    return;
  end loop;
end;
$$;

create function public.refresh_document_ingestion_job_lease(
  p_job_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer default 300
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_lease_seconds not between 30 and 900 then
    raise exception using errcode = '22023', message = 'Invalid lease duration';
  end if;

  update public.document_ingestion_jobs
  set
    lease_expires_at = now() + make_interval(secs => p_lease_seconds),
    updated_at = now()
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at >= now();

  if not found then
    raise exception using errcode = 'P0002', message = 'Active ingestion lease was not found';
  end if;
end;
$$;

create function public.clear_document_ingestion_chunks(
  p_job_id uuid,
  p_lease_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.document_ingestion_jobs%rowtype;
begin
  select * into target
  from public.document_ingestion_jobs
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at >= now()
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active ingestion lease was not found';
  end if;

  delete from public.document_chunks
  where document_version_id = target.document_version_id;
end;
$$;

create function public.complete_document_ingestion_job(
  p_job_id uuid,
  p_lease_token uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.document_ingestion_jobs%rowtype;
begin
  select * into target
  from public.document_ingestion_jobs
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at >= now()
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active ingestion lease was not found';
  end if;

  if not exists (
    select 1
    from public.document_chunks
    where document_version_id = target.document_version_id
  ) then
    raise exception using
      errcode = '23514',
      message = 'A document version cannot complete ingestion without chunks';
  end if;

  update public.document_ingestion_jobs
  set
    status = 'completed',
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    completed_at = now(),
    updated_at = now()
  where id = target.id;

  perform private.set_document_ingestion_status(
    target.document_version_id,
    'indexed'
  );
end;
$$;

create function public.fail_document_ingestion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_code text,
  p_error_message text,
  p_retryable boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.document_ingestion_jobs%rowtype;
  should_retry boolean;
begin
  if p_error_code !~ '^[A-Z][A-Z0-9_]{1,63}$'
    or char_length(btrim(p_error_message)) not between 1 and 1_000 then
    raise exception using errcode = '22023', message = 'Invalid ingestion error payload';
  end if;

  select * into target
  from public.document_ingestion_jobs
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at >= now()
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active ingestion lease was not found';
  end if;

  should_retry := p_retryable and target.attempt_count < target.max_attempts;

  update public.document_ingestion_jobs
  set
    status = case when should_retry then 'pending'::public.document_ingestion_job_status else 'failed'::public.document_ingestion_job_status end,
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    last_error_code = p_error_code,
    last_error_message = p_error_message,
    completed_at = case when should_retry then null else now() end,
    updated_at = now()
  where id = target.id;

  perform private.set_document_ingestion_status(
    target.document_version_id,
    case when should_retry then 'pending' else 'failed' end
  );
end;
$$;

create function public.retry_document_ingestion(
  p_document_version_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.document_ingestion_jobs%rowtype;
begin
  select * into target
  from public.document_ingestion_jobs
  where document_version_id = p_document_version_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Document ingestion job was not found';
  end if;

  if target.status = 'processing' and target.lease_expires_at >= now() then
    raise exception using errcode = '55000', message = 'Document ingestion is already active';
  end if;

  update public.document_ingestion_jobs
  set
    status = 'pending',
    attempt_count = 0,
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    last_error_code = null,
    last_error_message = null,
    requested_by = p_actor_id,
    requested_at = now(),
    completed_at = null,
    updated_at = now()
  where id = target.id;

  perform private.set_document_ingestion_status(p_document_version_id, 'pending');
end;
$$;

create function public.search_document_chunks(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_selected_module_id uuid default null,
  p_match_threshold real default 0.70,
  p_match_count integer default 5
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
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
  module_names text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(btrim(p_query_text)) not between 1 and 8_000
    or p_match_threshold not between 0 and 1
    or p_match_count not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Invalid document search parameters';
  end if;

  return query
  with eligible as (
    select
      chunk.id as matched_chunk_id,
      chunk.document_id as matched_document_id,
      chunk.document_version_id as matched_document_version_id,
      document.title as matched_document_title,
      version.version_number as matched_version_number,
      chunk.page_start as matched_page_start,
      chunk.page_end as matched_page_end,
      chunk.section_title as matched_section_title,
      chunk.article_reference as matched_article_reference,
      chunk.numeral_reference as matched_numeral_reference,
      chunk.chunk_content as matched_chunk_content,
      (1 - (chunk.embedding OPERATOR(extensions.<=>) p_query_embedding))::real as matched_semantic_score,
      ts_rank_cd(
        chunk.content_tsv,
        websearch_to_tsquery('spanish', p_query_text)
      )::real as matched_lexical_score
    from public.document_chunks as chunk
    join public.documents as document on document.id = chunk.document_id
    join public.document_versions as version
      on version.id = chunk.document_version_id
      and version.document_id = chunk.document_id
    where document.publication_status = 'active'
      and not document.is_deleted
      and document.current_version_id = chunk.document_version_id
      and version.ingestion_status::text = 'indexed'
      and exists (
        select 1
        from public.document_modules as document_module
        join public.modules as module on module.id = document_module.module_id
        where document_module.document_id = chunk.document_id
          and module.is_active
          and not module.is_deleted
      )
      and (
        p_selected_module_id is null
        or exists (
          select 1
          from public.document_modules as selected_document_module
          join public.modules as selected_module
            on selected_module.id = selected_document_module.module_id
          where selected_document_module.document_id = chunk.document_id
            and selected_document_module.module_id = p_selected_module_id
            and selected_module.is_active
            and not selected_module.is_deleted
        )
      )
  ),
  ranked as (
    select *
    from eligible
    where matched_semantic_score >= p_match_threshold
    order by matched_semantic_score desc, matched_lexical_score desc, matched_chunk_id
    limit p_match_count
  )
  select
    ranked.matched_chunk_id,
    ranked.matched_document_id,
    ranked.matched_document_version_id,
    ranked.matched_document_title,
    ranked.matched_version_number,
    ranked.matched_page_start,
    ranked.matched_page_end,
    ranked.matched_section_title,
    ranked.matched_article_reference,
    ranked.matched_numeral_reference,
    ranked.matched_chunk_content,
    ranked.matched_semantic_score,
    ranked.matched_lexical_score,
    coalesce(module_data.module_ids, array[]::uuid[]),
    coalesce(module_data.module_names, array[]::text[])
  from ranked
  cross join lateral (
    select
      array_agg(module.id order by module.name, module.id) as module_ids,
      array_agg(module.name order by module.name, module.id) as module_names
    from public.document_modules as document_module
    join public.modules as module on module.id = document_module.module_id
    where document_module.document_id = ranked.matched_document_id
      and module.is_active
      and not module.is_deleted
  ) as module_data
  order by ranked.matched_semantic_score desc, ranked.matched_lexical_score desc, ranked.matched_chunk_id;
end;
$$;

alter table public.document_ingestion_jobs enable row level security;
alter table public.document_chunks enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_message_sources enable row level security;
alter table public.unanswered_questions enable row level security;

revoke all on table public.document_ingestion_jobs from public, anon, authenticated;
revoke all on table public.document_chunks from public, anon, authenticated;
revoke all on table public.chat_conversations from public, anon, authenticated;
revoke all on table public.chat_messages from public, anon, authenticated;
revoke all on table public.chat_message_sources from public, anon, authenticated;
revoke all on table public.unanswered_questions from public, anon, authenticated;

grant all on table public.document_ingestion_jobs to service_role;
grant all on table public.document_chunks to service_role;
grant all on table public.chat_conversations to service_role;
grant all on table public.chat_messages to service_role;
grant all on table public.chat_message_sources to service_role;
grant all on table public.unanswered_questions to service_role;

revoke all on function public.claim_document_ingestion_job(integer) from public, anon, authenticated;
revoke all on function public.refresh_document_ingestion_job_lease(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.clear_document_ingestion_chunks(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_document_ingestion_job(uuid, uuid) from public, anon, authenticated;
revoke all on function public.fail_document_ingestion_job(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke all on function public.retry_document_ingestion(uuid, uuid) from public, anon, authenticated;
revoke all on function public.search_document_chunks(extensions.vector, text, uuid, real, integer) from public, anon, authenticated;

grant execute on function public.claim_document_ingestion_job(integer) to service_role;
grant execute on function public.refresh_document_ingestion_job_lease(uuid, uuid, integer) to service_role;
grant execute on function public.clear_document_ingestion_chunks(uuid, uuid) to service_role;
grant execute on function public.complete_document_ingestion_job(uuid, uuid) to service_role;
grant execute on function public.fail_document_ingestion_job(uuid, uuid, text, text, boolean) to service_role;
grant execute on function public.retry_document_ingestion(uuid, uuid) to service_role;
grant execute on function public.search_document_chunks(extensions.vector, text, uuid, real, integer) to service_role;
