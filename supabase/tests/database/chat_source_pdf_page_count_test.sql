begin;

select plan(6);

select has_column(
  'public',
  'chat_message_sources',
  'pdf_page_count',
  'Citation snapshots include the physical PDF page count'
);
select col_type_is(
  'public',
  'chat_message_sources',
  'pdf_page_count',
  'integer',
  'The physical PDF page count uses an integer'
);
select col_not_null(
  'public',
  'chat_message_sources',
  'pdf_page_count',
  'Every persisted citation records the total physical pages'
);
select has_check(
  'public',
  'chat_message_sources',
  'Citation PDF page totals are constrained'
);
select ok(
  pg_catalog.pg_get_function_result(
    'public.search_document_chunks_with_consultation_context(extensions.vector,text,uuid,real,integer,text)'::regprocedure
  ) like '%pdf_page_count integer%',
  'Situation-aware retrieval exposes the physical PDF page total'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_document_chunks_with_consultation_context(extensions.vector,text,uuid,real,integer,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot call retrieval directly'
);

select * from finish();
rollback;
