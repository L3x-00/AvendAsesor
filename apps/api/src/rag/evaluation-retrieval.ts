import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

const ASCENSO_SIGNAL =
  /\b(?:ascens(?:o|os)|ascend(?:er|ido|iendo)|asciend[oa])\b/u;
const DESEMPENO_SIGNAL =
  /\b(?:evaluaci[oó]n\s+de[ls]?\s+desempe[nñ]o|desempe[nñ]o\s+docente)\b/u;
const NAMED_SIGNAL = /\b(?:nombrad[oa]s?|carrera\s+publica\s+magisterial)\b/u;
const CONTRACT_SIGNAL =
  /\b(?:contratad[oa]s?|contrataci[oó]n|renovaci[oó]n\s+de\s+contrato)\b/u;
const COMPARISON_SIGNAL =
  /\b(?:diferencia(?:s)?|compar(?:a|ar|acion)|versus|\bvs\b)\b/u;

function textOf(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

export function evaluationEvidenceQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  const queries: string[] = [];
  if (ASCENSO_SIGNAL.test(text)) {
    queries.push(
      'concurso de ascenso escala magisterial requisitos etapas prueba nacional trayectoria profesional',
    );
  }
  if (DESEMPENO_SIGNAL.test(text) && NAMED_SIGNAL.test(text)) {
    queries.push(
      'evaluación del desempeño docente nombrado consecuencias evaluación desfavorable',
    );
  }
  if (
    ASCENSO_SIGNAL.test(text) &&
    /\b(?:permanencia|a[nñ]os?\s+minimos?|tiempo\s+minimo)\b/u.test(text)
  ) {
    queries.push(
      'concurso ascenso permanencia mínima escala magisterial requisitos',
    );
  }
  if (
    ASCENSO_SIGNAL.test(text) &&
    /\b(?:maestr[ií]a|maestro|grado\s+academico)\b/u.test(text)
  ) {
    queries.push('concurso ascenso maestría puntaje trayectoria profesional');
  }
  if (
    ASCENSO_SIGNAL.test(text) &&
    /\b(?:resultado|reclamo|impugnaci[oó]n)\b/u.test(text)
  ) {
    queries.push(
      'concurso ascenso resultados reclamo comité evaluación cronograma',
    );
  }
  if (COMPARISON_SIGNAL.test(text) && DESEMPENO_SIGNAL.test(text)) {
    queries.push(
      'evaluación desempeño docente nombrado concurso ascenso escala magisterial diferencias',
    );
  }
  return [...new Set(queries)].slice(0, 4);
}

/**
 * Evita que la ficha de desempeño usada para contratación o renovación se
 * presente como evaluación de desempeño de nombrados, y que tablas de otro
 * proceso se usen para puntajes de ascenso.
 */
export function isEvaluationSourceCompatible(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  const questionText = normalizeSpanishText(question);
  const evidence = textOf(source);
  const asksAscenso = ASCENSO_SIGNAL.test(questionText);
  const asksDesempeno = DESEMPENO_SIGNAL.test(questionText);
  const compares = COMPARISON_SIGNAL.test(questionText);

  if (asksAscenso && !compares) {
    return /\b(?:concurso|proceso)\s+de\s+ascenso\b|\bascenso\s+de\s+escala\b/u.test(
      evidence,
    );
  }
  if (asksDesempeno && NAMED_SIGNAL.test(questionText)) {
    return DESEMPENO_SIGNAL.test(evidence) && !CONTRACT_SIGNAL.test(evidence);
  }
  if (asksDesempeno && CONTRACT_SIGNAL.test(questionText)) {
    return DESEMPENO_SIGNAL.test(evidence) && CONTRACT_SIGNAL.test(evidence);
  }
  if (compares && asksDesempeno) {
    return (
      /\b(?:concurso|proceso)\s+de\s+ascenso\b|\bascenso\s+de\s+escala\b/u.test(
        evidence,
      ) ||
      (DESEMPENO_SIGNAL.test(evidence) && !CONTRACT_SIGNAL.test(evidence))
    );
  }
  return true;
}

export function isDirectEvaluationEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  const text = normalizeSpanishText(question);
  const evidence = textOf(source);
  if (ASCENSO_SIGNAL.test(text)) {
    return /\b(?:concurso|proceso)\s+de\s+ascenso\b|\bascenso\s+de\s+escala\b/u.test(
      evidence,
    );
  }
  if (DESEMPENO_SIGNAL.test(text) && NAMED_SIGNAL.test(text)) {
    return DESEMPENO_SIGNAL.test(evidence) && !CONTRACT_SIGNAL.test(evidence);
  }
  return false;
}
