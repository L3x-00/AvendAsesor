-- Privacy-first FAQ memory: automatic capture must not duplicate a user's
-- free-text question into a cross-user operational queue. The queue keeps a
-- server-derived fingerprint and aggregate outcomes only. A human reviewer may
-- add an impersonal label when approving a real operational pattern.

drop trigger if exists faq_memory_candidates_validate_redaction
  on public.faq_memory_candidates;

alter table public.faq_memory_candidates
  rename column canonical_question to review_label;

alter table public.faq_memory_candidates
  alter column review_label drop not null;

update public.faq_memory_candidates
set review_label = null;

create or replace function private.validate_faq_memory_candidate_redaction()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  label_without_iso_dates text;
begin
  if new.review_label is null then
    return new;
  end if;

  label_without_iso_dates := regexp_replace(
    new.review_label,
    '[0-9]{4}[-/][0-9]{2}[-/][0-9]{2}',
    '',
    'g'
  );

  if char_length(btrim(new.review_label)) not between 4 and 200
    or new.review_label ~* '[A-Z0-9._%+-]+@[A-Z0-9.-]+[.][A-Z]{2,}'
    or new.review_label ~ '(^|[^0-9])[0-9]{8,}([^0-9]|$)'
    or label_without_iso_dates ~ '(^|[^0-9])([0-9]{2,4}[ ./-]){1,3}[0-9]{2,4}([^0-9]|$)' then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory review label is invalid or contains a direct identifier';
  end if;

  return new;
end;
$$;

create trigger faq_memory_candidates_validate_redaction
before insert or update of review_label on public.faq_memory_candidates
for each row execute procedure private.validate_faq_memory_candidate_redaction();

create or replace function public.record_faq_memory_observation(
  p_user_message_id uuid,
  p_canonical_question text,
  p_question_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = '0A000',
    message = 'The legacy FAQ memory recording contract is disabled';
end;
$$;

create function public.record_faq_memory_observation_v2(
  p_user_message_id uuid,
  p_question_fingerprint text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  if p_question_fingerprint !~ '^[a-f0-9]{64}$' then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory observation fingerprint is invalid';
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

create function public.complete_chat_turn_with_learning_v2(
  p_user_id uuid,
  p_conversation_id uuid,
  p_user_message_id uuid,
  p_answer_role public.chat_message_role,
  p_answer text,
  p_sources jsonb default '[]'::jsonb,
  p_unanswered_reason public.unanswered_question_reason default null,
  p_top_relevance_score real default null,
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

  if p_faq_question_fingerprint is not null then
    perform public.record_faq_memory_observation_v2(
      p_user_message_id,
      p_faq_question_fingerprint
    );
  end if;

  return query select completed_answer_message_id;
end;
$$;

create function public.list_faq_memory_candidates_v2(
  p_reviewer_id uuid,
  p_status public.faq_memory_review_status default 'pending_review',
  p_limit integer default 50
)
returns table (
  id uuid,
  review_label text,
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
    candidate.review_label,
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

create function public.review_faq_memory_candidate_v2(
  p_reviewer_id uuid,
  p_candidate_id uuid,
  p_decision public.faq_memory_review_status,
  p_review_note text default null,
  p_review_label text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.faq_memory_candidates%rowtype;
  normalized_note text := nullif(btrim(coalesce(p_review_note, '')), '');
  normalized_label text := nullif(btrim(coalesce(p_review_label, '')), '');
begin
  perform private.require_faq_memory_reviewer(p_reviewer_id);

  if p_decision not in ('approved', 'rejected', 'suppressed') then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory review decision is invalid';
  end if;

  if char_length(coalesce(normalized_note, '')) > 2_000
    or (p_decision in ('rejected', 'suppressed') and normalized_note is null)
    or (p_decision = 'approved' and normalized_label is null) then
    raise exception using
      errcode = '22023',
      message = 'FAQ memory review metadata is invalid';
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
    review_label = coalesce(normalized_label, review_label),
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

revoke all on function public.record_faq_memory_observation(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_chat_turn_with_learning(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real, text, text) from public, anon, authenticated, service_role;
revoke all on function public.list_faq_memory_candidates(uuid, public.faq_memory_review_status, integer) from public, anon, authenticated, service_role;
revoke all on function public.review_faq_memory_candidate(uuid, uuid, public.faq_memory_review_status, text) from public, anon, authenticated, service_role;

revoke all on function public.record_faq_memory_observation_v2(uuid, text) from public, anon, authenticated;
revoke all on function public.complete_chat_turn_with_learning_v2(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real, text) from public, anon, authenticated;
revoke all on function public.list_faq_memory_candidates_v2(uuid, public.faq_memory_review_status, integer) from public, anon, authenticated;
revoke all on function public.review_faq_memory_candidate_v2(uuid, uuid, public.faq_memory_review_status, text, text) from public, anon, authenticated;

grant execute on function public.record_faq_memory_observation_v2(uuid, text) to service_role;
grant execute on function public.complete_chat_turn_with_learning_v2(uuid, uuid, uuid, public.chat_message_role, text, jsonb, public.unanswered_question_reason, real, text) to service_role;
grant execute on function public.list_faq_memory_candidates_v2(uuid, public.faq_memory_review_status, integer) to service_role;
grant execute on function public.review_faq_memory_candidate_v2(uuid, uuid, public.faq_memory_review_status, text, text) to service_role;
