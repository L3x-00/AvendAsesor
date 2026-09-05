begin;

select plan(18);

select has_function(
  'public',
  'list_administrative_users_page',
  array['uuid', 'text', 'text', 'account_status', 'integer', 'integer', 'text'],
  'Administrative users expose a dedicated paginated RPC'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_administrative_users_page(uuid,text,text,public.account_status,integer,integer,text)'::regprocedure,
    'execute'
  ),
  'Only the server role receives the paginated user directory capability'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_administrative_users_page(uuid,text,text,public.account_status,integer,integer,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot execute the paginated user directory directly'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '10000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'pagination-superadmin@example.test',
  '{}'::jsonb,
  '{"full_name":"Superadministrador Paginacion"}'::jsonb,
  now(),
  now()
);

update public.profiles
set role = 'superadmin'::public.app_role
where id = '10000000-0000-0000-0000-000000000000';

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('10000000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'pagination-docente-' || series || '@example.test',
  '{}'::jsonb,
  jsonb_build_object('full_name', 'Docente ' || lpad(series::text, 3, '0')),
  now(),
  now()
from generate_series(1, 120) as series;

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  ('20000000-0000-0000-0000-' || lpad(series::text, 12, '0'))::uuid,
  'authenticated',
  'authenticated',
  'pagination-admin-' || series || '@example.test',
  '{}'::jsonb,
  jsonb_build_object('full_name', 'Administrador ' || lpad(series::text, 3, '0')),
  now(),
  now()
from generate_series(1, 3) as series;

update public.profiles
set role = 'admin'::public.app_role
where id::text like '20000000-0000-0000-0000-%';

update public.profiles
set
  account_status = 'suspended'::public.account_status,
  status_changed_at = now(),
  status_changed_by = '10000000-0000-0000-0000-000000000000',
  status_reason = 'Fixture de paginacion suspendido.'
where id = '20000000-0000-0000-0000-000000000003';

select is(
  (
    select jsonb_array_length(items)
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0
    )
  ),
  25,
  'The first page is limited before it reaches the client'
);
select is(
  (
    select total_count
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0
    )
  ),
  120::bigint,
  'The page reports the exact total beyond the old 100-user cap'
);
select is(
  (
    select items -> 0 ->> 'full_name'
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0
    )
  ),
  'Docente 001',
  'User pages keep a deterministic name and id order'
);
select is(
  (
    with first_page as (
      select jsonb_array_elements(items) ->> 'id' as id
      from public.list_administrative_users_page(
        '10000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 0
      )
    ),
    second_page as (
      select jsonb_array_elements(items) ->> 'id' as id
      from public.list_administrative_users_page(
        '10000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 25
      )
    )
    select count(*) from first_page inner join second_page using (id)
  ),
  0::bigint,
  'Adjacent pages do not overlap'
);
select is(
  (
    select total_count
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, 'staff', null, 25, 0
    )
  ),
  4::bigint,
  'The administrative team filter includes admins and the superadministrator'
);
select is(
  (
    select total_count
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, 'staff', 'suspended', 25, 0
    )
  ),
  1::bigint,
  'Account status is filtered before totals and pagination'
);
select is(
  (
    select total_count
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', 'Docente 11', 'docente', null, 25, 0
    )
  ),
  10::bigint,
  'Name search runs against the complete directory before pagination'
);
select is(
  (
    select total_count
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', '%', null, null, 25, 0
    )
  ),
  0::bigint,
  'Percent signs are searched literally instead of expanding the directory'
);
select is(
  (
    select total_count
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', '_', null, null, 25, 0
    )
  ),
  0::bigint,
  'Underscores are searched literally instead of acting as wildcards'
);
select ok(
  (
    select items = '[]'::jsonb and total_count = 120
    from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, 'docente', null, 25, 500
    )
  ),
  'An empty page still returns the exact filtered total'
);
select throws_ok(
  $admin_denied$
    select * from public.list_administrative_users_page(
      '20000000-0000-0000-0000-000000000001', null, null, null, 25, 0
    )
  $admin_denied$,
  '42501',
  'Only an active superadministrator may perform this operation',
  'An administrator cannot enumerate users through the paginated RPC'
);
select throws_ok(
  $invalid_group$
    select * from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, 'unknown', null, 25, 0
    )
  $invalid_group$,
  '22023',
  'The administrative user group is invalid',
  'Unknown user groups are rejected'
);
select throws_ok(
  $invalid_offset$
    select * from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, null, null, 25, -1
    )
  $invalid_offset$,
  '22023',
  'The administrative user offset must be between 0 and 1000000',
  'Negative offsets are rejected'
);
select throws_ok(
  $null_limit$
    select * from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, null, null, null, 0
    )
  $null_limit$,
  '22023',
  'The administrative user limit must be between 1 and 100',
  'Null limits cannot bypass the bounded listing'
);
select throws_ok(
  $null_offset$
    select * from public.list_administrative_users_page(
      '10000000-0000-0000-0000-000000000000', null, null, null, 25, null
    )
  $null_offset$,
  '22023',
  'The administrative user offset must be between 0 and 1000000',
  'Null offsets cannot bypass pagination bounds'
);

select * from finish();
rollback;
