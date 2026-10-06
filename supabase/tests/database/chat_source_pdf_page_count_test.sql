begin;

select plan(14);

select has_column(
  'public', 'chat_message_sources', 'pdf_page_count',
  'Citation snapshots include the physical PDF page count'
);
select col_type_is(
  'public', 'chat_message_sources', 'pdf_page_count', 'integer',
  'The physical PDF page count uses an integer'
);
select col_not_null(
  'public', 'chat_message_sources', 'pdf_page_count',
  'Every persisted citation records the total physical pages'
);
select ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'chat_message_sources_pdf_page_count_check'
      and conrelid = 'public.chat_message_sources'::regclass
      and pg_catalog.pg_get_constraintdef(oid) like '%pdf_page_count%300%'
  ),
  'The named page-count check constrains the expected column and upper bound'
);
select is(
  (select count(*) from public.chat_message_sources where pdf_page_count is null),
  0::bigint,
  'The migration backfill leaves no historical citation without a page total'
);
select ok(
  pg_catalog.pg_get_function_result(
    'public.search_document_chunks_with_consultation_context(extensions.vector,text,uuid,real,integer,text)'::regprocedure
  ) like '%mime_type text%pdf_page_count integer%',
  'Situation-aware retrieval exposes MIME and the physical PDF page total'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_document_chunks_with_consultation_context(extensions.vector,text,uuid,real,integer,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot call retrieval directly'
);
select ok(
  pg_catalog.pg_get_functiondef(
    'private.capture_chat_source_document_situation()'::regprocedure
  ) like '%version.page_count%',
  'The citation capture trigger reads the canonical version page count'
);
select ok(
  (
    select pg_catalog.pg_get_triggerdef(oid)
    from pg_catalog.pg_trigger
    where tgrelid = 'public.chat_message_sources'::regclass
      and tgname = 'chat_message_sources_protect_document_situation'
      and not tgisinternal
  ) like '%pdf_page_count%',
  'The immutable snapshot trigger protects the page total'
);

insert into public.modules (id, name, code)
values ('f0000000-0000-4000-8000-000000000101', 'Módulo de página física', 'PDF_PAGE_TEST');

insert into public.documents (id, title, document_type)
values ('f0000000-0000-4000-8000-000000000201', 'Norma de prueba de páginas', 'LEY');

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values (
  'f0000000-0000-4000-8000-000000000202',
  'f0000000-0000-4000-8000-000000000201',
  1, 'tests/page-count/norma.pdf', 'norma.pdf', 'application/pdf',
  1024, 7, repeat('f', 64)
);

update public.documents
set current_version_id = 'f0000000-0000-4000-8000-000000000202'
where id = 'f0000000-0000-4000-8000-000000000201';

select private.set_document_ingestion_status(
  'f0000000-0000-4000-8000-000000000202', 'processing'
);
select private.set_document_ingestion_status(
  'f0000000-0000-4000-8000-000000000202', 'indexed'
);

update public.documents
set approval_status = 'ready',
  approved_version_id = 'f0000000-0000-4000-8000-000000000202'
where id = 'f0000000-0000-4000-8000-000000000201';

insert into public.document_modules (document_id, module_id)
values (
  'f0000000-0000-4000-8000-000000000201',
  'f0000000-0000-4000-8000-000000000101'
);

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, section_title, embedding
)
values (
  'f0000000-0000-4000-8000-000000000301',
  'f0000000-0000-4000-8000-000000000201',
  'f0000000-0000-4000-8000-000000000202',
  0, 'Contenido de prueba ubicado en la tercera página física.',
  10, 3, 3, 'Ubicación',
  array_fill(0.01::real, array[1536])::extensions.vector
);

insert into public.chat_conversations (id, user_id, selected_module_id, title)
values (
  'f0000000-0000-4000-8000-000000000401',
  'f0000000-0000-4000-8000-000000000501',
  'f0000000-0000-4000-8000-000000000101',
  'Conversación de páginas'
);

insert into public.chat_messages (
  id, conversation_id, in_reply_to_message_id, role, content
)
values
  (
    'f0000000-0000-4000-8000-000000000600',
    'f0000000-0000-4000-8000-000000000401',
    null, 'user', '¿Dónde está el contenido?'
  ),
  (
    'f0000000-0000-4000-8000-000000000601',
    'f0000000-0000-4000-8000-000000000401',
    'f0000000-0000-4000-8000-000000000600',
    'assistant', 'Respuesta con cita. [1]'
  );

insert into public.chat_message_sources (
  id, message_id, chunk_id, document_id, document_version_id, module_id,
  document_title, module_name, version_number, page_start, page_end,
  section_title, article_reference, numeral_reference, relevance_score,
  source_rank
)
values (
  'f0000000-0000-4000-8000-000000000701',
  'f0000000-0000-4000-8000-000000000601',
  'f0000000-0000-4000-8000-000000000301',
  'f0000000-0000-4000-8000-000000000201',
  'f0000000-0000-4000-8000-000000000202',
  'f0000000-0000-4000-8000-000000000101',
  'Norma de prueba de páginas', 'Módulo de página física', 1, 3, 3,
  'Ubicación', null, null, 0.95, 1
);

select is(
  (select pdf_page_count from public.chat_message_sources
   where id = 'f0000000-0000-4000-8000-000000000701'),
  7,
  'The insert trigger snapshots the canonical version page total'
);
select is(
  public.get_chat_conversation(
    'f0000000-0000-4000-8000-000000000501',
    'f0000000-0000-4000-8000-000000000401'
  ) #>> '{messages,1,sources,0,pdfPageCount}',
  '7',
  'Owned history round-trips the physical page total'
);
select is(
  public.get_chat_conversation(
    'f0000000-0000-4000-8000-000000000501',
    'f0000000-0000-4000-8000-000000000401'
  ) #>> '{messages,1,sources,0,documentId}',
  'f0000000-0000-4000-8000-000000000201',
  'Owned history round-trips the stable document identity'
);
select is(
  concat_ws(
    '/',
    public.get_chat_conversation(
      'f0000000-0000-4000-8000-000000000501',
      'f0000000-0000-4000-8000-000000000401'
    ) #>> '{messages,1,sources,0,documentVersionId}',
    public.get_chat_conversation(
      'f0000000-0000-4000-8000-000000000501',
      'f0000000-0000-4000-8000-000000000401'
    ) #>> '{messages,1,sources,0,mimeType}'
  ),
  'f0000000-0000-4000-8000-000000000202/application/pdf',
  'Owned history round-trips version identity and MIME'
);
select throws_ok(
  $$update public.chat_message_sources
    set pdf_page_count = 6
    where id = 'f0000000-0000-4000-8000-000000000701'$$,
  'P0001',
  'A persisted chat source situation is immutable',
  'The physical page total cannot be rewritten after persistence'
);

select * from finish();
rollback;
