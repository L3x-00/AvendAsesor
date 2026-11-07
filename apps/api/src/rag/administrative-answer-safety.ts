import { normalizeSpanishText } from './text-normalization';
import type { MedicalLeaveApplicability } from './medical-leave-applicability';
import {
  renderMedicalLeaveAnswer,
  validatedMedicalLeaveEvidence,
} from './medical-leave-evidence';
import type { RetrievedChunk } from './retrieval.gateway';

/** Render only complete, scope-compatible provisions whose spans were verified. */
export function verifiedMedicalLeaveAnswer(
  applicability: MedicalLeaveApplicability,
  sources: readonly RetrievedChunk[],
) {
  const evidence = validatedMedicalLeaveEvidence(applicability, sources);
  return renderMedicalLeaveAnswer(applicability, evidence);
}

const MEDICAL_LEAVE =
  /\b(?:descanso\s+medic[oa]|incapacidad\s+temporal|enferm(?:o|a|e|edad|ar|ado|ada))\b/u;
const VACATIONS_BY_STATUS = /\bvacaciones?\b/u;
const EMPLOYMENT_STATUS = /\b(?:nombrad|contratad)/u;
const WORKDAY_BY_LEVEL = /\b(?:jornada|horas?|carga\s+horaria)\b/u;
const SCHOOL_LEVEL = /\b(?:secundaria|inicial|primaria|eb[rae]|cetpro)\b/u;
const TARDINESS = /\b(?:tardanz(?:a|as)|lleg(?:ar|ue|o)\s+tarde)\b/u;

/**
 * Preguntas cuya respuesta exige no extender una regla expresa ni completar
 * una omisión del documento. Se retienen antes de transmitir tokens para que
 * una corrección de seguridad no llegue tarde a la interfaz.
 */
export function needsAdministrativeAnswerSafety(question: string): boolean {
  const text = normalizeSpanishText(question);
  return (
    MEDICAL_LEAVE.test(text) ||
    (VACATIONS_BY_STATUS.test(text) && EMPLOYMENT_STATUS.test(text)) ||
    (WORKDAY_BY_LEVEL.test(text) && SCHOOL_LEVEL.test(text)) ||
    TARDINESS.test(text)
  );
}

/** Detecta inferencias no respaldadas; nunca las reemplaza por texto fijo. */
export function hasUnsupportedAdministrativeInference(
  question: string,
  answer: string,
): boolean {
  const asked = normalizeSpanishText(question);
  const normalized = normalizeSpanishText(answer);

  if (MEDICAL_LEAVE.test(asked)) {
    // Una receta expedida por quien emite el CITT confunde el certificado
    // médico con la alternativa CITT. También se retiene una constancia de
    // hospitalización presentada como obligatoria cuando la norma la prevé
    // como facultativa.
    if (
      /\breceta\s+medica\b.{0,100}\b(?:expide|emite)\s+(?:el\s+)?citt\b/u.test(
        normalized,
      )
    )
      return true;
    if (/\bcitt\b/u.test(normalized) && /\breceta\b/u.test(normalized)) {
      const recipeClauses = normalized
        .split(/[.!?\n]/u)
        .filter((clause) => /\breceta\b/u.test(clause));
      if (
        recipeClauses.some(
          (clause) =>
            !/\b(?:certificado\s+medico|cm)\b/u.test(clause) ||
            /\b(?:ambos|independientemente|siempre|toda\s+solicitud)\b/u.test(
              clause,
            ),
        )
      )
        return true;
    }
    if (
      /\bcitt\b.{0,40}\by\s+(?:la\s+)?receta\b|\b(?:siempre|toda\s+solicitud)\b.{0,70}\breceta\b|\breceta\b.{0,70}\b(?:siempre|toda\s+solicitud)\b/u.test(
        normalized,
      )
    )
      return true;
    if (
      /\bcitt\b/u.test(normalized) &&
      /\breceta\b/u.test(normalized) &&
      !/\bcitt\b.{0,100}\bo\b.{0,60}\b(?:certificado\s+medico|cm)\b|\b(?:certificado\s+medico|cm)\b.{0,100}\bo\b.{0,60}\bcitt\b/u.test(
        normalized,
      )
    )
      return true;
    if (
      /\b(?:debes?|deberas?|obligatorio|necesario)\b.{0,80}\b(?:adjuntar|presentar)\b.{0,60}\bconstancia\s+de\s+hospitalizacion\b/u.test(
        normalized,
      )
    )
      return true;
    if (
      /\bconstancia\s+de\s+hospitalizacion\b.{0,60}\b(?:obligatori[oa]|necesari[oa]|exigid[oa])\b/u.test(
        normalized,
      )
    )
      return true;
  }

  if (
    MEDICAL_LEAVE.test(asked) &&
    /\b(?:maxim[oa]|hasta)\b.{0,48}\b(?:20|veinte)\s+dias\b/u.test(normalized)
  )
    return true;

  if (
    TARDINESS.test(asked) &&
    /si.{0,80}(?:solo|una).{0,100}(?:vez|tarde|tardanz).{0,100}no.{0,80}(?:descuento|procede)/iu.test(
      normalized,
    )
  )
    return true;

  if (
    VACATIONS_BY_STATUS.test(asked) &&
    EMPLOYMENT_STATUS.test(asked) &&
    /(?:solo|unicamente).{0,90}(?:nombrad|carrera publica).{0,90}(?:tienen|corresponde)|contratad.{0,90}(?:no|sin).{0,90}derecho.{0,90}vacacion|parece.{0,90}solo.{0,90}nombrad/iu.test(
      normalized,
    )
  )
    return true;

  if (
    WORKDAY_BY_LEVEL.test(asked) &&
    SCHOOL_LEVEL.test(asked) &&
    /\b(?:planificaci[oó]n|reuniones|formaci[oó]n\s+continua|gesti[oó]n\s+educativa|horas\s+lectivas\s+y\s+no\s+lectivas)\b/iu.test(
      answer,
    )
  )
    return true;

  return false;
}
