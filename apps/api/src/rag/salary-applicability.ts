import { CITATION_GROUP, citedIndexes } from './citations';
import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Aplicabilidad salarial. Una cifra solo es aplicable cuando la evidencia
 * corresponde al mismo concepto y a la misma combinación de factores que la
 * consulta (jornada, vínculo, cargo, escala, período) y cuando se trata de la
 * remuneración y no de una asignación especial. Estas funciones no codifican
 * montos ni tablas jurídicas: comparan lo que la propia consulta y la propia
 * evidencia dicen.
 */

export type SalaryFactor =
  'cargo' | 'condicion' | 'escala' | 'jornada' | 'periodo';

/** Orden de consulta: primero el dato que más cambia la cifra. */
const FACTOR_ORDER: readonly SalaryFactor[] = [
  'jornada',
  'condicion',
  'cargo',
  'escala',
  'periodo',
];

/** Importes con separador de miles o decimales; no confunde un artículo. */
const AMOUNT_PATTERN =
  /s\/\.?\s*\d[\d .,]*|\b\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?\b|\b\d+[.,]\d{2}\b/u;
/** El mismo patrón con recorrido global, para extraer todas las cifras. */
const AMOUNT_PATTERN_ALL = new RegExp(AMOUNT_PATTERN.source, 'gu');
/** Cláusulas de una respuesta con varios importes; no corta «3 300,60». */
const SALARY_CLAUSE_SPLIT = /,(?!\d)|\s+(?:y|e|pero|mientras|aunque)\s+|[;]/u;

const SALARY_TERMS =
  /\b(?:remuneracion(?:es)?|sueldos?|salarios?|haber(?:es)?|retribucion(?:es)?|pagos?|paga|pagan|paguen|cobro|cobrar|cobra|gana|ganan|ganaria|percibe|perciben|ingresos?|asignacion(?:es)?|bonificacion(?:es)?|gratificacion(?:es)?|aguinaldos?|escolaridad|subsidios?)\b/u;
/** «Ganar un concurso» no pregunta un importe; «cuánto debería ganar» sí. */
const SALARY_AMOUNT_QUESTION =
  /\bcuanto(?:\s+(?:deberia|debo|podria|puedo|voy\s+a))?\s+(?:ganar|gano)\b/u;

/** La finalidad de una norma de pagos no pide un importe de esa norma. */
const DOCUMENT_PURPOSE_REQUEST =
  /\b(?:(?:(?:cual es|explica(?:me)?|dime|indicame|(?:necesito|quiero) (?:saber|conocer)) (?:la finalidad|el (?:objetivo|objeto|proposito))|cuales son los objetivos) (?:del|de la|de este|de esta) |para que sirve (?:el|la|este|esta) )(?:instructivo|documento|norma|resolucion|directiva|reglamento|rsg)\b/u;
function isDocumentPurposeClause(clause: string): boolean {
  const purposeIndex = clause.search(DOCUMENT_PURPOSE_REQUEST);
  // Se admite cortesía antes del pedido, pero no otro concepto salarial.
  return purposeIndex >= 0 && !SALARY_TERMS.test(clause.slice(0, purposeIndex));
}

/** Coordinación nominal: elaboración, aprobación y difusión; registro y control. */
const DOCUMENT_NOMINAL_COORDINATION =
  /\b([a-z]+(?:cion|sion|miento)|registro|control)(?:,\s*|\s+y\s+)(?=([a-z]+(?:cion|sion|miento)|registro|control)\b)/gu;

/**
 * Un importe o una pregunta cuantitativa nunca se excluyen como finalidad
 * documental, ni siquiera cuando aparecen en la misma cláusula.
 */
const SALARY_VALUE_REQUEST =
  /\b(?:cuant[oa]s?|montos?|importes?|cifras?|calcul[a-z]*|gan(?:a[a-z]*|o)|cobr[a-z]*|percib[a-z]*|paga[a-z]*|paguen)\b/u;

/**
 * Solo se excluye la cláusula de finalidad. Las demás conservan sus señales
 * salariales aunque no usen un verbo de cobro («y el sueldo que recibe...»).
 * Estas coordinaciones nominales del título no son un segundo pedido.
 */
function salaryRequestText(text: string): string {
  if (
    !DOCUMENT_PURPOSE_REQUEST.test(text) ||
    SALARY_VALUE_REQUEST.test(text) ||
    AMOUNT_PATTERN.test(text)
  ) {
    return text;
  }
  return text
    .replace(
      DOCUMENT_NOMINAL_COORDINATION,
      (match: string, head: string, next: string) =>
        SALARY_TERMS.test(next) ? match : `${head} `,
    )
    .split(
      /(?<!\bn|\bnro)\.(?![°º]|\d)|[!?;:,¿¡]+|\b(?:y|e|o|u|ni|pero|ademas|tambien|asi como)\b/u,
    )
    .filter((clause) => !isDocumentPurposeClause(clause))
    .join(' ');
}

const SPECIAL_ALLOCATION_TERMS =
  /\b(?:asignacion(?:es)?|bonificacion(?:es)?|gratificacion(?:es)?|aguinaldos?|escolaridad|subsidios?|sepelio|bono(?:s)?|compensacion(?:es)?)\b/u;

const GENERAL_REMUNERATION_TERMS =
  /\b(?:remuneracion(?:es)?|sueldos?|salarios?|haberes|escala remunerativa)\b/u;

const SPECIAL_ALLOCATION_REQUEST =
  /\b(?:asignacion(?:es)?|bonificacion(?:es)?|gratificacion(?:es)?|aguinaldo(?:s)?|escolaridad|subsidio(?:s)?|sepelio|bono(?:s)?|cts|compensacion(?:es)?)\b/u;

const CONDITION_PATTERNS: ReadonlyArray<{
  condition: string;
  pattern: RegExp;
}> = [
  { condition: 'nombrado', pattern: /\bnombrad[oa]s?\b/u },
  { condition: 'contratado', pattern: /\bcontratad[oa]s?\b/u },
];

const ROLE_PATTERNS: ReadonlyArray<{ role: string; pattern: RegExp }> = [
  { role: 'auxiliar de educación', pattern: /\bauxiliar(?:es)?\b/u },
  {
    role: 'directivo',
    // «directiva(s)» es el tipo de norma («la presente Directiva», «las
    // Directivas aprobadas»), no un cargo; el cargo directivo se reconoce en
    // masculino singular y plural.
    pattern: /\b(?:director|directora|directores|directoras|directivos?)\b/u,
  },
  {
    role: 'docente',
    pattern: /\b(?:docente(?:s)?|profesor(?:a|as|es)?|maestr[oa]s?)\b/u,
  },
];

const HOURS_PATTERN = /\b(\d{1,2})\)?\s*(?:h|horas)\b/u;
const HOURS_PATTERN_ALL = new RegExp(HOURS_PATTERN.source, 'gu');
const SCALE_PATTERN_ALL =
  /\bescala\s*:?\s*(?:(?:magisterial|remunerativa)\s*:?\s*)?(\d{1,2}|[ivx]{1,4})\b/gu;

/**
 * Un plazo no es una jornada: «dentro de las 24 horas», «el plazo de 48 horas»
 * o «hasta 30 horas antes» describen un tiempo de trámite, no la jornada
 * laboral. Solo se descarta la lectura de horas cuando el plazo la precede.
 */
const DEADLINE_BEFORE_HOURS =
  /\b(?:antes de|dentro de|desde|despues de|en el plazo de|en menos de|hasta|no mas de|plazo de|vence en)\s+(?:el |la |los |las |un |una )?$/u;

/**
 * Contexto de jornada: la cifra de horas describe el puesto y no un trámite. Se
 * exige a un lado de la cifra —«jornada de 30 horas», «jornada laboral del
 * docente es de 30 horas», «30 horas semanales», «30 horas de trabajo»— porque
 * descartar solo el plazo que precede a la cifra dejaría pasar «el plazo es de
 * 48 horas» como si fuera una jornada.
 */
const JORNADA_TERMS =
  /\b(?:jornada(?:es)?|carga\s+horaria|horas?\s+(?:semanales?|diarias?|cronologicas?|lectivas?|pedagogicas?|de\s+(?:trabajo|jornada|docencia|clase|clases|dictado|servicio|labor)))/u;
const JORNADA_TERMS_ALL = new RegExp(JORNADA_TERMS.source, 'gu');

/** Entre la jornada y su cifra no puede haber un plazo ni cambiar de oración. */
const DEADLINE_TERMS_IN_WINDOW =
  /\b(?:plazo|antes de|dentro de|vence|vencimiento|en menos de|a mas tardar|no mas de|hasta|despues de)\b/u;

/** Un trámite antes de la cifra la convierte en su plazo, no en la jornada. */
const PROCESS_TERMS_BEFORE_HOURS =
  /\b(?:plazo|tramite|acreditacion|subsanacion|vencimiento|recurso)\b/u;

/** Un tiempo relativo no es una jornada: «30 horas antes del cierre». */
const RELATIVE_TIME_AFTER_HOURS =
  /^\s*(?:antes de|antes del|despues de|despues del|siguientes?|posteriores?)\b/u;

const JORNADA_WINDOW_MAX_WORDS = 10;

const JORNADA_BEFORE_HOURS = /\b(?:contratad[oa]s?|nombrad[oa]s?)\s+por\s*$/u;
/** «Para 30 horas», «con 40 horas»: la preposición introduce la jornada. */
const JORNADA_PREPOSITION_BEFORE_HOURS = /\b(?:para|con|en|de)\s*$/iu;

const JORNADA_AFTER_HOURS =
  /^\s*(?:semanales?|diarias?|cronologicas?|lectivas?|pedagogicas?|de\s+(?:trabajo|jornada|docencia|clase|clases|dictado|servicio|labor)|a\s+la\s+semana|al\s+dia|por\s+semana)\b/u;

function hoursIn(text: string): number[] {
  for (const match of text.matchAll(HOURS_PATTERN_ALL)) {
    const hours = Number(match[1]);
    if (!Number.isInteger(hours) || hours <= 0 || hours > 60) continue;
    const before = text.slice(0, match.index);
    if (DEADLINE_BEFORE_HOURS.test(before)) continue;
    return [hours];
  }
  return [];
}

/**
 * La jornada nombrada antes de la cifra explica ese número: «jornada de 30
 * horas», «la jornada laboral del docente es de 30 horas», «jornada máxima de
 * 30 horas». Entre la palabra y la cifra solo pueden ir unas pocas palabras
 * —ninguna de plazo— y ninguna frontera de oración; la jornada no puede ser
 * además el complemento de un trámite («el plazo para la acreditación de la
 * jornada es de 30 horas»).
 */
function jornadaBeforeHours(clause: string): boolean {
  const matches = [...clause.matchAll(JORNADA_TERMS_ALL)];
  const last = matches[matches.length - 1];
  if (!last) return false;
  const tail = clause.slice((last.index ?? 0) + last[0].length);
  if (/[.!?\n]/u.test(tail)) return false;
  if (DEADLINE_TERMS_IN_WINDOW.test(tail)) return false;
  if (PROCESS_TERMS_BEFORE_HOURS.test(clause)) return false;
  return (
    tail.trim().split(/\s+/u).filter(Boolean).length <= JORNADA_WINDOW_MAX_WORDS
  );
}

/** Oración a la que pertenece la cifra: no se cruza el punto. */
function sentenceBefore(text: string, index: number): string {
  const boundary = Math.max(
    text.lastIndexOf('.', index - 1),
    text.lastIndexOf('!', index - 1),
    text.lastIndexOf('?', index - 1),
    text.lastIndexOf('\n', index - 1),
  );
  return text.slice(boundary + 1, index);
}

/**
 * Horas de la evidencia que sí son jornada. En la consulta basta con que la
 * persona diga «de 30 horas»; el documento, en cambio, habla de plazos con la
 * misma forma («dentro de las 24 horas», «el plazo es de 48 horas», «se atiende
 * en 12 horas», «30 horas antes del cierre»), así que solo se reconoce la cifra
 * cuando el propio texto la presenta como jornada.
 */
function evidenceJornadaHoursIn(text: string): number[] {
  const hours: number[] = [];
  for (const match of text.matchAll(HOURS_PATTERN_ALL)) {
    const value = Number(match[1]);
    if (!Number.isInteger(value) || value <= 0 || value > 60) continue;
    if (hours.includes(value)) continue;
    const start = match.index ?? 0;
    const after = text.slice(start + match[0].length);
    if (RELATIVE_TIME_AFTER_HOURS.test(after)) continue;
    const clause = sentenceBefore(text, start);
    if (
      JORNADA_BEFORE_HOURS.test(clause) ||
      JORNADA_AFTER_HOURS.test(after) ||
      jornadaBeforeHours(clause) ||
      (!PROCESS_TERMS_BEFORE_HOURS.test(clause) &&
        JORNADA_PREPOSITION_BEFORE_HOURS.test(clause))
    ) {
      hours.push(value);
    }
  }
  return hours;
}

function conditionsIn(text: string): string[] {
  return CONDITION_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ condition }) => condition,
  );
}

function rolesIn(text: string): string[] {
  return ROLE_PATTERNS.filter(({ pattern }) => pattern.test(text)).map(
    ({ role }) => role,
  );
}

const ROMAN_SCALES: ReadonlyMap<string, string> = new Map([
  ['i', '1'],
  ['ii', '2'],
  ['iii', '3'],
  ['iv', '4'],
  ['v', '5'],
  ['vi', '6'],
  ['vii', '7'],
  ['viii', '8'],
  ['ix', '9'],
  ['x', '10'],
]);

/** Todas las escalas nombradas; «escala III» y «escala 3» son la misma. */
function scalesIn(text: string): string[] {
  return sortedUnique(
    [...text.matchAll(SCALE_PATTERN_ALL)].map(
      (match) => ROMAN_SCALES.get(match[1]) ?? match[1],
    ),
  );
}

/**
 * Año explícito. No cuenta el año que forma parte del número de una norma
 * («049-2025-EF») ni el que ancla un inicio o un fin («desde 2015», «a partir
 * del 1 de enero de 2024»): ninguno declara el período que se consulta.
 */
const YEAR_PATTERN =
  /(?<!\d\s*-\s*)(?<!s\/\.?\s*)\b(?:19|20)\d{2}\b(?![.,]\d)(?!\s*-\s*\d)/gu;
/**
 * Año de una fecha («20 de marzo de 2025», «1.° de marzo del 2025»): en la
 * evidencia es la fecha de emisión o de publicación, no el período de la cifra.
 * En la consulta, en cambio, «al 31 de diciembre de 2024» sí fija el período.
 */
const MONTHS =
  'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const CALENDAR_DATE_BEFORE_YEAR = new RegExp(
  `\\b\\d{1,2}\\s*[°º.]*\\s+de\\s+(?:${MONTHS})\\s+del?\\s*$`,
  'u',
);
/** «al 31 de diciembre de 2024»: una fecha que sí fija el período consultado. */
const POINT_IN_TIME_DATE_BEFORE_YEAR = new RegExp(
  `\\b(?:al|vigente al|a la fecha del?)\\s+\\d{1,2}\\s*[°º.]*\\s+de\\s+(?:${MONTHS})\\s+del?\\s*$`,
  'u',
);
const RANGE_ANCHOR_BEFORE_YEAR =
  /\b(?:desde|hasta|partir de|partir del)\b(?:\s+[^\s.!?]+){0,6}\s*$/u;

/**
 * Años explícitos de un texto. En la evidencia ninguna fecha calendario cuenta.
 * En la consulta solo la cuenta la que fija un punto en el tiempo («al 31 de
 * diciembre de 2024»): «ingresé el 15 de marzo de 2015» es un hecho personal.
 */
function yearsIn(
  text: string,
  source: 'evidence' | 'question' = 'question',
): number[] {
  const years: number[] = [];
  for (const match of text.matchAll(YEAR_PATTERN)) {
    const before = text.slice(0, match.index);
    if (RANGE_ANCHOR_BEFORE_YEAR.test(before)) continue;
    if (CALENDAR_DATE_BEFORE_YEAR.test(before)) {
      const fixesPeriod =
        source === 'question' && POINT_IN_TIME_DATE_BEFORE_YEAR.test(before);
      if (!fixesPeriod) continue;
    }
    years.push(Number(match[0]));
  }
  return years;
}

function sortedUnique(values: readonly (number | string)[]): string[] {
  return [...new Set(values.map(String))].sort((left, right) =>
    left.localeCompare(right, 'es', { numeric: true }),
  );
}

export function hasAmount(text: string): boolean {
  return AMOUNT_PATTERN.test(normalizeSpanishText(text));
}

/**
 * Prioridad de entrega de una fuente para una consulta salarial: la
 * remuneración general vigente va primero, después el material que no es una
 * cifra y al final los conceptos adicionales (salvo que la persona los haya
 * pedido expresamente). Así una asignación especial nunca encabeza la
 * respuesta como si fuera el sueldo.
 */
export function salaryApplicabilityTier(
  question: string,
  source: RetrievedChunk,
): number {
  const profile = salaryQuestionProfile(question);
  if (!profile.isSalaryQuestion) return 0;
  if (salarySourceConflictsWithProfile(profile, source)) return 3;
  if (profile.asksSpecialAllocation) {
    if (isSpecialAllocationSource(source)) return 0;
    if (isGeneralRemunerationSource(source)) return 1;
    return 2;
  }
  if (isGeneralRemunerationSource(source)) return 0;
  if (isSpecialAllocationSource(source)) {
    return 2;
  }
  return 1;
}

/** Norma que presenta la remuneración general (sueldo, escala, haberes). */
export function isGeneralRemunerationSource(source: RetrievedChunk): boolean {
  return (
    hasAmount(source.chunkContent) &&
    GENERAL_REMUNERATION_TERMS.test(normalizeSpanishText(source.chunkContent))
  );
}

/**
 * Fuente que solo trata un concepto adicional (asignación, bonificación,
 * gratificación, aguinaldo, CTS…). Presentarla como la remuneración general
 * sería un error de aplicabilidad.
 */
export function isSpecialAllocationSource(source: RetrievedChunk): boolean {
  const text = normalizeSpanishText(source.chunkContent);
  return (
    hasAmount(source.chunkContent) &&
    SPECIAL_ALLOCATION_TERMS.test(text) &&
    !GENERAL_REMUNERATION_TERMS.test(text)
  );
}

export interface SalaryQuestionProfile {
  asksSpecialAllocation: boolean;
  condition: string | null;
  isSalaryQuestion: boolean;
  jornadaHours: number | null;
  role: string | null;
  scale: string | null;
  year: number | null;
}

const EMPTY_SALARY_PROFILE: SalaryQuestionProfile = {
  asksSpecialAllocation: false,
  condition: null,
  isSalaryQuestion: false,
  jornadaHours: null,
  role: null,
  scale: null,
  year: null,
};

/**
 * Suma un turno al perfil acumulado de la conversación. Lo que el turno declara
 * manda. Jornada, vínculo y escala pertenecen a la persona que los declaró: si
 * cambia de cargo («¿y un director?») no se le atribuyen los del anterior, y si
 * cambia de vínculo tampoco su escala. Como se aplica turno a turno, un cambio
 * ocurrido en un turno intermedio también corta lo declarado antes.
 */
function mergeSalaryTurn(
  accumulated: SalaryQuestionProfile,
  turn: SalaryQuestionProfile,
): SalaryQuestionProfile {
  const roleChanged =
    turn.role !== null &&
    accumulated.role !== null &&
    turn.role !== accumulated.role;
  const conditionChanged =
    turn.condition !== null &&
    accumulated.condition !== null &&
    turn.condition !== accumulated.condition;
  return {
    // Un turno que pide un concepto adicional («¿y la compensación por…?») lo
    // fija aunque no use un término salarial; uno que no dice nada lo conserva.
    asksSpecialAllocation:
      turn.isSalaryQuestion || turn.asksSpecialAllocation
        ? turn.asksSpecialAllocation
        : accumulated.asksSpecialAllocation,
    condition: turn.condition ?? (roleChanged ? null : accumulated.condition),
    isSalaryQuestion: accumulated.isSalaryQuestion || turn.isSalaryQuestion,
    jornadaHours:
      turn.jornadaHours ?? (roleChanged ? null : accumulated.jornadaHours),
    role: turn.role ?? accumulated.role,
    scale:
      turn.scale ??
      (roleChanged || conditionChanged ? null : accumulated.scale),
    year: turn.year ?? accumulated.year,
  };
}

/**
 * La respuesta a una aclaración («Sector público», «30 horas») o un seguimiento
 * («¿y para 40 horas?») no repite la consulta salarial. Devuelve la consulta
 * con los factores que declararon los turnos previos y que el turno actual no
 * declara, escritos de forma canónica para que el mismo lector los recupere. Lo
 * que dice el turno actual manda; los turnos previos se suman en orden.
 */
export function withInheritedSalaryFactors(
  question: string,
  priorQuestions: readonly string[],
): string {
  if (!priorQuestions.length) return question;
  const current = salaryQuestionProfile(question);
  // Una finalidad documental explícita no solicita un monto de la persona que
  // habló en turnos anteriores. No se le añaden factores de aquel pedido.
  if (
    !current.isSalaryQuestion &&
    DOCUMENT_PURPOSE_REQUEST.test(normalizeSpanishText(question))
  ) {
    return question;
  }
  const accumulated = [...priorQuestions, question]
    .map((turn) => salaryQuestionProfile(turn))
    .reduce(mergeSalaryTurn, EMPTY_SALARY_PROFILE);
  if (!accumulated.isSalaryQuestion) return question;

  const priorSector = [...priorQuestions]
    .reverse()
    .map(salarySectors)
    .find((sectors) => sectors.length > 0);

  const fragments = [
    !current.isSalaryQuestion ? 'remuneración' : null,
    !current.isSalaryQuestion && accumulated.asksSpecialAllocation
      ? 'asignación'
      : null,
    current.jornadaHours === null && accumulated.jornadaHours !== null
      ? `jornada de ${accumulated.jornadaHours} horas`
      : null,
    current.condition === null ? accumulated.condition : null,
    current.role === null ? accumulated.role : null,
    salarySectors(question).length === 0 && priorSector?.length === 1
      ? `sector ${priorSector[0]}`
      : null,
    current.scale === null && accumulated.scale !== null
      ? `escala ${accumulated.scale}`
      : null,
    current.year === null && accumulated.year !== null
      ? `en ${accumulated.year}`
      : null,
  ].filter((fragment): fragment is string => fragment !== null);

  // Cada fragmento es su propia oración: un «desde» del turno actual no debe
  // anclar el año heredado.
  return fragments.length ? `${question} . ${fragments.join(' . ')}` : question;
}

/** Factores que la propia consulta ya declara. */
export function salaryQuestionProfile(question: string): SalaryQuestionProfile {
  const text = normalizeSpanishText(question);
  const salaryText = salaryRequestText(text);
  return {
    asksSpecialAllocation: SPECIAL_ALLOCATION_REQUEST.test(text),
    condition: conditionsIn(text)[0] ?? null,
    isSalaryQuestion:
      SALARY_TERMS.test(salaryText) || SALARY_AMOUNT_QUESTION.test(salaryText),
    jornadaHours: hoursIn(text)[0] ?? null,
    role: rolesIn(text)[0] ?? null,
    scale: scalesIn(text)[0] ?? null,
    year: yearsIn(text)[0] ?? null,
  };
}

/**
 * La persona pregunta por su propia remuneración, no por la regla general
 * («¿cuánto gano yo?», «mi sueldo», «me corresponde»). En ese caso una
 * precisión puede ser necesaria; en una consulta general sobre cuánto gana un
 * docente, en cambio, bloquear la respuesta para pedir un dato personal
 * oculta información que las fuentes sí sostienen.
 */
const PERSONAL_SALARY_MARKER =
  /\b(?:yo|mi|mis|tengo|me corresponde(?:n)?|mi caso|mi situacion|mi remuneracion|mi sueldo|mi salario)\b/u;
/** «Trabajo como…» es primera persona; «de 30 horas de trabajo» no. */
const PERSONAL_SALARY_JOB = /\b(?:trabajo|laboro)\s+(?:como|en|de|para)\b/u;
/** «Soy nombrado» es una declaración del propio vínculo, no una pregunta general. */
const PERSONAL_SALARY_CONDITION =
  /\bsoy\s+(?:nombrad[oa]|contratad[oa]|auxiliar|director(?:a)?|subdirector(?:a)?)\b/u;
const LEADING_SALARY_FOLLOW_UP = /^(?:y|e|pero|entonces|ademas|tambien)\b/u;

export function isPersonalSalaryQuestion(question: string): boolean {
  if (!salaryQuestionProfile(question).isSalaryQuestion) return false;
  const normalized = normalizeSpanishText(question);
  const raw = question.toLocaleLowerCase('es');
  // «Ganó» es tercera persona; sin la tilde, «gano» es primera persona.
  const firstPersonGano = /\bgano\b/u.test(raw) && !/\bganó\b/u.test(raw);
  return (
    (firstPersonGano && !/\bganaria\b/u.test(normalized)) ||
    PERSONAL_SALARY_MARKER.test(normalized) ||
    PERSONAL_SALARY_JOB.test(normalized) ||
    PERSONAL_SALARY_CONDITION.test(normalized)
  );
}

/**
 * La intención personal puede venir del turno actual («mi sueldo», «soy
 * nombrado») o de la consulta salarial que abrió el hilo. La consulta
 * sintética que hereda factores pierde el «yo», así que la decisión no puede
 * depender solo de esa cadena.
 */
export function hasPersonalSalaryContext(
  question: string,
  priorQuestions: readonly string[],
): boolean {
  if (isPersonalSalaryQuestion(question)) return true;
  const normalized = normalizeSpanishText(question);
  const profile = salaryQuestionProfile(question);
  // Una pregunta salarial general autocontenida («¿cuánto gana un director?»,
  // «¿cuánto se gana en el sector público?») no hereda la intención personal de
  // un turno anterior sobre el propio sueldo.
  const leading = normalized.replace(/^[\s¿¡"'«»(]+/u, '');
  if (
    profile.isSalaryQuestion &&
    !isPersonalSalaryQuestion(question) &&
    !LEADING_SALARY_FOLLOW_UP.test(leading)
  ) {
    return false;
  }
  const hasPriorSalary = priorQuestions.some(
    (prior) => salaryQuestionProfile(prior).isSalaryQuestion,
  );
  // Responder un factor no convierte una consulta general en un caso propio.
  // Una declaración explícita como «soy nombrado» sí lo hace.
  if (hasPriorSalary && PERSONAL_SALARY_CONDITION.test(normalized)) {
    return true;
  }
  return priorQuestions.some((prior) => isPersonalSalaryQuestion(prior));
}

/**
 * Consulta salarial general, en tercera persona: pide el panorama de una
 * categoría («cuánto gana un docente», «remuneración del director») y admite
 * una respuesta con las condiciones que cambian la cifra. No incluye las
 * preguntas por el caso propio, que sí pueden requerir una precisión.
 */
export function isBroadSalaryQuestion(question: string): boolean {
  return (
    salaryQuestionProfile(question).isSalaryQuestion &&
    !isPersonalSalaryQuestion(question)
  );
}

/**
 * Una fuente contradice un factor solo cuando el factor aparece expresamente
 * junto a una cifra comparable. La ausencia del dato no autoriza a inventar
 * incompatibilidad; en cambio, «40 horas» no puede competir por una consulta
 * explícita de «30 horas».
 */
function salarySourceConflictsWithProfile(
  profile: SalaryQuestionProfile,
  source: RetrievedChunk,
): boolean {
  if (!hasAmount(source.chunkContent)) return false;

  return FACTOR_ORDER.some((factor) => {
    const expected = declaredFactorValue(profile, factor);
    if (expected === null) return false;
    const values = factorValuesInSource(source, factor, true);
    return values.length > 0 && !values.includes(String(expected));
  });
}

/**
 * Compatibilidad para el filtro previo al ranking. Así una fuente que expresa
 * una jornada, cargo, vínculo, escala o período distinto no puede desplazar a
 * la aplicable por una similitud semántica más alta.
 */
export function isSalarySourceCompatible(
  question: string,
  source: RetrievedChunk,
): boolean {
  const profile = salaryQuestionProfile(question);
  return (
    !profile.isSalaryQuestion ||
    !salarySourceConflictsWithProfile(profile, source)
  );
}

export interface SalaryEvidenceProfile {
  /** Fuentes vigentes con una cifra comparable (remuneración o concepto). */
  comparable: RetrievedChunk[];
  /** Fuentes vigentes que presentan la remuneración general. */
  general: RetrievedChunk[];
  /** Fuentes vigentes que solo presentan un concepto adicional. */
  special: RetrievedChunk[];
}

function evidenceFactorsIn(text: string): Record<SalaryFactor, string[]> {
  return {
    cargo: rolesIn(text),
    condicion: conditionsIn(text),
    escala: scalesIn(text),
    jornada: evidenceJornadaHoursIn(text).map(String),
    periodo: yearsIn(text, 'evidence').map(String),
  };
}

/** Cifras de un fragmento; sirve para exigir que los montos realmente difieran. */
function amountsIn(text: string): string[] {
  return normalizeSpanishText(text).match(AMOUNT_PATTERN_ALL) ?? [];
}

/**
 * Valor canónico de un importe: «S/ 3 300,60», «S/3300.60» y «S/ 3 300,60,»
 * son la misma cifra. Quita el prefijo y la puntuación final, descarta los
 * separadores de miles y unifica el separador decimal.
 */
export function canonicalAmount(value: string): string {
  const text = value
    .toLocaleLowerCase('es')
    .replace(/^s\/\.?\s*/u, '')
    .replace(/[^\d.,]/gu, '')
    .replace(/[.,]+$/u, '');
  const decimal = /[.,](\d{1,2})$/u.exec(text);
  if (!decimal) return text.replace(/[.,]/gu, '');
  const integer = text.slice(0, decimal.index).replace(/[.,]/gu, '');
  return `${integer}.${decimal[1].padStart(2, '0')}`;
}

export function hasMarkdownTable(text: string): boolean {
  return /^\s*\|.*\|\s*$/mu.test(text);
}

function tableCells(line: string): string[] | null {
  if (!/^\s*\|.*\|\s*$/u.test(line)) return null;
  return line
    .trim()
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim());
}

/**
 * Convierte cada fila de una tabla Markdown en una oración con el encabezado
 * delante: «Jornada: 30 horas; Remuneración: S/ 3 300,60». Así el factor que
 * explica el importe queda en la misma oración que la cifra y la aplicabilidad
 * salarial no depende de que el modelo repita la tabla completa.
 */
export function expandMarkdownTables(text: string): string {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  const expanded: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = tableCells(lines[index] ?? '');
    const separator = tableCells(lines[index + 1] ?? '');
    if (
      !header ||
      !separator ||
      separator.length !== header.length ||
      !separator.every((cell) => /^:?-{3,}:?$/u.test(cell))
    ) {
      expanded.push(lines[index] ?? '');
      continue;
    }
    expanded.push(lines[index] ?? '', lines[index + 1] ?? '');
    index += 2;
    while (index < lines.length) {
      const row = tableCells(lines[index] ?? '');
      if (!row) break;
      const pairs = header
        .map((cell, column) => {
          const value = row[column] ?? '';
          return cell && value ? `${cell}: ${value}` : '';
        })
        .filter(Boolean);
      if (pairs.length) expanded.push(pairs.join('; '));
      index += 1;
    }
    index -= 1;
  }
  return expanded.join('\n');
}

/** Oraciones del fragmento, ya normalizadas para comparar contra los patrones. */
function sentencesIn(text: string): string[] {
  return expandMarkdownTables(text)
    .replace(/\r/gu, '')
    .split(/(?<=[.!?])\s+|\n+/u)
    .map((sentence) => normalizeSpanishText(sentence))
    .filter(Boolean);
}

/**
 * Oraciones del fragmento que contienen una cifra. El factor que explica un
 * monto («jornada de 30 horas») está en la oración del importe: tomarlo de todo
 * el texto presentaría como jornada un plazo ajeno.
 */
function amountSentencesIn(text: string): string[] {
  return sentencesIn(text).filter((sentence) => AMOUNT_PATTERN.test(sentence));
}

/**
 * Valores del factor en un fragmento. Se leen de las oraciones con importe
 * —donde vive el dato que explica la cifra— y, si no aparece allí («Aplica al
 * personal nombrado. La remuneración mensual es de…»), del fragmento completo,
 * cuya lectura de horas exige contexto de jornada para no tomar un plazo.
 */
function factorValuesInSource(
  source: RetrievedChunk,
  factor: SalaryFactor,
  sentenceOnly = false,
): string[] {
  const scoped = amountSentencesIn(source.chunkContent).flatMap(
    (sentence) => evidenceFactorsIn(sentence)[factor],
  );
  if (scoped.length) return sortedUnique(scoped);
  // Excluir una fuente exige que el factor esté en la propia oración del
  // importe: un cargo o un año mencionado en otra oración del fragmento no
  // describe esa cifra.
  if (sentenceOnly) return [];

  return sortedUnique(
    evidenceFactorsIn(
      normalizeSpanishText(expandMarkdownTables(source.chunkContent)),
    )[factor],
  );
}

function factorValuesInSources(
  sources: readonly RetrievedChunk[],
  factor: SalaryFactor,
): string[] {
  return sortedUnique(
    sources.flatMap((source) => factorValuesInSource(source, factor)),
  );
}

/**
 * Perfil de la evidencia vigente: qué cifras hay y de qué tipo. Solo mira
 * documentos vigentes: un antecedente no compite con la regla actual (se
 * recupera únicamente cuando la consulta lo pide).
 */
export function salaryEvidenceProfile(
  sources: RetrievedChunk[],
): SalaryEvidenceProfile {
  const current = sources.filter(
    (source) =>
      source.documentSituation === 'current' && hasAmount(source.chunkContent),
  );
  return {
    comparable: current.filter(
      (source) =>
        isGeneralRemunerationSource(source) ||
        isSpecialAllocationSource(source),
    ),
    general: current.filter(isGeneralRemunerationSource),
    special: current.filter(isSpecialAllocationSource),
  };
}

/**
 * Evidencia de remuneración general aplicable al alcance consultado. En el
 * alcance vigente solo cuenta una fuente vigente; en una consulta histórica o
 * de antecedente archivado, la fuente histórica es la que responde.
 */
export function hasGeneralSalaryEvidence(
  sources: readonly RetrievedChunk[],
  scope: 'archived_explicit' | 'current' | 'historical',
): boolean {
  if (scope === 'current') {
    return salaryEvidenceProfile([...sources]).general.length > 0;
  }
  if (scope === 'historical') {
    return sources.some(
      (source) =>
        source.documentSituation !== 'current' &&
        isGeneralRemunerationSource(source),
    );
  }
  return sources.some(
    (source) =>
      source.documentSituation === 'archived' &&
      isGeneralRemunerationSource(source),
  );
}

/**
 * Evidencia que permite responder un panorama salarial aunque todavía no
 * incluya una cifra: una fuente del alcance consultado que trata la
 * remuneración del cargo o rol preguntado. Sirve para no bloquear la respuesta
 * con una pregunta cuando lo que falta es el monto y no el tema: en ese caso
 * corresponde decir qué regla sí consta y qué dato no está en los documentos.
 * Una fuente que solo presenta un concepto adicional (CTS, bonificación) no
 * habilita el panorama general.
 */
export function hasSalaryPanoramaEvidence(
  sources: readonly RetrievedChunk[],
  scope: 'archived_explicit' | 'current' | 'historical',
  question?: string,
): boolean {
  const profile = question ? salaryQuestionProfile(question) : null;
  return sources.some((source) => {
    const inScope =
      scope === 'current'
        ? source.documentSituation === 'current'
        : scope === 'historical'
          ? source.documentSituation !== 'current'
          : source.documentSituation === 'archived';
    if (!inScope) return false;
    const text = normalizeSpanishText(source.chunkContent);
    // Un concepto adicional (CTS, bonificación, asignación) no habilita por sí
    // solo el panorama de la remuneración general, tenga o no un monto.
    if (
      SPECIAL_ALLOCATION_TERMS.test(text) &&
      !GENERAL_REMUNERATION_TERMS.test(text)
    ) {
      return false;
    }
    if (!GENERAL_REMUNERATION_TERMS.test(text)) return false;
    if (profile?.role === null || profile?.role === undefined) return true;
    const roles = rolesIn(
      normalizeSpanishText(
        `${source.documentTitle} ${source.sectionTitle ?? ''} ${source.chunkContent}`,
      ),
    );
    // No se infiere que una norma sin cargo conocido aplique al consultado.
    return roles.includes(profile.role);
  });
}

export interface SalaryClarification {
  factor: SalaryFactor;
  message: string;
}

/** Factor ya declarado por la persona en su consulta (null si no lo indicó). */
function declaredFactorValue(
  profile: SalaryQuestionProfile,
  factor: SalaryFactor,
): number | string | null {
  switch (factor) {
    case 'jornada':
      return profile.jornadaHours;
    case 'condicion':
      return profile.condition;
    case 'cargo':
      return profile.role;
    case 'escala':
      return profile.scale;
    case 'periodo':
      return profile.year;
  }
}

function factorQuestion(
  factor: SalaryFactor,
  values: readonly string[],
): string {
  switch (factor) {
    case 'jornada': {
      const hours = sortedUnique(values);
      if (hours.length === 2) {
        return `¿tu jornada es de ${hours[0]} o de ${hours[1]} horas?`;
      }
      return '¿cuántas horas de jornada laboras?';
    }
    case 'condicion': {
      const conditions = sortedUnique(values);
      return conditions.length === 2
        ? `¿tu vínculo es ${conditions[0]} o ${conditions[1]}?`
        : '¿tu vínculo es nombrado o contratado?';
    }
    case 'cargo': {
      const roles = sortedUnique(values);
      return roles.length
        ? `¿a qué cargo corresponde tu consulta: ${roles.join(' o ')}?`
        : '¿a qué cargo corresponde tu consulta?';
    }
    case 'escala':
      return '¿en qué escala de la carrera magisterial te encuentras?';
    case 'periodo': {
      const years = sortedUnique(values).reverse();
      return years.length === 2
        ? `¿de qué año es el monto que consultas: ${years[0]} o ${years[1]}?`
        : '¿de qué año o período es el monto que consultas?';
    }
  }
}

/**
 * Una sola pregunta aclaratoria cuando la evidencia vigente contiene cifras
 * incompatibles y la consulta no aporta el dato que decide entre ellas. Se
 * compara sobre la remuneración general cuando existe —es la que responde la
 * consulta— y solo se pide el factor que realmente cambia la cifra, con los
 * valores que la propia evidencia muestra junto al importe. Si la evidencia no
 * muestra cifras distintas, o si existe un único monto general aplicable, no se
 * pregunta nada: corresponde responder indicando su alcance.
 */
export function salaryClarificationFor(
  question: string,
  sources: RetrievedChunk[],
  personal = isPersonalSalaryQuestion(question),
): SalaryClarification | null {
  const profile = salaryQuestionProfile(question);
  if (!profile.isSalaryQuestion) return null;
  // Una consulta general («cuánto gana un docente») se responde con el
  // panorama y sus condiciones, no con una pregunta que retrase la respuesta.
  // La aclaración se reserva para el caso propio, donde el dato personal sí
  // decide entre cifras que no se pueden presentar conjuntamente, o para la
  // sustitución segura de una respuesta que mezcló filas de una tabla.
  if (!personal && isBroadSalaryQuestion(question)) return null;

  const evidence = salaryEvidenceProfile(sources);
  // La remuneración general manda; los conceptos adicionales solo se comparan
  // cuando no hay ninguna (una asignación especial no define el sueldo).
  const comparable = evidence.general.length
    ? evidence.general
    : evidence.comparable;
  if (!comparable.length) return null;
  // La persona ya delimitó el concepto adicional que consulta.
  if (profile.asksSpecialAllocation) return null;
  // Una sola tabla puede contener varias filas con montos distintos; no se
  // exige más de un documento, solo más de una cifra comparable. Si todas las
  // fuentes dicen el mismo monto, pedir un dato sería una demora inútil.
  const signatures = new Set(
    comparable.flatMap((source) =>
      amountsIn(expandMarkdownTables(source.chunkContent)).map(canonicalAmount),
    ),
  );
  if (signatures.size < 2) return null;

  for (const factor of FACTOR_ORDER) {
    const values = factorValuesInSources(comparable, factor);
    if (values.length < 2) continue;
    if (declaredFactorValue(profile, factor) !== null) continue;
    return {
      factor,
      message: `Para darte la cifra correcta necesito un solo dato: ${factorQuestion(factor, values)} Con eso te indico el monto vigente que te corresponde y su alcance.`,
    };
  }

  return null;
}

export interface SalaryAnswerFinding {
  excerpt: string;
}

const GENERAL_CLAIM_TERMS =
  /\b(?:remuneracion(?:es)?|sueldos?|salarios?|haberes|gana|ganan|percibe|perciben|cobra|cobran)\b/u;

/**
 * Una oración que separa expresamente el concepto adicional de la remuneración
 * —o de los haberes— no lo presenta como sueldo: no corresponde marcarla para
 * revisión. Se exige que la separación mencione el concepto general, para no
 * absolver una frase que dice lo contrario («la asignación no es un bono, es tu
 * remuneración mensual»).
 */
const GENERAL_TERM = '(?:remuneracion(?:es)?|sueldos?|salarios?|haberes)';
const GENERAL_ARTICLE =
  '(?:la |el |los |las |un |una |unos |unas |su |sus |tu |tus |mi |mis |nuestra |nuestro |nuestras |nuestros )?';
/** Verbos que separan un concepto adicional de la remuneración general. */
const SEPARATION_VERBS =
  'no forma parte de|no constituye|no comprende|no incluye|no corresponde a|no se suma a|no es|no son|no equivale(?:n)? a|no se considera(?:n)?|no considera(?:n)?|no reemplaza(?:n)?|no sustituye(?:n)?|no se incluye(?:n)? en|no esta(?:n)? (?:incluid[oa]s?|comprendid[oa]s?) en|no se computa(?:n)? (?:para|en)|distint[oa]s? de|ademas de|aparte de|separad[oa]s? de';
const CONCEPT_SEPARATION_TERMS = new RegExp(
  `\\b(?:${SEPARATION_VERBS})\\s+(?:a\\s+)?${GENERAL_ARTICLE}${GENERAL_TERM}\\b`,
  'u',
);

/** «del sueldo» es «de el sueldo» y «al haber» es «a el haber». */
function separationText(sentence: string): string {
  return normalizeSpanishText(sentence)
    .replace(/\bdel\b/gu, 'de el')
    .replace(/\bal\b/gu, 'a el');
}

/**
 * Una oración presenta el importe como sueldo cuando algún tramo suyo —separado
 * por dos puntos o punto y coma— afirma una remuneración sin separarla del
 * concepto adicional: «no forma parte de tus haberes: es tu remuneración
 * mensual» sigue presentando la asignación como el sueldo.
 */
function presentsAllocationAsSalary(sentence: string): boolean {
  return separationText(sentence)
    .split(/[:;]/u)
    .some(
      (clause) =>
        GENERAL_CLAIM_TERMS.test(clause) &&
        !CONCEPT_SEPARATION_TERMS.test(clause),
    );
}

const CURRENT_SALARY_CLAIM = /\b(?:vigente|actual|actualmente|hoy)\b/u;

function salarySectors(text: string): string[] {
  const normalized = normalizeSpanishText(text);
  return [
    ...(/\b(?:sector\s+)?public[oa]s?\b/u.test(normalized) ? ['publico'] : []),
    ...(/\b(?:sector\s+)?privad[oa]s?\b/u.test(normalized) ? ['privado'] : []),
  ];
}

/** Un límite o comparación no demuestra que ese importe sea la cifra exacta. */
function exactSalaryAmounts(clause: string): Set<string> {
  if (
    /\b(?:maxim[oa]s?|minim[oa]s?|hasta|supera|inferior|superior|solamente|siempre que|solo si|en caso de|si)\b/u.test(
      clause,
    )
  )
    return new Set();
  const direct =
    /(?:\b(?:es(?:\s+de)?|asciende\s+a|equivale\s+a|sera(?:\s+de)?|se\s+fija\s+en)\s+|\b(?:remuneracion|sueldo|salario)[^:;]*:\s*)(?:s\/?\.?\s*)?\d[\d .,]*/gu;
  return new Set(
    [...clause.matchAll(direct)].flatMap((match) => [
      ...matchingAmounts(match[0]),
    ]),
  );
}

/** Conserva las reservas de la oración y los factores de una fila salarial. */
function retainsSalaryConditions(
  row: string,
  amount: string,
  answer: string,
  table: boolean,
  sourceText: string,
  question: string | null,
): boolean {
  const equivalent = (text: string) =>
    normalizeSpanishText(text)
      .replace(/\b(?:mensual(?:es)?|por mes|al mes)\b/gu, 'mensual')
      .replace(/\bpara quienes\b/gu, 'que')
      .replace(
        /\b(auxiliares|privados|privadas|publicos|publicas|zonas|rurales)\b/gu,
        (word) =>
          ({
            auxiliares: 'auxiliar',
            privados: 'privado',
            privadas: 'privada',
            publicos: 'publico',
            publicas: 'publica',
            zonas: 'zona',
            rurales: 'rural',
          })[word] ?? word,
      );
  const answerText = equivalent(answer);
  const sourceFactors = evidenceFactorsIn(row);
  const answerFactors = evidenceFactorsIn(answerText);
  for (const factor of ['jornada', 'condicion', 'escala', 'periodo'] as const) {
    if (
      sourceFactors[factor].some(
        (value) => !answerFactors[factor].includes(value),
      )
    )
      return false;
  }
  if (table) {
    // Las frases fuera de la tabla pueden limitar todas sus filas. Sin una
    // asociación inequívoca, exigimos conservarlas en la respuesta.
    const context = sourceText
      .split(/\r?\n/u)
      .filter((line) => !/^\s*\|/u.test(line))
      .join(' ')
      .trim();
    if (context) {
      const contextualSentences = sentencesIn(context);
      const comparable = (text: string) =>
        (equivalent(text).match(/[a-z0-9]+/gu) ?? [])
          .filter(
            (word) =>
              !/^(?:para|los|las|el|la|de|del|en|por|a|un|una)$/u.test(word),
          )
          .join(' ');
      const comparableAnswer = ` ${comparable(answerText)} `;
      for (const contextSentence of contextualSentences) {
        // La mención de publicación describe el documento, no una condición
        // de la cifra. Otros textos deben quedar reflejados en la respuesta.
        if (
          /^(?:la )?norma fue publicada en el diario oficial[.]?$/u.test(
            contextSentence,
          )
        )
          continue;
        if (!comparableAnswer.includes(` ${comparable(contextSentence)} `))
          return false;
      }
    }
    return row.split(';').every((cell) => {
      const separator = cell.indexOf(':');
      if (separator < 0) return false;
      const label = cell.slice(0, separator).trim();
      const value = cell.slice(separator + 1).trim();
      if (!value) return true;
      if (
        matchingAmounts(value).has(amount) &&
        /\b(?:remuneracion|sueldo|salario)\b/u.test(label)
      ) {
        const qualifier = label
          .replace(/\b(?:remuneracion|sueldo|salario|mensuales?|s)\b/gu, ' ')
          .replace(/[^a-z0-9]+/gu, ' ')
          .trim()
          .replace(/\s+/gu, ' ');
        return !qualifier || answerText.includes(equivalent(qualifier));
      }
      if (
        /^cargo$/u.test(label) &&
        /^(?:docentes?|profesor(?:a|es|as)?|auxiliar(?: de educacion)?|director(?:a|es|as)?|directivos?)$/u.test(
          value,
        ) &&
        question &&
        rolesIn(value).includes(salaryQuestionProfile(question).role ?? '')
      )
        return true;
      return answerText.includes(equivalent(value));
    });
  }
  const entry = [...row.matchAll(new RegExp(AMOUNT_PATTERN.source, 'gu'))].find(
    (match) => matchingAmounts(match[0]).has(amount),
  );
  if (!entry || entry.index === undefined) return false;
  const tail = row
    .slice(entry.index + entry[0].length)
    .replace(/^[\s,;:.]+|[\s,;:.]+$/gu, '');
  if (/[a-z]/u.test(tail) && !answerText.includes(equivalent(tail)))
    return false;
  const prefix = row.slice(0, entry.index);
  const condition = prefix.match(
    /\b(?:si|cuando|unicamente|solo|solamente|siempre que|en caso de|para quienes|a condicion de|salvo)\b[^,;]*/u,
  )?.[0];
  return !condition || answerText.includes(equivalent(condition.trim()));
}

function citedSourcesForSentence(
  sentence: string,
  sources: RetrievedChunk[],
): RetrievedChunk[] {
  return citedIndexes(sentence)
    .map((index) => sources[index - 1])
    .filter((source): source is RetrievedChunk => Boolean(source));
}

function matchingAmounts(sentence: string): Set<string> {
  return new Set(amountsIn(sentence).map(canonicalAmount));
}

function sourceSupportsAmountAs(
  source: RetrievedChunk,
  amounts: ReadonlySet<string>,
  terms: RegExp,
): boolean {
  if (!amounts.size) return false;
  return sentencesIn(source.chunkContent).some((sourceSentence) => {
    if (!terms.test(sourceSentence)) return false;
    return amountsIn(sourceSentence)
      .map(canonicalAmount)
      .some((amount) => amounts.has(amount));
  });
}

/** Sólo citas: la cita de cierre pertenece a la oración anterior. */
const CITATION_TAIL = new RegExp(
  `^(?:\\s*(?:${CITATION_GROUP.source}))+\\s*$`,
  'u',
);

/**
 * Oraciones con una cifra, para revisar de dónde sale cada importe. La cita que
 * el prompt pide colocar tras el punto («El plazo es de cinco días. [1]») se
 * reincorpora a la oración que cierra, no se pierde como fragmento aparte.
 */
function amountSentences(answer: string): string[] {
  const sentences: string[] = [];
  for (const line of expandMarkdownTables(answer)
    .replace(/\r/gu, '')
    .split(/\n+/u)) {
    for (const fragment of line.split(/(?<=[.!?])\s+/u)) {
      const trimmed = fragment.trim();
      if (!trimmed) continue;
      if (CITATION_TAIL.test(trimmed) && sentences.length) {
        sentences[sentences.length - 1] += ` ${trimmed}`;
        continue;
      }
      sentences.push(trimmed);
    }
  }
  return sentences.filter((sentence) => AMOUNT_PATTERN.test(sentence));
}

/**
 * Una respuesta salarial puede tomar el importe de una fila y la condición de
 * otra. Se comprueba, solo en fuentes con tabla, que el importe citado y los
 * factores decisivos (jornada, vínculo, escala o período) estén en la misma
 * fila. El cargo se omite porque una tabla de docentes no repite el rol en cada
 * fila; los demás factores sí cambian la cifra.
 */
export function salaryRowMismatch(
  answer: string,
  sources: RetrievedChunk[],
  question: string | null = null,
): SalaryAnswerFinding | null {
  // Se valida una tabla en la respuesta o una respuesta plana sustentada en
  // una tabla: en ambos casos el importe debe pertenecer a la misma fila que su
  // condición. Una tabla del modelo a partir de fuentes planas también se
  // comprueba contra las oraciones de esas fuentes.
  const checkedFactors: readonly SalaryFactor[] = [
    'jornada',
    'condicion',
    'cargo',
    'escala',
    'periodo',
  ];
  const questionProfile = question ? salaryQuestionProfile(question) : null;

  for (const sentence of amountSentences(answer)) {
    // Una oración con dos importes («30 horas: X y 40 horas: Y») se valida por
    // cláusulas; una fila de tabla expandida conserva sus etiquetas y se valida
    // entera.
    const pieces =
      matchingAmounts(sentence).size > 1
        ? sentence.split(SALARY_CLAUSE_SPLIT)
        : [sentence];
    for (const piece of pieces) {
      const amounts = matchingAmounts(piece);
      if (!amounts.size) continue;
      const answerFactors = evidenceFactorsIn(normalizeSpanishText(piece));
      const declared = new Set<SalaryFactor>(
        checkedFactors.filter((factor) => answerFactors[factor].length > 0),
      );
      // La pregunta puede declarar factores que la respuesta omite; se exigen
      // todos, no solo cuando la respuesta no declara ninguno. En una
      // asignación especial no se añaden factores de la pregunta: el concepto
      // solicitado puede no repetir la jornada o el vínculo en la fila.
      if (questionProfile && !questionProfile.asksSpecialAllocation) {
        for (const factor of [
          'jornada',
          'condicion',
          'escala',
          'periodo',
        ] as const) {
          if (declaredFactorValue(questionProfile, factor) !== null) {
            declared.add(factor);
          }
        }
        if (questionProfile.role !== null) {
          declared.add('cargo');
        }
      }
      if (!declared.size) continue;
      const cited = citedSourcesForSentence(piece, sources);
      const candidates = cited.length ? cited : sources;
      const supported = candidates.some((source) => {
        const rows = sentencesIn(source.chunkContent).map((row) => ({
          factors: evidenceFactorsIn(row),
          row,
        }));
        const amountRows = rows.filter((entry) =>
          [...amounts].some((amount) => matchingAmounts(entry.row).has(amount)),
        );
        if (!amountRows.length) return false;
        // Solo se exigen los factores que acompañan al importe en la fuente.
        // Un vínculo mencionado en otra oración no tiene por qué repetirse en
        // cada fila, pero un factor declarado por la pregunta sí debe existir.
        const sourceFactors = new Set(
          checkedFactors.filter((factor) =>
            amountRows.some((entry) => entry.factors[factor].length > 0),
          ),
        );
        const questionCargo =
          questionProfile && !questionProfile.asksSpecialAllocation
            ? questionProfile.role
            : null;
        const required: SalaryFactor[] = [];
        for (const factor of declared) {
          if (factor === 'cargo') {
            // El cargo solo se exige cuando la fuente lo distingue junto al
            // importe; una fuente que no repite el rol no permite verificarlo.
            if (
              sourceFactors.has('cargo') &&
              (answerFactors.cargo.length > 0 || questionCargo !== null)
            ) {
              required.push('cargo');
            }
            continue;
          }
          if (!sourceFactors.has(factor)) return false;
          required.push(factor);
        }
        if (
          sourceFactors.has('cargo') &&
          questionCargo !== null &&
          !required.includes('cargo')
        ) {
          required.push('cargo');
        }
        if (!required.length) return true;
        return amountRows.some((entry) =>
          required.every((factor) => {
            const expected = [...answerFactors[factor]];
            if (factor === 'cargo' && questionCargo !== null) {
              if (!expected.includes(String(questionCargo))) {
                expected.push(String(questionCargo));
              }
            } else if (questionProfile) {
              const questionValue = declaredFactorValue(
                questionProfile,
                factor,
              );
              if (
                questionValue !== null &&
                !expected.includes(String(questionValue))
              ) {
                expected.push(String(questionValue));
              }
            }
            return (
              expected.length > 0 &&
              expected.every((value) =>
                entry.factors[factor].includes(String(value)),
              )
            );
          }),
        );
      });
      if (!supported) return { excerpt: piece.slice(0, 2_000) };
    }
  }
  return null;
}

/**
 * Validación posterior de una respuesta salarial: si se entregó una
 * remuneración general vigente y la respuesta presenta un importe como sueldo
 * o remuneración citando únicamente un concepto adicional, se marca el
 * fragmento para revisión humana. No decide la verdad jurídica ni reescribe la
 * respuesta; el control determinista de citas sigue siendo el que rechaza.
 */
export function assessSalaryAnswerCoverage(
  answer: string,
  sources: RetrievedChunk[],
  question: string | null = null,
): SalaryAnswerFinding | null {
  const rowMismatch = salaryRowMismatch(answer, sources, question);
  if (rowMismatch) return rowMismatch;
  const answerAmounts = amountSentences(answer);
  const asksSalary =
    question === null || salaryQuestionProfile(question).isSalaryQuestion;
  // Una respuesta salarial no puede aportar un importe que ninguna fuente tenga:
  // si ninguna trae un monto, cualquier cifra es inventada o externa. Se marca
  // para que el turno no la presente como evidencia.
  if (
    asksSalary &&
    answerAmounts.length &&
    !sources.some((source) => hasAmount(source.chunkContent))
  ) {
    return { excerpt: answerAmounts[0].slice(0, 2_000) };
  }
  const generalSources = sources.filter(isGeneralRemunerationSource);
  for (const sentence of answerAmounts) {
    const cited = citedSourcesForSentence(sentence, sources);
    if (!cited.length) {
      // Una tabla con fuente única puede llevar la cita antes de las filas.
      // Con varias fuentes no se puede adivinar cuál respalda la cifra.
      if (sources.length !== 1 || !sources[0])
        return { excerpt: sentence.slice(0, 2_000) };
      cited.push(sources[0]);
    }

    if (
      [...matchingAmounts(sentence)].some(
        (amount) =>
          !cited.some((source) =>
            matchingAmounts(source.chunkContent).has(amount),
          ),
      )
    ) {
      return { excerpt: sentence.slice(0, 2_000) };
    }

    const role =
      question && isBroadSalaryQuestion(question)
        ? salaryQuestionProfile(question).role
        : null;
    const statedSectors = salarySectors(sentence);
    const questionSectors = question ? salarySectors(question) : [];
    // Una misma oración con cifras y ambos sectores no permite asociar cada
    // importe inequívocamente; se pide al modelo separarlos con su fuente.
    if (statedSectors.length > 1) {
      return { excerpt: sentence.slice(0, 2_000) };
    }
    if (
      questionSectors.length === 1 &&
      statedSectors.length === 1 &&
      questionSectors[0] !== statedSectors[0]
    ) {
      return { excerpt: sentence.slice(0, 2_000) };
    }
    const sector =
      statedSectors.length === 1
        ? statedSectors[0]
        : statedSectors.length === 0 && questionSectors.length === 1
          ? questionSectors[0]
          : null;
    if (sector || role) {
      const amounts = matchingAmounts(sentence);
      const supported = [...amounts].every((amount) =>
        cited.some((source) =>
          sentencesIn(source.chunkContent)
            .flatMap((row) =>
              ((hasMarkdownTable(source.chunkContent) &&
                /\b(?:remuneracion|sueldo|salario)[^:]*:/u.test(row) &&
                row.includes(';')) ||
              /\bcargo\s*:/u.test(row)
                ? [row]
                : row.split(SALARY_CLAUSE_SPLIT)
              ).map((clause) => ({ row, clause })),
            )
            .some(({ row, clause }) => {
              const sectors = salarySectors(clause);
              const table =
                hasMarkdownTable(source.chunkContent) &&
                row.includes(';') &&
                /\b(?:remuneracion|sueldo|salario)[^:]*:/u.test(row);
              if (
                !retainsSalaryConditions(
                  row,
                  amount,
                  sentence,
                  table,
                  source.chunkContent,
                  question,
                )
              )
                return false;
              const tableRole =
                hasMarkdownTable(source.chunkContent) &&
                !/\bcargo\s*:/u.test(clause) &&
                /\b(?:remuneracion|sueldo|salario)[^:]*:/u.test(clause) &&
                role &&
                rolesIn(normalizeSpanishText(source.documentTitle)).includes(
                  role,
                ) &&
                !/\b(?:administrativ[oa]s?|auxiliar(?:es)?|docentes?|profesor(?:a|es|as)?|director(?:a|es|as)?)\b/u.test(
                  row,
                );
              return (
                exactSalaryAmounts(clause).has(amount) &&
                !/\b(?:no|ni|excepto|excluid[oa]s?)\b/u.test(clause) &&
                (!role ||
                  ((rolesIn(clause).includes(role) || tableRole) &&
                    GENERAL_REMUNERATION_TERMS.test(clause))) &&
                (!sector || (sectors.length === 1 && sectors[0] === sector))
              );
            }),
        ),
      );
      if (!supported) return { excerpt: sentence.slice(0, 2_000) };
    }

    // Un documento reemplazado nunca se presenta como regla vigente. No basta
    // con que el fragmento use la palabra «remuneración»: su situación
    // verificable debe respaldar la vigencia afirmada.
    if (
      CURRENT_SALARY_CLAIM.test(normalizeSpanishText(sentence)) &&
      cited.every((source) => source.documentSituation !== 'current')
    ) {
      return { excerpt: sentence.slice(0, 2_000) };
    }

    if (!generalSources.length || !presentsAllocationAsSalary(sentence)) {
      continue;
    }

    const amounts = matchingAmounts(sentence);
    const citedAllocation = cited.some((source) =>
      sourceSupportsAmountAs(source, amounts, SPECIAL_ALLOCATION_TERMS),
    );
    const citedGeneral = cited.some((source) =>
      sourceSupportsAmountAs(source, amounts, GENERAL_REMUNERATION_TERMS),
    );
    if (citedAllocation && !citedGeneral) {
      return { excerpt: sentence.slice(0, 2_000) };
    }
  }

  return null;
}
