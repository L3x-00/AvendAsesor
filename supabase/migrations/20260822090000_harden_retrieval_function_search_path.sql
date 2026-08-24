-- `search_document_chunks` already qualifies its extension type and operator.
-- Keeping only pg_catalog in its SECURITY DEFINER search path removes the
-- possibility that an object in another schema shadows an unqualified helper.
alter function public.search_document_chunks(
  extensions.vector,
  text,
  uuid,
  real,
  integer
) set search_path to pg_catalog;
