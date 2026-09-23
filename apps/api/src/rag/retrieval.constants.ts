/**
 * Nombre y argumentos de la RPC de retrieval del chat. Fuente única de verdad
 * para el gateway y la prueba de contrato (M7): si una migración renombra la
 * función o cambia sus parámetros, la prueba de contrato falla en CI —y el probe
 * de arranque lo registra— en vez de dar un `503` silencioso en producción.
 *
 * Definida en supabase/migrations/20260905100000_consultation_reports_and_quality.sql.
 */
export const RETRIEVAL_RPC_NAME =
  'search_document_chunks_with_consultation_context' as const;

export const RETRIEVAL_RPC_ARG_NAMES = [
  'p_query_embedding',
  'p_query_text',
  'p_selected_module_id',
  'p_match_threshold',
  'p_match_count',
  'p_retrieval_scope',
] as const;
