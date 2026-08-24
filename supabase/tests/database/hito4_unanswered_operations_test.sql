begin;

select plan(24);

select has_type('public', 'unanswered_question_status', 'Unanswered-question status is constrained');
select has_type('public', 'unanswered_question_category', 'Unanswered-question category is constrained');
select has_table('public', 'unanswered_question_reviews', 'Reviews are recorded separately');
select ok((select relrowsecurity from pg_class where oid = 'public.unanswered_question_reviews'::regclass), 'Review history enables RLS');
select has_function('public', 'list_unanswered_questions', array['uuid', 'unanswered_question_status', 'integer'], 'Administrators list a bounded queue through an RPC');
select has_function('public', 'review_unanswered_question', array['uuid', 'uuid', 'unanswered_question_status', 'unanswered_question_category', 'text'], 'Administrators classify a pending question through an RPC');
select has_function('public', 'get_hito4_operational_metrics', array['uuid'], 'Administrators receive aggregate operational metrics through an RPC');
select ok(not has_table_privilege('authenticated', 'public.unanswered_question_reviews', 'select'), 'Authenticated clients cannot read review history directly');
select ok(not has_function_privilege('authenticated', 'public.list_unanswered_questions(uuid,public.unanswered_question_status,integer)'::regprocedure, 'execute'), 'Authenticated clients cannot list the operational queue directly');
select ok(not has_function_privilege('authenticated', 'public.review_unanswered_question(uuid,uuid,public.unanswered_question_status,public.unanswered_question_category,text)'::regprocedure, 'execute'), 'Authenticated clients cannot review a question directly');

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-00000000b501',
    'authenticated',
    'authenticated',
    'hito4-admin@example.test',
    '{}'::jsonb,
    '{"full_name":"Administrador H4"}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-00000000b502',
    'authenticated',
    'authenticated',
    'hito4-docente@example.test',
    '{}'::jsonb,
    '{"full_name":"Docente H4"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set role = 'admin'
where id = '00000000-0000-0000-0000-00000000b501';

insert into public.unanswered_questions (
  id, user_id, question, reason, created_at
)
values
  (
    '00000000-0000-0000-0000-00000000b601',
    '00000000-0000-0000-0000-00000000b502',
    '¿Qué documento oficial regula este permiso?',
    'insufficient_evidence',
    '2026-08-23T02:00:00.000Z'
  ),
  (
    '00000000-0000-0000-0000-00000000b602',
    '00000000-0000-0000-0000-00000000b502',
    '¿A qué módulo corresponde este trámite?',
    'ambiguous_request',
    '2026-08-23T01:00:00.000Z'
  );

select is(
  (select question from public.list_unanswered_questions(
    '00000000-0000-0000-0000-00000000b501', 'pending_review', 10
  ) limit 1),
  'Consulta sin evidencia: se requiere revisar la cobertura documental del módulo.',
  'An administrator sees a generated operational summary rather than the docente raw question'
);
select ok(
  not (
    select to_jsonb(queue_row) ? 'user_id'
    from (
      select * from public.list_unanswered_questions(
        '00000000-0000-0000-0000-00000000b501', 'pending_review', 10
      ) limit 1
    ) as queue_row
  ),
  'The operational queue does not expose the requesting user id'
);
select throws_ok(
  $docente_list$
    select * from public.list_unanswered_questions(
      '00000000-0000-0000-0000-00000000b502', 'pending_review', 10
    )
  $docente_list$,
  '42501',
  'Only an active administrator may perform this operation',
  'A docente cannot list unanswered questions'
);
select throws_ok(
  $invalid_note$
    select public.review_unanswered_question(
      '00000000-0000-0000-0000-00000000b501',
      '00000000-0000-0000-0000-00000000b601',
      'resolved',
      'documentation_gap',
      'no'
    )
  $invalid_note$,
  '22023',
  'A classification and review note are required',
  'A review requires a meaningful note'
);
select throws_ok(
  $invalid_decision$
    select public.review_unanswered_question(
      '00000000-0000-0000-0000-00000000b501',
      '00000000-0000-0000-0000-00000000b601',
      'pending_review',
      'documentation_gap',
      'Se requiere cargar normativa vigente.'
    )
  $invalid_decision$,
  '22023',
  'An unanswered question must be resolved or dismissed',
  'A review cannot return an item to its pending state'
);
select lives_ok(
  $admin_review$
    select public.review_unanswered_question(
      '00000000-0000-0000-0000-00000000b501',
      '00000000-0000-0000-0000-00000000b601',
      'resolved',
      'documentation_gap',
      'Se requiere cargar normativa vigente.'
    )
  $admin_review$,
  'An administrator can classify and resolve a pending question'
);
select is(
  (select status::text from public.unanswered_questions where id = '00000000-0000-0000-0000-00000000b601'),
  'resolved',
  'A reviewed question leaves the pending queue'
);
select is(
  (select category::text from public.unanswered_questions where id = '00000000-0000-0000-0000-00000000b601'),
  'documentation_gap',
  'The review classification is persisted'
);
select is(
  (select count(*) from public.unanswered_question_reviews where unanswered_question_id = '00000000-0000-0000-0000-00000000b601'),
  1::bigint,
  'The decision receives an append-only review record'
);
select throws_ok(
  $repeat_review$
    select public.review_unanswered_question(
      '00000000-0000-0000-0000-00000000b501',
      '00000000-0000-0000-0000-00000000b601',
      'dismissed',
      'other',
      'No se requiere una segunda decisión.'
    )
  $repeat_review$,
  'P0002',
  'Unanswered question was not found for review',
  'A completed review cannot be overwritten'
);
select is(
  (select pending_unanswered_questions from public.get_hito4_operational_metrics(
    '00000000-0000-0000-0000-00000000b501'
  )),
  1::bigint,
  'Operational metrics count pending questions without exposing content'
);
select is(
  (select resolved_unanswered_questions from public.get_hito4_operational_metrics(
    '00000000-0000-0000-0000-00000000b501'
  )),
  1::bigint,
  'Operational metrics count resolved questions'
);
select is(
  (select provider_cost_status from public.get_hito4_operational_metrics(
    '00000000-0000-0000-0000-00000000b501'
  )),
  'not_configured',
  'Metrics do not invent provider costs before configuration'
);
select throws_ok(
  $docente_metrics$
    select * from public.get_hito4_operational_metrics(
      '00000000-0000-0000-0000-00000000b502'
    )
  $docente_metrics$,
  '42501',
  'Only an active administrator may perform this operation',
  'A docente cannot inspect operational metrics'
);

select * from finish();
rollback;
