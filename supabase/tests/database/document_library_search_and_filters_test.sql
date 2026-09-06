begin;

select plan(31);

-- Contratos nuevos -----------------------------------------------------------

select has_column(
  'public',
  'documents',
  'search_reference',
  'Documents expose a format-insensitive reference skeleton'
);

select ok(
  exists (
    select 1
    from pg_ts_config as config
    join pg_namespace as namespace on namespace.oid = config.cfgnamespace
    where config.cfgname = 'spanish_unaccent' and namespace.nspname = 'public'
  ),
  'An accent-insensitive Spanish search configuration is installed'
);

select is(
  public.normalize_document_reference('RVM N.° 081-2025-MINEDU'),
  'rvmn0812025minedu',
  'A normative reference collapses to its alphanumeric skeleton'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_document_uploaders()'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot list document uploaders directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_document_uploaders()'::regprocedure,
    'execute'
  ),
  'The server role can list document uploaders'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.list_document_library(text,smallint,text,text,uuid,uuid,public.document_situation,text,text,integer,integer,date,date,uuid)'::regprocedure,
    'execute'
  ),
  'Authenticated clients cannot query the library directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.list_document_library(text,smallint,text,text,uuid,uuid,public.document_situation,text,text,integer,integer,date,date,uuid)'::regprocedure,
    'execute'
  ),
  'The server role can query the library'
);

-- Fixtures -------------------------------------------------------------------

insert into public.modules (id, name, code, sort_order)
values ('36000000-0000-0000-0000-000000000101', 'Modulo QA buscador', 'QA_SEARCH_ROOT', 920);

select lives_ok(
  $$
    select public.create_governed_document_with_initial_version(
      p_document_id := '36000000-0000-0000-0000-000000000201',
      p_version_id := '36000000-0000-0000-0000-000000000301',
      p_title := 'Norma técnica sobre evaluación del desempeño docente',
      p_document_type := 'NORMA_TECNICA',
      p_issuing_entity := 'MINEDU',
      p_issuance_year := 2025::smallint,
      p_resolution_number := 'RVM N.° 081-2025-MINEDU',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DIGEDD","keywords":"licencia, salud"}',
      p_module_ids := array['36000000-0000-0000-0000-000000000101']::uuid[],
      p_storage_path := 'qa-search/document-201/v1.pdf',
      p_original_file_name := 'qa-norma.pdf',
      p_file_size_bytes := 2000::bigint,
      p_page_count := 3,
      p_sha256 := repeat('a', 64),
      p_actor_id := '36000000-0000-0000-0000-000000000901'
    );
    select public.create_governed_document_with_initial_version(
      p_document_id := '36000000-0000-0000-0000-000000000202',
      p_version_id := '36000000-0000-0000-0000-000000000302',
      p_title := 'Contratacion docente regional',
      p_document_type := 'RESOLUCION_MINISTERIAL',
      p_issuing_entity := 'DRE_GRE',
      p_issuance_year := 2026::smallint,
      p_resolution_number := 'RM-100-2026',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"DRE Lima"}',
      p_module_ids := array['36000000-0000-0000-0000-000000000101']::uuid[],
      p_storage_path := 'qa-search/document-202/v1.pdf',
      p_original_file_name := 'qa-contratacion.pdf',
      p_file_size_bytes := 2100::bigint,
      p_page_count := 3,
      p_sha256 := repeat('b', 64),
      p_actor_id := '36000000-0000-0000-0000-000000000901'
    );
    select public.create_governed_document_with_initial_version(
      p_document_id := '36000000-0000-0000-0000-000000000203',
      p_version_id := '36000000-0000-0000-0000-000000000303',
      p_title := 'Directiva QA de la Defensoria',
      p_document_type := 'DIRECTIVA',
      p_issuing_entity := 'DEFENSORIA_PUEBLO',
      p_issuance_year := 2024::smallint,
      p_resolution_number := 'DIR-QA-2024',
      p_article_reference := null,
      p_metadata := '{"specificDependency":"Oficina QA"}',
      p_module_ids := array['36000000-0000-0000-0000-000000000101']::uuid[],
      p_storage_path := 'qa-search/document-203/v1.pdf',
      p_original_file_name := 'qa-directiva.pdf',
      p_file_size_bytes := 2200::bigint,
      p_page_count := 3,
      p_sha256 := repeat('c', 64),
      p_actor_id := '36000000-0000-0000-0000-000000000901'
    );
  $$,
  'The audit fixtures are created through the governed transaction'
);

-- Buscador: acentos ----------------------------------------------------------
-- El corpus normativo peruano usa tildes y la ñ; los administradores escriben
-- sin ellas. Ambas direcciones deben encontrar el documento.

select is(
  (select count(*) from public.list_document_library(p_query := 'evaluacion')),
  1::bigint,
  'An unaccented query finds an accented title'
);
select is(
  (select count(*) from public.list_document_library(p_query := 'evaluación')),
  1::bigint,
  'An accented query still finds the same title'
);
select is(
  (select count(*) from public.list_document_library(p_query := 'desempeno docente')),
  1::bigint,
  'A query without the tilde over the n finds it'
);
select is(
  (select count(*) from public.list_document_library(p_query := 'contratación')),
  1::bigint,
  'An accented query finds a title stored without accents'
);

-- Buscador: numero del documento ---------------------------------------------
-- El parser de PostgreSQL convierte 'RM-100-2026' en '-100' y '-2026', de modo
-- que la busqueda por texto completo nunca casaba con '100-2026'.

select is(
  (select count(*) from public.list_document_library(p_query := '081-2025')),
  1::bigint,
  'A partial number finds a reference written with a space before the digits'
);
select is(
  (select count(*) from public.list_document_library(p_query := '100-2026')),
  1::bigint,
  'A partial number finds a reference written without a space'
);
select is(
  (select count(*) from public.list_document_library(p_query := '100/2026')),
  1::bigint,
  'A partial number tolerates a different separator'
);
select is(
  (select count(*) from public.list_document_library(p_query := 'RM-100')),
  1::bigint,
  'A number prefix finds its document'
);

-- Buscador: entidad y tipo por su etiqueta visible ---------------------------

select is(
  (select count(*) from public.list_document_library(p_query := 'DRE/GRE')),
  1::bigint,
  'The entity label shown in the filter finds its documents'
);
select is(
  (select count(*) from public.list_document_library(p_query := 'Defensoria del Pueblo')),
  1::bigint,
  'A readable entity name finds documents stored under its code'
);
select is(
  (select count(*) from public.list_document_library(p_query := 'resolucion ministerial')),
  1::bigint,
  'A readable document type finds documents stored under its code'
);
select is(
  (select count(*) from public.list_document_library(p_query := 'licencia')),
  1::bigint,
  'Administrator keywords are searchable'
);

-- Situacion: lo archivado y lo reemplazado NO desaparece ---------------------
-- Es el criterio de aceptación más crítico de la sección y no tenía prueba.

select lives_ok(
  $$
    select public.set_governed_document_situation(
      p_document_id := '36000000-0000-0000-0000-000000000203',
      p_situation := 'archived',
      p_actor_id := '36000000-0000-0000-0000-000000000901',
      p_archive_reason_code := 'DEROGATED_OR_EXPIRED'
    );
    select public.set_governed_document_situation(
      p_document_id := '36000000-0000-0000-0000-000000000202',
      p_situation := 'replaced',
      p_actor_id := '36000000-0000-0000-0000-000000000901',
      p_reason := 'Sustituida por la norma vigente',
      p_replacement_document_id := '36000000-0000-0000-0000-000000000201',
      p_replacement_year := 2026::smallint
    );
  $$,
  'A document can be archived and another replaced'
);

select is(
  (
    select count(*)
    from public.list_document_library()
    where id = '36000000-0000-0000-0000-000000000203'
  ),
  1::bigint,
  'Archived documents remain listed when no situation filter is applied'
);
select is(
  (
    select count(*)
    from public.list_document_library()
    where id = '36000000-0000-0000-0000-000000000202'
  ),
  1::bigint,
  'Replaced documents remain listed when no situation filter is applied'
);
select is(
  (
    select count(*)
    from public.list_document_library(p_situation := 'archived')
    where id = '36000000-0000-0000-0000-000000000203'
  ),
  1::bigint,
  'The situation filter still narrows the library'
);

-- Filtros de fecha de carga y de administrador -------------------------------

select is(
  (
    select count(*)
    from public.list_document_library(
      p_created_from := (now() at time zone 'America/Lima')::date,
      p_created_to := (now() at time zone 'America/Lima')::date
    )
    where id in (
      '36000000-0000-0000-0000-000000000201',
      '36000000-0000-0000-0000-000000000202',
      '36000000-0000-0000-0000-000000000203'
    )
  ),
  3::bigint,
  'The upload-date filter keeps documents registered today'
);
select is(
  (
    select count(*)
    from public.list_document_library(
      p_created_to := ((now() at time zone 'America/Lima')::date - 1)
    )
    where id in (
      '36000000-0000-0000-0000-000000000201',
      '36000000-0000-0000-0000-000000000202',
      '36000000-0000-0000-0000-000000000203'
    )
  ),
  0::bigint,
  'The upload-date filter excludes documents outside the range'
);
select is(
  (
    select count(*)
    from public.list_document_library(
      p_created_by := '36000000-0000-0000-0000-000000000901'
    )
    where id in (
      '36000000-0000-0000-0000-000000000201',
      '36000000-0000-0000-0000-000000000202',
      '36000000-0000-0000-0000-000000000203'
    )
  ),
  3::bigint,
  'The uploader filter keeps the documents that administrator registered'
);
select is(
  (
    select count(*)
    from public.list_document_library(
      p_created_by := '36000000-0000-0000-0000-000000000902'
    )
  ),
  0::bigint,
  'The uploader filter excludes every other administrator'
);
select throws_ok(
  $$
    select public.list_document_library(
      p_created_from := '2026-05-10'::date,
      p_created_to := '2026-05-01'::date
    )
  $$,
  '22023',
  'Upload date range is invalid',
  'An inverted upload-date range is rejected instead of returning nothing'
);

-- Orden por situacion: ciclo de vida, no token interno -----------------------

select is(
  (
    select array_agg(situation::text order by ordinality)
    from (
      select situation, row_number() over () as ordinality
      from public.list_document_library(p_sort := 'situation')
      where id in (
        '36000000-0000-0000-0000-000000000201',
        '36000000-0000-0000-0000-000000000202',
        '36000000-0000-0000-0000-000000000203'
      )
    ) as ordered
  ),
  array['current', 'replaced', 'archived'],
  'Sorting by situation follows the lifecycle instead of the English token'
);

select lives_ok(
  $$ select * from public.list_document_uploaders() $$,
  'The uploader directory can be queried'
);

select * from finish();
rollback;
