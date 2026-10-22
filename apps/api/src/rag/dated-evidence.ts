import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Preguntas por el momento de un proceso («¿cuándo se dan los destaques?»,
 * «fechas del concurso», «cronograma de la ratificación»). La respuesta útil es
 * una fecha o un periodo, no la definición del trámite. Las tablas de fechas
 * se parecen poco a la pregunta por similitud (una fila de fechas no repite el
 * tema), así que estas consultas completan la evidencia con el cronograma del
 * propio documento antes de responder.
 */

/** «cuándo» con tilde siempre es interrogativo, también en medio de la frase. */
const ACCENTED_WHEN = /\bcu[áÁ]ndo\b/iu;
/** Sin tilde, «cuando» es interrogativo al abrir la pregunta… */
const LEADING_WHEN =
  /^(?:y\s+)?(?:para|desde|hasta|a\s+partir\s+de|de)?\s*cuando\b/u;
/** …o tras un verbo de pedido («quisiera saber cuando…», «dime cuando…»). */
const REQUESTED_WHEN =
  /\b(?:saber|sabes|sabe|dime|digame|indica(?:me|nos)?|informa(?:me|nos)?|consultar|pregunto)\s+(?:desde\s+|hasta\s+|para\s+)?cuando\b/u;
/**
 * Pedidos de fechas o de un cronograma. «Fecha» sola no basta: «presenté
 * fuera de fecha» pregunta por una consecuencia, no por una fecha.
 */
const DATE_REQUEST =
  /\b(?:(?:la|las|una|que|cual|cuales|sus|mis)\s+fechas?|fechas?\s+(?:de|del|para|limites?|exactas?|programadas?|establecidas?)|cronogramas?|calendarios?|en que (?:mes|dia|fecha|ano|periodo|semana)|(?:que|cual) (?:dia|mes)|(?:hasta|desde) que (?:dia|fecha))\b/u;

/**
 * `true` cuando la consulta pide una fecha, un periodo o un cronograma. Un
 * «cuando» que introduce una condición («¿quién reemplaza al director cuando
 * está de licencia?») no es una pregunta por fechas.
 */
export function asksForDates(question: string): boolean {
  if (ACCENTED_WHEN.test(question)) return true;
  const normalized = normalizeSpanishText(question)
    .replace(/[¿?¡!"'«»“”()]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  return (
    LEADING_WHEN.test(normalized) ||
    REQUESTED_WHEN.test(normalized) ||
    DATE_REQUEST.test(normalized)
  );
}

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

/**
 * 13.01.2026, 13/01/2026, 13-01-2026 y, con año de dos cifras, 13.01.26. Los
 * numerales («6.10.1», «7.1.10») y los códigos de norma («070-2013-PCM») no
 * cuentan: el año de dos cifras exige día y mes de dos cifras.
 */
const NUMERIC_DATE =
  /(?<![\d./-])(\d{1,2})[./-](\d{1,2})[./-]((?:19|20)\d{2}|\d{2})(?![\d])/gu;
/** «13 de enero», «13 de enero de 2026», «1 de setiembre del 2025». */
const TEXTUAL_DATE =
  /\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+(?:de|del)\s+((?:19|20)\d{2}))?\b/gu;

function dateKey(day: number, month: number, year: string): string | null {
  if (day < 1 || day > 31 || month < 1 || month > 12) return null;
  return `${day}.${month}.${year}`;
}

/** Fechas explícitas distintas del texto, normalizadas («13.1.2026»). */
export function distinctDatesIn(text: string): string[] {
  const keys = new Set<string>();
  for (const match of text.matchAll(NUMERIC_DATE)) {
    const [, day = '', month = '', year = ''] = match;
    if (year.length === 2 && (day.length !== 2 || month.length !== 2)) {
      continue;
    }
    const key = dateKey(
      Number(day),
      Number(month),
      year.length === 2 ? `20${year}` : year,
    );
    if (key) keys.add(key);
  }
  for (const match of normalizeSpanishText(text).matchAll(TEXTUAL_DATE)) {
    const [, day = '', monthName = '', year = ''] = match;
    const month =
      monthName === 'setiembre'
        ? 9
        : MONTHS.indexOf(monthName as (typeof MONTHS)[number]) + 1;
    const key = dateKey(Number(day), month, year);
    if (key) keys.add(key);
  }
  return [...keys];
}

/**
 * Patrón equivalente para PostgreSQL (`~*`): selecciona en la base solo los
 * fragmentos que contienen alguna fecha, sin traer el documento entero.
 */
export const DATE_SQL_PATTERN =
  '[0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4}|[0-9]{1,2} de (enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)';

/** Un cronograma trae al menos tres fechas explícitas distintas. */
export const MIN_SCHEDULE_DATES = 3;
/**
 * Fechas por cada mil caracteres de una tabla de fechas. Medido en el corpus
 * real (2026-10-21): las tablas de cronograma tienen de 3,7 a 23,3; un párrafo
 * que menciona fechas sueltas («a partir del 01.03.2026»), de 0,6 a 1,5.
 */
const MIN_SCHEDULE_DATE_DENSITY = 2;

/** El fragmento es una tabla de fechas, no un párrafo que menciona algunas. */
export function isScheduleTable(content: string): boolean {
  const dates = distinctDatesIn(content).length;
  return (
    dates >= MIN_SCHEDULE_DATES &&
    (dates * 1000) / Math.max(1, content.length) >= MIN_SCHEDULE_DATE_DENSITY
  );
}

/**
 * Palabras que no identifican el tema de un cronograma: interrogativos,
 * verbos de pedido, vocabulario temporal y trámites comunes a todos los
 * procesos («presentación de solicitudes», «resultados», «etapa»). Sin ellas,
 * lo que queda («destaque», «ratificación», «encargatura») sí distingue un
 * cronograma de otro.
 */
const SCHEDULE_STOP_WORDS = new Set([
  'actividad',
  'actividades',
  'aunque',
  'calendario',
  'calendarios',
  'comienza',
  'comienzan',
  'como',
  'consultar',
  'convocatoria',
  'cronograma',
  'cronogramas',
  'cual',
  'cuales',
  'cuando',
  'cuanto',
  'cuanta',
  'cuantos',
  'cuantas',
  'debe',
  'deben',
  'debo',
  'desde',
  'digame',
  'dime',
  'docente',
  'docentes',
  'donde',
  'educacion',
  'educativa',
  'educativo',
  'empieza',
  'empiezan',
  'entre',
  'esta',
  'estan',
  'estas',
  'este',
  'esto',
  'estos',
  'etapa',
  'etapas',
  'evaluacion',
  'fecha',
  'fechas',
  'favor',
  'hace',
  'hacen',
  'hacer',
  'hasta',
  'hora',
  'horas',
  'indica',
  'indicame',
  'informa',
  'informame',
  'inicia',
  'inician',
  'inicio',
  'inscripcion',
  'inscripciones',
  'mismo',
  'misma',
  'necesito',
  'para',
  'pero',
  'periodo',
  'periodos',
  'plazo',
  'plazos',
  'podria',
  'podrias',
  'porque',
  'postulacion',
  'postulantes',
  'presenta',
  'presentacion',
  'presentan',
  'presentar',
  'presento',
  'proceso',
  'procesos',
  'profesor',
  'profesores',
  'publicacion',
  'puede',
  'pueden',
  'puedo',
  'quiero',
  'quisiera',
  'realiza',
  'realizan',
  'realizar',
  'responsable',
  'responsables',
  'resultado',
  'resultados',
  'sabe',
  'saber',
  'sabes',
  'semana',
  'semanas',
  'sera',
  'seran',
  'sobre',
  'solicitud',
  'solicitudes',
  'solo',
  'tambien',
  'tengo',
  'termina',
  'terminan',
  'tiene',
  'tienen',
  'toda',
  'todas',
  'todo',
  'todos',
  'tramite',
  'tramites',
  'unas',
  'unos',
  'vence',
  'vencen',
]);

/** Términos que identifican el tema de la consulta («destaques»). */
export function scheduleTopicTerms(question: string): string[] {
  return [
    ...new Set(
      (normalizeSpanishText(question).match(/[\p{L}\p{N}]{4,}/gu) ?? []).filter(
        (term) => !SCHEDULE_STOP_WORDS.has(term) && !/^\d+$/u.test(term),
      ),
    ),
  ];
}

function mentionsTerm(words: readonly string[], term: string): boolean {
  // «destaques» cubre «destaque»: se compara la raíz, como el rescate léxico.
  const root = term.slice(0, Math.max(4, term.length - 2));
  return words.some((word) => word.startsWith(root));
}

/**
 * El fragmento trata el tema de la consulta. `all` exige cada término (para un
 * cronograma de otro documento del módulo); sin `all` basta uno (para un
 * fragmento del mismo documento ya admitido como evidencia). Sin términos de
 * tema (un seguimiento «¿y cuándo?») no hay nada que exigir.
 */
export function coversScheduleTopic(
  content: string,
  terms: readonly string[],
  mode: 'all' | 'any',
): boolean {
  if (!terms.length) return true;
  const words = normalizeSpanishText(content).match(/[\p{L}\p{N}]{3,}/gu) ?? [];
  return mode === 'all'
    ? terms.every((term) => mentionsTerm(words, term))
    : terms.some((term) => mentionsTerm(words, term));
}

/** El fragmento es una tabla de fechas del tema consultado. */
export function isScheduleEvidence(
  content: string,
  terms: readonly string[],
  mode: 'all' | 'any' = 'any',
): boolean {
  return isScheduleTable(content) && coversScheduleTopic(content, terms, mode);
}

/**
 * Consulta canónica para encontrar el cronograma de un tema cuando ningún
 * documento ya admitido lo contiene. Probado contra el corpus real: «cronograma
 * de destaque 2026 fechas de inicio y fin» sitúa la tabla en el primer lugar;
 * «¿cuándo se dan los destaques?» no la trae entre los diez primeros.
 */
export function scheduleQuery(terms: readonly string[], year: number): string {
  return `cronograma de ${terms.join(' ')} ${year}: actividades, fechas de inicio y fin`;
}

/** Fragmento con fechas de un documento, listo para evaluarse como cronograma. */
export interface DatedCandidate {
  chunk: RetrievedChunk;
  chunkIndex: number;
  dates: number;
  table: boolean;
  /** Posición del documento en la evidencia (desempate estable). */
  version: number;
}

/**
 * Completa una tabla que el fragmentado partió en varios trozos. Desde cada
 * semilla agrega los fragmentos contiguos del mismo documento con al menos
 * tres fechas: una tabla (aunque sus filas no repitan el tema) o un párrafo
 * del tema (el que presenta la tabla, con la vigencia o los plazos). Solo se
 * sigue avanzando a través de tablas. Devuelve lo que aún no se entregó, en el
 * orden del documento.
 */
export function contiguousSchedule(
  seeds: readonly DatedCandidate[],
  candidates: readonly DatedCandidate[],
  delivered: ReadonlySet<string>,
  terms: readonly string[],
): RetrievedChunk[] {
  const byPosition = new Map(
    candidates.map((candidate) => [
      `${candidate.chunk.documentVersionId}:${candidate.chunkIndex}`,
      candidate,
    ]),
  );
  const added = new Map<string, DatedCandidate>();
  for (const seed of seeds) {
    if (!delivered.has(seed.chunk.chunkId)) {
      added.set(seed.chunk.chunkId, seed);
    }
  }
  const pending = [...seeds];
  for (let current = pending.shift(); current; current = pending.shift()) {
    for (const offset of [-1, 1]) {
      const neighbour = byPosition.get(
        `${current.chunk.documentVersionId}:${current.chunkIndex + offset}`,
      );
      if (
        !neighbour ||
        delivered.has(neighbour.chunk.chunkId) ||
        added.has(neighbour.chunk.chunkId) ||
        neighbour.dates < MIN_SCHEDULE_DATES ||
        (!neighbour.table &&
          !coversScheduleTopic(neighbour.chunk.chunkContent, terms, 'any'))
      ) {
        continue;
      }
      added.set(neighbour.chunk.chunkId, neighbour);
      if (neighbour.table) pending.push(neighbour);
    }
  }
  return [...added.values()]
    .sort(
      (left, right) =>
        left.version - right.version || left.chunkIndex - right.chunkIndex,
    )
    .map((candidate) => candidate.chunk);
}

/**
 * Coloca cada fragmento de cronograma justo después de la última referencia
 * entregada de su mismo documento, para que las referencias de un archivo
 * queden juntas. Un cronograma de otro documento va al final.
 */
export function withScheduleEvidence(
  delivered: readonly RetrievedChunk[],
  additions: readonly RetrievedChunk[],
): RetrievedChunk[] {
  const result = [...delivered];
  for (const addition of additions) {
    let anchor = -1;
    result.forEach((source, index) => {
      if (source.documentVersionId === addition.documentVersionId) {
        anchor = index;
      }
    });
    if (anchor === -1) result.push(addition);
    else result.splice(anchor + 1, 0, addition);
  }
  return result;
}
