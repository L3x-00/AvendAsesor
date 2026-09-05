begin;

select plan(40);

select has_extension('vector', 'pgvector is enabled for RAG embeddings');
select has_table('public', 'document_ingestion_jobs', 'The durable ingestion queue exists');
select has_table('public', 'document_chunks', 'The version-bound chunk table exists');
select has_table('public', 'chat_conversations', 'The conversation table exists');
select has_table('public', 'chat_messages', 'The message table exists');
select has_table('public', 'chat_message_sources', 'The source table exists');
select has_table('public', 'unanswered_questions', 'The unanswered-question table exists');
select has_column('public', 'document_chunks', 'embedding', 'Chunks retain a dedicated embedding column');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.document_ingestion_jobs'::regclass),
  'RLS is enabled for ingestion jobs'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.document_chunks'::regclass),
  'RLS is enabled for chunks'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_conversations'::regclass),
  'RLS is enabled for conversations'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_messages'::regclass),
  'RLS is enabled for messages'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_message_sources'::regclass),
  'RLS is enabled for message sources'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.unanswered_questions'::regclass),
  'RLS is enabled for unanswered questions'
);

select ok(
  not has_table_privilege('authenticated', 'public.document_ingestion_jobs', 'select'),
  'Authenticated clients cannot read ingestion jobs directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.document_chunks', 'select'),
  'Authenticated clients cannot read chunks directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.chat_conversations', 'select'),
  'Authenticated clients cannot read conversations directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.chat_messages', 'select'),
  'Authenticated clients cannot read messages directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.chat_message_sources', 'select'),
  'Authenticated clients cannot read sources directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.unanswered_questions', 'select'),
  'Authenticated clients cannot read unanswered questions directly'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_document_ingestion_job(integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot claim ingestion jobs'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_document_chunks(extensions.vector,text,uuid,real,integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot invoke RAG search directly'
);
select is(
  (
    select count(*)
    from public.chat_messages
    where role <> 'user'::public.chat_message_role
      and in_reply_to_message_id is null
  ),
  0::bigint,
  'The hardened chat baseline contains no legacy unlinked replies'
);
select ok(
  position(
    'hnsw.iterative_scan'
    in pg_get_functiondef(
      'public.search_document_chunks(extensions.vector,text,uuid,real,integer)'::regprocedure
    )
  ) > 0,
  'Filtered vector retrieval enables supported iterative HNSW scans'
);
select is(
  (
    select operator_class.opcnamespace::regnamespace::text
    from pg_index as index_definition
    join pg_opclass as operator_class
      on operator_class.oid = index_definition.indclass[0]
    where index_definition.indexrelid = 'public.document_chunks_embedding_hnsw_idx'::regclass
  ),
  'extensions',
  'The HNSW embedding index resolves its operator class from the extensions schema'
);
select ok(
  position(
    'order by chunk.embedding operator(extensions.<=>) p_query_embedding'
    in lower(pg_get_functiondef(
      'public.search_document_chunks(extensions.vector,text,uuid,real,integer)'::regprocedure
    ))
  ) > 0,
  'Vector retrieval preserves the raw distance order required by the HNSW index'
);
select is(
  (
    select array_to_string(proconfig, ' | ')
    from pg_proc
    where oid = 'public.search_document_chunks(extensions.vector,text,uuid,real,integer)'::regprocedure
  ),
  'search_path=pg_catalog',
  'The SECURITY DEFINER retrieval function uses only the trusted catalog search path'
);

insert into public.modules (id, name, code)
values
  ('00000000-0000-0000-0000-000000003101', 'Licencias docentes', 'LICENSES_TEST'),
  ('00000000-0000-0000-0000-000000003102', 'Vacaciones docentes', 'VACATIONS_TEST');

insert into public.documents (id, title, document_type)
values ('00000000-0000-0000-0000-000000003201', 'Norma de licencias', 'NORMATIVE');

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
  '00000000-0000-0000-0000-000000003202',
  '00000000-0000-0000-0000-000000003201',
  1,
  'tests/00000000-0000-0000-0000-000000003201/v1.pdf',
  'norma-licencias.pdf',
  'application/pdf',
  1024,
  1,
  repeat('c', 64)
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-000000003202'
where id = '00000000-0000-0000-0000-000000003201';

insert into public.document_modules (document_id, module_id)
values (
  '00000000-0000-0000-0000-000000003201',
  '00000000-0000-0000-0000-000000003101'
);

select is(
  (select count(*) from public.document_ingestion_jobs where document_version_id = '00000000-0000-0000-0000-000000003202'),
  1::bigint,
  'Creating a document version enqueues exactly one durable ingestion job'
);

select throws_ok(
  $$
    update public.document_versions
    set ingestion_status = 'processing'
    where id = '00000000-0000-0000-0000-000000003202'
  $$,
  'P0001',
  'Document ingestion state is controlled by the ingestion worker',
  'A direct ingestion-state mutation is denied'
);

select lives_ok(
  $$
    select public.claim_document_ingestion_job(300)
  $$,
  'The worker can claim a pending job with a bounded lease'
);

select is(
  (select ingestion_status::text from public.document_versions where id = '00000000-0000-0000-0000-000000003202'),
  'processing',
  'Claiming work changes only the controlled derived ingestion state'
);
select is(
  (select attempt_count from public.document_ingestion_jobs where document_version_id = '00000000-0000-0000-0000-000000003202'),
  1,
  'Claiming work increments its attempt count once'
);

select lives_ok(
  $$
    select public.clear_document_ingestion_chunks(
      job.id,
      job.lease_token
    )
    from public.document_ingestion_jobs as job
    where job.document_version_id = '00000000-0000-0000-0000-000000003202'
  $$,
  'The active worker can clear derived chunks before an idempotent replacement'
);

insert into public.document_chunks (
  id,
  document_id,
  document_version_id,
  chunk_index,
  chunk_content,
  token_count,
  page_start,
  page_end,
  section_title,
  article_reference,
  embedding
)
values (
  '00000000-0000-0000-0000-000000003301',
  '00000000-0000-0000-0000-000000003201',
  '00000000-0000-0000-0000-000000003202',
  0,
  'Artículo 5. La licencia docente se solicita mediante el procedimiento institucional vigente.',
  18,
  1,
  1,
  'Artículo 5',
  'Artículo 5',
  array_fill(0.01::real, array[1536])::extensions.vector
);

select lives_ok(
  $$
    select public.complete_document_ingestion_job(
      job.id,
      job.lease_token
    )
    from public.document_ingestion_jobs as job
    where job.document_version_id = '00000000-0000-0000-0000-000000003202'
  $$,
  'The worker can complete a version only after chunks exist'
);

select is(
  (select ingestion_status::text from public.document_versions where id = '00000000-0000-0000-0000-000000003202'),
  'indexed',
  'A completed job makes the current version searchable'
);

update public.documents
set
  approval_status = 'ready',
  approved_version_id = '00000000-0000-0000-0000-000000003202'
where id = '00000000-0000-0000-0000-000000003201';

select is(
  (
    select count(*)
    from public.search_document_chunks(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'licencia docente procedimiento',
      '00000000-0000-0000-0000-000000003101',
      0.70,
      5
    )
  ),
  1::bigint,
  'Hybrid retrieval returns the indexed chunk for its selected module'
);

select is(
  (
    select count(*)
    from public.search_document_chunks(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'licencia docente procedimiento',
      '00000000-0000-0000-0000-000000003102',
      0.70,
      5
    )
  ),
  0::bigint,
  'The selected module is a hard filter before response generation'
);

insert into public.document_modules (document_id, module_id)
values (
  '00000000-0000-0000-0000-000000003201',
  '00000000-0000-0000-0000-000000003102'
);

select is(
  (
    select count(*)
    from public.search_document_chunks(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'licencia docente procedimiento',
      '00000000-0000-0000-0000-000000003102',
      0.70,
      5
    )
  ),
  1::bigint,
  'A new module link reuses the same version-bound chunk without duplicating its vector'
);

insert into public.chat_conversations (id, user_id, selected_module_id, title)
values (
  '00000000-0000-0000-0000-000000003401',
  '00000000-0000-0000-0000-000000003501',
  '00000000-0000-0000-0000-000000003101',
  'Consulta de prueba'
);

insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-000000003403',
  '00000000-0000-0000-0000-000000003401',
  'user',
  '¿Cómo solicito una licencia docente?'
);

insert into public.chat_messages (
  id,
  conversation_id,
  role,
  content,
  in_reply_to_message_id
)
values (
  '00000000-0000-0000-0000-000000003402',
  '00000000-0000-0000-0000-000000003401',
  'assistant',
  'La licencia docente se solicita mediante el procedimiento institucional vigente.',
  '00000000-0000-0000-0000-000000003403'
);

insert into public.chat_message_sources (
  message_id,
  chunk_id,
  document_id,
  document_version_id,
  module_id,
  document_title,
  module_name,
  version_number,
  page_start,
  page_end,
  section_title,
  article_reference,
  relevance_score,
  source_rank
)
values (
  '00000000-0000-0000-0000-000000003402',
  '00000000-0000-0000-0000-000000003301',
  '00000000-0000-0000-0000-000000003201',
  '00000000-0000-0000-0000-000000003202',
  '00000000-0000-0000-0000-000000003101',
  'Norma de licencias',
  'Licencias docentes',
  1,
  1,
  1,
  'Artículo 5',
  'Artículo 5',
  1,
  1
);

delete from public.document_chunks
where id = '00000000-0000-0000-0000-000000003301';

select ok(
  (select chunk_id is null from public.chat_message_sources where message_id = '00000000-0000-0000-0000-000000003402'),
  'A historical source retains its immutable citation snapshot if derived chunks are replaced'
);
select is(
  (select document_title from public.chat_message_sources where message_id = '00000000-0000-0000-0000-000000003402'),
  'Norma de licencias',
  'The historical source retains the real document citation snapshot'
);

select * from finish();

rollback;
