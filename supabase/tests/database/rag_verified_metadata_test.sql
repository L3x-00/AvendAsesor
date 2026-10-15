begin;

select plan(26);

select col_is_null(
  'public', 'document_versions', 'page_count',
  'An unverified physical page total is stored as null'
);
select col_is_null(
  'public', 'chat_message_sources', 'pdf_page_count',
  'Citation snapshots can omit an unverified page total'
);
select has_function(
  'public',
  'complete_document_ingestion_job',
  array['uuid', 'uuid', 'integer'],
  'The worker can complete ingestion with a verified PDF page count'
);
select has_function(
  'public',
  'complete_document_ingestion_job',
  array['uuid', 'uuid'],
  'The previous completion signature remains available during rollout'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_document_ingestion_job(uuid,uuid,integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot reconcile a version page total'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.complete_document_ingestion_job(uuid,uuid,integer)'::regprocedure,
    'execute'
  ),
  'The server-side ingestion worker can reconcile a version page total'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'private.capture_chat_source_document_situation()'::regprocedure
  ) like '%version.mime_type = ''application/pdf''%version.page_count%',
  'Citation capture only snapshots a physical total for PDF versions'
);
select ok(
  not private.is_verifiable_rag_location(
    E'El docente coordinador de ONDEC percibe una asignación.\n\nArtículo 3.- Implementación.',
    'Artículo 3.-',
    'article'
  ),
  'An article mentioned after unrelated text is not a structural location'
);
select ok(
  not private.is_verifiable_rag_location(
    'DOS MIL SEISCIENTOS SESENTA Y SEIS SOLES',
    'DOS MIL SEISCIENTOS SESENTA Y SEIS SOLES',
    'section'
  ),
  'An uppercase amount is not a section'
);
select ok(
  not private.is_verifiable_rag_location(
    'Artículo 3.- Modifíquese el artículo 2.',
    'Artículo 3.- Modifíquese el artículo 2.',
    'section'
  ),
  'A complete legal directive is not a section'
);
select ok(
  not private.is_verifiable_rag_location(
    'Artículo 3.- Modifíquese el artículo 2.',
    'Modifíquese el artículo 2.',
    'section'
  ),
  'A legal directive after an article label is not a subtitle'
);
select ok(
  not private.is_verifiable_rag_location(
    'Artículo 3.- La remuneración mensual es de S/ 2 666.',
    'Artículo 3.- La remuneración mensual es de S/ 2 666.',
    'section'
  ),
  'A short remuneration provision is not a section'
);
select ok(
  not private.is_verifiable_rag_location(
    'Artículo 4.- El profesor percibe S/ 3 000.',
    'El profesor percibe S/ 3 000.',
    'section'
  ),
  'A declarative salary sentence after an article is not a subtitle'
);
select ok(
  not private.is_verifiable_rag_location(
    'Artículo 5.- La asignación corresponde al cargo docente.',
    'La asignación corresponde al cargo docente.',
    'section'
  ),
  'A short assignment provision is not a subtitle'
);
select ok(
  private.is_verifiable_rag_location(
    E'CAPÍTULO II\n\nArtículo 5.- Requisitos.',
    'Artículo 5.-',
    'article'
  ),
  'A chapter can structurally precede an article'
);
select ok(
  private.is_verifiable_rag_location(
    'Continuación del régimen aplicable.',
    'Artículo 5.-',
    'article'
  ),
  'An absent article marker can be propagated from a previous chunk'
);
select ok(
  private.is_verifiable_rag_location(
    'Continuación del literal aplicable.',
    '2.1',
    'numeral'
  ),
  'An absent numeral marker can be propagated from a previous chunk'
);
select ok(
  private.is_verifiable_rag_location(
    'Artículo 5.- Requisitos para la reasignación',
    'Requisitos para la reasignación',
    'section'
  ),
  'A nominal subtitle without sentence punctuation remains verifiable'
);

insert into public.modules (id, name, code)
values (
  'e2000000-0000-4000-8000-000000000001',
  'Módulo de metadatos verificables',
  'VERIFIED_METADATA_TEST'
);

insert into public.documents (id, title, document_type)
values (
  'e2000000-0000-4000-8000-000000000101',
  'Norma con total pendiente de verificar',
  'LEY'
);

select lives_ok(
  $$
    insert into public.document_versions (
      id, document_id, version_number, storage_path, original_file_name,
      mime_type, file_size_bytes, page_count, sha256
    ) values (
      'e2000000-0000-4000-8000-000000000201',
      'e2000000-0000-4000-8000-000000000101',
      1, 'tests/verified-metadata/norma.pdf', 'norma.pdf',
      'application/pdf', 23000000, null, repeat('e', 64)
    )
  $$,
  'A large PDF is persisted without inventing a one-page total'
);

update public.documents
set current_version_id = 'e2000000-0000-4000-8000-000000000201'
where id = 'e2000000-0000-4000-8000-000000000101';

select throws_ok(
  $$
    update public.document_versions
    set page_count = 2
    where id = 'e2000000-0000-4000-8000-000000000201'
  $$,
  'P0001',
  'Document versions are immutable; create a new version instead',
  'An ordinary caller cannot manufacture a page total'
);

select private.set_document_ingestion_status(
  'e2000000-0000-4000-8000-000000000201',
  'processing'
);

update public.document_ingestion_jobs
set
  status = 'processing',
  attempt_count = 1,
  lease_token = 'e2000000-0000-4000-8000-000000000901',
  leased_at = now(),
  lease_expires_at = now() + interval '5 minutes'
where document_version_id = 'e2000000-0000-4000-8000-000000000201';

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, section_title, article_reference,
  embedding
)
values (
  'e2000000-0000-4000-8000-000000000301',
  'e2000000-0000-4000-8000-000000000101',
  'e2000000-0000-4000-8000-000000000201',
  0,
  'Artículo 8.- El contenido comprobado se encuentra en la tercera página.',
  14,
  3,
  3,
  null,
  'Artículo 8.-',
  array_fill(0.01::real, array[1536])::extensions.vector
);

select throws_ok(
  $$
    select public.complete_document_ingestion_job(
      job.id,
      'e2000000-0000-4000-8000-000000000901'::uuid,
      2
    )
    from public.document_ingestion_jobs as job
    where job.document_version_id = 'e2000000-0000-4000-8000-000000000201'
  $$,
  '23514',
  'The verified PDF page count cannot be lower than its cited pages',
  'Completion rejects a total below the maximum cited page'
);
select is(
  (
    select status::text
    from public.document_ingestion_jobs
    where document_version_id = 'e2000000-0000-4000-8000-000000000201'
  ),
  'processing',
  'A rejected total leaves the leased job available for a correct completion'
);
select lives_ok(
  $$
    select public.complete_document_ingestion_job(
      job.id,
      'e2000000-0000-4000-8000-000000000901'::uuid,
      4
    )
    from public.document_ingestion_jobs as job
    where job.document_version_id = 'e2000000-0000-4000-8000-000000000201'
  $$,
  'Completion accepts the page total observed by the PDF extractor'
);
select is(
  (
    select page_count
    from public.document_versions
    where id = 'e2000000-0000-4000-8000-000000000201'
  ),
  4,
  'The verified total replaces the unknown value atomically'
);
select is(
  (
    select ingestion_status::text
    from public.document_versions
    where id = 'e2000000-0000-4000-8000-000000000201'
  ),
  'indexed',
  'The version becomes indexed only after page-count reconciliation succeeds'
);
select throws_ok(
  $$
    update public.document_versions
    set page_count = 3
    where id = 'e2000000-0000-4000-8000-000000000201'
  $$,
  'P0001',
  'Document versions are immutable; create a new version instead',
  'The verified total remains immutable outside the ingestion boundary'
);

select * from finish();
rollback;
