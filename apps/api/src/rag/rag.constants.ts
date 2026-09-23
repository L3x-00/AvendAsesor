export const RAG_NO_EVIDENCE_MESSAGE =
  'No encontré sustento suficiente en los documentos disponibles para responderte con seguridad. Para no darte información sin respaldo, ¿podrías contarme un poco más o precisar tu consulta? Así puedo buscar mejor.';

export const RAG_AMBIGUITY_MESSAGE =
  'Encontré información relacionada con más de un tema y quiero orientarte con precisión.';

export const MAX_RAG_ANSWER_CHARS = 20_000;
/** Tope de tokens de salida del proveedor: acota coste/latencia y mantiene la
 * respuesta muy por debajo de MAX_RAG_ANSWER_CHARS (evita el corte por longitud). */
export const MAX_RAG_ANSWER_TOKENS = 1_500;
export const MAX_EVIDENCE_CHARS_PER_CHUNK = 6_000;
export const MAX_CHAT_CONTEXT_CHARS = 10_000;
export const MAX_CHAT_CONTEXT_MESSAGES = 12;
export const MAX_CONTEXT_MESSAGE_CHARS = 2_000;
export const RAG_TOPIC_SWITCH_SCORE_MARGIN = 0.08;
/**
 * Umbral de similitud coseno por defecto, calibrado con el corpus real de
 * producción (2026-09-23, text-embedding-3-small): las consultas con sustento
 * puntuaron 0.57–0.76 y las que no tienen documento (destaque, reasignación,
 * inasistencia de auxiliar, reemplazo del director) 0.33–0.45. Con el valor
 * anterior (0.70) casi toda consulta real caía en «sin evidencia». Los falsos
 * positivos por encima del umbral los contiene la marca de «sin sustento» que
 * emite el modelo. Se ajusta con `RAG_MATCH_THRESHOLD` sin desplegar código.
 */
export const RAG_DEFAULT_MATCH_THRESHOLD = 0.5;
