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
/**
 * Interrogantes de capacidad, con las grafías y errores frecuentes de la
 * gente al escribir («peudes», «ayuda» sin r, «podrias»). Se buscan para
 * separar la presentación del usuario del núcleo de la pregunta.
 */
const CAPABILITY_QUESTIONS: readonly RegExp[] = [
  /\b(?:en|sobre) que (?:me )?(?:puedes|puede|podrias|podria|peudes) ayudar(?:me)?/u,
  /\b(?:diciendo )?como (?:me )?(?:puedes|podrias) ayudar(?:me)?/u,
  /\bque (?:me )?(?:puedes|puede|podrias|podria|peudes) ayudar(?:me)?/u,
  /\bcomo (?:me )?(?:puedes|puede|podrias|podria) ayudar(?:me)?/u,
  /\bque (?:me )?puedes ayuda(?!r)\b/u,
  /\bcomo me ayudas/u,
  /\ben que (?:me )?ayudas/u,
  /\bque puedes hacer/u,
  /\bquien eres|\bque eres|\beres una|\bcomo te llamas/u,
  /\bcomo funcionas|\bpara que sirves/u,
  /\bcomo funciona(?:s)?|\bhasta donde (?:es|llega) tu alcance/u,
  /\bquien te creo|\bquien te crearon|\bcomo estas construido/u,
  /\bcomo hago uso|\bcomo se usa/u,
];

/** Primer interrogante de capacidad del texto: dónde empieza y cuánto mide. */
function firstCapabilityQuestion(
  text: string,
): { index: number; length: number } | null {
  let best: { index: number; length: number } | null = null;
  for (const pattern of CAPABILITY_QUESTIONS) {
    const found = pattern.exec(text);
    if (!found || found.index === undefined) continue;
    if (!best || found.index < best.index) {
      best = { index: found.index, length: found[0].length };
    }
  }
  return best;
}
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

  // Detección inteligente: una persona puede presentarse antes de preguntar
  // («soy docente que no usa tecnología…, ¿cómo me podrías ayudar?»). Esa
  // presentación NO convierte la pregunta en normativa. Solo se revisa el
  // texto DESPUÉS del interrogante de capacidad: si ahí aparece un objeto de
  // dominio («¿en qué me ayudas con mi carrera pública?»), va al RAG.
  const hasDomainNoun = DOMAIN_NOUN.test(text);
  const capability = firstCapabilityQuestion(text);
  if (capability && SYSTEM_SELF.test(text)) {
    const after = text.slice(capability.index + capability.length);
    // «soy docente, ¿cómo me ayudas con mi licencia?» no llega aquí porque
    // `licencia` es TOPIC, pero la guía global evita que un sustantivo de
    // dominio residual (escala, racionalización, cuadro de horas) colocado
    // ANTES del interrogante se cuele como pregunta sobre el sistema.
    if (!hasDomainNoun && !DOMAIN_NOUN.test(after) && !hasDomainSignal(after))
      return true;
  }

  if (hasDomainNoun) return false;
  return (
    (SYSTEM_SUBJECT.test(text) && SYSTEM_ABOUT.test(text)) ||
    (SYSTEM_SELF.test(text) &&
      SYSTEM_SELF_TOPIC.test(text) &&
      !hasDomainSignal(text))
  );
}
