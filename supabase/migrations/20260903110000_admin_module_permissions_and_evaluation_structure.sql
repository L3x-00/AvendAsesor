-- TSK-0035: granular access to module/document administration and the
-- canonical Evaluacion docente structure requested by the Product Owner.

create table public.admin_module_permissions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  can_access boolean not null default true,
  updated_at timestamptz not null default now(),
  updated_by uuid not null
);

create table public.admin_module_permission_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete restrict,
  can_access boolean not null,
  reason text not null check (char_length(btrim(reason)) between 4 and 500),
  occurred_at timestamptz not null default now(),
  actor_id uuid not null
);

create index admin_module_permission_events_user_occurred_idx
  on public.admin_module_permission_events (user_id, occurred_at desc, id);

create function private.prevent_admin_module_permission_event_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'Administrative module permission events are append-only';
end;
$$;

revoke all on function private.prevent_admin_module_permission_event_mutation() from public;

create trigger admin_module_permission_events_append_only
before update or delete on public.admin_module_permission_events
for each row execute procedure private.prevent_admin_module_permission_event_mutation();

alter table public.admin_module_permissions enable row level security;
alter table public.admin_module_permission_events enable row level security;

revoke all on table public.admin_module_permissions from public, anon, authenticated;
revoke all on table public.admin_module_permission_events from public, anon, authenticated;
grant all on table public.admin_module_permissions to service_role;
grant select, insert on table public.admin_module_permission_events to service_role;

create function public.has_admin_module_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when profile.account_status <> 'active'::public.account_status
      or (
        profile.access_expires_at is not null
        and profile.access_expires_at < now()
      ) then false
    when profile.role = 'superadmin'::public.app_role then true
    when profile.role = 'admin'::public.app_role then coalesce(permission.can_access, true)
    else false
  end
  from public.profiles as profile
  left join public.admin_module_permissions as permission
    on permission.user_id = profile.id
  where profile.id = p_user_id;
$$;

create function public.list_admin_module_permissions(p_actor_id uuid)
returns table (
  user_id uuid,
  full_name text,
  role public.app_role,
  can_access boolean,
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
    permission.updated_at,
    permission.updated_by
  from public.profiles as profile
  left join public.admin_module_permissions as permission
    on permission.user_id = profile.id
  where profile.role in ('admin'::public.app_role, 'superadmin'::public.app_role)
  order by profile.full_name, profile.id;
end;
$$;

create function public.current_user_has_admin_module_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.has_admin_module_access((select auth.uid())), false);
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
    permission.updated_at,
    permission.updated_by
  from public.admin_module_permissions as permission
  where permission.user_id = target.id;
end;
$$;

revoke all on function public.has_admin_module_access(uuid) from public, anon, authenticated;
revoke all on function public.current_user_has_admin_module_access() from public, anon, authenticated;
revoke all on function public.list_admin_module_permissions(uuid) from public, anon, authenticated;
revoke all on function public.set_admin_module_permission(uuid, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.has_admin_module_access(uuid) to service_role;
grant execute on function public.current_user_has_admin_module_access() to authenticated;
grant execute on function public.list_admin_module_permissions(uuid) to service_role;
grant execute on function public.set_admin_module_permission(uuid, uuid, boolean, text) to service_role;

comment on function public.has_admin_module_access(uuid)
  is 'Fail-closed effective permission for the administrative Modules and Documents area.';

-- The canonical product taxonomy is idempotently completed without touching
-- any document or changing an already existing module record.
with required_modules(name, code, sort_order) as (
  values
    ('Contratación y desplazamientos', 'CONTRATACION_DESPLAZAMIENTOS', 10),
    ('Evaluación docente', 'EVALUACION_DOCENTE', 20),
    ('Situaciones administrativas', 'SITUACIONES_ADMINISTRATIVAS', 30),
    ('Auxiliar de educación', 'AUXILIAR_EDUCACION', 40),
    ('Ley y reglamento', 'LEY_REGLAMENTO', 50),
    ('Cargos y plazas', 'CARGOS_PLAZAS', 60),
    ('Remuneraciones', 'REMUNERACIONES', 70)
)
insert into public.modules (name, code, sort_order, is_active)
select required.name, required.code, required.sort_order, true
from required_modules as required
where not exists (
  select 1
  from public.modules as existing
  where not existing.is_deleted
    and existing.parent_module_id is null
    and (
      existing.code = required.code
      or lower(existing.name) = lower(required.name)
    )
)
on conflict (code) do nothing;

with evaluation_module as (
  select id
  from public.modules
  where (
      code = 'EVALUACION_DOCENTE'
      or lower(name) = lower('Evaluación docente')
    )
    and parent_module_id is null
    and not is_deleted
  order by created_at, id
  limit 1
), required_submodules(name, code, description, sort_order) as (
  values
    ('Nombramiento Docente / Ingreso a la Carrera Pública Magisterial', 'NOMBRAMIENTO_DOCENTE_INGRESO_CPM', null::text, 10),
    ('Contratación Docente', 'CONTRATACION_DOCENTE', null::text, 20),
    ('Ascenso de Escala Magisterial', 'ASCENSO_ESCALA_MAGISTERIAL', null::text, 30),
    ('Acceso a Cargos Directivos', 'ACCESO_CARGOS_DIRECTIVOS', null::text, 40),
    ('Acceso al cargo de Especialista en Educación', 'ACCESO_ESPECIALISTA_EDUCACION', null::text, 50),
    ('Evaluación del Desempeño Docente', 'EVALUACION_DESEMPENO_DOCENTE', null::text, 60),
    ('Evaluación del Desempeño de Directivos', 'EVALUACION_DESEMPENO_DIRECTIVOS', null::text, 70),
    ('Procesos específicos', 'PROCESOS_ESPECIFICOS', 'CETPRO, PRITE, procesos MININTER, procesos MINDEF y otros que se incorporen.', 80)
)
insert into public.modules (
  parent_module_id,
  name,
  code,
  description,
  sort_order,
  is_active
)
select
  evaluation_module.id,
  required_submodules.name,
  required_submodules.code,
  required_submodules.description,
  required_submodules.sort_order,
  true
from evaluation_module
cross join required_submodules
where not exists (
  select 1
  from public.modules as existing
  where existing.parent_module_id = evaluation_module.id
    and not existing.is_deleted
    and (
      existing.code = required_submodules.code
      or lower(existing.name) = lower(required_submodules.name)
    )
)
on conflict (code) do nothing;
