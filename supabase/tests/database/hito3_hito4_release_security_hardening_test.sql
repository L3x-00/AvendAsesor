begin;

select plan(13);

select ok(
  to_regprocedure('public.list_faq_memory_candidates(uuid,public.faq_memory_review_status,integer)') is null,
  'The revoked legacy FAQ RPC is removed instead of retaining an invalid contract'
);
select ok(
  to_regprocedure('public.record_faq_memory_observation(uuid,text,text)') is null,
  'The disabled legacy FAQ recorder is removed instead of retaining a misleading contract'
);
select ok(
  to_regprocedure('public.complete_chat_turn_with_learning(uuid,uuid,uuid,public.chat_message_role,text,jsonb,public.unanswered_question_reason,real,text,text)') is null,
  'The legacy FAQ completion wrapper is removed with its retired recorder'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.chat_message_sources'::regclass
      and tgname = 'chat_message_sources_require_live_evidence'
      and not tgisinternal
  ),
  'Every persisted chat citation is revalidated as live evidence'
);
select ok(
  position(
    'pg_advisory_xact_lock'
    in pg_get_functiondef(
      'public.update_administrative_user(uuid,uuid,public.app_role,public.account_status,text)'::regprocedure
    )
  ) > 0,
  'Administrative role changes serialize the active-superadministrator invariant'
);
select ok(
  not has_table_privilege('service_role', 'public.unanswered_question_reviews', 'insert'),
  'The server credential cannot mutate review history outside its controlled RPC'
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-00000000d501',
    'authenticated', 'authenticated', 'release-admin@example.test',
    '{}'::jsonb, '{"full_name":"Administrador de release"}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-00000000d502',
    'authenticated', 'authenticated', 'release-docente@example.test',
    '{}'::jsonb, '{"full_name":"Docente de release"}'::jsonb, now(), now()
  );

update public.profiles
set role = 'admin'
where id = '00000000-0000-0000-0000-00000000d501';

insert into public.unanswered_questions (id, user_id, question, reason)
values (
  '00000000-0000-0000-0000-00000000d601',
  '00000000-0000-0000-0000-00000000d502',
  'Mi correo docente.privado@example.test y teléfono 999999999 requieren ayuda.',
  'insufficient_evidence'
);

select is(
  (select question from public.unanswered_questions where id = '00000000-0000-0000-0000-00000000d601'),
  'Consulta sin evidencia: se requiere revisar la cobertura documental del módulo.',
  'The operations queue never stores the raw no-evidence question'
);

insert into public.unanswered_question_reviews (
  id, unanswered_question_id, reviewer_id, previous_status, decision, category, review_note
)
values (
  '00000000-0000-0000-0000-00000000d602',
  '00000000-0000-0000-0000-00000000d601',
  '00000000-0000-0000-0000-00000000d501',
  'pending_review', 'resolved', 'other', 'Nota inicial inmutable.'
);

select throws_ok(
  $review_update$
    update public.unanswered_question_reviews
    set review_note = 'Intento de reescritura.'
    where id = '00000000-0000-0000-0000-00000000d602'
  $review_update$,
  'P0001',
  'Unanswered question reviews are append-only',
  'Review history cannot be rewritten'
);
select throws_ok(
  $review_delete$
    delete from public.unanswered_question_reviews
    where id = '00000000-0000-0000-0000-00000000d602'
  $review_delete$,
  'P0001',
  'Unanswered question reviews are append-only',
  'Review history cannot be deleted'
);

update public.profiles
set
  account_status = 'suspended',
  status_changed_at = now(),
  status_changed_by = '00000000-0000-0000-0000-00000000d501',
  status_reason = 'Prueba de defensa en profundidad.'
where id = '00000000-0000-0000-0000-00000000d501';

select throws_ok(
  $inactive_admin_queue$
    select * from public.list_unanswered_questions(
      '00000000-0000-0000-0000-00000000d501',
      'pending_review',
      10
    )
  $inactive_admin_queue$,
  '42501',
  'Only an active administrator may perform this operation',
  'A suspended administrator cannot access the unanswered-question queue'
);
select throws_ok(
  $inactive_admin_faq$
    select * from public.list_faq_memory_candidates_v2(
      '00000000-0000-0000-0000-00000000d501',
      'pending_review',
      10
    )
  $inactive_admin_faq$,
  '42501',
  'Only an active administrator may review FAQ memory candidates',
  'A suspended administrator cannot access the FAQ review queue'
);

insert into public.modules (id, name, code)
values ('00000000-0000-0000-0000-00000000d701', 'Módulo de evidencia release', 'RELEASE_EVIDENCE');

insert into public.documents (id, title, document_type)
values ('00000000-0000-0000-0000-00000000d702', 'Norma de evidencia release', 'NORMATIVE');

insert into public.document_versions (
  id, document_id, version_number, storage_path, original_file_name,
  mime_type, file_size_bytes, page_count, sha256
)
values (
  '00000000-0000-0000-0000-00000000d703',
  '00000000-0000-0000-0000-00000000d702',
  1, 'tests/release/evidencia.pdf', 'evidencia.pdf',
  'application/pdf', 1024, 1, repeat('a', 64)
);

update public.documents
set current_version_id = '00000000-0000-0000-0000-00000000d703'
where id = '00000000-0000-0000-0000-00000000d702';

select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-00000000d703',
  'processing'
);
select private.set_document_ingestion_status(
  '00000000-0000-0000-0000-00000000d703',
  'indexed'
);

update public.documents
set
  approval_status = 'ready',
  approved_version_id = '00000000-0000-0000-0000-00000000d703'
where id = '00000000-0000-0000-0000-00000000d702';

insert into public.document_modules (document_id, module_id)
values ('00000000-0000-0000-0000-00000000d702', '00000000-0000-0000-0000-00000000d701');

insert into public.document_chunks (
  id, document_id, document_version_id, chunk_index, chunk_content,
  token_count, page_start, page_end, embedding
)
values (
  '00000000-0000-0000-0000-00000000d704',
  '00000000-0000-0000-0000-00000000d702',
  '00000000-0000-0000-0000-00000000d703',
  0, 'Evidencia que deja de ser aplicable para la prueba.',
  10, 1, 1, array_fill(0.01::real, array[1536])::extensions.vector
);

insert into public.chat_conversations (id, user_id, selected_module_id, title)
values (
  '00000000-0000-0000-0000-00000000d705',
  '00000000-0000-0000-0000-00000000d502',
  '00000000-0000-0000-0000-00000000d701',
  'Conversación de evidencia revocada'
);
insert into public.chat_messages (id, conversation_id, role, content)
values (
  '00000000-0000-0000-0000-00000000d706',
  '00000000-0000-0000-0000-00000000d705',
  'user', '¿Continúa vigente esta evidencia?'
);

update public.modules
set
  is_active = false,
  deactivated_at = now(),
  deactivated_by = '00000000-0000-0000-0000-00000000d501',
  deactivation_reason = 'Prueba de revocación de evidencia.'
where id = '00000000-0000-0000-0000-00000000d701';

select throws_ok(
  $inactive_evidence$
    select * from public.complete_chat_turn(
      '00000000-0000-0000-0000-00000000d502',
      '00000000-0000-0000-0000-00000000d705',
      '00000000-0000-0000-0000-00000000d706',
      'assistant',
      'Respuesta que no debe persistirse.',
      '[{"chunkId":"00000000-0000-0000-0000-00000000d704","moduleId":"00000000-0000-0000-0000-00000000d701","relevanceScore":0.9}]'::jsonb,
      null,
      0.9
    )
  $inactive_evidence$,
  '23503',
  'A cited source is no longer eligible as active evidence',
  'A deactivated source module cannot be persisted as chat evidence'
);
select is(
  (select count(*) from public.chat_messages where role = 'assistant'),
  0::bigint,
  'A rejected citation leaves no partial assistant response'
);

select * from finish();
rollback;
