begin;

select plan(19);

-- Estructura ----------------------------------------------------------------
select has_column(
  'public', 'profiles', 'phone',
  'Profiles carry an optional contact phone'
);
select has_column(
  'public', 'profiles', 'created_by',
  'Profiles record who created the record'
);
select has_column(
  'public', 'profiles', 'updated_by',
  'Profiles record who last modified the record'
);
select ok(
  exists (
    select 1
    from pg_enum as enum_value
    join pg_type as enum_type on enum_type.oid = enum_value.enumtypid
    where enum_type.typname = 'operational_audit_action'
      and enum_value.enumlabel = 'user_created'
  ),
  'The operational audit action enum includes user_created'
);
select has_function(
  'public',
  'provision_administrative_user',
  array['uuid', 'uuid', 'text', 'app_role', 'text', 'timestamptz', 'timestamptz'],
  'Provisioning a new administrative user has a dedicated RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.provision_administrative_user(uuid,uuid,text,public.app_role,text,timestamptz,timestamptz)'::regprocedure,
    'execute'
  ),
  'Only the server role can provision a user'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.provision_administrative_user(uuid,uuid,text,public.app_role,text,timestamptz,timestamptz)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot provision users directly'
);

-- Fixtures -------------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('40000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'prov-superadmin@example.test', '{}'::jsonb,
   '{"full_name":"Superadministrador Alta"}'::jsonb, now(), now()),
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'prov-admin@example.test', '{}'::jsonb,
   '{"full_name":"Administrador Alta"}'::jsonb, now(), now()),
  -- Identidad recien invitada: el trigger ya creo su perfil con rol por defecto.
  ('40000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated',
   'nueva.docente@example.test', '{}'::jsonb,
   '{"full_name":"Pendiente"}'::jsonb, now(), now());

update public.profiles
set role = 'superadmin'::public.app_role
where id = '40000000-0000-0000-0000-000000000000';

update public.profiles
set role = 'admin'::public.app_role
where id = '40000000-0000-0000-0000-000000000001';

-- Alta -----------------------------------------------------------------------
select is(
  (select role::text
   from public.provision_administrative_user(
     '40000000-0000-0000-0000-000000000000',
     '40000000-0000-0000-0000-00000000000a',
     'Nueva Docente Registrada',
     'docente'::public.app_role,
     '987654321',
     null,
     now() + interval '90 days')),
  'docente',
  'Provisioning applies the requested role'
);
select is(
  (select phone from public.profiles
   where id = '40000000-0000-0000-0000-00000000000a'),
  '987654321',
  'Provisioning stores the contact phone'
);
select is(
  (select created_by from public.profiles
   where id = '40000000-0000-0000-0000-00000000000a'),
  '40000000-0000-0000-0000-000000000000'::uuid,
  'Provisioning records who created the record'
);
select is(
  (select count(*)::int from public.operational_audit_events
   where action = 'user_created'
     and resource_id = '40000000-0000-0000-0000-00000000000a'),
  1,
  'Creating a user is recorded in the operational audit trail'
);

-- Un segundo alta seria una edicion encubierta sin motivo auditado.
select throws_ok(
  $already$
    select * from public.provision_administrative_user(
      '40000000-0000-0000-0000-000000000000',
      '40000000-0000-0000-0000-00000000000a',
      'Intento Duplicado',
      'admin'::public.app_role,
      null, null, null)
  $already$,
  '23505',
  'The administrative user was already provisioned',
  'A user cannot be provisioned twice'
);
select throws_ok(
  $prov_denied$
    select * from public.provision_administrative_user(
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-00000000000a',
      'Alta No Autorizada',
      'docente'::public.app_role,
      null, null, null)
  $prov_denied$,
  '42501',
  'Only an active superadministrator may perform this operation',
  'An administrator cannot provision users'
);
select throws_ok(
  $prov_past$
    select * from public.provision_administrative_user(
      '40000000-0000-0000-0000-000000000000',
      '40000000-0000-0000-0000-000000000001',
      'Alta Con Fecha Pasada',
      'docente'::public.app_role,
      null, null, now() - interval '1 day')
  $prov_past$,
  '22023',
  'The access expiry must not be in the past',
  'A new user cannot be created already expired'
);

-- Directorio: correo, celular y creado-por, y busqueda por esos campos --------
select is(
  (select items -> 0 ->> 'email'
   from public.list_administrative_users_page(
     '40000000-0000-0000-0000-000000000000', 'Nueva Docente Registrada',
     'docente', null, 25, 0, null)),
  'nueva.docente@example.test',
  'The directory exposes the address stored in auth.users'
);
select is(
  (select items -> 0 ->> 'phone'
   from public.list_administrative_users_page(
     '40000000-0000-0000-0000-000000000000', 'Nueva Docente Registrada',
     'docente', null, 25, 0, null)),
  '987654321',
  'The directory exposes the contact phone'
);
select is(
  (select items -> 0 ->> 'created_by_name'
   from public.list_administrative_users_page(
     '40000000-0000-0000-0000-000000000000', 'Nueva Docente Registrada',
     'docente', null, 25, 0, null)),
  'Superadministrador Alta',
  'The directory names the administrator who created the record'
);
select is(
  (select total_count
   from public.list_administrative_users_page(
     '40000000-0000-0000-0000-000000000000', 'nueva.docente@example.test',
     'docente', null, 25, 0, null)),
  1::bigint,
  'The directory can be searched by email address'
);
select is(
  (select total_count
   from public.list_administrative_users_page(
     '40000000-0000-0000-0000-000000000000', '987654321',
     'docente', null, 25, 0, null)),
  1::bigint,
  'The directory can be searched by phone number'
);

select * from finish();
rollback;
