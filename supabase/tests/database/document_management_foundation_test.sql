begin;

select plan(34);

select has_table('public', 'modules', 'The modules table exists');
select has_table('public', 'documents', 'The documents table exists');
select has_table('public', 'document_versions', 'The document versions table exists');
select has_table('public', 'document_modules', 'The document/module relation exists');
select has_table('public', 'document_audit_events', 'The document audit table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.modules'::regclass),
  'RLS is enabled for modules'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.documents'::regclass),
  'RLS is enabled for documents'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.document_versions'::regclass),
  'RLS is enabled for document versions'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.document_modules'::regclass),
  'RLS is enabled for document/module relations'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.document_audit_events'::regclass),
  'RLS is enabled for document audit events'
);

select ok(
  not has_table_privilege('authenticated', 'public.modules', 'select'),
  'Authenticated clients cannot read modules directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.documents', 'select'),
  'Authenticated clients cannot read documents directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.document_versions', 'select'),
  'Authenticated clients cannot read document versions directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.document_modules', 'select'),
  'Authenticated clients cannot read document/module relations directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.document_audit_events', 'select'),
  'Authenticated clients cannot read document audit events directly'
);
select ok(
  not has_table_privilege('public', 'public.modules', 'select'),
  'The PostgreSQL public role cannot read modules'
);
select ok(
  not has_table_privilege('public', 'public.documents', 'select'),
  'The PostgreSQL public role cannot read documents'
);
select ok(
  not has_table_privilege('public', 'public.document_versions', 'select'),
  'The PostgreSQL public role cannot read document versions'
);
select ok(
  not has_table_privilege('public', 'public.document_modules', 'select'),
  'The PostgreSQL public role cannot read document/module relations'
);
select ok(
  not has_table_privilege('public', 'public.document_audit_events', 'select'),
  'The PostgreSQL public role cannot read document audit events'
);

select is(
  (select public from storage.buckets where id = 'normative-documents'),
  false,
  'The normative document bucket is private'
);
select is(
  (select file_size_limit from storage.buckets where id = 'normative-documents'),
  52_428_800::bigint,
  'The normative document bucket is limited to 50 MiB'
);
select is(
  (select allowed_mime_types from storage.buckets where id = 'normative-documents'),
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'text/markdown'
  ]::text[],
  'The normative document bucket accepts PDF, Word and Markdown'
);
select is(
  (
    select count(*)
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'Normative documents deny anonymous Storage access',
        'Normative documents deny direct authenticated Storage access'
      )
  ),
  2::bigint,
  'Storage has explicit direct-access denial policies for the bucket'
);

insert into public.modules (id, name, code)
values
  ('00000000-0000-0000-0000-000000000101', 'Módulo raíz de prueba', 'ROOT_TEST'),
  ('00000000-0000-0000-0000-000000000102', 'Módulo hijo de prueba', 'CHILD_TEST');

update public.modules
set parent_module_id = '00000000-0000-0000-0000-000000000101'
where id = '00000000-0000-0000-0000-000000000102';

select throws_ok(
  $$
    update public.modules
    set parent_module_id = '00000000-0000-0000-0000-000000000102'
    where id = '00000000-0000-0000-0000-000000000101'
  $$,
  'P0001',
  'A module cannot be assigned below one of its descendants',
  'The module hierarchy rejects cycles'
);

insert into public.documents (id, title, document_type)
values ('00000000-0000-0000-0000-000000000201', 'Documento de prueba', 'NORMATIVE');

insert into public.document_versions (
  id,
  document_id,
  version_number,
  storage_path,
  original_file_name,
  mime_type,
  file_size_bytes,
  page_count,
  sha256
)
values (
  '00000000-0000-0000-0000-000000000202',
  '00000000-0000-0000-0000-000000000201',
  1,
  'tests/00000000-0000-0000-0000-000000000201/v1.pdf',
  'documento-prueba.pdf',
  'application/pdf',
  1024,
  1,
  repeat('a', 64)
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-000000000202'
where id = '00000000-0000-0000-0000-000000000201';

select is(
  (
    select current_version_id
    from public.documents
    where id = '00000000-0000-0000-0000-000000000201'
  ),
  '00000000-0000-0000-0000-000000000202'::uuid,
  'The logical document points to its immutable current version'
);
select is(
  (
    select ingestion_status
    from public.document_versions
    where id = '00000000-0000-0000-0000-000000000202'
  ),
  'pending'::public.document_ingestion_status,
  'A new version starts pending without running RAG processing'
);

select lives_ok(
  'set constraints documents_require_current_version_when_active immediate',
  'An active document can be committed after its current version is assigned'
);

set constraints documents_require_current_version_when_active deferred;

select lives_ok(
  'set constraints documents_current_version_belongs_to_document_fkey immediate',
  'A document can point to one of its own versions'
);

select throws_ok(
  $$
    update public.document_versions
    set original_file_name = 'archivo-mutado.pdf'
    where id = '00000000-0000-0000-0000-000000000202'
  $$,
  'P0001',
  'Document versions are immutable; create a new version instead',
  'Document versions cannot be altered in place'
);

select throws_ok(
  $$
    update public.document_versions
    set ingestion_updated_at = now() + interval '1 minute'
    where id = '00000000-0000-0000-0000-000000000202'
  $$,
  'P0001',
  'Document ingestion state is controlled by the ingestion worker',
  'Hito 3 still rejects direct mutation of pending ingestion metadata'
);

insert into public.documents (id, title, document_type)
values ('00000000-0000-0000-0000-000000000204', 'Segundo documento de prueba', 'NORMATIVE');

insert into public.document_versions (
  id,
  document_id,
  version_number,
  storage_path,
  original_file_name,
  mime_type,
  file_size_bytes,
  page_count,
  sha256
)
values (
  '00000000-0000-0000-0000-000000000205',
  '00000000-0000-0000-0000-000000000204',
  1,
  'tests/00000000-0000-0000-0000-000000000204/v1.pdf',
  'segundo-documento-prueba.pdf',
  'application/pdf',
  1024,
  1,
  repeat('b', 64)
);

select throws_ok(
  'set constraints documents_require_current_version_when_active immediate',
  'P0001',
  'An active document must reference a current version',
  'An active document cannot be committed without a current version'
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-000000000205'
where id = '00000000-0000-0000-0000-000000000204';

select throws_ok(
  $$
    insert into public.document_audit_events (id, document_id, document_version_id, action)
    values (
      '00000000-0000-0000-0000-000000000206',
      '00000000-0000-0000-0000-000000000201',
      '00000000-0000-0000-0000-000000000205',
      'created'
    )
  $$,
  '23503',
  'insert or update on table "document_audit_events" violates foreign key constraint "document_audit_events_version_belongs_to_document_fkey"',
  'An audit event cannot cite a version from another document'
);

insert into public.document_audit_events (id, document_id, action)
values (
  '00000000-0000-0000-0000-000000000203',
  '00000000-0000-0000-0000-000000000201',
  'created'
);

select throws_ok(
  $$
    update public.document_audit_events
    set action = 'metadata_updated'
    where id = '00000000-0000-0000-0000-000000000203'
  $$,
  'P0001',
  'Document audit events are append-only',
  'Document audit events cannot be changed'
);

select * from finish();

rollback;
