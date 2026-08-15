begin;

select plan(30);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_document_with_initial_version(uuid,uuid,text,text,text,smallint,text,text,jsonb,uuid[],text,text,bigint,integer,text,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document creation RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.add_document_version(uuid,uuid,text,text,bigint,integer,text,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document version RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.update_document_metadata(uuid,jsonb,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document metadata RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.set_document_publication_status(uuid,boolean,text,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document status RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.logically_delete_document(uuid,text,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document logical-delete RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.link_document_module(uuid,uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document-link RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.unlink_document_module(uuid,uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document-unlink RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.record_document_download_url(uuid,uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke document download-audit RPC'
);

insert into public.modules (id, name, code)
values
  ('00000000-0000-0000-0000-000000000401', 'Módulo documental A', 'DOC_MODULE_A'),
  ('00000000-0000-0000-0000-000000000402', 'Módulo documental B', 'DOC_MODULE_B');

select lives_ok(
  $$
    select public.create_document_with_initial_version(
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000601',
      'Documento RPC de prueba',
      'NORMATIVE',
      'Entidad de prueba',
      2026::smallint,
      'RES-001',
      'Artículo 1',
      '{"scope":"test"}'::jsonb,
      array['00000000-0000-0000-0000-000000000401']::uuid[],
      'documents/00000000-0000-0000-0000-000000000501/versions/00000000-0000-0000-0000-000000000601.pdf',
      'documento-prueba.pdf',
      1024::bigint,
      1,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Server operation atomically creates document and initial version'
);

select is(
  (select current_version_id from public.documents where id = '00000000-0000-0000-0000-000000000501'),
  '00000000-0000-0000-0000-000000000601'::uuid,
  'Initial version becomes the current document version'
);
select is(
  (select count(*) from public.document_modules where document_id = '00000000-0000-0000-0000-000000000501'),
  1::bigint,
  'Creation persists the requested module link'
);
select is(
  (select count(*) from public.document_audit_events where document_id = '00000000-0000-0000-0000-000000000501' and action = 'created'),
  1::bigint,
  'Creation persists an audit event'
);
select is(
  (select count(*) from public.document_audit_events where document_id = '00000000-0000-0000-0000-000000000501' and action = 'module_linked'),
  1::bigint,
  'Creation audits the initial module link'
);

select lives_ok(
  $$
    select public.add_document_version(
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000602',
      'documents/00000000-0000-0000-0000-000000000501/versions/00000000-0000-0000-0000-000000000602.pdf',
      'documento-prueba-v2.pdf',
      2048::bigint,
      2,
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Server operation atomically creates a replacement version'
);
select is(
  (select version_number from public.document_versions where id = '00000000-0000-0000-0000-000000000602'),
  2,
  'Replacement version receives the next immutable number'
);
select is(
  (select current_version_id from public.documents where id = '00000000-0000-0000-0000-000000000501'),
  '00000000-0000-0000-0000-000000000602'::uuid,
  'Replacement version becomes current atomically'
);
select is(
  (select count(*) from public.document_audit_events where document_id = '00000000-0000-0000-0000-000000000501' and action = 'version_added'),
  1::bigint,
  'Version creation is audited'
);

select lives_ok(
  $$
    select public.update_document_metadata(
      '00000000-0000-0000-0000-000000000501',
      '{"title":"Documento actualizado","metadata":{"scope":"updated"}}'::jsonb,
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Metadata update is atomic with its audit event'
);
select is(
  (select title from public.documents where id = '00000000-0000-0000-0000-000000000501'),
  'Documento actualizado',
  'Metadata RPC updates the requested title'
);
select is(
  (select count(*) from public.document_audit_events where document_id = '00000000-0000-0000-0000-000000000501' and action = 'metadata_updated'),
  1::bigint,
  'Metadata update is audited'
);

select lives_ok(
  $$
    select public.record_document_download_url(
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000602',
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Server operation records short-lived download URL generation'
);
select is(
  (select count(*) from public.document_audit_events where document_id = '00000000-0000-0000-0000-000000000501' and action = 'download_url_generated'),
  1::bigint,
  'Download URL generation is audited with the selected immutable version'
);

select lives_ok(
  $$
    select public.link_document_module(
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000402',
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Server operation links an additional live module'
);
select is(
  (select count(*) from public.document_modules where document_id = '00000000-0000-0000-0000-000000000501'),
  2::bigint,
  'Second module link exists'
);
select lives_ok(
  $$
    select public.unlink_document_module(
      '00000000-0000-0000-0000-000000000501',
      '00000000-0000-0000-0000-000000000402',
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Server operation unlinks a module and writes audit'
);
select is(
  (select count(*) from public.document_audit_events where document_id = '00000000-0000-0000-0000-000000000501' and action = 'module_unlinked'),
  1::bigint,
  'Module unlink is audited'
);

select lives_ok(
  $$
    select public.set_document_publication_status(
      '00000000-0000-0000-0000-000000000501',
      false,
      'Revisión normativa',
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Document can be deactivated with an audit reason'
);
select is(
  (select publication_status from public.documents where id = '00000000-0000-0000-0000-000000000501'),
  'inactive'::public.document_publication_status,
  'Document publication status is inactive'
);

select lives_ok(
  $$
    select public.logically_delete_document(
      '00000000-0000-0000-0000-000000000501',
      'Documento retirado',
      '00000000-0000-0000-0000-000000000701'
    )
  $$,
  'Document can be logically deleted without deleting immutable versions'
);
select ok(
  (select is_deleted from public.documents where id = '00000000-0000-0000-0000-000000000501'),
  'Logical deletion marks the document without physical deletion'
);

select * from finish();
rollback;
