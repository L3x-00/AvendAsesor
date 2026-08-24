begin;

select plan(15);

select has_function(
  'public',
  'list_chat_conversations_page',
  array['uuid', 'integer', 'timestamp with time zone', 'uuid'],
  'History has a cursor-paginated server-only read contract'
);
select has_function(
  'public',
  'delete_chat_conversation',
  array['uuid', 'uuid'],
  'History has an owner-only soft deletion contract'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_chat_conversations_page(uuid,integer,timestamptz,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot list history directly'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.delete_chat_conversation(uuid,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot delete history directly'
);

insert into public.chat_conversations (
  id, user_id, title, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-00000000a401',
    '00000000-0000-0000-0000-00000000a501',
    'Más reciente',
    '2026-08-23T00:00:03.000Z',
    '2026-08-23T00:00:03.000Z'
  ),
  (
    '00000000-0000-0000-0000-00000000a402',
    '00000000-0000-0000-0000-00000000a501',
    'Cursor',
    '2026-08-23T00:00:02.000Z',
    '2026-08-23T00:00:02.000Z'
  ),
  (
    '00000000-0000-0000-0000-00000000a403',
    '00000000-0000-0000-0000-00000000a501',
    'Anterior',
    '2026-08-23T00:00:01.000Z',
    '2026-08-23T00:00:01.000Z'
  ),
  (
    '00000000-0000-0000-0000-00000000a404',
    '00000000-0000-0000-0000-00000000a502',
    'Ajena',
    '2026-08-23T00:00:04.000Z',
    '2026-08-23T00:00:04.000Z'
  );

select is(
  (select id from public.list_chat_conversations_page(
    '00000000-0000-0000-0000-00000000a501', 2, null, null
  ) limit 1),
  '00000000-0000-0000-0000-00000000a401'::uuid,
  'The first page starts with the latest owned conversation'
);
select is(
  (select id from public.list_chat_conversations_page(
    '00000000-0000-0000-0000-00000000a501', 2, null, null
  ) offset 1 limit 1),
  '00000000-0000-0000-0000-00000000a402'::uuid,
  'The first page uses stable timestamp and id ordering'
);
select is(
  (select id from public.list_chat_conversations_page(
    '00000000-0000-0000-0000-00000000a501',
    2,
    '2026-08-23T00:00:02.000Z',
    '00000000-0000-0000-0000-00000000a402'
  )),
  '00000000-0000-0000-0000-00000000a403'::uuid,
  'The next cursor does not repeat newer conversations'
);
select is(
  (select count(*) from public.list_chat_conversations_page(
    '00000000-0000-0000-0000-00000000a501',
    51,
    null,
    null
  )),
  3::bigint,
  'A page contains only owned active conversations'
);
select throws_ok(
  $partial_cursor$
    select * from public.list_chat_conversations_page(
      '00000000-0000-0000-0000-00000000a501',
      20,
      '2026-08-23T00:00:02.000Z',
      null
    )
  $partial_cursor$,
  '22023',
  'A chat cursor must contain both updated timestamp and id',
  'A partial cursor is rejected'
);
select throws_ok(
  $large_page$
    select * from public.list_chat_conversations_page(
      '00000000-0000-0000-0000-00000000a501',
      52,
      null,
      null
    )
  $large_page$,
  '22023',
  'The chat page limit must be between 1 and 51',
  'An unbounded history page is rejected'
);
select lives_ok(
  $delete_owned$
    select * from public.delete_chat_conversation(
      '00000000-0000-0000-0000-00000000a501',
      '00000000-0000-0000-0000-00000000a402'
    )
  $delete_owned$,
  'The owner can logically delete a conversation'
);
select ok(
  (select is_deleted from public.chat_conversations where id = '00000000-0000-0000-0000-00000000a402')
  and (select deleted_at is not null from public.chat_conversations where id = '00000000-0000-0000-0000-00000000a402'),
  'Logical deletion retains the record with a deletion timestamp'
);
select is(
  (select count(*) from public.list_chat_conversations_page(
    '00000000-0000-0000-0000-00000000a501',
    51,
    null,
    null
  )),
  2::bigint,
  'A logically deleted conversation is not listed or continued'
);
select throws_ok(
  $delete_again$
    select * from public.delete_chat_conversation(
      '00000000-0000-0000-0000-00000000a501',
      '00000000-0000-0000-0000-00000000a402'
    )
  $delete_again$,
  'P0002',
  'Chat conversation was not found',
  'Repeated deletion fails closed without changing history'
);
select throws_ok(
  $delete_foreign$
    select * from public.delete_chat_conversation(
      '00000000-0000-0000-0000-00000000a502',
      '00000000-0000-0000-0000-00000000a401'
    )
  $delete_foreign$,
  'P0002',
  'Chat conversation was not found',
  'A different user cannot delete another user history'
);

select * from finish();
rollback;

