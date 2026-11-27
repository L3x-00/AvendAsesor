import { INTENT_EXPANSIONS } from './intent-routing.config';
import { normalizeSpanishText } from './text-normalization';

/**
 * Requisitos para ser docente. La persona lo pregunta con palabras cotidianas
 * («qué se requiere para ser docente», «qué necesito para ser profe») que no
 * nombran un trámite concreto; por eso antes se trataba como seguimiento
 * elíptico y heredaba el tema salarial del turno anterior. El corpus (Ley
 * 29944, Art. 4 y 18) habla de título de profesor/licenciado en educación,
 * formación inicial y requisitos generales para postular a la CPM.
 *
 * La expansión solo añade vocabulario de búsqueda, nunca hechos, y no cambia
 * el umbral ni la admisión de evidencia. No apunta a un documento concreto: si
 * la Ley 29944 se archiva o cambia, otra norma con el mismo contenido puede
 * responder.
 */

const REQUIREMENT_WORD =
  /\b(?:requisit[oa]s?|requiere|requieren|necesita|necesito|pide|piden|exige|exigen|condicion(?:es)?)\b/u;
const TEACHER_ROLE =
  /\b(?:docente|profesor(?:a|es|as)?|profe|maestr[oa]|educativ[oa]s?|licenciad[oa]\s+en\s+educaci[oó]n|cpms?|ense[nñ]ar|dar\s+clases)\b/u;
const BE_TEACHER =
  /\b(?:ser|para\s+ser|llegar\s+a\s+ser|ejercer\s+como|trabajar\s+como|dedicarse\s+a|postular\s+a\s+la|ense[nñ]ar|dar\s+clases)\b/u;
/** Excluir requisitos de trámites concretos (contratación, auxiliares, etc.). */
const OTHER_PROCESS =
  /\b(?:auxiliar|contrataci[oó]n|contratad[oa]s?|nombramiento|nombrad[oa]s?|licencia|destaque|reasignaci[oó]n|racionalizaci[oó]n|encargatura|ascenso|escala|plaza|beca|posgrado)\b/u;

/** La pregunta pide los requisitos generales para ser docente. */
export function isTeacherRequirementsQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (OTHER_PROCESS.test(text)) return false;
  return (
    REQUIREMENT_WORD.test(text) &&
    TEACHER_ROLE.test(text) &&
    BE_TEACHER.test(text)
  );
}

/** Consulta canónica con el vocabulario del corpus para este tema. */
export function teacherRequirementsEvidenceQueries(question: string): string[] {
  if (!isTeacherRequirementsQuestion(question)) return [];
  return [INTENT_EXPANSIONS.TEACHING_REQUIREMENTS_PROCESS];
}
