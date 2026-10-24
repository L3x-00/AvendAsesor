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
 * el resto del texto citado se conserva literal.
 */
function readableExtract(text: string): string {
  return text
    .replace(/\bN\s*[%*?¿"“”]\s*(?=\d{2,})/gu, 'N.° ')
    .replace(/\s+/gu, ' ')
    .trim();
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
    : `${subject}, según la tabla recuperada, es la siguiente. [${rank}]`;
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
    ? `Otra fuente recuperada del mismo año registra un monto distinto: ${amount} para una jornada de ${onlyHours} horas${subject}. [${rank}]`
    : `Otra fuente recuperada${yearLabel} también registra ${amount} para una jornada de ${onlyHours} horas${subject}. [${rank}]`;
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
      `Otra fuente recuperada contiene una escala de remuneración que no se puede resumir en un solo monto y jornada. [${rank}]`;
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
        : unitSection(
            primaryUnits,
            primaryRank,
            'La evidencia recuperada registra:',
          );
  } else {
    const panorama = noAmountUnits(primaryUnits);
    const units = panorama.length ? panorama : primaryUnits.slice(0, 1);
    body = unitSection(
      units,
      primaryRank,
      'No encontré un monto de remuneración para el cargo consultado en la evidencia recuperada. La evidencia disponible indica:',
    );
  }

  const displayedSectors = [
    ...(schedule
      ? schedule.unit.sectors
      : primary.units.flatMap((unit) => unit.sectors)),
    ...extras.flatMap(({ sectors }) => sectors),
  ];
  const missingSectors = displayedSectors.length
    ? requestedSectors.filter((sector) => !displayedSectors.includes(sector))
    : [];
  const missingMessage = missingSectors.length
    ? `\n\nNo se recuperó un fragmento salarial explícito para el sector ${missingSectors
        .map(displaySector)
        .join(' y ')}.`
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
  const explicitSectors = salarySectors(question);
  const requestedSectors =
    explicitSectors.length > 0 ? explicitSectors : [...PANORAMA_SECTORS];
  const profile = salaryQuestionProfile(question);
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
