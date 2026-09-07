-- Repara la duplicación de módulos raíz que introdujo 20260903110000.
--
-- Aquella migración sembró los siete módulos canónicos protegiéndose con
-- `where not exists (... existing.code = required.code or lower(existing.name)
-- = lower(required.name))`. La comparación es por nombre EXACTO, así que en una
-- base que ya tenía los módulos con otra redacción o sin tildes la guarda no
-- reconoció ninguno y los insertó de nuevo:
--
--   "Contrato y desplazamiento"  vs  "Contratación y desplazamientos"
--   "Evaluacion docente"         vs  "Evaluación docente"
--   "Auxiliar de educacion"      vs  "Auxiliar de educación"
--
-- Los otros cuatro sí coincidieron letra por letra, por eso solo se duplicaron
-- tres. El docente veía ambos en su barra lateral.
--
-- CRITERIO: sobrevive siempre el módulo PREEXISTENTE. Es el que tiene los
-- documentos, las conversaciones y el icono de la interfaz docente. Los ocho
-- submódulos de Evaluación docente que pidió el cliente se reubican bajo el
-- superviviente para no perder esa estructura.
--
-- En una instalación nueva no existe ningún módulo `QA_*`, así que todo este
-- archivo es un no-op y los módulos canónicos quedan intactos.

do $$
declare
  par record;
  submodulo_destino uuid;
  responsable uuid;
begin
  -- Las bajas de módulo exigen un responsable auditable
  -- (modules_deactivation_audit_check y modules_logical_deletion_audit_check).
  -- Se atribuye a un superadministrador activo; si no hubiera ninguno, a
  -- cualquier perfil administrativo. Sin perfiles no hay nada que reparar.
  select profile.id into responsable
  from public.profiles as profile
  where profile.role = 'superadmin' and profile.account_status = 'active'
  order by profile.created_at, profile.id
  limit 1;

  if responsable is null then
    select profile.id into responsable
    from public.profiles as profile
    where profile.role in ('superadmin', 'admin')
    order by profile.created_at, profile.id
    limit 1;
  end if;

  if responsable is null then
    return;
  end if;

  for par in
    select
      duplicado.id as duplicado_id,
      duplicado.name as duplicado_nombre,
      superviviente.id as superviviente_id,
      superviviente.name as superviviente_nombre
    from public.modules as duplicado
    join public.modules as superviviente
      on superviviente.code = case duplicado.code
        when 'CONTRATACION_DESPLAZAMIENTOS' then 'QA_CONTRATO_DESPLAZAMIENTO'
        when 'EVALUACION_DOCENTE' then 'QA_EVALUACION_DOCENTE'
        when 'AUXILIAR_EDUCACION' then 'QA_AUXILIAR_EDUCACION'
      end
      and superviviente.parent_module_id is null
      and not superviviente.is_deleted
    where duplicado.code in (
        'CONTRATACION_DESPLAZAMIENTOS',
        'EVALUACION_DOCENTE',
        'AUXILIAR_EDUCACION'
      )
      and duplicado.parent_module_id is null
      and not duplicado.is_deleted
  loop
    -- El trigger de jerarquía prohíbe que un módulo con documentos pegados a la
    -- raíz reciba submódulos, y es la regla correcta: el cliente pide que los
    -- documentos vivan en el submódulo que les corresponde. Antes de reubicar,
    -- se baja cada documento directo al submódulo cuyo nombre coincide; si
    -- ninguno coincide y el documento conserva otra asociación, se retira la
    -- que quedaría huérfana en la raíz.
    if exists (
      select 1 from public.modules as hijo
      where hijo.parent_module_id = par.duplicado_id and not hijo.is_deleted
    ) then
      for submodulo_destino in
        select relation.document_id
        from public.document_modules as relation
        where relation.module_id = par.superviviente_id
      loop
        declare
          destino uuid;
          documento_id uuid := submodulo_destino;
        begin
          select hijo.id into destino
          from public.modules as hijo
          join public.documents as documento on documento.id = documento_id
          where hijo.parent_module_id = par.duplicado_id
            and not hijo.is_deleted
            and lower(btrim(hijo.name)) = lower(btrim(documento.title))
          limit 1;

          if destino is not null then
            insert into public.document_modules (document_id, module_id, created_by)
            select documento_id, destino, relation.created_by
            from public.document_modules as relation
            where relation.document_id = documento_id
              and relation.module_id = par.superviviente_id
            on conflict do nothing;
          end if;

          -- Solo se retira la asociación raíz si al documento le queda otra.
          if exists (
            select 1 from public.document_modules as relation
            where relation.document_id = documento_id
              and relation.module_id <> par.superviviente_id
          ) then
            delete from public.document_modules as relation
            where relation.document_id = documento_id
              and relation.module_id = par.superviviente_id;
          end if;
        end;
      end loop;

      update public.modules as hijo
      set parent_module_id = par.superviviente_id
      where hijo.parent_module_id = par.duplicado_id
        and not hijo.is_deleted;
    end if;

    -- Cualquier documento asociado directamente al duplicado pasa al
    -- superviviente antes de retirarlo.
    insert into public.document_modules (document_id, module_id, created_by)
    select relation.document_id, par.superviviente_id, relation.created_by
    from public.document_modules as relation
    where relation.module_id = par.duplicado_id
    on conflict do nothing;

    delete from public.document_modules as relation
    where relation.module_id = par.duplicado_id;

    update public.modules as duplicado
    set
      is_active = false,
      is_deleted = true,
      deleted_at = now(),
      deleted_by = responsable,
      deletion_reason = 'Duplicado de "' || par.superviviente_nombre
        || '" creado por la migración 20260903110000; se conserva el módulo original.',
      deactivated_at = now(),
      deactivated_by = responsable,
      deactivation_reason = 'Duplicado retirado del panel docente.'
    where duplicado.id = par.duplicado_id;

    raise notice 'Módulo duplicado "%" fusionado en "%".',
      par.duplicado_nombre, par.superviviente_nombre;
  end loop;
end;
$$;
