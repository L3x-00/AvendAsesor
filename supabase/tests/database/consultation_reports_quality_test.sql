begin;

select plan(60);

-- Private schema and server-only boundary -----------------------------------
select has_type('public', 'consultation_case_kind', 'Case kinds are constrained');
select has_type('public', 'consultation_case_status', 'Case statuses are constrained');
select has_type('public', 'consultation_case_issue', 'Quality issues are constrained');
select has_table('public', 'consultation_turns', 'Every canonical consultation turn is durable');
select has_table('public', 'consultation_cases', 'Quality cases are durable');
select has_table('public', 'consultation_case_attachments', 'Teacher attachments are private records');
select has_table('public', 'consultation_case_events', 'Case history is durable');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.consultation_cases'::regclass),
  'Consultation cases enable RLS'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.consultation_case_attachments'::regclass),
  'Consultation attachments enable RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.consultation_cases', 'select'),
  'Authenticated clients cannot read cases directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.create_teacher_consultation_case(uuid,public.consultation_case_kind,uuid,uuid,public.consultation_report_reason,text,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot create cases directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.create_teacher_consultation_case(uuid,public.consultation_case_kind,uuid,uuid,public.consultation_report_reason,text,uuid)'::regprocedure,
    'execute'
  ),
  'Only the server role can create a teacher case'
);
select has_function(
  'public',
  'begin_chat_turn_with_consultation_routing',
  array['uuid', 'uuid', 'uuid', 'text'],
  'Chat turns use the consultation-aware start RPC'
);
select has_function(
  'public',
  'complete_chat_turn_with_consultation_case',
  array['uuid', 'uuid', 'uuid', 'chat_message_role', 'text', 'jsonb', 'unanswered_question_reason', 'real', 'text', 'uuid', 'uuid', 'text', 'jsonb'],
  'Completed chat turns use the consultation-aware completion RPC'
);
select has_function(
  'public',
  'list_consultation_topics',
  array['uuid', 'text', 'integer'],
  'Detected topics are available through a server-only reporting RPC'
);
select has_function(
  'public',
  'list_consultation_review_priorities',
  array['uuid', 'text', 'integer'],
  'Open answer priorities are available through a server-only reporting RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_consultation_topics(uuid,text,integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot read detected topics directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_consultation_topics(uuid,text,integer)'::regprocedure,
    'execute'
  ),
  'The server role can read detected topics'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_consultation_review_priorities(uuid,text,integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot read answer priorities directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_consultation_review_priorities(uuid,text,integer)'::regprocedure,
    'execute'
  ),
  'The server role can read answer priorities'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_consultation_reports_dashboard(uuid,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot read the reports dashboard directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_consultation_reports_dashboard(uuid,text)'::regprocedure,
    'execute'
  ),
  'The server role can read the reports dashboard'
);
select ok(
  (select not public and file_size_limit = 10485760 from storage.buckets where id = 'consultation-case-attachments'),
  'The attachment bucket is private and bounded to 10 MiB'
);

-- Disposable identities and real document associations ----------------------
insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('70000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'consultas-admin@example.test', '{}'::jsonb, '{"full_name":"Administrador Consultas"}'::jsonb, now(), now()),
  ('70000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated', 'consultas-docente@example.test', '{}'::jsonb, '{"full_name":"Docente Consultas"}'::jsonb, now(), now()),
  ('70000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated', 'consultas-ajeno@example.test', '{}'::jsonb, '{"full_name":"Docente Ajeno"}'::jsonb, now(), now()),
  ('70000000-0000-4000-8000-000000000004', 'authenticated', 'authenticated', 'consultas-admin-expirado@example.test', '{}'::jsonb, '{"full_name":"Administrador Expirado"}'::jsonb, now(), now());

update public.profiles
set role = 'admin'::public.app_role
where id in ('70000000-0000-4000-8000-000000000001', '70000000-0000-4000-8000-000000000004');
update public.profiles
set access_expires_at = now() - interval '1 second'
where id = '70000000-0000-4000-8000-000000000004';

insert into public.modules (id, name, code, sort_order)
values
  ('71000000-0000-4000-8000-000000000001', 'Situaciones administrativas QA', 'CONSULTAS_ROOT', 10),
  ('71000000-0000-4000-8000-000000000002', 'Licencias QA', 'CONSULTAS_LICENSES', 20),
  ('71000000-0000-4000-8000-000000000003', 'Evaluación docente QA', 'CONSULTAS_EVALUATION', 30);
update public.modules
set parent_module_id = '71000000-0000-4000-8000-000000000001'
where id = '71000000-0000-4000-8000-000000000002';

insert into public.documents (id, title, document_type)
values ('72000000-0000-4000-8000-000000000001', 'Norma QA de licencias', 'NORMATIVE');
insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values (
  '73000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  1, 'tests/consultas/licencias.pdf', 'licencias.pdf',
  'application/pdf', 1024, 1, repeat('a', 64)
);
update public.documents
set current_version_id = '73000000-0000-4000-8000-000000000001'
where id = '72000000-0000-4000-8000-000000000001';
select private.set_document_ingestion_status('73000000-0000-4000-8000-000000000001', 'processing');
select private.set_document_ingestion_status('73000000-0000-4000-8000-000000000001', 'indexed');
update public.documents
set approval_status = 'ready', approved_version_id = '73000000-0000-4000-8000-000000000001'
where id = '72000000-0000-4000-8000-000000000001';
insert into public.document_modules (document_id, module_id)
values ('72000000-0000-4000-8000-000000000001', '71000000-0000-4000-8000-000000000002');
insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, section_title, article_reference,
  numeral_reference, embedding
)
values (
  '74000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  0, 'La licencia se solicita mediante el procedimiento institucional vigente.',
  12, 1, 1, 'Artículo 5', 'Artículo 5', '5.1',
  array_fill(0.01::real, array[1536])::extensions.vector
);

create temporary table consultas_fixture (
  conversation_id uuid,
  question_id uuid,
  answer_id uuid,
  partial_conversation_id uuid,
  partial_question_id uuid,
  partial_answer_id uuid,
  no_evidence_conversation_id uuid,
  no_evidence_question_id uuid,
  report_case_id uuid,
  report_attachment_id uuid,
  suggestion_case_id uuid,
  suggestion_attachment_id uuid
);
insert into consultas_fixture default values;

update consultas_fixture
set (conversation_id, question_id) = (
  select conversation_id, user_message_id
  from public.begin_chat_turn_with_consultation_routing(
    '70000000-0000-4000-8000-000000000002', null,
    '71000000-0000-4000-8000-000000000002',
    '¿Cómo solicito una licencia?'
  )
);
update consultas_fixture
set answer_id = (
  select answer_message_id
  from public.complete_chat_turn_with_consultation_case(
    '70000000-0000-4000-8000-000000000002', conversation_id, question_id,
    'assistant', 'La licencia se solicita mediante el procedimiento institucional vigente. [1]',
    '[{"sourceId":"75000000-0000-4000-8000-000000000001","chunkId":"74000000-0000-4000-8000-000000000001","moduleId":"71000000-0000-4000-8000-000000000002","relevanceScore":0.93}]'::jsonb,
    null, 0.93, null,
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002', 'current', '[]'::jsonb
  )
);

select is(
  (select detected_module_id from public.consultation_turns where answer_message_id = (select answer_id from consultas_fixture)),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'A completed answer persists the detected root module'
);
select is(
  (select detected_submodule_id from public.consultation_turns where answer_message_id = (select answer_id from consultas_fixture)),
  '71000000-0000-4000-8000-000000000002'::uuid,
  'A completed answer persists the detected submodule'
);
select is(
  (select count(*) from public.consultation_cases where consultation_turn_id = (select id from public.consultation_turns where answer_message_id = (select answer_id from consultas_fixture))),
  0::bigint,
  'A correctly grounded answer does not create an automatic incident'
);
select is(
  (
    select source ->> 'relatedSubmoduleName'
    from jsonb_array_elements(public.get_chat_conversation(
      '70000000-0000-4000-8000-000000000002',
      (select conversation_id from consultas_fixture)
    ) -> 'messages') as message,
    jsonb_array_elements(message -> 'sources') as source
    where message ->> 'id' = (select answer_id::text from consultas_fixture)
    limit 1
  ),
  'Licencias QA',
  'Owned chat history preserves the detected submodule route'
);

update consultas_fixture
set (partial_conversation_id, partial_question_id) = (
  select conversation_id, user_message_id
  from public.begin_chat_turn_with_consultation_routing(
    '70000000-0000-4000-8000-000000000002', null,
    '71000000-0000-4000-8000-000000000002',
    '¿La licencia se concede sin requisito adicional?'
  )
);
update consultas_fixture
set partial_answer_id = (
  select answer_message_id
  from public.complete_chat_turn_with_consultation_case(
    '70000000-0000-4000-8000-000000000002',
    partial_conversation_id,
    partial_question_id,
    'assistant', 'La licencia se concede automáticamente sin requisito adicional.',
    '[{"sourceId":"75000000-0000-4000-8000-000000000002","chunkId":"74000000-0000-4000-8000-000000000001","moduleId":"71000000-0000-4000-8000-000000000002","relevanceScore":0.91}]'::jsonb,
    null, 0.91, null,
    '71000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002', 'current',
    '{"signals":["support_partial"],"excerpts":{"support_partial":"La licencia se concede automáticamente sin requisito adicional."}}'::jsonb
  )
);
select is(
  (
    select quality_excerpts ->> 'support_partial'
    from public.consultation_turns
    where answer_message_id = (select partial_answer_id from consultas_fixture)
  ),
  'La licencia se concede automáticamente sin requisito adicional.',
  'The concrete unsupported answer fragment is retained with the quality signal'
);
select is(
  (
    select review_excerpt
    from public.consultation_cases
    where answer_message_id = (select partial_answer_id from consultas_fixture)
      and issue_type = 'support_partial'
  ),
  'La licencia se concede automáticamente sin requisito adicional.',
  'The automatic case exposes the exact answer fragment that needs review'
);

update consultas_fixture
set (no_evidence_conversation_id, no_evidence_question_id) = (
  select conversation_id, user_message_id
  from public.begin_chat_turn_with_consultation_routing(
    '70000000-0000-4000-8000-000000000002', null,
    '71000000-0000-4000-8000-000000000002',
    'Consulta sin sustento documental'
  )
);
select lives_ok(
  $$
    select * from public.complete_chat_turn_with_consultation_case(
      '70000000-0000-4000-8000-000000000002',
      (select no_evidence_conversation_id from consultas_fixture),
      (select no_evidence_question_id from consultas_fixture),
      'no_evidence', 'No encontré información suficiente en los documentos vigentes.',
      '[]'::jsonb, 'insufficient_evidence', null, null, null, null, 'current', '[]'::jsonb
    )
  $$,
  'A no-evidence reply completes through the consultation RPC'
);
select is(
  (select count(*) from public.consultation_cases where issue_type = 'support_insufficient'),
  1::bigint,
  'A no-evidence reply creates the support-insufficient case'
);

update consultas_fixture
set report_case_id = (
  select consultation_case_id
  from public.create_teacher_consultation_case(
    '70000000-0000-4000-8000-000000000002', 'teacher_report',
    answer_id, null, 'citation_does_not_support',
    'Solicito revisar el sustento de esta respuesta.',
    '76000000-0000-4000-8000-000000000001'
  )
);
select is(
  (select question_snapshot from public.consultation_cases where id = (select report_case_id from consultas_fixture)),
  '¿Cómo solicito una licencia?',
  'A teacher report snapshots the canonical original question'
);
select is(
  (select answer_snapshot from public.consultation_cases where id = (select report_case_id from consultas_fixture)),
  'La licencia se solicita mediante el procedimiento institucional vigente. [1]',
  'A teacher report snapshots the canonical original answer'
);
select ok(
  (select snapshot_complete from public.consultation_cases where id = (select report_case_id from consultas_fixture)),
  'A live teacher report records a complete canonical snapshot'
);
select throws_ok(
  $$
    select * from public.create_teacher_consultation_case(
      '70000000-0000-4000-8000-000000000003', 'teacher_report',
      (select answer_id from consultas_fixture), null, 'other', 'Intento ajeno.',
      '76000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0002', 'The report answer was not found',
  'A different teacher cannot report another user’s answer'
);

update consultas_fixture
set report_attachment_id = (
  select attachment_id
  from public.register_teacher_consultation_case_attachment(
    '70000000-0000-4000-8000-000000000002', report_case_id, 'report_image',
    report_case_id::text || '/' || repeat('b', 64) || '.png',
    'captura.png', 'image/png', 1024, repeat('b', 64)
  )
);
select isnt(
  (select report_attachment_id from consultas_fixture), null,
  'A SHA-256 storage path is accepted for a report image'
);
select is(
  (
    select attachment_id
    from public.register_teacher_consultation_case_attachment(
      '70000000-0000-4000-8000-000000000002',
      (select report_case_id from consultas_fixture), 'report_image',
      (select report_case_id::text || '/' || repeat('b', 64) || '.png' from consultas_fixture),
      'captura.png', 'image/png', 1024, repeat('b', 64)
    )
  ),
  (select report_attachment_id from consultas_fixture),
  'Retrying the same attachment is idempotent'
);
select is(
  (select count(*) from public.consultation_case_attachments where consultation_case_id = (select report_case_id from consultas_fixture)),
  1::bigint,
  'An idempotent retry does not duplicate the report image'
);
select throws_ok(
  $$
    select * from public.register_teacher_consultation_case_attachment(
      '70000000-0000-4000-8000-000000000002',
      (select report_case_id from consultas_fixture), 'report_image',
      (select report_case_id::text || '/' || repeat('c', 64) || '.jpg' from consultas_fixture),
      'otra.jpg', 'image/jpeg', 1024, repeat('c', 64)
    )
  $$,
  '23505', 'A report can have only one image attachment',
  'A report cannot accumulate multiple different images'
);
select throws_ok(
  $$
    select * from public.register_teacher_consultation_case_attachment(
      '70000000-0000-4000-8000-000000000002',
      (select report_case_id from consultas_fixture), 'report_image',
      (select report_case_id::text || '/' || repeat('d', 64) || '.pdf' from consultas_fixture),
      'norma.pdf', 'application/pdf', 1024, repeat('d', 64)
    )
  $$,
  '22023', 'A report attachment must be an image',
  'A report image cannot be a PDF'
);

select lives_ok(
  $$
    select public.link_consultation_case_document(
      '70000000-0000-4000-8000-000000000001',
      (select report_case_id from consultas_fixture),
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'An administrator can link a real document to a case'
);
select throws_ok(
  $$
    select public.decide_consultation_case_attachment(
      '70000000-0000-4000-8000-000000000001',
      (select report_case_id from consultas_fixture),
      (select report_attachment_id from consultas_fixture),
      'incorporated', '72000000-0000-4000-8000-000000000001', null
    )
  $$,
  '22023', 'Only a suggested document may be incorporated',
  'A report image can never be marked as a library document'
);

update consultas_fixture
set suggestion_case_id = (
  select consultation_case_id
  from public.create_teacher_consultation_case(
    '70000000-0000-4000-8000-000000000002', 'teacher_suggestion',
    null, conversation_id, null, 'Comparto una norma para revisión.',
    '76000000-0000-4000-8000-000000000003'
  )
);
update consultas_fixture
set suggestion_attachment_id = (
  select attachment_id
  from public.register_teacher_consultation_case_attachment(
    '70000000-0000-4000-8000-000000000002', suggestion_case_id, 'suggestion_file',
    suggestion_case_id::text || '/' || repeat('e', 64) || '.pdf',
    'norma.pdf', 'application/pdf', 1024, repeat('e', 64)
  )
);
select lives_ok(
  $$
    select public.link_consultation_case_document(
      '70000000-0000-4000-8000-000000000001',
      (select suggestion_case_id from consultas_fixture),
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'A suggested file can be connected to the reviewed library document'
);
select lives_ok(
  $$
    select public.decide_consultation_case_attachment(
      '70000000-0000-4000-8000-000000000001',
      (select suggestion_case_id from consultas_fixture),
      (select suggestion_attachment_id from consultas_fixture),
      'incorporated', '72000000-0000-4000-8000-000000000001',
      'Se vinculó tras revisar la fuente oficial.'
    )
  $$,
  'Only an explicitly reviewed suggested file can be incorporated'
);
select is(
  (select disposition::text from public.consultation_case_attachments where id = (select suggestion_attachment_id from consultas_fixture)),
  'incorporated',
  'The suggestion incorporation decision persists'
);
select lives_ok(
  $$
    select public.register_teacher_consultation_case_attachment(
      '70000000-0000-4000-8000-000000000002',
      (select suggestion_case_id from consultas_fixture),
      'suggestion_file',
      (select suggestion_case_id::text || '/' || repeat('f', 64) || '.png' from consultas_fixture),
      'captura-de-norma.png', 'image/png', 1024, repeat('f', 64)
    )
  $$,
  'A suggestion can retain an optional image alongside a submitted document'
);
select is(
  (
    select documents_suggested
    from public.get_consultation_reports_dashboard(
      '70000000-0000-4000-8000-000000000001', 'month'
    )
  ),
  1::bigint,
  'Only PDF or Word suggestions count as documents or norms suggested'
);

select throws_ok(
  $$
    update public.consultation_case_events
    set note = 'No permitido'
    where consultation_case_id = (select report_case_id from consultas_fixture)
  $$,
  'P0001', 'Consultation case events are append-only',
  'Case history cannot be rewritten directly'
);
select is(
  (
    select storage_path
    from public.authorize_consultation_case_attachment_download(
      '70000000-0000-4000-8000-000000000001',
      (select report_case_id from consultas_fixture),
      (select report_attachment_id from consultas_fixture)
    )
  ),
  (select report_case_id::text || '/' || repeat('b', 64) || '.png' from consultas_fixture),
  'An administrator receives the exact private attachment path only through authorization'
);
select throws_ok(
  $$
    select * from public.get_consultation_reports_dashboard(
      '70000000-0000-4000-8000-000000000004', 'month'
    )
  $$,
  '42501', 'Only an active administrator may perform this operation',
  'An expired administrator cannot inspect reports'
);
select is(
  (
    select top_consulted_module ->> 'id'
    from public.get_consultation_reports_dashboard(
      '70000000-0000-4000-8000-000000000001', 'month'
    )
  ),
  '71000000-0000-4000-8000-000000000001',
  'A turn selected in a submodule is ranked under its root module'
);
select ok(
  (
    select count(*) >= 2
    from public.list_consultation_cases(
      '70000000-0000-4000-8000-000000000001', 'month', null, null, null,
      '71000000-0000-4000-8000-000000000001', null, null, 100, 0
    )
  ),
  'Filtering by a root module includes cases requested from its submodule'
);
select is(
  (
    select name
    from public.list_consultation_topics(
      '70000000-0000-4000-8000-000000000001', 'month', 5
    )
    limit 1
  ),
  'Licencias QA',
  'Topics use the most specific detected route instead of the selected module'
);
do $$
begin
  perform private.create_automatic_consultation_case(
    (
      select id
      from public.consultation_turns
      where answer_message_id = (select answer_id from consultas_fixture)
    ),
    'support_partial'
  );
end;
$$;
select is(
  (
    select open_case_count
    from public.list_consultation_review_priorities(
      '70000000-0000-4000-8000-000000000001', 'month', 5
    )
    where answer_message_id = (select answer_id from consultas_fixture)
  ),
  2::bigint,
  'Several open cases for one answer are grouped into one review priority'
);
select throws_ok(
  $$
    select * from public.list_consultation_review_priorities(
      '70000000-0000-4000-8000-000000000004', 'month', 5
    )
  $$,
  '42501', 'Only an active administrator may perform this operation',
  'An expired administrator cannot inspect answer priorities'
);
select is(
  (
    select count(*)
    from public.consultation_case_sources
    where consultation_case_id = (select report_case_id from consultas_fixture)
  ),
  1::bigint,
  'A teacher report snapshots the exact source used by the reported answer'
);
select throws_ok(
  $$
    select public.update_consultation_case(
      '70000000-0000-4000-8000-000000000001',
      (select report_case_id from consultas_fixture), null, null, true,
      '71000000-0000-4000-8000-000000000003',
      '71000000-0000-4000-8000-000000000002'
    )
  $$,
  '23503', 'The detected submodule is invalid',
  'A route correction cannot pair a submodule with another root module'
);
select lives_ok(
  $$
    select public.update_consultation_case(
      '70000000-0000-4000-8000-000000000001',
      (select report_case_id from consultas_fixture), 'resolved',
      'La fuente y la vigencia fueron verificadas.', true,
      '71000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000002'
    )
  $$,
  'An administrator can preserve a corrected route, status and internal note'
);
select is(
  (select status::text from public.consultation_cases where id = (select report_case_id from consultas_fixture)),
  'resolved',
  'The governed case status persists'
);
select is(
  (
    select note
    from public.consultation_case_events
    where consultation_case_id = (select report_case_id from consultas_fixture)
      and event_type = 'note_added'
    order by created_at desc, id desc
    limit 1
  ),
  'La fuente y la vigencia fueron verificadas.',
  'The administrator note remains in the append-only history'
);

select * from finish();
rollback;
