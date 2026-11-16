import type { RetrievedChunk } from './retrieval.gateway';
import { salaryQuestionProfile } from './salary-applicability';
import { normalizeSpanishText } from './text-normalization';

/**
 * Cargos y plazas: el cuadro de distribución de horas, la condición de la plaza
 * (orgánica, eventual o excedente) y el clasificador de cargos.
 *
 * La intención se reconoce por la combinación de conceptos, nunca por una
 * palabra aislada: «plaza», «horas» o «cargo» por separado pertenecen a muchos
 * trámites —contratación, reasignación, jornada, encargatura—. Las consultas
 * canónicas traducen el léxico coloquial a la denominación del corpus; no
 * afirman requisitos, montos ni plazos.
 */

const PLACE_SIGNAL = /\bplazas?\b/u;
const HOURS_SIGNAL = /\bhoras?\b/u;
/** Jornada extraordinaria: es un pago, no la distribución de horas del colegio. */
const OVERTIME_SIGNAL = /\bhoras?\s+extras?\b/u;
const HOURS_DISTRIBUTION =
  /\b(?:cuadro de distribucion de horas|distribucion de horas|carga horaria|horas pedagogicas|carga academica)\b/u;
/**
 * La asignación de la carga horaria se reconoce por su propio vocabulario
 * («me asignan», «me tocan», «se reparten») o por la decisión explícita
 * («quién decide/determina/asigna»). Un «quién» suelto pertenece a la
 * asistencia («quién me autoriza a faltar»), no a este módulo.
 */
const HOUR_ASSIGNMENT =
  /\b(?:asignacion(?:es)?|asignan|asigna|distribuyen|distribuye|reparten|reparte|tocan|toca|determina|determinan|dicto|dicta|dictan)\b/u;
const HOUR_DECISION =
  /\bquien\s+(?:decide|deciden|determina|determinan|asigna|asignan|reparte|reparten|define|definen|controla|controlan|elabora|elaboran|organiza|organizan)\b/u;
const SURPLUS_SIGNAL = /\bexcedent(?:e|es)\b/u;
/**
 * La condición de la plaza se nombra con el adjetivo junto al sustantivo:
 * «plaza orgánica», «plaza eventual», «mi plaza es eventual».
 */
const QUALIFIED_PLACE =
  /\bplazas?\b[\s\S]{0,20}?\b(?:organicas?|eventual(?:es)?)\b|\b(?:organicas?|eventual(?:es)?)\s+plazas?\b/u;
const CLASSIFIER_SIGNAL = /\bclasificador(?:es)?\s+de\s+cargos?\b/u;
const CLASSIFICATION_SIGNAL = /\bclasificacion\s+de\s+cargos?\b/u;

/**
 * Un proceso que la consulta ya nombró manda sobre la condición de la plaza: en
 * «durante el destaque conservo mi plaza orgánica» el tema es el destaque. Sin
 * esta guarda la intención se apropiaría de la pregunta y, con la compuerta de
 * evidencia, la respuesta pasaría de sustentada a «sin evidencia».
 *
 * Las raíces cubren la conjugación real: `desta(?:c|qu)` porque «destaque» se
 * escribe con «qu»; `ces(?:e|es|an|aron|ado)` porque «cesan» no es «cese»;
 * `asciend` porque «asciendo» no es «asciende». «Contratado» es la condición
 * del consultante, no el proceso de contratación, y por eso queda fuera de la
 * guarda; «encargado» sí pertenece a la encargatura y se excluye salvo que la
 * consulta pida la definición del tema.
 */
const COMPETING_PROCESS =
  /\b(?:desta(?:c|qu)\p{L}*|encarg\p{L}*|reasign\p{L}*|permut\p{L}*|racionaliz\p{L}*|contratacion|contratos?|contrat(?:ar|aron|an|arme)|ascens\p{L}*|ascend\p{L}*|asciend\p{L}*|licencias?|descanso medico|ces(?:e|es|an|aron|ado)|jubil\p{L}*)\b/u;

/**
 * La consulta pide qué es o en qué se diferencia el tema. Cuando la persona
 * menciona otro proceso como circunstancia («la diferencia … porque me van a
 * encargar»), la pregunta sigue siendo del tema; cuando lo menciona como el
 * hecho que la motiva («durante el destaque conservo mi plaza»), manda el
 * proceso nombrado.
 */
const DEFINITION_REQUEST =
  /\b(?:diferencias?|que es|que son|que significa|que significan|en que consiste|se diferencia|se diferencian|concepto de|definicion)\b/u;

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'>,
): string {
  return normalizeSpanishText(`${source.documentTitle} ${source.chunkContent}`);
}

/**
 * La consulta pide el cuadro de distribución de horas o quién decide la carga
 * horaria del colegio. Se descarta la jornada extraordinaria, que se consulta
 * por su pago.
 */
export function isHoursDistributionQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (OVERTIME_SIGNAL.test(text)) return false;
  if (COMPETING_PROCESS.test(text)) return false;
  if (HOURS_DISTRIBUTION.test(text)) return true;
  return (
    HOURS_SIGNAL.test(text) &&
    (HOUR_ASSIGNMENT.test(text) || HOUR_DECISION.test(text))
  );
}

/**
 * La consulta trata la condición de una plaza: orgánica, eventual o excedente,
 * también cuando la persona la describe por su efecto («dicen que mi plaza está
 * excedente»). Una plaza vacante pertenece a la contratación y no entra aquí.
 */
export function isPositionConditionQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  const namesPosition =
    QUALIFIED_PLACE.test(text) ||
    (PLACE_SIGNAL.test(text) && SURPLUS_SIGNAL.test(text));
  if (!namesPosition) return false;
  if (!COMPETING_PROCESS.test(text)) return true;
  return DEFINITION_REQUEST.test(text);
}

/** La consulta pide el clasificador de cargos de la institución educativa. */
export function isPositionClassifierQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (COMPETING_PROCESS.test(text)) return false;
  return CLASSIFIER_SIGNAL.test(text) || CLASSIFICATION_SIGNAL.test(text);
}

function hasPositionQuestion(question: string): boolean {
  return (
    isHoursDistributionQuestion(question) ||
    isPositionConditionQuestion(question) ||
    isPositionClassifierQuestion(question)
  );
}

/**
 * Consultas canónicas con la denominación que usa el corpus para cada aspecto
 * del módulo. Solo se habilitan por señal inequívoca y se ejecutan en el mismo
 * alcance y módulo que la consulta original. Una consulta de cifra conserva su
 * camino salarial: la carga horaria es un factor del monto, no el tema.
 */
export function teachingPositionEvidenceQueries(question: string): string[] {
  if (salaryQuestionProfile(question).isSalaryQuestion) return [];
  const queries: string[] = [];
  if (isHoursDistributionQuestion(question)) {
    queries.push(
      'cuadro de distribución de horas de clase jornada laboral docente institución educativa',
      'asignación de horas pedagógicas carga horaria docente nivel inicial primaria secundaria',
    );
  }
  if (isPositionConditionQuestion(question)) {
    queries.push(
      'plaza orgánica plaza eventual docente nombramiento cuadro de plazas',
      'plazas excedentes reducción de plazas reubicación del personal docente',
    );
  }
  if (isPositionClassifierQuestion(question)) {
    queries.push(
      'clasificador de cargos niveles de cargo manual de organización y funciones institución educativa',
    );
  }
  return queries;
}

/** Denominación completa del proceso: identifica el aspecto por sí misma. */
const HOURS_PROCESS_DENOMINATION =
  /\b(?:cuadro de distribucion de horas|distribucion de horas (?:de clase|docente|pedagogica))\b/u;
/** Términos que, sin contexto, también aparecen en otros trámites. */
const HOURS_SHORT_TERM =
  /\b(?:carga horaria|carga academica|horas pedagogicas|distribucion de horas)\b/u;
const HOURS_ASSIGNMENT_FRAME =
  /\b(?:se asigna|se asignan|se distribuye|se distribuyen|se elabora|se elaboran|se aprueba|se aprueban|se determina|se determinan|comprende|comprenden|corresponde|corresponden)\b/u;
/** El módulo regula plazas y horas de la carrera docente, no del personal administrativo. */
const TEACHING_SCOPE =
  /\b(?:docentes?|profesor(?:a|es)?|maestr[oa]s?|horas? de clase|pedagogic\p{L}*|institucion(?:es)? educativas?|aulas?|seccion(?:es)?|inicial|primaria|secundaria)\b/u;
/** El aspecto de la plaza: uno de sus tres estados. */
const PLACE_CONDITION_TERM =
  /\bplazas?\s+(?:organicas?|eventual(?:es)?|excedent(?:e|es))\b|\b(?:organicas?|eventual(?:es)?)\s+plazas?\b/u;
/**
 * Una norma regula la condición de la plaza cuando clasifica las dos formas
 * —orgánica y eventual— o cuando define el término. Una mención suelta de
 * «plaza orgánica» aparece en el destaque, la encargatura y la reasignación sin
 * regular el tema; una mención de «plazas excedentes» pertenece a la
 * racionalización, que tiene su propia intención.
 */
const PLACE_CONDITION_PAIR =
  /\bplazas?\s+organicas?[\s\S]{0,200}\bplazas?\s+eventual(?:es)?\b|\bplazas?\s+eventual(?:es)?[\s\S]{0,200}\bplazas?\s+organicas?\b/u;
const PLACE_DEFINITION_FRAME =
  /\b(?:se entiende|se entienden|se define|se definen|se denominan?|se consideran?|se clasifican?|definicion|denominad[oa]s?|es aquel(?:la|los|las)?|son aquell[oa]s|se crean? por|corresponde[n]? a|tiene[n]? (?:la )?condicion de)\b|\bplazas?\s+(?:organicas?|eventual(?:es)?)\s*:/u;
/** El clasificador se describe por lo que contiene, no por aparecer en una lista. */
const CLASSIFIER_EVIDENCE =
  /\b(?:clasificador|clasificacion)\s+de\s+cargos?\b[\s\S]{0,240}\b(?:describe|describen|contiene|contienen|niveles?|requisitos?|grupos? ocupacionales?|funciones)\b|\b(?:describe|describen|contiene|contienen|niveles?|requisitos?|grupos? ocupacionales?)\b[\s\S]{0,240}\b(?:clasificador|clasificacion)\s+de\s+cargos?\b/u;

/** El fragmento trata las horas del colegio, no una jornada cualquiera. */
function isHoursDistributionEvidence(evidence: string): boolean {
  if (HOURS_PROCESS_DENOMINATION.test(evidence)) return true;
  return (
    HOURS_SHORT_TERM.test(evidence) &&
    HOURS_ASSIGNMENT_FRAME.test(evidence) &&
    TEACHING_SCOPE.test(evidence)
  );
}

/** El fragmento trata la condición de la plaza, no solo la menciona. */
function isPlaceConditionEvidence(evidence: string): boolean {
  if (!PLACE_CONDITION_TERM.test(evidence)) return false;
  return (
    PLACE_CONDITION_PAIR.test(evidence) || PLACE_DEFINITION_FRAME.test(evidence)
  );
}

/** Módulo del catálogo que administra los cargos y las plazas. */
const POSITION_MODULE_NAME = /\bcargos? y plazas\b/u;

type PositionEvidenceSource = Pick<
  RetrievedChunk,
  'chunkContent' | 'documentTitle'
> & {
  moduleNames?: readonly string[];
  sectionTitle?: string | null;
};

/**
 * La fuente pertenece al módulo del tema. El catálogo es el que decide qué
 * norma administra los cargos y las plazas; una mención de «plaza orgánica» en
 * una norma de destaque, encargatura o contratación no convierte esa norma en
 * la del tema. Si el fragmento no informa sus módulos, se usa su título, que es
 * la única identidad documental disponible.
 */
function belongsToPositionModule(source: PositionEvidenceSource): boolean {
  // `filter(Boolean)` protege de una asociación vacía que llegue de la base sin
  // que el tipo lo declare; el título es entonces la identidad disponible.
  const names = (
    source.moduleNames?.length ? source.moduleNames : [source.documentTitle]
  ).filter(Boolean);
  return names.some((name) =>
    POSITION_MODULE_NAME.test(normalizeSpanishText(name)),
  );
}

/**
 * La titularidad del aspecto en el propio documento también identifica la
 * fuente: una norma titulada «Normas sobre plazas orgánicas y eventuales»
 * regula el tema aunque el catálogo la asocie a otro módulo (por ejemplo, «Ley
 * y reglamento»). Sin esto, la compuerta dependería solo de la catalogación.
 */
function namesAspectInHeading(
  question: string,
  source: PositionEvidenceSource,
): boolean {
  const heading = normalizeSpanishText(
    `${source.documentTitle} ${source.sectionTitle ?? ''}`,
  );
  if (isHoursDistributionQuestion(question)) {
    return (
      HOURS_PROCESS_DENOMINATION.test(heading) ||
      /\b(?:carga horaria|horas pedagogicas|carga academica)\b/u.test(heading)
    );
  }
  if (isPositionConditionQuestion(question)) {
    return (
      PLACE_CONDITION_PAIR.test(heading) ||
      /\bplazas?\s+(?:organicas?|eventual(?:es)?|excedent(?:e|es))\b/u.test(
        heading,
      )
    );
  }
  return (
    isPositionClassifierQuestion(question) &&
    /\b(?:clasificador|clasificacion)\s+de\s+cargos?\b/u.test(heading)
  );
}

/**
 * Fuente que trata el aspecto consultado del módulo, no una mención incidental
 * de «plaza», «horas» o «cargo» dentro de otro procedimiento. Es deliberadamente
 * conservadora: ante la duda devuelve `false` y el turno informa la ausencia de
 * evidencia en vez de responder con una norma que regula otra cosa.
 */
export function isDirectTeachingPositionEvidence(
  question: string,
  source: PositionEvidenceSource,
): boolean {
  if (!hasPositionQuestion(question)) return false;
  const evidence = evidenceText(source);
  const aspect =
    (isHoursDistributionQuestion(question) &&
      isHoursDistributionEvidence(evidence)) ||
    (isPositionConditionQuestion(question) &&
      isPlaceConditionEvidence(evidence)) ||
    (isPositionClassifierQuestion(question) &&
      CLASSIFIER_EVIDENCE.test(evidence));
  if (!aspect) return false;
  return (
    belongsToPositionModule(source) || namesAspectInHeading(question, source)
  );
}
