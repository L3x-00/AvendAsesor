-- La concesión sigue vigente al desactivar el módulo para poder reactivarlo.
create or replace function public.admin_can_manage_module(
  p_actor_id uuid,
  p_module_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when profile.id is null then false
    when profile.account_status <> 'active'::public.account_status then false
    when profile.access_expires_at is not null
      and profile.access_expires_at < now() then false
    when profile.role = 'superadmin'::public.app_role then true
    when profile.role <> 'admin'::public.app_role then false
    when coalesce(
      (
        select permission.can_access
        from public.admin_module_permissions as permission
        where permission.user_id = profile.id
      ),
      true
    ) = false then false
    else exists (
      select 1
      from public.admin_module_grants as grant_row
      join public.modules as granted_module
        on granted_module.id = grant_row.module_id
        and not granted_module.is_deleted
      where grant_row.user_id = profile.id
        and exists (
          select 1
          from public.modules as target_module
          where target_module.id = p_module_id
            and not target_module.is_deleted
            and (
              target_module.id = grant_row.module_id
              or target_module.parent_module_id = grant_row.module_id
            )
        )
    )
  end
  from public.profiles as profile
  where profile.id = p_actor_id;
$$;
