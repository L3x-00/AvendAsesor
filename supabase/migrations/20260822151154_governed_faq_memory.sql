-- Governed continuous-improvement memory for the RAG system.
--
-- This is deliberately not another retrieval corpus. It records only a
-- redacted, canonical question fingerprint and aggregate outcomes so that the
-- team can identify recurring demand. Approval never changes retrieval,
-- generation, documents, chunks or citations. Only current indexed document
-- chunks remain eligible evidence for a normative answer.

create type public.faq_memory_outcome as enum (
  'evidence',
  'ambiguous',
  'no_evidence'
);

create type public.faq_memory_review_status as enum (
  'pending_review',
  'approved',
  'rejected',
  'suppressed'
);

create table public.faq_memory_candidates (
  id uuid primary key default gen_random_uuid(),
  question_fingerprint text not null
    check (question_fingerprint ~ '^[a-f0-9]{64}$'),
  canonical_question text not null
    check (char_length(btrim(canonical_question)) between 4 and 1_000)
    check (canonical_question !~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}'),
  selected_module_id uuid references public.modules (id) on delete restrict,
  scope_key text not null
    check (
      (selected_module_id is null and scope_key = 'all')
      or scope_key = selected_module_id::text
    ),
  status public.faq_memory_review_status not null default 'pending_review',
  occurrence_count integer not null default 1 check (occurrence_count >= 1),
  evidence_count integer not null default 0 check (evidence_count >= 0),
  ambiguous_count integer not null default 0 check (ambiguous_count >= 0),
  no_evidence_count integer not null default 0 check (no_evidence_count >= 0),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint faq_memory_candidates_frequency_counts_check
    check (occurrence_count = evidence_count + ambiguous_count + no_evidence_count),
  constraint faq_memory_candidates_review_state_check
    check (
      (status = 'pending_review' and reviewed_at is null and reviewed_by is null)
      or (status <> 'pending_review' and reviewed_at is not null and reviewed_by is not null)
    ),
  constraint faq_memory_candidates_question_scope_key unique (question_fingerprint, scope_key)
);

create table public.faq_memory_observations (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.faq_memory_candidates (id) on delete restrict,
  user_message_id uuid not null unique references public.chat_messages (id) on delete restrict,
  outcome public.faq_memory_outcome not null,
  created_at timestamptz not null default now()
);

create table public.faq_memory_reviews (
  id uuid primary key default gen_random_uuid(),
  candidate_id uuid not null references public.faq_memory_candidates (id) on delete restrict,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  previous_status public.faq_memory_review_status not null,
  decision public.faq_memory_review_status not null
    check (decision in ('approved', 'rejected', 'suppressed')),
  review_note text
    check (review_note is null or char_length(btrim(review_note)) between 1 and 2_000),
  occurrence_count_snapshot integer not null check (occurrence_count_snapshot >= 1),
  evidence_count_snapshot integer not null check (evidence_count_snapshot >= 0),
  ambiguous_count_snapshot integer not null check (ambiguous_count_snapshot >= 0),
  no_evidence_count_snapshot integer not null check (no_evidence_count_snapshot >= 0),
  created_at timestamptz not null default now()
);

create index faq_memory_candidates_pending_review_idx
  on public.faq_memory_candidates (last_seen_at desc, id)
  where status = 'pending_review';

create index faq_memory_candidates_frequency_idx
  on public.faq_memory_candidates (occurrence_count desc, last_seen_at desc, id);

create index faq_memory_observations_candidate_created_idx
  on public.faq_memory_observations (candidate_id, created_at desc, id);

create index faq_memory_reviews_candidate_created_idx
  on public.faq_memory_reviews (candidate_id, created_at desc, id);

create trigger faq_memory_candidates_set_updated_at
before update on public.faq_memory_candidates
for each row execute procedure private.set_updated_at();

create function private.require_faq_memory_reviewer(p_reviewer_id uuid)
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
      message = 'Only an administrator may review FAQ memory candidates';
  end if;
end;
$$;

create function public.record_faq_memory_observation(
  p_user_message_id uuid,
  p_canonical_question text,
  p_question_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_question text := btrim(coalesce(p_canonical_question, ''));
  target_module_id uuid;
  target_outcome public.faq_memory_outcome;
  target_candidate_id uuid;
  existing_candidate_id uuid;
  target_scope_key text;
begin
  select observation.candidate_id into existing_candidate_id
  from public.faq_memory_observations as observation
  where observation.user_message_id = p_user_message_id;

  if found then
    return existing_candidate_id;
  end if;

  if char_length(normalized_question) not between 4 and 1_000
    or p_question_fingerprint !~ '^[a-f0-9]{64}$'
    or normalized_question ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}' then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory observation is invalid or insufficiently redacted';
  end if;

  select
    conversation.selected_module_id,
    case reply.role
      when 'assistant'::public.chat_message_role then 'evidence'::public.faq_memory_outcome
      when 'clarification'::public.chat_message_role then 'ambiguous'::public.faq_memory_outcome
      when 'no_evidence'::public.chat_message_role then 'no_evidence'::public.faq_memory_outcome
      else null
    end
  into target_module_id, target_outcome
  from public.chat_messages as question
  join public.chat_conversations as conversation
    on conversation.id = question.conversation_id
  join public.chat_messages as reply
    on reply.in_reply_to_message_id = question.id
  where question.id = p_user_message_id
    and question.role = 'user'::public.chat_message_role;

  if not found or target_outcome is null then
    raise exception using
      errcode = 'P0002',
      message = 'A completed user chat message was not found for FAQ memory';
  end if;

  target_scope_key := coalesce(target_module_id::text, 'all');

  insert into public.faq_memory_candidates as candidate (
    question_fingerprint,
    canonical_question,
    selected_module_id,
    scope_key,
    occurrence_count,
    evidence_count,
    ambiguous_count,
    no_evidence_count,
    first_seen_at,
    last_seen_at
  )
  values (
    p_question_fingerprint,
    normalized_question,
    target_module_id,
    target_scope_key,
    1,
    case when target_outcome = 'evidence' then 1 else 0 end,
    case when target_outcome = 'ambiguous' then 1 else 0 end,
    case when target_outcome = 'no_evidence' then 1 else 0 end,
    now(),
    now()
  )
  on conflict (question_fingerprint, scope_key) do update
  set
    occurrence_count = candidate.occurrence_count + 1,
    evidence_count = candidate.evidence_count
      + case when target_outcome = 'evidence' then 1 else 0 end,
    ambiguous_count = candidate.ambiguous_count
      + case when target_outcome = 'ambiguous' then 1 else 0 end,
    no_evidence_count = candidate.no_evidence_count
      + case when target_outcome = 'no_evidence' then 1 else 0 end,
    last_seen_at = now()
  returning id into target_candidate_id;

  insert into public.faq_memory_observations (
    candidate_id,
    user_message_id,
    outcome
  )
  values (
    target_candidate_id,
    p_user_message_id,
    target_outcome
  );

  return target_candidate_id;
end;
$$;

create function public.complete_chat_turn_with_learning(
  p_user_id uuid,
  p_conversation_id uuid,
  p_user_message_id uuid,
  p_answer_role public.chat_message_role,
  p_answer text,
  p_sources jsonb default '[]'::jsonb,
  p_unanswered_reason public.unanswered_question_reason default null,
  p_top_relevance_score real default null,
  p_faq_canonical_question text default null,
  p_faq_question_fingerprint text default null
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
begin
  if (p_faq_canonical_question is null) <> (p_faq_question_fingerprint is null) then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory fields must be supplied together or omitted together';
  end if;

  select completed.answer_message_id into completed_answer_message_id
  from public.complete_chat_turn(
    p_user_id,
    p_conversation_id,
    p_user_message_id,
    p_answer_role,
    p_answer,
    p_sources,
    p_unanswered_reason,
    p_top_relevance_score
  ) as completed;

  if p_faq_canonical_question is not null then
    perform public.record_faq_memory_observation(
      p_user_message_id,
      p_faq_canonical_question,
      p_faq_question_fingerprint
    );
  end if;

  return query select completed_answer_message_id;
end;
$$;

create function public.list_faq_memory_candidates(
  p_reviewer_id uuid,
  p_status public.faq_memory_review_status default 'pending_review',
  p_limit integer default 50
)
returns table (
  id uuid,
  canonical_question text,
  selected_module_id uuid,
  status public.faq_memory_review_status,
  occurrence_count integer,
  evidence_count integer,
  ambiguous_count integer,
  no_evidence_count integer,
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_faq_memory_reviewer(p_reviewer_id);

  if p_limit not between 1 and 100 then
    raise exception using errcode = '22023', message = 'FAQ memory limit must be between 1 and 100';
  end if;

  return query
  select
    candidate.id,
    candidate.canonical_question,
    candidate.selected_module_id,
    candidate.status,
    candidate.occurrence_count,
    candidate.evidence_count,
    candidate.ambiguous_count,
    candidate.no_evidence_count,
    candidate.first_seen_at,
    candidate.last_seen_at,
    candidate.reviewed_at,
    candidate.reviewed_by
  from public.faq_memory_candidates as candidate
  where candidate.status = p_status
  order by candidate.last_seen_at desc, candidate.id
  limit p_limit;
end;
$$;

create function public.review_faq_memory_candidate(
  p_reviewer_id uuid,
  p_candidate_id uuid,
  p_decision public.faq_memory_review_status,
  p_review_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.faq_memory_candidates%rowtype;
  normalized_note text := nullif(btrim(coalesce(p_review_note, '')), '');
begin
  perform private.require_faq_memory_reviewer(p_reviewer_id);

  if p_decision not in ('approved', 'rejected', 'suppressed') then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory review decision is invalid';
  end if;

  if char_length(coalesce(normalized_note, '')) > 2_000
    or (p_decision in ('rejected', 'suppressed') and normalized_note is null) then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory review note is invalid';
  end if;

  select * into target
  from public.faq_memory_candidates
  where id = p_candidate_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'FAQ memory candidate was not found';
  end if;

  if p_decision = 'approved' and target.evidence_count = 0 then
    raise exception using
      errcode = '23514',
      message = 'An FAQ memory candidate without evidence observations cannot be approved';
  end if;

  update public.faq_memory_candidates
  set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = p_reviewer_id
  where id = target.id;

  insert into public.faq_memory_reviews (
    candidate_id,
    reviewer_id,
    previous_status,
    decision,
    review_note,
    occurrence_count_snapshot,
    evidence_count_snapshot,
    ambiguous_count_snapshot,
    no_evidence_count_snapshot
  )
  values (
    target.id,
    p_reviewer_id,
    target.status,
    p_decision,
    normalized_note,
    target.occurrence_count,
    target.evidence_count,
    target.ambiguous_count,
    target.no_evidence_count
  );
end;
$$;

create function public.get_faq_memory_quality_summary(
  p_reviewer_id uuid
)
returns table (
  total_candidates bigint,
  pending_review_candidates bigint,
  approved_candidates bigint,
  rejected_candidates bigint,
  suppressed_candidates bigint,
  total_observations bigint,
  evidence_observations bigint,
  ambiguous_observations bigint,
  no_evidence_observations bigint
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_faq_memory_reviewer(p_reviewer_id);

  return query
  select
    count(*),
    count(*) filter (where candidate.status = 'pending_review'),
    count(*) filter (where candidate.status = 'approved'),
    count(*) filter (where candidate.status = 'rejected'),
    count(*) filter (where candidate.status = 'suppressed'),
    coalesce(sum(candidate.occurrence_count), 0),
    coalesce(sum(candidate.evidence_count), 0),
    coalesce(sum(candidate.ambiguous_count), 0),
    coalesce(sum(candidate.no_evidence_count), 0)
  from public.faq_memory_candidates as candidate;
end;
$$;

alter table public.faq_memory_candidates enable row level security;
alter table public.faq_memory_observations enable row level security;
alter table public.faq_memory_reviews enable row level security;

revoke all on table public.faq_memory_candidates from public, anon, authenticated;
revoke all on table public.faq_memory_observations from public, anon, authenticated;
revoke all on table public.faq_memory_reviews from public, anon, authenticated;

grant all on table public.faq_memory_candidates to service_role;
grant all on table public.faq_memory_observations to service_role;
grant all on table public.faq_memory_reviews to service_role;

revoke all on function private.require_faq_memory_reviewer(uuid) from public;
revoke all on function public.record_faq_memory_observation(uuid, text, text) from public, anon, authenticated;
revoke all on function public.complete_chat_turn_with_learning(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real, text, text) from public, anon, authenticated;
revoke all on function public.list_faq_memory_candidates(uuid, public.faq_memory_review_status, integer) from public, anon, authenticated;
revoke all on function public.review_faq_memory_candidate(uuid, uuid, public.faq_memory_review_status, text) from public, anon, authenticated;
revoke all on function public.get_faq_memory_quality_summary(uuid) from public, anon, authenticated;

grant execute on function public.record_faq_memory_observation(uuid, text, text) to service_role;
grant execute on function public.complete_chat_turn_with_learning(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real, text, text) to service_role;
grant execute on function public.list_faq_memory_candidates(uuid, public.faq_memory_review_status, integer) to service_role;
grant execute on function public.review_faq_memory_candidate(uuid, uuid, public.faq_memory_review_status, text) to service_role;
grant execute on function public.get_faq_memory_quality_summary(uuid) to service_role;
