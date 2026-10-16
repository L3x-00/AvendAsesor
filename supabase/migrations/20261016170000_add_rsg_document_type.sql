-- Tipo propio para las Resoluciones de Secretaría General (ADR-0025).
--
-- El catálogo gobernado no tenía un código para la RSG: cualquier valor
-- desconocido lo reescribía el trigger de gobernanza a OTRO, así que la
-- identidad editorial de la norma quedaba diluida en la bolsa «Otro» y la
-- recuperación por referencia exacta dependía de esa bolsa. Con el tipo propio,
-- las RSG se declaran y se filtran por su identidad real.
create or replace function private.normalize_legacy_document_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.document_type not in (
    'RESOLUCION_MINISTERIAL', 'RESOLUCION_VICEMINISTERIAL',
    'RESOLUCION_DIRECTORAL', 'RESOLUCION_SECRETARIA_GENERAL',
    'DECRETO_SUPREMO', 'DECRETO_LEGISLATIVO',
    'LEY', 'REGLAMENTO', 'DIRECTIVA', 'NORMA_TECNICA', 'OFICIO',
    'MEMORANDUM', 'COMUNICADO', 'CRONOGRAMA', 'ANEXO', 'PREGUNTAS_FRECUENTES', 'INFORME',
    'INFOGRAFIA', 'OTRO'
  ) then
    new.metadata := new.metadata || jsonb_build_object(
      'documentTypeOther', coalesce(nullif(btrim(new.document_type), ''), 'No especificado')
    );
    new.document_type := 'OTRO';
  end if;

  if upper(btrim(new.issuing_entity)) in (
    'MINEDU', 'MTPE', 'UGEL', 'DRE_GRE', 'SERVIR', 'SUNAFIL', 'MEF',
    'PCM', 'CONGRESO_REPUBLICA', 'TRIBUNAL_CONSTITUCIONAL',
    'DEFENSORIA_PUEBLO', 'GOBIERNO_REGIONAL', 'OTRA_INSTITUCION'
  ) then
    new.issuing_entity := upper(btrim(new.issuing_entity));
  elsif upper(btrim(new.issuing_entity)) = 'DRE/GRE' then
    new.issuing_entity := 'DRE_GRE';
  end if;

  if new.issuing_entity is null or new.issuing_entity not in (
    'MINEDU', 'MTPE', 'UGEL', 'DRE_GRE', 'SERVIR', 'SUNAFIL', 'MEF',
    'PCM', 'CONGRESO_REPUBLICA', 'TRIBUNAL_CONSTITUCIONAL',
    'DEFENSORIA_PUEBLO', 'GOBIERNO_REGIONAL', 'OTRA_INSTITUCION'
  ) then
    new.metadata := new.metadata || jsonb_build_object(
      'issuingEntityOther', coalesce(nullif(btrim(new.issuing_entity), ''), 'No especificada')
    );
    new.issuing_entity := 'OTRA_INSTITUCION';
  end if;

  new.issuance_year := coalesce(
    new.issuance_year,
    extract(year from coalesce(new.created_at, now()))::smallint
  );
  if nullif(btrim(new.metadata ->> 'specificDependency'), '') is null then
    new.metadata := new.metadata || jsonb_build_object(
      'specificDependency', 'No especificada'
    );
  end if;

  if new.document_type = 'OTRO'
    and nullif(btrim(new.metadata ->> 'documentTypeOther'), '') is null
    and tg_op = 'UPDATE'
    and old.document_type = 'OTRO'
  then
    new.metadata := new.metadata || jsonb_build_object(
      'documentTypeOther', old.metadata ->> 'documentTypeOther'
    );
  end if;

  if new.issuing_entity = 'OTRA_INSTITUCION'
    and nullif(btrim(new.metadata ->> 'issuingEntityOther'), '') is null
    and tg_op = 'UPDATE'
    and old.issuing_entity = 'OTRA_INSTITUCION'
  then
    new.metadata := new.metadata || jsonb_build_object(
      'issuingEntityOther', old.metadata ->> 'issuingEntityOther'
    );
  end if;

  if new.situation = 'archived' and new.archive_reason_code is null then
    if nullif(btrim(new.deactivation_reason), '') is null then
      new.archive_reason_code := 'NOT_APPLICABLE';
      new.archive_reason_detail := null;
    else
      new.archive_reason_code := 'OTHER';
      new.archive_reason_detail := btrim(new.deactivation_reason);
    end if;
  elsif new.situation = 'replaced' and new.archive_reason_code is null then
    new.archive_reason_code := 'REPLACED_BY_NEWER';
    new.archive_reason_detail := null;
  end if;

  return new;
end;
$$;

alter table public.documents drop constraint documents_governed_type_check;
alter table public.documents
  add constraint documents_governed_type_check check (
    document_type in (
      'RESOLUCION_MINISTERIAL', 'RESOLUCION_VICEMINISTERIAL',
      'RESOLUCION_DIRECTORAL', 'RESOLUCION_SECRETARIA_GENERAL',
      'DECRETO_SUPREMO', 'DECRETO_LEGISLATIVO',
      'LEY', 'REGLAMENTO', 'DIRECTIVA', 'NORMA_TECNICA', 'OFICIO',
      'MEMORANDUM', 'COMUNICADO', 'CRONOGRAMA', 'ANEXO',
      'PREGUNTAS_FRECUENTES', 'INFORME', 'INFOGRAFIA', 'OTRO'
    )
  );

-- El vector de búsqueda de la biblioteca enumera los tipos gobernados para que
-- «resolución de secretaría general» encuentre una RSG aunque su título no
-- repita la etiqueta (por ejemplo «Año 2018: Instructivo para la planilla de
-- pagos»). Se reconstruye el vector generado con el tipo nuevo: la columna es
-- derivada (sus valores se recalculan desde las mismas entradas) y solo la
-- consume `list_document_library_for_actor`.
drop index if exists public.documents_governed_metadata_search_idx;
alter table public.documents drop column governed_metadata_search_vector;
alter table public.documents
  add column governed_metadata_search_vector tsvector generated always as (
    setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'documentTypeOther', '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'issuingEntityOther', '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'specificDependency', '')), 'B')
    || setweight(to_tsvector('public.spanish_unaccent', coalesce(metadata ->> 'additionalDetail', '')), 'C')
    || setweight(to_tsvector('public.spanish_unaccent', case issuing_entity
        when 'MINEDU' then 'MINEDU Ministerio de Educacion'
        when 'MTPE' then 'MTPE Ministerio de Trabajo y Promocion del Empleo'
        when 'UGEL' then 'UGEL Unidad de Gestion Educativa Local'
        when 'DRE_GRE' then 'DRE GRE Direccion Regional de Educacion Gerencia Regional de Educacion'
        when 'SERVIR' then 'SERVIR Autoridad Nacional del Servicio Civil'
        when 'SUNAFIL' then 'SUNAFIL Superintendencia Nacional de Fiscalizacion Laboral'
        when 'MEF' then 'MEF Ministerio de Economia y Finanzas'
        when 'PCM' then 'PCM Presidencia del Consejo de Ministros'
        when 'CONGRESO_REPUBLICA' then 'Congreso de la Republica'
        when 'TRIBUNAL_CONSTITUCIONAL' then 'Tribunal Constitucional'
        when 'DEFENSORIA_PUEBLO' then 'Defensoria del Pueblo'
        when 'GOBIERNO_REGIONAL' then 'Gobierno Regional'
        when 'OTRA_INSTITUCION' then 'Otra institucion'
        else ''
      end), 'C')
    || setweight(to_tsvector('public.spanish_unaccent', case document_type
        when 'RESOLUCION_MINISTERIAL' then 'Resolucion Ministerial'
        when 'RESOLUCION_VICEMINISTERIAL' then 'Resolucion Viceministerial'
        when 'RESOLUCION_DIRECTORAL' then 'Resolucion Directoral'
        when 'RESOLUCION_SECRETARIA_GENERAL' then 'Resolucion de Secretaria General'
        when 'DECRETO_SUPREMO' then 'Decreto Supremo'
        when 'DECRETO_LEGISLATIVO' then 'Decreto Legislativo'
        when 'LEY' then 'Ley'
        when 'REGLAMENTO' then 'Reglamento'
        when 'DIRECTIVA' then 'Directiva'
        when 'NORMA_TECNICA' then 'Norma Tecnica'
        when 'OFICIO' then 'Oficio'
        when 'MEMORANDUM' then 'Memorandum'
        when 'COMUNICADO' then 'Comunicado'
        when 'CRONOGRAMA' then 'Cronograma'
        when 'ANEXO' then 'Anexo'
        when 'INFORME' then 'Informe'
        when 'INFOGRAFIA' then 'Infografia'
        when 'OTRO' then 'Otro'
        else ''
      end), 'C')
  ) stored;
create index documents_governed_metadata_search_idx
  on public.documents using gin (governed_metadata_search_vector);
