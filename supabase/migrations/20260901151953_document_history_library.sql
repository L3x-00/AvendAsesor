-- TSK-0031: administrative document library and traceable lifecycle.
-- `publication_status` remains the RAG eligibility switch. `situation` adds
-- administrative meaning while a constraint keeps both values coherent.

create type public.document_situation as enum (
  'current',
  'replaced',
  'archived'
);

alter table public.documents
  add column situation public.document_situation default 'current',
  add column replacement_document_id uuid,
  add column replacement_date date,
  add column replacement_year smallint,
  add column replacement_reason text,
  add column replacement_observation text,
  add column search_vector tsvector generated always as (
    setweight(to_tsvector('spanish', coalesce(title, '')), 'A')
    || setweight(to_tsvector('spanish', coalesce(resolution_number, '')), 'A')
    || setweight(to_tsvector('spanish', coalesce(issuing_entity, '')), 'B')
    || setweight(to_tsvector('spanish', coalesce(metadata ->> 'keywords', '')), 'B')
  ) stored;

update public.documents
set situation = case
  when publication_status = 'active' then 'current'::public.document_situation
  else 'archived'::public.document_situation
end;
