import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Racionalización de plazas: la reducción de plazas por disminución de la
 * matrícula. La intención se reconoce por la combinación de conceptos, no por
 * una palabra aislada: «plazas» o «alumnos» por separado pertenecen a muchos
 * trámites.
 */

const EXPLICIT_SIGNAL = /\bracionalizacion(?:es)?\b/u;
const PLACE_SIGNAL = /\bplazas?\b/u;
const REDUCTION_SIGNAL =
  /\b(?:reduc(?:ir|cion|cir|can|ca)|quitar(?:an|me)?|eliminar(?:an)?|suprim(?:ir|an|en)|recortar(?:an)?|disminu(?:ir|cion|yen|ye))\b/u;
const ENROLLMENT_SIGNAL =
  /\b(?:alumnos?|estudiantes?|matricula|secciones?|aulas?)\b/u;
const DECLINE_SIGNAL =
  /\b(?:bajando|bajan|bajo|disminuyendo|disminuyen|menos|descenso|reduccion|se estan quedando sin)\b/u;

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

/**
 * La consulta trata la reducción o racionalización de plazas, también cuando
 * la persona la describe por sus efectos («están bajando los alumnos y van a
 * reducir plazas»).
 */
export function isRationalizationQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (EXPLICIT_SIGNAL.test(text)) return true;
  if (!PLACE_SIGNAL.test(text)) return false;
  return (
    REDUCTION_SIGNAL.test(text) ||
    (ENROLLMENT_SIGNAL.test(text) && DECLINE_SIGNAL.test(text))
  );
}

/** Consulta canónica con la denominación que usa el corpus para este proceso. */
export function rationalizationEvidenceQueries(question: string): string[] {
  if (!isRationalizationQuestion(question)) return [];
  return [
    'racionalización de plazas docentes reducción de plazas por disminución de estudiantes',
    'proceso de racionalización de plazas instituciones educativas reducción secciones',
  ];
}

/**
 * Fuente que trata la racionalización de plazas, no una plaza mencionada en
 * otro procedimiento.
 */
export function isDirectRationalizationEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  if (!isRationalizationQuestion(question)) return false;
  const evidence = evidenceText(source);
  // Se exige una fuente que regule el proceso, no una mención incidental:
  // «causal de racionalización», «me encuentro en proceso de racionalización»
  // o «producto del proceso de racionalización» describen otro trámite. El
  // procedimiento debe relacionar la racionalización de plazas con la
  // reducción o la disminución de estudiantes/matrícula.
  return (
    /\breduccion\s+de\s+plazas?\b/u.test(evidence) ||
    /\bracionalizacion\s+de\s+plazas\b[\s\S]{0,160}\b(?:disminucion|reduccion|matricula|estudiantes|secciones)\b/u.test(
      evidence,
    )
  );
}
