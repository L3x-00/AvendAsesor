import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';
import { isTeacherRequirementsQuestion } from './teacher-requirements-retrieval';
import { isRemovalQuestion } from './removal-retrieval';

/**
 * Verificadores de contenido y respuestas extractivas para los casos del plan
 * (requisitos para ser docente y remoción del cargo). Igual que en P1/C05: el
 * texto es fijo, sale del fragmento verificado y la cita [1] la crea el
 * servidor. Si ningún fragmento trae el contenido expreso, no se responde y el
 * flujo normal sigue fail-closed.
 *
 * Cada respuesta exige QUE LA PREGUNTA haya sido reconocida por su detector y
 * un fragmento que trate el tema de fondo, para no opacar otras rutas (horas,
 * C05, salario) con un texto fijo.
 */

const REQUIREMENT_EVIDENCE =
  /\b(?:t[ií]tulo de profesor|licenciado en educaci[oó]n)\b/u;
const REQUIREMENT_CONTEXT =
  /\b(?:requisitos? generales?|para postular|concurso p[uú]blico|carrera p[uú]blica magisterial|formaci[oó]n inicial)\b/u;
/** Fuentes de trámites distintos que mencionan el requisito de paso. */
const REQUIREMENT_OTHER_TOPIC =
  /\b(?:renovaci[oó]n|reasignaci[oó]n|destaque|encargatura|licencia|contrataci[oó]n auxiliares?|nombramiento de auxiliar)\b/u;

const REMOVAL_EVIDENCE =
  /\b(?:suspensi[oó]n en el cargo|cese temporal|destituci[oó]n del servicio|destituci[oó]n del cargo)\b/u;
const REMOVAL_CONTEXT =
  /\b(?:amonestaci[oó]n escrita|proceso administrativo disciplinario|falta grave|inhabilitaci[oó]n|doce \(12\) meses)\b/u;
/** Fuentes de otros temas que pueden enumerar sanciones de paso. */
const REMOVAL_OTHER_TOPIC =
  /\b(?:reasignaci[oó]n|destaque|encargatura|renovaci[oó]n|contrataci[oó]n auxiliares?|exoneraci[oó]n)\b/u;

function verifiedSource(
  sources: readonly RetrievedChunk[],
  evidence: RegExp,
  context: RegExp,
  otherTopic: RegExp,
): RetrievedChunk | null {
  return (
    sources.find((source) => {
      const text = normalizeSpanishText(source.chunkContent);
      const title = normalizeSpanishText(source.documentTitle ?? '');
      return (
        evidence.test(text) &&
        context.test(text) &&
        !otherTopic.test(text) &&
        !otherTopic.test(title)
      );
    }) ?? null
  );
}

export interface VerifiedCoverageAnswer {
  answer: string;
  sources: readonly RetrievedChunk[];
}

/** Requisitos generales para ser docente (Ley 29944, Art. 4 y 18). */
export function verifiedTeacherRequirementsAnswer(
  question: string,
  sources: readonly RetrievedChunk[],
): VerifiedCoverageAnswer | null {
  if (!isTeacherRequirementsQuestion(question)) return null;
  const source = verifiedSource(
    sources,
    REQUIREMENT_EVIDENCE,
    REQUIREMENT_CONTEXT,
    REQUIREMENT_OTHER_TOPIC,
  );
  if (!source) return null;
  const text = normalizeSpanishText(source.chunkContent);
  const acreditada = /\bacreditad[oa]\b/u.test(text)
    ? ' otorgado por una institución de formación docente acreditada,'
    : '';
  return {
    answer: `Para ser docente se requiere contar con título de profesor o licenciado en educación${acreditada} y cumplir los requisitos generales de postulación a la Carrera Pública Magisterial. [1]`,
    sources: [source],
  };
}

/** Causales y sanciones por las que un director o docente deja el cargo. */
export function verifiedRemovalAnswer(
  question: string,
  sources: readonly RetrievedChunk[],
): VerifiedCoverageAnswer | null {
  if (!isRemovalQuestion(question)) return null;
  const source = verifiedSource(
    sources,
    REMOVAL_EVIDENCE,
    REMOVAL_CONTEXT,
    REMOVAL_OTHER_TOPIC,
  );
  if (!source) return null;
  const text = normalizeSpanishText(source.chunkContent);
  const previoPad = /\bprevio proceso administrativo/u.test(text)
    ? ' Las sanciones de cese temporal y destitución se aplican previo proceso administrativo disciplinario.'
    : '';
  return {
    answer: `El cargo puede dejarse por sanción administrativa: suspensión (hasta 30 días), cese temporal (de 31 días a 12 meses) o destitución del servicio.${previoPad} [1]`,
    sources: [source],
  };
}
