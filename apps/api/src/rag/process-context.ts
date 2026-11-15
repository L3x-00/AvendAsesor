import { refersBack } from './anaphora';
import { hasTopicTerm } from './domain-lexicon';
import {
  causalLabelsInQuestion,
  causalsInQuestion,
} from './process-clarification';
import type { RetrievedChunk } from './retrieval.gateway';
import {
  detectTopicIntent,
  type TopicIntent,
  type TopicIntentId,
} from './topic-intent';
import { normalizeSpanishText } from './text-normalization';

/**
 * Contexto de proceso del hilo conversacional.
 *
 * El chat ya hereda factores salariales (`inheritedFactorQuestions`) y resuelve
 * elipsis y deícticos (`contextualQuery`, `refersBack`). Faltaba el caso
 * simétrico para los procesos: en un hilo sobre el destaque, «¿y por causal de
 * salud?» o «¿cómo postulo?» no repiten el término del proceso. Sin heredarlo,
 * la recuperación buscaba una consulta sin tema, no generaba ninguna expansión
 * canónica y el turno terminaba en «sin evidencia» o en una aclaración de
 * módulo aunque la documentación existiera en el módulo abierto.
 *
 * La herencia es deliberadamente estrecha, porque inventar un proceso sería
 * peor que no responder:
 *  - Solo actúa cuando la consulta actual NO nombra un tema propio: si dice
 *    «licencia» o «permuta» no hereda nada, aunque el hilo fuera del destaque.
 *  - Solo actúa cuando el turno depende del proceso (una causal, un verbo de
 *    trámite, un aspecto normativo o una referencia a lo anterior). Una pregunta
 *    autónoma («¿cuánto gana un auxiliar?») se busca por sí misma.
 *  - No hereda de un turno que rechaza el tema («no quiero nada de eso»).
 *  - Conserva el régimen del proceso: si el hilo es de un auxiliar de
 *    educación, la consulta heredada no usa la denominación del régimen
 *    docente.
 *  - Solo aporta vocabulario de búsqueda. No agrega hechos, no elige evidencia
 *    por sí misma, no cambia el umbral de admisión y no autoriza a responder sin
 *    fuentes: la compuerta de citas sigue intacta.
 */

/** Texto sintético del propio servicio: no es una declaración de la persona. */
const SYNTHETIC_CONTEXT = /^(?:Respuesta anterior|Propuesta aceptada):/u;

/** Verbos con los que se pide un trámite sin nombrarlo. */
const PROCEDURE_VERB =
  /\b(?:postular|postulo|postule|postularme|postulacion|solicitar|solicito|solicite|tramitar|tramito|present(?:ar|o|aria)(?:l[oa])?|inscribir(?:me)?|inscribo|pedir|pido|pediria|necesit(?:o|aria)|gestionar|gestiono|conseguir|consigo|hacer|hago|renovar|renuevo|renovacion)\b/u;

/** Aspectos normativos o de trámite que completan un proceso ya abierto. */
const NORMATIVE_ASPECT =
  /\b(?:requisitos?|plazos?|cronograma|procedimiento|tramites?|documentos?|etapas?|formato|formulario|anexo|pasos?)\b/u;

/** La persona descarta el tema: no hay trámite que completar. */
const REJECTS_TOPIC =
  /\bnada\s+de\s+eso\b|\bolvidalo\b|\bdejemos\s+(?:eso|esto)\b|\bno\s+(?:quiero|me\s+interesa|necesito)\s+(?:nada\s+)?(?:de\s+)?(?:eso|esto|ese|esa|este|esta)\b/u;

/** Módulo cuyo régimen documental es propio y no se comparte con docentes. */
const AUXILIARY_MODULE = 'Auxiliar de educación';

/**
 * Denominación con la que el corpus nombra cada proceso. Se usa solo cuando la
 * consulta actual no lo nombra; si lo nombra, la expansión del módulo
 * correspondiente ya aporta su propio vocabulario y no se duplica.
 */
const PROCESS_CANONICAL_QUERIES: Record<TopicIntentId, string> = {
  reassignment:
    'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta',
  'temporary-placement':
    'destaque docente requisitos procedimiento solicitud plazo norma técnica',
  'medical-leave':
    'licencia por incapacidad temporal descanso médico CITT certificado médico',
  'career-progression':
    'concurso de ascenso escala magisterial requisitos etapas prueba nacional trayectoria profesional',
  'rural-allocation':
    'asignación por trabajo en ámbito rural padrón de instituciones educativas instrumento habilitante',
  'auxiliary-requirements':
    'contratación auxiliares educación requisitos por nivel modalidad capacitación edad documentos expediente',
  disciplinary:
    'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
  rationalization:
    'racionalización de plazas docentes reducción de plazas por disminución de estudiantes',
};

/**
 * El auxiliar de educación tiene su propio procedimiento en los procesos que
 * comparte con los docentes. Buscar la denominación docente traería la norma
 * equivocada, así que su consulta heredada nombra su régimen.
 */
const AUXILIARY_PROCESS_QUERIES: Partial<Record<TopicIntentId, string>> = {
  reassignment:
    'reasignación de auxiliares de educación requisitos procedimiento solicitud',
  'medical-leave':
    'licencia por incapacidad temporal auxiliares de educación descanso médico CITT certificado',
};

/**
 * El turno necesita el proceso del hilo para tener sentido. Se excluye todo lo
 * que se responde por sí mismo: una cifra, una fecha o un tema nuevo.
 */
export function isProcessDependentTurn(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (REJECTS_TOPIC.test(text)) return false;
  return (
    causalsInQuestion(question).length > 0 ||
    PROCEDURE_VERB.test(text) ||
    NORMATIVE_ASPECT.test(text) ||
    refersBack(question)
  );
}

/**
 * Proceso del hilo al que pertenece un turno que no lo nombra. Prioriza el
 * turno más reciente que sí nombraba un proceso; los mensajes sintéticos del
 * propio servicio se ignoran porque no son declaraciones de la persona.
 */
export function inheritedTopicIntent(
  question: string,
  priorUserQuestions: readonly string[],
): TopicIntent | null {
  if (!priorUserQuestions.length) return null;
  if (detectTopicIntent(question)) return null;
  if (hasTopicTerm(normalizeSpanishText(question))) return null;
  if (!isProcessDependentTurn(question)) return null;
  for (let index = priorUserQuestions.length - 1; index >= 0; index -= 1) {
    const prior = priorUserQuestions[index];
    if (!prior || SYNTHETIC_CONTEXT.test(prior)) continue;
    const intent = detectTopicIntent(prior);
    if (intent) return intent;
  }
  return null;
}

/**
 * Consulta canónica del proceso, completada con la causal que la persona
 * declaró cuando corresponde: la norma dedica secciones distintas a salud,
 * emergencia, violencia, unidad familiar e interés personal.
 */
export function processCanonicalQuery(
  intent: TopicIntent,
  question: string,
): string {
  const base =
    (intent.moduleName === AUXILIARY_MODULE
      ? AUXILIARY_PROCESS_QUERIES[intent.id]
      : undefined) ?? PROCESS_CANONICAL_QUERIES[intent.id];
  const causals = causalLabelsInQuestion(question);
  return causals.length ? `${base} ${causals.join(' ')}` : base;
}

/**
 * Consultas que aporta el proceso heredado del hilo. Vacío cuando la consulta
 * nombra su propio tema: en ese caso manda lo que la persona escribió.
 */
export function processQueriesForIntent(
  intent: TopicIntent | null,
  question: string,
): string[] {
  return intent ? [processCanonicalQuery(intent, question)] : [];
}

/**
 * Señal textual con la que el corpus nombra cada proceso. La herencia aporta el
 * proceso, no el término: cuando el turno actual es «¿y los requisitos?» la
 * comprobación directa contra la pregunta no puede admitir ningún fragmento, y
 * se evalúa el fragmento. Es la misma exigencia —coincidencia real con el
 * proceso y no una mención ajena— aplicada al lado correcto.
 */
const PROCESS_EVIDENCE: Record<TopicIntentId, RegExp> = {
  reassignment: /\breasignacion(?:es)?\b/u,
  'temporary-placement': /\bdestaques?\b|\bdestacad[oa]s?\b/u,
  'medical-leave':
    /\b(?:descanso medic[oa]|incapacidad temporal|citt|licencia por enfermedad)\b/u,
  'career-progression':
    /\b(?:ascenso|escala magisterial|concurso de ascenso)\b/u,
  'rural-allocation':
    /\b(?:ambito rural|institucion educativa rural|asignacion por trabajo en ambito rural)\b/u,
  'auxiliary-requirements': /\bauxiliar(?:es)? de educacion\b/u,
  disciplinary:
    /\b(?:procedimiento administrativo disciplinario|proceso administrativo disciplinario|descargos)\b/u,
  rationalization: /\bracionalizacion\b/u,
};

const AUXILIARY_REGIME = /\bauxiliares?\b/u;

/**
 * El fragmento trata el proceso heredado. Para un proceso que también rige a
 * los docentes, el auxiliar exige además que el fragmento sea de su régimen:
 * heredar el tema no autoriza a entregarle la norma de profesores.
 */
export function treatsProcessIntent(
  intent: TopicIntent,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  const title = normalizeSpanishText(source.documentTitle);
  const body = normalizeSpanishText(
    `${source.sectionTitle ?? ''} ${source.chunkContent}`,
  );
  const pattern = PROCESS_EVIDENCE[intent.id];
  if (!pattern.test(title) && !pattern.test(body)) return false;
  if (intent.moduleName !== AUXILIARY_MODULE) return true;
  return AUXILIARY_REGIME.test(`${title} ${body}`);
}
