begin;

select plan(28);

select has_table('public', 'admin_module_permissions', 'Module permissions are persisted');
select has_table('public', 'admin_module_permission_events', 'Permission changes have an audit history');
select is(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'admin_module_permissions'
  ),
  true,
  'Module permissions use RLS'
);
select is(
  (
    select relation.relrowsecurity
    from pg_catalog.pg_class as relation
    join pg_catalog.pg_namespace as namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public' and relation.relname = 'admin_module_permission_events'
  ),
  true,
  'Permission events use RLS'
);
select has_function('public', 'has_admin_module_access', array['uuid'], 'Effective access has a server RPC');
select has_function('public', 'current_user_has_admin_module_access', array[]::text[], 'The web can resolve only its own access');
select has_function('public', 'list_admin_module_permissions', array['uuid'], 'SUPERADMIN can list module access');
select has_function('public', 'set_admin_module_permission', array['uuid', 'uuid', 'boolean', 'text'], 'SUPERADMIN can change module access');
select ok(not has_function_privilege('anon', 'public.current_user_has_admin_module_access()'::regprocedure, 'execute'), 'Anonymous clients cannot inspect module access');
select ok(has_function_privilege('authenticated', 'public.current_user_has_admin_module_access()'::regprocedure, 'execute'), 'Authenticated users can inspect only their own effective access');
select ok(not has_function_privilege('authenticated', 'public.set_admin_module_permission(uuid,uuid,boolean,text)'::regprocedure, 'execute'), 'Authenticated clients cannot change module access directly');
select ok(has_function_privilege('service_role', 'public.set_admin_module_permission(uuid,uuid,boolean,text)'::regprocedure, 'execute'), 'Only the server role can invoke permission changes');

select is(
  (select count(*) from public.modules where parent_module_id is null and not is_deleted and name in (
    'Contratación y desplazamientos', 'Evaluación docente', 'Situaciones administrativas',
    'Auxiliar de educación', 'Ley y reglamento', 'Cargos y plazas', 'Remuneraciones'
  )),
  7::bigint,
  'The seven canonical root modules exist on a clean database'
);
select is(
  (
    select count(*)
    from public.modules as child
    join public.modules as parent on parent.id = child.parent_module_id
    where parent.name = 'Evaluación docente' and not child.is_deleted
  ),
  8::bigint,
  'Evaluación docente contains the eight required submodules'
);
select set_eq(
  $$
    select child.name
    from public.modules as child
    join public.modules as parent on parent.id = child.parent_module_id
    where parent.name = 'Evaluación docente' and not child.is_deleted
  $$,
  $$ values
    ('Nombramiento Docente / Ingreso a la Carrera Pública Magisterial'),
    ('Contratación Docente'),
    ('Ascenso de Escala Magisterial'),
    ('Acceso a Cargos Directivos'),
    ('Acceso al cargo de Especialista en Educación'),
    ('Evaluación del Desempeño Docente'),
    ('Evaluación del Desempeño de Directivos'),
    ('Procesos específicos')
  $$,
  'The Evaluación docente taxonomy uses the required names'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('31000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'modules-owner@example.test', '{}'::jsonb, '{"full_name":"Owner Modulos"}'::jsonb, now(), now()),
  ('31000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'modules-admin@example.test', '{}'::jsonb, '{"full_name":"Admin Modulos"}'::jsonb, now(), now()),
  ('31000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'modules-teacher@example.test', '{}'::jsonb, '{"full_name":"Docente Modulos"}'::jsonb, now(), now()),
  ('31000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'modules-suspended@example.test', '{}'::jsonb, '{"full_name":"Admin Suspendido"}'::jsonb, now(), now()),
  ('31000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'modules-expired@example.test', '{}'::jsonb, '{"full_name":"Admin Expirado"}'::jsonb, now(), now());

update public.profiles
set role = case id
  when '31000000-0000-0000-0000-000000000001'::uuid then 'superadmin'::public.app_role
  when '31000000-0000-0000-0000-000000000002'::uuid then 'admin'::public.app_role
  when '31000000-0000-0000-0000-000000000004'::uuid then 'admin'::public.app_role
  when '31000000-0000-0000-0000-000000000005'::uuid then 'admin'::public.app_role
  else 'docente'::public.app_role
end;

update public.profiles
set account_status = 'suspended', status_changed_at = now(),
  status_changed_by = '31000000-0000-0000-0000-000000000001',
  status_reason = 'Fixture de permiso suspendido.'
where id = '31000000-0000-0000-0000-000000000004';

update public.profiles
set access_expires_at = now() - interval '1 second'
where id = '31000000-0000-0000-0000-000000000005';

select is(public.has_admin_module_access('31000000-0000-0000-0000-000000000001'), true, 'SUPERADMIN always has module access');
select is(public.has_admin_module_access('31000000-0000-0000-0000-000000000002'), true, 'Existing ADMIN access remains enabled by default');
select is(public.has_admin_module_access('31000000-0000-0000-0000-000000000003'), false, 'Docente never receives administrative module access');
select is(public.has_admin_module_access('31000000-0000-0000-0000-000000000004'), false, 'A suspended administrator is denied');
select is(public.has_admin_module_access('31000000-0000-0000-0000-000000000005'), false, 'An expired administrator is denied');
select is((select count(*) from public.list_admin_module_permissions('31000000-0000-0000-0000-000000000001')), 4::bigint, 'SUPERADMIN lists administrative accounts only');

select throws_ok(
  $$ select * from public.list_admin_module_permissions('31000000-0000-0000-0000-000000000002') $$,
  '42501', 'Only an active superadministrator may perform this operation',
  'ADMIN cannot enumerate permissions'
);
select lives_ok(
  $$ select * from public.set_admin_module_permission('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', false, 'Retiro QA de acceso a Módulos.') $$,
  'SUPERADMIN can revoke module access with a reason'
);
select is(public.has_admin_module_access('31000000-0000-0000-0000-000000000002'), false, 'Revocation is enforced by the effective-access function');
select is((select count(*) from public.admin_module_permission_events where user_id = '31000000-0000-0000-0000-000000000002'), 1::bigint, 'Permission reason is retained in append-only history');
select throws_ok(
  $$ update public.admin_module_permission_events set reason = 'Alterado indebidamente' where user_id = '31000000-0000-0000-0000-000000000002' $$,
  'P0001', 'Administrative module permission events are append-only',
  'Permission history cannot be edited'
);
select throws_ok(
  $$ select * from public.set_admin_module_permission('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', false, 'Sin cambio efectivo.') $$,
  '22023', 'Module access is unchanged',
  'No-op permission changes are rejected'
);
select throws_ok(
  $$ select * from public.set_admin_module_permission('31000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', false, 'Intento QA sobre propietario.') $$,
  '22023', 'Only an administrator module permission can be changed',
  'SUPERADMIN effective access cannot be revoked'
);

select * from finish();
rollback;
