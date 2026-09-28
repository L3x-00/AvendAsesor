begin;

select plan(8);

-- Identidad y módulo con submódulo ---------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '3a000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'history.qa@example.test', 'x',
  now(), now(), now(), '{"provider":"email"}'::jsonb,
  '{"full_name":"Historial QA"}'::jsonb
);

update public.profiles
set full_name = 'Historial QA', role = 'docente'
where id = '3a000000-0000-0000-0000-000000000901';

insert into public.modules (id, name, code, sort_order)
values
  ('3a000000-0000-0000-0000-000000000101', 'Modulo QA historial', 'QA_HISTORY_ROOT', 960),
  ('3a000000-0000-0000-0000-000000000102', 'Submodulo QA historial', 'QA_HISTORY_SUB', 961);

update public.modules
set parent_module_id = '3a000000-0000-0000-0000-000000000101'
where id = '3a000000-0000-0000-0000-000000000102';

select lives_ok(
  $$
    select public.begin_chat_turn(
      '3a000000-0000-0000-0000-000000000901',
      null,
      '3a000000-0000-0000-0000-000000000102',
      '¿Cuánto dura la licencia?'
    );
  $$,
  'Se inicia una conversación dentro de un submódulo'
);

select is(
  (
    select title from public.chat_conversations
    where user_id = '3a000000-0000-0000-0000-000000000901'
  ),
  '¿Cuánto dura la licencia?',
  'El título conserva la primera pregunta'
);

select is(
  (
    select selected_module_name from public.chat_conversations
    where user_id = '3a000000-0000-0000-0000-000000000901'
  ),
  'Submodulo QA historial',
  'El snapshot guarda el nombre del módulo elegido'
);

select is(
  (
    select selected_module_parent_name from public.chat_conversations
    where user_id = '3a000000-0000-0000-0000-000000000901'
  ),
  'Modulo QA historial',
  'El snapshot guarda el módulo raíz del submódulo'
);

select lives_ok(
  $$
    select public.begin_chat_turn(
      '3a000000-0000-0000-0000-000000000901',
      (
        select id from public.chat_conversations
        where user_id = '3a000000-0000-0000-0000-000000000901'
      ),
      '3a000000-0000-0000-0000-000000000102',
      '¿Y el plazo?'
    );
  $$,
  'Un segundo turno continúa la conversación'
);

select is(
  (
    select last_question from public.chat_conversations
    where user_id = '3a000000-0000-0000-0000-000000000901'
  ),
  '¿Y el plazo?',
  'La última pregunta se actualiza con cada turno'
);

select is(
  (
    select title from public.chat_conversations
    where user_id = '3a000000-0000-0000-0000-000000000901'
  ),
  '¿Cuánto dura la licencia?',
  'El título no se sobrescribe con la última pregunta'
);

select results_eq(
  $$
    select last_question, selected_module_name, selected_module_parent_name
    from public.list_chat_conversations_page(
      '3a000000-0000-0000-0000-000000000901'
    )
  $$,
  $$ values ('¿Y el plazo?', 'Submodulo QA historial', 'Modulo QA historial') $$,
  'La página del historial devuelve última pregunta y snapshot de tema'
);

select * from finish();
rollback;
