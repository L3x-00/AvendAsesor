-- Metadatos verificables del RAG:
-- 1) `null` significa que el total físico todavía no fue comprobado;
-- 2) la ingesta confirma el total del PDF bajo su lease;
-- 3) los registros históricos solo conservan ubicaciones demostrables.

alter table public.document_versions
  alter column page_count drop not null;

alter table public.chat_message_sources
  alter column pdf_page_count drop not null;

-- La versión sigue siendo inmutable para cualquier llamador ordinario. Solo
-- la ruta privada de reconciliación de la ingesta puede completar page_count.
create or replace function private.prevent_document_version_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  old_status text := old.ingestion_status::text;
  new_status text := new.ingestion_status::text;
  transition_allowed boolean := coalesce(
    current_setting('app.avend_ingestion_transition', true),
    ''
  ) = 'active';
  page_count_reconciliation_allowed boolean := coalesce(
    current_setting('app.avend_page_count_reconciliation', true),
    ''
  ) = 'active';
begin
  if new.document_id is distinct from old.document_id
    or new.version_number is distinct from old.version_number
    or new.storage_bucket is distinct from old.storage_bucket
    or new.storage_path is distinct from old.storage_path
    or new.original_file_name is distinct from old.original_file_name
    or new.mime_type is distinct from old.mime_type
    or new.file_size_bytes is distinct from old.file_size_bytes
    or (
      new.page_count is distinct from old.page_count
      and not page_count_reconciliation_allowed
    )
    or new.sha256 is distinct from old.sha256
    or new.uploaded_at is distinct from old.uploaded_at
    or new.uploaded_by is distinct from old.uploaded_by
    or new.uploaded_by_name is distinct from old.uploaded_by_name then
    raise exception 'Document versions are immutable; create a new version instead';
  end if;

  if old_status is distinct from new_status then
    if not transition_allowed then
      raise exception 'Document ingestion state is controlled by the ingestion worker';
    end if;

    if not (
      (old_status = 'pending' and new_status in ('processing', 'failed'))
      or (old_status = 'processing' and new_status in ('pending', 'indexed', 'failed'))
      or (old_status = 'failed' and new_status = 'pending')
      or (old_status = 'indexed' and new_status = 'pending')
    ) then
      raise exception 'Invalid document ingestion state transition: % -> %', old_status, new_status;
    end if;
  elsif new.ingestion_updated_at is distinct from old.ingestion_updated_at
    and not transition_allowed then
    raise exception 'Document ingestion state is controlled by the ingestion worker';
  end if;

  return new;
end;
$$;

revoke all on function private.prevent_document_version_mutation()
  from public, anon, authenticated;

-- La reparación del snapshot requiere una ventana explícita y solo permite
-- variar el total de páginas; identidad y situación permanecen inmutables.
create or replace function private.prevent_chat_source_situation_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  metadata_repair_allowed boolean := coalesce(
    current_setting('app.avend_chat_source_metadata_repair', true),
    ''
  ) = 'active';
begin
  if metadata_repair_allowed
    and new.document_id is not distinct from old.document_id
    and new.document_version_id is not distinct from old.document_version_id
    and new.document_situation is not distinct from old.document_situation
    and new.document_type is not distinct from old.document_type
    and new.resolution_number is not distinct from old.resolution_number
    and new.issuance_year is not distinct from old.issuance_year then
    return new;
  end if;

  raise exception using
    errcode = 'P0001',
    message = 'A persisted chat source situation is immutable';
end;
$$;

revoke all on function private.prevent_chat_source_situation_mutation()
  from public, anon, authenticated;

-- Reparación controlada. No se adivina el total de un archivo no paginado ni
-- de un PDF grande/no legible. El máximo page_end solo corrige un total previo
-- que sea imposible; no convierte un límite inferior en un total físico.
select set_config('app.avend_page_count_reconciliation', 'active', true);

update public.document_versions as version
set page_count = null
where version.page_count is not null
  and (
    version.mime_type <> 'application/pdf'
    or (
      version.mime_type = 'application/pdf'
      and version.page_count = 1
      and (
        version.file_size_bytes > 20 * 1024 * 1024
        or exists (
          select 1
          from public.document_ingestion_jobs as job
          where job.document_version_id = version.id
            and job.last_error_code = 'UNREADABLE_PDF'
        )
      )
    )
  );

with verified_pages as (
  select
    chunk.document_version_id,
    max(chunk.page_end)::integer as page_count
  from public.document_chunks as chunk
  group by chunk.document_version_id
)
update public.document_versions as version
set page_count = verified.page_count
from verified_pages as verified
where version.id = verified.document_version_id
  and version.mime_type = 'application/pdf'
  and version.page_count is not null
  and version.page_count < verified.page_count;

select set_config('app.avend_page_count_reconciliation', '', true);

-- Regla pura y testeable para la reparación histórica. Las mayúsculas por sí
-- solas no prueban una sección y una oración dispositiva no es un subtítulo.
-- Una referencia ausente puede ser contexto propagado de una ventana previa;
-- una referencia presente solo vale al inicio o tras rótulos estructurales.
create or replace function private.is_verifiable_rag_location(
  p_content text,
  p_marker text,
  p_kind text
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  normalized_content text := ltrim(coalesce(p_content, ''));
  normalized_marker text := rtrim(btrim(coalesce(p_marker, '')), '…');
  marker_position integer;
  prefix_line text;
  prefix_pattern text;
  structural_pattern constant text := '^(cap[ií]tulos?|art[ií]culos?|t[ií]tulos?|secci[oó]n(es)?|anexos?|disposici[oó]n(es)?)([^[:alpha:]]|$)';
  container_pattern constant text := '^(cap[ií]tulos?|t[ií]tulos?|secci[oó]n(es)?|anexos?|disposici[oó]n(es)?)([^[:alpha:]]|$)';
  directive_pattern constant text := '^(art[ií]culos?[[:space:]]+[^[:space:]]+[[:space:].:;—–-]*)?(apru[eé](base|bese)|modif[ií](case|quese)|disp[oó]ngase|autor[ií](zase|cese)|der[oó]g(ase|uese)|incorp[oó]r(ase|ese)|publ[ií]quese|enc[aá]rguese|decl[aá]rese|d[eé]jase|establ[eé]cese|prec[ií]sase|sustit[uú]yase|excl[uú]yase|ampl[ií]ase|prorr[oó]gase|reg[ií]strese|comun[ií]quese|c[uú]mplase|refr[eé]ndese|ot[oó]rgase|conc[eé]dese|des[ií]gnase|conf[oó]rmase|resu[eé]lvase|ac[eé]ptase|rectif[ií]quese|susp[eé]ndase)([^[:alpha:]]|$)';
begin
  if normalized_content = ''
    or normalized_marker = ''
    or p_kind not in ('section', 'article', 'numeral') then
    return false;
  end if;

  marker_position := strpos(lower(normalized_content), lower(normalized_marker));
  if marker_position = 0 then
    return true;
  end if;

  if p_kind = 'section' and normalized_marker ~* directive_pattern then
    return false;
  end if;

  if p_kind = 'section'
    and right(normalized_marker, 1) = '.'
    and (
      normalized_marker ~* '^art[ií]culos?([^[:alpha:]]|$)'
      or (
        marker_position > 1
        and left(normalized_content, marker_position - 1)
          ~* 'art[ií]culos?[[:space:]]+[^[:space:]]+'
      )
    ) then
    return false;
  end if;

  if marker_position = 1 then
    return p_kind <> 'section' or normalized_marker ~* structural_pattern;
  end if;

  prefix_pattern := case
    when p_kind = 'article' then container_pattern
    else structural_pattern
  end;
  foreach prefix_line in array regexp_split_to_array(
    left(normalized_content, marker_position - 1),
    E'[\\r\\n]+'
  ) loop
    if btrim(prefix_line) <> '' and btrim(prefix_line) !~* prefix_pattern then
      return false;
    end if;
  end loop;
  return true;
end;
$$;

revoke all on function private.is_verifiable_rag_location(text, text, text)
  from public, anon, authenticated;

update public.document_chunks
set section_title = null
where section_title is not null
  and not private.is_verifiable_rag_location(
    chunk_content,
    section_title,
    'section'
  );

update public.document_chunks
set article_reference = null
where article_reference is not null
  and not private.is_verifiable_rag_location(
    chunk_content,
    article_reference,
    'article'
  );

update public.document_chunks
set numeral_reference = null
where numeral_reference is not null
  and not private.is_verifiable_rag_location(
    chunk_content,
    split_part(numeral_reference, ' · ', 1),
    'numeral'
  );

-- Los metadatos estructurales del historial se sincronizan con el chunk que
-- realmente sustentó la cita. Si el chunk ya no existe, se omite la ubicación
-- fina antes que conservar una afirmación imposible de comprobar.
update public.chat_message_sources as source
set
  section_title = chunk.section_title,
  article_reference = chunk.article_reference,
  numeral_reference = chunk.numeral_reference
from public.document_chunks as chunk
where chunk.id = source.chunk_id
  and (
    source.section_title is distinct from chunk.section_title
    or source.article_reference is distinct from chunk.article_reference
    or source.numeral_reference is distinct from chunk.numeral_reference
  );

update public.chat_message_sources
set
  section_title = null,
  article_reference = null,
  numeral_reference = null
where chunk_id is null
  and (
    section_title is not null
    or article_reference is not null
    or numeral_reference is not null
  );

select set_config('app.avend_chat_source_metadata_repair', 'active', true);

update public.chat_message_sources as source
set pdf_page_count = case
  when version.mime_type = 'application/pdf' then version.page_count
  else null
end
from public.document_versions as version
where version.id = source.document_version_id
  and version.document_id = source.document_id
  and source.pdf_page_count is distinct from case
    when version.mime_type = 'application/pdf' then version.page_count
    else null
  end;

select set_config('app.avend_chat_source_metadata_repair', '', true);

-- Las citas nuevas guardan un total solo para PDFs cuyo total ya fue verificado.
create or replace function private.capture_chat_source_document_situation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select
    document.situation,
    document.document_type,
    document.resolution_number,
    document.issuance_year,
    case
      when version.mime_type = 'application/pdf' then version.page_count
      else null
    end
  into
    new.document_situation,
    new.document_type,
    new.resolution_number,
    new.issuance_year,
    new.pdf_page_count
  from public.documents as document
  join public.document_versions as version
    on version.id = new.document_version_id
    and version.document_id = document.id
  where document.id = new.document_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'A cited source document version was not found';
  end if;

  return new;
end;
$$;

revoke all on function private.capture_chat_source_document_situation()
  from public, anon, authenticated;

-- Nueva firma compatible con el despliegue gradual: la firma histórica de
-- dos argumentos permanece disponible para trabajadores anteriores, pero la
-- aplicación nueva siempre entrega el total observado durante la extracción.
create or replace function public.complete_document_ingestion_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_verified_pdf_page_count integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.document_ingestion_jobs%rowtype;
  target_mime_type text;
  maximum_chunk_page integer;
begin
  select * into target
  from public.document_ingestion_jobs
  where id = p_job_id
    and status = 'processing'
    and lease_token = p_lease_token
    and lease_expires_at >= now()
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Active ingestion lease was not found';
  end if;

  select version.mime_type
  into target_mime_type
  from public.document_versions as version
  where version.id = target.document_version_id
  for update;

  select max(chunk.page_end)::integer
  into maximum_chunk_page
  from public.document_chunks as chunk
  where chunk.document_version_id = target.document_version_id;

  if maximum_chunk_page is null then
    raise exception using
      errcode = '23514',
      message = 'A document version cannot complete ingestion without chunks';
  end if;

  if target_mime_type = 'application/pdf' then
    if p_verified_pdf_page_count is null
      or p_verified_pdf_page_count not between 1 and 300 then
      raise exception using
        errcode = '23514',
        message = 'A PDF ingestion requires a verified page count between 1 and 300';
    end if;

    if p_verified_pdf_page_count < maximum_chunk_page then
      raise exception using
        errcode = '23514',
        message = 'The verified PDF page count cannot be lower than its cited pages';
    end if;

    perform set_config('app.avend_page_count_reconciliation', 'active', true);
    update public.document_versions
    set page_count = p_verified_pdf_page_count
    where id = target.document_version_id
      and page_count is distinct from p_verified_pdf_page_count;
    perform set_config('app.avend_page_count_reconciliation', '', true);
  elsif p_verified_pdf_page_count is not null then
    raise exception using
      errcode = '23514',
      message = 'Only PDF versions can persist a physical page count';
  end if;

  update public.document_ingestion_jobs
  set
    status = 'completed',
    lease_token = null,
    leased_at = null,
    lease_expires_at = null,
    completed_at = now(),
    updated_at = now()
  where id = target.id;

  perform private.set_document_ingestion_status(
    target.document_version_id,
    'indexed'
  );
end;
$$;

revoke all on function public.complete_document_ingestion_job(uuid, uuid, integer)
  from public, anon, authenticated;
grant execute on function public.complete_document_ingestion_job(uuid, uuid, integer)
  to service_role;
