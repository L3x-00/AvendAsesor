import { normalizeSpanishText } from '../../rag/text-normalization';
import { hasTopicTerm } from '../../rag/domain-lexicon';

const SYSTEM_SUBJECT =
  /\b(?:avend|asesor|sistema|plataforma|chat|asistente|ia|inteligencia artificial)\b/u;
const SYSTEM_ABOUT =
  /\b(?:para que|para qué|que es|qué es|quien eres|quién eres|objetivo|funcion|funci[oó]n|funcionalidades|como funciona|c[oó]mo funciona|como uso|c[oó]mo uso|sirve|alcance|limitaciones|puedes hacer|puedo hacer|hacer|ayudas|ayuda|creado|crearon|disenado|diseñado)\b/u;

/**
 * Preguntas sobre la identidad, el propósito o el uso de AVEND ASESOR.
 * No se activa con consultas normativas que solo mencionen "sistema".
 */
export function isAboutTheSystem(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (hasTopicTerm(text)) return false;
  if (/\b(?:contrataciones|nombramientos)\b/u.test(text)) return false;
  return SYSTEM_SUBJECT.test(text) && SYSTEM_ABOUT.test(text);
}
