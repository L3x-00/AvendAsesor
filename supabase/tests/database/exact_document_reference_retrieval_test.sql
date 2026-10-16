begin;

select plan(25);

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

-- (a) La identidad puede estar declarada en el título cuando el número
-- registrado está vacío. Los títulos reproducen los casos reales de producción
-- (con tildes, con «N.°» y con la etiqueta al final).
insert into public.documents (id, title, document_type, resolution_number, metadata)
values
  (
    'e1000000-0000-4000-8000-000000000104',
    'Año 2017: Norma de registro y control de asistencia  Resolución de Secretaría General N.° 426-2017-MINEDU',
    'RESOLUCION_SECRETARIA_GENERAL',
    null,
    '{}'::jsonb
  ),
  (
    'e1000000-0000-4000-8000-000000000105',
    'Año 2019: Habilitante para incremento de remuneraciones  Ley N.° 29988',
    'LEY',
    null,
    '{}'::jsonb
  ),
  (
    'e1000000-0000-4000-8000-000000000106',
    'Resolución Ministerial N.° 456-2018-MINEDU que aprueba la Resolución de Secretaría General N.° 526-2017-MINEDU',
    'RESOLUCION_MINISTERIAL',
    null,
    '{}'::jsonb
  ),
  (
    'e1000000-0000-4000-8000-000000000107',
    'Resolución Ministerial N.° 456-2018-MINEDU',
    'RESOLUCION_MINISTERIAL',
    '123-2019-MINEDU',
    '{}'::jsonb
  ),
  (
    'e1000000-0000-4000-8000-000000000108',
    'Resolución de Secretaría General N.° 726-2017-MINEDU',
    'OTRO',
    null,
    jsonb_build_object(
      'documentTypeOther', 'Resolución de Secretaría General',
      'specificDependency', 'Prueba de referencias exactas'
    )
  ),
  -- Contraejemplos fijados por la auditoría del 2026-10-16: una norma del mismo
  -- código que menciona a otra no responde por la mencionada, el sufijo real
  -- `-EF` del caso de producción resuelve, y un número registrado con la etiqueta
  -- completa y acentuada también (la normalización ignora las tildes).
  (
    'e1000000-0000-4000-8000-000000000109',
    'Resolución Ministerial N.° 789-2020-MINEDU que modifica la Resolución Ministerial N.° 654-2019-MINEDU',
    'RESOLUCION_MINISTERIAL',
    null,
    '{}'::jsonb
  ),
  (
    'e1000000-0000-4000-8000-000000000110',
    'Decreto Supremo N.° 049-2025-EF que aprueba el Reglamento de la Ley N.° 29988',
    'DECRETO_SUPREMO',
    null,
    '{}'::jsonb
  ),
  (
    'e1000000-0000-4000-8000-000000000111',
    'Año 2021: Norma de control interno de las entidades públicas',
    'RESOLUCION_SECRETARIA_GENERAL',
    'Resolución de Secretaría General N.° 512-2021-MINEDU',
    '{}'::jsonb
  );

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values
  (
    'e1000000-0000-4000-8000-000000000204',
    'e1000000-0000-4000-8000-000000000104',
    1, 'tests/exact/identidad-426.pdf', 'identidad-426.pdf', 'application/pdf',
    1000, 3, repeat('d', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000205',
    'e1000000-0000-4000-8000-000000000105',
    1, 'tests/exact/identidad-29988.pdf', 'identidad-29988.pdf', 'application/pdf',
    1000, 3, repeat('e', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000206',
    'e1000000-0000-4000-8000-000000000106',
    1, 'tests/exact/identidad-456.pdf', 'identidad-456.pdf', 'application/pdf',
    1000, 3, repeat('f', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000207',
    'e1000000-0000-4000-8000-000000000107',
    1, 'tests/exact/identidad-123-2019.pdf', 'identidad-123-2019.pdf', 'application/pdf',
    1000, 3, repeat('7', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000208',
    'e1000000-0000-4000-8000-000000000108',
    1, 'tests/exact/identidad-726.pdf', 'identidad-726.pdf', 'application/pdf',
    1000, 3, repeat('8', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000209',
    'e1000000-0000-4000-8000-000000000109',
    1, 'tests/exact/identidad-789.pdf', 'identidad-789.pdf', 'application/pdf',
    1000, 3, repeat('9', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000210',
    'e1000000-0000-4000-8000-000000000110',
    1, 'tests/exact/identidad-049-2025-ef.pdf', 'identidad-049-2025-ef.pdf',
    'application/pdf', 1000, 3, repeat('a', 64)
  ),
  (
    'e1000000-0000-4000-8000-000000000211',
    'e1000000-0000-4000-8000-000000000111',
    1, 'tests/exact/identidad-512.pdf', 'identidad-512.pdf', 'application/pdf',
    1000, 3, repeat('b', 64)
  );

update public.documents
set current_version_id = case id
  when 'e1000000-0000-4000-8000-000000000104' then 'e1000000-0000-4000-8000-000000000204'::uuid
  when 'e1000000-0000-4000-8000-000000000105' then 'e1000000-0000-4000-8000-000000000205'::uuid
  when 'e1000000-0000-4000-8000-000000000106' then 'e1000000-0000-4000-8000-000000000206'::uuid
  when 'e1000000-0000-4000-8000-000000000107' then 'e1000000-0000-4000-8000-000000000207'::uuid
  when 'e1000000-0000-4000-8000-000000000108' then 'e1000000-0000-4000-8000-000000000208'::uuid
  when 'e1000000-0000-4000-8000-000000000109' then 'e1000000-0000-4000-8000-000000000209'::uuid
  when 'e1000000-0000-4000-8000-000000000110' then 'e1000000-0000-4000-8000-000000000210'::uuid
  else 'e1000000-0000-4000-8000-000000000211'::uuid
end
where id in (
  'e1000000-0000-4000-8000-000000000104',
  'e1000000-0000-4000-8000-000000000105',
  'e1000000-0000-4000-8000-000000000106',
  'e1000000-0000-4000-8000-000000000107',
  'e1000000-0000-4000-8000-000000000108',
  'e1000000-0000-4000-8000-000000000109',
  'e1000000-0000-4000-8000-000000000110',
  'e1000000-0000-4000-8000-000000000111'
);

select private.set_document_ingestion_status(id, 'processing')
from public.document_versions
where id in (
  'e1000000-0000-4000-8000-000000000204',
  'e1000000-0000-4000-8000-000000000205',
  'e1000000-0000-4000-8000-000000000206',
  'e1000000-0000-4000-8000-000000000207',
  'e1000000-0000-4000-8000-000000000208',
  'e1000000-0000-4000-8000-000000000209',
  'e1000000-0000-4000-8000-000000000210',
  'e1000000-0000-4000-8000-000000000211'
);
select private.set_document_ingestion_status(id, 'indexed')
from public.document_versions
where id in (
  'e1000000-0000-4000-8000-000000000204',
  'e1000000-0000-4000-8000-000000000205',
  'e1000000-0000-4000-8000-000000000206',
  'e1000000-0000-4000-8000-000000000207',
  'e1000000-0000-4000-8000-000000000208',
  'e1000000-0000-4000-8000-000000000209',
  'e1000000-0000-4000-8000-000000000210',
  'e1000000-0000-4000-8000-000000000211'
);

update public.documents
set approval_status = 'ready', approved_version_id = current_version_id
where id in (
  'e1000000-0000-4000-8000-000000000104',
  'e1000000-0000-4000-8000-000000000105',
  'e1000000-0000-4000-8000-000000000106',
  'e1000000-0000-4000-8000-000000000107',
  'e1000000-0000-4000-8000-000000000108',
  'e1000000-0000-4000-8000-000000000109',
  'e1000000-0000-4000-8000-000000000110',
  'e1000000-0000-4000-8000-000000000111'
);

insert into public.document_modules (document_id, module_id)
select id, 'e1000000-0000-4000-8000-000000000001'
from public.documents
where id in (
  'e1000000-0000-4000-8000-000000000104',
  'e1000000-0000-4000-8000-000000000105',
  'e1000000-0000-4000-8000-000000000106',
  'e1000000-0000-4000-8000-000000000107',
  'e1000000-0000-4000-8000-000000000108',
  'e1000000-0000-4000-8000-000000000109',
  'e1000000-0000-4000-8000-000000000110',
  'e1000000-0000-4000-8000-000000000111'
);

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, embedding
)
values
  (
    'e1000000-0000-4000-8000-000000000304',
    'e1000000-0000-4000-8000-000000000104',
    'e1000000-0000-4000-8000-000000000204',
    0, 'La asistencia del personal se registra en el formato oficial.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000305',
    'e1000000-0000-4000-8000-000000000105',
    'e1000000-0000-4000-8000-000000000205',
    0, 'La ley habilitante fija el incremento de remuneraciones.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000306',
    'e1000000-0000-4000-8000-000000000106',
    'e1000000-0000-4000-8000-000000000206',
    0, 'La resolución ministerial aprueba la norma de asistencia.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000307',
    'e1000000-0000-4000-8000-000000000107',
    'e1000000-0000-4000-8000-000000000207',
    0, 'El número registrado identifica esta resolución ministerial.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000308',
    'e1000000-0000-4000-8000-000000000108',
    'e1000000-0000-4000-8000-000000000208',
    0, 'La secretaría general registra y controla la asistencia.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000309',
    'e1000000-0000-4000-8000-000000000109',
    'e1000000-0000-4000-8000-000000000209',
    0, 'La resolución ministerial modifica otra resolución ministerial.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000310',
    'e1000000-0000-4000-8000-000000000110',
    'e1000000-0000-4000-8000-000000000210',
    0, 'El decreto supremo aprueba el reglamento de la ley.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  ),
  (
    'e1000000-0000-4000-8000-000000000311',
    'e1000000-0000-4000-8000-000000000111',
    'e1000000-0000-4000-8000-000000000211',
    0, 'El control interno se registra en el aplicativo oficial.',
    10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
  );

select is(
  (
    select array_agg(document_id order by document_id)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'registro de asistencia',
      array['RSG:4262017MINEDU'],
      5,
      'current'
    )
  ),
  array['e1000000-0000-4000-8000-000000000104'::uuid],
  'An RSG whose number lives only in the title resolves through the exact gate, and only it'
);
select is(
  (
    select array_agg(document_id order by document_id)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'incremento de remuneraciones',
      array['LEY:29988'],
      5,
      'current'
    )
  ),
  array['e1000000-0000-4000-8000-000000000105'::uuid],
  'A law whose number lives only in the title resolves through the exact gate, and only it'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'registro de asistencia',
      array['RSG:4272017MINEDU'],
      5,
      'current'
    )
  ),
  0::bigint,
  'A near title number does not satisfy the requested identity'
);
select is(
  (
    select array_agg(document_id order by document_id)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'resolución ministerial',
      array['RM:4562018MINEDU'],
      5,
      'current'
    )
  ),
  array['e1000000-0000-4000-8000-000000000106'::uuid],
  'A document whose title declares its own identity resolves through the exact gate, and only it'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'registro de asistencia',
      array['RSG:5262017MINEDU'],
      5,
      'current'
    )
  ),
  0::bigint,
  'A ministerial resolution that mentions an RSG cannot answer for that RSG'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'resolución ministerial',
      array['RM:4562018MINEDU'],
      5,
      'current'
    )
    where document_id = 'e1000000-0000-4000-8000-000000000107'
  ),
  0::bigint,
  'The registered number stays authoritative over the number declared in the title'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'resolución ministerial',
      array['RM:1232019MINEDU'],
      5,
      'current'
    )
    where document_id = 'e1000000-0000-4000-8000-000000000107'
  ),
  1::bigint,
  'The registered number keeps resolving its own identity'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'asistencia',
      array['RSG:7262017MINEDU'],
      5,
      'current'
    )
  ),
  0::bigint,
  'An untyped OTRO document cannot answer for an RSG, even with the explicit label'
);
select is(
  (
    select array_agg(document_id order by document_id)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'modifica otra resolución',
      array['RM:7892020MINEDU'],
      5,
      'current'
    )
  ),
  array['e1000000-0000-4000-8000-000000000109'::uuid],
  'A resolution that modifies another one resolves by its own declared identity'
);
select is(
  (
    select count(*)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'modifica otra resolución',
      array['RM:6542019MINEDU'],
      5,
      'current'
    )
  ),
  0::bigint,
  'A resolution that mentions another resolution of the same type does not answer for the mentioned one'
);
select is(
  (
    select array_agg(document_id order by document_id)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'aprueba el reglamento',
      array['DS:0492025EF'],
      5,
      'current'
    )
  ),
  array['e1000000-0000-4000-8000-000000000110'::uuid],
  'A supreme decree with the official -EF suffix resolves through the exact gate'
);
select is(
  (
    select array_agg(document_id order by document_id)
    from public.search_document_chunks_by_exact_references(
      array_fill(0.01::real, array[1536])::extensions.vector,
      'control interno',
      array['RSG:5122021MINEDU'],
      5,
      'current'
    )
  ),
  array['e1000000-0000-4000-8000-000000000111'::uuid],
  'A registered number written with the accented full label resolves through the exact gate'
);
select is(
  (
    select count(*)
    from private.document_title_reference_keys(
      'Decreto Supremo N.° 001-2020-EF, Ley N.° 1111, Resolución Ministerial N.° 2222-2020-MINEDU, Resolución Viceministerial N.° 3333-2020-MINEDU, Resolución Directoral N.° 4444-2020-MINEDU y Resolución de Secretaría General N.° 5555-2020-MINEDU'
    )
  ),
  6::bigint,
  'A title declares every reference it needs, without the question limit'
);
select is(
  (
    select count(*)
    from private.document_title_reference_keys('Ley N.° 29988á')
  ),
  0::bigint,
  'A digit run glued to an accented letter is not an identity in any layer'
);

select * from finish();
rollback;
