begin;

select plan(17);

-- Fixtures -----------------------------------------------------------------
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'ma-admin@example.test', '{}'::jsonb,
  '{"full_name":"Administrador Auditoría Módulos"}'::jsonb, now(), now()
);

update public.profiles
set role = 'admin'::public.app_role
where id = '40000000-0000-0000-0000-000000000001';

-- Crear (como lo hace la API: rol service_role) -----------------------------
set local role service_role;

insert into public.modules (id, name, code, created_by, updated_by, audit_actor)
values (
  '40000000-0000-0000-0000-0000000000a1',
  'Remuneraciones de prueba',
  'MA_REMUNERACIONES',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001'
);

reset role;

select results_eq(
  $$
    select action::text, actor_role::text, resource_type, metadata ->> 'moduleName'
    from public.operational_audit_events
    where resource_id = '40000000-0000-0000-0000-0000000000a1'
  $$,
  $$ values ('module_created', 'admin', 'module', 'Remuneraciones de prueba') $$,
  'Creating a module through the API role records who created it'
);

select is(
  (select audit_actor from public.modules
   where id = '40000000-0000-0000-0000-0000000000a1'),
  null,
  'The audit actor is consumed and never stored in the module row'
);

-- Editar ------------------------------------------------------------------
update public.modules
set
  name = 'Remuneraciones docentes',
  updated_by = '40000000-0000-0000-0000-000000000001',
  audit_actor = '40000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-0000000000a1';

select results_eq(
  $$
    select metadata ->> 'previousName', metadata -> 'changedFields'
    from public.operational_audit_events
    where resource_id = '40000000-0000-0000-0000-0000000000a1'
      and action = 'module_updated'
  $$,
  $$ values ('Remuneraciones de prueba', '["name"]'::jsonb) $$,
  'Renaming a module records the previous name and the changed fields'
);

-- Una corrección manual con el `updated_by` heredado no se atribuye a nadie.
update public.modules
set description = 'Ajuste manual por SQL'
where id = '40000000-0000-0000-0000-0000000000a1';

-- Reordenar no genera ruido.
update public.modules
set
  sort_order = sort_order + 1,
  audit_actor = '40000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*)::integer from public.operational_audit_events
   where resource_id = '40000000-0000-0000-0000-0000000000a1'),
  2,
  'Neither a manual fix with a stale updated_by nor a reorder adds events'
);

-- Desactivar (junto con una edición) y activar -----------------------------
update public.modules
set
  is_active = false,
  description = 'Cerrado por temporada',
  deactivated_at = now(),
  deactivated_by = '40000000-0000-0000-0000-000000000001',
  deactivation_reason = 'Temporada cerrada',
  audit_actor = '40000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-0000000000a1';

select results_eq(
  $$
    select (metadata ->> 'isActive')::boolean, metadata ->> 'reason', metadata -> 'changedFields'
    from public.operational_audit_events
    where resource_id = '40000000-0000-0000-0000-0000000000a1'
      and action = 'module_status_changed'
  $$,
  $$ values (false, 'Temporada cerrada', '["description"]'::jsonb) $$,
  'Deactivating records the reason and any field edited in the same write'
);

update public.modules
set
  is_active = true,
  deactivated_at = null,
  deactivated_by = null,
  deactivation_reason = null,
  audit_actor = '40000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-0000000000a1';

select is(
  (select count(*)::integer from public.operational_audit_events
   where resource_id = '40000000-0000-0000-0000-0000000000a1'
     and action = 'module_status_changed'
     and (metadata ->> 'isActive')::boolean
     and not metadata ? 'reason'),
  1,
  'Reactivating a module is recorded without a stale reason'
);

-- Eliminar -----------------------------------------------------------------
update public.modules
set
  is_active = false,
  deactivated_at = now(),
  deactivated_by = '40000000-0000-0000-0000-000000000001',
  deactivation_reason = 'Duplicado',
  is_deleted = true,
  deleted_at = now(),
  deleted_by = '40000000-0000-0000-0000-000000000001',
  deletion_reason = 'Duplicado',
  audit_actor = '40000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-0000000000a1';

select results_eq(
  $$
    select action::text, metadata ->> 'reason'
    from public.operational_audit_events
    where resource_id = '40000000-0000-0000-0000-0000000000a1'
      and metadata ->> 'reason' = 'Duplicado'
  $$,
  $$ values ('module_deleted', 'Duplicado') $$,
  'Deleting (which also deactivates) leaves one deletion event, not a status change'
);

select is(
  (select count(*)::integer from public.operational_audit_events
   where resource_id = '40000000-0000-0000-0000-0000000000a1'),
  5,
  'Each audited module change leaves exactly one event'
);

-- Restaurar ---------------------------------------------------------------
update public.modules
set
  is_deleted = false,
  deleted_at = null,
  deleted_by = null,
  deletion_reason = null,
  audit_actor = '40000000-0000-0000-0000-000000000001'
where id = '40000000-0000-0000-0000-0000000000a1';

select results_eq(
  $$
    select metadata -> 'changedFields'
    from public.operational_audit_events
    where resource_id = '40000000-0000-0000-0000-0000000000a1'
      and action = 'module_updated'
      and metadata -> 'changedFields' ? 'restored'
  $$,
  $$ values ('["restored"]'::jsonb) $$,
  'Restoring a deleted module is recorded'
);

-- Mantenimiento sin responsable -------------------------------------------
select lives_ok(
  $$
    insert into public.modules (id, name, code, created_by, updated_by)
    values (
      '40000000-0000-0000-0000-0000000000a2',
      'Semilla',
      'MA_SEED',
      '40000000-0000-0000-0000-000000000001',
      '40000000-0000-0000-0000-000000000001'
    )
  $$,
  'A seed or migration write without an explicit audit actor still succeeds'
);

select is(
  (select count(*)::integer from public.operational_audit_events
   where resource_id = '40000000-0000-0000-0000-0000000000a2'),
  0,
  'A seed or migration write is not attributed to the profile in created_by'
);

select lives_ok(
  $$
    insert into public.modules (id, name, code, audit_actor)
    values (
      '40000000-0000-0000-0000-0000000000a3',
      'Autor desconocido',
      'MA_UNKNOWN',
      '40000000-0000-0000-0000-0000000000ff'
    )
  $$,
  'An unknown actor never blocks the module write'
);

select is(
  (select count(*)::integer from public.operational_audit_events
   where resource_id = '40000000-0000-0000-0000-0000000000a3'),
  0,
  'An unknown actor is not recorded as a fake audit entry'
);

select is(
  (select audit_actor from public.modules
   where id = '40000000-0000-0000-0000-0000000000a3'),
  null,
  'An unknown audit actor is not stored either'
);

-- Un fallo posterior a la auditoría (código duplicado, que se valida después
-- de los triggers) revierte también el evento --------------------------------
select throws_ok(
  $$
    insert into public.modules (id, name, code, audit_actor)
    values (
      '40000000-0000-0000-0000-0000000000a4',
      'Código repetido',
      'MA_REMUNERACIONES',
      '40000000-0000-0000-0000-000000000001'
    )
  $$,
  '23505',
  null,
  'A module with a duplicated code is rejected'
);

select is(
  (select count(*)::integer from public.operational_audit_events
   where resource_id = '40000000-0000-0000-0000-0000000000a4'),
  0,
  'A write rejected after the audit trigger leaves no audit event'
);

-- Inmutable ---------------------------------------------------------------
select throws_ok(
  $$
    update public.operational_audit_events
    set metadata = '{}'::jsonb
    where resource_id = '40000000-0000-0000-0000-0000000000a1'
  $$,
  'P0001',
  'Operational audit events are append-only',
  'Module audit events cannot be altered'
);

select * from finish();
rollback;
