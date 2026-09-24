export const RAG_NO_EVIDENCE_MESSAGE =
  'No encontré sustento suficiente en los documentos disponibles para responderte con seguridad. Para no darte información sin respaldo, ¿podrías contarme un poco más o precisar tu consulta? Así puedo buscar mejor.';

/** Primera consulta sin tema: se pide el trámite antes de buscar (puntos 5 y 12). */
export const RAG_TOPIC_CLARIFICATION_MESSAGE =
  'Para orientarte con precisión, cuéntame sobre qué trámite o situación es tu consulta: por ejemplo, una reasignación, una licencia, un destaque o una remuneración.';

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
 * Solo las fuentes a esta distancia del mejor puntaje deciden el módulo. Con el
 * corpus real, una fuente de cola de otro módulo (0.52 frente a 0.665) bastaba
 * para pedir una aclaración innecesaria en un seguimiento («¿y el plazo?»).
 */
export const RAG_ROUTING_SCORE_MARGIN = 0.08;
/**
 * Banda de relevancia de las fuentes que se entregan al modelo y al usuario: las
 * que quedan muy por debajo de la mejor no sustentan la respuesta y confunden la
 * tabla de referencias. Con el corpus real, 0.12 conserva las fuentes pertinentes
 * (0.575–0.493 en «bonificaciones») y excluye la cola ajena (0.52 frente a 0.665).
 */
export const RAG_SOURCE_SCORE_MARGIN = 0.12;
/**
 * Una aclaración solo cita fragmentos como «orientación inicial» si superan el
 * umbral por este margen (0.57 con el umbral de 0.5: el piso de las consultas
 * con sustento en el corpus real). Con coincidencias débiles se pide precisar
 * sin citar documentos que no vienen al caso.
 */
export const RAG_ORIENTATION_SCORE_MARGIN = 0.07;
/** Tope de texto que acepta la RPC de búsqueda (`p_query_text`, 1..8000). */
export const RAG_QUERY_TEXT_MAX_CHARS = 8_000;
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
