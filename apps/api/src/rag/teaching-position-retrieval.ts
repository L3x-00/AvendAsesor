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
 * escribe con «qu»; `ces(?:e|es|en|an|aron|ado)` porque «cesan» y «cesen» no
 * son «cese»; `asciend` porque «asciendo» no es «asciende». «Contratado» es la
 * condición del consultante, no el proceso de contratación, y por eso queda
 * fuera de la guarda; «encargado» sí pertenece a la encargatura y se excluye
 * salvo que la consulta pida la definición del tema.
 */
const COMPETING_PROCESS =
  /\b(?:desta(?:c|qu)\p{L}*|encarg\p{L}*|reasign\p{L}*|permut\p{L}*|racionaliz\p{L}*|contratacion|contratos?|contrat(?:ar|aron|an|arme)|ascens\p{L}*|ascend\p{L}*|asciend\p{L}*|licencias?|descanso medico|ces(?:e|es|en|an|aron|ado)|jubil\p{L}*)\b/u;

/**
 * La consulta pide qué es o en qué se diferencia el tema. El verbo tiene que
 * regir al término: «qué significa que durante el destaque mantenga mi plaza»
 * no pregunta por la plaza, pregunta por el destaque. Por eso el término debe
 * aparecer a continuación del verbo, no en cualquier lugar de la frase.
 */
const DEFINITION_REQUEST =
  /\b(?:que (?:es|son|significa|significan)|en que consiste|concepto de|definicion de|diferencias? (?:entre|de))[^.]{0,20}\bplazas?\b|\bplazas?\b[^.]{0,20}\b(?:que (?:es|son|significa)|en que consiste)/u;

function evidenceText(
  source: Pick<RetrievedChunk, 'chunkContent' | 'documentTitle'> & {
    sectionTitle?: string | null;
  },
): string {
  // La sección forma parte del fragmento: un cuadro de distribución de horas
  // puede estar bajo el título «Distribución de horas» sin repetirlo en cada
  // párrafo.
  return normalizeSpanishText(
    `${source.documentTitle} ${source.sectionTitle ?? ''} ${source.chunkContent}`,
  );
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
/**
 * La distribución tiene que regir a las horas: «la carga horaria se distribuye»
 * sí; «la jornada comprende treinta horas y se distribuye en horas pedagógicas»
 * no. Aprobar o elaborar una jornada no es distribuirla, así que esos verbos no
 * cuentan. El término puede estar en el título, la sección o el cuerpo; el marco
 * tiene que seguirlo.
 */
const HOURS_ASSIGNMENT_FRAME =
  /\b(?:carga horaria|carga academica|horas pedagogicas|distribucion de horas)\b[^.;]{0,60}\b(?:se asigna|se asignan|se distribuye|se distribuyen|se determinan?)\b/u;
/** El módulo regula plazas y horas de la carrera docente, no del personal administrativo. */
const TEACHING_SCOPE =
  /\b(?:docentes?|profesor(?:a|es)?|maestr[oa]s?|horas? de clase|pedagogic\p{L}*|institucion(?:es)? educativas?|aulas?|seccion(?:es)?|inicial|primaria|secundaria)\b/u;
/** El aspecto de la plaza: uno de sus tres estados. */
const PLACE_CONDITION_TERM =
  /\bplazas?\s+(?:organicas?|eventual(?:es)?|excedent(?:e|es))\b|\b(?:organicas?|eventual(?:es)?)\s+plazas?\b|\bplazas?\s+se\s+clasifican?\s+en\b/u;
/**
 * Denominación con la que el corpus nombra cada aspecto. Es la única fuente de
 * la señal léxica del tema: la usan la compuerta del módulo y las tablas que
 * reconocen el proceso en el título y en la procedencia de la consulta, de modo
 * que no puedan divergir. No sustituye la compuerta: «plaza orgánica» en la
 * sección de una norma de destaque satisface esta señal y no el tema.
 */
export const POSITION_ASPECT_DENOMINATION: Record<PositionAspect, RegExp> = {
  hours: HOURS_PROCESS_DENOMINATION,
  condition: PLACE_CONDITION_TERM,
  classifier: CLASSIFIER_SIGNAL,
};

/**
 * Una norma regula la condición de la plaza cuando clasifica las dos formas
 * —orgánica y eventual— o cuando define el término. Una mención suelta de
 * «plaza orgánica» aparece en el destaque, la encargatura y la reasignación sin
 * regular el tema; una mención de «plazas excedentes» pertenece a la
 * racionalización, que tiene su propia intención.
 */
const PLACE_CONDITION_PAIR =
  /\bplazas?\s+organicas?[\s\S]{0,200}\bplazas?\s+eventual(?:es)?\b|\bplazas?\s+eventual(?:es)?[\s\S]{0,200}\bplazas?\s+organicas?\b/u;
/**
 * La definición tiene que regir al término. «Se considera que mantiene su
 * vínculo laboral» no define la plaza; «se considera plaza excedente aquella
 * que…» sí. Por eso el verbo va pegado al término (o a «plaza»), no suelto en
 * el fragmento.
 */
const PLACE_TERM_DEFINITION =
  /\bplazas?\s+(?:organicas?|eventual(?:es)?|excedent(?:e|es))\s*(?:,|:)?\s*(?:es|son|se consideran?|se entiende|se denominan?|se define|se crean?|tiene[n]? (?:la )?condicion de|corresponde[n]? a)\b|\bse\s+(?:entiende|denomina|define|considera)\s+(?:por\s+|como\s+)?(?:una\s+|la\s+)?plazas?\b|\bplazas?\s+(?:organicas?|eventual(?:es)?)\s*:|\bdenominad[oa]s?\s+plazas?\b|\bplazas?\s+se\s+clasifican?\s+en\b/u;
/**
 * El clasificador se describe por lo que contiene, no por aparecer en una
 * lista: «cuenta con el PEI, el MOF y el clasificador de cargos» no explica el
 * clasificador.
 */
const CLASSIFIER_EVIDENCE =
  /\b(?:clasificador|clasificacion)\s+de\s+cargos?\b[\s\S]{0,300}\b(?:describe|describen|contiene|contienen|niveles?|requisitos?|grupos? ocupacionales?|funciones|ordena|ordenan|agrupa|agrupan|enumera|enumeran|define|definen)\b|\b(?:describe|describen|contiene|contienen|niveles?|requisitos?|grupos? ocupacionales?|funciones|ordena|ordenan|agrupa|agrupan|enumera|enumeran|define|definen)\b[\s\S]{0,300}\b(?:clasificador|clasificacion)\s+de\s+cargos?\b/u;

/** El fragmento trata las horas del colegio, no una jornada cualquiera. */
function isHoursDistributionEvidence(evidence: string): boolean {
  if (HOURS_PROCESS_DENOMINATION.test(evidence)) return true;
  if (!HOURS_SHORT_TERM.test(evidence)) return false;
  return HOURS_ASSIGNMENT_FRAME.test(evidence) && TEACHING_SCOPE.test(evidence);
}

/** El fragmento trata la condición de la plaza, no solo la menciona. */
function isPlaceConditionEvidence(evidence: string): boolean {
  if (!PLACE_CONDITION_TERM.test(evidence)) return false;
  return (
    PLACE_CONDITION_PAIR.test(evidence) || PLACE_TERM_DEFINITION.test(evidence)
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

/** El encabezado nombra el objeto del tema sin calificarlo. */
const OBJECT_HEADING = /\b(?:plazas?(?: docentes?)?|carga horaria)\b/u;

/**
 * Un módulo que nombra otro proceso. Si el catálogo asocia la norma a uno de
 * ellos, el encabezado no puede reclamarla para este tema: la sección «De la
 * plaza orgánica» de la encargatura define el término para explicar la
 * encargatura, no para regular los cargos y las plazas. Cuando el catálogo no
 * contradice —está vacío o la norma vive en «Ley y reglamento»— el encabezado
 * sigue siendo la identidad disponible.
 *
 * Los nombres corresponden a los módulos raíz del catálogo real
 * (`supabase/migrations/20260903110000_admin_module_permissions_and_evaluation_structure.sql`,
 * líneas 214-220): «Auxiliar de educación» en singular y «Situaciones
 * administrativas», que agrupa licencias, cese, jubilación y asistencia. Un
 * módulo nuevo que nombre otro proceso debe añadirse aquí: el fallo por omisión
 * es responder de más, no de menos.
 */
const COMPETING_MODULE =
  /\b(?:contratacion|desplazamientos?|remuneracion(?:es)?|licencias?|situaciones administrativas|evaluacion|auxiliar(?:es)?|destaque|encargatura|reasignacion|racionalizacion|ascensos?|ceses?|jubilacion|asistencia|permutas?|monitoreo)\b/u;

/**
 * Los tres aspectos del módulo, nombrados por su intención. La ruta heredada no
 * tiene la pregunta a mano: el proceso del hilo ya dice qué aspecto se consulta,
 * y la compuerta se aplica igual sobre el fragmento.
 */
export type PositionAspect = 'hours' | 'condition' | 'classifier';

/**
 * La titularidad del aspecto en el propio documento también identifica la
 * fuente: una norma titulada «Normas sobre plazas orgánicas y eventuales»
 * regula el tema aunque el catálogo la asocie a otro módulo (por ejemplo, «Ley
 * y reglamento»). No basta un término suelto en el encabezado: una sección
 * «De la plaza orgánica» aparece en las normas de encargatura y de
 * reasignación. Por eso el encabezado tiene que nombrar el aspecto con la
 * fuerza con que lo nombra el cuerpo, o nombrar el objeto y estar acompañado de
 * la definición en el texto —y el catálogo no puede atribuir la norma a otro
 * proceso—.
 */
function namesAspectInHeading(
  aspect: PositionAspect,
  source: PositionEvidenceSource,
  evidence: string,
): boolean {
  const declared = source.moduleNames ?? [];
  // `some`, no `every`: una norma catalogada en «Remuneraciones» **y** en «Ley y
  // reglamento» sigue perteneciendo a otro proceso. La guarda solo se consulta
  // cuando la fuente no está asociada a «Cargos y plazas».
  if (
    declared.length &&
    declared.some((name) => COMPETING_MODULE.test(normalizeSpanishText(name)))
  ) {
    return false;
  }
  const heading = normalizeSpanishText(
    `${source.documentTitle} ${source.sectionTitle ?? ''}`,
  );
  if (aspect === 'hours') {
    if (HOURS_PROCESS_DENOMINATION.test(heading)) return true;
    // Una sección «Distribución de horas» de una norma que efectivamente
    // distribuye las horas del colegio en el cuerpo.
    return (
      /\bdistribucion de horas\b/u.test(heading) &&
      HOURS_ASSIGNMENT_FRAME.test(evidence) &&
      TEACHING_SCOPE.test(evidence)
    );
  }
  if (aspect === 'condition') {
    return (
      PLACE_CONDITION_PAIR.test(heading) ||
      /\bplazas?\s+(?:organicas?|eventual(?:es)?)\s*:/u.test(heading) ||
      (OBJECT_HEADING.test(heading) && PLACE_TERM_DEFINITION.test(evidence))
    );
  }
  return CLASSIFIER_SIGNAL.test(heading) || CLASSIFICATION_SIGNAL.test(heading);
}

function treatsAspect(evidence: string, aspect: PositionAspect): boolean {
  if (aspect === 'hours') return isHoursDistributionEvidence(evidence);
  if (aspect === 'condition') return isPlaceConditionEvidence(evidence);
  return CLASSIFIER_EVIDENCE.test(evidence);
}

/**
 * Fuente que trata el aspecto del módulo, sin depender de la pregunta: se usa
 * cuando el proceso ya viene del hilo. Exige lo mismo que la ruta directa —tratar
 * el aspecto y pertenecer al módulo o identificarse por el encabezado—, porque la
 * mención suelta de «plaza orgánica» en una norma de destaque no es evidencia del
 * tema ni siquiera en un seguimiento.
 */
export function treatsPositionAspect(
  source: PositionEvidenceSource,
  aspect: PositionAspect,
): boolean {
  const evidence = evidenceText(source);
  if (!treatsAspect(evidence, aspect)) return false;
  return (
    belongsToPositionModule(source) ||
    namesAspectInHeading(aspect, source, evidence)
  );
}

/**
 * El cuerpo regula el aspecto. Se evalúa sin el encabezado y sin el catálogo, y
 * es la comprobación que impide que una norma del tema pase por otro trámite: en
 * un hilo de destaque, un fragmento puede titularse «Plaza orgánica y plaza
 * eventual» sin regular la plaza (es la sección donde vive el plazo), pero si el
 * cuerpo clasifica las plazas, el fragmento trata este tema y no el del hilo.
 */
export function regulatesPositionAspect(
  chunkContent: string,
  aspect: PositionAspect,
): boolean {
  return treatsAspect(normalizeSpanishText(chunkContent), aspect);
}

function aspectsInQuestion(question: string): PositionAspect[] {
  const aspects: PositionAspect[] = [];
  if (isHoursDistributionQuestion(question)) aspects.push('hours');
  if (isPositionConditionQuestion(question)) aspects.push('condition');
  if (isPositionClassifierQuestion(question)) aspects.push('classifier');
  return aspects;
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
  const aspects = aspectsInQuestion(question);
  return aspects.some((aspect) => treatsPositionAspect(source, aspect));
}
