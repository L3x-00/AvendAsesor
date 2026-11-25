import { normalizeSpanishText } from '../../rag/text-normalization';
import { hasDomainSignal, hasTopicTerm } from '../../rag/domain-lexicon';

const SYSTEM_SUBJECT =
  /\b(?:avend|asesor|sistema|plataforma|chat|asistente|ia|inteligencia artificial)\b/u;
const SYSTEM_ABOUT =
  /\b(?:para que|para qué|que es|qué es|quien eres|quién eres|objetivo|funcion|funci[oó]n|funcionalidades|como funciona|c[oó]mo funciona|como uso|c[oó]mo uso|sirve|alcance|limitaciones|puedes hacer|puedo hacer|hacer|ayudas|ayuda|creado|crearon|disenado|diseñado)\b/u;

/**
 * Preguntas dirigidas al asistente sobre sí mismo que NO nombran "sistema" ni
 * "AVEND": «¿cómo funciona? ¿hasta dónde es tu alcance?», «¿quién te creó?»,
 * «¿eres una inteligencia artificial?», «¿en qué me puedes ayudar?», etc.
 * Se exige una referencia de segunda persona o un verbo de identidad para no
 * confundirlas con una consulta normativa que empiece por «¿cómo funciona…?».
 */
const SYSTEM_SELF = /\b(?:te|tu|tus|ti|eres|yo|me|construido|llamas|creo)\b/u;
const SYSTEM_SELF_TOPIC =
  /\b(?:como funciona(?:s)?|hasta donde (?:es|llega) tu alcance|quien te creo|quien te crearon|quien eres|que eres|eres una|como te llamas|como estas construido|como hago uso|como se usa|(?:en que|diciendo como) (?:me )?puedes ayudar|que puedes hacer|para que sirves|construido|disenado|diseñado|creado|crearon)\b/u;
/** Términos de corpus que, aunque `hasTopicTerm` no los cubra, delatan una consulta normativa. */
const DOMAIN_NOUN =
  /\b(?:cuadro de horas|distribucion de horas|clasificador de cargos|plazas?|licencias?|remuneracion(?:es)?|contratacion(?:es)?|racionalizacion|destaque|reasignacion|nombramiento|permisos?|vacaciones?|norma|reglamento|plazos?|solicitud|expediente|derechos?|cargos?|carrera publica|auxiliar de educacion|escala|periodo de prueba|ugel|minedu|magisterio|ds|rvm|rm|rsg)\b/u;

/**
 * Preguntas sobre la identidad, el propósito o el uso de AVEND ASESOR.
 * No se activa con consultas normativas que solo mencionen "sistema".
 */
export function isAboutTheSystem(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (hasTopicTerm(text)) return false;
  if (/\b(?:contrataciones|nombramientos)\b/u.test(text)) return false;
  if (DOMAIN_NOUN.test(text)) return false;
  return (
    (SYSTEM_SUBJECT.test(text) && SYSTEM_ABOUT.test(text)) ||
    // La rama dirigida al asistente exige AUSENCIA total de señal de dominio:
    // «¿en qué me puedes ayudar con mi carrera pública?» es normativa, no una
    // pregunta sobre el sistema, aunque use la misma fórmula.
    (SYSTEM_SELF.test(text) &&
      SYSTEM_SELF_TOPIC.test(text) &&
      !hasDomainSignal(text))
  );
}
