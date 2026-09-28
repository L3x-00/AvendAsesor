begin;

select plan(7);

-- Identidad y módulo mínimos ---------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '38000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'counters.qa@example.test', 'x',
  now(), now(), now(), '{"provider":"email"}'::jsonb,
  '{"full_name":"Contador QA"}'::jsonb
);

update public.profiles
set full_name = 'Contador QA', role = 'admin'
where id = '38000000-0000-0000-0000-000000000901';

insert into public.modules (id, name, code, sort_order)
values ('38000000-0000-0000-0000-000000000101', 'Modulo QA contadores', 'QA_COUNTERS_ROOT', 940);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '38000000-0000-0000-0000-000000000201',
      p_version_id := '38000000-0000-0000-0000-000000000301',
      p_title := 'Documento QA con contadores de uso',
      p_document_type := 'DIRECTIVA',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2026::smallint,
      p_resolution_number := 'DIR-COUNTERS-2026',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DIGEDD"}',
      p_module_ids := array['38000000-0000-0000-0000-000000000101']::uuid[],
      p_storage_path := 'qa-counters/document-201/v1.pdf',
      p_original_file_name := 'qa-counters.pdf',
      p_file_size_bytes := 2048::bigint,
      p_page_count := 1,
      p_sha256 := repeat('e', 64),
      p_actor_id := '38000000-0000-0000-0000-000000000901'
    );
  $$,
  'Un documento puede crearse para probar sus contadores'
);

-- Sin accesos los contadores están en cero -------------------------------------

select results_eq(
  $$
    select opens, downloads, last_download_at
    from public.get_document_usage_counters('38000000-0000-0000-0000-000000000201')
  $$,
  $$ values (0, 0, null::timestamptz) $$,
  'Sin accesos los contadores están en cero'
);

-- Una apertura (inline) y una descarga (attachment) ---------------------------

select lives_ok(
  $$
    select public.record_document_download_url(
      '38000000-0000-0000-0000-000000000201',
      '38000000-0000-0000-0000-000000000301',
      '38000000-0000-0000-0000-000000000901',
      'inline'
    );
  $$,
  'Se registra una apertura con su disposición'
);

select lives_ok(
  $$
    select public.record_document_download_url(
      '38000000-0000-0000-0000-000000000201',
      '38000000-0000-0000-0000-000000000301',
      '38000000-0000-0000-0000-000000000901',
      'attachment'
    );
  $$,
  'Se registra una descarga con su disposición'
);

select results_eq(
  $$
    select opens, downloads, (last_download_at is not null)
    from public.get_document_usage_counters('38000000-0000-0000-0000-000000000201')
  $$,
  $$ values (1, 1, true) $$,
  'Los contadores separan aperturas de descargas y guardan la última descarga'
);

-- La firma anterior sigue contando como apertura ------------------------------

select lives_ok(
  $$
    select public.record_document_download_url(
      '38000000-0000-0000-0000-000000000201',
      '38000000-0000-0000-0000-000000000301',
      '38000000-0000-0000-0000-000000000901'
    );
  $$,
  'La firma anterior sigue disponible durante el despliegue'
);

select results_eq(
  $$
    select opens, downloads
    from public.get_document_usage_counters('38000000-0000-0000-0000-000000000201')
  $$,
  $$ values (2, 1) $$,
  'El acceso heredado sin disposición cuenta como apertura'
);

select * from finish();
rollback;
