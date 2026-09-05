begin;

select plan(34);

select has_type(
  'public',
  'document_situation',
  'Document situations have a dedicated constrained type'
);
select has_column(
  'public',
  'documents',
  'situation',
  'Documents store their administrative situation'
);
select has_column(
  'public',
  'documents',
  'replacement_document_id',
  'Documents can link the registered replacement'
);
select has_column(
  'public',
  'documents',
  'search_vector',
  'Documents expose an indexed administrative search vector'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.set_document_situation(uuid,public.document_situation,uuid,text,uuid,date,smallint,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot change document situations directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_document_library(text,smallint,text,text,uuid,uuid,public.document_situation,text,text,integer,integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot query the administrative library directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.set_document_situation(uuid,public.document_situation,uuid,text,uuid,date,smallint,text)'::regprocedure,
    'execute'
  ),
  'The server role can change document situations'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_document_library(text,smallint,text,text,uuid,uuid,public.document_situation,text,text,integer,integer)'::regprocedure,
    'execute'
  ),
  'The server role can query the administrative library'
);

select lives_ok(
  $$
    insert into public.modules (id, name, code, sort_order)
    values
      ('00000000-0000-0000-0000-000000009101', 'EvaluaciÃ³n docente', 'LIBRARY_ROOT', 1),
      ('00000000-0000-0000-0000-000000009102', 'Nombramiento docente', 'LIBRARY_CHILD', 1);

    update public.modules
    set parent_module_id = '00000000-0000-0000-0000-000000009101'
    where id = '00000000-0000-0000-0000-000000009102';

    select public.create_document_with_initial_version(
      '00000000-0000-0000-0000-000000009201',
      '00000000-0000-0000-0000-000000009301',
      'Licencia docente por salud',
      'LEY',
      'Minedu',
      2025::smallint,
      'LEY-100-2025',
      'ArtÃ­culo 10',
      '{"keywords":["licencia","salud"]}'::jsonb,
      array['00000000-0000-0000-0000-000000009102']::uuid[],
      'documents/00000000-0000-0000-0000-000000009201/versions/00000000-0000-0000-0000-000000009301.pdf',
      'licencia.pdf',
      1024::bigint,
      2,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '00000000-0000-0000-0000-000000009401'
    );

    select public.create_document_with_initial_version(
      '00000000-0000-0000-0000-000000009202',
      '00000000-0000-0000-0000-000000009302',
      'Reglamento reemplazante',
      'DECRETO_SUPREMO',
      'Minedu',
      2026::smallint,
      'DS-200-2026',
      null,
      '{"keywords":["reglamento"]}'::jsonb,
                  array['00000000-0000-0000-0000-000000009102']::uuid[],
      'documents/00000000-0000-0000-0000-000000009202/versions/00000000-0000-0000-0000-000000009302.pdf',
      'reglamento.pdf',
      2048::bigint,
      3,
      'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      '00000000-0000-0000-0000-000000009401'
    );
  $$,
  'Library fixtures preserve the existing atomic document lifecycle'
);

select is(
  (select situation from public.documents where id = '00000000-0000-0000-0000-000000009201'),
  'current'::public.document_situation,
  'New active documents are current by default'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_technical_status => 'pending_approval')
    where id in (
      '00000000-0000-0000-0000-000000009201',
      '00000000-0000-0000-0000-000000009202'
    )
  ),
  2::bigint,
  'Pending ingestion is derived as pending administrative processing'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_query => 'licencia')
    where id = '00000000-0000-0000-0000-000000009201'
  ),
  1::bigint,
  'Search finds title and keyword content without client-side filtering'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_query => 'LEY-100-2025')
    where id = '00000000-0000-0000-0000-000000009201'
  ),
  1::bigint,
  'Search finds document numbers'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_issuing_entity => 'minedu')
    where id in (
      '00000000-0000-0000-0000-000000009201',
      '00000000-0000-0000-0000-000000009202'
    )
  ),
  2::bigint,
  'Entity filtering is case-insensitive and server-side'
);
select is(
  (
    select count(*)
    from public.list_document_library(
      p_module_id => '00000000-0000-0000-0000-000000009101'
    )
    where id in (
      '00000000-0000-0000-0000-000000009201',
      '00000000-0000-0000-0000-000000009202'
    )
  ),
  2::bigint,
  'A root-module filter includes direct and descendant associations'
);
select is(
  (
    select count(*)
    from public.list_document_library(
      p_submodule_id => '00000000-0000-0000-0000-000000009102'
    )
    where id = '00000000-0000-0000-0000-000000009201'
  ),
  1::bigint,
  'A submodule filter matches the exact linked submodule'
);
select is(
  (
    select jsonb_array_length(module_associations)
    from public.list_document_library(p_query => 'licencia')
    where id = '00000000-0000-0000-0000-000000009201'
  ),
  1,
  'The library returns named module and submodule associations'
);
select is(
  (
    select total_count
    from public.list_document_library(p_issuing_entity => 'Minedu')
    limit 1
  ),
  2::bigint,
  'The library returns a real total independent from the page size'
);

select lives_ok(
  $$
    select private.set_document_ingestion_status(
      '00000000-0000-0000-0000-000000009301',
      'processing'
    );
    select private.set_document_ingestion_status(
      '00000000-0000-0000-0000-000000009301',
      'indexed'
    );
    select public.set_document_technical_status(
      '00000000-0000-0000-0000-000000009201',
      'ready',
      '00000000-0000-0000-0000-000000009401'
    );
  $$,
  'The established ingestion worker contract can complete indexing'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_technical_status => 'ready')
    where id = '00000000-0000-0000-0000-000000009201'
  ),
  1::bigint,
  'Indexed current versions are derived as ready'
);

select throws_ok(
  $$
    select public.set_document_situation(
      '00000000-0000-0000-0000-000000009201',
      'replaced',
      '00000000-0000-0000-0000-000000009401',
      'Nueva norma aplicable'
    )
  $$,
  '22023',
  'A replaced document requires a replacement date or year',
  'Replacement cannot omit both date and year'
);
select lives_ok(
  $$
    select public.set_document_situation(
      '00000000-0000-0000-0000-000000009201',
      'replaced',
      '00000000-0000-0000-0000-000000009401',
      'Nueva norma aplicable',
      '00000000-0000-0000-0000-000000009202',
      '2026-08-01'::date,
      2026::smallint,
      'Se conserva por trazabilidad'
    )
  $$,
  'A current document can be atomically marked as replaced'
);
select is(
  (select situation from public.documents where id = '00000000-0000-0000-0000-000000009201'),
  'replaced'::public.document_situation,
  'The replacement situation is persisted'
);
select is(
  (select publication_status from public.documents where id = '00000000-0000-0000-0000-000000009201'),
  'inactive'::public.document_publication_status,
  'A replaced document is excluded from RAG eligibility'
);
select is(
  (select replacement_document_id from public.documents where id = '00000000-0000-0000-0000-000000009201'),
  '00000000-0000-0000-0000-000000009202'::uuid,
  'The direct replacement link is retained'
);
select throws_ok(
  $$
    update public.documents
    set replacement_document_id = id
    where id = '00000000-0000-0000-0000-000000009201'
  $$,
  '23514',
  'A document cannot replace itself',
  'Direct self-replacement is rejected'
);
select throws_ok(
  $$
    update public.documents
    set
      situation = 'replaced',
      publication_status = 'inactive',
      deactivated_at = now(),
      deactivated_by = '00000000-0000-0000-0000-000000009401',
      deactivation_reason = 'Ciclo invÃ¡lido',
      replacement_document_id = '00000000-0000-0000-0000-000000009201',
      replacement_year = 2027,
      replacement_reason = 'Ciclo invÃ¡lido'
    where id = '00000000-0000-0000-0000-000000009202'
  $$,
  '23514',
  'A document replacement cycle is not allowed',
  'Replacement cycles are rejected by the data boundary'
);

select lives_ok(
  $$
    select public.set_document_publication_status(
      '00000000-0000-0000-0000-000000009201',
      true,
      null,
      '00000000-0000-0000-0000-000000009401'
    )
  $$,
  'The legacy activation endpoint remains compatible'
);
select is(
  (select situation from public.documents where id = '00000000-0000-0000-0000-000000009201'),
  'current'::public.document_situation,
  'Legacy activation restores the coherent current situation'
);
select lives_ok(
  $$
    select public.set_document_publication_status(
      '00000000-0000-0000-0000-000000009201',
      false,
      'Documento archivado',
      '00000000-0000-0000-0000-000000009401'
    )
  $$,
  'The legacy deactivation endpoint remains compatible'
);
select is(
  (select situation from public.documents where id = '00000000-0000-0000-0000-000000009201'),
  'archived'::public.document_situation,
  'Legacy deactivation maps to the archived situation'
);
select lives_ok(
  $$
    select public.logically_delete_document(
      '00000000-0000-0000-0000-000000009201',
      'Baja administrativa definitiva',
      '00000000-0000-0000-0000-000000009401'
    )
  $$,
  'Logical deletion remains compatible with the situation constraint'
);
select is(
  (
    select count(*)
    from public.list_document_library()
    where id = '00000000-0000-0000-0000-000000009201'
  ),
  0::bigint,
  'Logically deleted tombstones are excluded from the library'
);
select is(
  (
    select count(*)
    from public.document_versions
    where document_id = '00000000-0000-0000-0000-000000009201'
  ),
  1::bigint,
  'Immutable historical versions remain after archival and logical deletion'
);

select * from finish();
rollback;
