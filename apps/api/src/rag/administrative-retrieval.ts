import type { RetrievedChunk } from './retrieval.gateway';
import { medicalRequestConcernsAnotherTopic } from './medical-leave-applicability';
import { normalizeSpanishText } from './text-normalization';

/**
 * Expansiones semánticas para situaciones administrativas expresadas en
 * lenguaje cotidiano. Las consultas no agregan reglas ni requisitos: solo
 * emplean los nombres técnicos del propio corpus para recuperar la fuente que
 * deberá respaldar la respuesta.
 */
const MEDICAL_LEAVE_SIGNAL =
  /\b(?:descanso\s+medic(?:o|a)|incapacidad\s+temporal|enferm(?:o|a|edad).{0,64}\b(?:dia|dias|faltar|ausen|licencia)|(?:dia|dias|faltar|ausen).{0,64}\benferm(?:o|a|edad))\b/u;
/**
 * Un descanso prescrito por un profesional de la salud es una licencia por
 * incapacidad temporal aunque la persona no use el término técnico. Se exige
 * una señal médica (profesional o reposo) junto con una duración o un
 * certificado; un descanso vacacional no entra aquí.
 */
const PRESCRIBED_REST_SIGNAL =
  /\b(?:doctor(?:a)?|medic(?:o|a)|profesional de la salud)\b.{0,80}\b(?:descanso|reposo|incapacidad)\b|\b(?:descanso|reposo)\b.{0,40}\b(?:por|de)\s+\d{1,3}\s+(?:dias?|semanas?)\b/u;
const PERSONAL_ABSENCE_SIGNAL =
  /\b(?:motivos?|asuntos?)\s+particulares?\b|\bfaltar.{0,48}\b(?:dia|dias)\b/u;
const VACATION_SIGNAL = /\bvacacion(?:es)?\b/u;
const EMPLOYMENT_STATUS_SIGNAL = /\b(?:nombrad[oa]s?|contratad[oa]s?)\b/u;
const ESCALAFON_SIGNAL = /\b(?:escalafon(?:ario)?|informe\s+escalafonario)\b/u;
const TARDINESS_SIGNAL =
  /\b(?:tardanz(?:a|as)|lleg(?:ar|ue|o)\s+tarde|retras(?:o|os))\b/u;
const DISCIPLINARY_PROCESS_SIGNAL =
  /\b(?:procedimiento\s+(?:administrativo\s+)?disciplinario|proceso\s+(?:administrativo\s+)?disciplinario|pad)\b/u;
const DISCIPLINARY_SUBJECT_SIGNAL =
  /\b(?:sancion(?:es|ad[oa]s?)?|sancionar|defen[sd](?:a|er(?:se)?)|descargos?|destitu(?:i|y)\p{L}*|destitucion)\b/u;
const DISCIPLINARY_CONTEXT_SIGNAL =
  /\b(?:docent(?:e|es)?|profesor(?:a|es|as)?|derecho|notificaci[oó]n|procedimiento)\b/u;
const WORKDAY_SIGNAL =
  /\b(?:jornada|horas?|carga\s+horaria|horas?\s+de\s+clase|pedagogic[ao]s?|complementarias?)\b/u;
const SCHOOL_LEVEL_SIGNAL =
  /\b(?:secundaria|inicial|primaria|eb[rae]|cetpro)\b/u;

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
const CONTRACT_WORD = /\bcontratos?\b/u;
/**
 * Un contrato que no es el vínculo docente: arrendamiento, suministros o empleo
 * en una empresa privada. La pregunta no pertenece al corpus, así que no se
 * traduce a la norma del profesorado.
 */
const NON_EDUCATION_CONTRACT =
  /\bcontratos?\s+(?:de|del)\s+(?:alquiler|arrendamiento|locacion|luz|agua|gas|telefono|internet|cable|tarjeta|credito|prestamo|compraventa|obra|seguro|alimentos?|matrimonio|franquicia)\b|\b(?:empresa|compania|negocio)\s+(?:privad[ao]s?|particular)\b(?!\s+(?:\p{L}+\s+){0,3}(?:educativ|de educacion|del sector educativo))|\ben\s+(?:la|una)\s+empresa\b(?!\s+(?:\p{L}+\s+){0,3}(?:educativ|de educacion|del sector educativo))/u;
const CONTRACT_EXIT_FROM_POSITION =
  /\b(?:bot|sac|saqu|separ|retir|ech|quit)(?:ar|an|aron|ara|aran|en|e|o|a)(?:me|te|se|nos|los|las|lo|la|le)?\s+(?:de|del)\s+(?:mi|tu|su|sus|nuestros?|nuestras?|el|la|los|las|un|una)?\s*(?:plaza|contrato|cargo|puesto|trabajo)\b/u;
const CONTRACT_TERMINATION_EVENT =
  /\b(?:termin|acab|venc)(?:a|an|o|e|en|io|ara|aran)\b[\s\S]{0,30}\b(?:mi|el|tu|su)\s+contrato\b|\b(?:mi|el|tu|su)\s+contrato\s+(?:vence|termina|acaba|concluye|finaliza)\b(?!\s+de\s+\p{L}{2,}(?:ar|er|ir)(?:se|me|te|lo|la|le|nos|los|las)?\b)|\bno\s+(?:me\s+)?(?:renuev(?:an|en|a)|contratan|contrataron)\b[\s\S]{0,20}\bcontrato\b|\b(?:dan|da|dieron|dio)\s+de\s+baja\s+(?:de(?:l)?\s+)?(?:mi\s+|su\s+)?contrato\b|\b(?:mi|el|su)\s+contrato\s+(?:es|va)\s+hasta\b/u;
/** El despido se nombra directamente, con el clítico pospuesto o antepuesto. */
const CONTRACT_DISMISSAL =
  /\b(?:desped(?:ir(?:me|te|se|nos|los|las|lo|la|le)?|ido|ida|e|en|o)|despid(?:e|en|an|o|ieron|a|as))\b/u;

/**
 * Consulta canónica: usa la denominación con la que el corpus regula el final
 * del contrato. Solo se habilita por la señal anterior.
 */
const CONTRACT_TERMINATION_QUERY =
  'conclusión del contrato docente causales de conclusión del contrato término del contrato no renovación del contrato';

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
const AUXILIARY_REGIME_SIGNAL = /\bauxiliar(?:es)?\b|\baux\b/u;

/** La pregunta se declara del régimen de auxiliares de educación. */
const AUXILIARY_REGIME_IN_QUESTION = /\bauxiliar(?:es)?\b|\baux\b/u;

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
  return (
    DISCIPLINARY_PROCESS_SIGNAL.test(text) ||
    (DISCIPLINARY_SUBJECT_SIGNAL.test(text) &&
      DISCIPLINARY_CONTEXT_SIGNAL.test(text))
  );
}

export function administrativeEvidenceQueries(question: string): string[] {
  const text = normalizeSpanishText(question);
  const queries: string[] = [];

  if (hasMedicalLeaveSignal(text)) {
    // The medical signal establishes the topic, not the affected person's role.
    // In particular P15 and questions about third parties must not gain a
    // teacher-only search expansion. Existing role-specific queries stay separate.
    queries.push(
      'licencia por incapacidad temporal descanso médico CITT certificado médico',
    );
  }

  if (PERSONAL_ABSENCE_SIGNAL.test(text)) {
    queries.push(
      'permiso por motivos particulares profesor nombrado ausencia por horas requisitos',
      'licencia por motivos particulares profesor nombrado requisitos solicitud',
    );
  }

  if (VACATION_SIGNAL.test(text) && EMPLOYMENT_STATUS_SIGNAL.test(text)) {
    queries.push(
      'vacaciones profesores nombrados contratados Carrera Pública Magisterial',
    );
  }

  if (TARDINESS_SIGNAL.test(text)) {
    queries.push(
      'tardanza descuento asistencia tercera tardanza factor minuto jornada laboral profesor',
    );
  }

  if (hasDisciplinarySignal(text)) {
    queries.push(
      'proceso administrativo disciplinario docente derecho de defensa descargos notificación',
    );
  }

  if (hasContractTerminationSignal(text)) {
    queries.push(CONTRACT_TERMINATION_QUERY);
  }

  if (WORKDAY_SIGNAL.test(text) && SCHOOL_LEVEL_SIGNAL.test(text)) {
    queries.push(
      'jornada de trabajo profesor secundaria horas pedagógicas horas lectivas',
    );
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
