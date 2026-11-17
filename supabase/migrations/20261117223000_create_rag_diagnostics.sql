-- Diagnóstico acotado del RAG: solo contadores y hashes, nunca la pregunta ni
-- contenido documental. Acceso de lectura/inserción únicamente para service_role.
create table if not exists public.rag_diagnostics (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  kind text not null,
  question_hash text not null,
  searches integer not null default 0,
  search_ms integer not null default 0,
  errors text not null default '',
  raw_global integer not null default 0,
  routing_global integer not null default 0,
  raw_selected integer not null default 0,
  routing_selected integer not null default 0,
  retrieval_scope text,
  payload jsonb not null default '{}'::jsonb
);

alter table public.rag_diagnostics enable row level security;
revoke all on public.rag_diagnostics from anon, authenticated;
grant select, insert on public.rag_diagnostics to service_role;

create or replace function public.record_rag_diagnostic(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path to public
as $$
begin
  insert into public.rag_diagnostics (
    kind,
    question_hash,
    searches,
    search_ms,
    errors,
    raw_global,
    routing_global,
    raw_selected,
    routing_selected,
    retrieval_scope,
    payload
  ) values (
    coalesce(p_payload->>'kind', 'unknown'),
    coalesce(p_payload->>'question_hash', 'unknown'),
    coalesce((p_payload->>'searches')::integer, 0),
    coalesce((p_payload->>'search_ms')::integer, 0),
    coalesce(p_payload->>'errors', ''),
    coalesce((p_payload->>'raw_global')::integer, 0),
    coalesce((p_payload->>'routing_global')::integer, 0),
    coalesce((p_payload->>'raw_selected')::integer, 0),
    coalesce((p_payload->>'routing_selected')::integer, 0),
    p_payload->>'retrieval_scope',
    p_payload
  );
end;
$$;

revoke all on function public.record_rag_diagnostic(jsonb) from public, anon, authenticated;
grant execute on function public.record_rag_diagnostic(jsonb) to service_role;
