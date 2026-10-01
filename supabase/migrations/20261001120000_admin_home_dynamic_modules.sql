-- Inicio del panel administrativo: el resumen de módulos sale de los módulos
-- raíz reales, no de una lista fija de siete nombres.
--
-- La versión anterior exigía los siete nombres canónicos (o sus códigos QA
-- heredados) y lanzaba P0002 si faltaba alguno. Desde que el superadministrador
-- crea, renombra y elimina módulos en el panel, basta con recrear uno con otro
-- nombre («Situaciones Administrativas», con otro código) para que Inicio deje
-- de cargar por completo. Ahora se listan todos los módulos raíz no eliminados,
-- en el mismo orden que la sección Módulos, con su estado activo/inactivo.
--
-- La firma y las columnas de retorno no cambian; `create or replace` conserva
-- los privilegios (solo service_role puede ejecutarla).
--
-- Despliegue: aplicar junto con el API y la web de este cambio. El API anterior
-- exige los siete nombres canónicos y el nuevo exige `isActive`, así que entre
-- la migración y el despliegue Inicio puede responder 503 (en producción ya
-- fallaba antes de aplicarla).
create or replace function public.get_admin_home_dashboard_metrics(
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

  with recursive root_modules as (
    select
      module.id,
      module.name,
      module.is_active,
      module.sort_order
    from public.modules as module
    where module.parent_module_id is null
      and not module.is_deleted
  ),
  module_hierarchy (
    root_module_id,
    descendant_module_id,
    branch_is_deleted
  ) as (
    select root.id, root.id, false
    from root_modules as root

    union all

    select
      hierarchy.root_module_id,
      child.id,
      hierarchy.branch_is_deleted or child.is_deleted
    from module_hierarchy as hierarchy
    join public.modules as child
      on child.parent_module_id = hierarchy.descendant_module_id
  ),
  summary_rows as (
    select
      root.id,
      root.name,
      root.is_active,
      root.sort_order,
      count(distinct hierarchy.descendant_module_id) filter (
        where hierarchy.descendant_module_id <> root.id
          and not hierarchy.branch_is_deleted
      ) as submodule_count,
      count(distinct document.id) as document_count
    from root_modules as root
    left join module_hierarchy as hierarchy
      on hierarchy.root_module_id = root.id
    left join public.document_modules as document_module
      on document_module.module_id = hierarchy.descendant_module_id
      and not hierarchy.branch_is_deleted
    left join public.documents as document
      on document.id = document_module.document_id
      and not document.is_deleted
    group by root.id, root.name, root.is_active, root.sort_order
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', summary.id,
        'name', summary.name,
        'isActive', summary.is_active,
        'submoduleCount', summary.submodule_count,
        'documentCount', summary.document_count
      )
      order by summary.sort_order, summary.name, summary.id
    ),
    '[]'::jsonb
  )
  into dashboard_module_summaries
  from summary_rows as summary;

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
