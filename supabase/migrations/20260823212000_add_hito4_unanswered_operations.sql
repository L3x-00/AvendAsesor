-- Hito 4 / Fase 3: controlled operational queue for no-evidence/ambiguous chats.

create type public.unanswered_question_status as enum (
  'pending_review',
  'resolved',
  'dismissed'
);

create type public.unanswered_question_category as enum (
  'documentation_gap',
  'module_configuration',
  'outside_scope',
  'duplicate',
  'other'
);

alter table public.unanswered_questions
  add column status public.unanswered_question_status not null default 'pending_review',
  add column category public.unanswered_question_category,
  add column review_note text;

-- Do not silently invent a classification for a legacy reviewed record.
do $$
begin
  if exists (
    select 1
    from public.unanswered_questions
    where reviewed_at is not null or reviewed_by is not null
  ) then
    raise exception 'Legacy unanswered-question reviews require an explicit classification migration';
  end if;
end;
$$;

alter table public.unanswered_questions
  add constraint unanswered_questions_review_note_check
  check (
    review_note is null
    or char_length(btrim(review_note)) between 4 and 2_000
  ),
  add constraint unanswered_questions_review_state_check
  check (
    (
      status = 'pending_review'
      and category is null
      and review_note is null
      and reviewed_at is null
      and reviewed_by is null
    )
    or (
      status in ('resolved', 'dismissed')
      and category is not null
      and review_note is not null
      and reviewed_at is not null
      and reviewed_by is not null
    )
  );

create table public.unanswered_question_reviews (
  id uuid primary key default gen_random_uuid(),
  unanswered_question_id uuid not null references public.unanswered_questions (id) on delete restrict,
  reviewer_id uuid not null,
  previous_status public.unanswered_question_status not null,
  decision public.unanswered_question_status not null
    check (decision in ('resolved', 'dismissed')),
  category public.unanswered_question_category not null,
  review_note text not null check (char_length(btrim(review_note)) between 4 and 2_000),
  reviewed_at timestamptz not null default now()
);

alter table public.unanswered_questions enable row level security;
alter table public.unanswered_question_reviews enable row level security;

revoke all on table public.unanswered_questions from public, anon, authenticated;
revoke all on table public.unanswered_question_reviews from public, anon, authenticated;
grant all on table public.unanswered_question_reviews to service_role;

create index unanswered_questions_status_created_idx
  on public.unanswered_questions (status, created_at desc, id)
  where status = 'pending_review';

create index unanswered_question_reviews_question_reviewed_idx
  on public.unanswered_question_reviews (unanswered_question_id, reviewed_at desc, id);

create function private.require_administrator(p_reviewer_id uuid)
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
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an administrator may perform this operation';
  end if;
end;
$$;

create function public.list_unanswered_questions(
  p_reviewer_id uuid,
  p_status public.unanswered_question_status default 'pending_review',
  p_limit integer default 50
)
returns table (
  id uuid,
  conversation_id uuid,
  message_id uuid,
  selected_module_id uuid,
  question text,
  reason public.unanswered_question_reason,
  top_relevance_score real,
  status public.unanswered_question_status,
  category public.unanswered_question_category,
  review_note text,
  created_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator(p_reviewer_id);

  if p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'The unanswered-question limit must be between 1 and 100';
  end if;

  return query
  select
    unanswered.id,
    unanswered.conversation_id,
    unanswered.message_id,
    unanswered.selected_module_id,
    unanswered.question,
    unanswered.reason,
    unanswered.top_relevance_score,
    unanswered.status,
    unanswered.category,
    unanswered.review_note,
    unanswered.created_at,
    unanswered.reviewed_at,
    unanswered.reviewed_by
  from public.unanswered_questions as unanswered
  where unanswered.status = p_status
  order by unanswered.created_at desc, unanswered.id desc
  limit p_limit;
end;
$$;

create function public.review_unanswered_question(
  p_reviewer_id uuid,
  p_unanswered_question_id uuid,
  p_decision public.unanswered_question_status,
  p_category public.unanswered_question_category,
  p_review_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.unanswered_questions%rowtype;
  normalized_note text := nullif(btrim(coalesce(p_review_note, '')), '');
begin
  perform private.require_administrator(p_reviewer_id);

  if p_decision not in ('resolved', 'dismissed') then
    raise exception using
      errcode = '22023',
      message = 'An unanswered question must be resolved or dismissed';
  end if;

  if p_category is null
    or normalized_note is null
    or char_length(normalized_note) not between 4 and 2_000 then
    raise exception using
      errcode = '22023',
      message = 'A classification and review note are required';
  end if;

  select * into target
  from public.unanswered_questions as unanswered
  where unanswered.id = p_unanswered_question_id
    and unanswered.status = 'pending_review'
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Unanswered question was not found for review';
  end if;

  update public.unanswered_questions as unanswered
  set
    status = p_decision,
    category = p_category,
    review_note = normalized_note,
    reviewed_at = now(),
    reviewed_by = p_reviewer_id
  where unanswered.id = target.id;

  insert into public.unanswered_question_reviews (
    unanswered_question_id,
    reviewer_id,
    previous_status,
    decision,
    category,
    review_note
  )
  values (
    target.id,
    p_reviewer_id,
    target.status,
    p_decision,
    p_category,
    normalized_note
  );
end;
$$;

create function public.get_hito4_operational_metrics(p_reviewer_id uuid)
returns table (
  total_users bigint,
  active_modules bigint,
  active_documents bigint,
  total_conversations bigint,
  pending_unanswered_questions bigint,
  resolved_unanswered_questions bigint,
  dismissed_unanswered_questions bigint,
  pending_ingestion_jobs bigint,
  provider_cost_status text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_administrator(p_reviewer_id);

  return query
  select
    (select count(*) from public.profiles),
    (select count(*) from public.modules where is_active and not is_deleted),
    (select count(*) from public.documents where not is_deleted and publication_status = 'active'),
    (select count(*) from public.chat_conversations where not is_deleted),
    (select count(*) from public.unanswered_questions where status = 'pending_review'),
    (select count(*) from public.unanswered_questions where status = 'resolved'),
    (select count(*) from public.unanswered_questions where status = 'dismissed'),
    (select count(*) from public.document_ingestion_jobs where status in ('pending', 'processing')),
    'not_configured'::text;
end;
$$;

revoke all on function private.require_administrator(uuid) from public;
revoke all on function public.list_unanswered_questions(uuid, public.unanswered_question_status, integer)
  from public, anon, authenticated;
revoke all on function public.review_unanswered_question(uuid, uuid, public.unanswered_question_status, public.unanswered_question_category, text)
  from public, anon, authenticated;
revoke all on function public.get_hito4_operational_metrics(uuid)
  from public, anon, authenticated;

grant execute on function public.list_unanswered_questions(uuid, public.unanswered_question_status, integer)
  to service_role;
grant execute on function public.review_unanswered_question(uuid, uuid, public.unanswered_question_status, public.unanswered_question_category, text)
  to service_role;
grant execute on function public.get_hito4_operational_metrics(uuid)
  to service_role;
