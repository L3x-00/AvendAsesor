-- public.update_own_profile: edición del propio perfil desde Mi perfil
-- (TSK-0070 / ADR-0023). Contrato compartido con apps/web: el código de error
-- viaja en el mensaje de la excepción.
begin;

select plan(48);

-- 1. Forma y privilegios de la función.
select has_function(
  'public', 'update_own_profile', array['text', 'text', 'text', 'text'],
  'update_own_profile(text, text, text, text) exists'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.update_own_profile(text, text, text, text)'::regprocedure),
  true,
  'update_own_profile is SECURITY DEFINER'
);
select ok(
  (select proconfig @> array['search_path=""']
   from pg_proc where oid = 'public.update_own_profile(text, text, text, text)'::regprocedure),
  'update_own_profile pins an empty search_path'
);
select is(
  (select pg_get_userbyid(proowner)::text
   from pg_proc where oid = 'public.update_own_profile(text, text, text, text)'::regprocedure),
  'postgres',
  'update_own_profile is owned by postgres'
);
select ok(
  has_function_privilege('authenticated', 'public.update_own_profile(text, text, text, text)', 'EXECUTE'),
  'authenticated can execute update_own_profile'
);
select ok(
  not has_function_privilege('anon', 'public.update_own_profile(text, text, text, text)', 'EXECUTE'),
  'anon cannot execute update_own_profile'
);
select ok(
  not exists (
    select 1
    from pg_proc, aclexplode(coalesce(proacl, acldefault('f', proowner))) as acl
    where oid = 'public.update_own_profile(text, text, text, text)'::regprocedure
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute update_own_profile'
);
select ok(
  not has_function_privilege('service_role', 'public.update_own_profile(text, text, text, text)', 'EXECUTE'),
  'service_role cannot execute update_own_profile (it is an end-user operation)'
);

-- 2. Datos de prueba: docente, docente suspendido, docente vencido, docente
-- con acceso futuro, admin y superadmin.
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('69100000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'rpc-docente@example.test', '{}'::jsonb, '{"full_name":"Docente Inicial"}'::jsonb, now(), now()),
  ('69100000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'rpc-suspendida@example.test', '{}'::jsonb, '{"full_name":"Docente Suspendida"}'::jsonb, now(), now()),
  ('69100000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'rpc-vencida@example.test', '{}'::jsonb, '{"full_name":"Docente Vencida"}'::jsonb, now(), now()),
  ('69100000-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
   'rpc-futura@example.test', '{}'::jsonb, '{"full_name":"Docente Futura"}'::jsonb, now(), now()),
  ('69100000-0000-0000-0000-000000000005', 'authenticated', 'authenticated',
   'rpc-admin@example.test', '{}'::jsonb, '{"full_name":"Admin Nombre"}'::jsonb, now(), now()),
  ('69100000-0000-0000-0000-000000000006', 'authenticated', 'authenticated',
   'rpc-super@example.test', '{}'::jsonb, '{"full_name":"Super Nombre"}'::jsonb, now(), now()),
  ('69100000-0000-0000-0000-000000000007', 'authenticated', 'authenticated',
   'rpc-vigente@example.test', '{}'::jsonb, '{"full_name":"Docente Vigente"}'::jsonb, now(), now());

update public.profiles
set account_status = 'suspended',
    status_changed_at = now(),
    status_changed_by = '69100000-0000-0000-0000-000000000006',
    status_reason = 'Prueba de suspensión'
where id = '69100000-0000-0000-0000-000000000002';

update public.profiles
set access_expires_at = now() - interval '1 minute'
where id = '69100000-0000-0000-0000-000000000003';

update public.profiles
set access_start_at = now() + interval '7 days'
where id = '69100000-0000-0000-0000-000000000004';

update public.profiles
set access_expires_at = now() + interval '30 days'
where id = '69100000-0000-0000-0000-000000000007';

update public.profiles set role = 'admin'
where id = '69100000-0000-0000-0000-000000000005';
update public.profiles set role = 'superadmin'
where id = '69100000-0000-0000-0000-000000000006';

-- updated_at y updated_by en un punto conocido, sin que el trigger lo pise.
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles
set updated_at = '2020-01-01 00:00:00+00', updated_by = null
where id::text like '69100000-%';
alter table public.profiles enable trigger profiles_set_updated_at;

-- 3. Sin sesión.
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);

select throws_ok(
  $$select public.update_own_profile('Sin Sesión', null, null, null)$$,
  '28000',
  'not_authenticated',
  'Without a session the RPC fails with not_authenticated'
);

reset role;
set local role anon;
select throws_ok(
  $$select public.update_own_profile('Anónimo', null, null, null)$$,
  '42501',
  null,
  'anon cannot call the RPC at all'
);
reset role;

-- 4. Docente activo: guarda y normaliza.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000001', true);

select lives_ok(
  $$select public.update_own_profile(
      E' \t María Docente \n​',
      E'  987654321 ',
      E'\tLima ',
      ' Huancayo '
    )$$,
  'An active teacher can save their profile'
);

reset role;

select is(
  (select full_name from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  'María Docente',
  'The name is trimmed of ASCII, NBSP, tab, newline and zero-width blanks'
);
select is(
  (select phone from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  '987654321',
  'The phone is trimmed'
);
select is(
  (select department from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  'Lima',
  'The department is trimmed'
);
select is(
  (select city from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  'Huancayo',
  'The city is trimmed'
);
select is(
  (select updated_by from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  '69100000-0000-0000-0000-000000000001'::uuid,
  'A self edit records the person as updated_by'
);
select ok(
  (select updated_at > '2020-01-01 00:00:00+00'::timestamptz
   from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  'A self edit moves updated_at'
);
select is(
  (select role::text || '/' || account_status::text
   from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  'docente/active',
  'The RPC never changes role or status'
);

-- Blancos y vacíos opcionales pasan a null.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_own_profile('María Docente', E'      ', '', null)$$,
  'Blank optional data can be cleared'
);
reset role;
select ok(
  (select phone is null and department is null and city is null
   from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  'Blank phone, department and city are stored as null'
);

-- Guardar sin cambios no mueve la «Última modificación».
alter table public.profiles disable trigger profiles_set_updated_at;
update public.profiles
set updated_at = '2020-01-01 00:00:00+00', updated_by = null
where id = '69100000-0000-0000-0000-000000000001';
alter table public.profiles enable trigger profiles_set_updated_at;

set local role authenticated;
select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000001', true);
select lives_ok(
  $$select public.update_own_profile(' María Docente ', null, null, null)$$,
  'Saving the same data succeeds'
);
reset role;
select ok(
  (select updated_at = '2020-01-01 00:00:00+00'::timestamptz and updated_by is null
   from public.profiles where id = '69100000-0000-0000-0000-000000000001'),
  'Saving unchanged data does not touch updated_at nor updated_by'
);

-- 5. Validaciones (22023) con el código en el mensaje.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000001', true);

select throws_ok(
  $$select public.update_own_profile('A', null, null, null)$$,
  '22023', 'invalid_full_name', 'A one-letter name is rejected'
);
select throws_ok(
  $$select public.update_own_profile(repeat(' ', 300) || 'A', null, null, null)$$,
  '22023', 'invalid_full_name', 'Padding cannot make a short name valid'
);
select throws_ok(
  $$select public.update_own_profile(repeat('a', 161), null, null, null)$$,
  '22023', 'invalid_full_name', 'A name longer than 160 characters is rejected'
);
select throws_ok(
  $$select public.update_own_profile(E' \t\n ', null, null, null)$$,
  '22023', 'invalid_full_name', 'A name made only of invisible blanks is rejected'
);
select throws_ok(
  $$select public.update_own_profile(null, null, null, null)$$,
  '22023', 'invalid_full_name', 'A teacher must send a name'
);
select throws_ok(
  $$select public.update_own_profile(E'Ana\u0007Pérez', null, null, null)$$,
  '22023', 'invalid_full_name', 'Control characters inside the name are rejected'
);
select throws_ok(
  $$select public.update_own_profile('María Docente', '12345', null, null)$$,
  '22023', 'invalid_phone', 'A phone shorter than 6 characters is rejected'
);
select throws_ok(
  $$select public.update_own_profile('María Docente', repeat('9', 21), null, null)$$,
  '22023', 'invalid_phone', 'A phone longer than 20 characters is rejected'
);
select throws_ok(
  $$select public.update_own_profile('María Docente', null, 'L', null)$$,
  '22023', 'invalid_department', 'A one-letter department is rejected'
);
select throws_ok(
  $$select public.update_own_profile('María Docente', null, repeat('d', 121), null)$$,
  '22023', 'invalid_department', 'A department longer than 120 characters is rejected'
);
select throws_ok(
  $$select public.update_own_profile('María Docente', null, null, 'H')$$,
  '22023', 'invalid_city', 'A one-letter city is rejected'
);
select throws_ok(
  $$select public.update_own_profile('María Docente', null, null, repeat('c', 121))$$,
  '22023', 'invalid_city', 'A city longer than 120 characters is rejected'
);

reset role;

-- 6. Estado y vigencia (perfil-db-2).
set local role authenticated;
select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000002', true);
select throws_ok(
  $$select public.update_own_profile('Soporte AVEND', '987654321', null, null)$$,
  '42501', 'profile_inactive', 'A suspended account cannot edit its profile'
);

select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000003', true);
select throws_ok(
  $$select public.update_own_profile('Docente Vencida', '987654321', null, null)$$,
  '42501', 'profile_inactive', 'An expired account cannot edit its profile'
);

select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000004', true);
select lives_ok(
  $$select public.update_own_profile('Docente Futura', '987654321', null, null)$$,
  'access_start_at is informative only and does not block edits'
);

select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000007', true);
select lives_ok(
  $$select public.update_own_profile('Docente Vigente', '987654321', null, null)$$,
  'An account with a future expiry can edit its profile'
);

select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-0000000000ff', true);
select throws_ok(
  $$select public.update_own_profile('Sin Perfil', null, null, null)$$,
  '42501', 'profile_inactive', 'A session without a profile row cannot edit anything'
);

reset role;

select is(
  (select full_name || '|' || coalesce(phone, '-')
   from public.profiles where id = '69100000-0000-0000-0000-000000000002'),
  'Docente Suspendida|-',
  'The suspended profile stays unchanged'
);

-- 7. Admin y superadmin: el nombre lo gestiona la administración (perfil-db-8).
set local role authenticated;
select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000005', true);

select throws_ok(
  $$select public.update_own_profile('Rosa Quispe', '987654321', 'Junín', 'Huancayo')$$,
  '42501', 'name_managed_by_admin', 'An admin cannot rename themself'
);
select lives_ok(
  $$select public.update_own_profile(null, '987654321', 'Junín', 'Huancayo')$$,
  'An admin can save contact data without sending a name'
);
select lives_ok(
  $$select public.update_own_profile(' Admin Nombre ', '912345678', 'Junín', 'Huancayo')$$,
  'An admin can save contact data sending their current name'
);

reset role;
select is(
  (select full_name || '|' || phone || '|' || department || '|' || city
   from public.profiles where id = '69100000-0000-0000-0000-000000000005'),
  'Admin Nombre|912345678|Junín|Huancayo',
  'The admin keeps their name and updates their contact data'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '69100000-0000-0000-0000-000000000006', true);
select throws_ok(
  $$select public.update_own_profile('Otro Nombre', null, null, null)$$,
  '42501', 'name_managed_by_admin', 'A superadmin cannot rename themself'
);
select lives_ok(
  $$select public.update_own_profile('', '987654321', null, 'Lima')$$,
  'A superadmin can save contact data with an empty name'
);
reset role;

select is(
  (select full_name || '|' || phone || '|' || city
   from public.profiles where id = '69100000-0000-0000-0000-000000000006'),
  'Super Nombre|987654321|Lima',
  'The superadmin keeps their name and updates their contact data'
);

-- 8. Solo el propio registro.
select is(
  (select count(*)::integer
   from public.profiles
   where id::text like '69100000-%'
     and updated_by is not null
     and updated_by <> id),
  0,
  'The RPC only ever touches the caller own row'
);

select * from finish();

rollback;
