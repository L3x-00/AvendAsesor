begin;

select plan(26);

select has_function(
  'public',
  'begin_chat_turn',
  array['uuid', 'uuid', 'uuid', 'text'],
  'Chat turns begin through a controlled RPC'
);
select has_function(
  'public',
  'complete_chat_turn',
  array['uuid', 'uuid', 'uuid', 'chat_message_role', 'text', 'jsonb', 'unanswered_question_reason', 'real'],
  'Chat replies complete through a controlled RPC'
);
select has_column(
  'public',
  'chat_messages',
  'in_reply_to_message_id',
  'Each completed reply is linked to the user message it completes'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.begin_chat_turn(uuid,uuid,uuid,text)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot begin chat turns directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.complete_chat_turn(uuid,uuid,uuid,public.chat_message_role,text,jsonb,public.unanswered_question_reason,real)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot complete chat turns directly'
);

insert into public.modules (id, name, code)
values
  ('00000000-0000-0000-0000-000000004101', 'Licencias de prueba', 'CHAT_LICENSES'),
  ('00000000-0000-0000-0000-000000004102', 'Escalafón de prueba', 'CHAT_ESCALAFON');

insert into public.documents (id, title, document_type)
values ('00000000-0000-0000-0000-000000004201', 'Norma de licencia para chat', 'NORMATIVE');

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values (
  '00000000-0000-0000-0000-000000004202',
  '00000000-0000-0000-0000-000000004201',
  1,
  'tests/chat/licencia.pdf',
  'licencia.pdf',
  'application/pdf',
  1024,
  1,
  repeat('d', 64)
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-000000004202'
where id = '00000000-0000-0000-0000-000000004201';

select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-000000004202',
  'processing'
);
select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-000000004202',
  'indexed'
);

update public.documents
set
  approval_status = 'ready',
  approved_version_id = '00000000-0000-0000-0000-000000004202'
where id = '00000000-0000-0000-0000-000000004201';

insert into public.document_modules (document_id, module_id)
values ('00000000-0000-0000-0000-000000004201', '00000000-0000-0000-0000-000000004101');

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, section_title, article_reference,
  numeral_reference, embedding
)
values (
  '00000000-0000-0000-0000-000000004301',
  '00000000-0000-0000-0000-000000004201',
  '00000000-0000-0000-0000-000000004202',
  0,
  'Artículo 5. La licencia se solicita mediante procedimiento institucional.',
  12,
  1,
  1,
  'Artículo 5',
  'Artículo 5',
  '5.1',
  array_fill(0.01::real, array[1536])::extensions.vector
);

select lives_ok(
  $chat$
    select * from public.begin_chat_turn(
      '00000000-0000-0000-0000-000000004501',
      null,
      '00000000-0000-0000-0000-000000004101',
      '¿Cómo solicito una licencia?'
    )
  $chat$,
  'A user can begin a selected-module chat turn'
);

select is(
  (select count(*) from public.chat_conversations where user_id = '00000000-0000-0000-0000-000000004501'),
  1::bigint,
  'Beginning a turn creates one owned conversation'
);
select is(
  (select count(*) from public.chat_messages),
  1::bigint,
  'Beginning a turn persists the user question before streaming'
);

insert into public.chat_conversations (id, user_id, selected_module_id, title)
values (
  '00000000-0000-0000-0000-000000004401',
  '00000000-0000-0000-0000-000000004501',
  '00000000-0000-0000-0000-000000004101',
  'Consulta controlada para completar'
);
insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-000000004402',
  '00000000-0000-0000-0000-000000004401',
  'user',
  '¿Cómo solicito una licencia?'
);

select lives_ok(
  $complete$
    select * from public.complete_chat_turn(
      '00000000-0000-0000-0000-000000004501',
      '00000000-0000-0000-0000-000000004401',
      '00000000-0000-0000-0000-000000004402',
      'assistant',
      'Debe seguir el procedimiento institucional vigente.',
      '[{"chunkId":"00000000-0000-0000-0000-000000004301","moduleId":"00000000-0000-0000-0000-000000004101","relevanceScore":0.98}]'::jsonb,
      null,
      0.98
    )
  $complete$,
  'An evidence-only answer is completed atomically with a real chunk citation'
);
select is(
  (select count(*) from public.chat_message_sources),
  1::bigint,
  'An assistant answer stores exactly its supplied evidence source'
);
select is(
  (select document_title from public.chat_message_sources),
  'Norma de licencia para chat',
  'The citation title is snapshotted from the real document rather than client input'
);
select is(
  (select source_rank from public.chat_message_sources),
  1,
  'The first persisted source receives rank one'
);
select is(
  (
    select in_reply_to_message_id
    from public.chat_messages
    where role = 'assistant'::public.chat_message_role
  ),
  '00000000-0000-0000-0000-000000004402'::uuid,
  'The completed answer is bound to its user question'
);
select throws_ok(
  $completed_question_mutation$
    update public.chat_messages
    set role = 'clarification'
    where id = '00000000-0000-0000-0000-000000004402'
  $completed_question_mutation$,
  'P0001',
  'A completed user message cannot change role or conversation',
  'A completed question cannot be detached from its reply'
);
select lives_ok(
  $duplicate_complete$
    select * from public.complete_chat_turn(
      '00000000-0000-0000-0000-000000004501',
      '00000000-0000-0000-0000-000000004401',
      '00000000-0000-0000-0000-000000004402',
      'assistant',
      'Debe seguir el procedimiento institucional vigente.',
      '[{"chunkId":"00000000-0000-0000-0000-000000004301","moduleId":"00000000-0000-0000-0000-000000004101","relevanceScore":0.98}]'::jsonb,
      null,
      0.98
    )
  $duplicate_complete$,
  'Retrying a completed turn returns its existing answer safely'
);
select is(
  (select count(*) from public.chat_messages as message where message.role = 'assistant'::public.chat_message_role),
  1::bigint,
  'A retry cannot duplicate an assistant message'
);
select is(
  (select count(*) from public.chat_message_sources),
  1::bigint,
  'A retry cannot duplicate source snapshots'
);
select throws_ok(
  $invalid_reply_link$
    insert into public.chat_messages (id, conversation_id, role, content)
    values (
      '00000000-0000-0000-0000-000000004405',
      '00000000-0000-0000-0000-000000004401',
      'assistant',
      'Respuesta sin pregunta.'
    )
  $invalid_reply_link$,
  'P0001',
  'A non-user message must reply to a user message',
  'Direct persistence cannot create an unlinked reply'
);

insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-000000004406',
  '00000000-0000-0000-0000-000000004401',
  'user',
  '¿La norma cita un documento inexistente?'
);

select throws_ok(
  $invalid_citation$
    select * from public.complete_chat_turn(
      '00000000-0000-0000-0000-000000004501',
      '00000000-0000-0000-0000-000000004401',
      '00000000-0000-0000-0000-000000004406',
      'assistant',
      'Respuesta inválida.',
      '[{"chunkId":"00000000-0000-0000-0000-000000004399","relevanceScore":0.7}]'::jsonb,
      null,
      0.7
    )
  $invalid_citation$,
  'P0002',
  'A cited document chunk was not found',
  'An invalid citation aborts the complete-turn transaction'
);
select is(
  (select count(*) from public.chat_messages as message where message.role = 'assistant'::public.chat_message_role),
  1::bigint,
  'An invalid citation cannot leave a partial assistant message'
);

insert into public.chat_conversations (id, user_id, title)
values (
  '00000000-0000-0000-0000-000000004403',
  '00000000-0000-0000-0000-000000004501',
  'Consulta controlada sin sustento'
);
insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-000000004404',
  '00000000-0000-0000-0000-000000004403',
  'user',
  'Consulta sin sustento disponible'
);
select lives_ok(
  $no_evidence$
    select * from public.complete_chat_turn(
      '00000000-0000-0000-0000-000000004501',
      '00000000-0000-0000-0000-000000004403',
      '00000000-0000-0000-0000-000000004404',
      'no_evidence',
      'No encontré información suficiente en los documentos vigentes.',
      '[]'::jsonb,
      'insufficient_evidence',
      null
    )
  $no_evidence$,
  'A no-evidence response records the unanswered-query workflow without a source'
);
select is(
  (select count(*) from public.unanswered_questions where reason = 'insufficient_evidence'),
  1::bigint,
  'No-evidence outcomes enter the unanswered-question queue'
);
select is(
  (select count(*) from public.chat_message_sources where message_id in (select message.id from public.chat_messages as message where message.role = 'no_evidence'::public.chat_message_role)),
  0::bigint,
  'No-evidence replies cannot persist citations'
);

select throws_ok(
  $chat$
    select * from public.get_chat_conversation(
      '00000000-0000-0000-0000-000000004599',
      '00000000-0000-0000-0000-000000004401'
    )
  $chat$,
  'P0002',
  'Chat conversation was not found',
  'A different user cannot read another user conversation through the RPC'
);
select is(
  (select count(*) from public.list_chat_conversations('00000000-0000-0000-0000-000000004501', 20)),
  3::bigint,
  'Conversation listing returns only the caller-owned conversations'
);
select is(
  jsonb_array_length(public.get_chat_conversation(
    '00000000-0000-0000-0000-000000004501',
    '00000000-0000-0000-0000-000000004401'
  ) -> 'messages'),
  3,
  'Conversation history returns ordered persisted user messages and completed replies'
);

select * from finish();

rollback;
