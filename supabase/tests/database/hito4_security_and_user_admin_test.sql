begin;

select plan(34);

select has_type('public', 'account_status', 'Account state is constrained by an enum');
select has_type('public', 'operational_audit_action', 'Operational audit actions are constrained by an enum');
select has_column('public', 'profiles', 'account_status', 'Profiles have an explicit account state');
select has_column('public', 'profiles', 'last_access_at', 'Profiles retain bounded access telemetry');
select has_table('public', 'operational_audit_events', 'Operational events are persisted separately');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.operational_audit_events'::regclass),
  'Operational event records enable RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.operational_audit_events', 'select'),
  'Authenticated clients cannot inspect operational audit records directly'
);
select has_function('public', 'touch_profile_last_access', array['uuid'], 'Access telemetry has a controlled server-only function');
select has_function('public', 'list_administrative_users', array['uuid', 'text', 'integer'], 'Superadministrators list users through a controlled function');
select has_function('public', 'update_administrative_user', array['uuid', 'uuid', 'app_role', 'account_status', 'text'], 'Superadministrators update roles and status through a controlled function');
select has_function('public', 'list_operational_audit_events', array['uuid', 'integer'], 'Superadministrators read operational audit through a controlled function');
select ok(
  not has_function_privilege('authenticated', 'public.touch_profile_last_access(uuid)'::regprocedure, 'execute'),
  'Authenticated clients cannot write access telemetry directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.list_administrative_users(uuid,text,integer)'::regprocedure, 'execute'),
  'Authenticated clients cannot list administrative users directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.update_administrative_user(uuid,uuid,public.app_role,public.account_status,text)'::regprocedure, 'execute'),
  'Authenticated clients cannot update administrative users directly'
);
select ok(
  not has_function_privilege('authenticated', 'public.list_operational_audit_events(uuid,integer)'::regprocedure, 'execute'),
  'Authenticated clients cannot inspect operational audit directly'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-00000000c501',
    'authenticated', 'authenticated', 'hito4-superadmin@example.test',
    '{}'::jsonb, '{"full_name":"Superadministrador H4"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000c502',
    'authenticated', 'authenticated', 'hito4-target@example.test',
    '{}'::jsonb, '{"full_name":"Docente Objetivo H4"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000c503',
    'authenticated', 'authenticated', 'hito4-admin@example.test',
    '{}'::jsonb, '{"full_name":"Administrador Delegado H4"}'::jsonb, now(), now()
  );

update public.profiles
set role = case id
  when '00000000-0000-0000-0000-00000000c501'::uuid then 'superadmin'::public.app_role
  when '00000000-0000-0000-0000-00000000c503'::uuid then 'admin'::public.app_role
  else role
end
where id in (
  '00000000-0000-0000-0000-00000000c501',
  '00000000-0000-0000-0000-00000000c503'
);

select is(
  (select full_name from public.list_administrative_users(
    '00000000-0000-0000-0000-00000000c501', 'Objetivo', 10
  ) limit 1),
  'Docente Objetivo H4',
  'An active superadministrator can find the minimum user record needed for administration'
);
select ok(
  not (
    select to_jsonb(row_data) ? 'status_reason'
    from (
      select * from public.list_administrative_users(
        '00000000-0000-0000-0000-00000000c501', null, 10
      ) limit 1
    ) as row_data
  ),
  'The administrative listing does not expose internal suspension reasons'
);
select throws_ok(
  $admin_list$
    select * from public.list_administrative_users(
      '00000000-0000-0000-0000-00000000c503', null, 10
    )
  $admin_list$,
  '42501',
  'Only an active superadministrator may perform this operation',
  'An administrator cannot enumerate platform users'
);
select throws_ok(
  $self_change$
    select * from public.update_administrative_user(
      '00000000-0000-0000-0000-00000000c501',
      '00000000-0000-0000-0000-00000000c501',
      'admin', null, 'Cambio propio no permitido.'
    )
  $self_change$,
  '22023',
  'A superadministrator cannot change their own role or account status',
  'A superadministrator cannot modify their own privileged account'
);
select lives_ok(
  $promote_target$
    select * from public.update_administrative_user(
      '00000000-0000-0000-0000-00000000c501',
      '00000000-0000-0000-0000-00000000c502',
      'admin', null, 'Delegación operativa aprobada.'
    )
  $promote_target$,
  'A superadministrator can change another user role with a justification'
);
select is(
  (select role::text from public.profiles where id = '00000000-0000-0000-0000-00000000c502'),
  'admin',
  'The controlled user role update is persisted'
);
select is(
  (
    select metadata ->> 'fromRole'
    from public.operational_audit_events
    where action = 'user_role_changed'
      and resource_id = '00000000-0000-0000-0000-00000000c502'
  ),
  'docente',
  'Role audit records the actual prior role'
);
select lives_ok(
  $delete_history$
    insert into public.chat_conversations (id, user_id, title)
    values (
      '00000000-0000-0000-0000-00000000c601',
      '00000000-0000-0000-0000-00000000c502',
      'Historial para auditoría H4'
    );
    select * from public.delete_chat_conversation(
      '00000000-0000-0000-0000-00000000c502',
      '00000000-0000-0000-0000-00000000c601'
    )
  $delete_history$,
  'A private history deletion is accepted before the account is suspended'
);
select is(
  (
    select count(*) from public.operational_audit_events
    where action = 'chat_history_deleted'
      and resource_id = '00000000-0000-0000-0000-00000000c601'
  ),
  1::bigint,
  'Logical history deletion adds one append-only operational audit event'
);
select lives_ok(
  $suspend_target$
    select * from public.update_administrative_user(
      '00000000-0000-0000-0000-00000000c501',
      '00000000-0000-0000-0000-00000000c502',
      null, 'suspended', 'Incidencia de acceso confirmada.'
    )
  $suspend_target$,
  'A superadministrator can suspend another account with a justification'
);
select ok(
  (select account_status = 'suspended'::public.account_status
      and status_changed_at is not null
      and status_changed_by = '00000000-0000-0000-0000-00000000c501'::uuid
      and status_reason = 'Incidencia de acceso confirmada.'
   from public.profiles where id = '00000000-0000-0000-0000-00000000c502'),
  'Suspension state always includes accountable actor, time and reason'
);
select is(
  (
    select metadata ->> 'fromStatus'
    from public.operational_audit_events
    where action = 'user_status_changed'
      and resource_id = '00000000-0000-0000-0000-00000000c502'
  ),
  'active',
  'Status audit records the actual prior account state'
);
select throws_ok(
  $no_effect$
    select * from public.update_administrative_user(
      '00000000-0000-0000-0000-00000000c501',
      '00000000-0000-0000-0000-00000000c502',
      'admin', 'suspended', 'Cambio sin efecto.'
    )
  $no_effect$,
  '22023',
  'The administrative user change has no effect',
  'A no-op user administration request is rejected'
);
select lives_ok(
  $touch_access$
    select public.touch_profile_last_access('00000000-0000-0000-0000-00000000c503')
  $touch_access$,
  'Server-side access telemetry can be updated without exposing a client write path'
);
select ok(
  (select last_access_at is not null from public.profiles where id = '00000000-0000-0000-0000-00000000c503'),
  'Access telemetry is stored with a bounded server-side write'
);
select is(
  (select count(*) from public.list_operational_audit_events(
    '00000000-0000-0000-0000-00000000c501', 100
  )),
  3::bigint,
  'Superadministrators can read the three generated audit events through the controlled RPC'
);
select throws_ok(
  $admin_audit$
    select * from public.list_operational_audit_events(
      '00000000-0000-0000-0000-00000000c503', 10
    )
  $admin_audit$,
  '42501',
  'Only an active superadministrator may perform this operation',
  'An administrator cannot read platform audit history'
);
select throws_ok(
  $mutate_audit$
    update public.operational_audit_events
    set metadata = '{}'::jsonb
    where action = 'user_role_changed'
  $mutate_audit$,
  'P0001',
  'Operational audit events are append-only',
  'Operational audit history cannot be updated'
);
select throws_ok(
  $delete_audit$
    delete from public.operational_audit_events
    where action = 'user_role_changed'
  $delete_audit$,
  'P0001',
  'Operational audit events are append-only',
  'Operational audit history cannot be deleted'
);

select * from finish();
rollback;
