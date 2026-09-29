begin;

select plan(11);

select has_column('public', 'profiles', 'department', 'Profiles store a department');
select has_column('public', 'profiles', 'city', 'Profiles store a city');
select ok(
  has_column_privilege(
    'authenticated',
    'public.profiles',
    'full_name',
    'update'
  ),
  'Authenticated users can update their own editable profile fields'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'role',
    'update'
  ),
  'Authenticated users cannot update their role'
);
select ok(
  not has_column_privilege(
    'authenticated',
    'public.profiles',
    'updated_at',
    'update'
  ),
  'Authenticated users cannot forge the profile update timestamp'
);
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Authenticated users can update their own profile'
      and cmd = 'UPDATE'
  ),
  'The own-profile update policy exists'
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

update public.profiles
set updated_at = '2020-01-01 00:00:00+00'
where id = '69000000-0000-0000-0000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', '69000000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$update public.profiles
    set full_name = 'María Docente', phone = '987654321',
        department = 'Lima', city = 'Huancayo'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  'The current user can update the allowed profile fields'
);
select is(
  (select phone from public.profiles where id = '69000000-0000-0000-0000-000000000001'),
  '987654321',
  'The current user contact data is updated'
);

reset role;

select is(
  (select full_name from public.profiles where id = '69000000-0000-0000-0000-000000000002'),
  'Otra Persona',
  'Another profile is not changed'
);
select ok(
  (select updated_at > '2020-01-01 00:00:00+00'::timestamptz
   from public.profiles
   where id = '69000000-0000-0000-0000-000000000001'),
  'The database updates the timestamp automatically'
);
select throws_ok(
  $$update public.profiles
    set full_name = 'A'
    where id = '69000000-0000-0000-0000-000000000001'$$,
  '23514',
  null,
  'Profile constraints reject invalid data'
);

select * from finish();

rollback;
