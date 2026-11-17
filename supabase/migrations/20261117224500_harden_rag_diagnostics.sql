-- Endurece el RPC de diagnóstico: guarda solo una lista explícita de columnas,
-- nunca el payload completo que pueda enviar un futuro llamador.
create or replace function public.record_rag_diagnostic(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path to public
as $$
declare
  v_kind text := coalesce(p_payload->>'kind', 'unknown');
  v_hash text := coalesce(p_payload->>'question_hash', 'unknown');
  v_searches integer := coalesce((p_payload->>'searches')::integer, 0);
  v_ms integer := coalesce((p_payload->>'search_ms')::integer, 0);
  v_errors text := coalesce(p_payload->>'errors', '');
  v_raw_global integer := coalesce((p_payload->>'raw_global')::integer, 0);
  v_routing_global integer := coalesce((p_payload->>'routing_global')::integer, 0);
  v_raw_selected integer := coalesce((p_payload->>'raw_selected')::integer, 0);
  v_routing_selected integer := coalesce((p_payload->>'routing_selected')::integer, 0);
  v_scope text := p_payload->>'retrieval_scope';
begin
  insert into public.rag_diagnostics (
    kind, question_hash, searches, search_ms, errors,
    raw_global, routing_global, raw_selected, routing_selected,
    retrieval_scope, payload
  ) values (
    v_kind, v_hash, v_searches, v_ms, v_errors,
    v_raw_global, v_routing_global, v_raw_selected, v_routing_selected,
    v_scope,
    jsonb_build_object(
      'kind', v_kind,
      'question_hash', v_hash,
      'searches', v_searches,
      'search_ms', v_ms,
      'errors', v_errors,
      'raw_global', v_raw_global,
      'routing_global', v_routing_global,
      'raw_selected', v_raw_selected,
      'routing_selected', v_routing_selected,
      'retrieval_scope', v_scope
    )
  );
end;
$$;

revoke all on function public.record_rag_diagnostic(jsonb) from public, anon, authenticated;
grant execute on function public.record_rag_diagnostic(jsonb) to service_role;
