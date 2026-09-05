-- Fase 1 "Usuarios y accesos": vigencias editables sobre la línea base de
-- ADR-0018. Reusa `profiles.access_expires_at` y el umbral fijo de 7 días
-- (idéntico a Inicio) para el estado derivado y los conteos. Añade:
--   1) directorio paginado con vigencias, estado derivado y filtro por estado;
--   2) conteos por bucket consistentes con las tarjetas de Inicio;
--   3) extensión de vigencia auditada (`access_window_changed`).
--
-- Estado derivado por fila (badge, excluyente y por prioridad):
--   expirado  = access_expires_at < now()
--   pausado   = account_status = 'suspended' (y no expirado)
--   por_vencer= activo con access_expires_at dentro de [now(), now()+7d)
--   activo    = resto con account_status = 'active'
-- Los CONTEOS de los filtros usan las mismas definiciones ACUMULATIVAS que
-- Inicio (por_vencer ⊂ activos) para que las cifras coincidan exactamente.

-- 1) Directorio paginado con vigencias + estado + filtro por estado.
drop function if exists public.list_administrative_users_page(
  uuid, text, text, public.account_status, integer, integer
);

-- p_access_state is appended last to preserve the existing positional 6-arg
-- contract (older callers keep working; the new filter defaults to null).
create function public.list_administrative_users_page(
  p_actor_id uuid,
  p_search text default null,
  p_group text default null,
  p_account_status public.account_status default null,
  p_limit integer default 25,
  p_offset integer default 0,
  p_access_state text default null
)
returns table (
  items jsonb,
  total_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(coalesce(p_search, '')), '');
  now_ts timestamptz := now();
  soon_ts timestamptz := now() + pg_catalog.make_interval(days => 7);
begin
  perform private.require_superadministrator(p_actor_id);

  if p_limit is null or p_limit not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'The administrative user limit must be between 1 and 100';
  end if;

  if p_offset is null or p_offset not between 0 and 1000000 then
    raise exception using
      errcode = '22023',
      message = 'The administrative user offset must be between 0 and 1000000';
  end if;

  if p_group is not null and p_group not in ('docente', 'staff') then
    raise exception using
      errcode = '22023',
      message = 'The administrative user group is invalid';
  end if;

  if p_access_state is not null
    and p_access_state not in ('activo', 'por_vencer', 'expirado', 'pausado') then
    raise exception using
      errcode = '22023',
      message = 'The administrative user access state is invalid';
  end if;

  if normalized_search is not null and char_length(normalized_search) > 160 then
    raise exception using
      errcode = '22023',
      message = 'The administrative user search is too long';
  end if;

  return query
  with filtered as not materialized (
    select
      profile.id,
      profile.full_name,
      profile.role,
      profile.account_status,
      profile.last_access_at,
      profile.access_start_at,
      profile.access_expires_at,
      case
        when profile.access_expires_at is not null
          and profile.access_expires_at < now_ts then 'expirado'
        when profile.account_status = 'suspended' then 'pausado'
        when profile.access_expires_at is not null
          and profile.access_expires_at < soon_ts then 'por_vencer'
        else 'activo'
      end as access_state
    from public.profiles as profile
    where (
        normalized_search is null
        or position(lower(normalized_search) in lower(profile.full_name)) > 0
      )
      and (
        p_group is null
        or (p_group = 'docente' and profile.role = 'docente'::public.app_role)
        or (
          p_group = 'staff'
          and profile.role in (
            'admin'::public.app_role,
            'superadmin'::public.app_role
          )
        )
      )
      and (
        p_account_status is null
        or profile.account_status = p_account_status
      )
      and (
        p_access_state is null
        or (
          p_access_state = 'activo'
          and profile.account_status = 'active'
          and (
            profile.access_expires_at is null
            or profile.access_expires_at >= now_ts
          )
        )
        or (
          p_access_state = 'por_vencer'
          and profile.account_status = 'active'
          and profile.access_expires_at >= now_ts
          and profile.access_expires_at < soon_ts
        )
        or (
          p_access_state = 'expirado'
          and profile.access_expires_at < now_ts
        )
        or (
          p_access_state = 'pausado'
          and profile.account_status = 'suspended'
        )
      )
  ),
  page as (
    select filtered.*
    from filtered
    order by filtered.full_name, filtered.id
    limit p_limit
    offset p_offset
  )
  select
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'account_status', page.account_status,
            'full_name', page.full_name,
            'id', page.id,
            'last_access_at', page.last_access_at,
            'role', page.role,
            'access_start_at', page.access_start_at,
            'access_expires_at', page.access_expires_at,
            'access_state', page.access_state
          )
          order by page.full_name, page.id
        )
        from page
      ),
      '[]'::jsonb
    ),
    (select count(*) from filtered);
end;
$$;

revoke all on function public.list_administrative_users_page(
  uuid, text, text, public.account_status, integer, integer, text
) from public, anon, authenticated;

grant execute on function public.list_administrative_users_page(
  uuid, text, text, public.account_status, integer, integer, text
) to service_role;

comment on function public.list_administrative_users_page(
  uuid, text, text, public.account_status, integer, integer, text
) is 'Returns a stable, filtered page of the SUPERADMIN user directory with access-window fields, a derived access state and its exact total.';

-- 2) Conteos por bucket (mismas definiciones que Inicio; por_vencer ⊂ activos).
create or replace function public.count_administrative_users(
  p_actor_id uuid,
  p_search text default null,
  p_group text default null
)
returns table (
  total_count bigint,
  active_count bigint,
  expiring_soon_count bigint,
  expired_count bigint,
  suspended_count bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_search text := nullif(btrim(coalesce(p_search, '')), '');
  now_ts timestamptz := now();
  soon_ts timestamptz := now() + pg_catalog.make_interval(days => 7);
begin
  perform private.require_superadministrator(p_actor_id);

  if p_group is not null and p_group not in ('docente', 'staff') then
    raise exception using
      errcode = '22023',
      message = 'The administrative user group is invalid';
  end if;

  if normalized_search is not null and char_length(normalized_search) > 160 then
    raise exception using
      errcode = '22023',
      message = 'The administrative user search is too long';
  end if;

  return query
  with scoped as not materialized (
    select
      profile.account_status,
      profile.access_expires_at
    from public.profiles as profile
    where (
        normalized_search is null
        or position(lower(normalized_search) in lower(profile.full_name)) > 0
      )
      and (
        p_group is null
        or (p_group = 'docente' and profile.role = 'docente'::public.app_role)
        or (
          p_group = 'staff'
          and profile.role in (
            'admin'::public.app_role,
            'superadmin'::public.app_role
          )
        )
      )
  )
  select
    count(*),
    count(*) filter (
      where scoped.account_status = 'active'
        and (
          scoped.access_expires_at is null
          or scoped.access_expires_at >= now_ts
        )
    ),
    count(*) filter (
      where scoped.account_status = 'active'
        and scoped.access_expires_at >= now_ts
        and scoped.access_expires_at < soon_ts
    ),
    count(*) filter (
      where scoped.access_expires_at < now_ts
    ),
    count(*) filter (
      where scoped.account_status = 'suspended'
    )
  from scoped;
end;
$$;

revoke all on function public.count_administrative_users(uuid, text, text)
  from public, anon, authenticated;

grant execute on function public.count_administrative_users(uuid, text, text)
  to service_role;

comment on function public.count_administrative_users(uuid, text, text) is
  'Returns SUPERADMIN directory bucket counts (total, active, expiring-soon, expired, suspended) using the same 7-day thresholds as the Inicio dashboard.';

-- 3) Extensión/edición de vigencia auditada. "Extender vigencia" es hacia
-- adelante: rechaza una expiración ya pasada (usar "Pausar" para bloquear ya).
create or replace function public.update_administrative_user_access_window(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_access_start_at timestamptz default null,
  p_access_expires_at timestamptz default null,
  p_reason text default null
)
returns table (
  id uuid,
  full_name text,
  role public.app_role,
  account_status public.account_status,
  last_access_at timestamptz,
  access_start_at timestamptz,
  access_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  normalized_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  previous_start timestamptz;
  previous_expires timestamptz;
begin
  perform private.require_superadministrator(p_actor_id);

  -- Mirrors update_administrative_user: an actor never edits their own access,
  -- so a superadministrator cannot lock themselves out.
  if p_target_user_id is null or p_target_user_id = p_actor_id then
    raise exception using
      errcode = '22023',
      message = 'A superadministrator cannot change their own access window';
  end if;

  if normalized_reason is null
    or char_length(normalized_reason) not between 4 and 500 then
    raise exception using
      errcode = '22023',
      message = 'An access-window change requires a reason';
  end if;

  if p_access_expires_at is not null and p_access_expires_at < now() then
    raise exception using
      errcode = '22023',
      message = 'The access expiry must not be in the past; suspend the account to block access immediately';
  end if;

  if p_access_start_at is not null
    and p_access_expires_at is not null
    and p_access_start_at > p_access_expires_at then
    raise exception using
      errcode = '22023',
      message = 'The access start must not be after the access expiry';
  end if;

  select * into target
  from public.profiles as profile
  where profile.id = p_target_user_id
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'The administrative user was not found';
  end if;

  -- The merged expiry enforcement is fail-closed across the whole API, so
  -- giving the last active superadministrator an expiry would eventually lock
  -- every administrator out with no in-app recovery. Same invariant the sibling
  -- update_administrative_user protects for role and account status.
  if target.role = 'superadmin'
    and target.account_status = 'active'
    and p_access_expires_at is not null
    and not exists (
      select 1
      from public.profiles as profile
      where profile.id <> target.id
        and profile.role = 'superadmin'
        and profile.account_status = 'active'
        and (
          profile.access_expires_at is null
          or profile.access_expires_at >= now()
        )
    ) then
    raise exception using
      errcode = '23514',
      message = 'At least one active superadministrator must keep unexpired access';
  end if;

  previous_start := target.access_start_at;
  previous_expires := target.access_expires_at;

  update public.profiles as profile
  set
    access_start_at = p_access_start_at,
    access_expires_at = p_access_expires_at
  where profile.id = target.id
  returning * into target;

  perform private.record_operational_audit(
    p_actor_id,
    'access_window_changed',
    'profile',
    target.id,
    jsonb_build_object(
      'fromStartAt', previous_start,
      'toStartAt', p_access_start_at,
      'fromExpiresAt', previous_expires,
      'toExpiresAt', p_access_expires_at,
      'reason', normalized_reason
    )
  );

  return query
  select
    target.id,
    target.full_name,
    target.role,
    target.account_status,
    target.last_access_at,
    target.access_start_at,
    target.access_expires_at;
end;
$$;

revoke all on function public.update_administrative_user_access_window(
  uuid, uuid, timestamptz, timestamptz, text
) from public, anon, authenticated;

grant execute on function public.update_administrative_user_access_window(
  uuid, uuid, timestamptz, timestamptz, text
) to service_role;

comment on function public.update_administrative_user_access_window(
  uuid, uuid, timestamptz, timestamptz, text
) is 'Sets a user access window (start/expiry), forward-only, auditing the change as access_window_changed.';
