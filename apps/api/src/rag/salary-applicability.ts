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

const SALARY_TERMS =
  /\b(?:remuneracion(?:es)?|sueldos?|salarios?|haberes|pagos?|paga|pagan|paguen|cobro|cobrar|cobra|gana|ganan|ganaria|percibe|perciben|ingresos?|asignacion(?:es)?|bonificacion(?:es)?|gratificacion(?:es)?|aguinaldos?|escolaridad|subsidios?)\b/u;

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
    pattern: /\b(?:director|directora|directores|directoras|directiv[oa]s)\b/u,
  },
  {
    role: 'docente',
    pattern: /\b(?:docente(?:s)?|profesor(?:a|as|es)?|maestr[oa]s?)\b/u,
  },
];

const HOURS_PATTERN = /\b(\d{1,2})\)?\s*(?:h|horas)\b/u;
const HOURS_PATTERN_ALL = new RegExp(HOURS_PATTERN.source, 'gu');
const SCALE_PATTERN = /\bescala\s*(\d{1,2}|[ivx]{1,4})\b/u;

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
      jornadaBeforeHours(clause)
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

function scalesIn(text: string): string[] {
  const match = SCALE_PATTERN.exec(text);
  return match ? [match[1]] : [];
}

function yearsIn(text: string): number[] {
  const years = text.match(/\b(?:19|20)\d{2}\b/gu) ?? [];
  return years.map(Number);
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
  if (isGeneralRemunerationSource(source)) return 0;
  if (isSpecialAllocationSource(source)) {
    return profile.asksSpecialAllocation ? 1 : 2;
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

/** Factores que la propia consulta ya declara. */
export function salaryQuestionProfile(question: string): SalaryQuestionProfile {
  const text = normalizeSpanishText(question);
  return {
    asksSpecialAllocation: SPECIAL_ALLOCATION_REQUEST.test(text),
    condition: conditionsIn(text)[0] ?? null,
    isSalaryQuestion: SALARY_TERMS.test(text),
    jornadaHours: hoursIn(text)[0] ?? null,
    role: rolesIn(text)[0] ?? null,
    scale: scalesIn(text)[0] ?? null,
    year: yearsIn(text)[0] ?? null,
  };
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
    periodo: yearsIn(text).map(String),
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

/** Identidad comparable de las cifras de un fragmento (ordenada). */
function amountSignature(source: RetrievedChunk): string {
  return sortedUnique(amountsIn(source.chunkContent).map(canonicalAmount)).join(
    '|',
  );
}

/** Oraciones del fragmento, ya normalizadas para comparar contra los patrones. */
function sentencesIn(text: string): string[] {
  return text
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
): string[] {
  const scoped = amountSentencesIn(source.chunkContent).flatMap(
    (sentence) => evidenceFactorsIn(sentence)[factor],
  );
  return scoped.length
    ? scoped
    : evidenceFactorsIn(normalizeSpanishText(source.chunkContent))[factor];
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
): SalaryClarification | null {
  const profile = salaryQuestionProfile(question);
  if (!profile.isSalaryQuestion) return null;

  const evidence = salaryEvidenceProfile(sources);
  // La remuneración general manda; los conceptos adicionales solo se comparan
  // cuando no hay ninguna (una asignación especial no define el sueldo).
  const comparable = evidence.general.length
    ? evidence.general
    : evidence.comparable;
  if (comparable.length < 2) return null;
  // La persona ya delimitó el concepto adicional que consulta.
  if (profile.asksSpecialAllocation) return null;
  // Dos fuentes que dicen el mismo monto no plantean ninguna disyuntiva: pedir
  // un dato para una única cifra sería una pregunta inútil y una demora.
  const signatures = new Set(comparable.map(amountSignature));
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
  for (const line of answer.replace(/\r/gu, '').split(/\n+/u)) {
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
 * Validación posterior de una respuesta salarial: si se entregó una
 * remuneración general vigente y la respuesta presenta un importe como sueldo
 * o remuneración citando únicamente un concepto adicional, se marca el
 * fragmento para revisión humana. No decide la verdad jurídica ni reescribe la
 * respuesta; el control determinista de citas sigue siendo el que rechaza.
 */
export function assessSalaryAnswerCoverage(
  answer: string,
  sources: RetrievedChunk[],
): SalaryAnswerFinding | null {
  const generalSources = sources.filter(isGeneralRemunerationSource);
  if (!generalSources.length) return null;

  const generalChunks = new Set(generalSources.map((source) => source.chunkId));
  for (const sentence of amountSentences(answer)) {
    if (!presentsAllocationAsSalary(sentence)) continue;
    const cited = citedIndexes(sentence)
      .map((index) => sources[index - 1])
      .filter((source): source is RetrievedChunk => Boolean(source));
    if (!cited.length) continue;
    if (cited.some((source) => generalChunks.has(source.chunkId))) continue;
    return { excerpt: sentence.slice(0, 2_000) };
  }

  return null;
}
