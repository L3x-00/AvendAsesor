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
const NEGATED_TEMPORARY_PLACEMENT =
  /\bno\s+(?:quiero|deseo|necesito|busco|me\s+interesa)\s+(?:(?:un|una|el|la)\s+)?(?:destaques?|destacarme|destacarse|destacar)\b/u;

/** Negación del desplazamiento completo (se conserva la guarda original). */
const NEGATED_MOVE =
  /\bno\s+(?:quiero|deseo|necesito|busco)\s+(?:trabajar|irme|trasladarme|desplazarme|cambiarme)\b/u;

/**
 * Otro régimen o un objeto físico: el auxiliar tiene su propio procedimiento y
 * un estacionamiento no es un destaque.
 */
const OTHER_REGIME_OR_OBJECT =
  /\b(?:auxiliar(?:es)?|estacionamiento|aparcamiento|parking|vehicul\p{L}*)\b/u;

const DESTAQUE_NOUN = /\bdestaques?\b/u;
/** «destacarme», «destacarse»: la persona se refiere a su propio traslado. */
const DESTAQUE_SELF = /\bdestacar(?:me|se|nos|lo|la)\b/u;
/** «me destaco», «me destacaría»: primera persona sin el infinitivo. */
const DESTAQUE_FIRST_PERSON = /\bme\s+destac(?:o|are|aria|e)\b/u;
/** Formas que también aparecen en sentido figurado: exigen contexto de traslado. */
const DESTAQUE_CONJUGATED = /\bdestac(?:ar|o|a|an|amos|are|aria|aran)\b/u;
const DESTAQUE_PARTICIPLE = /\bdestacad[oa]s?\b/u;
/**
 * Indicio de traslado o de plaza, no de docencia: «destacar en el examen» y
 * «docente destacado del año» son lenguaje corriente en un colegio y no piden
 * el proceso. «Nombrado» sí lo pide: el destaque es del personal nombrado.
 */
const TRANSFER_CONTEXT =
  /\b(?:nombrad[oa]s?|plazas?|plaza de origen|colegios?|escuelas?|institucion educativa|\bie\b|ugel|dre|otr[oa]s?\s+(?:colegio|escuela|institucion educativa|ie|ugel|dre|plaza|region|provincia|zona|localidad|distrito))\b/u;

const RENEWAL = /\b(?:renov\p{L}*|prorrog\p{L}*|ampliacion|vigencia)\b/u;

const EXPLICIT_DESTAQUE_QUERY =
  'destaque docente requisitos procedimiento solicitud plazo norma técnica';

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
    TRANSFER_CONTEXT.test(text)
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
  const queries = [EXPLICIT_DESTAQUE_QUERY];
  if (RENEWAL.test(text)) {
    queries.push('renovación de destaque plazo prórroga solicitud vigencia');
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
    ? ['destaque docente temporal plaza de origen requisitos solicitud']
    : [];
}

export function temporaryPlacementQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  if (NEGATED_MOVE.test(text)) return [];
  if (isTemporaryPlacementQuestion(question)) return explicitQueries(question);
  if (OTHER_REGIME_OR_OBJECT.test(text)) return [];
  return descriptiveQueries(text);
}
