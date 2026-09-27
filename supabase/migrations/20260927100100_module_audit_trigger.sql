-- Hito 4 · Auditoría de módulos (2/2).
--
-- Crear, editar, activar/desactivar, eliminar o restaurar módulos cambia lo
-- que el asistente puede consultar, pero hasta ahora solo quedaba el último
-- responsable en la propia fila (sin historial). Este trigger deja cada cambio
-- en el registro inmutable `operational_audit_events`, junto a los cambios de
-- usuarios, y la vista «Actividad auditada» lo muestra.
--
-- Atribución explícita: solo se audita una escritura que trae su responsable
-- en `audit_actor` (la API lo completa en cada alta y edición). El trigger lo
-- consume y lo deja en NULL, así nunca queda un responsable «heredado» de una
-- escritura anterior. Correcciones por SQL, migraciones o semillas no lo traen
-- y no se atribuyen a nadie por error.
--
-- Despliegue (ORDEN OBLIGATORIO): aplicar esta migración (y la anterior, cada
-- una en su propia transacción) ANTES de publicar la API nueva. La API nueva
-- envía `audit_actor` en cada escritura de módulos: sin la columna, crear,
-- editar, activar o eliminar módulos fallaría (503). Al revés es seguro: la API
-- anterior no envía `audit_actor`, así que no se generan eventos que la web
-- anterior no sepa mostrar.
--
-- Reordenar (`sort_order`) no se audita: mover un tema reescribe la posición
-- de sus hermanos y llenaría el registro de ruido.

alter table public.modules
  add column if not exists audit_actor uuid;

comment on column public.modules.audit_actor is
  'Responsable de la escritura en curso, solo para auditoría. El trigger modules_record_audit lo consume y lo deja en NULL.';

alter table public.operational_audit_events
  drop constraint if exists operational_audit_events_resource_type_check;

alter table public.operational_audit_events
  add constraint operational_audit_events_resource_type_check
  check (
    resource_type in (
      'chat_conversation',
      'unanswered_question',
      'profile',
      'module'
    )
  );

create or replace function private.record_module_audit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  audit_action public.operational_audit_action;
  audit_actor uuid := new.audit_actor;
  audit_role public.app_role;
  audit_metadata jsonb;
  changed_fields text[] := array[]::text[];
begin
  -- Se consume siempre: nunca queda guardado en la fila.
  -- Nota: un INSERT ... ON CONFLICT DO NOTHING que envíe audit_actor y luego
  -- choque dejaría su evento; la API usa inserciones simples.
  new.audit_actor := null;

  if audit_actor is null then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.name is distinct from old.name then
      changed_fields := array_append(changed_fields, 'name');
    end if;
    if new.description is distinct from old.description then
      changed_fields := array_append(changed_fields, 'description');
    end if;
    if new.code is distinct from old.code then
      changed_fields := array_append(changed_fields, 'code');
    end if;
    if new.parent_module_id is distinct from old.parent_module_id then
      changed_fields := array_append(changed_fields, 'parent');
    end if;
    if new.metadata is distinct from old.metadata then
      changed_fields := array_append(changed_fields, 'metadata');
    end if;
  end if;

  if tg_op = 'INSERT' then
    audit_action := 'module_created';
    audit_metadata := jsonb_build_object(
      'moduleName', new.name,
      'isSubmodule', new.parent_module_id is not null
    );
  elsif new.is_deleted and not old.is_deleted then
    audit_action := 'module_deleted';
    audit_metadata := jsonb_build_object(
      'moduleName', new.name,
      'reason', new.deletion_reason
    );
  elsif new.is_active is distinct from old.is_active then
    audit_action := 'module_status_changed';
    audit_metadata := jsonb_build_object(
      'moduleName', new.name,
      'isActive', new.is_active,
      'reason', case when not new.is_active then new.deactivation_reason end,
      'changedFields', case
        when cardinality(changed_fields) > 0 then to_jsonb(changed_fields)
      end
    );
  else
    if old.is_deleted and not new.is_deleted then
      changed_fields := array_append(changed_fields, 'restored');
    end if;
    -- Solo posición o marcas de tiempo: sin evento.
    if cardinality(changed_fields) = 0 then
      return new;
    end if;
    audit_action := 'module_updated';
    audit_metadata := jsonb_build_object(
      'moduleName', new.name,
      'previousName', case when new.name is distinct from old.name then old.name end,
      'changedFields', to_jsonb(changed_fields)
    );
  end if;

  select profile.role into audit_role
  from public.profiles as profile
  where profile.id = audit_actor;

  -- Un responsable que no es un perfil no se registra como falso autor.
  if audit_role is null then
    return new;
  end if;

  insert into public.operational_audit_events (
    actor_id,
    actor_role,
    action,
    resource_type,
    resource_id,
    metadata
  )
  values (
    audit_actor,
    audit_role,
    audit_action,
    'module',
    new.id,
    jsonb_strip_nulls(audit_metadata)
  );

  return new;
end;
$$;

revoke all on function private.record_module_audit() from public;

drop trigger if exists modules_record_audit on public.modules;

-- BEFORE: así el trigger puede limpiar `audit_actor`. Si otra validación de la
-- misma escritura falla después, el evento se revierte junto con ella.
create trigger modules_record_audit
before insert or update on public.modules
for each row execute procedure private.record_module_audit();
