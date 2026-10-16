-- (a) Una norma pedida por su número se resuelve aunque el número esté
-- declarado en el título y el campo registrado esté vacío.
--
-- Estado anterior (20261014042821): la compuerta exacta exigía
-- `nullif(btrim(resolution_number), '') is not null`, así que 90 de los 96
-- documentos reales quedaban inalcanzables por referencia exacta: el número
-- vive dentro del título («Año 2017: Norma de registro y control de asistencia
-- Resolución de Secretaría General N.° 326-2017-MINEDU») y el campo quedó vacío
-- en la carga. La consecuencia comprobada en producción fue una aclaración o
-- «sin evidencia» ante una norma nombrada por su número.
--
-- Regla única (espejo de `exactDocumentReferencesIn` en la API, que es el
-- resolver canónico del texto): la identidad de un documento es el número
-- registrado cuando existe; si no existe, se acepta el número que el título
-- declara con una etiqueta de tipo reconocible («Ley N.° 29988», «Resolución de
-- Secretaría General N.° 326-2017-MINEDU»). El número registrado manda: si hay
-- un número distinto registrado, el título no puede sustituirlo. El tipo
-- gobernado del documento sigue siendo obligatorio, y la RSG conserva su
-- etiqueta explícita y su tipo propio (ADR-0025).

-- Normaliza un número registrado o declarado: mayúsculas, sin signos y sin la
-- etiqueta del tipo ni el «N.°»/«NRO»/«NUMERO» inicial. Igual que la migración
-- anterior, el resultado es el segundo segmento de una clave `TIPO:NÚMERO`.
create function private.document_reference_number_key(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.upper(coalesce(p_value, '')),
        '[^A-Z0-9]', '', 'g'
      ),
      '^((DECRETOLEGISLATIVO|DECRETOSUPREMO|DIRECTIVA|RESOLUCIONDESECRETARIAGENERAL|RESOLUCIONVICEMINISTERIAL|RESOLUCIONMINISTERIAL|RESOLUCIONDIRECTORAL|RSG|RVM|RM|RD|DS|DL|LEY))?(N(RO|UMERO)?)?',
      '', 'g'
    ),
    ''
  );
$$;

-- Etiquetas de tipo que la compuerta exacta reconoce dentro de un título.
create function private.document_reference_prefix_codes()
returns table (prefix text, lookup_code text)
language sql
immutable
set search_path = ''
as $$
  select * from (values
    ('decreto legislativo', 'DL'),
    ('decreto supremo', 'DS'),
    ('resolucion de secretaria general', 'RSG'),
    ('resolucion ministerial', 'RM'),
    ('resolucion viceministerial', 'RVM'),
    ('resolucion directoral', 'RD'),
    ('directiva', 'DIRECTIVA'),
    ('ley', 'LEY'),
    ('ds', 'DS'),
    ('dl', 'DL'),
    ('rm', 'RM'),
    ('rvm', 'RVM'),
    ('rsg', 'RSG'),
    ('rd', 'RD')
  ) as prefixes(prefix, lookup_code);
$$;

-- Identidades `TIPO:NÚMERO` que un título declara explícitamente. Conserva un
-- solo criterio: etiqueta reconocible + número, sin adivinar dígitos sueltos.
create function private.document_title_reference_keys(p_title text)
returns table (lookup_code text, reference_key text)
language sql
immutable
set search_path = ''
as $$
  with compacted as (
    select pg_catalog.regexp_replace(
      pg_catalog.regexp_replace(
        pg_catalog.regexp_replace(
          pg_catalog.regexp_replace(
            pg_catalog.regexp_replace(
              pg_catalog.regexp_replace(
                pg_catalog.lower(coalesce(p_title, '')),
                '\mr\s*\.?\s*s\s*\.?\s*g\s*\.?', 'rsg', 'g'
              ),
              '\mr\s*\.?\s*v\s*\.?\s*m\s*\.?', 'rvm', 'g'
            ),
            '\md\s*\.?\s*s\s*\.?', 'ds', 'g'
          ),
          '\md\s*\.?\s*l\s*\.?', 'dl', 'g'
        ),
        '\mr\s*\.?\s*m\s*\.?', 'rm', 'g'
      ),
      '\mr\s*\.?\s*d\s*\.?', 'rd', 'g'
    ) as text
  ),
  matched as (
    select
      match[1] as prefix,
      private.document_reference_number_key(match[2]) as reference_key
    from compacted
    cross join lateral pg_catalog.regexp_matches(
      compacted.text,
      '\m(decreto\s+legislativo|decreto\s+s[uú]premo|resoluci[oó]n\s+de\s+secretar[ií]a\s+general|resoluci[oó]n\s+minist[ée]rial|resoluci[oó]n\s+viceminist[ée]rial|resoluci[oó]n\s+director[aá]l|directiva|ley|ds|dl|rm|rvm|rsg|rd)\s*(?:(?:n(?:ro)?|n[uú]mero)\s*)?[.°º:–—-]*\s*([0-9]{1,8}(?:\s*-\s*(?:19|20)[0-9]{2}(?:\s*-\s*[a-z]{2,20})?)?)',
      'g'
    ) as match
  )
  select
    prefixes.lookup_code,
    matched.reference_key
  from matched
  join private.document_reference_prefix_codes() as prefixes
    -- El título real trae tildes («Resolución Ministerial»): se comparan las
    -- etiquetas ya sin tildes y con espacios colapsados.
    on prefixes.prefix = pg_catalog.regexp_replace(
      pg_catalog.translate(
        pg_catalog.translate(matched.prefix, 'ÁÉÍÓÚÜÑ', 'AEIOUUN'),
        'áéíóúüñ', 'aeiouun'
      ),
      '\s+', ' ', 'g'
    )
  where matched.reference_key is not null
    and pg_catalog.char_length(matched.reference_key) >= 4;
$$;

-- Tipos gobernados que pueden responder por un código de referencia. La RSG
-- tiene tipo propio y conserva la bolsa heredada `OTRO`; en ambos casos el
-- emparejamiento sigue exigiendo la etiqueta explícita.
create function private.document_types_for_reference_code(p_lookup_code text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case p_lookup_code
    when 'DL' then array['DECRETO_LEGISLATIVO']
    when 'DS' then array['DECRETO_SUPREMO']
    when 'DIRECTIVA' then array['DIRECTIVA']
    when 'LEY' then array['LEY']
    when 'RD' then array['RESOLUCION_DIRECTORAL']
    when 'RM' then array['RESOLUCION_MINISTERIAL']
    when 'RVM' then array['RESOLUCION_VICEMINISTERIAL']
    when 'RSG' then array['RESOLUCION_SECRETARIA_GENERAL', 'OTRO']
    else array[]::text[]
  end;
$$;

revoke all on function private.document_reference_number_key(text)
  from public, anon, authenticated;
revoke all on function private.document_reference_prefix_codes()
  from public, anon, authenticated;
revoke all on function private.document_title_reference_keys(text)
  from public, anon, authenticated;
revoke all on function private.document_types_for_reference_code(text)
  from public, anon, authenticated;

create or replace function private.search_document_chunks_filtered(
  p_query_embedding extensions.vector(1536),
  p_query_text text,
  p_selected_module_id uuid default null,
  p_match_threshold real default 0.70,
  p_match_count integer default 5,
  p_retrieval_scope text default 'current',
  p_exact_reference_keys text[] default null
)
returns table (
  chunk_id uuid,
  document_id uuid,
  document_version_id uuid,
  document_title text,
  document_situation public.document_situation,
  version_number integer,
  page_start integer,
  page_end integer,
  section_title text,
  article_reference text,
  numeral_reference text,
  chunk_content text,
  semantic_score real,
  lexical_score real,
  module_ids uuid[],
  module_names text[]
)
language plpgsql
set search_path = ''
as $$
begin
  if p_query_embedding is null
    or p_query_text is null
    or char_length(btrim(p_query_text)) not between 1 and 8_000
    or p_match_threshold is null
    or p_match_threshold not between 0 and 1
    or p_match_count is null
    or p_match_count not between 1 and 10
    or p_retrieval_scope is null
    or p_retrieval_scope not in ('current', 'historical', 'archived_explicit')
    or (
      p_exact_reference_keys is not null
      and (
        cardinality(p_exact_reference_keys) not between 1 and 5
        or exists (
          select 1
          from pg_catalog.unnest(p_exact_reference_keys) as requested(reference_key)
          where requested.reference_key is null
            or requested.reference_key !~ '^[A-Z]{2,10}:[A-Z0-9]{4,64}$'
            or pg_catalog.split_part(requested.reference_key, ':', 1) not in (
              'DL', 'DS', 'DIRECTIVA', 'LEY', 'RD', 'RM', 'RSG', 'RVM'
            )
        )
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Invalid document search parameters';
  end if;

  perform pg_catalog.set_config(
    'hnsw.ef_search',
    greatest(40, least(200, p_match_count * 20))::text,
    true
  );
  perform pg_catalog.set_config('hnsw.iterative_scan', 'strict_order', true);

  return query
  with nearest as materialized (
    select
      chunk.id as matched_chunk_id,
      chunk.document_id as matched_document_id,
      chunk.document_version_id as matched_document_version_id,
      document.title as matched_document_title,
      document.situation as matched_document_situation,
      version.version_number as matched_version_number,
      chunk.page_start as matched_page_start,
      chunk.page_end as matched_page_end,
      chunk.section_title as matched_section_title,
      chunk.article_reference as matched_article_reference,
      chunk.numeral_reference as matched_numeral_reference,
      chunk.chunk_content as matched_chunk_content,
      chunk.embedding operator(extensions.<=>) p_query_embedding as matched_distance,
      pg_catalog.ts_rank_cd(
        chunk.content_tsv,
        pg_catalog.websearch_to_tsquery('spanish', p_query_text)
      )::real as matched_lexical_score
    from public.document_chunks as chunk
    join public.documents as document on document.id = chunk.document_id
    join public.document_versions as version
      on version.id = chunk.document_version_id
      and version.document_id = chunk.document_id
    where not document.is_deleted
      and not (document.metadata ? 'demoSeed')
      and private.document_version_is_approved_evidence(
        document.id,
        chunk.document_version_id
      )
      and version.ingestion_status::text = 'indexed'
      and (
        p_exact_reference_keys is null
        or exists (
          select 1
          from pg_catalog.unnest(p_exact_reference_keys) as requested(reference_key)
          where document.document_type = any (
              private.document_types_for_reference_code(
                pg_catalog.split_part(requested.reference_key, ':', 1)
              )
            )
            and (
              pg_catalog.split_part(requested.reference_key, ':', 1) <> 'RSG'
              or pg_catalog.regexp_replace(
                pg_catalog.translate(
                  pg_catalog.upper(
                    coalesce(document.resolution_number, '')
                    || ' '
                    || document.title
                  ),
                  'ÁÉÍÓÚÜÑ',
                  'AEIOUUN'
                ),
                '[^A-Z0-9]',
                '',
                'g'
              ) like '%RSG%'
              or pg_catalog.regexp_replace(
                pg_catalog.translate(
                  pg_catalog.upper(document.title),
                  'ÁÉÍÓÚÜÑ',
                  'AEIOUUN'
                ),
                '[^A-Z0-9]',
                '',
                'g'
              ) like '%RESOLUCIONDESECRETARIAGENERAL%'
            )
            and (
              private.document_reference_number_key(document.resolution_number)
                = pg_catalog.split_part(requested.reference_key, ':', 2)
              or (
                private.document_reference_number_key(document.resolution_number) is null
                and exists (
                  select 1
                  from private.document_title_reference_keys(document.title) as declared
                  where declared.lookup_code = pg_catalog.split_part(
                      requested.reference_key,
                      ':',
                      1
                    )
                    and declared.reference_key = pg_catalog.split_part(
                      requested.reference_key,
                      ':',
                      2
                    )
                )
              )
            )
        )
      )
      and (
        (
          p_retrieval_scope = 'current'
          and document.situation = 'current'
          and document.publication_status = 'active'
        )
        or (
          p_retrieval_scope = 'historical'
          and (
            (document.situation = 'current' and document.publication_status = 'active')
            or (document.situation = 'replaced' and document.publication_status = 'inactive')
          )
        )
        or (
          p_retrieval_scope = 'archived_explicit'
          and (
            (document.situation = 'current' and document.publication_status = 'active')
            or (
              document.situation in ('replaced', 'archived')
              and document.publication_status = 'inactive'
            )
          )
        )
      )
      and exists (
        select 1
        from public.document_modules as document_module
        join public.modules as module on module.id = document_module.module_id
        left join public.modules as parent on parent.id = module.parent_module_id
        where document_module.document_id = chunk.document_id
          and module.is_active
          and not module.is_deleted
          and (parent.id is null or (parent.is_active and not parent.is_deleted))
      )
      and (
        p_selected_module_id is null
        or exists (
          select 1
          from public.document_modules as selected_document_module
          join public.modules as selected_module
            on selected_module.id = selected_document_module.module_id
          left join public.modules as selected_parent
            on selected_parent.id = selected_module.parent_module_id
          where selected_document_module.document_id = chunk.document_id
            and (
              selected_document_module.module_id = p_selected_module_id
              or selected_module.parent_module_id = p_selected_module_id
            )
            and selected_module.is_active
            and not selected_module.is_deleted
            and (
              selected_parent.id is null
              or (selected_parent.is_active and not selected_parent.is_deleted)
            )
        )
      )
    order by chunk.embedding operator(extensions.<=>) p_query_embedding
    -- La búsqueda semántica conserva su límite de candidatos. En la ruta
    -- exacta se inspeccionan todos los fragmentos de los pocos documentos ya
    -- filtrados, para que un documento largo no desplace a otra norma pedida.
    limit case
      when p_exact_reference_keys is null then least(80, p_match_count * 8)
      else null
    end
  ), ranked as (
    select
      nearest.*,
      (1 - nearest.matched_distance)::real as matched_semantic_score,
      row_number() over (
        partition by nearest.matched_document_situation
        order by nearest.matched_distance,
          nearest.matched_lexical_score desc,
          nearest.matched_chunk_id
      ) as situation_rank,
      row_number() over (
        partition by nearest.matched_document_id
        order by nearest.matched_distance,
          nearest.matched_lexical_score desc,
          nearest.matched_chunk_id
      ) as document_rank
    from nearest
    where p_exact_reference_keys is not null
      or nearest.matched_distance <= 1 - p_match_threshold
  ), prioritized as (
    select
      ranked.*,
      case
        when p_retrieval_scope = 'historical'
          and ranked.matched_document_situation = 'current' then 0
        when p_retrieval_scope = 'historical' then 1
        when p_retrieval_scope = 'archived_explicit'
          and ranked.matched_document_situation = 'archived' then 0
        when p_retrieval_scope = 'archived_explicit'
          and ranked.matched_document_situation = 'current' then 1
        when p_retrieval_scope = 'archived_explicit' then 2
        else 0
      end as situation_priority
    from ranked
  )
  select
    prioritized.matched_chunk_id,
    prioritized.matched_document_id,
    prioritized.matched_document_version_id,
    prioritized.matched_document_title,
    prioritized.matched_document_situation,
    prioritized.matched_version_number,
    prioritized.matched_page_start,
    prioritized.matched_page_end,
    prioritized.matched_section_title,
    prioritized.matched_article_reference,
    prioritized.matched_numeral_reference,
    prioritized.matched_chunk_content,
    prioritized.matched_semantic_score,
    prioritized.matched_lexical_score,
    coalesce(module_data.module_ids, array[]::uuid[]),
    coalesce(module_data.module_names, array[]::text[])
  from prioritized
  cross join lateral (
    select
      array_agg(scope.module_id order by scope.module_name, scope.module_id) as module_ids,
      array_agg(scope.module_name order by scope.module_name, scope.module_id) as module_names
    from (
      select distinct
        coalesce(parent.id, module.id) as module_id,
        coalesce(parent.name, module.name) as module_name
      from public.document_modules as document_module
      join public.modules as module on module.id = document_module.module_id
      left join public.modules as parent on parent.id = module.parent_module_id
      where document_module.document_id = prioritized.matched_document_id
        and module.is_active
        and not module.is_deleted
        and (parent.id is null or (parent.is_active and not parent.is_deleted))
    ) as scope
  ) as module_data
  order by case
      when p_exact_reference_keys is not null then prioritized.document_rank
      else 1
    end,
    prioritized.situation_rank,
    prioritized.situation_priority,
    prioritized.matched_distance,
    prioritized.matched_lexical_score desc,
    prioritized.matched_chunk_id
  limit p_match_count;
end;
$$;

revoke all on function private.search_document_chunks_filtered(
  extensions.vector, text, uuid, real, integer, text, text[]
) from public, anon, authenticated;

comment on function private.search_document_chunks_filtered(
  extensions.vector, text, uuid, real, integer, text, text[]
) is 'Filtered retrieval. Exact references match the registered number, or the number the title explicitly declares when the registered number is absent; the governed document type and the RSG label remain mandatory.';
