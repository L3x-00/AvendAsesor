create or replace function public.list_administrative_users_page(
  p_actor_id uuid,
  p_search text default null,
  p_group text default null,
  p_account_status public.account_status default null,
  p_limit integer default 25,
  p_offset integer default 0
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
      profile.last_access_at
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
            'role', page.role
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
  uuid,
  text,
  text,
  public.account_status,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_administrative_users_page(
  uuid,
  text,
  text,
  public.account_status,
  integer,
  integer
) to service_role;

comment on function public.list_administrative_users_page(
  uuid,
  text,
  text,
  public.account_status,
  integer,
  integer
) is 'Returns a stable, filtered page of the SUPERADMIN user directory and its exact total.';
