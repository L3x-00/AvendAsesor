import type { RetrievedChunk } from './retrieval.gateway';
import { causalsInQuestion } from './process-clarification';
import { normalizeSpanishText } from './text-normalization';

/**
 * Reconocimiento de la reasignación cuando se expresa como un deseo cotidiano
 * («soy nombrado en Junín, quiero irme a Lima porque mi familia vive allá»).
 * No agrega requisitos ni causales: solo traduce la intención al proceso que
 * regula el corpus para que la búsqueda y el prompt la traten como tal.
 */

const REASSIGNMENT_SIGNAL =
  /\b(?:reasignacion(?:es)?|reasignar(?:me|se|nos)?)\b/u;
const AUXILIARY_ROLE_SIGNAL = /\bauxiliar(?:es)?(?:\s+de\s+educaci[oó]n)?\b/u;
const TEACHING_ROLE_SIGNAL =
  /\b(?:nombrad[oa]s?|contratad[oa]s?|docentes?|profesor(?:a|es|as)?|maestr[oa]s?)\b/u;
const FIRST_PERSON_AUXILIARY =
  /\b(?:soy|trabajo como|me desempe[nñ]o como|estoy como)\s+(?:un |una |el |la )?auxiliar(?:es)?(?:\s+de\s+educaci[oó]n)?\b/u;
const FIRST_PERSON_TEACHER =
  /\b(?:soy|trabajo como|me desempe[nñ]o como|estoy como)\s+(?:un |una |el |la )?(?:docente|profesor(?:a)?|maestr[oa]|nombrad[oa]|contratad[oa])\b/u;
const RELOCATION_SIGNAL =
  /\b(?:quiero|quisiera|deseo|necesito|planeo|pienso)\s+(?:irme|mudarme|trasladarme|reubicarme|cambiarme)\b|\b(?:irme|mudarme|trasladarme|reubicarme)\s+(?:a|hacia|para)\b|\b(?:trasladar(?:me|se|nos)?|reubicar(?:me|nos)?|mudar(?:me|se|nos)?)\s+(?:a|hacia|de)\b|\bcambiar(?:me)?\s+de\s+(?:colegio|ie|institucion educativa|region|ciudad|departamento|ugel|dre|plaza|lugar)\b/u;

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

/**
 * La consulta pide trasladarse de lugar de trabajo, con o sin el término
 * «reasignación». Se exige el deseo de desplazamiento y un vínculo docente: una
 * mudanza personal sin contexto laboral no se convierte en este trámite.
 */
export function isReassignmentQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (REASSIGNMENT_SIGNAL.test(text)) return true;
  return TEACHING_ROLE_SIGNAL.test(text) && RELOCATION_SIGNAL.test(text);
}

/**
 * Régimen del traslado consultado. Un auxiliar no se rige por la norma de
 * reasignación de profesores: el catálogo tiene un procedimiento propio. El rol
 * se toma solo del texto de la persona; si no lo declara, no se supone.
 */
export function reassignmentRole(
  question: string,
): 'auxiliar' | 'docente' | null {
  const text = normalizeSpanishText(question);
  const ownAuxiliary = FIRST_PERSON_AUXILIARY.test(text);
  const ownTeacher = FIRST_PERSON_TEACHER.test(text);
  // La primera persona del solicitante manda: «soy docente y mi esposa es
  // auxiliar» no convierte su traslado en un procedimiento de auxiliares.
  if (ownAuxiliary && !ownTeacher) return 'auxiliar';
  if (ownTeacher && !ownAuxiliary) return 'docente';
  if (ownAuxiliary && ownTeacher) return null;
  // Sin primera persona se acepta una consulta temática sobre auxiliares solo
  // si el texto no habla de profesores.
  if (AUXILIARY_ROLE_SIGNAL.test(text) && !TEACHING_ROLE_SIGNAL.test(text)) {
    return 'auxiliar';
  }
  if (TEACHING_ROLE_SIGNAL.test(text)) return 'docente';
  return null;
}

/**
 * Consultas canónicas que usan la denominación del corpus. Cuando la persona
 * nombró un motivo, se añade su causal para que la búsqueda llegue a la regla
 * que efectivamente rige ese caso.
 */
export function reassignmentEvidenceQueries(question: string): string[] {
  if (!isReassignmentQuestion(question)) return [];
  const causals = causalsInQuestion(question);
  const queries: string[] = [];
  if (reassignmentRole(question) === 'auxiliar') {
    queries.push(
      'reasignación auxiliares de educación otra UGEL requisitos causales unidad familiar',
    );
  }
  if (causals.includes('unidad-familiar')) {
    queries.push(
      'reasignación docente unidad familiar requisitos traslado otra región convivencia familiar',
    );
  }
  queries.push(
    'reasignación docente requisitos etapas proceso norma técnica de reasignación y permuta',
  );
  if (causals.length) {
    queries.push(
      'causales de reasignación docente salud emergencia unidad familiar interés personal requisitos',
    );
  }
  return [...new Set(queries)].slice(0, 4);
}

/**
 * Fragmento que además nombra el motivo que la persona declaró (por ejemplo,
 * unidad familiar). Se entrega junto con la norma general para que la respuesta
 * no tenga que generalizar la causal desde otra norma.
 */
export function isReassignmentCausalEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  if (!isReassignmentQuestion(question)) return false;
  const causals = causalsInQuestion(question);
  if (!causals.length) return false;
  const evidence = evidenceText(source);
  if (!/\breasignacion(?:es)?\b/u.test(evidence)) return false;
  return causals.some((causal) => {
    if (causal === 'unidad-familiar') {
      return /\b(?:unidad familiar|familia(?:r|res)?|hij[oa]s?|conyuge|espos[oa]|pareja)\b/u.test(
        evidence,
      );
    }
    if (causal === 'salud') {
      return /\b(?:salud|enfermedad|discapacidad)\b/u.test(evidence);
    }
    if (causal === 'emergencia') return /\bemergencias?\b/u.test(evidence);
    if (causal === 'violencia') return /\bviolencia\b/u.test(evidence);
    if (causal === 'interes-personal') {
      return /\binteres personal\b/u.test(evidence);
    }
    return false;
  });
}

/**
 * Fuente que trata el proceso de reasignación, no una mención incidental de la
 * palabra en un listado de supuestos de otro régimen.
 */
export function isDirectReassignmentEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  if (!isReassignmentQuestion(question)) return false;
  const title = normalizeSpanishText(source.documentTitle);
  const evidence = evidenceText(source);
  if (!/\breasignacion(?:es)?\b/u.test(evidence)) return false;
  const role = reassignmentRole(question);
  if (role === 'auxiliar') {
    // El auxiliar se rige por su propio procedimiento, no por la norma de
    // reasignación y permuta de profesores.
    return /\bauxiliar(?:es)?\s+de\s+educacion\b/u.test(evidence);
  }
  // La norma que regula el proceso lo anuncia en su título. Una mención de
  // «reasignación» dentro de un procedimiento de otro régimen (por ejemplo,
  // situaciones administrativas de auxiliares) no responde la consulta de un
  // profesor y no debe desplazar a la norma propia.
  if (/\breasignacion\b/u.test(title)) return true;
  return (
    role === 'docente' &&
    /\bprofesor(?:es)?\b[\s\S]{0,80}\breasignacion\b|\breasignacion\b[\s\S]{0,80}\bprofesor(?:es)?\b/u.test(
      evidence,
    )
  );
}
