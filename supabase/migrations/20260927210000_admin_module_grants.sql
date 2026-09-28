-- T5.4: permisos por módulo/submódulo para administradores. El interruptor
-- maestro (`admin_module_permissions.can_access`) sigue habilitando el área;
-- las concesiones por módulo deciden a qué módulos puede entrar/operar cada
-- administrador. Un permiso sobre un módulo raíz cubre sus submódulos.

create table public.admin_module_grants (
  user_id uuid not null references public.profiles (id) on delete cascade,
  module_id uuid not null references public.modules (id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by uuid,
  primary key (user_id, module_id)
);

create index admin_module_grants_user_idx
  on public.admin_module_grants (user_id);

create table public.admin_module_grant_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  module_id uuid not null,
  granted boolean not null,
  reason text not null check (char_length(btrim(reason)) between 4 and 500),
  actor_id uuid not null,
  occurred_at timestamptz not null default now()
);

create index admin_module_grant_events_user_occurred_idx
  on public.admin_module_grant_events (user_id, occurred_at desc, id);

create function private.prevent_admin_module_grant_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Administrative module grant events are append-only';
end;
$$;

revoke all on function private.prevent_admin_module_grant_event_mutation()
  from public;

create trigger admin_module_grant_events_append_only
before update or delete on public.admin_module_grant_events
for each row execute procedure private.prevent_admin_module_grant_event_mutation();

alter table public.admin_module_grants enable row level security;
alter table public.admin_module_grant_events enable row level security;

revoke all on table public.admin_module_grants from public, anon, authenticated;
revoke all on table public.admin_module_grant_events from public, anon, authenticated;
grant all on table public.admin_module_grants to service_role;
grant select, insert on table public.admin_module_grant_events to service_role;

-- Backfill: los administradores con acceso (el comportamiento anterior era
-- global) conservan todos los módulos activos que ya existían.
insert into public.admin_module_grants (user_id, module_id, granted_by)
select profile.id, module.id, null
from public.profiles as profile
cross join public.modules as module
where profile.role = 'admin'
  and coalesce(
    (
      select permission.can_access
      from public.admin_module_permissions as permission
      where permission.user_id = profile.id
    ),
    true
  )
  and module.is_active
  and not module.is_deleted
on conflict on constraint admin_module_grants_pkey do nothing;

-- ¿El actor puede gestionar este módulo? Superadmin siempre; un administrador
-- necesita el interruptor maestro y una concesión propia o de su raíz.
create function public.admin_can_manage_module(
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
        and granted_module.is_active
        and not granted_module.is_deleted
      where grant_row.user_id = profile.id
        and exists (
          select 1
          from public.modules as target_module
          where target_module.id = p_module_id
            and target_module.is_active
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

create function public.list_admin_module_grants(
  p_actor_id uuid,
  p_target_user_id uuid
)
returns table (
  module_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_superadministrator(p_actor_id);

  if not exists (
    select 1 from public.profiles where id = p_target_user_id
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'Administrative user was not found';
  end if;

  return query
  select grant_row.module_id
  from public.admin_module_grants as grant_row
  where grant_row.user_id = p_target_user_id
  order by grant_row.module_id;
end;
$$;

-- Reemplaza el conjunto de módulos concedidos y registra cada cambio.
create function public.set_admin_module_grants(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_module_ids uuid[],
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  requested_ids uuid[] := coalesce(
    (
      select array_agg(distinct supplied.module_id order by supplied.module_id)
      from unnest(coalesce(p_module_ids, array[]::uuid[])) as supplied(module_id)
      where supplied.module_id is not null
    ),
    array[]::uuid[]
  );
  invalid_count integer;
  current_can_access boolean;
  existing_module_id uuid;
  added_module_id uuid;
begin
  perform private.require_superadministrator(p_actor_id);

  if normalized_reason is null
    or char_length(normalized_reason) not between 4 and 500 then
    raise exception using
      errcode = '22023',
      message = 'A module grant change requires a reason';
  end if;

  select * into target
  from public.profiles as profile
  where profile.id = p_target_user_id
    and profile.role = 'admin'::public.app_role
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Administrative user was not found';
  end if;

  select count(*) into invalid_count
  from unnest(requested_ids) as supplied(module_id)
  where not exists (
    select 1
    from public.modules as module
    where module.id = supplied.module_id
      and module.is_active
      and not module.is_deleted
  );

  if invalid_count > 0 then
    raise exception using
      errcode = '22023',
      message = 'A selected module is unavailable';
  end if;

  -- Retirar lo que ya no está marcado.
  for existing_module_id in
    select grant_row.module_id
    from public.admin_module_grants as grant_row
    where grant_row.user_id = target.id
      and not (grant_row.module_id = any(requested_ids))
  loop
    delete from public.admin_module_grants
    where user_id = target.id
      and module_id = existing_module_id;

    insert into public.admin_module_grant_events (
      user_id, module_id, granted, reason, actor_id
    )
    values (target.id, existing_module_id, false, normalized_reason, p_actor_id);
  end loop;

  -- Agregar lo marcado que faltaba.
  foreach added_module_id in array requested_ids loop
    insert into public.admin_module_grants (user_id, module_id, granted_by)
    values (target.id, added_module_id, p_actor_id)
    on conflict on constraint admin_module_grants_pkey do nothing;

    if found then
      insert into public.admin_module_grant_events (
        user_id, module_id, granted, reason, actor_id
      )
      values (target.id, added_module_id, true, normalized_reason, p_actor_id);
    end if;
  end loop;

  -- Conceder módulos implica habilitar el área si estaba bloqueada.
  select coalesce(permission.can_access, true) into current_can_access
  from public.admin_module_permissions as permission
  where permission.user_id = target.id;

  if cardinality(requested_ids) > 0
    and coalesce(current_can_access, true) = false then
    insert into public.admin_module_permissions (
      user_id, can_access, updated_at, updated_by
    )
    values (target.id, true, now(), p_actor_id)
    on conflict on constraint admin_module_permissions_pkey do update
    set can_access = true, updated_at = now(), updated_by = p_actor_id;

    insert into public.admin_module_permission_events (
      user_id, can_access, reason, actor_id
    )
    values (target.id, true, normalized_reason, p_actor_id);
  end if;
end;
$$;

revoke all on function public.admin_can_manage_module(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.list_admin_module_grants(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_admin_module_grants(uuid, uuid, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.admin_can_manage_module(uuid, uuid)
  to service_role;
grant execute on function public.list_admin_module_grants(uuid, uuid)
  to service_role;
grant execute on function public.set_admin_module_grants(uuid, uuid, uuid[], text)
  to service_role;

-- El listado y el cambio de interruptor exponen ahora los módulos concedidos.
drop function if exists public.list_admin_module_permissions(uuid);
drop function if exists public.set_admin_module_permission(uuid, uuid, boolean, text);

create function public.list_admin_module_permissions(p_actor_id uuid)
returns table (
  user_id uuid,
  full_name text,
  role public.app_role,
  can_access boolean,
  module_ids uuid[],
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_superadministrator(p_actor_id);

  return query
  select
    profile.id,
    profile.full_name,
    profile.role,
    case
      when profile.role = 'superadmin'::public.app_role then true
      else coalesce(permission.can_access, true)
    end,
    case
      when profile.role = 'superadmin'::public.app_role then (
        select coalesce(array_agg(module.id order by module.id), array[]::uuid[])
        from public.modules as module
        where module.is_active
          and not module.is_deleted
      )
      else coalesce(
        (
          select array_agg(grant_row.module_id order by grant_row.module_id)
          from public.admin_module_grants as grant_row
          where grant_row.user_id = profile.id
        ),
        array[]::uuid[]
      )
    end,
    permission.updated_at,
    permission.updated_by
  from public.profiles as profile
  left join public.admin_module_permissions as permission
    on permission.user_id = profile.id
  where profile.role in ('admin'::public.app_role, 'superadmin'::public.app_role)
  order by profile.full_name, profile.id;
end;
$$;

create function public.set_admin_module_permission(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_can_access boolean,
  p_reason text
)
returns table (
  user_id uuid,
  full_name text,
  role public.app_role,
  can_access boolean,
  module_ids uuid[],
  updated_at timestamptz,
  updated_by uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  perform private.require_superadministrator(p_actor_id);

  if p_can_access is null then
    raise exception using errcode = '22023', message = 'Module access value is required';
  end if;

  if normalized_reason is null or char_length(normalized_reason) not between 4 and 500 then
    raise exception using errcode = '22023', message = 'A module access change requires a reason';
  end if;

  select * into target
  from public.profiles as profile
  where profile.id = p_target_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Administrative user was not found';
  end if;

  if target.role <> 'admin'::public.app_role then
    raise exception using errcode = '22023', message = 'Only an administrator module permission can be changed';
  end if;

  if coalesce(
    (select permission.can_access from public.admin_module_permissions as permission where permission.user_id = target.id),
    true
  ) = p_can_access then
    raise exception using errcode = '22023', message = 'Module access is unchanged';
  end if;

  insert into public.admin_module_permissions (user_id, can_access, updated_at, updated_by)
  values (target.id, p_can_access, now(), p_actor_id)
  on conflict on constraint admin_module_permissions_pkey do update
  set
    can_access = excluded.can_access,
    updated_at = excluded.updated_at,
    updated_by = excluded.updated_by;

  insert into public.admin_module_permission_events (
    user_id,
    can_access,
    reason,
    actor_id
  )
  values (target.id, p_can_access, normalized_reason, p_actor_id);

  return query
  select
    target.id,
    target.full_name,
    target.role,
    permission.can_access,
    coalesce(
      (
        select array_agg(grant_row.module_id order by grant_row.module_id)
        from public.admin_module_grants as grant_row
        where grant_row.user_id = target.id
      ),
      array[]::uuid[]
    ),
    permission.updated_at,
    permission.updated_by
  from public.admin_module_permissions as permission
  where permission.user_id = target.id;
end;
$$;

revoke all on function public.list_admin_module_permissions(uuid)
  from public, anon, authenticated;
revoke all on function public.set_admin_module_permission(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.list_admin_module_permissions(uuid)
  to service_role;
grant execute on function public.set_admin_module_permission(uuid, uuid, boolean, text)
  to service_role;
