begin;

select plan(3);

insert into public.modules (id, name, code)
values
  ('00000000-0000-0000-0000-000000000301', 'Padre de jerarquía lógica', 'LOGICAL_PARENT'),
  (
    '00000000-0000-0000-0000-000000000302',
    'Hijo de jerarquía lógica',
    'LOGICAL_CHILD'
  );

update public.modules
set parent_module_id = '00000000-0000-0000-0000-000000000301'
where id = '00000000-0000-0000-0000-000000000302';

select throws_ok(
  $$
    update public.modules
    set
      is_active = false,
      deactivated_at = now(),
      deactivated_by = '00000000-0000-0000-0000-000000000399',
      deactivation_reason = 'Baja lógica de prueba',
      is_deleted = true,
      deleted_at = now(),
      deleted_by = '00000000-0000-0000-0000-000000000399',
      deletion_reason = 'Baja lógica de prueba'
    where id = '00000000-0000-0000-0000-000000000301'
  $$,
  'P0001',
  'A module with non-deleted children cannot be logically deleted',
  'A parent with a live child cannot be logically deleted'
);

update public.modules
set
  is_active = false,
  deactivated_at = now(),
  deactivated_by = '00000000-0000-0000-0000-000000000399',
  deactivation_reason = 'Baja lógica de prueba',
  is_deleted = true,
  deleted_at = now(),
  deleted_by = '00000000-0000-0000-0000-000000000399',
  deletion_reason = 'Baja lógica de prueba'
where id = '00000000-0000-0000-0000-000000000302';

select lives_ok(
  $$
    update public.modules
    set
      is_active = false,
      deactivated_at = now(),
      deactivated_by = '00000000-0000-0000-0000-000000000399',
      deactivation_reason = 'Baja lógica de prueba',
      is_deleted = true,
      deleted_at = now(),
      deleted_by = '00000000-0000-0000-0000-000000000399',
      deletion_reason = 'Baja lógica de prueba'
    where id = '00000000-0000-0000-0000-000000000301'
  $$,
  'A parent can be logically deleted after its live children are removed'
);

select throws_ok(
  $$
    insert into public.modules (name, code, parent_module_id)
    values (
      'Intento de hijo bajo padre eliminado',
      'DELETED_PARENT_CHILD',
      '00000000-0000-0000-0000-000000000301'
    )
  $$,
  'P0001',
  'A module cannot be placed under a logically deleted parent',
  'A new child cannot use a logically deleted parent'
);

select * from finish();

rollback;
