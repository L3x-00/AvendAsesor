-- Hito 4 / Fase 4: application account state, guarded role administration and
-- append-only operational audit events. This does not call external Auth APIs.

create type public.account_status as enum ('active', 'suspended');

create type public.operational_audit_action as enum (
  'chat_history_deleted',
  'unanswered_question_reviewed',
  'user_role_changed',
  'user_status_changed'
);

alter table public.profiles
  add column account_status public.account_status not null default 'active',
  add column status_changed_at timestamptz,
  add column status_changed_by uuid,
  add column status_reason text,
  add column last_access_at timestamptz,
  add constraint profiles_status_reason_check
  check (
    status_reason is null
    or char_length(btrim(status_reason)) between 4 and 500
  ),
  add constraint profiles_account_status_audit_check
  check (
    (
      account_status = 'active'
      and status_changed_at is null
      and status_changed_by is null
      and status_reason is null
    )
    or (
      account_status = 'suspended'
      and status_changed_at is not null
      and status_changed_by is not null
      and status_reason is not null
    )
  );

create table public.operational_audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null,
  actor_role public.app_role not null,
  action public.operational_audit_action not null,
  resource_type text not null check (resource_type in ('chat_conversation', 'unanswered_question', 'profile')),
  resource_id uuid not null,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz not null default now()
);

alter table public.operational_audit_events enable row level security;
revoke all on table public.operational_audit_events from public, anon, authenticated;
grant all on table public.operational_audit_events to service_role;

create index operational_audit_events_occurred_idx
  on public.operational_audit_events (occurred_at desc, id);

create index profiles_admin_user_list_idx
  on public.profiles (account_status, full_name, id);

create function private.prevent_operational_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Operational audit events are append-only';
end;
$$;

create trigger operational_audit_events_append_only
before update or delete on public.operational_audit_events
for each row execute procedure private.prevent_operational_audit_mutation();

create function private.require_superadministrator(p_actor_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = p_actor_id
      and profile.role = 'superadmin'
      and profile.account_status = 'active'
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active superadministrator may perform this operation';
  end if;
end;
$$;

create function private.record_operational_audit(
  p_actor_id uuid,
  p_action public.operational_audit_action,
  p_resource_type text,
  p_resource_id uuid,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.app_role;
begin
  if jsonb_typeof(p_metadata) <> 'object' then
    raise exception using
      errcode = '22023',
      message = 'Operational audit metadata must be an object';
  end if;

  select profile.role into actor_role
  from public.profiles as profile
  where profile.id = p_actor_id;

  if actor_role is null then
    raise exception using
      errcode = '42501',
      message = 'The operational audit actor is unavailable';
  end if;

  insert into public.operational_audit_events (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    p_actor_id,
    actor_role,
    p_action,
    p_resource_type,
    p_resource_id,
    p_metadata
  );
end;
$$;

create function public.touch_profile_last_access(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles as profile
  set last_access_at = now()
  where profile.id = p_user_id
    and (
      profile.last_access_at is null
      or profile.last_access_at < now() - interval '15 minutes'
    );
end;
$$;

create function public.list_administrative_users(
  p_actor_id uuid,
  p_search text default null,
  p_limit integer default 50
)
returns table (
  id uuid,
  full_name text,
  role public.app_role,
  account_status public.account_status,
  created_at timestamptz,
  last_access_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(coalesce(p_search, '')), '');
begin
  perform private.require_superadministrator(p_actor_id);

  if p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'The administrative user limit must be between 1 and 100';
  end if;

  if normalized_search is not null and char_length(normalized_search) > 160 then
    raise exception using
      errcode = '22023',
      message = 'The administrative user search is too long';
  end if;

  return query
  select
    profile.id,
    profile.full_name,
    profile.role,
    profile.account_status,
    profile.created_at,
    profile.last_access_at
  from public.profiles as profile
  where normalized_search is null
    or profile.full_name ilike '%' || normalized_search || '%'
  order by profile.full_name, profile.id
  limit p_limit;
end;
$$;

create function public.update_administrative_user(
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

create function public.list_operational_audit_events(
  p_actor_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  actor_id uuid,
  actor_role public.app_role,
  action public.operational_audit_action,
  resource_type text,
  resource_id uuid,
  metadata jsonb,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_superadministrator(p_actor_id);

  if p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'The operational audit limit must be between 1 and 100';
  end if;

  return query
  select
    event.id,
    event.actor_id,
    event.actor_role,
    event.action,
    event.resource_type,
    event.resource_id,
    event.metadata,
    event.occurred_at
  from public.operational_audit_events as event
  order by event.occurred_at desc, event.id desc
  limit p_limit;
end;
$$;

create or replace function public.review_unanswered_question(
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
    raise exception using errcode = '22023', message = 'An unanswered question must be resolved or dismissed';
  end if;

  if p_category is null or normalized_note is null or char_length(normalized_note) not between 4 and 2_000 then
    raise exception using errcode = '22023', message = 'A classification and review note are required';
  end if;

  select * into target
  from public.unanswered_questions as unanswered
  where unanswered.id = p_unanswered_question_id
    and unanswered.status = 'pending_review'
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Unanswered question was not found for review';
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
    unanswered_question_id, reviewer_id, previous_status, decision, category, review_note
  )
  values (target.id, p_reviewer_id, target.status, p_decision, p_category, normalized_note);

  perform private.record_operational_audit(
    p_reviewer_id,
    'unanswered_question_reviewed',
    'unanswered_question',
    target.id,
    jsonb_build_object('decision', p_decision, 'category', p_category)
  );
end;
$$;

create or replace function public.delete_chat_conversation(
  p_user_id uuid,
  p_conversation_id uuid
)
returns table (id uuid, deleted_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_conversation public.chat_conversations%rowtype;
begin
  if p_user_id is null or p_conversation_id is null then
    raise exception using errcode = '22023', message = 'A chat user and conversation are required';
  end if;

  select * into target_conversation
  from public.chat_conversations as conversation
  where conversation.id = p_conversation_id
    and conversation.user_id = p_user_id
    and not conversation.is_deleted
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Chat conversation was not found';
  end if;

  return query
  update public.chat_conversations as conversation
  set is_deleted = true, deleted_at = now()
  where conversation.id = target_conversation.id
  returning conversation.id, conversation.deleted_at;

  perform private.record_operational_audit(
    p_user_id,
    'chat_history_deleted',
    'chat_conversation',
    target_conversation.id,
    '{}'::jsonb
  );
end;
$$;

revoke all on function private.prevent_operational_audit_mutation() from public;
revoke all on function private.require_superadministrator(uuid) from public;
revoke all on function private.record_operational_audit(uuid, public.operational_audit_action, text, uuid, jsonb) from public;
revoke all on function public.touch_profile_last_access(uuid) from public, anon, authenticated;
revoke all on function public.list_administrative_users(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.update_administrative_user(uuid, uuid, public.app_role, public.account_status, text) from public, anon, authenticated;
revoke all on function public.list_operational_audit_events(uuid, integer) from public, anon, authenticated;

grant execute on function public.touch_profile_last_access(uuid) to service_role;
grant execute on function public.list_administrative_users(uuid, text, integer) to service_role;
grant execute on function public.update_administrative_user(uuid, uuid, public.app_role, public.account_status, text) to service_role;
grant execute on function public.list_operational_audit_events(uuid, integer) to service_role;
