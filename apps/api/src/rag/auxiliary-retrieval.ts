import { INTENT_EXPANSIONS, INTENT_TRIGGERS } from './intent-routing.config';
import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Vocabulario de recuperación para auxiliares de educación. Las expansiones
 * solo traducen una pregunta cotidiana a la denominación del corpus; no
 * agregan requisitos, montos ni plazos que la fuente no contenga.
 */
const AUXILIARY_SIGNAL = INTENT_TRIGGERS.AUXILIARY_SIGNAL;
const AUXILIARY_EDUCATION_SIGNAL = INTENT_TRIGGERS.AUXILIARY_EDUCATION_SIGNAL;
const CONTRACT_SIGNAL = INTENT_TRIGGERS.AUXILIARY_CONTRACT_SIGNAL;
const SALARY_SIGNAL = INTENT_TRIGGERS.AUXILIARY_SALARY_SIGNAL;
const MEDICAL_LEAVE_SIGNAL = INTENT_TRIGGERS.AUXILIARY_MEDICAL_LEAVE_SIGNAL;
// «Nombrado» describe el vínculo en una pregunta salarial; no equivale a
// consultar el procedimiento de nombramiento.
const APPOINTMENT_SIGNAL = INTENT_TRIGGERS.APPOINTMENT_SIGNAL;
const REASSIGNMENT_SIGNAL = INTENT_TRIGGERS.AUXILIARY_REASSIGNMENT_SIGNAL;
const VACATION_SIGNAL = INTENT_TRIGGERS.AUXILIARY_VACATION_SIGNAL;
const EXCHANGE_SIGNAL = INTENT_TRIGGERS.EXCHANGE_SIGNAL;

function textOf(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

function hasAuxiliarySalaryRule(evidence: string): boolean {
  return /\bremuneracion\s+mensual\b.{0,160}\bauxiliar(?:es)?\s+de\s+educacion\b|\bauxiliar(?:es)?\s+de\s+educacion\b.{0,160}\bremuneracion\s+mensual\b/u.test(
    evidence,
  );
}

export function isAuxiliaryQuestion(question: string): boolean {
  return AUXILIARY_SIGNAL.test(normalizeSpanishText(question));
}

/**
 * La consulta pide los requisitos para trabajar como auxiliar (formación,
 * estudios, experiencia) y no su remuneración. Permite identificar la
 * intención principal en el chat general sin depender de la palabra
 * «contratación».
 */
export function isAuxiliaryRequirementsQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (!AUXILIARY_SIGNAL.test(text) || SALARY_SIGNAL.test(text)) return false;
  return (
    CONTRACT_SIGNAL.test(text) ||
    /\b(?:estudios?|necesita|necesario|formacion|capacitacion|titulo|grado|experiencia)\b/u.test(
      text,
    )
  );
}

/** Conserva el proceso en pedidos elípticos de documentos del expediente. */
export function isAuxiliaryHiringDocumentsFollowUp(
  question: string,
  prior: string | undefined,
): boolean {
  if (!prior) return false;
  const previous = normalizeSpanishText(prior);
  return (
    /^(?:¿\s*)?(?:(?:y|ademas)\s+)?(?:que|cuales son los)\s+documentos(?:\s+(?:(?:debo|debe|debemos|deben|hay que)\s+presentar|se (?:presentan|exigen|adjuntan)|presento|presentamos|adjunto|necesito|necesitan))?\s*[?.!]*$/u.test(
      normalizeSpanishText(question),
    ) &&
    AUXILIARY_EDUCATION_SIGNAL.test(previous) &&
    /\b(?:postul\p{L}*|contratacion|trabajar como|ingresar como)\b/u.test(
      previous,
    ) &&
    isAuxiliaryRequirementsQuestion(prior) &&
    !APPOINTMENT_SIGNAL.test(previous) &&
    !MEDICAL_LEAVE_SIGNAL.test(previous) &&
    !REASSIGNMENT_SIGNAL.test(previous) &&
    !EXCHANGE_SIGNAL.test(previous) &&
    !VACATION_SIGNAL.test(previous)
  );
}

export function auxiliaryEvidenceQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  if (!AUXILIARY_SIGNAL.test(text)) return [];
  const queries: string[] = [];

  if (CONTRACT_SIGNAL.test(text) && !APPOINTMENT_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.AUXILIARY_HIRING);
  }
  if (SALARY_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.AUXILIARY_SALARY);
  }
  if (MEDICAL_LEAVE_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.AUXILIARY_MEDICAL_LEAVE);
  }
  if (APPOINTMENT_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.AUXILIARY_APPOINTMENT);
  }
  if (REASSIGNMENT_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.AUXILIARY_REASSIGNMENT);
  }
  if (VACATION_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.AUXILIARY_VACATION);
  }
  if (EXCHANGE_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.AUXILIARY_EXCHANGE);
  }
  return [...new Set(queries)].slice(0, 4);
}

/**
 * Evita que una coincidencia de palabras laborales de contratación docente o
 * de otro cargo se presente como norma del auxiliar. Para nombramiento, la
 * fuente debe nombrar el concurso o procedimiento de nombramiento; la
 * experiencia de una contratación no es prueba de nombramiento automático.
 */
export function isAuxiliarySourceCompatible(
  question: string,
  source: Pick<
    RetrievedChunk,
    'chunkContent' | 'documentTitle' | 'moduleAssociations'
  >,
): boolean {
  const requested = normalizeSpanishText(question);
  if (!AUXILIARY_SIGNAL.test(requested)) return true;
  const evidence = textOf(source);
  // «auxiliares» aislado puede aludir a otro cargo o a una mención incidental
  // en una contratación docente. Para desplazar una ruta se exige el cargo
  // completo en la evidencia, aunque el usuario lo haya abreviado.
  if (!AUXILIARY_EDUCATION_SIGNAL.test(evidence)) {
    // En nombramiento, «auxiliar» abreviado sigue siendo una intención de
    // alto riesgo de mezcla: no se acepta experiencia de contratación sin el
    // cargo completo y el concurso correspondiente.
    // Tanto «auxiliar» como «auxiliares» son formas cotidianas del cargo. Una
    // fuente que no lo identifica completo puede tratar otro puesto y no es
    // evidencia suficiente para cambiar o sostener esta ruta.
    return false;
  }
  if (APPOINTMENT_SIGNAL.test(requested)) {
    return /\b(?:concurso|procedimiento)\s+(?:publico\s+)?de\s+nombramiento\b|\bnombramiento\s+por\s+concurso\b/u.test(
      evidence,
    );
  }
  if (REASSIGNMENT_SIGNAL.test(requested))
    return /\breasignacion\b/u.test(evidence);
  if (EXCHANGE_SIGNAL.test(requested)) return /\bpermuta\b/u.test(evidence);
  if (VACATION_SIGNAL.test(requested)) return /\bvacacion/u.test(evidence);
  if (MEDICAL_LEAVE_SIGNAL.test(requested)) {
    return /\b(?:licencia\s+por\s+incapacidad\s+temporal|descanso\s+medico|citt)\b/u.test(
      evidence,
    );
  }
  if (SALARY_SIGNAL.test(requested)) {
    // Una referencia incidental a remuneraciones en un FAQ de nombramiento no
    // acredita un sueldo. Si el catálogo identifica ese proceso, se excluye
    // antes de ordenar los resultados.
    const appointmentAssociation = source.moduleAssociations?.some((item) =>
      /nombramiento/iu.test(item.submoduleName ?? ''),
    );
    return !appointmentAssociation && hasAuxiliarySalaryRule(evidence);
  }
  return true;
}

/** Fuente que responde directamente al concepto solicitado por un auxiliar. */
export function isDirectAuxiliaryEvidence(
  question: string,
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): boolean {
  if (
    !isAuxiliaryQuestion(question) ||
    !isAuxiliarySourceCompatible(question, source)
  )
    return false;
  const requested = normalizeSpanishText(question);
  const evidence = textOf(source);
  if (!AUXILIARY_EDUCATION_SIGNAL.test(evidence)) return false;
  if (CONTRACT_SIGNAL.test(requested) && !APPOINTMENT_SIGNAL.test(requested))
    return (
      /\bcontratacion\b/u.test(evidence) &&
      /\brequisito|documento|expediente\b/u.test(evidence)
    );
  if (APPOINTMENT_SIGNAL.test(requested))
    return /\bnombramiento\b/u.test(evidence);
  if (REASSIGNMENT_SIGNAL.test(requested))
    return /\breasignacion\b/u.test(evidence);
  if (EXCHANGE_SIGNAL.test(requested)) return /\bpermuta\b/u.test(evidence);
  if (VACATION_SIGNAL.test(requested)) return /\bvacacion/u.test(evidence);
  if (MEDICAL_LEAVE_SIGNAL.test(requested))
    return /\blicencia\b/u.test(evidence);
  return SALARY_SIGNAL.test(requested) && hasAuxiliarySalaryRule(evidence);
}
