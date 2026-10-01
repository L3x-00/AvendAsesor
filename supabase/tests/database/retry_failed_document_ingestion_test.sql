begin;

select plan(14);

select has_function(
  'public',
  'retry_failed_document_ingestion',
  array['uuid', 'uuid'],
  'Administrators can queue a failed document version again'
);
select ok(
  (
    select procedure_definition.prosecdef
    from pg_proc as procedure_definition
    where procedure_definition.oid =
      'public.retry_failed_document_ingestion(uuid,uuid)'::regprocedure
  ),
  'The retry RPC is SECURITY DEFINER (it must reach private.*)'
);
select is(
  (
    select array_to_string(procedure_definition.proconfig, ' | ')
    from pg_proc as procedure_definition
    where procedure_definition.oid =
      'public.retry_failed_document_ingestion(uuid,uuid)'::regprocedure
  ),
  'search_path=""',
  'The retry RPC has an empty search path'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.retry_failed_document_ingestion(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot retry ingestion directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.retry_failed_document_ingestion(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Anonymous clients cannot retry ingestion'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.retry_failed_document_ingestion(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'The server role can retry ingestion'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values (
  '00000000-0000-0000-0000-00000000a701',
  'authenticated', 'authenticated', 'retry-admin@example.test',
  '{}'::jsonb, '{"full_name":"Administrador Reintento"}'::jsonb,
  now(), now()
);

update public.profiles
set role = 'admin'::public.app_role
where id = '00000000-0000-0000-0000-00000000a701';

insert into public.documents (id, title, document_type)
values (
  '00000000-0000-0000-0000-00000000a711',
  'Documento escaneado que no se pudo procesar',
  'NORMATIVE'
);

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values (
  '00000000-0000-0000-0000-00000000a712',
  '00000000-0000-0000-0000-00000000a711',
  1,
  'tests/retry/escaneado.pdf',
  'escaneado.pdf',
  'application/pdf',
  2048,
  2,
  repeat('a', 64)
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-00000000a712'
where id = '00000000-0000-0000-0000-00000000a711';

-- Fallo real de producción: el worker perdió su turno tres veces.
select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-00000000a712',
  'processing'
);
select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-00000000a712',
  'failed'
);
update public.document_ingestion_jobs
set
  status = 'failed',
  attempt_count = 3,
  last_error_code = 'LEASE_EXPIRED',
  last_error_message = 'The ingestion worker lease expired before completion.',
  completed_at = now(),
  updated_at = now()
where document_version_id = '00000000-0000-0000-0000-00000000a712';

select lives_ok(
  $$
    select public.retry_failed_document_ingestion(
      '00000000-0000-0000-0000-00000000a711',
      '00000000-0000-0000-0000-00000000a701'
    )
  $$,
  'A failed current version can be queued again'
);
select is(
  (
    select status::text
    from public.document_ingestion_jobs
    where document_version_id = '00000000-0000-0000-0000-00000000a712'
  ),
  'pending',
  'The ingestion job returns to the worker queue'
);
select is(
  (
    select attempt_count
    from public.document_ingestion_jobs
    where document_version_id = '00000000-0000-0000-0000-00000000a712'
  ),
  0,
  'The retry starts with a fresh attempt budget'
);
select ok(
  (
    select
      last_error_code is null
      and last_error_message is null
      and completed_at is null
      and requested_by = '00000000-0000-0000-0000-00000000a701'
    from public.document_ingestion_jobs
    where document_version_id = '00000000-0000-0000-0000-00000000a712'
  ),
  'The previous error is cleared and the requester is recorded'
);
select is(
  (
    select ingestion_status::text
    from public.document_versions
    where id = '00000000-0000-0000-0000-00000000a712'
  ),
  'pending',
  'The version leaves the Error state'
);
select is(
  (
    select count(*)
    from public.document_audit_events
    where document_id = '00000000-0000-0000-0000-00000000a711'
      and document_version_id = '00000000-0000-0000-0000-00000000a712'
      and details ->> 'event' = 'ingestion_retry_requested'
      and details ->> 'previousErrorCode' = 'LEASE_EXPIRED'
      and actor_id = '00000000-0000-0000-0000-00000000a701'
  ),
  1::bigint,
  'The retry is audited with the previous cause and its actor'
);
select throws_ok(
  $$
    select public.retry_failed_document_ingestion(
      '00000000-0000-0000-0000-00000000a711',
      '00000000-0000-0000-0000-00000000a701'
    )
  $$,
  '22023',
  'Only a failed document version can be processed again',
  'A version that is not in Error cannot be queued again'
);
select throws_ok(
  $$
    select public.retry_failed_document_ingestion(
      '00000000-0000-0000-0000-00000000a7ff',
      '00000000-0000-0000-0000-00000000a701'
    )
  $$,
  'P0002',
  'Document was not found',
  'An unknown document cannot be retried'
);

select * from finish();
rollback;
