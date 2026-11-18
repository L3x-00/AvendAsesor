begin;

select plan(15);

select has_table(
  'public',
  'document_relations',
  'Document relations live in their own table'
);

select has_type(
  'public',
  'document_relation_type',
  'Relation kinds are a closed enum'
);

select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.document_relations'::regclass),
  'Row level security is enabled on document relations'
);

select ok(
  not has_table_privilege(
    'anon',
    'public.document_relations',
    'select'
  ),
  'Anonymous clients cannot read the relations table'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.document_relations',
    'select'
  ),
  'Authenticated clients cannot read the relations table directly'
);

select has_index(
  'public',
  'document_relations',
  'document_relations_source_idx',
  array['source_document_id'],
  'Relations are indexed by source document'
);

select has_index(
  'public',
  'document_relations',
  'document_relations_target_idx',
  array['target_document_id'],
  'Relations are indexed by target document'
);

select has_function(
  'public',
  'get_related_documents',
  array['uuid'],
  'A bounded RPC exposes relations and document identities'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.get_related_documents(uuid)'::regprocedure,
    'execute'
  ),
  'Anonymous clients cannot call the relations RPC'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.get_related_documents(uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients can call the relations RPC'
);

-- Un documento sin relaciones devuelve una fila con la identidad del fuente y
-- el destino en null; el API traduce esa fila a «no hay relaciones registradas».
insert into public.documents (id, title, document_type)
values
  ('11111111-1111-1111-1111-111111111111', 'Ley de prueba A', 'LEY'),
  ('22222222-2222-2222-2222-222222222222', 'Norma de prueba B', 'RESOLUCION_MINISTERIAL');

select is(
  (select count(*)::integer from public.get_related_documents('11111111-1111-1111-1111-111111111111')),
  1,
  'A source without relations still returns its own identity'
);

select is(
  (select relation_id from public.get_related_documents('11111111-1111-1111-1111-111111111111')),
  null::uuid,
  'A source without relations has no relation identifier'
);

insert into public.document_relations (source_document_id, target_document_id, relation_type)
values ('11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 'modifica');

select is(
  (select target_title from public.get_related_documents('11111111-1111-1111-1111-111111111111')),
  'Norma de prueba B',
  'A relation returns the target document title'
);

-- Ni la fuente ni el destino borrados deben presentarse como norma vigente.
insert into public.documents (id, title, document_type)
values
  ('55555555-5555-5555-5555-555555555555', 'Ley de prueba C borrada', 'LEY'),
  ('66666666-6666-6666-6666-666666666666', 'Norma de prueba D borrada', 'LEY');

-- El contrato vigente exige situation='archived' junto con un motivo de
-- archivo para poder dejar un documento inactivo (restricción
-- documents_situation_publication_check).
update public.documents
set
  situation = 'archived',
  publication_status = 'inactive',
  archive_reason_code = 'NOT_APPLICABLE',
  deactivated_at = now(),
  deactivated_by = '99999999-9999-9999-9999-999999999999',
  deactivation_reason = 'prueba',
  is_deleted = true,
  deleted_at = now(),
  deleted_by = '99999999-9999-9999-9999-999999999999',
  deletion_reason = 'prueba'
where id in ('55555555-5555-5555-5555-555555555555', '66666666-6666-6666-6666-666666666666');

select is(
  (select count(*)::integer from public.get_related_documents('55555555-5555-5555-5555-555555555555')),
  0,
  'A soft-deleted source has no readable relations'
);

insert into public.document_relations (source_document_id, target_document_id, relation_type)
values ('11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666', 'cita');

select is(
  (select count(*)::integer from public.get_related_documents('11111111-1111-1111-1111-111111111111')
   where target_document_id = '66666666-6666-6666-6666-666666666666'),
  0,
  'A soft-deleted target is not returned as a relation'
);

rollback;
