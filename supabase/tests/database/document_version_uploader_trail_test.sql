begin;

select plan(7);

select has_column(
  'public',
  'document_versions',
  'uploaded_by_name',
  'Each version keeps the name of the administrator who uploaded it'
);

select ok(
  exists (
    select 1 from pg_trigger
    where tgrelid = 'public.document_versions'::regclass
      and tgname = 'document_versions_capture_uploader_name'
  ),
  'The uploader name is captured on insert, whatever the upload route is'
);

-- Identidad y módulo mínimos ---------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '37000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'trail.qa@example.test', 'x',
  now(), now(), now(), '{"provider":"email"}'::jsonb,
  '{"full_name":"Ana Responsable"}'::jsonb
);

update public.profiles
set full_name = 'Ana Responsable', role = 'admin'
where id = '37000000-0000-0000-0000-000000000901';

insert into public.modules (id, name, code, sort_order)
values ('37000000-0000-0000-0000-000000000101', 'Modulo QA rastro', 'QA_TRAIL_ROOT', 930);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '37000000-0000-0000-0000-000000000201',
      p_version_id := '37000000-0000-0000-0000-000000000301',
      p_title := 'Documento QA con rastro de responsable',
      p_document_type := 'DIRECTIVA',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2026::smallint,
      p_resolution_number := 'DIR-TRAIL-2026',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DIGEDD"}',
      p_module_ids := array['37000000-0000-0000-0000-000000000101']::uuid[],
      p_storage_path := 'qa-trail/document-201/v1.pdf',
      p_original_file_name := 'qa-trail.pdf',
      p_file_size_bytes := 1500::bigint,
      p_page_count := 2,
      p_sha256 := repeat('d', 64),
      p_actor_id := '37000000-0000-0000-0000-000000000901'
    );
  $$,
  'A document can be created by that administrator'
);

select is(
  (
    select uploaded_by_name
    from public.document_versions
    where id = '37000000-0000-0000-0000-000000000301'
  ),
  'Ana Responsable',
  'The upload records the administrator name without any join'
);

-- El rastro es inmutable ------------------------------------------------------

select throws_ok(
  $$
    update public.document_versions
    set uploaded_by_name = 'Otra persona'
    where id = '37000000-0000-0000-0000-000000000301'
  $$,
  'P0001',
  'Document versions are immutable; create a new version instead',
  'The recorded administrator name cannot be rewritten afterwards'
);

-- El rastro sobrevive al borrado del perfil -----------------------------------
-- Es el caso que motivó la deuda: al borrarse el perfil, el historial mostraba
-- "Cuenta no disponible" y se perdía el responsable sin dejar traza.

delete from auth.users where id = '37000000-0000-0000-0000-000000000901';

select is(
  (
    select count(*) from public.profiles
    where id = '37000000-0000-0000-0000-000000000901'
  ),
  0::bigint,
  'Deleting the identity removes its profile'
);

select is(
  (
    select uploaded_by_name
    from public.document_versions
    where id = '37000000-0000-0000-0000-000000000301'
  ),
  'Ana Responsable',
  'The audit trail survives the deletion of the uploader profile'
);

select * from finish();
rollback;
