begin;

select plan(16);

-- Identidad y módulo mínimos ---------------------------------------------------

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data
) values (
  '39000000-0000-0000-0000-000000000901',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'versions.qa@example.test', 'x',
  now(), now(), now(), '{"provider":"email"}'::jsonb,
  '{"full_name":"Versionador QA"}'::jsonb
);

update public.profiles
set full_name = 'Versionador QA', role = 'admin'
where id = '39000000-0000-0000-0000-000000000901';

insert into public.modules (id, name, code, sort_order)
values ('39000000-0000-0000-0000-000000000101', 'Modulo QA versiones', 'QA_VERSIONS_ROOT', 950);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '39000000-0000-0000-0000-000000000201',
      p_version_id := '39000000-0000-0000-0000-000000000301',
      p_title := 'Documento QA de versiones con año',
      p_document_type := 'DIRECTIVA',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2024::smallint,
      p_resolution_number := 'DIR-VERSIONS-2024',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DIGEDD"}',
      p_module_ids := array['39000000-0000-0000-0000-000000000101']::uuid[],
      p_storage_path := 'qa-versions/document-201/v1.pdf',
      p_original_file_name := 'qa-versions-v1.pdf',
      p_file_size_bytes := 2048::bigint,
      p_page_count := 1,
      p_sha256 := repeat('f', 64),
      p_actor_id := '39000000-0000-0000-0000-000000000901'
    );
  $$,
  'Un documento puede crearse para probar versiones con año'
);

select lives_ok(
  $$
    do $ready$
    begin
      perform private.set_document_ingestion_status('39000000-0000-0000-0000-000000000301', 'processing');
      perform private.set_document_ingestion_status('39000000-0000-0000-0000-000000000301', 'indexed');
      perform public.set_document_technical_status(
        '39000000-0000-0000-0000-000000000201', 'ready',
        '39000000-0000-0000-0000-000000000901'
      );
    end;
    $ready$;
  $$,
  'La primera versión queda aprobada antes de complementarla'
);

select lives_ok(
  $$
    select public.add_governed_document_version(
      p_document_id := '39000000-0000-0000-0000-000000000201',
      p_version_id := '39000000-0000-0000-0000-000000000401',
      p_storage_path := 'qa-versions/document-201/v2.pdf',
      p_original_file_name := 'qa-versions-v2.pdf',
      p_file_size_bytes := 4096::bigint,
      p_page_count := 2,
      p_sha256 := repeat('a', 64),
      p_actor_id := '39000000-0000-0000-0000-000000000901',
      p_issuance_year := 2025::smallint,
      p_version_relation := 'complements'
    );
  $$,
  'Se agrega una versión con año y relación'
);

select is(
  private.document_version_is_approved_evidence(
    '39000000-0000-0000-0000-000000000201',
    '39000000-0000-0000-0000-000000000301'
  ),
  true,
  'El original aprobado permanece disponible mientras se revisa el complemento'
);

select is(
  private.document_version_is_approved_evidence(
    '39000000-0000-0000-0000-000000000201',
    '39000000-0000-0000-0000-000000000401'
  ),
  false,
  'El complemento pendiente no entra en respuestas'
);

select lives_ok(
  $$
    do $ready$
    begin
      perform private.set_document_ingestion_status('39000000-0000-0000-0000-000000000401', 'processing');
      perform private.set_document_ingestion_status('39000000-0000-0000-0000-000000000401', 'indexed');
      perform public.set_document_technical_status(
        '39000000-0000-0000-0000-000000000201', 'ready',
        '39000000-0000-0000-0000-000000000901'
      );
    end;
    $ready$;
  $$,
  'El complemento indexado se aprueba'
);

select is(
  private.document_version_is_approved_evidence(
    '39000000-0000-0000-0000-000000000201',
    '39000000-0000-0000-0000-000000000301'
  ),
  true,
  'Tras aprobar un complemento, el original sigue en el RAG'
);

select is(
  private.document_version_is_approved_evidence(
    '39000000-0000-0000-0000-000000000201',
    '39000000-0000-0000-0000-000000000401'
  ),
  true,
  'Tras aprobar un complemento, la versión nueva entra en el RAG'
);

select is(
  (
    select issuance_year from public.document_versions
    where id = '39000000-0000-0000-0000-000000000401'
  ),
  2025::smallint,
  'El año de la versión queda registrado'
);

select is(
  (
    select version_relation from public.document_versions
    where id = '39000000-0000-0000-0000-000000000401'
  ),
  'complements',
  'La relación con la versión anterior queda registrada'
);

select results_eq(
  $$
    select details ->> 'issuanceYear', details ->> 'versionRelation'
    from public.document_audit_events
    where document_version_id = '39000000-0000-0000-0000-000000000401'
      and action = 'version_added'
  $$,
  $$ values ('2025', 'complements') $$,
  'La auditoría de la versión conserva año y relación'
);

select throws_ok(
  $$
    select public.add_governed_document_version(
      p_document_id := '39000000-0000-0000-0000-000000000201',
      p_version_id := '39000000-0000-0000-0000-000000000402',
      p_storage_path := 'qa-versions/document-201/v3.pdf',
      p_original_file_name := 'qa-versions-v3.pdf',
      p_file_size_bytes := 4096::bigint,
      p_page_count := 2,
      p_sha256 := repeat('b', 64),
      p_actor_id := '39000000-0000-0000-0000-000000000901',
      p_version_relation := 'duplica'
    );
  $$,
  '22023',
  'The version relation is invalid',
  'Una relación distinta de reemplaza/complementa se rechaza'
);

select lives_ok(
  $$
    select public.add_governed_document_version(
      p_document_id := '39000000-0000-0000-0000-000000000201',
      p_version_id := '39000000-0000-0000-0000-000000000403',
      p_storage_path := 'qa-versions/document-201/v3.pdf',
      p_original_file_name := 'qa-versions-v3.pdf',
      p_file_size_bytes := 4096::bigint,
      p_page_count := 2,
      p_sha256 := repeat('c', 64),
      p_actor_id := '39000000-0000-0000-0000-000000000901',
      p_version_relation := 'replaces'
    );
  $$,
  'Se agrega una versión que reemplaza a las anteriores'
);

select lives_ok(
  $$
    do $ready$
    begin
      perform private.set_document_ingestion_status('39000000-0000-0000-0000-000000000403', 'processing');
      perform private.set_document_ingestion_status('39000000-0000-0000-0000-000000000403', 'indexed');
      perform public.set_document_technical_status(
        '39000000-0000-0000-0000-000000000201', 'ready',
        '39000000-0000-0000-0000-000000000901'
      );
    end;
    $ready$;
  $$,
  'La versión reemplazante se aprueba'
);

select is(
  private.document_version_is_approved_evidence(
    '39000000-0000-0000-0000-000000000201',
    '39000000-0000-0000-0000-000000000301'
  ),
  false,
  'El reemplazo retira la versión original del RAG'
);

select is(
  private.document_version_is_approved_evidence(
    '39000000-0000-0000-0000-000000000201',
    '39000000-0000-0000-0000-000000000403'
  ),
  true,
  'El reemplazo deja disponible la versión nueva'
);

select * from finish();
rollback;
