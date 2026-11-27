import { INTENT_EXPANSIONS, INTENT_TRIGGERS } from './intent-routing.config';
import type { RetrievedChunk } from './retrieval.gateway';
import { medicalRequestConcernsAnotherTopic } from './medical-leave-applicability';
import { normalizeSpanishText } from './text-normalization';

/**
 * Expansiones semánticas para situaciones administrativas expresadas en
 * lenguaje cotidiano. Las consultas no agregan reglas ni requisitos: solo
 * emplean los nombres técnicos del propio corpus para recuperar la fuente que
 * deberá respaldar la respuesta.
 */
const MEDICAL_LEAVE_SIGNAL = INTENT_TRIGGERS.MEDICAL_LEAVE_SIGNAL;
/**
 * Un descanso prescrito por un profesional de la salud es una licencia por
 * incapacidad temporal aunque la persona no use el término técnico. Se exige
 * una señal médica (profesional o reposo) junto con una duración o un
 * certificado; un descanso vacacional no entra aquí.
 */
const PRESCRIBED_REST_SIGNAL = INTENT_TRIGGERS.PRESCRIBED_REST_SIGNAL;
const PERSONAL_ABSENCE_SIGNAL = INTENT_TRIGGERS.PERSONAL_ABSENCE_SIGNAL;
const VACATION_SIGNAL = INTENT_TRIGGERS.ADMINISTRATIVE_VACATION_SIGNAL;
const EMPLOYMENT_STATUS_SIGNAL = INTENT_TRIGGERS.EMPLOYMENT_STATUS_SIGNAL;
const ESCALAFON_SIGNAL = INTENT_TRIGGERS.ESCALAFON_SIGNAL;
const TARDINESS_SIGNAL = INTENT_TRIGGERS.TARDINESS_SIGNAL;
const DISCIPLINARY_PROCESS_SIGNAL = INTENT_TRIGGERS.DISCIPLINARY_PROCESS_SIGNAL;
const DISCIPLINARY_SUBJECT_SIGNAL = INTENT_TRIGGERS.DISCIPLINARY_SUBJECT_SIGNAL;
const DISCIPLINARY_CONTEXT_SIGNAL = INTENT_TRIGGERS.DISCIPLINARY_CONTEXT_SIGNAL;
const WORKDAY_SIGNAL = INTENT_TRIGGERS.WORKDAY_SIGNAL;
const SCHOOL_LEVEL_SIGNAL = INTENT_TRIGGERS.SCHOOL_LEVEL_SIGNAL;

/**
 * Término del contrato docente. La persona lo describe con verbos de la vida
 * real («me botan», «me sacan», «no me renuevan») y la norma lo nombra
 * «conclusión del contrato» o «término del vínculo laboral».
 *
 * El módulo de contratación no tiene un `TopicIntent` propio, así que la
 * traducción se registra aquí, con las demás situaciones administrativas del
 * vínculo. La señal exige la palabra «contrato»: «me botan de mi plaza» sin más
 * puede ser un cese, un destaque o una reasignación, y esos trámites ya tienen su
 * propio camino. Las reglas no agregan hechos ni relajan el umbral.
 */
const CONTRACT_WORD = INTENT_TRIGGERS.CONTRACT_WORD;
/**
 * Un contrato que no es el vínculo docente: arrendamiento, suministros o empleo
 * en una empresa privada. La pregunta no pertenece al corpus, así que no se
 * traduce a la norma del profesorado.
 */
const NON_EDUCATION_CONTRACT = INTENT_TRIGGERS.NON_EDUCATION_CONTRACT;
const CONTRACT_EXIT_FROM_POSITION = INTENT_TRIGGERS.CONTRACT_EXIT_FROM_POSITION;
const CONTRACT_TERMINATION_EVENT = INTENT_TRIGGERS.CONTRACT_TERMINATION_EVENT;
/** El despido se nombra directamente, con el clítico pospuesto o antepuesto. */
const CONTRACT_DISMISSAL = INTENT_TRIGGERS.CONTRACT_DISMISSAL;

/**
 * Consulta canónica: usa la denominación con la que el corpus regula el final
 * del contrato. Solo se habilita por la señal anterior.
 */
const CONTRACT_TERMINATION_QUERY = INTENT_EXPANSIONS.CONTRACT_TERMINATION;

/**
 * El fragmento regula el término del contrato, no solo lo menciona: la norma de
 * renovación enumera condiciones para continuar y no responde cuándo termina.
 */
const CONTRACT_TERMINATION_EVIDENCE =
  /\b(?:conclusion|termino|terminacion|culminacion|extincion)\s+(?:de(?:l)?\s+)?(?:contrato|vinculo(?:\s+laboral)?|relacion\s+laboral)\b|\bcausales?\s+de\s+(?:conclusion|termino|terminacion|culminacion)\b|\bno\s+renovacion\s+(?:de(?:l)?\s+)?contrato\b/u;

type AdministrativeEvidenceSource = Pick<
  RetrievedChunk,
  'chunkContent' | 'documentTitle'
> & {
  moduleNames?: readonly string[];
  moduleAssociations?: readonly {
    rootModuleName?: string | null;
    submoduleName?: string | null;
  }[];
};

/**
 * El régimen se nombra «auxiliar» o su abreviatura del catálogo («aux»), como
 * en el título «Faq contratatcion aux educacion 2026».
 */
const AUXILIARY_REGIME_SIGNAL = INTENT_TRIGGERS.AUXILIARY_REGIME_SIGNAL;

/** La pregunta se declara del régimen de auxiliares de educación. */
const AUXILIARY_REGIME_IN_QUESTION =
  INTENT_TRIGGERS.AUXILIARY_REGIME_IN_QUESTION;

/**
 * El régimen del vínculo manda: la norma de auxiliares de educación también
 * enumera «causales de conclusión del contrato». Una pregunta de docente no se
 * responde con esa norma, y una del auxiliar conserva la suya. El catálogo es la
 * identidad disponible; si no informa módulos, se usa el título de la norma.
 */
function belongsToAuxiliaryRegime(
  source: Pick<
    AdministrativeEvidenceSource,
    'documentTitle' | 'moduleNames' | 'moduleAssociations'
  >,
): boolean {
  const declared = [
    ...(source.moduleNames ?? []),
    ...(source.moduleAssociations ?? []).flatMap((association) => [
      association.rootModuleName ?? '',
      association.submoduleName ?? '',
    ]),
  ];
  if (
    declared.some((name) =>
      AUXILIARY_REGIME_SIGNAL.test(normalizeSpanishText(name)),
    )
  ) {
    return true;
  }
  return AUXILIARY_REGIME_SIGNAL.test(
    normalizeSpanishText(source.documentTitle),
  );
}

function hasContractTerminationSignal(text: string): boolean {
  if (!CONTRACT_WORD.test(text)) return false;
  if (NON_EDUCATION_CONTRACT.test(text)) return false;
  return (
    CONTRACT_EXIT_FROM_POSITION.test(text) ||
    CONTRACT_TERMINATION_EVENT.test(text) ||
    CONTRACT_DISMISSAL.test(text)
  );
}

/**
 * Una pregunta sobre el término del contrato se respalda solo con la norma de su
 * régimen. Se descarta únicamente el fragmento que regula la conclusión del
 * contrato del otro régimen; el resto de la ruta documental no cambia.
 */
export function isForeignContractRegimeSource(
  question: string,
  source: AdministrativeEvidenceSource,
): boolean {
  const requested = normalizeSpanishText(question);
  if (!hasContractTerminationSignal(requested)) return false;
  if (!CONTRACT_TERMINATION_EVIDENCE.test(evidenceText(source))) return false;
  return (
    belongsToAuxiliaryRegime(source) !==
    AUXILIARY_REGIME_IN_QUESTION.test(requested)
  );
}

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

function hasMedicalLeaveSignal(text: string): boolean {
  return (
    (MEDICAL_LEAVE_SIGNAL.test(text) ||
      (PRESCRIBED_REST_SIGNAL.test(text) && !VACATION_SIGNAL.test(text))) &&
    !medicalRequestConcernsAnotherTopic(text)
  );
}

/** La consulta pide una licencia por enfermedad o incapacidad temporal. */
export function isMedicalLeaveQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  // Para identificar la intención se exige la figura (descanso, reposo,
  // incapacidad, licencia o CITT). «Mi hijo está enfermo, ¿puedo faltar?» es
  // una consulta de ausencia y no convierte el turno en una incapacidad propia.
  return (
    (/\b(?:descanso\s+medic(?:o|a)|incapacidad\s+temporal|citt|licencia\s+por\s+enfermedad|reposo\s+medic(?:o|a))\b/u.test(
      text,
    ) ||
      (PRESCRIBED_REST_SIGNAL.test(text) && !VACATION_SIGNAL.test(text))) &&
    !medicalRequestConcernsAnotherTopic(text)
  );
}

/** La consulta trata un procedimiento administrativo disciplinario. */
export function isDisciplinaryQuestion(question: string): boolean {
  return hasDisciplinarySignal(normalizeSpanishText(question));
}

function hasDisciplinarySignal(text: string): boolean {
  // «Remover una plaza / alumnos» no es disciplinario: es racionalización o
  // gestión de plazas. El mismo guard se aplica en hasTopicTerm.
  const withoutPlaceRemoval = text.replace(
    /\b(?:remov(?:er|ido|ida|idos|idas|ieron)|remuev(?:en|e))\s+(?:una?|la|el|las|los|esta|ese|al\s+)?\s*(?:plaza|alumno|estudiante|matricula)\b|\bremocion\s+de\s+(?:plazas?|alumnos?|estudiantes?|matricula)\b/gu,
    ' ',
  );
  return (
    DISCIPLINARY_PROCESS_SIGNAL.test(withoutPlaceRemoval) ||
    (DISCIPLINARY_SUBJECT_SIGNAL.test(withoutPlaceRemoval) &&
      DISCIPLINARY_CONTEXT_SIGNAL.test(withoutPlaceRemoval))
  );
}

export function administrativeEvidenceQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  const queries: string[] = [];

  if (hasMedicalLeaveSignal(text)) {
    // The medical signal establishes the topic, not the affected person's role.
    // In particular P15 and questions about third parties must not gain a
    // teacher-only search expansion. Existing role-specific queries stay separate.
    queries.push(INTENT_EXPANSIONS.ADMIN_MEDICAL_LEAVE);
  }

  if (PERSONAL_ABSENCE_SIGNAL.test(text)) {
    queries.push(
      INTENT_EXPANSIONS.PERSONAL_ABSENCE_HOURS,
      INTENT_EXPANSIONS.PERSONAL_ABSENCE_LICENSE,
    );
  }

  if (VACATION_SIGNAL.test(text) && EMPLOYMENT_STATUS_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.ADMIN_VACATION);
  }

  if (TARDINESS_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.TARDINESS);
  }

  if (hasDisciplinarySignal(text)) {
    queries.push(INTENT_EXPANSIONS.ADMIN_DISCIPLINARY);
  }

  if (hasContractTerminationSignal(text)) {
    queries.push(CONTRACT_TERMINATION_QUERY);
  }

  if (WORKDAY_SIGNAL.test(text) && SCHOOL_LEVEL_SIGNAL.test(text)) {
    queries.push(INTENT_EXPANSIONS.ADMIN_WORKDAY);
  }

  return [...new Set(queries)].slice(0, 4);
}

/**
 * Una fuente directa se reserva antes de completar el cupo con resultados que
 * solo comparten vocabulario laboral. Así una licencia por incapacidad no se
 * reemplaza por una licencia para acompañar a una persona con discapacidad ni
 * una sanción por una referencia incidental a "proceso".
 */
export function isDirectAdministrativeEvidence(
  question: string,
  source: AdministrativeEvidenceSource,
): boolean {
  const requested = normalizeSpanishText(question);
  const evidence = evidenceText(source);

  if (hasMedicalLeaveSignal(requested)) {
    return /\blicencia\s+por\s+incapacidad\s+temporal\b|\bdescanso\s+medico\b|\bcitt\b/u.test(
      evidence,
    );
  }
  if (PERSONAL_ABSENCE_SIGNAL.test(requested)) {
    return /\b(?:licencia|permiso)\s+por\s+motivos\s+particulares\b/u.test(
      evidence,
    );
  }
  if (
    VACATION_SIGNAL.test(requested) &&
    EMPLOYMENT_STATUS_SIGNAL.test(requested)
  ) {
    return (
      /\bvacaciones?\b/u.test(evidence) &&
      /\b(?:carrera\s+publica\s+magisterial|profesor(?:es)?\s+nombrad)/u.test(
        evidence,
      )
    );
  }
  if (ESCALAFON_SIGNAL.test(requested)) {
    return /\binforme\s+escalafonario\b/u.test(evidence);
  }
  if (TARDINESS_SIGNAL.test(requested)) {
    return (
      /\btardanza(?:s)?\b/u.test(evidence) &&
      /\b(?:descuento|factor|inasistencia|asistencia)\b/u.test(evidence)
    );
  }
  if (hasDisciplinarySignal(requested)) {
    return (
      /\b(?:proceso\s+administrativo\s+disciplinario|\bpad\b)\b/u.test(
        evidence,
      ) && /\b(?:defensa|descargos?|notificaci[oó]n)\b/u.test(evidence)
    );
  }
  if (WORKDAY_SIGNAL.test(requested) && SCHOOL_LEVEL_SIGNAL.test(requested)) {
    return (
      /\bjornada\s+de\s+trabajo\b/u.test(evidence) &&
      /\bhoras\s+pedagogicas\b/u.test(evidence)
    );
  }
  if (hasContractTerminationSignal(requested)) {
    // Una sola definición de régimen: la misma que filtra la admisión común del
    // servicio. La norma de auxiliares usa la misma denominación y solo respalda
    // una pregunta del mismo régimen.
    return (
      CONTRACT_TERMINATION_EVIDENCE.test(evidence) &&
      !isForeignContractRegimeSource(question, source)
    );
  }
  return false;
}
