export const RAG_NO_EVIDENCE_MESSAGE =
  'No encontré información suficiente en los documentos vigentes para responder esta consulta.';

export const RAG_AMBIGUITY_MESSAGE =
  'Encontré información vigente relacionada con más de un tema. La orientación exacta depende de identificar el módulo aplicable.';

export const MAX_RAG_ANSWER_CHARS = 20_000;
export const MAX_EVIDENCE_CHARS_PER_CHUNK = 6_000;
export const MAX_CHAT_CONTEXT_CHARS = 10_000;
export const MAX_CHAT_CONTEXT_MESSAGES = 12;
export const MAX_CONTEXT_MESSAGE_CHARS = 2_000;
export const RAG_TOPIC_SWITCH_SCORE_MARGIN = 0.08;
