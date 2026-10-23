import type { RetrievalScope, RetrievedChunk } from './retrieval.gateway';
import {
  hasSalaryPanoramaEvidence,
  salaryQuestionProfile,
  salaryRoles,
  salarySectors,
} from './salary-applicability';
import { normalizeSpanishText } from './text-normalization';

export interface ExtractiveSalaryAnswer {
  answer: string;
  sources: RetrievedChunk[];
}

interface SalaryEvidenceUnit {
  sectors: string[];
  text: string;
}

const PANORAMA_SECTORS = ['publico', 'privado'] as const;
const GENERAL_SALARY_TERM =
  /\b(?:remuneracion(?:es)?|sueldos?|salarios?|haberes)\b/u;
const NEGATED_SALARY_UNIT =
  /\b(?:no|ni|excepto|excluid[oa]s?|inaplicable|no\s+se\s+aplica)\b/u;
const EDUCATION_AUXILIARY = /\bauxiliar(?:es)?\s+de\s+educacion\b/u;

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

/**
 * Sectores que el fragmento asocia positivamente con la misma afirmación de
 * remuneración y el cargo consultado. No usa el título: este puede nombrar un
 * cargo mientras la fila o la oración presenta el importe de otro.
 */
interface SalarySourceEvidence {
  units: SalaryEvidenceUnit[];
  sectors: string[];
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
    const unitSectors = salarySectors(unit);
    if (
      !GENERAL_SALARY_TERM.test(normalizedUnit) ||
      NEGATED_SALARY_UNIT.test(normalizedUnit) ||
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
 * Evita que el modelo reformule un importe salarial. Cada bloque mostrado es
 * únicamente las oraciones o filas recuperadas que superan la comprobación de
 * cargo y sector, y la cita se añade en el servidor. Un fragmento que ya
 * contiene una cita no se reutiliza porque la interfaz podría interpretarla
 * como una fuente distinta.
 */
export function buildExtractiveSalaryAnswer(
  sources: readonly RetrievedChunk[],
  question: string,
  scope: RetrievalScope,
): ExtractiveSalaryAnswer | null {
  const explicitSectors = salarySectors(question);
  const requestedSectors =
    explicitSectors.length > 0 ? explicitSectors : [...PANORAMA_SECTORS];
  const expectedRole = salaryQuestionProfile(question).role;
  const candidates = sources
    .filter((source) => hasSalaryPanoramaEvidence([source], scope, question))
    .map((source) => ({
      source,
      evidence: salarySourceEvidence(source, expectedRole),
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

  // Reserva un fragmento por cada sector antes de completar el tope con otras
  // fuentes. El orden de recuperación no puede decidir qué parte del panorama
  // se muestra.
  const selected: Array<{
    evidence: SalarySourceEvidence;
    source: RetrievedChunk;
  }> = [];
  for (const sector of requestedSectors) {
    const candidate = candidates.find(
      ({ source, evidence }) =>
        evidence.sectors.includes(sector) &&
        !selected.some(
          (selectedSource) => selectedSource.source.chunkId === source.chunkId,
        ),
    );
    if (candidate) selected.push(candidate);
  }
  for (const candidate of candidates) {
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

  if (!selected.length) return null;

  const missingSectors = requestedSectors.filter(
    (sector) =>
      !selected.some(({ evidence }) => evidence.sectors.includes(sector)),
  );

  const answer = selected
    .map(({ evidence }, index) => {
      const units = visibleUnitsFor(
        evidence,
        requestedSectors,
        explicitSectors.length > 0,
      );
      return `Fragmento recuperado de la fuente ${index + 1}:\n${units.map((unit) => unit.text).join('\n\n')}\n[${index + 1}]`;
    })
    .join('\n\n');
  const missingMessage = missingSectors.length
    ? `\n\nNo se recuperó un fragmento salarial explícito para el sector ${missingSectors.join(' y ')}.`
    : '';
  return {
    answer: `${answer}${missingMessage}`,
    sources: selected.map(({ source }) => source),
  };
}
