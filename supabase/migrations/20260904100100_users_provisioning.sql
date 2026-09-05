-- Fase 3 "Usuarios y accesos": alta de usuarios/administradores y directorio
-- con correo, celular y trazabilidad.
--
-- El correo se lee de auth.users (no se duplica en profiles). La identidad la
-- crea el API con la Auth Admin API y luego llama a provision_administrative_user
-- para completar el perfil de forma atomica y auditada.

-- 1) Directorio: anade correo, celular y "creado por", y busca tambien por
--    correo y celular. Firma sin cambios, asi que basta con reemplazar el cuerpo.
create or replace function public.list_administrative_users_page(
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
      profile.phone,
      identity.email,
      creator.full_name as created_by_name,
      case
        when profile.access_expires_at is not null
          and profile.access_expires_at < now_ts then 'expirado'
        when profile.account_status = 'suspended' then 'pausado'
        when profile.access_expires_at is not null
          and profile.access_expires_at < soon_ts then 'por_vencer'
        else 'activo'
      end as access_state
    from public.profiles as profile
    left join auth.users as identity on identity.id = profile.id
    left join public.profiles as creator on creator.id = profile.created_by
    where (
        normalized_search is null
        or position(lower(normalized_search) in lower(profile.full_name)) > 0
        or position(lower(normalized_search) in lower(coalesce(identity.email, ''))) > 0
        or position(lower(normalized_search) in lower(coalesce(profile.phone, ''))) > 0
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
            'access_state', page.access_state,
            'email', page.email,
            'phone', page.phone,
            'created_by_name', page.created_by_name
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

-- 2) Los conteos deben filtrar por los mismos campos que la busqueda.
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
    left join auth.users as identity on identity.id = profile.id
    where (
        normalized_search is null
        or position(lower(normalized_search) in lower(profile.full_name)) > 0
        or position(lower(normalized_search) in lower(coalesce(identity.email, ''))) > 0
        or position(lower(normalized_search) in lower(coalesce(profile.phone, ''))) > 0
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

-- 3) Alta: completa el perfil que el trigger de auth.users acaba de crear.
-- El API ya creo la identidad con la Auth Admin API; aqui se fija el resto del
-- registro, la trazabilidad y la auditoria en una sola transaccion.
create or replace function public.provision_administrative_user(
  p_actor_id uuid,
  p_target_user_id uuid,
  p_full_name text,
  p_role public.app_role default 'docente',
  p_phone text default null,
  p_access_start_at timestamptz default null,
  p_access_expires_at timestamptz default null
)
returns table (
  id uuid,
  full_name text,
  role public.app_role,
  account_status public.account_status,
  last_access_at timestamptz,
  access_start_at timestamptz,
  access_expires_at timestamptz,
  phone text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles%rowtype;
  normalized_name text := nullif(btrim(coalesce(p_full_name, '')), '');
  normalized_phone text := nullif(btrim(coalesce(p_phone, '')), '');
begin
  perform private.require_superadministrator(p_actor_id);

  if p_target_user_id is null then
    raise exception using
      errcode = '22023',
      message = 'A target user is required';
  end if;

  if normalized_name is null
    or char_length(normalized_name) not between 2 and 160 then
    raise exception using
      errcode = '22023',
      message = 'A full name between 2 and 160 characters is required';
  end if;

  if normalized_phone is not null
    and char_length(normalized_phone) not between 6 and 20 then
    raise exception using
      errcode = '22023',
      message = 'The phone number must be between 6 and 20 characters';
  end if;

  if p_role is null
    or p_role not in (
      'docente'::public.app_role,
      'admin'::public.app_role,
      'superadmin'::public.app_role
    ) then
    raise exception using
      errcode = '22023',
      message = 'The administrative role is invalid';
  end if;

  if p_access_expires_at is not null and p_access_expires_at < now() then
    raise exception using
      errcode = '22023',
      message = 'The access expiry must not be in the past';
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

  -- Solo se completa un registro recien creado. Si ya tiene autor, el alta ya
  -- ocurrio y este llamado seria una edicion encubierta sin motivo auditado.
  if target.created_by is not null then
    raise exception using
      errcode = '23505',
      message = 'The administrative user was already provisioned';
  end if;

  update public.profiles as profile
  set
    full_name = normalized_name,
    role = p_role,
    phone = normalized_phone,
    access_start_at = p_access_start_at,
    access_expires_at = p_access_expires_at,
    created_by = p_actor_id,
    updated_by = p_actor_id
  where profile.id = target.id
  returning * into target;

  perform private.record_operational_audit(
    p_actor_id,
    'user_created',
    'profile',
    target.id,
    jsonb_build_object(
      'role', p_role,
      'hasPhone', normalized_phone is not null,
      'accessStartAt', p_access_start_at,
      'accessExpiresAt', p_access_expires_at
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
    target.access_expires_at,
    target.phone;
end;
$$;

revoke all on function public.provision_administrative_user(
  uuid, uuid, text, public.app_role, text, timestamptz, timestamptz
) from public, anon, authenticated;

grant execute on function public.provision_administrative_user(
  uuid, uuid, text, public.app_role, text, timestamptz, timestamptz
) to service_role;

comment on function public.provision_administrative_user(
  uuid, uuid, text, public.app_role, text, timestamptz, timestamptz
) is 'Completes the profile of a freshly created auth identity, recording who created it and auditing it as user_created.';
