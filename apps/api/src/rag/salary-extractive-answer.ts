import type { RetrievalScope, RetrievedChunk } from './retrieval.gateway';
import {
  canonicalAmount,
  hasSalaryPanoramaEvidence,
  salaryQuestionProfile,
  salaryRoles,
  salarySectors,
} from './salary-applicability';
import { parseSalarySchedule, type SalarySchedule } from './salary-schedule';
import { MAX_RAG_ANSWER_CHARS, RAG_TRUNCATION_NOTE } from './rag.constants';
import {
  isPayrollReviewQuestion,
  isRuralAllocationQuestion,
  isRuralAllocationEvidence,
  isRuralPadronQuestion,
  isRuralPadronEvidence,
} from './remuneration-retrieval';
import { normalizeSpanishText } from './text-normalization';

export interface ExtractiveSalaryAnswer {
  answer: string;
  hasVerifiedAmount: boolean;
  sources: RetrievedChunk[];
}

interface SalaryEvidenceUnit {
  sectors: string[];
  text: string;
}

interface SalaryCandidate {
  evidence: SalarySourceEvidence;
  source: RetrievedChunk;
}

interface SalarySourceEvidence {
  sectors: string[];
  units: SalaryEvidenceUnit[];
}

const PANORAMA_SECTORS = ['publico', 'privado'] as const;
const GENERAL_SALARY_TERM =
  /\b(?:remuneracion(?:es)?|sueldos?|salarios?|haberes)\b/u;
const SPECIAL_BENEFIT_TERM =
  /\b(?:asignacion(?:es)?|bonificacion(?:es)?|gratificacion(?:es)?|aguinaldos?|escolaridad|subsidios?|sepelio|bono(?:s)?|compensacion(?:es)?|beneficios?|incentivos?|cts|vacacional(?:es)?|vacaciones)\b/u;
const NEGATED_SALARY_UNIT =
  /\b(?:no|ni|excepto|excluid[oa]s?|inaplicable|no\s+se\s+aplica)\b/u;
/** «Programa No Escolarizado» es un nombre propio, no una negación. */
const PROGRAM_NO_ESCOLARIZADO = /\bno\s+escolarizad[oa]s?\b/gu;
const EDUCATION_AUXILIARY = /\bauxiliar(?:es)?\s+de\s+educacion\b/u;
/** El sector debe declararse como tal o junto al cargo; «Carrera Pública» no es un sector. */
const DECLARED_SECTOR =
  /\b(?:sector|del sector|en el sector)(?:\s*:\s*|\s+)(public[oa]s?|privad[oa]s?)|\b(?:auxiliar(?:es)?|docente(?:s)?|profesor(?:a|as|es)?|director(?:a|as|es)?|directivos?|educaci[oó]n|colegio(?:s)?|escuela(?:s)?|centros?\s+educativos?|plantel(?:es)?|gesti[oó]n|instituci[oó]n(?:\s+educativa)?|instituciones\s+educativas|i\.e\.|ii\.ee\.)\s+(?:del\s+)?(?:sector\s+)?(public[oa]s?|privad[oa]s?)\b/gu;

function declaredSectorsIn(text: string): string[] {
  return [
    ...new Set(
      [...normalizeSpanishText(text).matchAll(DECLARED_SECTOR)].map((match) =>
        (match[1] ?? match[2])?.startsWith('public') ? 'publico' : 'privado',
      ),
    ),
  ];
}
/** Una unidad que remite a la norma que fija el monto, sin dar la cifra. */
const NORM_REFERENCE =
  /\b(?:decreto\s+supremo|ley\s+n|resolucion(?:\s+(?:ministerial|viceministerial|secretarial))?|directiva)\b/u;
const REGULATION_VERB =
  /\b(?:establece|establecen|regula|regulan|fija|fijan|determina|determinan|corresponde|corresponden|otorga|otorgan)\b/u;
/** Una condición de pago que acompaña a la tabla (proporcionalidad, jornada). */
const PAY_CONDITION =
  /\b(?:proporcional|jornada|carga\s+horaria|horas?\s+(?:contratadas?|semanales?|lectivas?))\b/u;
/**
 * Una unidad que habla de la remuneración como regla («la remuneración es…»,
 * «el decreto establece el monto de la remuneración»), no de un requisito que
 * solo menciona «constancias de haberes». Evita citar trámites de experiencia
 * como si explicaran cuánto se gana.
 */
const SALARY_RULE =
  /\b(?:remuneracion(?:es)?|sueldos?|salarios?)\b[^.;]{0,80}\b(?:es|son|se|sera|seran|esta|estan|ha|han|sido|corresponde|asciende|equivale|fija|fijan|fijad[oa]s?|establece|establecen|establecid[oa]s?|regula|regulan|regulad[oa]s?|determina|determinan|determinad[oa]s?|percibe|perciben|otorga|otorgan|monto|importe|escala)\b|\bhaberes\b[^.;]{0,80}\b(?:fija|fijan|fijad[oa]s?|establece|establecen|establecid[oa]s?|regula|regulan|regulad[oa]s?|determina|determinan|determinad[oa]s?|corresponde|asciende|equivale|percibe|perciben|otorga|otorgan|monto|importe|escala|sera|seran)\b|\b(?:establece|establecen|fija|fijan|regula|regulan|determina|determinan)\b[^.;]{0,60}\b(?:remuneracion(?:es)?|sueldos?|salarios?|haberes)\b/u;
const MAX_NOTE_CHARS = 500;

/**
 * Importe de una unidad para esta salida. Exige «S/», separador de miles,
 * tres dígitos enteros con decimales o la palabra «soles»; así el numeral de un
 * artículo («4.13») o la jornada («30») no se confunden con una cifra.
 */
const UNIT_AMOUNT =
  /(?:s\/\.?\s*\d[\d .,]*)|(?:\b\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?\b)|(?:\b\d{3,}[.,]\d{2}\b)|(?:\b\d[\d .,]*\s+soles\b)/iu;
const UNIT_AMOUNT_ALL =
  /(?:s\/\.?\s*\d[\d .,]*)|(?:\b\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?\b)|(?:\b\d{3,}[.,]\d{2}\b)|(?:\b\d[\d .,]*\s+soles\b)/giu;
/** Teléfonos del aviso legal («915 248 103»), nunca una remuneración. */
const PHONE_NUMBER = /\b\d{3}\s\d{3}\s\d{3}\b/gu;

function withoutPhones(text: string): string {
  return text.replace(PHONE_NUMBER, ' ');
}

function unitHasAmount(text: string): boolean {
  return UNIT_AMOUNT.test(withoutPhones(text));
}

function unitAmountsIn(text: string): string[] {
  return (withoutPhones(text).match(UNIT_AMOUNT_ALL) ?? []).map(
    canonicalAmount,
  );
}

/**
 * Convierte una fila Markdown en una unidad autoexplicativa. Solo se emplea
 * para decidir si se puede mostrar el fragmento entero, nunca para reescribir
 * su contenido ni para fabricar una cifra.
 */
function markdownSalaryUnits(text: string): string[] {
  const lines = text.replace(/\r/gu, '').split('\n');
  const units: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const header = lines[index]?.trim();
    const separator = lines[index + 1]?.trim();
    if (
      !header?.startsWith('|') ||
      !separator?.startsWith('|') ||
      !/^\|?\s*:?-{3,}/u.test(separator)
    )
      continue;
    const headers = header
      .split('|')
      .map((cell) => cell.trim())
      .filter(Boolean);
    index += 2;
    while (lines[index]?.trim().startsWith('|')) {
      const cells = lines[index]
        .split('|')
        .map((cell) => cell.trim())
        .filter(Boolean);
      if (cells.length === headers.length) {
        units.push(
          headers.map((name, cell) => `${name}: ${cells[cell]}`).join('; '),
        );
      }
      index += 1;
    }
    index -= 1;
  }
  return units;
}

function proseSalaryUnits(text: string): string[] {
  return text
    .replace(/\r/gu, '')
    .split(/\n+/u)
    .flatMap((line) => line.split(/(?<=[.!?])\s+/u))
    .map((unit) => unit.trim())
    .filter((unit) => unit && !unit.startsWith('|'));
}

function unitMatchesExpectedRole(
  normalizedUnit: string,
  roles: readonly string[],
  expectedRole: string | null,
): boolean {
  if (expectedRole === null) return roles.length <= 1;
  if (roles[0] !== expectedRole) return false;
  // «Auxiliar» puede ser administrativo, de servicios u otro cargo. Para
  // presentar una cifra como propia del auxiliar de educación, la evidencia
  // debe nombrar ese puesto completo en la misma unidad salarial.
  return (
    expectedRole !== 'auxiliar de educación' ||
    EDUCATION_AUXILIARY.test(normalizedUnit)
  );
}

/**
 * Sectores que el fragmento asocia positivamente con la misma afirmación de
 * remuneración y el cargo consultado. No usa el título: este puede nombrar un
 * cargo mientras la fila o la oración presenta el importe de otro.
 */
function salarySourceEvidence(
  source: RetrievedChunk,
  expectedRole: string | null,
): SalarySourceEvidence {
  const sectors = new Set<string>();
  const acceptedUnits: SalaryEvidenceUnit[] = [];
  const units = [
    ...proseSalaryUnits(source.chunkContent),
    ...markdownSalaryUnits(source.chunkContent),
  ];
  for (const unit of units) {
    const normalizedUnit = normalizeSpanishText(unit);
    const roles = salaryRoles(unit);
    const unitSectors = declaredSectorsIn(unit);
    if (
      !GENERAL_SALARY_TERM.test(normalizedUnit) ||
      NEGATED_SALARY_UNIT.test(
        normalizedUnit.replace(PROGRAM_NO_ESCOLARIZADO, 'escolarizado'),
      ) ||
      // Una oración o fila que nombra más de un cargo o sector no permite
      // asociar la cifra sin reinterpretarla. Se omite hasta que el RAG
      // recupere una unidad inequívoca para ese cargo y sector.
      roles.length > 1 ||
      unitSectors.length > 1 ||
      !unitMatchesExpectedRole(normalizedUnit, roles, expectedRole)
    )
      continue;
    acceptedUnits.push({ sectors: unitSectors, text: unit });
    unitSectors.forEach((sector) => sectors.add(sector));
  }
  return { sectors: [...sectors], units: acceptedUnits };
}

function visibleUnitsFor(
  evidence: SalarySourceEvidence,
  requestedSectors: readonly string[],
  explicitSector: boolean,
): SalaryEvidenceUnit[] {
  return evidence.units.filter((unit) =>
    explicitSector
      ? unit.sectors.some((sector) => requestedSectors.includes(sector))
      : unit.sectors.length === 0 ||
        unit.sectors.some((sector) => requestedSectors.includes(sector)),
  );
}

/**
 * Una cifra solo habilita una respuesta de «cuánto gana» cuando pertenece a
 * la cláusula de remuneración general. Los beneficios adicionales pueden
 * figurar junto al sueldo en el mismo fragmento, pero no lo sustituyen.
 */
function hasVerifiedGeneralSalaryAmount(unit: string): boolean {
  const normalizedUnit = normalizeSpanishText(unit);
  if (SPECIAL_BENEFIT_TERM.test(normalizedUnit)) return false;
  return unit.split(/[;\n]/u).some((clause) => {
    const normalizedClause = normalizeSpanishText(clause);
    return GENERAL_SALARY_TERM.test(normalizedClause) && unitHasAmount(clause);
  });
}

/**
 * Una unidad sin cifra propia puede citarse como panorama aunque hable de
 * asignaciones: no se muestra ningún monto. Una unidad que sí trae una cifra
 * solo se cita si esa cifra es la remuneración general; de lo contrario el
 * lector vería un bono como si fuera el sueldo.
 */
function isQuotableUnit(unit: string): boolean {
  return !unitHasAmount(unit) || hasVerifiedGeneralSalaryAmount(unit);
}

function verifiedAmountsIn(evidence: SalarySourceEvidence): string[] {
  return [
    ...new Set(
      evidence.units
        .filter((unit) => hasVerifiedGeneralSalaryAmount(unit.text))
        .flatMap((unit) => unitAmountsIn(unit.text)),
    ),
  ].sort();
}

/**
 * Cifra que encabeza una fuente: el monto único de su tabla si la tiene; si
 * no, todos los importes verificables. Sirve para distinguir dos normas del
 * mismo año que discrepan en el monto principal, sin que una excepción vecina
 * con otro importe las haga parecer contradictorias.
 */
function headlineAmounts(evidence: SalarySourceEvidence): string[] {
  for (const unit of evidence.units) {
    const schedule = scheduleFor(unit.text);
    if (!schedule) continue;
    const amounts = [
      ...new Set(schedule.rows.map((row) => canonicalAmount(row.amount))),
    ];
    if (amounts.length === 1) return amounts;
  }
  return verifiedAmountsIn(evidence);
}

function sameSectorScope(
  left: SalarySourceEvidence,
  right: SalarySourceEvidence,
): boolean {
  return (
    [...left.sectors].sort().join('|') === [...right.sectors].sort().join('|')
  );
}

/**
 * Una consulta salarial general suele recuperar varias normas sucesivas con
 * importes distintos. Mostrarlas todas como si fueran la misma respuesta es lo
 * que producía cifras contradictorias en pantalla. Se conserva la más reciente
 * por sector; una norma anterior del mismo alcance solo permanece cuando la
 * persona pidió un período histórico o cuando el año es indistinguible, para
 * no elegir en silencio entre dos cifras vigentes.
 */
function pruneOlderSalarySources(
  selected: SalaryCandidate[],
  keepHistory: boolean,
): SalaryCandidate[] {
  if (keepHistory) return selected;
  const kept: SalaryCandidate[] = [];
  for (const candidate of selected) {
    const duplicateOlder = kept.some((current) => {
      if (
        !verifiedAmountsIn(current.evidence).length ||
        !verifiedAmountsIn(candidate.evidence).length ||
        !sameSectorScope(current.evidence, candidate.evidence)
      )
        return false;
      const currentYear = current.source.issuanceYear ?? 0;
      const candidateYear = candidate.source.issuanceYear ?? 0;
      // Sin año no se puede afirmar que una norma sea anterior: se conserva.
      if (!currentYear || !candidateYear) return false;
      if (candidateYear < currentYear) return true;
      if (candidateYear > currentYear) return false;
      return (
        verifiedAmountsIn(current.evidence).join('|') ===
        verifiedAmountsIn(candidate.evidence).join('|')
      );
    });
    if (!duplicateOlder) kept.push(candidate);
  }
  return kept;
}

function escapeCell(value: string): string {
  return value.replace(/\|/gu, '\\|').replace(/\s+/gu, ' ').trim();
}

/**
 * Artefacto de extracción del PDF: el símbolo de grado de «N.°» llega como
 * «%», «*», «?» o comilla. Solo se corrige esa marca junto al número de norma;
 * el resto del texto citado se conserva, salvo la cabecera repetida del PDF que
 * se explica abajo.
 */
function readableExtract(text: string): string {
  const cleaned = text
    .replace(/\bN\s*[%*?¿"“”]\s*(?=\d{2,})/gu, 'N.° ')
    .replace(/\s+/gu, ' ')
    .trim();
  // Un fragmento que empieza con la cabecera del documento («Norma Técnica
  // Código … Página 17 de 41 6.2.6 …») gana legibilidad si arranca en la
  // página: la cabecera ya está en la ficha de la fuente. Se conserva la
  // referencia de página para que la interfaz la enlace.
  if (
    !/^(?:norma\s+t[eé]cnica|c[oó]digo|norma\s+que\s+regula)/iu.test(cleaned)
  ) {
    return cleaned;
  }
  const page = /\b(P[aá]gina\s+\d+\s+de\s+\d+)\b/iu.exec(cleaned);
  if (!page || (page.index ?? 0) > 500) return cleaned;
  const rest = cleaned
    .slice((page.index ?? 0) + page[0].length)
    .replace(/^[\s·:–—-]+/u, '')
    .trim();
  // Solo se recorta si después de la página queda una cláusula numerada
  // («6.2.6 …»). Un pie de página al final o una referencia cruzada no deben
  // borrar el contenido que se quiere citar.
  if (rest.length < 20 || !/^\d+(?:\.\d+)*\b/u.test(rest)) return cleaned;
  return `${page[1]} · ${rest}`;
}

/**
 * Tabla de la escala tal como consta en la fuente. Las filas conservan la
 * modalidad, el nivel, la jornada y el importe; no se completa ninguna celda ni
 * se reordena el contenido. La columna «Cita» mantiene la fuente en cada fila;
 * con una sola fuente la interfaz la retira de la vista y deja la referencia
 * una vez bajo la tabla.
 */
function renderSchedule(schedule: SalarySchedule, rank: number): string {
  return [
    '| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual | Cita |',
    '| --- | --- | --- | --- | --- |',
    ...schedule.rows.map(
      (row) =>
        `| ${escapeCell(row.modality)} | ${escapeCell(row.level)} | ${row.hours} horas | ${escapeCell(row.amount)} | [${rank}] |`,
    ),
  ].join('\n');
}

/**
 * Forma del cargo que la propia unidad declara. No toma un vínculo que no
 * figure en la misma unidad: «profesor» y «profesor contratado» no son
 * equivalentes para la remuneración.
 */
function rolePhrase(role: string | null, unitText: string): string | null {
  const text = normalizeSpanishText(unitText);
  const noun =
    role === 'auxiliar de educación' || EDUCATION_AUXILIARY.test(text)
      ? 'auxiliar de educación'
      : /\bprofesor(?:a|as|es)?\b/u.test(text)
        ? 'profesor'
        : /\bdocente(?:s)?\b/u.test(text)
          ? 'docente'
          : /\b(?:director|directora|directores|directoras|directivos?)\b/u.test(
                text,
              )
            ? 'directivo'
            : role;
  if (noun === null) return null;
  const mentionsNombrado = /\bnombrad[oa]s?\b/u.test(text);
  const mentionsContratado = /\bcontratad[oa]s?\b/u.test(text);
  const condition =
    mentionsNombrado !== mentionsContratado
      ? mentionsContratado
        ? 'contratado'
        : 'nombrado'
      : null;
  return condition ? `${noun} ${condition}` : noun;
}

function displaySector(sector: string): string {
  return sector === 'publico'
    ? 'público'
    : sector === 'privado'
      ? 'privado'
      : sector;
}

function sectorPhrase(sectors: readonly string[]): string {
  return sectors.length === 1 && sectors[0]
    ? ` del sector ${displaySector(sectors[0])}`
    : '';
}

function scheduleIntro(
  schedule: SalarySchedule,
  role: string | null,
  unitText: string,
  rank: number,
  sectors: readonly string[],
  year: number | null,
): string {
  const phrase = rolePhrase(role, unitText);
  const lead = year === null ? 'La' : `En ${year}, la`;
  const subject = phrase
    ? `${lead} remuneración mensual del ${phrase}${sectorPhrase(sectors)}`
    : `${lead} remuneración mensual que figura en la tabla`;
  const amounts = new Set(schedule.rows.map((row) => row.amount));
  const hours = new Set(schedule.rows.map((row) => row.hours));
  const [amount] = [...amounts];
  const [onlyHours] = [...hours];
  return amounts.size === 1 && hours.size === 1
    ? `${subject} es ${amount} para una jornada de ${onlyHours} horas. [${rank}]`
    : `${subject}, según la tabla del documento, es la siguiente. [${rank}]`;
}

/**
 * Condición que sigue a la tabla en la misma unidad («proporcional a las horas
 * contratadas»). Se cita literalmente y solo cuando no introduce una segunda
 * cifra que competiría con la de la tabla.
 */
function scheduleNote(schedule: SalarySchedule): string | null {
  const note = schedule.remaining.trim();
  if (
    note.length < 20 ||
    note.length > MAX_NOTE_CHARS ||
    unitHasAmount(note) ||
    !PAY_CONDITION.test(normalizeSpanishText(note))
  ) {
    return null;
  }
  return note;
}

function unitSection(
  units: readonly SalaryEvidenceUnit[],
  rank: number,
  heading: string,
): string {
  return textSection(
    units.map((unit) => unit.text),
    rank,
    heading,
  );
}

function textSection(
  texts: readonly string[],
  rank: number,
  heading: string,
): string {
  return `${heading}\n${texts
    .map((text) => `- ${readableExtract(text)} [${rank}]`)
    .join('\n')}`;
}

function scheduleFor(unit: string): SalarySchedule | null {
  if (!hasVerifiedGeneralSalaryAmount(unit)) return null;
  return parseSalarySchedule(unit);
}

function noAmountUnits(
  units: readonly SalaryEvidenceUnit[],
): SalaryEvidenceUnit[] {
  const ranked = units
    .map((unit) => {
      const normalized = normalizeSpanishText(unit.text);
      const score =
        (NORM_REFERENCE.test(normalized) ? 2 : 0) +
        (REGULATION_VERB.test(normalized) ? 1 : 0) +
        (unit.text.length >= 80 ? 1 : 0);
      return { score, unit };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.unit.text.length - left.unit.text.length,
    );
  const preferred = ranked.filter(({ score }) => score > 0);
  return (preferred.length ? preferred : ranked)
    .slice(0, 2)
    .map(({ unit }) => unit);
}

function scheduleSummary(
  schedule: SalarySchedule,
  role: string | null,
  unitText: string,
  rank: number,
  sectors: readonly string[],
  year: number | null,
  primaryYear: number | null,
  conflict: boolean,
): string | null {
  const amounts = new Set(schedule.rows.map((row) => row.amount));
  const hours = new Set(schedule.rows.map((row) => row.hours));
  const [amount] = [...amounts];
  const [onlyHours] = [...hours];
  if (amounts.size !== 1 || hours.size !== 1) return null;
  const phrase = rolePhrase(role, unitText);
  const subject = `${phrase ? ` del ${phrase}` : ''}${sectorPhrase(sectors)}`;
  const yearLabel = year !== null && year !== primaryYear ? ` de ${year}` : '';
  return conflict
    ? `Otra fuente del mismo año registra un monto distinto: ${amount} para una jornada de ${onlyHours} horas${subject}. [${rank}]`
    : `Otra fuente${yearLabel} también registra ${amount} para una jornada de ${onlyHours} horas${subject}. [${rank}]`;
}

/**
 * Condiciones que acompañan a la tabla y que no repiten sus montos: el pago
 * proporcional y las excepciones con otro importe (por ejemplo, el profesor
 * coordinador). Se citan literalmente para no afirmar que la tabla agota todas
 * las condiciones de la fuente.
 */
function additionalConditions(
  units: readonly SalaryEvidenceUnit[],
  anchorText: string,
  schedule: SalarySchedule,
): string[] {
  const tableAmounts = new Set(
    schedule.rows.map((row) => canonicalAmount(row.amount)),
  );
  const conditions: string[] = [];
  for (const unit of units) {
    if (unit.text === anchorText) continue;
    if (unit.text.trim().length < 20 || unit.text.length > MAX_NOTE_CHARS)
      continue;
    if (unitHasAmount(unit.text)) {
      if (!hasVerifiedGeneralSalaryAmount(unit.text)) continue;
      const amounts = unitAmountsIn(unit.text);
      if (amounts.every((amount) => tableAmounts.has(amount))) continue;
      conditions.push(unit.text);
    } else if (PAY_CONDITION.test(normalizeSpanishText(unit.text))) {
      conditions.push(unit.text);
    }
    if (conditions.length === 2) break;
  }
  return conditions;
}

function hasAnswerableAmount(units: readonly SalaryEvidenceUnit[]): boolean {
  return units.some(
    (unit) =>
      scheduleFor(unit.text) !== null ||
      hasVerifiedGeneralSalaryAmount(unit.text),
  );
}

const FIRST_SCALE_RIM_REFERENCE =
  /\bremuneracion\s+integra\s+mensual(?:\s*\(?rim\)?)?.{0,120}\bprimera\s+escala\s+magisterial\b/u;

function asksNamedContractComparison(question: string): boolean {
  const text = normalizeSpanishText(question);
  return (
    /\bnombrad[oa]s?\b/u.test(text) &&
    /\bcontratad[oa]s?\b/u.test(text) &&
    /\b(?:diferencia|compar|versus|vs\.?|entre)\b/u.test(text)
  );
}

function isAscensoQuestion(question: string): boolean {
  return /\b(?:ascenso|ascensos|ascend(?:er|ido|iendo)|asciend[oa])\b/u.test(
    normalizeSpanishText(question),
  );
}

function ascensoPlanillaAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
): ExtractiveSalaryAnswer | null {
  if (!isAscensoQuestion(question)) return null;
  const source = sources.find((candidate) => {
    const text = normalizeSpanishText(candidate.chunkContent);
    return (
      /\bascenso\s+de\s+escala(?:\s+magisterial)?\b/u.test(text) &&
      /\bacto(?:s)?\s+resolutiv(?:os|o|as|a)\b/u.test(text) &&
      /\b(?:pago|descuento)\b/u.test(text)
    );
  });
  if (!source) return null;
  return {
    answer:
      'La fuente de planillas incluye el ascenso de escala magisterial entre las situaciones administrativas de los actos resolutivos que derivan en pago o descuento. [1] Los documentos entregados no precisan un pago automático, un nuevo monto ni una fecha de implementación para cada caso.',
    hasVerifiedAmount: false,
    sources: [source],
  };
}

function asksPadronRural(question: string): boolean {
  return isRuralPadronQuestion(question);
}

function asksRuralAllocation(question: string): boolean {
  return isRuralAllocationQuestion(question);
}

function ruralAllocationAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
): ExtractiveSalaryAnswer | null {
  if (!asksRuralAllocation(question)) return null;
  const source = sources.find(isRuralAllocationEvidence);
  if (!source) return null;
  const year = source.issuanceYear;
  const datedScope =
    typeof year === 'number' ? ` La fuente es del año ${year}.` : '';
  return {
    answer:
      'La fuente recuperada regula una asignación por trabajo en ámbito rural. [1]' +
      datedScope +
      ' Los documentos entregados no incluyen una regla actual que permita confirmar el monto aplicable hoy.',
    hasVerifiedAmount: false,
    sources: [source],
  };
}

function padronRuralAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
): ExtractiveSalaryAnswer | null {
  if (!asksPadronRural(question)) return null;
  const source = sources.find(isRuralPadronEvidence);
  if (!source) return null;
  const year = source.issuanceYear;
  return {
    answer:
      typeof year === 'number'
        ? `La evidencia recuperada contiene un padrón de instituciones educativas del año ${year}. [1] No incluye un padrón posterior ni un mecanismo para confirmar la inclusión actual de una institución, por lo que no permite determinar tu caso hoy.`
        : 'La evidencia recuperada contiene un padrón de instituciones educativas. [1] No incluye un padrón posterior ni un mecanismo para confirmar la inclusión actual de una institución, por lo que no permite determinar tu caso hoy.',
    hasVerifiedAmount: false,
    sources: [source],
  };
}

function asksPayrollReview(question: string): boolean {
  return isPayrollReviewQuestion(question);
}

function payrollReviewAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
): ExtractiveSalaryAnswer | null {
  if (!asksPayrollReview(question)) return null;
  const deductions = sources.find((candidate) => {
    const text = normalizeSpanishText(candidate.chunkContent);
    return (
      /\b(?:deduccion|descuento)\b/u.test(text) && /\bplanilla\b/u.test(text)
    );
  });
  const responsibility = sources.find((candidate) => {
    const text = normalizeSpanishText(candidate.chunkContent);
    return (
      /\boficina\s+de\s+personal\b/u.test(text) &&
      /\bacto(?:s)?\s+administrativ/u.test(text) &&
      /\b(?:pago|descuento)\b/u.test(text)
    );
  });
  const used = [deductions, responsibility].filter(
    (source): source is RetrievedChunk => Boolean(source),
  );
  if (!used.length) return null;
  const deductionCitation = deductions ? used.indexOf(deductions) + 1 : null;
  const responsibilityCitation = responsibility
    ? used.indexOf(responsibility) + 1
    : null;
  const facts = [
    deductionCitation
      ? `La fuente regula que las deducciones en planilla se aplican con prelación y límites según el tipo de descuento. [${deductionCitation}]`
      : null,
    responsibilityCitation
      ? `También atribuye a la Oficina de Personal la emisión oportuna de actos administrativos que derivan en pago o descuento. [${responsibilityCitation}]`
      : null,
    'Los documentos entregados no establecen un canal, plazo ni recurso personal para presentar un reclamo por una diferencia remunerativa; no puedo inventar ese procedimiento.',
  ].filter((fact): fact is string => Boolean(fact));
  return {
    answer: facts.join(' '),
    hasVerifiedAmount: false,
    sources: used,
  };
}

function newestFirstScaleReference(
  sources: readonly RetrievedChunk[],
): RetrievedChunk | null {
  const articles = sources.filter((source) =>
    FIRST_SCALE_RIM_REFERENCE.test(normalizeSpanishText(source.chunkContent)),
  );
  if (!articles.length) return null;
  const newestYear = Math.max(
    ...articles.map((source) => source.issuanceYear ?? 0),
  );
  return (
    articles
      .filter((source) => (source.issuanceYear ?? 0) === newestYear)
      .sort((left, right) => {
        const leftHasArticle = /\barticulo\s+1\b/iu.test(
          normalizeSpanishText(left.chunkContent),
        );
        const rightHasArticle = /\barticulo\s+1\b/iu.test(
          normalizeSpanishText(right.chunkContent),
        );
        return Number(rightHasArticle) - Number(leftHasArticle);
      })[0] ?? null
  );
}

function centsIn(canonical: string): number | null {
  const [integer, decimals = ''] = canonical.split('.');
  if (!/^\d+$/u.test(integer) || !/^\d{0,2}$/u.test(decimals)) return null;
  const cents = Number(integer) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

function formatSoles(cents: number): string {
  const integer = String(Math.trunc(cents / 100)).replace(
    /\B(?=(\d{3})+(?!\d))/gu,
    ' ',
  );
  return `S/ ${integer},${String(cents % 100).padStart(2, '0')}`;
}

const SECOND_ARTICLE = /\barticulo\s+2\b/u;
const HOURLY_RIM_TERM =
  /\brim\b[\s\S]{0,80}\bpor\s+hora(?:\s+de\s+trabajo)?\b|\bpor\s+hora(?:\s+de\s+trabajo)?[\s\S]{0,80}\brim\b/u;

function amountMatchesIn(text: string): RegExpMatchArray[] {
  return [
    ...withoutPhones(text).matchAll(new RegExp(UNIT_AMOUNT.source, 'giu')),
  ];
}

/**
 * Un importe solo puede usarse como RIM horaria si está en el mismo tramo que
 * declara la RIM por hora. Se corta antes del artículo 2 para que la tabla de
 * contratados nunca se multiplique como si fuera la primera escala.
 */
function firstScaleHourlyAmountIn(text: string): string | null {
  const secondArticleIndex = normalizeSpanishText(text).search(SECOND_ARTICLE);
  const firstArticleScope =
    secondArticleIndex >= 0 ? text.slice(0, secondArticleIndex) : text;
  for (const match of amountMatchesIn(firstArticleScope)) {
    const index = match.index ?? 0;
    const context = normalizeSpanishText(
      firstArticleScope.slice(Math.max(0, index - 220), index + 220),
    );
    if (HOURLY_RIM_TERM.test(context)) return canonicalAmount(match[0]);
  }
  return null;
}

/**
 * La extracción de un PDF puede partir la última oración del artículo 1 entre
 * dos fragmentos. Solo se une cuando el segundo continúa en la misma o la
 * página siguiente, el importe queda antes del artículo 2 y su propia oración
 * de cierre dice que se fija "en la suma de". Así no se toma una fila de la
 * tabla de contratados como RIM horaria.
 */
function splitFirstScaleHourlyAmountIn(
  article: RetrievedChunk,
  candidate: RetrievedChunk,
): string | null {
  if (
    article.documentVersionId !== candidate.documentVersionId ||
    candidate.pageStart < article.pageStart ||
    candidate.pageStart > article.pageEnd + 1
  ) {
    return null;
  }
  const normalized = normalizeSpanishText(candidate.chunkContent);
  const secondArticleIndex = normalized.search(SECOND_ARTICLE);
  if (secondArticleIndex < 0) return null;
  const scope = candidate.chunkContent.slice(0, secondArticleIndex);
  for (const match of amountMatchesIn(scope)) {
    const index = match.index ?? 0;
    const before = normalizeSpanishText(
      scope.slice(Math.max(0, index - 100), index),
    );
    if (
      /\b(?:en\s+la\s+suma\s+de|asciende\s+a|equivale\s+a)\s*$/u.test(before)
    ) {
      return canonicalAmount(match[0]);
    }
  }
  return null;
}

/** La fila de contratado es útil para comparar únicamente si declara 30 horas. */
function contractAmountForThirtyHoursIn(text: string): string | null {
  const normalized = normalizeSpanishText(text);
  const secondArticleIndex = normalized.search(SECOND_ARTICLE);
  if (secondArticleIndex < 0) return null;
  const contractScope = text.slice(secondArticleIndex);
  const normalizedScope = normalizeSpanishText(contractScope);
  if (!/\bprofesor\s+contratado\b/u.test(normalizedScope)) return null;
  const hasJornadaHeader = /\bjornada\s+laboral\b/u.test(normalizedScope);
  if (!hasJornadaHeader) return null;
  for (const match of amountMatchesIn(contractScope)) {
    const index = match.index ?? 0;
    const context = normalizeSpanishText(
      contractScope.slice(Math.max(0, index - 120), index + 120),
    );
    if (/\b30(?:\s+horas?)?\b/u.test(context)) {
      return canonicalAmount(match[0]);
    }
  }
  return null;
}

/**
 * La RIM de primera escala puede llegar partida entre el artículo que declara
 * su alcance y el fragmento siguiente que contiene el valor por hora. Si la
 * persona indica una jornada, se muestra el cálculo aritmético comprobable
 * entre ambos fragmentos; no se extrapola a otras escalas ni a contratados.
 */
function firstScaleRimAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
): ExtractiveSalaryAnswer | null {
  const profile = salaryQuestionProfile(question);
  if (
    profile.condition !== 'nombrado' ||
    profile.role !== 'docente' ||
    profile.scale !== '1' ||
    profile.jornadaHours === null
  ) {
    return null;
  }
  const article = newestFirstScaleReference(sources);
  if (!article) return null;
  const directAmountEvidence = sources
    .filter((source) => source.documentVersionId === article.documentVersionId)
    .map((source) => ({
      amount: firstScaleHourlyAmountIn(source.chunkContent),
      source,
    }))
    .find((candidate) => centsIn(candidate.amount ?? '') !== null);
  const splitAmountEvidence = directAmountEvidence
    ? null
    : sources
        .filter(
          (source) => source.documentVersionId === article.documentVersionId,
        )
        .map((source) => ({
          amount: splitFirstScaleHourlyAmountIn(article, source),
          source,
        }))
        .find((candidate) => centsIn(candidate.amount ?? '') !== null);
  const amountEvidence = directAmountEvidence ?? splitAmountEvidence;
  const amountSource = amountEvidence?.source;
  const hourlyCents = centsIn(amountEvidence?.amount ?? '');
  if (!amountSource || hourlyCents === null) return null;
  const total = hourlyCents * profile.jornadaHours;
  if (!Number.isSafeInteger(total)) return null;
  const sourcesForAnswer =
    article.chunkId === amountSource.chunkId
      ? [article]
      : [article, amountSource];
  const citations = sourcesForAnswer
    .map((_, index) => `[${index + 1}]`)
    .join('');
  return {
    answer: `La RIM por hora de la primera escala magisterial es ${formatSoles(hourlyCents)}. Para la jornada indicada de ${profile.jornadaHours} horas, el cálculo es ${formatSoles(total)} (${formatSoles(hourlyCents)} × ${profile.jornadaHours}). ${citations}`,
    hasVerifiedAmount: true,
    sources: sourcesForAnswer,
  };
}

/**
 * Contrasta los dos regímenes solo cuando una misma evidencia recuperada
 * identifica la RIM de la primera escala y la regla del contratado. No
 * extiende la primera escala a todas las personas nombradas ni la tabla de
 * contratados a otro vínculo.
 */
function namedContractComparisonAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
): ExtractiveSalaryAnswer | null {
  if (!asksNamedContractComparison(question)) return null;
  if (salaryQuestionProfile(question).role !== 'docente') return null;
  const namedReference = newestFirstScaleReference(sources);
  if (!namedReference) return null;
  const sameVersion = sources.filter(
    (source) => source.documentVersionId === namedReference.documentVersionId,
  );
  const directAmountEvidence = sameVersion
    .map((source) => ({
      amount: firstScaleHourlyAmountIn(source.chunkContent),
      source,
    }))
    .find((candidate) => candidate.amount !== null);
  const splitAmountEvidence = directAmountEvidence
    ? null
    : sameVersion
        .map((source) => ({
          amount: splitFirstScaleHourlyAmountIn(namedReference, source),
          source,
        }))
        .find((candidate) => candidate.amount !== null);
  const amountEvidence = directAmountEvidence ?? splitAmountEvidence;
  const contractEvidence = sameVersion
    .map((source) => ({
      amount: contractAmountForThirtyHoursIn(source.chunkContent),
      source,
    }))
    .find((candidate) => candidate.amount !== null);
  const amountSource = amountEvidence?.source;
  const contractSource = contractEvidence?.source;
  const hourlyAmount = amountEvidence?.amount;
  const monthlyAmount = contractEvidence?.amount;
  if (!amountSource || !contractSource || !hourlyAmount || !monthlyAmount) {
    return null;
  }
  const printableAmount = (amount: string) => {
    const cents = centsIn(amount);
    return cents === null ? amount : formatSoles(cents);
  };
  const answerSources = [namedReference];
  if (amountSource.chunkId !== namedReference.chunkId)
    answerSources.push(amountSource);
  if (
    !answerSources.some((source) => source.chunkId === contractSource.chunkId)
  ) {
    answerSources.push(contractSource);
  }
  const namedCitation = answerSources.indexOf(namedReference) + 1;
  const amountCitation = answerSources.indexOf(amountSource) + 1;
  return {
    answer: `La diferencia documentada es el régimen de cálculo: para un docente nombrado, la fuente fija la RIM por hora de la primera escala magisterial en ${printableAmount(hourlyAmount)}. [${namedCitation}][${amountCitation}] Para un profesor contratado, fija una remuneración mensual según la jornada, modalidad, forma, nivel o ciclo. En la fila recuperada de 30 horas, la tabla muestra ${printableAmount(monthlyAmount)}. [${answerSources.indexOf(contractSource) + 1}] Esa fila no determina por sí sola el monto de una persona con otra jornada.`,
    hasVerifiedAmount: true,
    sources: answerSources,
  };
}

/**
 * Una fuente adicional solo aporta una frase verificable: si trae una escala,
 * se resume su único monto y jornada; si trae una escala con varios montos, se
 * declara sin reproducir cifras que competirían con la tabla principal. Nunca
 * se vuelca el fragmento completo, que era el volcado que veía la persona.
 */
function renderExtraSource(
  units: readonly SalaryEvidenceUnit[],
  rank: number,
  expectedRole: string | null,
  conflict: boolean,
  year: number | null,
  primaryYear: number | null,
): { sectors: string[]; text: string } | null {
  const scheduleEntry = units
    .map((unit) => ({ schedule: scheduleFor(unit.text), unit }))
    .find((entry) => entry.schedule !== null);
  if (scheduleEntry?.schedule) {
    const summary =
      scheduleSummary(
        scheduleEntry.schedule,
        expectedRole ?? salaryRoles(scheduleEntry.unit.text)[0] ?? null,
        scheduleEntry.unit.text,
        rank,
        scheduleEntry.unit.sectors,
        year,
        primaryYear,
        conflict,
      ) ??
      `Otra fuente contiene una escala de remuneración que no se puede resumir en un solo monto y jornada. [${rank}]`;
    return {
      sectors: scheduleEntry.unit.sectors,
      text: `- ${summary}`,
    };
  }
  const verifiedUnit = units.find(
    ({ text }) =>
      text.trim().length <= MAX_NOTE_CHARS &&
      !text.includes('|') &&
      hasVerifiedGeneralSalaryAmount(text),
  );
  if (verifiedUnit) {
    return {
      sectors: verifiedUnit.sectors,
      text: `- ${readableExtract(verifiedUnit.text)} [${rank}]`,
    };
  }
  // Sin cifra, solo se añade una unidad que hable de la norma, de una
  // condición de pago o de la regla de remuneración; nunca un aviso o un
  // fragmento de trámite.
  const noAmount = noAmountUnits(units).find((unit) => {
    if (unitHasAmount(unit.text)) return false;
    const normalized = normalizeSpanishText(unit.text);
    return (
      NORM_REFERENCE.test(normalized) ||
      PAY_CONDITION.test(normalized) ||
      REGULATION_VERB.test(normalized)
    );
  });
  return noAmount &&
    noAmount.text.trim().length <= MAX_NOTE_CHARS &&
    !noAmount.text.includes('|')
    ? {
        sectors: noAmount.sectors,
        text: `- ${readableExtract(noAmount.text)} [${rank}]`,
      }
    : null;
}

function renderCandidates(
  candidates: readonly SalaryCandidate[],
  requestedSectors: readonly string[],
  explicitSector: boolean,
  expectedRole: string | null,
  year: number | null,
): ExtractiveSalaryAnswer | null {
  const rendered = candidates
    .map((candidate) => ({
      candidate,
      units: visibleUnitsFor(
        candidate.evidence,
        requestedSectors,
        explicitSector,
      ).filter((unit) => isQuotableUnit(unit.text)),
    }))
    .filter(({ units }) => units.length > 0);
  if (!rendered.length) return null;

  // La respuesta que puede dar una cifra va primero. Una fuente que solo dice
  // «se rige por la normativa» no debe encabezar un «no encontré un monto» si
  // otra fuente recuperada sí trae la remuneración verificable.
  const answerableIndex = rendered.findIndex(({ units }) =>
    hasAnswerableAmount(units),
  );
  const primaryIndex = answerableIndex >= 0 ? answerableIndex : 0;
  const primary = rendered[primaryIndex];
  if (!primary) return null;
  const primaryRank = 1;
  const primaryAmounts = headlineAmounts(primary.candidate.evidence);
  const labelYear =
    year !== null && primary.candidate.source.issuanceYear === year
      ? year
      : null;

  const schedule = primary.units
    .map((unit) => ({ schedule: scheduleFor(unit.text), unit }))
    .find((entry) => entry.schedule !== null);
  const primaryUnits = schedule ? [schedule.unit] : primary.units;
  const verified =
    schedule !== undefined ||
    primaryUnits.some((unit) => hasVerifiedGeneralSalaryAmount(unit.text));
  // Una consulta de sector no se responde con una unidad que no declara el
  // sector ni con un panorama sin monto: se cierra sin evidencia.
  if (explicitSector && !verified) return null;

  const extras: Array<{
    sectors: string[];
    source: RetrievedChunk;
    text: string;
  }> = [];
  rendered.forEach(({ candidate, units }, index) => {
    if (index === primaryIndex) return;
    // Una fuente sin monto no añade nada cuando la principal ya respondió.
    if (verified && !hasAnswerableAmount(units)) return;
    const rank = extras.length + 2;
    const conflict =
      typeof candidate.source.issuanceYear === 'number' &&
      candidate.source.issuanceYear === primary.candidate.source.issuanceYear &&
      sameSectorScope(candidate.evidence, primary.candidate.evidence) &&
      headlineAmounts(candidate.evidence).join('|') !==
        primaryAmounts.join('|');
    const renderedExtra = renderExtraSource(
      units,
      rank,
      expectedRole,
      conflict,
      candidate.source.issuanceYear ?? null,
      primary.candidate.source.issuanceYear ?? null,
    );
    if (renderedExtra) {
      extras.push({
        sectors: renderedExtra.sectors,
        source: candidate.source,
        text: renderedExtra.text,
      });
    }
  });

  let body: string;
  if (schedule?.schedule) {
    const table = renderSchedule(schedule.schedule, primaryRank);
    const intro = scheduleIntro(
      schedule.schedule,
      expectedRole ?? salaryRoles(schedule.unit.text)[0] ?? null,
      schedule.unit.text,
      primaryRank,
      schedule.unit.sectors,
      labelYear,
    );
    const note = scheduleNote(schedule.schedule);
    const conditions = additionalConditions(
      primary.units,
      schedule.unit.text,
      schedule.schedule,
    );
    body = [
      intro,
      table,
      note
        ? `Condición de pago: ${readableExtract(note)} [${primaryRank}]`
        : null,
      conditions.length
        ? textSection(
            conditions,
            primaryRank,
            'Otras condiciones que constan en la misma fuente:',
          )
        : null,
    ]
      .filter((part): part is string => part !== null)
      .join('\n\n');
  } else if (verified) {
    body =
      primaryUnits.length === 1
        ? `${readableExtract(primaryUnits[0]?.text ?? '')} [${primaryRank}]`
        : unitSection(primaryUnits, primaryRank, 'Esto es lo que encontré:');
  } else {
    const intro = `Todavía no tengo el monto exacto${
      expectedRole === null ? ' para ese cargo' : ` del ${expectedRole}`
    } en los documentos disponibles.`;
    const panorama = noAmountUnits(
      primaryUnits.filter((unit) =>
        SALARY_RULE.test(normalizeSpanishText(unit.text)),
      ),
    );
    body = panorama.length
      ? unitSection(
          panorama,
          primaryRank,
          `${intro} Esto es lo que sí encontré:`,
        )
      : `${intro} [${primaryRank}]`;
  }

  const displayedSectors = [
    ...(schedule
      ? schedule.unit.sectors
      : primary.units.flatMap((unit) => unit.sectors)),
    ...extras.flatMap(({ sectors }) => sectors),
  ];
  // El aviso de sector ausente solo tiene sentido si la persona preguntó por
  // ese sector. En una pregunta general no se menciona un sector que no pidió.
  const missingSectors =
    explicitSector && displayedSectors.length
      ? requestedSectors.filter((sector) => !displayedSectors.includes(sector))
      : [];
  const missingMessage = missingSectors.length
    ? `\n\nNo tengo un monto para el sector ${missingSectors
        .map(displaySector)
        .join(' y ')} en los documentos disponibles.`
    : '';

  const fullAnswer = `${[body, ...extras.map(({ text }) => text)].join('\n\n')}${missingMessage}`;
  // El contrato de persistencia acepta hasta 20 000 caracteres; una tabla
  // Markdown ancha puede expandirse por encima del fragmento original. Se
  // degrada con la misma nota que usa el resto del chat en vez de fallar.
  const note = `\n\n${RAG_TRUNCATION_NOTE}`;
  const answer =
    fullAnswer.length <= MAX_RAG_ANSWER_CHARS
      ? fullAnswer
      : `${fullAnswer.slice(0, MAX_RAG_ANSWER_CHARS - note.length)}${note}`;

  return {
    answer,
    hasVerifiedAmount: verified,
    sources: [primary.candidate.source, ...extras.map(({ source }) => source)],
  };
}

/**
 * Evita que el modelo reformule un importe salarial. Cada afirmación mostrada
 * proviene de las oraciones o filas recuperadas que superan la comprobación de
 * cargo y sector, y la cita se añade en el servidor. La respuesta se presenta
 * como tabla cuando la fuente conserva la escala completa; si no, se citan las
 * unidades verificables y se declara expresamente cuando falta el monto. Un
 * fragmento que ya contiene una cita no se reutiliza porque la interfaz podría
 * interpretarla como una fuente distinta.
 */
export function buildExtractiveSalaryAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
  scope: RetrievalScope,
): ExtractiveSalaryAnswer | null {
  const profile = salaryQuestionProfile(question);
  const ruralAllocation = ruralAllocationAnswer(sources, question);
  if (ruralAllocation) return ruralAllocation;
  const padron = padronRuralAnswer(sources, question);
  if (padron) return padron;
  const payroll = payrollReviewAnswer(sources, question);
  if (payroll) return payroll;
  const ascenso = ascensoPlanillaAnswer(sources, question);
  if (ascenso) return ascenso;
  // Una asignación específica, el efecto administrativo de un ascenso o la
  // revisión de una boleta no piden el sueldo general. Si una tabla salarial
  // aparece por vecindad semántica, debe responder el modelo solo con la
  // evidencia del concepto solicitado y no sustituirlo por esa tabla.
  if (profile.asksSpecialAllocation || isAscensoQuestion(question)) {
    return null;
  }
  const comparison = namedContractComparisonAnswer(sources, question);
  if (comparison) return comparison;
  if (
    profile.condition === 'nombrado' &&
    profile.scale === '1' &&
    profile.jornadaHours !== null
  ) {
    return firstScaleRimAnswer(sources, question);
  }
  const explicitSectors = salarySectors(question);
  const requestedSectors =
    explicitSectors.length > 0 ? explicitSectors : [...PANORAMA_SECTORS];
  const expectedRole = profile.role;
  const candidates: SalaryCandidate[] = sources
    .filter((source) => hasSalaryPanoramaEvidence([source], scope, question))
    .map((source) => ({
      evidence: salarySourceEvidence(source, expectedRole),
      source,
    }))
    .filter(({ evidence }) => {
      return (
        evidence.units.length > 0 &&
        (explicitSectors.length === 0 ||
          evidence.sectors.some((sector) => requestedSectors.includes(sector)))
      );
    })
    .filter(({ source }) => {
      const text = source.chunkContent.trim();
      return (
        text.length >= 30 &&
        text.length <= 4_000 &&
        !/\[\[?\s*\d+(?:\s*(?:[,;–-]|y)\s*\d+)*\s*\]\]?/u.test(text)
      );
    });

  // Una consulta con año explícito («¿cuánto ganaba en 2023?») se responde con
  // la norma de ese año cuando la recuperación la trae; nunca con la más nueva
  // como si fuera la del período pedido.
  const yearCandidates =
    profile.year === null
      ? candidates
      : candidates.filter(
          (candidate) => candidate.source.issuanceYear === profile.year,
        );
  // Si se pidió un año y la recuperación no trae esa norma, no se responde con
  // el monto de otro período.
  if (profile.year !== null && !yearCandidates.length) return null;
  const pool = yearCandidates.length ? yearCandidates : candidates;

  // Reserva un fragmento por cada sector antes de completar el tope con otras
  // fuentes. El orden de recuperación no puede decidir qué parte del panorama
  // se muestra.
  const selected: SalaryCandidate[] = [];
  for (const sector of requestedSectors) {
    const candidate = pool.find(
      ({ source, evidence }) =>
        evidence.sectors.includes(sector) &&
        !selected.some(
          (selectedSource) => selectedSource.source.chunkId === source.chunkId,
        ),
    );
    if (candidate) selected.push(candidate);
  }
  for (const candidate of pool) {
    if (selected.length >= 3) break;
    if (
      !selected.some(
        (selectedSource) =>
          selectedSource.source.chunkId === candidate.source.chunkId,
      )
    ) {
      selected.push(candidate);
    }
  }

  const keepHistory = scope !== 'current' || profile.year !== null;
  // En una consulta general o por sector, el año decide aunque la recuperación
  // haya devuelto primero una norma anterior; ante un empate de año se conserva
  // el orden de los sectores pedidos.
  const ordered = !keepHistory
    ? [...selected].sort(
        (left, right) =>
          (right.source.issuanceYear ?? 0) - (left.source.issuanceYear ?? 0),
      )
    : selected;
  const pruned = pruneOlderSalarySources(ordered, keepHistory);

  return renderCandidates(
    pruned,
    requestedSectors,
    explicitSectors.length > 0,
    expectedRole,
    profile.year,
  );
}
