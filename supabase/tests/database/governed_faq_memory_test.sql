begin;

select plan(43);

select has_table('public', 'faq_memory_candidates', 'FAQ candidates are stored separately from retrieval evidence');
select has_table('public', 'faq_memory_observations', 'FAQ observations provide idempotent aggregate provenance');
select has_table('public', 'faq_memory_reviews', 'FAQ review decisions are audited separately');
select has_type('public', 'faq_memory_outcome', 'FAQ outcomes are constrained by an enum');
select has_type('public', 'faq_memory_review_status', 'FAQ review states are constrained by an enum');
select ok(
  exists (
    select 1
    from pg_constraint as candidate_constraint
    where candidate_constraint.conrelid = 'public.faq_memory_candidates'::regclass
      and candidate_constraint.contype = 'u'
      and candidate_constraint.conkey = array[
        (select attnum from pg_attribute where attrelid = 'public.faq_memory_candidates'::regclass and attname = 'question_fingerprint'),
        (select attnum from pg_attribute where attrelid = 'public.faq_memory_candidates'::regclass and attname = 'scope_key')
      ]
  ),
  'The fingerprint and scope unique constraint protects atomic FAQ aggregation'
);

select ok((select relrowsecurity from pg_class where oid = 'public.faq_memory_candidates'::regclass), 'FAQ candidates enable RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.faq_memory_observations'::regclass), 'FAQ observations enable RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.faq_memory_reviews'::regclass), 'FAQ reviews enable RLS');
select ok(not has_table_privilege('authenticated', 'public.faq_memory_candidates', 'select'), 'Authenticated clients cannot read FAQ candidates directly');
select ok(not has_table_privilege('authenticated', 'public.faq_memory_observations', 'select'), 'Authenticated clients cannot read FAQ observations directly');
select ok(not has_table_privilege('authenticated', 'public.faq_memory_reviews', 'select'), 'Authenticated clients cannot read FAQ reviews directly');
select ok(not has_function_privilege('authenticated', 'public.record_faq_memory_observation_v2(uuid,text)'::regprocedure, 'execute'), 'Authenticated clients cannot record FAQ observations directly');
select ok(not has_function_privilege('authenticated', 'public.complete_chat_turn_with_learning_v2(uuid,uuid,uuid,public.chat_message_role,text,jsonb,public.unanswered_question_reason,real,text)'::regprocedure, 'execute'), 'Authenticated clients cannot complete learned chat turns directly');

select has_function('public', 'record_faq_memory_observation_v2', array['uuid', 'text'], 'FAQ observations have a controlled RPC');
select has_function('public', 'complete_chat_turn_with_learning_v2', array['uuid', 'uuid', 'uuid', 'chat_message_role', 'text', 'jsonb', 'unanswered_question_reason', 'real', 'text'], 'Learned completion wraps the atomic chat contract');
select has_function('public', 'list_faq_memory_candidates_v2', array['uuid', 'faq_memory_review_status', 'integer'], 'Administrators can read a bounded review queue through an RPC');
select has_function('public', 'review_faq_memory_candidate_v2', array['uuid', 'uuid', 'faq_memory_review_status', 'text', 'text'], 'Administrators can review FAQ candidates through an RPC');
select has_function('public', 'get_faq_memory_quality_summary', array['uuid'], 'Administrators can obtain aggregate quality metrics through an RPC');

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000009901',
    'authenticated',
    'authenticated',
    'faq-reviewer@example.test',
    '{}'::jsonb,
    '{"full_name":"Revisor FAQ"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000009902',
    'authenticated',
    'authenticated',
    'faq-docente@example.test',
    '{}'::jsonb,
    '{"full_name":"Docente FAQ"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set role = 'superadmin'
where id = '00000000-0000-0000-0000-000000009901';

insert into public.modules (id, name, code)
values ('00000000-0000-0000-0000-000000009911', 'Licencias FAQ', 'FAQ_LICENSES');

insert into public.documents (id, title, document_type)
values ('00000000-0000-0000-0000-000000009912', 'Norma FAQ', 'NORMATIVE');

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values (
  '00000000-0000-0000-0000-000000009913',
  '00000000-0000-0000-0000-000000009912',
  1,
  'tests/faq/norma.pdf',
  'norma.pdf',
  'application/pdf',
  1024,
  1,
  repeat('f', 64)
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-000000009913'
where id = '00000000-0000-0000-0000-000000009912';

select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-000000009913',
  'processing'
);
select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-000000009913',
  'indexed'
);

insert into public.document_modules (document_id, module_id)
values ('00000000-0000-0000-0000-000000009912', '00000000-0000-0000-0000-000000009911');

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, embedding
)
values (
  '00000000-0000-0000-0000-000000009914',
  '00000000-0000-0000-0000-000000009912',
  '00000000-0000-0000-0000-000000009913',
  0,
  'La licencia se tramita conforme a la norma vigente.',
  10,
  1,
  1,
  array_fill(0.01::real, array[1536])::extensions.vector
);

insert into public.chat_conversations (id, user_id, selected_module_id, title)
values (
  '00000000-0000-0000-0000-000000009921',
  '00000000-0000-0000-0000-000000009902',
  '00000000-0000-0000-0000-000000009911',
  'Pregunta FAQ con evidencia'
);

insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-000000009922',
  '00000000-0000-0000-0000-000000009921',
  'user',
  '¿Cómo solicito una licencia para docente@example.test?'
);

select lives_ok(
  $learned_evidence$
    select * from public.complete_chat_turn_with_learning_v2(
      '00000000-0000-0000-0000-000000009902',
      '00000000-0000-0000-0000-000000009921',
      '00000000-0000-0000-0000-000000009922',
      'assistant',
      'Debe seguir el procedimiento vigente.',
      '[{"chunkId":"00000000-0000-0000-0000-000000009914","moduleId":"00000000-0000-0000-0000-000000009911","relevanceScore":0.95}]'::jsonb,
      null,
      0.95,
      repeat('a', 64)
    )
  $learned_evidence$,
  'A completed evidence-backed turn creates a governed FAQ observation atomically'
);
select is(
  (select review_label from public.faq_memory_candidates),
  null::text,
  'Automatic FAQ memory never copies the raw or redacted chat question into a shared candidate'
);
select throws_ok(
  $unredacted_eight_digit_identifier$
    insert into public.faq_memory_candidates (
      question_fingerprint,
      review_label,
      scope_key
    )
    values (
      repeat('c', 64),
      '¿Cómo solicito una licencia con 12345678?',
      'all'
    )
  $unredacted_eight_digit_identifier$,
  '22023',
  'FAQ memory review label is invalid or contains a direct identifier',
  'The database rejects a standalone eight-digit identifier if application redaction regresses'
);
select throws_ok(
  $unredacted_separated_identifier$
    insert into public.faq_memory_candidates (
      question_fingerprint,
      review_label,
      scope_key
    )
    values (
      repeat('d', 64),
      '¿Cómo solicito una licencia con DNI 12.345.678?',
      'all'
    )
  $unredacted_separated_identifier$,
  '22023',
  'FAQ memory review label is invalid or contains a direct identifier',
  'The database rejects a separated direct identifier if application redaction regresses'
);
select throws_ok(
  $unredacted_slash_identifier$
    insert into public.faq_memory_candidates (
      question_fingerprint,
      review_label,
      scope_key
    )
    values (
      repeat('e', 64),
      '¿Cómo solicito una licencia con DNI 12/345/678?',
      'all'
    )
  $unredacted_slash_identifier$,
  '22023',
  'FAQ memory review label is invalid or contains a direct identifier',
  'The database rejects a slash-separated direct identifier if application redaction regresses'
);
select throws_ok(
  $unredacted_four_group_identifier$
    insert into public.faq_memory_candidates (
      question_fingerprint,
      review_label,
      scope_key
    )
    values (
      repeat('f', 64),
      '¿Cómo solicito una licencia con DNI 12 34 56 78?',
      'all'
    )
  $unredacted_four_group_identifier$,
  '22023',
  'FAQ memory review label is invalid or contains a direct identifier',
  'The database rejects a four-group direct identifier if application redaction regresses'
);
select throws_ok(
  $unredacted_long_identifier$
    insert into public.faq_memory_candidates (
      question_fingerprint,
      review_label,
      scope_key
    )
    values (
      repeat('1', 64),
      '¿Cómo solicito una licencia con 4111111111111111?',
      'all'
    )
  $unredacted_long_identifier$,
  '22023',
  'FAQ memory review label is invalid or contains a direct identifier',
  'The database rejects a long direct identifier if application redaction regresses'
);
select is((select evidence_count from public.faq_memory_candidates), 1, 'Evidence outcomes are counted separately');

select lives_ok(
  $learned_retry$
    select * from public.complete_chat_turn_with_learning_v2(
      '00000000-0000-0000-0000-000000009902',
      '00000000-0000-0000-0000-000000009921',
      '00000000-0000-0000-0000-000000009922',
      'assistant',
      'Debe seguir el procedimiento vigente.',
      '[{"chunkId":"00000000-0000-0000-0000-000000009914","moduleId":"00000000-0000-0000-0000-000000009911","relevanceScore":0.95}]'::jsonb,
      null,
      0.95,
      repeat('a', 64)
    )
  $learned_retry$,
  'Retrying a learned chat turn remains safe'
);
select is((select count(*) from public.faq_memory_observations), 1::bigint, 'A retried chat turn cannot duplicate its FAQ observation');
select is((select occurrence_count from public.faq_memory_candidates), 1, 'A retried chat turn cannot inflate frequency');

insert into public.chat_conversations (id, user_id, selected_module_id, title)
values (
  '00000000-0000-0000-0000-000000009923',
  '00000000-0000-0000-0000-000000009902',
  '00000000-0000-0000-0000-000000009911',
  'Pregunta FAQ repetida'
);
insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-000000009924',
  '00000000-0000-0000-0000-000000009923',
  'user',
  '¿Cómo solicito una licencia?'
);
select lives_ok(
  $learned_repeat$
    select * from public.complete_chat_turn_with_learning_v2(
      '00000000-0000-0000-0000-000000009902',
      '00000000-0000-0000-0000-000000009923',
      '00000000-0000-0000-0000-000000009924',
      'assistant',
      'Debe seguir el procedimiento vigente.',
      '[{"chunkId":"00000000-0000-0000-0000-000000009914","moduleId":"00000000-0000-0000-0000-000000009911","relevanceScore":0.95}]'::jsonb,
      null,
      0.95,
      repeat('a', 64)
    )
  $learned_repeat$,
  'A second equivalent completed turn is accepted'
);
select is((select occurrence_count from public.faq_memory_candidates), 2, 'Equivalent completed turns aggregate into one FAQ candidate');

insert into public.chat_conversations (id, user_id, title)
values (
  '00000000-0000-0000-0000-000000009925',
  '00000000-0000-0000-0000-000000009902',
  'Pregunta FAQ sin evidencia'
);
insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-000000009926',
  '00000000-0000-0000-0000-000000009925',
  'user',
  'Consulta no sustentada'
);
select lives_ok(
  $learned_no_evidence$
    select * from public.complete_chat_turn_with_learning_v2(
      '00000000-0000-0000-0000-000000009902',
      '00000000-0000-0000-0000-000000009925',
      '00000000-0000-0000-0000-000000009926',
      'no_evidence',
      'No encontré información suficiente en los documentos vigentes.',
      '[]'::jsonb,
      'insufficient_evidence',
      null,
      repeat('b', 64)
    )
  $learned_no_evidence$,
  'A no-evidence outcome is also captured for review without becoming evidence'
);
select is(
  (select no_evidence_count from public.faq_memory_candidates where question_fingerprint = repeat('b', 64)),
  1,
  'No-evidence outcomes remain distinct in the candidate metrics'
);
select throws_ok(
  $cannot_approve_without_evidence$
    select public.review_faq_memory_candidate_v2(
      '00000000-0000-0000-0000-000000009901',
      (select id from public.faq_memory_candidates where question_fingerprint = repeat('b', 64)),
      'approved',
      null,
      'Solicitud de licencia docente'
    )
  $cannot_approve_without_evidence$,
  '23514',
  'An FAQ memory candidate without evidence observations cannot be approved',
  'A no-evidence candidate cannot be promoted as approved memory'
);
select lives_ok(
  $approve_evidence$
    select public.review_faq_memory_candidate_v2(
      '00000000-0000-0000-0000-000000009901',
      (select id from public.faq_memory_candidates where question_fingerprint = repeat('a', 64)),
      'approved',
      'La tendencia es válida para seguimiento documental.',
      'Solicitud de licencia docente'
    )
  $approve_evidence$,
  'A superadministrator can approve an evidence-backed candidate for operational tracking'
);
select is(
  (select status::text from public.faq_memory_candidates where question_fingerprint = repeat('a', 64)),
  'approved',
  'Approval updates only the candidate review state'
);
select is(
  (select review_label from public.faq_memory_candidates where question_fingerprint = repeat('a', 64)),
  'Solicitud de licencia docente',
  'Only a reviewer-provided operational label becomes readable FAQ metadata'
);
select is(
  (select count(*) from public.list_faq_memory_candidates_v2('00000000-0000-0000-0000-000000009901', 'pending_review', 20)),
  1::bigint,
  'The controlled review queue exposes only the requested bounded status'
);
select throws_ok(
  $docente_cannot_list$
    select * from public.list_faq_memory_candidates_v2('00000000-0000-0000-0000-000000009902', 'pending_review', 20)
  $docente_cannot_list$,
  '42501',
  'Only an active administrator may review FAQ memory candidates',
  'A docente cannot access the FAQ review queue through a server RPC'
);
select throws_ok(
  $observations_append_only$
    update public.faq_memory_observations set outcome = 'ambiguous'
  $observations_append_only$,
  '55000',
  'FAQ memory history is append-only',
  'FAQ observations cannot be rewritten'
);
select throws_ok(
  $reviews_append_only$
    update public.faq_memory_reviews set decision = 'rejected'
  $reviews_append_only$,
  '55000',
  'FAQ memory history is append-only',
  'FAQ review evidence cannot be rewritten'
);
select ok(
  position('faq_memory' in pg_get_functiondef('public.search_document_chunks(extensions.vector,text,uuid,real,integer)'::regprocedure)) = 0,
  'The document retrieval function never treats FAQ memory as a source of evidence'
);

select * from finish();

rollback;
