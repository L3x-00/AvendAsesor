-- Contrato del RPC que unifica la resolución de acceso de la web.
-- Verifica que la identidad sale del token, no de un parámetro, y que las
-- decisiones de vigencia y permiso siguen tomándose en la base de datos.
begin;

select plan(18);

-- 1. Forma y privilegios.
select has_function(
  'public', 'current_user_access_context', array[]::text[],
  'current_user_access_context() exists'
);
select is(
  (select prosecdef from pg_proc
    where oid = 'public.current_user_access_context()'::regprocedure),
  true,
  'It is SECURITY DEFINER'
);
select ok(
  (select proconfig @> array['search_path=""']
    from pg_proc where oid = 'public.current_user_access_context()'::regprocedure),
  'It pins an empty search_path'
);
select is(
  (select provolatile from pg_proc
    where oid = 'public.current_user_access_context()'::regprocedure),
  's',
  'It is STABLE (one read, no writes)'
);
select ok(
  has_function_privilege('authenticated', 'public.current_user_access_context()', 'EXECUTE'),
  'authenticated sessions can read their own context'
);
select ok(
  not has_function_privilege('anon', 'public.current_user_access_context()', 'EXECUTE'),
  'anon cannot read access context'
);
select ok(
  not exists (
    select 1 from pg_proc,
      aclexplode(coalesce(proacl, acldefault('f', proowner))) as acl
    where oid = 'public.current_user_access_context()'::regprocedure
      and acl.grantee = 0 and acl.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot read access context'
);

-- 2. Datos de prueba: docente, admin, admin sin permiso, superadmin,
-- suspendida y vencida.
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('69200000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
   'ctx-docente@example.test', '{}'::jsonb, '{"full_name":"Docente Contexto"}'::jsonb, now(), now()),
  ('69200000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
   'ctx-admin@example.test', '{}'::jsonb, '{"full_name":"Admin Contexto"}'::jsonb, now(), now()),
  ('69200000-0000-0000-0000-000000000003', 'authenticated', 'authenticated',
   'ctx-sin-permiso@example.test', '{}'::jsonb, '{"full_name":"Admin Sin Permiso"}'::jsonb, now(), now()),
  ('69200000-0000-0000-0000-000000000004', 'authenticated', 'authenticated',
   'ctx-super@example.test', '{}'::jsonb, '{"full_name":"Super Contexto"}'::jsonb, now(), now()),
  ('69200000-0000-0000-0000-000000000005', 'authenticated', 'authenticated',
   'ctx-suspendida@example.test', '{}'::jsonb, '{"full_name":"Suspendida Contexto"}'::jsonb, now(), now()),
  ('69200000-0000-0000-0000-000000000006', 'authenticated', 'authenticated',
   'ctx-vencida@example.test', '{}'::jsonb, '{"full_name":"Vencida Contexto"}'::jsonb, now(), now());

update public.profiles set role = 'admin'
where id in ('69200000-0000-0000-0000-000000000002',
             '69200000-0000-0000-0000-000000000003',
             '69200000-0000-0000-0000-000000000005',
             '69200000-0000-0000-0000-000000000006');
update public.profiles set role = 'superadmin'
where id = '69200000-0000-0000-0000-000000000004';
update public.profiles
set account_status = 'suspended',
    status_changed_at = now(),
    status_changed_by = '69200000-0000-0000-0000-000000000004',
    status_reason = 'Prueba del contexto de acceso'
where id = '69200000-0000-0000-0000-000000000005';
update public.profiles set access_expires_at = now() - interval '1 day'
where id = '69200000-0000-0000-0000-000000000006';
insert into public.admin_module_permissions (user_id, can_access, updated_by)
values ('69200000-0000-0000-0000-000000000003', false,
        '69200000-0000-0000-0000-000000000004');

-- 3. Sin sesión: ninguna fila. El resolver web lo interpreta como no autenticado.
set local role authenticated;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*) from public.current_user_access_context()),
  0::bigint,
  'No session returns no rows'
);
reset role;

-- 4. Docente: perfil correcto y sin permiso de módulos.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69200000-0000-0000-0000-000000000001', true);
select results_eq(
  $$select user_id, role, account_status, full_name, modules_access
      from public.current_user_access_context()$$,
  $$values (
      '69200000-0000-0000-0000-000000000001'::uuid,
      'docente'::public.app_role,
      'active'::public.account_status,
      'Docente Contexto'::text,
      false
    )$$,
  'A docente gets their own profile and no module access'
);
reset role;

-- 5. Admin con permiso implícito.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69200000-0000-0000-0000-000000000002', true);
select is(
  (select modules_access from public.current_user_access_context()),
  true,
  'An admin without an explicit grant keeps module access'
);
select is(
  (select full_name from public.current_user_access_context()),
  'Admin Contexto',
  'The context carries the name the sidebar needs'
);
reset role;

-- 6. Admin con permiso revocado explícitamente.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69200000-0000-0000-0000-000000000003', true);
select is(
  (select modules_access from public.current_user_access_context()),
  false,
  'A revoked admin is reported as having no module access'
);
reset role;

-- 7. Superadmin siempre tiene permiso.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69200000-0000-0000-0000-000000000004', true);
select is(
  (select modules_access from public.current_user_access_context()),
  true,
  'A superadmin always has module access'
);
reset role;

-- 8. Estado y vigencia viajan en la fila para que la web aplique su política.
set local role authenticated;
select set_config('request.jwt.claim.sub', '69200000-0000-0000-0000-000000000005', true);
select is(
  (select account_status from public.current_user_access_context()),
  'suspended'::public.account_status,
  'A suspended account is reported as suspended'
);
select is(
  (select modules_access from public.current_user_access_context()),
  false,
  'A suspended account has no module access even if its role is administrative'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claim.sub', '69200000-0000-0000-0000-000000000006', true);
select ok(
  (select access_expires_at is not null from public.current_user_access_context()),
  'The expiry is returned so the web can apply the same time window'
);
select is(
  (select modules_access from public.current_user_access_context()),
  false,
  'An expired account has no module access'
);
reset role;

-- 9. Los permisos de anon no permiten invocar la función.
set local role anon;
select throws_ok(
  $$select * from public.current_user_access_context()$$,
  '42501',
  null,
  'anon cannot execute the RPC'
);
reset role;

rollback;
