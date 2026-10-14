begin;

select plan(11);

select has_function(
  'public',
  'search_document_chunks_by_exact_references',
  array['extensions.vector', 'text', 'text[]', 'integer', 'text'],
  'Exact-reference retrieval is available with the expected contract'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.search_document_chunks_by_exact_references(extensions.vector,text,text[],integer,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot call exact retrieval directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.search_document_chunks_by_exact_references(extensions.vector,text,text[],integer,text)'::regprocedure,
    'execute'
  ),
  'Only the server role can call exact retrieval'
);

insert into public.modules (id, name, code)
values ('e1000000-0000-4000-8000-000000000001', 'Módulo exacto', 'EXACT_REF_TEST');

insert into public.documents (
  id, title, document_type, resolution_number
)
values
  (
    'e1000000-0000-4000-8000-000000000101',
    'Norma de registro y control de asistencia',
    'RESOLUCION_SECRETARIA_GENERAL',
    'RSG N.° 326-2017-MINEDU'
  ),
  (
    'e1000000-0000-4000-8000-000000000102',
    'Proceso administrativo disciplinario',
    'RESOLUCION_MINISTERIAL',
    '326-2017-MINEDU'
  ),
  (
    'e1000000-0000-4000-8000-000000000103',
    'Instructivo de planilla 121-2018-MINEDU',
    'RESOLUCION_SECRETARIA_GENERAL',
    'RSG N.° 121-2018-MINEDU'
  );

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values
  (
    'e1000000-0000-4000-8000-000000000201',
    'e1000000-0000-4000-8000-000000000101',
    1, 'tests/exact/326.pdf', '326.pdf', 'application/pdf',
    1000, 3, repeat('a', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000202',
    'e1000000-0000-4000-8000-000000000102',
    1, 'tests/exact/123.pdf', '123.pdf', 'application/pdf',
    1000, 3, repeat('b', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000203',
    'e1000000-0000-4000-8000-000000000103',
    1, 'tests/exact/121.pdf', '121.pdf', 'application/pdf',
    1000, 3, repeat('c', 64)
  );

update public.documents
set current_version_id = case id
  when 'e1000000-0000-4000-8000-000000000101' then 'e1000000-0000-4000-8000-000000000201'::uuid
  when 'e1000000-0000-4000-8000-000000000102' then 'e1000000-0000-4000-8000-000000000202'::uuid
  else 'e1000000-0000-4000-8000-000000000203'::uuid
end
where id in (
  'e1000000-0000-4000-8000-000000000101',
  'e1000000-0000-4000-8000-000000000102',
  'e1000000-0000-4000-8000-000000000103'
);

select private.set_document_ingestion_status(id, 'processing')
from public.document_versions
where id in (
  'e1000000-0000-4000-8000-000000000201',
  'e1000000-0000-4000-8000-000000000202',
  'e1000000-0000-4000-8000-000000000203'
);
select private.set_document_ingestion_status(id, 'indexed')
from public.document_versions
where id in (
  'e1000000-0000-4000-8000-000000000201',
  'e1000000-0000-4000-8000-000000000202',
  'e1000000-0000-4000-8000-000000000203'
);

update public.documents
set approval_status = 'ready', approved_version_id = current_version_id
where id in (
  'e1000000-0000-4000-8000-000000000101',
  'e1000000-0000-4000-8000-000000000102'
);

insert into public.document_modules (document_id, module_id)
select id, 'e1000000-0000-4000-8000-000000000001'
from public.documents
where id in (
  'e1000000-0000-4000-8000-000000000101',
  'e1000000-0000-4000-8000-000000000102',
  'e1000000-0000-4000-8000-000000000103'
);

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, embedding
)
values
  (
    'e1000000-0000-4000-8000-000000000301',
    'e1000000-0000-4000-8000-000000000101',
    'e1000000-0000-4000-8000-000000000201',
    0, 'El director registra y controla la asistencia del personal.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000302',
    'e1000000-0000-4000-8000-000000000102',
    'e1000000-0000-4000-8000-000000000202',
    0, 'Texto parecido sobre control y disciplina del personal.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000303',
    'e1000000-0000-4000-8000-000000000103',
    'e1000000-0000-4000-8000-000000000203',
    0, 'La planilla se elabora según el instructivo.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  );

select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'control de asistencia',
      array['RSG:3262017MINEDU'],
      5,
      'historical'
    )
  ),
  1::bigint,
  'The exact reference returns only its approved document'
);
select is(
  (
    select document_id
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'control de asistencia',
      array['RSG:3262017MINEDU'],
      5,
      'historical'
    )
    limit 1
  ),
  'e1000000-0000-4000-8000-000000000101'::uuid,
  'A semantically similar document cannot substitute the named norm'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'control de personal',
      array[
        'RSG:3262017MINEDU',
        'RM:3262017MINEDU'
      ],
      2,
      'historical'
    )
  ),
  2::bigint,
  'A multi-reference request keeps at least one result for each exact document'
);
select is(
  (
    select array_agg(document_id order by document_id)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'control de personal',
      array[
        'RSG:3262017MINEDU',
        'RM:3262017MINEDU'
      ],
      2,
      'historical'
    )
  ),
  array[
    'e1000000-0000-4000-8000-000000000101'::uuid,
    'e1000000-0000-4000-8000-000000000102'::uuid
  ],
  'Multi-reference retrieval returns only the two requested identities'
);
update public.documents
set resolution_number = 'RSG N.° 1326-2017-MINEDU'
where id = 'e1000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'control de asistencia',
      array['RSG:3262017MINEDU'],
      5,
      'historical'
    )
  ),
  0::bigint,
  'A longer registered number cannot satisfy a shorter requested identity'
);
update public.documents
set resolution_number = 'RSG N.° 326-2017-MINEDU'
where id = 'e1000000-0000-4000-8000-000000000101';
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'planilla de pagos',
      array['RSG:1212018MINEDU'],
      5,
      'historical'
    )
  ),
  0::bigint,
  'A non-approved exact document is unavailable to the RAG'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'norma inexistente',
      array['RSG:9992026MINEDU'],
      5,
      'historical'
    )
  ),
  0::bigint,
  'An unknown exact reference returns no substitute'
);
select throws_ok(
  $$select * from public.search_document_chunks_by_exact_references(
    array_fill(0.01::real, array[1536])::extensions.vector,
    'consulta', array['INVALID-KEY'], 5, 'current'
  )$$,
  '22023',
  'Invalid document search parameters',
  'Malformed reference keys fail closed'
);

select * from finish();
rollback;
