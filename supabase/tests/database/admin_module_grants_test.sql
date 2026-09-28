begin;

select plan(10);

-- Identidades y módulos de prueba ----------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values
  (
    '3c000000-0000-0000-0000-000000000901',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'grants.super@example.test', 'x',
    now(), now(), now(), '{"provider":"email"}'::jsonb,
    '{"full_name":"Super Grantes QA"}'::jsonb
  ),
  (
    '3c000000-0000-0000-0000-000000000902',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'grants.admin@example.test', 'x',
    now(), now(), now(), '{"provider":"email"}'::jsonb,
    '{"full_name":"Admin Grantes QA"}'::jsonb
  );

update public.profiles
set role = 'superadmin', full_name = 'Super Grantes QA'
where id = '3c000000-0000-0000-0000-000000000901';

update public.profiles
set role = 'admin', full_name = 'Admin Grantes QA'
where id = '3c000000-0000-0000-0000-000000000902';

insert into public.modules (id, name, code, sort_order)
values
  ('3c000000-0000-0000-0000-000000000101', 'Modulo QA raiz A', 'QA_GRANTS_ROOT_A', 970),
  ('3c000000-0000-0000-0000-000000000102', 'Submodulo QA A', 'QA_GRANTS_SUB_A', 971),
  ('3c000000-0000-0000-0000-000000000103', 'Modulo QA raiz B', 'QA_GRANTS_ROOT_B', 972);

update public.modules
set parent_module_id = '3c000000-0000-0000-0000-000000000101'
where id = '3c000000-0000-0000-0000-000000000102';

-- Conceder solo la raíz cubre el submódulo --------------------------------------

select lives_ok(
  $$
    select public.set_admin_module_grants(
      '3c000000-0000-0000-0000-000000000901',
      '3c000000-0000-0000-0000-000000000902',
      array['3c000000-0000-0000-0000-000000000101']::uuid[],
      'Concesión inicial de prueba'
    );
  $$,
  'El superadministrador concede un módulo'
);

select results_eq(
  $$
    select module_id from public.list_admin_module_grants(
      '3c000000-0000-0000-0000-000000000901',
      '3c000000-0000-0000-0000-000000000902'
    )
  $$,
  $$ values ('3c000000-0000-0000-0000-000000000101'::uuid) $$,
  'La concesión queda listada'
);

select is(
  public.admin_can_manage_module(
    '3c000000-0000-0000-0000-000000000902',
    '3c000000-0000-0000-0000-000000000101'
  ),
  true,
  'El administrador puede gestionar el módulo concedido'
);

select is(
  public.admin_can_manage_module(
    '3c000000-0000-0000-0000-000000000902',
    '3c000000-0000-0000-0000-000000000102'
  ),
  true,
  'La concesión de la raíz cubre sus submódulos'
);

select is(
  public.admin_can_manage_module(
    '3c000000-0000-0000-0000-000000000902',
    '3c000000-0000-0000-0000-000000000103'
  ),
  false,
  'Sin concesión no puede gestionar otro módulo'
);

-- Cambiar a solo el submódulo retira la raíz ------------------------------------

select lives_ok(
  $$
    select public.set_admin_module_grants(
      '3c000000-0000-0000-0000-000000000901',
      '3c000000-0000-0000-0000-000000000902',
      array['3c000000-0000-0000-0000-000000000102']::uuid[],
      'Cambio a solo submódulo'
    );
  $$,
  'El conjunto de módulos se puede reemplazar'
);

select is(
  public.admin_can_manage_module(
    '3c000000-0000-0000-0000-000000000902',
    '3c000000-0000-0000-0000-000000000101'
  ),
  false,
  'El módulo raíz retirado deja de permitirse'
);

-- El interruptor maestro bloquea aunque exista concesión -----------------------

select lives_ok(
  $$
    select public.set_admin_module_permission(
      '3c000000-0000-0000-0000-000000000901',
      '3c000000-0000-0000-0000-000000000902',
      false,
      'Bloqueo temporal de prueba'
    );
  $$,
  'El interruptor maestro se puede apagar'
);

select is(
  public.admin_can_manage_module(
    '3c000000-0000-0000-0000-000000000902',
    '3c000000-0000-0000-0000-000000000102'
  ),
  false,
  'El interruptor maestro apagado bloquea aunque haya concesión'
);

select is(
  (
    select count(*) from public.admin_module_grant_events
    where user_id = '3c000000-0000-0000-0000-000000000902'
  ),
  3::bigint,
  'Cada alta y retirada deja su evento de auditoría'
);

select * from finish();
rollback;
