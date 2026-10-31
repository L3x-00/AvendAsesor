import { normalizeSpanishText } from './text-normalization';

const MEDICAL_LEAVE =
  /\b(?:descanso\s+medic|incapacidad\s+temporal|enferm(?:o|a|edad))\b/u;
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
