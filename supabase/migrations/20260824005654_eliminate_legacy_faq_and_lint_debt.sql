-- The disabled v1 FAQ recorder has no callers and retained misleading
-- parameters. The v2 RPC is the only supported privacy-preserving contract.
drop function public.record_faq_memory_observation(uuid, text, text);

create or replace function public.logically_delete_document(
  p_document_id uuid,
  p_reason text,
  p_actor_id uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 2 and 500 then
    raise exception using
      errcode = '22023',
      message = 'Logical document deletion requires a reason';
  end if;

  perform 1
  from public.documents
  where id = p_document_id
    and not is_deleted
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Document was not found';
  end if;

  update public.documents
  set
    publication_status = 'inactive',
    deactivated_at = now(),
    deactivated_by = p_actor_id,
    deactivation_reason = p_reason,
    is_deleted = true,
    deleted_at = now(),
    deleted_by = p_actor_id,
    deletion_reason = p_reason,
    updated_by = p_actor_id
  where id = p_document_id;

  insert into public.document_audit_events (
    document_id,
    action,
    details,
    actor_id
  )
  values (
    p_document_id,
    'logically_deleted',
    jsonb_build_object('reason', p_reason),
    p_actor_id
  );
end;
$$;

revoke all on function public.logically_delete_document(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.logically_delete_document(uuid, text, uuid) to service_role;
