-- A12: una decisión administrativa concurrente no debe sobrescribirse.
--
-- `update_consultation_case` tomaba el candado de la fila y aplicaba el cambio
-- sin comprobar el estado que el revisor tenía en pantalla. El cierre grupal
-- revalidaba los casos abiertos y después actualizaba uno por uno, así que una
-- decisión tomada entre ambas lecturas (por ejemplo, otro revisor la marcó
-- «resuelta») podía quedar reemplazada en silencio por «descartada».
--
-- Se agrega `p_expected_status`: cuando el llamador informa el estado que vio,
-- la función falla con `P0001` si el caso ya cambió. El API siempre lo envía
-- (cierre individual y cierre grupal); sin el parámetro la firma sigue siendo
-- compatible para tareas internas.
--
-- El argumento nuevo cambia la firma. PostgreSQL crearía una sobrecarga y
-- PostgREST podría resolver la versión anterior, así que se elimina primero la
-- de siete argumentos y se vuelven a declarar sus privilegios.

drop function if exists public.update_consultation_case(
  uuid, uuid, text, text, boolean, uuid, uuid
);

create or replace function public.update_consultation_case(
  p_actor_id uuid,
  p_consultation_case_id uuid,
  p_status text default null,
  p_note text default null,
  p_change_routing boolean default false,
  p_detected_module_id uuid default null,
  p_detected_submodule_id uuid default null,
  p_expected_status text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_case public.consultation_cases%rowtype;
  normalized_note text := nullif(btrim(coalesce(p_note, '')), '');
  routing_context record;
  previous_status public.consultation_case_status;
begin
  perform private.require_active_consultation_administrator(p_actor_id);

  if p_status is not null and p_status not in ('pending', 'in_review', 'resolved', 'discarded') then
    raise exception using errcode = '22023', message = 'The consultation case status is invalid';
  end if;
  if p_expected_status is not null
     and p_expected_status not in ('pending', 'in_review', 'resolved', 'discarded') then
    raise exception using errcode = '22023', message = 'The consultation case expected status is invalid';
  end if;
  if normalized_note is not null and char_length(normalized_note) not between 1 and 2_000 then
    raise exception using errcode = '22023', message = 'The consultation case note is invalid';
  end if;
  if p_status is null and normalized_note is null and not p_change_routing then
    raise exception using errcode = '22023', message = 'The consultation case update has no effect';
  end if;

  select * into target_case
  from public.consultation_cases as consultation_case
  where consultation_case.id = p_consultation_case_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Consultation case was not found';
  end if;

  -- Compare-and-swap: la decisión se aplica solo sobre el estado observado.
  if p_expected_status is not null
     and target_case.status::text is distinct from p_expected_status then
    raise exception using errcode = 'P0001', message = 'The consultation case changed since it was read';
  end if;

  previous_status := target_case.status;

  if p_change_routing then
    perform private.validate_consultation_routing(
      p_detected_module_id,
      p_detected_submodule_id,
      null
    );
    if p_detected_module_id is not null then
      select * into routing_context
      from private.consultation_module_context(
        coalesce(p_detected_submodule_id, p_detected_module_id)
      );
    end if;
    update public.consultation_cases
    set
      detected_module_id = p_detected_module_id,
      detected_submodule_id = p_detected_submodule_id,
      detected_module_name = routing_context.root_module_name,
      detected_submodule_name = routing_context.submodule_name
    where id = target_case.id;
    perform private.insert_consultation_case_event(
      target_case.id,
      p_actor_id,
      'routing_corrected',
      null,
      jsonb_build_object(
        'previousModuleId', target_case.detected_module_id,
        'previousSubmoduleId', target_case.detected_submodule_id,
        'moduleId', p_detected_module_id,
        'submoduleId', p_detected_submodule_id
      )
    );
  end if;

  if p_status is not null and p_status::public.consultation_case_status is distinct from previous_status then
    update public.consultation_cases
    set status = p_status::public.consultation_case_status
    where id = target_case.id;
    perform private.insert_consultation_case_event(
      target_case.id,
      p_actor_id,
      'status_changed',
      null,
      jsonb_build_object('previousStatus', previous_status::text, 'status', p_status)
    );
  end if;

  if normalized_note is not null then
    perform private.insert_consultation_case_event(
      target_case.id,
      p_actor_id,
      'note_added',
      normalized_note,
      '{}'::jsonb
    );
  end if;
end;
$$;

revoke all on function public.update_consultation_case(
  uuid, uuid, text, text, boolean, uuid, uuid, text
) from public, anon, authenticated;

grant execute on function public.update_consultation_case(
  uuid, uuid, text, text, boolean, uuid, uuid, text
) to service_role;

notify pgrst, 'reload schema';
