-- Mi perfil: columnas del perfil y cierre de la escritura directa desde el
-- navegador (TSK-0070 / ADR-0023). La edición propia pasa por la RPC
-- public.update_own_profile (ver update_own_profile_rpc_test.sql).
begin;

select plan(22);

select has_column('public', 'profiles', 'department', 'Profiles store a department');
select has_column('public', 'profiles', 'city', 'Profiles store a city');

-- 1. Sin privilegios de escritura directa para authenticated ni anon.
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'Authenticated users have no table-level UPDATE on profiles'
);
select ok(
  not has_table_privilege('anon', 'public.profiles', 'UPDATE'),
  'Anonymous users have no table-level UPDATE on profiles'
);
select ok(
  not exists (
    select 1
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name = 'profiles'
      and grantee in ('authenticated', 'anon', 'PUBLIC')
      and privilege_type in ('UPDATE', 'INSERT')
  ),
  'No column of profiles is writable by authenticated or anon'
);
select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd in ('UPDATE', 'ALL', 'INSERT', 'DELETE')
  ),
  'profiles has no write policy (the own-profile UPDATE policy was removed)'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Authenticated users can read their own profile'
      and cmd = 'SELECT'
  ),
  'The own-profile SELECT policy is preserved'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('69000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'perfil@example.test', '{}'::jsonb, '{"full_name":"Nombre Inicial"}'::jsonb,
   now(), now()),
  ('69000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'otra@example.test', '{}'::jsonb, '{"full_name":"Otra Persona"}'::jsonb,
   now(), now());

-- 2. Intentos directos por PostgREST (rol authenticated con su propio JWT).
set local role authenticated;
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$update public.profiles
    set full_name = repeat(' ', 300) || 'Ana Pérez'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A padded full_name cannot be written directly (perfil-db-1)'
);
select throws_ok(
  $$update public.profiles
    set phone = '987654321', department = 'Lima', city = 'Huancayo'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'Contact data cannot be written directly; it goes through the RPC'
);
select throws_ok(
  $$update public.profiles set role = 'superadmin'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A user cannot escalate their own role'
);
select throws_ok(
  $$update public.profiles set account_status = 'active'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A user cannot change their own account status'
);
select throws_ok(
  $$update public.profiles set access_expires_at = null
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A user cannot extend their own access window'
);
select throws_ok(
  $$update public.profiles set access_start_at = null
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A user cannot change their own access start'
);
select throws_ok(
  $$update public.profiles set updated_by = null, created_by = null
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A user cannot forge created_by or updated_by'
);
select throws_ok(
  $$update public.profiles set full_name = 'Suplantada'
    where id = '69000000-0000-0000-0000-000000000002'$$,
  '42501',
  null,
  'A user cannot write another person profile'
);
select throws_ok(
  $$delete from public.profiles
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'A user cannot delete their own profile'
);

reset role;

select is(
  (select full_name from public.profiles where id = '69000000-0000-0000-0000-000000000002'),
  'Otra Persona',
  'Another profile is not changed'
);
select is(
  (select full_name from public.profiles where id = '69000000-0000-0000-0000-000000000001'),
  'Nombre Inicial',
  'The own profile is not changed by the rejected direct writes'
);

-- 3. Invariantes de la base sobre el nombre en bruto (defensa en profundidad).
select throws_ok(
  $$update public.profiles
    set full_name = repeat(' ', 300) || 'Ana Pérez'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'The database rejects a full_name padded with spaces, whatever its trimmed length'
);
select throws_ok(
  $$update public.profiles
    set full_name = 'A'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'Profile constraints reject a too short name'
);

-- 4. updated_at refleja cambios de datos, no el último acceso (perfil-db-4).
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles
set updated_at = '2020-01-01 00:00:00+00', last_access_at = null
where id = '69000000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_set_updated_at;

select public.touch_profile_last_access('69000000-0000-0000-0000-000000000001');

select ok(
  (select last_access_at is not null and updated_at = '2020-01-01 00:00:00+00'::timestamptz
   from public.profiles
   where id = '69000000-0000-0000-0000-000000000001'),
  'Recording the last access does not move updated_at'
);

update public.profiles
set phone = '987654321'
where id = '69000000-0000-0000-0000-000000000001';

select ok(
  (select updated_at > '2020-01-01 00:00:00+00'::timestamptz
   from public.profiles
   where id = '69000000-0000-0000-0000-000000000001'),
  'Changing a data column still moves updated_at'
);

select * from finish();

rollback;
