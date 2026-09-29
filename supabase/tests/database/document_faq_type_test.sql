begin;

select plan(2);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '3d000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'faq.qa@example.test', 'x',
  now(), now(), now(), '{"provider":"email"}'::jsonb,
  '{"full_name":"FAQ QA"}'::jsonb
);

insert into public.modules (id, name, code, sort_order)
values ('3d000000-0000-0000-0000-000000000101', 'FAQ QA', 'QA_FAQ_ROOT', 973);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '3d000000-0000-0000-0000-000000000201',
      p_version_id := '3d000000-0000-0000-0000-000000000301',
      p_title := 'Preguntas frecuentes QA',
      p_document_type := 'PREGUNTAS_FRECUENTES',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2026::smallint,
      p_resolution_number := null,
      p_article_reference := null,
      p_metadata := '{"specificDependency":"QA"}',
      p_module_ids := array['3d000000-0000-0000-0000-000000000101']::uuid[],
      p_storage_path := 'qa-faq/document-201/v1.pdf',
      p_original_file_name := 'faq-v1.pdf',
      p_file_size_bytes := 2048::bigint,
      p_page_count := 1,
      p_sha256 := repeat('d', 64),
      p_actor_id := '3d000000-0000-0000-0000-000000000901'
    );
  $$,
  'El tipo preguntas frecuentes se puede crear sin conversión a OTRO'
);

select is(
  (select document_type from public.documents
   where id = '3d000000-0000-0000-0000-000000000201'),
  'PREGUNTAS_FRECUENTES',
  'La base conserva el tipo FAQ para agruparlo en el tema'
);

select * from finish();
rollback;
