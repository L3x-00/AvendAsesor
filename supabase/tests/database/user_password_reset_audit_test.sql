begin;

select plan(3);

-- Superadministrador y docente de prueba ---------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '3b000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reset.admin@example.test', 'x',
    now(), now(), now(), '{"provider":"email"}'::jsonb,
    '{"full_name":"Admin Reset QA"}'::jsonb
  ),
  (
    '3b000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'reset.docente@example.test', 'x',
    now(), now(), now(), '{"provider":"email"}'::jsonb,
    '{"full_name":"Docente Reset QA"}'::jsonb
  );

update public.profiles
set role = 'superadmin', full_name = 'Admin Reset QA'
where id = '3b000000-0000-0000-0000-000000000901';

update public.profiles
set role = 'docente', full_name = 'Docente Reset QA'
where id = '3b000000-0000-0000-0000-000000000902';

select lives_ok(
  $$
    select public.record_user_password_reset(
      '3b000000-0000-0000-0000-000000000901',
      '3b000000-0000-0000-0000-000000000902'
    );
  $$,
  'Un superadministrador registra el envío del enlace'
);

select results_eq(
  $$
    select action::text, resource_type
    from public.operational_audit_events
    where resource_id = '3b000000-0000-0000-0000-000000000902'
  $$,
  $$ values ('user_password_reset', 'profile') $$,
  'La auditoría conserva la acción y el recurso del restablecimiento'
);

select throws_ok(
  $$
    select public.record_user_password_reset(
      '3b000000-0000-0000-0000-000000000902',
      '3b000000-0000-0000-0000-000000000901'
    );
  $$,
  '42501',
  null,
  'Un docente no puede registrar ni enviar restablecimientos'
);

select * from finish();
rollback;
