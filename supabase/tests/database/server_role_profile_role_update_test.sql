begin;

select plan(3);

select ok(
  has_column_privilege('service_role', 'public.profiles', 'role', 'update'),
  'The server role can assign a profile role'
);
select ok(
  not has_column_privilege('service_role', 'public.profiles', 'full_name', 'update'),
  'The server role cannot update unrelated profile fields through this grant'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'role', 'update'),
  'Authenticated browser users cannot assign roles'
);

select * from finish();

rollback;
