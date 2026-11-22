import { INTENT_EXPANSIONS } from './intent-routing.config';
import { normalizeSpanishText } from './text-normalization';

/**
 * Reemplazo del director cuando está de licencia. La persona suele describirlo
 * con palabras cotidianas («quién se queda a cargo», «quién asume el cargo»)
 * que no aparecen en la norma; el corpus habla de encargatura, plaza vacante y
 * DRE/UGEL. La expansión solo añade vocabulario de búsqueda, nunca hechos, y
 * no cambia el umbral ni la admisión de evidencia.
 */

const ABSENCE =
  /\b(?:licencia|licencias|ausencia|ausente|falta|no\s+esta|esta\s+de\s+baja)\b/u;
const DIRECTOR = /\bdirector(?:a|es|as)?\b|\bdire\b/u;
/** El director es el objeto de la acción: «reemplaza/al director». */
const DIRECTOR_OBJECT = /\b(?:al|a\s+la|del|de\s+la)\s+director(?:a|es|as)?\b/u;
const TAKEOVER_VERB =
  /\b(?:reemplaz(?:a|an|ar)|sustituy(?:e|en|ar)|asum(?:e|en|ir)|se\s+encarga|se\s+queda|queda)\b/u;
/** La acción recae sobre el cargo o la escuela, no sobre otra tarea. */
const OF_THE_POSITION =
  /\b(?:cargo|plaza|escuela|instituci[oó]n|direcci[oó]n|\bie)\b/u;
const COLOQUIAL_TAKEOVER =
  /\b(?:se\s+)?qued(?:a|an|o|os|as)\s+(?:a\s+|con\s+)?cargo\b|\bse\s+queda\s+con\b|\best(?:a|an)\s+a\s+cargo\b|\basum(?:e|en|ir|ira)\s+(?:(?:el|la)\s+)?(?:cargo|direcci[oó]n)\b|\bse\s+encarga\b/u;
const ENCARGATURA = /\bencargatura\b/u;

/** La pregunta pide quién asume el cargo del director ausente. */
export function isDirectorReplacementQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (!ABSENCE.test(text)) return false;
  if (ENCARGATURA.test(text) && DIRECTOR.test(text)) return true;
  if (DIRECTOR_OBJECT.test(text) && TAKEOVER_VERB.test(text)) return true;
  return (
    DIRECTOR.test(text) &&
    COLOQUIAL_TAKEOVER.test(text) &&
    OF_THE_POSITION.test(text)
  );
}

/** Consulta canónica con el vocabulario que usa el corpus para este proceso. */
export function directorReplacementEvidenceQueries(question: string): string[] {
  if (!isDirectorReplacementQuestion(question)) return [];
  return [INTENT_EXPANSIONS.DIRECTOR_REPLACEMENT];
}
