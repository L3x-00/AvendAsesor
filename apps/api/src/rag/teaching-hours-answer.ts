import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Respuesta extractiva para «quién decide cuántas horas me tocan». El modelo
 * generativo tendía a extendir la regla del cuadro de horas y la protección
 * administrativa retenía la respuesta. Aquí solo se enuncia lo que el fragmento
 * verificado dice expresamente, con la cita creada por el servidor.
 */
const DECISION_QUESTION =
  /\b(?:quien|quienes)\s+(?:decide|deciden|determina|determinan|asigna|asignan|aprueba|aprueban)\b/u;
const HOURS_TOPIC = /\bhoras?\b|\bcarga\s+horaria\b/u;
const DISTRIBUTION = /\bcuadro\s+de\s+distribuci[oó]n\s+de\s+horas\b/u;
const APPROVAL = /\b(?:aprob|aprueb)/u;
const AUTHORITY = /\b(?:ugel|dre)\b/u;
const IE_PROPOSAL =
  /\brecae\s+directamente\s+en\s+el\s+director\s+de\s+la\s+ie\b/u;
const NEGATED = /\bno\s+(?:recae|aprueba|corresponde)\b/u;

export interface TeachingHoursDecisionAnswer {
  answer: string;
  sources: readonly RetrievedChunk[];
}

export function buildTeachingHoursDecisionAnswer(
  question: string,
  sources: readonly RetrievedChunk[],
): TeachingHoursDecisionAnswer | null {
  const asked = normalizeSpanishText(question);
  if (!DECISION_QUESTION.test(asked) || !HOURS_TOPIC.test(asked)) return null;

  const source = sources.find((candidate) => {
    const text = normalizeSpanishText(candidate.chunkContent);
    return (
      DISTRIBUTION.test(text) &&
      APPROVAL.test(text) &&
      AUTHORITY.test(text) &&
      IE_PROPOSAL.test(text) &&
      !NEGATED.test(text)
    );
  });
  if (!source) return null;

  return {
    answer:
      'La propuesta del cuadro de distribución de horas recae en el director de la institución educativa; la aprobación corresponde a la UGEL o a la DRE mediante acto resolutivo firmado por su director. [1]',
    sources: [source],
  };
}
