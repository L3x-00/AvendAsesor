begin;

select plan(67);

select has_type('public', 'document_approval_status', 'Technical approval has a constrained type');
select has_type('public', 'document_archive_reason', 'Archive reasons have a constrained type');
select has_column('public', 'documents', 'approved_version_id', 'Documents retain the last approved version');
select has_column('public', 'documents', 'archive_reason_code', 'Documents retain a governed archive reason');
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_governed_document_with_initial_version(uuid,uuid,text,text,text,smallint,text,text,jsonb,uuid[],text,text,bigint,integer,text,uuid,public.document_situation,text,uuid,date,smallint,text,public.document_archive_reason,text,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot bypass the document API'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_governed_document_with_initial_version(uuid,uuid,text,text,text,smallint,text,text,jsonb,uuid[],text,text,bigint,integer,text,uuid,public.document_situation,text,uuid,date,smallint,text,public.document_archive_reason,text,text)'::regprocedure,
    'execute'
  ),
  'The server role can use the governed document transaction'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_document_chunks_by_situation(extensions.vector,text,uuid,real,integer,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke governed retrieval directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.search_document_chunks_by_situation(extensions.vector,text,uuid,real,integer,text)'::regprocedure,
    'execute'
  ),
  'The server role can invoke governed retrieval'
);

select is(
  (select count(*) from public.modules where parent_module_id is null and not is_deleted),
  7::bigint,
  'A clean database starts with exactly seven canonical main modules'
);
select is(
  (
    select count(*)
    from public.modules as child
    join public.modules as parent on parent.id = child.parent_module_id
    where parent.code = 'EVALUACION_DOCENTE' and not child.is_deleted
  ),
  8::bigint,
  'Evaluacion docente starts with the eight required submodules'
);

insert into public.modules (id, name, code, sort_order)
values
  ('35000000-0000-0000-0000-000000000101', 'Modulo QA gobernado', 'QA_GOV_ROOT', 900),
  ('35000000-0000-0000-0000-000000000102', 'Submodulo QA uno', 'QA_GOV_CHILD_ONE', 10),
  ('35000000-0000-0000-0000-000000000103', 'Submodulo QA dos', 'QA_GOV_CHILD_TWO', 20),
  ('35000000-0000-0000-0000-000000000104', 'Modulo QA sin submodulos', 'QA_GOV_LEAF_ROOT', 910);

update public.modules
set parent_module_id = '35000000-0000-0000-0000-000000000101'
where id in (
  '35000000-0000-0000-0000-000000000102',
  '35000000-0000-0000-0000-000000000103'
);

select throws_ok(
  $$
    update public.modules
    set parent_module_id = id
    where id = '35000000-0000-0000-0000-000000000104'
  $$,
  'P0001',
  'A module cannot be its own parent',
  'The database rejects a self-parent hierarchy'
);

select throws_ok(
  $$
    insert into public.modules (id, parent_module_id, name, code)
    values (
      '35000000-0000-0000-0000-000000000105',
      '35000000-0000-0000-0000-000000000102',
      'Nivel QA invalido',
      'QA_GOV_THIRD_LEVEL'
    )
  $$,
  '23514',
  'A submodule cannot contain another submodule',
  'The database rejects a third hierarchy level'
);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '35000000-0000-0000-0000-000000000201',
      p_version_id := '35000000-0000-0000-0000-000000000301',
      p_title := 'Ley QA vigente multiasociada',
      p_document_type := 'LEY',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2026::smallint,
      p_resolution_number := 'LEY-QA-001',
      p_article_reference := 'Articulo 1',
      p_metadata := '{"specificDependency":"DIGEDD","additionalDetail":"Direccion docente"}',
      p_module_ids := array[
        '35000000-0000-0000-0000-000000000102',
        '35000000-0000-0000-0000-000000000103'
      ]::uuid[],
      p_storage_path := 'qa-governance/document-201/v1.pdf',
      p_original_file_name := 'qa-vigente.pdf',
      p_file_size_bytes := 2048::bigint,
      p_page_count := 3,
      p_sha256 := repeat('1', 64),
      p_actor_id := '35000000-0000-0000-0000-000000000901'
    )
  $$,
  'One governed transaction creates a document and two associations'
);
select is(
  (select count(*) from public.documents where id = '35000000-0000-0000-0000-000000000201'),
  1::bigint,
  'A multi-associated document has one physical document row'
);
select is(
  (select count(*) from public.document_versions where document_id = '35000000-0000-0000-0000-000000000201'),
  1::bigint,
  'A multi-associated document has one physical PDF version row'
);
select is(
  (select count(*) from public.document_modules where document_id = '35000000-0000-0000-0000-000000000201'),
  2::bigint,
  'The same document is related to both submodules'
);
select throws_ok(
  $$
    insert into public.document_modules (document_id, module_id)
    values (
      '35000000-0000-0000-0000-000000000201',
      '35000000-0000-0000-0000-000000000101'
    )
  $$,
  '23514',
  'Documents must be linked to a submodule when submodules exist',
  'A parent with submodules cannot receive a direct document association'
);
select is(
  (
    select document_count
    from public.list_module_summaries('all')
    where id = '35000000-0000-0000-0000-000000000101'
  ),
  1::bigint,
  'The root summary counts a multi-associated document once'
);
select is(
  (
    select document_count
    from public.list_module_summaries('all')
    where id = '35000000-0000-0000-0000-000000000102'
  ),
  1::bigint,
  'The submodule summary counts its real relation'
);
select lives_ok(
  $$ select public.unlink_document_module(
    '35000000-0000-0000-0000-000000000201',
    '35000000-0000-0000-0000-000000000103',
    '35000000-0000-0000-0000-000000000901'
  ) $$,
  'An association can be removed independently'
);
select is(
  (select count(*) from public.document_modules where document_id = '35000000-0000-0000-0000-000000000201'),
  1::bigint,
  'Removing an association does not duplicate or delete the document'
);
select throws_ok(
  $$ select public.unlink_document_module(
    '35000000-0000-0000-0000-000000000201',
    '35000000-0000-0000-0000-000000000102',
    '35000000-0000-0000-0000-000000000901'
  ) $$,
  '23514',
  'A document must retain at least one module association',
  'The last association cannot be removed'
);
select lives_ok(
  $$ select public.link_document_module(
    '35000000-0000-0000-0000-000000000201',
    '35000000-0000-0000-0000-000000000103',
    '35000000-0000-0000-0000-000000000901'
  ) $$,
  'A second association can be restored without copying the PDF'
);
select is(
  (select count(*) from public.document_modules where document_id = '35000000-0000-0000-0000-000000000201'),
  2::bigint,
  'Restored multi-association still references one document'
);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '35000000-0000-0000-0000-000000000204',
      p_version_id := '35000000-0000-0000-0000-000000000305',
      p_title := 'PDF QA ilegible',
      p_document_type := 'INFORME',
      p_issuing_entity := 'UGEL',
      p_issuance_year := 2025::smallint,
      p_resolution_number := null,
      p_article_reference := null,
      p_metadata := '{"specificDependency":"UGEL 05"}',
      p_module_ids := array['35000000-0000-0000-0000-000000000104']::uuid[],
      p_storage_path := 'qa-governance/document-204/v1.pdf',
      p_original_file_name := 'qa-ilegible.pdf',
      p_file_size_bytes := 512::bigint,
      p_page_count := 1,
      p_sha256 := repeat('4', 64),
      p_actor_id := '35000000-0000-0000-0000-000000000901',
      p_processing_error := 'El PDF no contiene una estructura legible.'
    )
  $$,
  'An unreadable PDF is retained for diagnosis in a leaf root module'
);
select is(
  (select count(*) from public.document_modules where document_id = '35000000-0000-0000-0000-000000000204' and module_id = '35000000-0000-0000-0000-000000000104'),
  1::bigint,
  'A root without submodules accepts a direct association'
);
select throws_ok(
  $$
    insert into public.modules (id, parent_module_id, name, code)
    values (
      '35000000-0000-0000-0000-000000000106',
      '35000000-0000-0000-0000-000000000104',
      'Submodulo posterior invalido',
      'QA_GOV_CHILD_AFTER_DOCUMENT'
    )
  $$,
  '23514',
  'Move directly associated documents before creating a submodule',
  'Creating a submodule cannot strand documents on its parent'
);
select is(
  (select ingestion_status::text from public.document_versions where id = '35000000-0000-0000-0000-000000000305'),
  'failed',
  'Unreadable content receives the automatic Error processing state'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_technical_status => 'error')
    where id = '35000000-0000-0000-0000-000000000204'
  ),
  1::bigint,
  'The library exposes automatic processing failures as Error'
);
select throws_ok(
  $$ select 'error'::public.document_approval_status $$,
  '22P02',
  'invalid input value for enum document_approval_status: "error"',
  'Error cannot be selected as a manual approval status'
);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '35000000-0000-0000-0000-000000000202',
      p_version_id := '35000000-0000-0000-0000-000000000303',
      p_title := 'Resolucion QA reemplazante vigente',
      p_document_type := 'RESOLUCION_VICEMINISTERIAL',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2026::smallint,
      p_resolution_number := 'RVM-QA-2026',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DIGEDD"}',
      p_module_ids := array['35000000-0000-0000-0000-000000000102']::uuid[],
      p_storage_path := 'qa-governance/document-202/v1.pdf',
      p_original_file_name := 'qa-reemplazante.pdf',
      p_file_size_bytes := 3000::bigint,
      p_page_count := 4,
      p_sha256 := repeat('2', 64),
      p_actor_id := '35000000-0000-0000-0000-000000000901'
    );
    select public.create_governed_document_with_initial_version(
      p_document_id := '35000000-0000-0000-0000-000000000203',
      p_version_id := '35000000-0000-0000-0000-000000000304',
      p_title := 'Directiva QA para archivar',
      p_document_type := 'DIRECTIVA',
      p_issuing_entity := 'DRE_GRE',
      p_issuance_year := 2024::smallint,
      p_resolution_number := 'DIR-QA-2024',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DRE Lima"}',
      p_module_ids := array['35000000-0000-0000-0000-000000000102']::uuid[],
      p_storage_path := 'qa-governance/document-203/v1.pdf',
      p_original_file_name := 'qa-archivar.pdf',
      p_file_size_bytes := 4000::bigint,
      p_page_count := 5,
      p_sha256 := repeat('3', 64),
      p_actor_id := '35000000-0000-0000-0000-000000000901'
    );
    select public.create_governed_document_with_initial_version(
      p_document_id := '35000000-0000-0000-0000-000000000205',
      p_version_id := '35000000-0000-0000-0000-000000000306',
      p_title := 'Ley QA historica reemplazada',
      p_document_type := 'LEY',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2020::smallint,
      p_resolution_number := 'LEY-QA-OLD',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DIGEDD"}',
      p_module_ids := array['35000000-0000-0000-0000-000000000102']::uuid[],
      p_storage_path := 'qa-governance/document-205/v1.pdf',
      p_original_file_name := 'qa-historica.pdf',
      p_file_size_bytes := 2500::bigint,
      p_page_count := 2,
      p_sha256 := repeat('5', 64),
      p_actor_id := '35000000-0000-0000-0000-000000000901'
    );
  $$,
  'Additional current documents are created for lifecycle and RAG verification'
);
select lives_ok(
  $$
    select private.set_document_ingestion_status(version_id, 'processing')
    from (values
      ('35000000-0000-0000-0000-000000000301'::uuid),
      ('35000000-0000-0000-0000-000000000303'::uuid),
      ('35000000-0000-0000-0000-000000000304'::uuid),
      ('35000000-0000-0000-0000-000000000306'::uuid)
    ) as versions(version_id);
    select private.set_document_ingestion_status(version_id, 'indexed')
    from (values
      ('35000000-0000-0000-0000-000000000301'::uuid),
      ('35000000-0000-0000-0000-000000000303'::uuid),
      ('35000000-0000-0000-0000-000000000304'::uuid),
      ('35000000-0000-0000-0000-000000000306'::uuid)
    ) as versions(version_id);
    select public.set_document_technical_status(document_id, 'ready', '35000000-0000-0000-0000-000000000901')
    from (values
      ('35000000-0000-0000-0000-000000000201'::uuid),
      ('35000000-0000-0000-0000-000000000202'::uuid),
      ('35000000-0000-0000-0000-000000000203'::uuid),
      ('35000000-0000-0000-0000-000000000205'::uuid)
    ) as documents(document_id);
  $$,
  'Indexed PDFs can be approved through the governed technical transition'
);
select is(
  (select count(*) from public.documents where approval_status = 'ready' and id in (
    '35000000-0000-0000-0000-000000000201',
    '35000000-0000-0000-0000-000000000202',
    '35000000-0000-0000-0000-000000000203',
    '35000000-0000-0000-0000-000000000205'
  )),
  4::bigint,
  'All indexed QA documents become ready'
);
select is(
  (public.list_document_value_suggestions() -> 'specificDependencies' ->> 0),
  'DIGEDD',
  'Frequently reused dependencies are ranked first'
);
select is(
  (
    select count(*)
    from public.list_document_library(
      p_query => 'vigente multiasociada',
      p_issuance_year => 2026::smallint,
      p_document_type => 'LEY',
      p_issuing_entity => 'minedu',
      p_module_id => '35000000-0000-0000-0000-000000000101'::uuid,
      p_submodule_id => '35000000-0000-0000-0000-000000000103'::uuid,
      p_situation => 'current'::public.document_situation,
      p_technical_status => 'ready'
    )
    where id = '35000000-0000-0000-0000-000000000201'
  ),
  1::bigint,
  'Search and all document filters compose against persisted data'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_query => 'DRE Lima')
    where id = '35000000-0000-0000-0000-000000000203'
  ),
  1::bigint,
  'Library search includes governed dependency and custom metadata values'
);
select lives_ok(
  $$
    select count(*)
    from unnest(array[
      'newest', 'oldest', 'year', 'title', 'upload_date', 'document_type',
      'issuing_entity', 'situation', 'technical_status', 'module'
    ]) as sorts(sort_key)
    cross join lateral public.list_document_library(
      p_sort => sorts.sort_key,
      p_limit => 1
    ) as listed
  $$,
  'Every requested library ordering is accepted server-side'
);

select lives_ok(
  $$ select public.add_governed_document_version(
    '35000000-0000-0000-0000-000000000201',
    '35000000-0000-0000-0000-000000000302',
    'qa-governance/document-201/v2.pdf',
    'qa-vigente-v2.pdf',
    4096::bigint,
    6,
    repeat('6', 64),
    '35000000-0000-0000-0000-000000000901'
  ) $$,
  'A new version is added without replacing historical rows'
);
select is(
  (select count(*) from public.document_versions where document_id = '35000000-0000-0000-0000-000000000201'),
  2::bigint,
  'Version history retains both PDF versions'
);
select is(
  (select approved_version_id from public.documents where id = '35000000-0000-0000-0000-000000000201'),
  '35000000-0000-0000-0000-000000000301'::uuid,
  'A pending new version leaves the previously approved PDF available'
);
select lives_ok(
  $$
    insert into public.document_chunks (
      id, document_id, document_version_id, chunk_index, chunk_content,
      token_count, page_start, page_end, section_title, embedding
    ) values
      ('35000000-0000-0000-0000-000000000401', '35000000-0000-0000-0000-000000000201', '35000000-0000-0000-0000-000000000301', 0, 'Contenido QA vigente version aprobada.', 7, 1, 1, 'QA vigente', array_fill(0.01::real, array[1536])::extensions.vector),
      ('35000000-0000-0000-0000-000000000402', '35000000-0000-0000-0000-000000000201', '35000000-0000-0000-0000-000000000302', 0, 'Contenido QA version nueva pendiente.', 7, 1, 1, 'QA pendiente', array_fill(0.01::real, array[1536])::extensions.vector),
      ('35000000-0000-0000-0000-000000000403', '35000000-0000-0000-0000-000000000202', '35000000-0000-0000-0000-000000000303', 0, 'Contenido QA de la norma reemplazante.', 7, 1, 1, 'QA reemplazante', array_fill(0.01::real, array[1536])::extensions.vector),
      ('35000000-0000-0000-0000-000000000404', '35000000-0000-0000-0000-000000000203', '35000000-0000-0000-0000-000000000304', 0, 'Contenido QA archivado por duplicidad.', 7, 1, 1, 'QA archivado', array_fill(0.01::real, array[1536])::extensions.vector),
      ('35000000-0000-0000-0000-000000000405', '35000000-0000-0000-0000-000000000205', '35000000-0000-0000-0000-000000000306', 0, 'Contenido QA historico reemplazado.', 7, 1, 1, 'QA historico', array_fill(0.01::real, array[1536])::extensions.vector);
  $$,
  'Version-bound chunks are prepared for all retrieval situations'
);
select lives_ok(
  $$ select public.set_governed_document_situation(
    p_document_id := '35000000-0000-0000-0000-000000000205'::uuid,
    p_situation := 'replaced'::public.document_situation,
    p_actor_id := '35000000-0000-0000-0000-000000000901'::uuid,
    p_reason := 'Sustituida por la RVM QA 2026',
    p_replacement_document_id := '35000000-0000-0000-0000-000000000202'::uuid,
    p_replacement_year := 2026::smallint,
    p_observation := 'Se conserva para comparaciones historicas.'
  ) $$,
  'A replaced document links to its registered replacement'
);
select is(
  (select replacement_document_id from public.documents where id = '35000000-0000-0000-0000-000000000205'),
  '35000000-0000-0000-0000-000000000202'::uuid,
  'The replacement relation is persisted'
);
select throws_ok(
  $$ select public.set_governed_document_situation(
    p_document_id := '35000000-0000-0000-0000-000000000202'::uuid,
    p_situation := 'replaced'::public.document_situation,
    p_actor_id := '35000000-0000-0000-0000-000000000901'::uuid,
    p_reason := 'Ciclo de reemplazo inválido',
    p_replacement_document_id := '35000000-0000-0000-0000-000000000205'::uuid,
    p_replacement_year := 2027::smallint
  ) $$,
  '23503',
  'Replacement document is unavailable',
  'A replaced or archived document cannot become a replacement target or form a cycle'
);
select lives_ok(
  $$ select public.set_governed_document_situation(
    p_document_id := '35000000-0000-0000-0000-000000000203',
    p_situation := 'archived',
    p_actor_id := '35000000-0000-0000-0000-000000000901',
    p_observation := 'Duplicado comprobado durante QA.',
    p_archive_reason_code := 'DUPLICATE'
  ) $$,
  'A duplicate can be archived without a replacement document'
);
select ok(
  (
    select archive_reason_code = 'DUPLICATE'
      and replacement_document_id is null
      and replacement_year is null
    from public.documents
    where id = '35000000-0000-0000-0000-000000000203'
  ),
  'A non-replacement archive reason never requires replacement data'
);
select is(
  (
    select details ->> 'archiveReasonCode'
    from public.document_audit_events
    where document_id = '35000000-0000-0000-0000-000000000203'
      and action = 'deactivated'
    order by occurred_at desc, id desc
    limit 1
  ),
  'DUPLICATE',
  'The archive reason remains visible in append-only history'
);
select set_eq(
  $$
    select document_id
    from public.search_document_chunks_by_situation(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'contenido QA',
      '35000000-0000-0000-0000-000000000101',
      0.70,
      10,
      'current'
    )
  $$,
  $$ values
    ('35000000-0000-0000-0000-000000000201'::uuid),
    ('35000000-0000-0000-0000-000000000202'::uuid)
  $$,
  'Current retrieval admits only ready vigente documents'
);
select set_eq(
  $$
    select document_id
    from public.search_document_chunks_by_situation(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'antecedentes contenido QA',
      '35000000-0000-0000-0000-000000000101',
      0.70,
      10,
      'historical'
    )
  $$,
  $$ values
    ('35000000-0000-0000-0000-000000000201'::uuid),
    ('35000000-0000-0000-0000-000000000202'::uuid),
    ('35000000-0000-0000-0000-000000000205'::uuid)
  $$,
  'Historical retrieval adds replaced material but excludes archived material'
);
select set_eq(
  $$
    select document_id
    from public.search_document_chunks_by_situation(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'archivo historico contenido QA',
      '35000000-0000-0000-0000-000000000101',
      0.70,
      10,
      'archived_explicit'
    )
  $$,
  $$ values
    ('35000000-0000-0000-0000-000000000201'::uuid),
    ('35000000-0000-0000-0000-000000000202'::uuid),
    ('35000000-0000-0000-0000-000000000203'::uuid),
    ('35000000-0000-0000-0000-000000000205'::uuid)
  $$,
  'Explicit archival retrieval can include vigente, replaced and archived material'
);
select results_eq(
  $$
    select document_version_id
    from public.search_document_chunks_by_situation(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'contenido QA vigente',
      '35000000-0000-0000-0000-000000000101',
      0.70,
      10,
      'current'
    )
    where document_id = '35000000-0000-0000-0000-000000000201'
  $$,
  $$ values ('35000000-0000-0000-0000-000000000301'::uuid) $$,
  'Retrieval cites the approved old version and never the pending new version'
);
select throws_ok(
  $$
    select *
    from public.search_document_chunks_by_situation(
      array_fill(0.01::real, array[1536])::extensions.vector,
      null,
      '35000000-0000-0000-0000-000000000101',
      0.70,
      10,
      'current'
    )
  $$,
  '22023',
  'Invalid document search parameters',
  'RAG retrieval rejects a null query instead of bypassing validation'
);
insert into public.chat_conversations (id, user_id, selected_module_id, title)
values (
  '35000000-0000-0000-0000-000000000501',
  '35000000-0000-0000-0000-000000000901',
  '35000000-0000-0000-0000-000000000101',
  'Consulta QA sobre alcance del modulo principal'
);
insert into public.chat_messages (id, conversation_id, role, content)
values (
  '35000000-0000-0000-0000-000000000502',
  '35000000-0000-0000-0000-000000000501',
  'user',
  'Cual es la situacion vigente para este modulo?'
);
select throws_ok(
  $$
    select public.complete_chat_turn(
      p_user_id := '35000000-0000-0000-0000-000000000901',
      p_conversation_id := '35000000-0000-0000-0000-000000000501',
      p_user_message_id := '35000000-0000-0000-0000-000000000502',
      p_answer_role := 'assistant',
      p_answer := 'Una respuesta sin citas no debe persistirse.',
      p_sources := null,
      p_top_relevance_score := null
    )
  $$,
  '22023',
  'Chat sources must be an array',
  'An assistant reply cannot bypass source validation with null JSON'
);
select lives_ok(
  $$
    select public.complete_chat_turn(
      p_user_id := '35000000-0000-0000-0000-000000000901',
      p_conversation_id := '35000000-0000-0000-0000-000000000501',
      p_user_message_id := '35000000-0000-0000-0000-000000000502',
      p_answer_role := 'assistant',
      p_answer := 'La respuesta vigente esta sustentada por la fuente [1].',
      p_sources := '[{"sourceId":"35000000-0000-0000-0000-000000000503","chunkId":"35000000-0000-0000-0000-000000000401","moduleId":"35000000-0000-0000-0000-000000000101","relevanceScore":0.99}]'::jsonb,
      p_top_relevance_score := 0.99
    )
  $$,
  'Chat completion accepts child-associated evidence selected through its main module'
);
select ok(
  (
    select source.module_id = '35000000-0000-0000-0000-000000000101'
      and source.document_situation = 'current'
      and source.document_version_id = '35000000-0000-0000-0000-000000000301'
    from public.chat_message_sources as source
    where source.id = '35000000-0000-0000-0000-000000000503'
  ),
  'Persisted chat evidence identifies the main module, vigente situation and approved version'
);
insert into public.chat_conversations (id, user_id, selected_module_id, title)
values
  (
    '35000000-0000-0000-0000-000000000511',
    '35000000-0000-0000-0000-000000000901',
    '35000000-0000-0000-0000-000000000101',
    'Consulta QA historica'
  ),
  (
    '35000000-0000-0000-0000-000000000521',
    '35000000-0000-0000-0000-000000000901',
    '35000000-0000-0000-0000-000000000101',
    'Consulta QA de archivo explicito'
  );
insert into public.chat_messages (id, conversation_id, role, content)
values
  (
    '35000000-0000-0000-0000-000000000512',
    '35000000-0000-0000-0000-000000000511',
    'user',
    'Que establecia la norma anterior?'
  ),
  (
    '35000000-0000-0000-0000-000000000522',
    '35000000-0000-0000-0000-000000000521',
    'user',
    'Muestra el antecedente archivado especifico.'
  );
select lives_ok(
  $$
    select public.complete_chat_turn(
      p_user_id := '35000000-0000-0000-0000-000000000901',
      p_conversation_id := '35000000-0000-0000-0000-000000000511',
      p_user_message_id := '35000000-0000-0000-0000-000000000512',
      p_answer_role := 'assistant',
      p_answer := 'La fuente reemplazada se presenta como antecedente historico [1].',
      p_sources := '[{"sourceId":"35000000-0000-0000-0000-000000000513","chunkId":"35000000-0000-0000-0000-000000000405","moduleId":"35000000-0000-0000-0000-000000000101","relevanceScore":0.98}]'::jsonb,
      p_top_relevance_score := 0.98
    )
  $$,
  'Historical chat completion persists approved replaced evidence'
);
select is(
  (
    select document_situation::text
    from public.chat_message_sources
    where id = '35000000-0000-0000-0000-000000000513'
  ),
  'replaced',
  'Historical chat evidence is explicitly identified as replaced'
);
select lives_ok(
  $$
    select public.complete_chat_turn(
      p_user_id := '35000000-0000-0000-0000-000000000901',
      p_conversation_id := '35000000-0000-0000-0000-000000000521',
      p_user_message_id := '35000000-0000-0000-0000-000000000522',
      p_answer_role := 'assistant',
      p_answer := 'La fuente archivada se usa solo como antecedente solicitado [1].',
      p_sources := '[{"sourceId":"35000000-0000-0000-0000-000000000523","chunkId":"35000000-0000-0000-0000-000000000404","moduleId":"35000000-0000-0000-0000-000000000101","relevanceScore":0.97}]'::jsonb,
      p_top_relevance_score := 0.97
    )
  $$,
  'Explicit archival chat completion persists approved archived evidence'
);
select is(
  (
    select document_situation::text
    from public.chat_message_sources
    where id = '35000000-0000-0000-0000-000000000523'
  ),
  'archived',
  'Explicit archival chat evidence is identified as archived'
);
select is(
  (
    select count(*)
    from public.list_document_library()
    where id in (
      '35000000-0000-0000-0000-000000000203',
      '35000000-0000-0000-0000-000000000205'
    )
  ),
  2::bigint,
  'The all-documents library includes replaced and archived records'
);
select lives_ok(
  $$
    update public.modules set
      is_active = false,
      deactivated_at = now(),
      deactivated_by = '35000000-0000-0000-0000-000000000901',
      deactivation_reason = 'Desactivacion jerarquica QA'
    where id in (
      '35000000-0000-0000-0000-000000000102',
      '35000000-0000-0000-0000-000000000103'
    );
    update public.modules set
      is_active = false,
      deactivated_at = now(),
      deactivated_by = '35000000-0000-0000-0000-000000000901',
      deactivation_reason = 'Desactivacion jerarquica QA'
    where id = '35000000-0000-0000-0000-000000000101';
  $$,
  'A hierarchy can be deactivated safely from children to parent'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_situation(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'contenido QA',
      '35000000-0000-0000-0000-000000000101',
      0.70,
      10,
      'archived_explicit'
    )
  ),
  0::bigint,
  'Inactive module hierarchies are excluded from RAG retrieval'
);
select lives_ok(
  $$ select public.logically_delete_document(
    '35000000-0000-0000-0000-000000000203',
    'Baja logica QA con trazabilidad',
    '35000000-0000-0000-0000-000000000901'
  ) $$,
  'A document is deleted logically only after an explicit reason'
);
select is(
  (select is_deleted from public.documents where id = '35000000-0000-0000-0000-000000000203'),
  true,
  'Logical deletion retains a tombstone row'
);
select is(
  (select count(*) from public.document_versions where document_id = '35000000-0000-0000-0000-000000000203'),
  1::bigint,
  'Logical deletion retains the immutable PDF version history'
);
select is(
  (
    select count(*)
    from public.document_audit_events
    where document_id = '35000000-0000-0000-0000-000000000203'
      and action = 'logically_deleted'
  ),
  1::bigint,
  'Logical deletion is recorded in document history'
);
select throws_ok(
  $$
    update public.document_audit_events
    set details = '{"tampered":true}'
    where document_id = '35000000-0000-0000-0000-000000000203'
  $$,
  'P0001',
  'Document audit events are append-only',
  'Document history cannot be rewritten'
);

select * from finish();
rollback;
