-- Inicio del panel administrativo: vigencia de acceso y métricas agregadas.
-- La fecha nula representa acceso con vigencia indefinida. Los límites de
-- autorización de API y web consumen la misma columna para evitar que una
-- cuenta vencida conserve acceso mientras Inicio la clasifica como expirada.
alter table public.profiles
  add column access_expires_at timestamptz;

comment on column public.profiles.access_expires_at is
  'Optional access expiry. NULL means indefinite access; past values deny access.';

create index profiles_access_expires_at_idx
  on public.profiles (access_expires_at)
  where access_expires_at is not null;

create function public.get_admin_home_dashboard_metrics(
  p_administrator_id uuid,
  p_expiring_soon_days integer default 7
)
returns table (
  total_users bigint,
  active_users bigint,
  expiring_soon_users bigint,
  expired_users bigint,
  active_modules bigint,
  active_submodules bigint,
  total_documents bigint,
  total_queries bigint,
  ai_queries_processed bigint,
  expiry_window_days integer,
  module_summaries jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  metric_timestamp timestamptz := pg_catalog.now();
  resolved_module_count bigint;
  distinct_module_count bigint;
  dashboard_module_summaries jsonb;
begin
  perform private.require_administrator(p_administrator_id);

  if exists (
    select 1
    from public.profiles as administrator
    where administrator.id = p_administrator_id
      and administrator.access_expires_at < metric_timestamp
  ) then
    raise exception using
      errcode = '42501',
      message = 'Only an active administrator may perform this operation';
  end if;

  if p_expiring_soon_days is null
    or p_expiring_soon_days not between 1 and 365 then
    raise exception using
      errcode = '22023',
      message = 'The expiring-soon window must be between 1 and 365 days';
  end if;

  with recursive canonical_modules (
    display_order,
    canonical_name,
    legacy_code,
    legacy_name
  ) as (
    values
      (
        1,
        'Contratación y desplazamientos'::text,
        'QA_CONTRATO_DESPLAZAMIENTO'::text,
        'Contrato y desplazamiento'::text
      ),
      (
        2,
        'Evaluación docente'::text,
        'QA_EVALUACION_DOCENTE'::text,
        'Evaluacion docente'::text
      ),
      (
        3,
        'Situaciones administrativas'::text,
        'QA_SITUACIONES_ADMIN'::text,
        'Situaciones administrativas'::text
      ),
      (
        4,
        'Auxiliar de educación'::text,
        'QA_AUXILIAR_EDUCACION'::text,
        'Auxiliar de educacion'::text
      ),
      (
        5,
        'Ley y reglamento'::text,
        'QA_LEY_REGLAMENTO'::text,
        'Ley y reglamento'::text
      ),
      (
        6,
        'Cargos y plazas'::text,
        'QA_CARGOS_PLAZAS'::text,
        'Cargos y plazas'::text
      ),
      (
        7,
        'Remuneraciones'::text,
        'QA_REMUNERACIONES'::text,
        'Remuneraciones'::text
      )
  ),
  resolved_modules as (
    select
      canonical.display_order,
      canonical.canonical_name,
      matched_module.id as module_id
    from canonical_modules as canonical
    left join lateral (
      select module.id
      from public.modules as module
      where module.parent_module_id is null
        and not module.is_deleted
        and (
          module.name = canonical.canonical_name
          or module.code = canonical.legacy_code
          or module.name = canonical.legacy_name
        )
      order by
        case
          when module.name = canonical.canonical_name then 0
          when module.code = canonical.legacy_code then 1
          else 2
        end,
        module.is_active desc,
        module.sort_order,
        module.id
      limit 1
    ) as matched_module on true
  ),
  module_hierarchy (
    display_order,
    root_module_id,
    descendant_module_id,
    branch_is_deleted
  ) as (
    select
      resolved.display_order,
      resolved.module_id,
      resolved.module_id,
      false
    from resolved_modules as resolved

    union all

    select
      hierarchy.display_order,
      hierarchy.root_module_id,
      child.id,
      hierarchy.branch_is_deleted or child.is_deleted
    from module_hierarchy as hierarchy
    join public.modules as child
      on child.parent_module_id = hierarchy.descendant_module_id
  ),
  summary_rows as (
    select
      resolved.display_order,
      resolved.canonical_name,
      resolved.module_id,
      count(distinct hierarchy.descendant_module_id) filter (
        where hierarchy.descendant_module_id <> resolved.module_id
          and not hierarchy.branch_is_deleted
      ) as submodule_count,
      count(distinct document.id) as document_count
    from resolved_modules as resolved
    left join module_hierarchy as hierarchy
      on hierarchy.display_order = resolved.display_order
    left join public.document_modules as document_module
      on document_module.module_id = hierarchy.descendant_module_id
      and not hierarchy.branch_is_deleted
    left join public.documents as document
      on document.id = document_module.document_id
      and not document.is_deleted
    group by
      resolved.display_order,
      resolved.canonical_name,
      resolved.module_id
  )
  select
    count(summary.module_id),
    count(distinct summary.module_id),
    jsonb_agg(
      jsonb_build_object(
        'id', summary.module_id,
        'name', summary.canonical_name,
        'submoduleCount', summary.submodule_count,
        'documentCount', summary.document_count
      )
      order by summary.display_order
    )
  into
    resolved_module_count,
    distinct_module_count,
    dashboard_module_summaries
  from summary_rows as summary;

  if resolved_module_count <> 7 or distinct_module_count <> 7 then
    raise exception using
      errcode = 'P0002',
      message = 'The seven canonical AVEND ASESOR modules are not configured';
  end if;

  return query
  select
    (select count(*) from public.profiles),
    (
      select count(*)
      from public.profiles as profile
      where profile.account_status = 'active'
        and (
          profile.access_expires_at is null
          or profile.access_expires_at >= metric_timestamp
        )
    ),
    (
      select count(*)
      from public.profiles as profile
      where profile.account_status = 'active'
        and profile.access_expires_at >= metric_timestamp
        and profile.access_expires_at
          < metric_timestamp
            + pg_catalog.make_interval(days => p_expiring_soon_days)
    ),
    (
      select count(*)
      from public.profiles as profile
      where profile.access_expires_at < metric_timestamp
    ),
    (
      select count(*)
      from public.modules as module
      where module.parent_module_id is null
        and module.is_active
        and not module.is_deleted
    ),
    (
      select count(*)
      from public.modules as module
      where module.parent_module_id is not null
        and module.is_active
        and not module.is_deleted
    ),
    (
      select count(*)
      from public.documents as document
      where not document.is_deleted
    ),
    (
      select count(*)
      from public.chat_messages as message
      where message.role = 'user'
    ),
    (
      select count(*)
      from public.chat_messages as message
      where message.role = 'assistant'
        and message.in_reply_to_message_id is not null
    ),
    p_expiring_soon_days,
    dashboard_module_summaries;
end;
$$;

revoke all on function public.get_admin_home_dashboard_metrics(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.get_admin_home_dashboard_metrics(uuid, integer)
  to service_role;
