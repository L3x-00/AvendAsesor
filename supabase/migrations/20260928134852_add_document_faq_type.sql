-- Permite el tipo FAQ en la base, acorde al formulario y la API existentes.
create or replace function private.normalize_legacy_document_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.metadata := coalesce(new.metadata, '{}'::jsonb);

  if new.document_type not in (
    'RESOLUCION_MINISTERIAL', 'RESOLUCION_VICEMINISTERIAL',
    'RESOLUCION_DIRECTORAL', 'DECRETO_SUPREMO', 'DECRETO_LEGISLATIVO',
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
      'RESOLUCION_DIRECTORAL', 'DECRETO_SUPREMO', 'DECRETO_LEGISLATIVO',
      'LEY', 'REGLAMENTO', 'DIRECTIVA', 'NORMA_TECNICA', 'OFICIO',
      'MEMORANDUM', 'COMUNICADO', 'CRONOGRAMA', 'ANEXO',
      'PREGUNTAS_FRECUENTES', 'INFORME', 'INFOGRAFIA', 'OTRO'
    )
  );
