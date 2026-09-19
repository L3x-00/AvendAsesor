export const RAG_NO_EVIDENCE_MESSAGE =
  'No encontré sustento suficiente en los documentos disponibles para responderte con seguridad. Para no darte información sin respaldo, ¿podrías contarme un poco más o precisar tu consulta? Así puedo buscar mejor.';

export const RAG_AMBIGUITY_MESSAGE =
  'Encontré información relacionada con más de un tema y quiero orientarte con precisión. Para darte la respuesta correcta, ayúdame confirmando a cuál corresponde tu consulta.';

export const MAX_RAG_ANSWER_CHARS = 20_000;
export const MAX_EVIDENCE_CHARS_PER_CHUNK = 6_000;
export const MAX_CHAT_CONTEXT_CHARS = 10_000;
export const MAX_CHAT_CONTEXT_MESSAGES = 12;
export const MAX_CONTEXT_MESSAGE_CHARS = 2_000;
export const RAG_TOPIC_SWITCH_SCORE_MARGIN = 0.08;
