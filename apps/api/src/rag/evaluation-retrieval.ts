import { INTENT_EXPANSIONS, INTENT_TRIGGERS } from './intent-routing.config';
import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

const ASCENSO_SIGNAL = INTENT_TRIGGERS.ASCENSO_SIGNAL;
/**
 * Progresión en la carrera expresada sin el término técnico: «subir a segunda
 * escala», «tengo años en primera escala, ¿cómo paso a la segunda?». Es una
 * consulta de ascenso, no una pregunta por una cifra.
 */
const CAREER_PROGRESSION_SIGNAL = INTENT_TRIGGERS.CAREER_PROGRESSION_SIGNAL;
const DESEMPENO_SIGNAL = INTENT_TRIGGERS.DESEMPENO_SIGNAL;
const NAMED_SIGNAL = INTENT_TRIGGERS.NAMED_SIGNAL;
const CONTRACT_SIGNAL = INTENT_TRIGGERS.EVALUATION_CONTRACT_SIGNAL;
const COMPARISON_SIGNAL = INTENT_TRIGGERS.COMPARISON_SIGNAL;

export function isCareerProgressionQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  return ASCENSO_SIGNAL.test(text) || CAREER_PROGRESSION_SIGNAL.test(text);
}

function textOf(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

export function evaluationEvidenceQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  const queries: string[] = [];
  if (ASCENSO_SIGNAL.test(text) || CAREER_PROGRESSION_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.ASCENSO_CONCURSO);
  }
  if (DESEMPENO_SIGNAL.test(text) && NAMED_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.DESEMPENO_EVALUATION);
  }
  if (
    (ASCENSO_SIGNAL.test(text) || CAREER_PROGRESSION_SIGNAL.test(text)) &&
    INTENT_TRIGGERS.EVALUATION_PERMANENCE_TRIGGER.test(text)
  ) {
    queries.push(INTENT_EXPANSIONS.ASCENSO_PERMANENCE);
  }
  if (
    (ASCENSO_SIGNAL.test(text) || CAREER_PROGRESSION_SIGNAL.test(text)) &&
    INTENT_TRIGGERS.EVALUATION_MASTERS_TRIGGER.test(text)
  ) {
    queries.push(INTENT_EXPANSIONS.ASCENSO_MASTERS);
  }
  if (
    (ASCENSO_SIGNAL.test(text) || CAREER_PROGRESSION_SIGNAL.test(text)) &&
    INTENT_TRIGGERS.EVALUATION_RESULTS_TRIGGER.test(text)
  ) {
    queries.push(INTENT_EXPANSIONS.ASCENSO_RESULTS);
  }
  if (COMPARISON_SIGNAL.test(text) && DESEMPENO_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.ASCENSO_VS_DESEMPENO);
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
  const asksAscenso =
    ASCENSO_SIGNAL.test(questionText) ||
    CAREER_PROGRESSION_SIGNAL.test(questionText);
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
  if (ASCENSO_SIGNAL.test(text) || CAREER_PROGRESSION_SIGNAL.test(text)) {
    return /\b(?:concurso|proceso)\s+de\s+ascenso\b|\bascenso\s+de\s+escala\b/u.test(
      evidence,
    );
  }
  if (DESEMPENO_SIGNAL.test(text) && NAMED_SIGNAL.test(text)) {
    return DESEMPENO_SIGNAL.test(evidence) && !CONTRACT_SIGNAL.test(evidence);
  }
  return false;
}
