begin;

select plan(14);

select has_table(
  'public', 'chat_catalog_access_events',
  'Catalog downloads have a private audit relation'
);
select has_function(
  'public', 'authorize_chat_catalog_download', array['uuid', 'uuid'],
  'Catalog downloads have a server-only authorization RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.authorize_chat_catalog_download(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot authorize catalog downloads directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.authorize_chat_catalog_download(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'The server role can authorize catalog downloads'
);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.chat_catalog_access_events'::regclass),
  'Catalog download audit data has RLS enabled'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.chat_catalog_access_events', 'select'
  ),
  'Authenticated clients cannot inspect catalog download audit data'
);
select ok(
  has_table_privilege(
    'service_role', 'public.chat_catalog_access_events', 'select'
  ),
  'The server role can inspect catalog download audit data'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
)
values
  (
    'e0000000-0000-4000-8000-000000000501',
    'authenticated', 'authenticated', 'catalog-active@example.test',
    '{}'::jsonb, '{"full_name":"Docente Catálogo"}'::jsonb, now(), now()
  ),
  (
    'e0000000-0000-4000-8000-000000000502',
    'authenticated', 'authenticated', 'catalog-suspended@example.test',
    '{}'::jsonb, '{"full_name":"Docente Suspendida"}'::jsonb, now(), now()
  );

update public.profiles
set account_status = 'suspended',
  status_changed_at = now(),
  status_changed_by = 'e0000000-0000-4000-8000-000000000501',
  status_reason = 'Prueba de autorización del catálogo'
where id = 'e0000000-0000-4000-8000-000000000502';

insert into public.modules (id, name, code)
values (
  'e0000000-0000-4000-8000-000000000101',
  'Anexos de prueba',
  'CATALOG_DOWNLOAD_TEST'
);

insert into public.documents (id, title, document_type)
values (
  'e0000000-0000-4000-8000-000000000201',
  'Anexo elegible de prueba',
  'ANEXO'
);

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values (
  'e0000000-0000-4000-8000-000000000202',
  'e0000000-0000-4000-8000-000000000201',
  1, 'tests/catalog/anexo.pdf', 'anexo-elegible.pdf', 'application/pdf',
  1024, 3, repeat('e', 64)
);

update public.documents
set current_version_id = 'e0000000-0000-4000-8000-000000000202'
where id = 'e0000000-0000-4000-8000-000000000201';

select private.set_document_ingestion_status(
  'e0000000-0000-4000-8000-000000000202', 'processing'
);
select private.set_document_ingestion_status(
  'e0000000-0000-4000-8000-000000000202', 'indexed'
);

update public.documents
set approval_status = 'ready',
  approved_version_id = 'e0000000-0000-4000-8000-000000000202'
where id = 'e0000000-0000-4000-8000-000000000201';

insert into public.document_modules (document_id, module_id)
values (
  'e0000000-0000-4000-8000-000000000201',
  'e0000000-0000-4000-8000-000000000101'
);

select is(
  (
    select document_version_id
    from public.authorize_chat_catalog_download(
      'e0000000-0000-4000-8000-000000000501',
      'e0000000-0000-4000-8000-000000000202'
    )
  ),
  'e0000000-0000-4000-8000-000000000202'::uuid,
  'An active teacher can authorize the exact approved indexed version'
);
select is(
  (
    select original_file_name || '/' || mime_type
    from public.authorize_chat_catalog_download(
      'e0000000-0000-4000-8000-000000000501',
      'e0000000-0000-4000-8000-000000000202'
    )
  ),
  'anexo-elegible.pdf/application/pdf',
  'The authorization returns safe attachment metadata'
);
select is(
  (select count(*) from public.chat_catalog_access_events),
  2::bigint,
  'Every successful catalog authorization is audited'
);
select throws_ok(
  $$select * from public.authorize_chat_catalog_download(
    'e0000000-0000-4000-8000-000000000502',
    'e0000000-0000-4000-8000-000000000202'
  )$$,
  'P0002',
  'Chat catalog document was not found',
  'A suspended teacher cannot authorize a catalog download'
);
select is(
  (select count(*) from public.chat_catalog_access_events),
  2::bigint,
  'Rejected user authorization creates no success audit'
);

update public.documents
set metadata = jsonb_build_object('demoSeed', true)
where id = 'e0000000-0000-4000-8000-000000000201';

select throws_ok(
  $$select * from public.authorize_chat_catalog_download(
    'e0000000-0000-4000-8000-000000000501',
    'e0000000-0000-4000-8000-000000000202'
  )$$,
  'P0002',
  'Chat catalog document was not found',
  'A demo document cannot be downloaded through the real catalog'
);
select is(
  (select count(*) from public.chat_catalog_access_events),
  2::bigint,
  'Rejected document authorization creates no success audit'
);

select * from finish();
rollback;
