/**
 * Causa legible de una versión que no se pudo procesar. La ficha del documento
 * la usa para explicar qué pasó y qué hacer, en vez de un «Error» sin salida.
 *
 * El trabajo de indexación guarda `last_error_code` (LEASE_EXPIRED si el worker
 * perdió su turno, INGESTION_FAILED si el procesamiento lanzó un error) y, en
 * este último caso, el código interno en `last_error_message`. Nunca se expone
 * el mensaje original: puede traer detalles del proveedor de IA.
 */
export type DocumentIngestionFailureCause =
  | 'ai_service'
  | 'no_text'
  | 'timeout'
  | 'too_large'
  | 'unknown'
  | 'unreadable_file'
  | 'unsupported_format';

export function ingestionFailureCause(
  code: string | null,
  message: string | null,
): DocumentIngestionFailureCause {
  if (code === 'LEASE_EXPIRED') return 'timeout';
  // Marcado al cargar: el PDF no se pudo abrir (dañado o con contraseña).
  if (code === 'UNREADABLE_PDF') return 'unreadable_file';
  const detail = message ?? '';
  if (detail.includes('INGESTION_TIMEOUT')) return 'timeout';
  if (detail.includes('INGESTION_EMPTY_TEXT')) return 'no_text';
  if (detail.includes('INGESTION_UNSUPPORTED_FORMAT')) {
    return 'unsupported_format';
  }
  if (detail.includes('INGESTION_DOCUMENT_TOO_LARGE')) return 'too_large';
  if (
    detail.includes('INGESTION_INVALID_EMBEDDING') ||
    /\b(?:embedding|openai|openrouter|api key|rate limit|429|5\d\d)\b/iu.test(
      detail,
    )
  ) {
    return 'ai_service';
  }
  return 'unknown';
}
