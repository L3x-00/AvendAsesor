-- El límite real de carga es 50 MiB (API, multer y bucket ya lo permiten), pero
-- el CHECK de la versión seguía en 20 MiB: toda carga entre 20 y 50 MiB fallaba
-- al persistir. Se alinea la base con el contrato vigente.
alter table public.document_versions
  drop constraint document_versions_file_size_bytes_check;

alter table public.document_versions
  add constraint document_versions_file_size_bytes_check
  check (file_size_bytes between 1 and 52_428_800);
