import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

const STATUS_QUESTION_PATTERNS = [
  /\b(?:vigente|derogad[oa]s?|reemplazad[oa]s?|modificad[oa]s?|actualizad[oa]s?)\b/u,
  /\bvigencia\s+(?:de\s+)?(?:la\s+)?(?:norma|normativa|documento|regla|resolucion|ley|decreto)\b/u,
  /\b(?:cambios?|modificaciones?)\b/u,
];

const EXPLICIT_CHANGE_PATTERN =
  /\b(?:modific\w*|derog\w*|reemplaz\w*|actualiz\w*|sustitu\w*|complement\w*|deja\w*\s+sin\s+efecto)\b/iu;

/**
 * Las preguntas de vigencia o cambio necesitan recuperar también los
 * antecedentes disponibles; una fuente marcada como actual no basta para
 * certificar que no exista un cambio posterior.
 */
export function asksForDocumentStatus(question: string): boolean {
  const normalized = normalizeSpanishText(question);
  return STATUS_QUESTION_PATTERNS.some((pattern) => pattern.test(normalized));
}

/**
 * El estado histórico registrado o una frase explícita de cambio abre paso a
 * una explicación sustentada. Sin ninguno de los dos, la única salida segura
 * es declarar que no se identificó el cambio, no confirmarlo por inferencia.
 */
export function hasExplicitDocumentChangeEvidence(
  sources: RetrievedChunk[],
): boolean {
  return sources.some(
    (source) =>
      source.documentSituation !== 'current' ||
      EXPLICIT_CHANGE_PATTERN.test(normalizeSpanishText(source.chunkContent)),
  );
}

/**
 * Respuesta determinista para evitar que el modelo transforme la ausencia de
 * cambios recuperados en una certificación de vigencia. La cita refiere a la
 * primera fuente revisada y la interfaz conserva el conjunto completo.
 */
export function noIdentifiedChangesMessage(
  question: string,
  sources: RetrievedChunk[],
): string | null {
  if (
    !asksForDocumentStatus(question) ||
    !sources.length ||
    hasExplicitDocumentChangeEvidence(sources)
  ) {
    return null;
  }

  return [
    'Sin cambios identificados en las fuentes disponibles. [1]',
    'Esto no equivale a una vigencia confirmada: las fuentes recuperadas no muestran una modificación o un reemplazo expreso para este punto. El sistema no puede determinar si existe una publicación posterior que no haya sido incorporada al corpus ni consultada desde una fuente oficial actualizada.',
  ].join('\n\n');
}
