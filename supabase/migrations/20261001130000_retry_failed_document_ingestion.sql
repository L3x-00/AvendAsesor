-- Gestión de documentos: el administrador puede reintentar el procesamiento
-- (lectura, OCR e indexación) de un documento en estado «Error».
--
-- Hasta ahora, una versión con `ingestion_status = 'failed'` dejaba el
-- documento sin salida: la ficha decía «Error asignado automáticamente… No
-- puede seleccionarse manualmente» y no ofrecía ninguna acción. Los seis
-- documentos en Error de producción (2026-10-01) fallaron por LEASE_EXPIRED:
-- el worker perdió su turno a mitad del OCR. Corregido el worker, basta con
-- volver a encolar la versión vigente.
--
-- Existe `retry_document_ingestion(versión, actor)` desde Hito 3, pero ningún
-- servicio la usa: trabaja por versión, no comprueba que el documento siga
-- vivo, permite reencolar versiones ya indexadas y no deja rastro en la
-- auditoría. Esta función nueva y aditiva cubre el caso del panel; la anterior
-- queda intacta.
--
-- La transición de `document_versions.ingestion_status` solo la puede hacer
-- `private.set_document_ingestion_status`, y los roles de la API no tienen
-- USAGE sobre `private`: por eso la función es SECURITY DEFINER y solo la
-- ejecuta service_role, como `claim_document_ingestion_job`.
create function public.retry_failed_document_ingestion(
  p_document_id uuid,
  p_actor_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.documents%rowtype;
  job public.document_ingestion_jobs%rowtype;
  version_status public.document_ingestion_status;
begin
  if p_document_id is null or p_actor_id is null then
    raise exception using
      errcode = '22023',
      message = 'Document and actor are required';
  end if;

  select document.*
  into target
  from public.documents as document
  where document.id = p_document_id
    and not document.is_deleted
  for update of document;

  if not found or target.current_version_id is null then
    raise exception using errcode = 'P0002', message = 'Document was not found';
  end if;

  select version.ingestion_status
  into version_status
  from public.document_versions as version
  where version.id = target.current_version_id
    and version.document_id = target.id;

  if version_status is distinct from 'failed' then
    raise exception using
      errcode = '22023',
      message = 'Only a failed document version can be processed again';
  end if;

  select ingestion_job.*
  into job
  from public.document_ingestion_jobs as ingestion_job
  where ingestion_job.document_version_id = target.current_version_id
  for update of ingestion_job;

  if found then
    update public.document_ingestion_jobs
    set
      status = 'pending',
      attempt_count = 0,
      lease_token = null,
      leased_at = null,
      lease_expires_at = null,
      last_error_code = null,
      last_error_message = null,
      requested_at = now(),
      requested_by = p_actor_id,
      completed_at = null,
      updated_at = now()
    where id = job.id;
  else
    insert into public.document_ingestion_jobs (
      document_id,
      document_version_id,
      requested_by
    )
    values (target.id, target.current_version_id, p_actor_id);
  end if;

  perform private.set_document_ingestion_status(
    target.current_version_id,
    'pending'
  );

  insert into public.document_audit_events (
    document_id,
    document_version_id,
    action,
    details,
    actor_id
  )
  values (
    target.id,
    target.current_version_id,
    'metadata_updated',
    jsonb_build_object(
      'event', 'ingestion_retry_requested',
      'previousErrorCode', job.last_error_code
    ),
    p_actor_id
  );
end;
$$;

revoke all on function public.retry_failed_document_ingestion(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.retry_failed_document_ingestion(uuid, uuid)
  to service_role;
