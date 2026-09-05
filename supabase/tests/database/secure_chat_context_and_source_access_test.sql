begin;

select plan(27);

select has_table(
  'public',
  'chat_source_access_events',
  'Private source access has an append-only audit relation'
);
select has_function(
  'public',
  'get_chat_conversation_context',
  array['uuid', 'uuid', 'integer', 'integer'],
  'Conversation continuity has a bounded owner-only RPC'
);
select has_function(
  'public',
  'authorize_chat_source_download',
  array['uuid', 'uuid'],
  'Citation downloads have an owner-only authorization RPC'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_chat_conversation_context(uuid,uuid,integer,integer)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot request server context directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.authorize_chat_source_download(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot authorize source downloads directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.get_chat_conversation_context(uuid,uuid,integer,integer)'::regprocedure,
    'execute'
  ),
  'Only the server role can load bounded context'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.authorize_chat_source_download(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Only the server role can authorize citation downloads'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.chat_source_access_events'::regclass),
  'The source access audit relation has RLS enabled'
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.chat_source_access_events',
    'select'
  ),
  'Authenticated clients cannot inspect source access audit data'
);
select ok(
  has_table_privilege(
    'service_role',
    'public.chat_source_access_events',
    'select'
  ),
  'The server role can inspect source access audit data'
);

insert into public.modules (id, name, code)
values (
  '00000000-0000-0000-0000-00000000e101',
  'Licencias de contexto',
  'CONTEXT_LICENSES'
);

insert into public.documents (id, title, document_type)
values (
  '00000000-0000-0000-0000-00000000e201',
  'Norma privada de licencias',
  'NORMATIVE'
);

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
  '00000000-0000-0000-0000-00000000e202',
  '00000000-0000-0000-0000-00000000e201',
  1,
  'tests/context/licencia.pdf',
  'licencia.pdf',
  'application/pdf',
  1024,
  1,
  repeat('e', 64)
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-00000000e202'
where id = '00000000-0000-0000-0000-00000000e201';

select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-00000000e202',
  'processing'
);
select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-00000000e202',
  'indexed'
);

update public.documents
set
  approval_status = 'ready',
  approved_version_id = '00000000-0000-0000-0000-00000000e202'
where id = '00000000-0000-0000-0000-00000000e201';

insert into public.document_modules (document_id, module_id)
values (
  '00000000-0000-0000-0000-00000000e201',
  '00000000-0000-0000-0000-00000000e101'
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
  embedding
)
values (
  '00000000-0000-0000-0000-00000000e301',
  '00000000-0000-0000-0000-00000000e201',
  '00000000-0000-0000-0000-00000000e202',
  0,
  'La orientación aplicable depende del tipo de licencia solicitado.',
  10,
  1,
  1,
  'Tipos de licencia',
  array_fill(0.01::real, array[1536])::extensions.vector
);

insert into public.chat_conversations (
  id,
  user_id,
  selected_module_id,
  title
)
values (
  '00000000-0000-0000-0000-00000000e401',
  '00000000-0000-0000-0000-00000000e501',
  '00000000-0000-0000-0000-00000000e101',
  'Conversación con contexto privado'
);

insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-00000000e601',
  '00000000-0000-0000-0000-00000000e401',
  'user',
  'Necesito orientación, pero todavía no precisé el tipo de licencia.'
);

select lives_ok(
  $clarification$
    select * from public.complete_chat_turn(
      '00000000-0000-0000-0000-00000000e501',
      '00000000-0000-0000-0000-00000000e401',
      '00000000-0000-0000-0000-00000000e601',
      'clarification',
      'La evidencia distingue tipos de licencia. ¿Qué tipo deseas consultar?',
      '[{"sourceId":"00000000-0000-0000-0000-00000000e701","chunkId":"00000000-0000-0000-0000-00000000e301","moduleId":"00000000-0000-0000-0000-00000000e101","relevanceScore":0.93}]'::jsonb,
      'ambiguous_request',
      0.93
    )
  $clarification$,
  'A clarification atomically persists its live supporting evidence'
);
select is(
  (
    select id
    from public.chat_message_sources
    where message_id in (
      select id
      from public.chat_messages
      where role = 'clarification'
    )
  ),
  '00000000-0000-0000-0000-00000000e701'::uuid,
  'The API-provided citation UUID is persisted unchanged'
);
select is(
  (
    select count(*)
    from public.unanswered_questions
    where reason = 'ambiguous_request'
  ),
  1::bigint,
  'Evidence-backed clarification still enters the review queue'
);
select is(
  (
    select source ->> 'id'
    from jsonb_array_elements(
      public.get_chat_conversation(
        '00000000-0000-0000-0000-00000000e501',
        '00000000-0000-0000-0000-00000000e401'
      ) -> 'messages'
    ) as message,
    jsonb_array_elements(message -> 'sources') as source
    limit 1
  ),
  '00000000-0000-0000-0000-00000000e701',
  'Owned history exposes the stored citation UUID without a bucket path'
);
select is(
  (
    select message ->> 'inReplyToMessageId'
    from jsonb_array_elements(
      public.get_chat_conversation(
        '00000000-0000-0000-0000-00000000e501',
        '00000000-0000-0000-0000-00000000e401'
      ) -> 'messages'
    ) as message
    where message ->> 'role' = 'clarification'
    limit 1
  ),
  '00000000-0000-0000-0000-00000000e601',
  'Owned history exposes the canonical user message linked to each reply'
);

insert into public.chat_messages (id, conversation_id, role, content, created_at)
values (
  '00000000-0000-0000-0000-00000000e602',
  '00000000-0000-0000-0000-00000000e401',
  'user',
  repeat('x', 1500),
  now() + interval '1 second'
);

select is(
  public.get_chat_conversation_context(
    '00000000-0000-0000-0000-00000000e501',
    '00000000-0000-0000-0000-00000000e401',
    1,
    1000
  ) ->> 'selectedModuleId',
  '00000000-0000-0000-0000-00000000e101',
  'Owned context carries the immutable selected module'
);
select is(
  jsonb_array_length(
    public.get_chat_conversation_context(
      '00000000-0000-0000-0000-00000000e501',
      '00000000-0000-0000-0000-00000000e401',
      1,
      1000
    ) -> 'messages'
  ),
  1,
  'Owned context enforces the requested message bound'
);
select is(
  char_length(
    public.get_chat_conversation_context(
      '00000000-0000-0000-0000-00000000e501',
      '00000000-0000-0000-0000-00000000e401',
      1,
      1000
    ) #>> '{messages,0,content}'
  ),
  1000,
  'Owned context truncates a message to the total character budget'
);
select throws_ok(
  $foreign_context$
    select public.get_chat_conversation_context(
      '00000000-0000-0000-0000-00000000e599',
      '00000000-0000-0000-0000-00000000e401',
      12,
      10000
    )
  $foreign_context$,
  'P0002',
  'Chat conversation was not found',
  'A different user cannot load another conversation context'
);
select is(
  (
    select storage_bucket
    from public.authorize_chat_source_download(
      '00000000-0000-0000-0000-00000000e501',
      '00000000-0000-0000-0000-00000000e701'
    )
  ),
  'normative-documents',
  'The owner can authorize the exact private source version'
);
select is(
  (select count(*) from public.chat_source_access_events),
  1::bigint,
  'A successful source authorization is audited once'
);
select throws_ok(
  $foreign_source$
    select * from public.authorize_chat_source_download(
      '00000000-0000-0000-0000-00000000e599',
      '00000000-0000-0000-0000-00000000e701'
    )
  $foreign_source$,
  'P0002',
  'Chat source was not found',
  'A different user cannot authorize another user citation'
);
select lives_ok(
  $retry_clarification$
    select * from public.complete_chat_turn(
      '00000000-0000-0000-0000-00000000e501',
      '00000000-0000-0000-0000-00000000e401',
      '00000000-0000-0000-0000-00000000e601',
      'clarification',
      'La evidencia distingue tipos de licencia. ¿Qué tipo deseas consultar?',
      '[{"sourceId":"00000000-0000-0000-0000-00000000e701","chunkId":"00000000-0000-0000-0000-00000000e301","moduleId":"00000000-0000-0000-0000-00000000e101","relevanceScore":0.93}]'::jsonb,
      'ambiguous_request',
      0.93
    )
  $retry_clarification$,
  'Retrying a clarification returns its existing reply idempotently'
);
select is(
  (select count(*) from public.chat_message_sources),
  1::bigint,
  'An idempotent clarification retry cannot duplicate citations'
);
select lives_ok(
  $soft_delete$
    update public.chat_conversations
    set is_deleted = true, deleted_at = now()
    where id = '00000000-0000-0000-0000-00000000e401'
  $soft_delete$,
  'The fixture conversation can be logically deleted'
);
select throws_ok(
  $deleted_source$
    select * from public.authorize_chat_source_download(
      '00000000-0000-0000-0000-00000000e501',
      '00000000-0000-0000-0000-00000000e701'
    )
  $deleted_source$,
  'P0002',
  'Chat source was not found',
  'A citation in deleted history cannot be authorized'
);
select is(
  (select count(*) from public.chat_source_access_events),
  1::bigint,
  'Rejected source authorization attempts cannot create audit successes'
);

select * from finish();
rollback;
