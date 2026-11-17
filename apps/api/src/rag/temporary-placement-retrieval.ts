import { INTENT_EXPANSIONS, INTENT_TRIGGERS } from './intent-routing.config';
import { causalLabelsInQuestion } from './process-clarification';
import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Vocabulario de búsqueda del destaque, sin convertir una inferencia en
 * respuesta. Se reconocen dos formas de nombrarlo:
 *
 *  - explícita: la persona usa el término del proceso («hay destaque?»,
 *    «cómo me destaco», «renovación de destaque»). Basta el término: no hace
 *    falta que además describa la temporalidad ni que declare que conserva su
 *    plaza. Antes de este reconocimiento, una pregunta corta como «cómo
 *    destacarme» no generaba ninguna consulta canónica y la similitud vectorial
 *    de dos palabras no alcanzaba el umbral de evidencia.
 *  - descriptiva: cuenta la situación sin usar el término («trabajar por un
 *    tiempo en otro colegio sin perder mi plaza»). Ahí sí se exige la
 *    combinación completa, porque el mismo relato puede ser una mudanza
 *    personal, una permuta o un estacionamiento.
 */

/** Negación del propio proceso: no se busca un trámite que la persona rechaza. */
const NEGATED_TEMPORARY_PLACEMENT = INTENT_TRIGGERS.NEGATED_TEMPORARY_PLACEMENT;

/** Negación del desplazamiento completo (se conserva la guarda original). */
const NEGATED_MOVE = INTENT_TRIGGERS.NEGATED_MOVE;

/**
 * Otro régimen o un objeto físico: el auxiliar tiene su propio procedimiento y
 * un estacionamiento no es un destaque.
 */
const OTHER_REGIME_OR_OBJECT = INTENT_TRIGGERS.OTHER_REGIME_OR_OBJECT;

const DESTAQUE_NOUN = INTENT_TRIGGERS.DESTAQUE_NOUN;
/** «destacarme», «destacarse»: la persona se refiere a su propio traslado. */
const DESTAQUE_SELF = INTENT_TRIGGERS.DESTAQUE_SELF;
/** «me destaco», «me destacaría»: primera persona sin el infinitivo. */
const DESTAQUE_FIRST_PERSON = INTENT_TRIGGERS.DESTAQUE_FIRST_PERSON;
/** Formas que también aparecen en sentido figurado: exigen contexto de traslado. */
const DESTAQUE_CONJUGATED = INTENT_TRIGGERS.DESTAQUE_CONJUGATED;
const DESTAQUE_PARTICIPLE = INTENT_TRIGGERS.DESTAQUE_PARTICIPLE;
/**
 * El sujeto es otra persona (un hijo, un alumno): «mi hijo fue destacado en otra
 * zona» describe un logro, no el trámite del personal nombrado.
 */
const THIRD_PARTY_SUBJECT = INTENT_TRIGGERS.THIRD_PARTY_SUBJECT;
/**
 * Indicio de traslado o de plaza, no de docencia: «destacar en el examen» y
 * «docente destacado del año» son lenguaje corriente en un colegio y no piden
 * el proceso. «Nombrado» sí lo pide: el destaque es del personal nombrado.
 */
const TRANSFER_CONTEXT = INTENT_TRIGGERS.TRANSFER_CONTEXT;

const RENEWAL = INTENT_TRIGGERS.RENEWAL;

const EXPLICIT_DESTAQUE_QUERY = INTENT_EXPANSIONS.EXPLICIT_DESTAQUE_QUERY;

/**
 * La consulta nombra el destaque con el término del corpus. No afirma que
 * proceda ni que la persona cumpla los requisitos: solo habilita la búsqueda
 * con la denominación que usan los documentos.
 */
export function isTemporaryPlacementQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (NEGATED_TEMPORARY_PLACEMENT.test(text)) return false;
  if (OTHER_REGIME_OR_OBJECT.test(text)) return false;
  if (
    DESTAQUE_NOUN.test(text) ||
    DESTAQUE_SELF.test(text) ||
    DESTAQUE_FIRST_PERSON.test(text)
  )
    return true;
  return (
    (DESTAQUE_CONJUGATED.test(text) || DESTAQUE_PARTICIPLE.test(text)) &&
    TRANSFER_CONTEXT.test(text) &&
    !THIRD_PARTY_SUBJECT.test(text)
  );
}

/**
 * La fuente trata el destaque. Se evalúa sobre el fragmento, no sobre la
 * pregunta: permite reutilizarlo cuando el proceso se heredó del hilo y la
 * consulta actual no repite el término.
 */
export function treatsTemporaryPlacement(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  const title = normalizeSpanishText(source.documentTitle);
  if (DESTAQUE_NOUN.test(title)) return true;
  const text = normalizeSpanishText(
    `${source.sectionTitle ?? ''} ${source.chunkContent}`,
  );
  return DESTAQUE_NOUN.test(text) || DESTAQUE_PARTICIPLE.test(text);
}

/**
 * El fragmento desarrolla el trámite del destaque en su sección o su cuerpo. El
 * título de la norma no basta: se titula por su ámbito y puede desarrollar otro
 * trámite. El participio exige contexto de traslado, porque «los postulantes
 * destacados en el concurso» es un uso del verbo y no el proceso.
 */
export function namesTemporaryPlacementProcess(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  const text = normalizeSpanishText(
    `${source.sectionTitle ?? ''} ${source.chunkContent}`,
  );
  return (
    DESTAQUE_NOUN.test(text) ||
    (DESTAQUE_PARTICIPLE.test(text) && TRANSFER_CONTEXT.test(text))
  );
}

/** Evidencia que trata directamente el destaque consultado. */
export function isDirectTemporaryPlacementEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): boolean {
  return (
    isTemporaryPlacementQuestion(question) && treatsTemporaryPlacement(source)
  );
}

function explicitQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  // El nombre del proceso ya está en la pregunta: la búsqueda vectorial usa la
  // misma denominación que el corpus, así que una consulta canónica añadida
  // solo sumaría búsquedas y fragmentos de otros aspectos del trámite. La
  // expansión existe para las formas verbales y coloquiales («cómo
  // destacarme»), que de otro modo no aportan el término del proceso.
  if (DESTAQUE_NOUN.test(text)) return [];
  const queries: string[] = [EXPLICIT_DESTAQUE_QUERY];
  if (RENEWAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.DESTAQUE_RENEWAL);
  }
  const causals = causalLabelsInQuestion(question);
  if (causals.length) {
    queries.push(`destaque docente causal ${causals.join(' ')} requisitos`);
  }
  return [...new Set(queries)].slice(0, 3);
}

/** Relato del desplazamiento temporal sin usar el término del proceso. */
function descriptiveQueries(text: string): string[] {
  if (/\bcontratad[oa]s?\b/u.test(text)) return [];
  const school =
    /\b(?:colegio|escuela|institucion educativa|docente|profesor(?:a)?)\b/u.test(
      text,
    );
  const otherWorkplace =
    /\b(?:otr[oa]\s+(?:colegio|escuela|institucion educativa|ugel|dre)|(?:trasladar|desplazar|mover|cambiar)(?:me|se)?\s+(?:a|hacia))\b/u.test(
      text,
    );
  const temporary =
    /\b(?:temporal(?:mente)?|por\s+(?:un|algun)\s+tiempo|provisionalmente)\b/u.test(
      text,
    );
  const retainsPosition =
    /\b(?:sin\s+perder|no\s+(?:quiero|deseo)\s+perder|conservar|mantener)\b.{0,45}\b(?:plaza|cargo)\b/u.test(
      text,
    );
  return school && otherWorkplace && temporary && retainsPosition
    ? [INTENT_EXPANSIONS.DESTAQUE_DESCRIPTIVE]
    : [];
}

export function temporaryPlacementQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  if (NEGATED_MOVE.test(text)) return [];
  if (isTemporaryPlacementQuestion(question)) return explicitQueries(question);
  if (OTHER_REGIME_OR_OBJECT.test(text)) return [];
  return descriptiveQueries(text);
}
