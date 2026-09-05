begin;

select plan(34);

-- Structure ----------------------------------------------------------------
select has_column(
  'public',
  'profiles',
  'access_start_at',
  'Profiles expose an optional informational access start'
);
select ok(
  exists (
    select 1
    from pg_enum as enum_value
    join pg_type as enum_type on enum_type.oid = enum_value.enumtypid
    where enum_type.typname = 'operational_audit_action'
      and enum_value.enumlabel = 'access_window_changed'
  ),
  'The operational audit action enum includes access_window_changed'
);
select has_function(
  'public',
  'count_administrative_users',
  array['uuid', 'text', 'text'],
  'The directory exposes a bucket-count RPC'
);
select has_function(
  'public',
  'update_administrative_user_access_window',
  array['uuid', 'uuid', 'timestamptz', 'timestamptz', 'text'],
  'The directory exposes an access-window update RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.count_administrative_users(uuid,text,text)'::regprocedure,
    'execute'
  ),
  'Only the server role can count the directory'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.count_administrative_users(uuid,text,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot count the directory directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.update_administrative_user_access_window(uuid,uuid,timestamptz,timestamptz,text)'::regprocedure,
    'execute'
  ),
  'Only the server role can change an access window'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.update_administrative_user_access_window(uuid,uuid,timestamptz,timestamptz,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot change an access window directly'
);

-- Fixtures -----------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('30000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'aw-superadmin@example.test', '{}'::jsonb,
   '{"full_name":"Superadministrador Vigencias"}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'aw-admin@example.test', '{}'::jsonb,
   '{"full_name":"Administrador Vigencias"}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated',
   'aw-a@example.test', '{}'::jsonb,
   '{"full_name":"Vigencia A Expirado"}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated',
   'aw-b@example.test', '{}'::jsonb,
   '{"full_name":"Vigencia B PorVencer"}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated',
   'aw-c@example.test', '{}'::jsonb,
   '{"full_name":"Vigencia C Activo"}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated',
   'aw-d@example.test', '{}'::jsonb,
   '{"full_name":"Vigencia D Indefinido"}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-00000000000e', 'authenticated', 'authenticated',
   'aw-e@example.test', '{}'::jsonb,
   '{"full_name":"Vigencia E Pausado"}'::jsonb, now(), now()),
  ('30000000-0000-0000-0000-00000000000f', 'authenticated', 'authenticated',
   'aw-f@example.test', '{}'::jsonb,
   '{"full_name":"Vigencia F ExpiradoPausado"}'::jsonb, now(), now());

update public.profiles
set role = 'superadmin'::public.app_role
where id = '30000000-0000-0000-0000-000000000000';

update public.profiles
set role = 'admin'::public.app_role
where id = '30000000-0000-0000-0000-000000000001';

update public.profiles set access_expires_at = now() - interval '1 day'
where id = '30000000-0000-0000-0000-00000000000a';
update public.profiles set access_expires_at = now() + interval '3 days'
where id = '30000000-0000-0000-0000-00000000000b';
update public.profiles set access_expires_at = now() + interval '30 days'
where id = '30000000-0000-0000-0000-00000000000c';
-- D keeps a null (indefinite) expiry.
update public.profiles
set
  account_status = 'suspended'::public.account_status,
  status_changed_at = now(),
  status_changed_by = '30000000-0000-0000-0000-000000000000',
  status_reason = 'Pausa de prueba de vigencias.'
where id = '30000000-0000-0000-0000-00000000000e';
update public.profiles
set
  account_status = 'suspended'::public.account_status,
  status_changed_at = now(),
  status_changed_by = '30000000-0000-0000-0000-000000000000',
  status_reason = 'Pausa de prueba de vigencias.',
  access_expires_at = now() - interval '1 day'
where id = '30000000-0000-0000-0000-00000000000f';

-- Derived per-row badge ----------------------------------------------------
select is(
  (select items -> 0 ->> 'access_state'
   from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', 'Vigencia A', 'docente', null, 25, 0, null)),
  'expirado',
  'A past expiry renders an expirado badge'
);
select is(
  (select items -> 0 ->> 'access_state'
   from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', 'Vigencia B', 'docente', null, 25, 0, null)),
  'por_vencer',
  'An expiry inside 7 days renders a por_vencer badge'
);

-- access_state filter totals (cumulative, matching Inicio) ------------------
select is(
  (select total_count from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0, 'activo')),
  3::bigint,
  'The activo filter includes every non-expired active docente'
);
select is(
  (select total_count from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0, 'por_vencer')),
  1::bigint,
  'The por_vencer filter uses the 7-day window'
);
select is(
  (select total_count from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0, 'expirado')),
  2::bigint,
  'The expirado filter counts every past expiry regardless of status'
);
select is(
  (select total_count from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0, 'pausado')),
  2::bigint,
  'The pausado filter counts suspended docentes'
);

-- Bucket counts (must equal the Inicio dashboard definitions) ---------------
select is(
  (select total_count from public.count_administrative_users(
     '30000000-0000-0000-0000-000000000000', null, 'docente')),
  6::bigint,
  'The docente total counts every seeded docente'
);
select is(
  (select active_count from public.count_administrative_users(
     '30000000-0000-0000-0000-000000000000', null, 'docente')),
  3::bigint,
  'Active count matches the non-expired active docentes'
);
select is(
  (select expiring_soon_count from public.count_administrative_users(
     '30000000-0000-0000-0000-000000000000', null, 'docente')),
  1::bigint,
  'Expiring-soon count is a subset of active within 7 days'
);
select is(
  (select expired_count from public.count_administrative_users(
     '30000000-0000-0000-0000-000000000000', null, 'docente')),
  2::bigint,
  'Expired count includes suspended-and-expired docentes'
);
select is(
  (select suspended_count from public.count_administrative_users(
     '30000000-0000-0000-0000-000000000000', null, 'docente')),
  2::bigint,
  'Suspended count matches the paused docentes'
);

-- Access-window update -----------------------------------------------------
-- Split into two assertions: Postgres does not guarantee that the profile read
-- would run after the update-function call inside a single is(), so each side
-- is compared to the same transaction-stable target instead of to each other.
select is(
  (select access_expires_at
   from public.update_administrative_user_access_window(
     '30000000-0000-0000-0000-000000000000',
     '30000000-0000-0000-0000-00000000000c',
     now(), now() + interval '60 days',
     'Extensión de vigencia autorizada.')),
  now() + interval '60 days',
  'An access-window update returns the new expiry'
);
select is(
  (select access_expires_at from public.profiles
   where id = '30000000-0000-0000-0000-00000000000c'),
  now() + interval '60 days',
  'The new expiry is persisted on the target profile'
);
select is(
  (select count(*)::int from public.operational_audit_events
   where action = 'access_window_changed'
     and resource_id = '30000000-0000-0000-0000-00000000000c'),
  1,
  'An access-window change is recorded in the operational audit trail'
);
select throws_ok(
  $past$
    select * from public.update_administrative_user_access_window(
      '30000000-0000-0000-0000-000000000000',
      '30000000-0000-0000-0000-00000000000c',
      null, now() - interval '1 day', 'Motivo válido para vigencia.')
  $past$,
  '22023',
  'The access expiry must not be in the past; suspend the account to block access immediately',
  'A past expiry is rejected (use suspend to block immediately)'
);
select throws_ok(
  $order$
    select * from public.update_administrative_user_access_window(
      '30000000-0000-0000-0000-000000000000',
      '30000000-0000-0000-0000-00000000000c',
      now() + interval '30 days', now() + interval '5 days',
      'Motivo válido para vigencia.')
  $order$,
  '22023',
  'The access start must not be after the access expiry',
  'A start after the expiry is rejected'
);
select throws_ok(
  $reason$
    select * from public.update_administrative_user_access_window(
      '30000000-0000-0000-0000-000000000000',
      '30000000-0000-0000-0000-00000000000c',
      null, now() + interval '5 days', ' ')
  $reason$,
  '22023',
  'An access-window change requires a reason',
  'An empty reason is rejected'
);
select throws_ok(
  $denied$
    select * from public.update_administrative_user_access_window(
      '30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-00000000000c',
      null, now() + interval '5 days', 'Motivo válido para vigencia.')
  $denied$,
  '42501',
  'Only an active superadministrator may perform this operation',
  'A non-superadministrator cannot change an access window'
);

-- The reason is not just validated: it has to survive in the audit trail.
select is(
  (select metadata ->> 'reason'
   from public.operational_audit_events
   where action = 'access_window_changed'
     and resource_id = '30000000-0000-0000-0000-00000000000c'
   order by occurred_at desc, id desc
   limit 1),
  'Extensión de vigencia autorizada.',
  'The access-window audit records the reason that justified the change'
);
select isnt(
  (select access_start_at from public.profiles
   where id = '30000000-0000-0000-0000-00000000000c'),
  null,
  'The informational start date is persisted'
);
select isnt(
  (select items -> 0 ->> 'access_start_at'
   from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', 'Vigencia C', 'docente', null, 25, 0, null)),
  null,
  'The directory exposes the access start it stored'
);

-- Clearing both dates is how an access becomes indefinite again.
select ok(
  (select access_start_at is null and access_expires_at is null
   from public.update_administrative_user_access_window(
     '30000000-0000-0000-0000-000000000000',
     '30000000-0000-0000-0000-00000000000c',
     null, null, 'Vigencia indefinida autorizada.')),
  'Clearing both dates leaves the access indefinite'
);

-- Exclusive priority of the row badge: an expired suspension reads as expirado.
select is(
  (select items -> 0 ->> 'access_state'
   from public.list_administrative_users_page(
     '30000000-0000-0000-0000-000000000000', 'Vigencia F', 'docente', null, 25, 0, null)),
  'expirado',
  'An expired and suspended account is labelled expirado, not pausado'
);

select throws_ok(
  $self_target$
    select * from public.update_administrative_user_access_window(
      '30000000-0000-0000-0000-000000000000',
      '30000000-0000-0000-0000-000000000000',
      null, now() + interval '5 days', 'Motivo válido para vigencia.')
  $self_target$,
  '22023',
  'A superadministrator cannot change their own access window',
  'A superadministrator cannot change their own access window'
);
select throws_ok(
  $count_denied$
    select * from public.count_administrative_users(
      '30000000-0000-0000-0000-000000000001', null, 'docente')
  $count_denied$,
  '42501',
  'Only an active superadministrator may perform this operation',
  'An administrator cannot count the directory'
);

-- Last-superadministrator invariant: expiry enforcement is fail-closed across
-- the API, so the last unexpired superadministrator may not be given an expiry.
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
  'aw-superadmin-2@example.test', '{}'::jsonb,
  '{"full_name":"Superadministrador Suplente"}'::jsonb, now(), now()
);
update public.profiles
set role = 'superadmin'::public.app_role
where id = '30000000-0000-0000-0000-000000000002';
update public.profiles
set access_expires_at = now() - interval '1 day'
where id = '30000000-0000-0000-0000-000000000000';

select throws_ok(
  $last_superadmin$
    select * from public.update_administrative_user_access_window(
      '30000000-0000-0000-0000-000000000000',
      '30000000-0000-0000-0000-000000000002',
      null, now() + interval '5 days', 'Motivo válido para vigencia.')
  $last_superadmin$,
  '23514',
  'At least one active superadministrator must keep unexpired access',
  'The last unexpired superadministrator cannot be given an expiry'
);

select * from finish();
rollback;
