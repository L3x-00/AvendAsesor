import {
  markdownTableAt,
  type MarkdownTableBlock,
} from '../../../web/src/components/chat/chat-response-tables';
import type { AvailableDocument } from '../../src/chat/catalog/chat-catalog.types';
import { citedIndexes } from '../../src/rag/citations';

export type Verdict =
  'PASA' | 'FALLA' | 'REQUIERE_CORPUS' | 'REQUIERE_REVISION';
export interface QualitySource {
  documentId: string;
  documentVersionId: string;
  issuanceYear: number | null;
  mimeType: string | null;
  moduleName: string | null;
  page: number;
  pageEnd: number;
  pageCount: number | null;
  rank: number;
  relatedModuleName: string | null;
  title: string;
  articleReference: string | null;
  numeralReference: string | null;
  sectionTitle: string | null;
}
export interface QualityTurn {
  answer: string;
  events: string[];
  question: string;
  sources: QualitySource[];
  error?: string;
}
export interface CorpusSnapshot {
  capturedAt: string;
  documents: AvailableDocument[];
  activeRootModules: string[];
}

export const citationRanksIn = (text: string): Set<number> =>
  new Set(citedIndexes(text));
export function citationsPointToKnownSources(turn: QualityTurn): boolean {
  const ranks = citationRanksIn(turn.answer);
  const known = new Set(turn.sources.map((source) => source.rank));
  return ranks.size > 0 && [...ranks].every((rank) => known.has(rank));
}
export function markdownTables(answer: string): MarkdownTableBlock[] {
  const lines = answer.replace(/\r/gu, '').split('\n');
  const result: MarkdownTableBlock[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const table = markdownTableAt(lines, index);
    if (!table) continue;
    result.push(table);
    index = table.endIndex - 1;
  }
  return result;
}
export function tableRowsHaveKnownCitations(turn: QualityTurn): boolean {
  const tables = markdownTables(turn.answer);
  const known = new Set(turn.sources.map((source) => source.rank));
  return (
    tables.length === 1 &&
    tables[0].rows.length > 0 &&
    tables[0].rows.every((row) => {
      const ranks = citationRanksIn(row.join(' '));
      return ranks.size > 0 && [...ranks].every((rank) => known.has(rank));
    }) &&
    citationsPointToKnownSources(turn)
  );
}
export function tableRowsAreNewestFirst(turn: QualityTurn): boolean {
  if (!tableRowsHaveKnownCitations(turn)) return false;
  const sourceByRank = new Map(
    turn.sources.map((source) => [source.rank, source]),
  );
  const rows = markdownTables(turn.answer)[0].rows;
  const years = rows.map((row) => {
    const values = [...citationRanksIn(row.join(' '))].map(
      (rank) => sourceByRank.get(rank)?.issuanceYear,
    );
    if (values.some((year) => year == null)) return null;
    const year = Math.max(...(values as number[]));
    return new RegExp(`\\b${year}\\b`, 'u').test(row.join(' ')) ? year : null;
  });
  return years.every(
    (year, index) =>
      year !== null &&
      (index === 0 || (years[index - 1] !== null && year <= years[index - 1]!)),
  );
}

// Contrato esperado independiente del generador: se rechaza incluso una frase
// factual añadida a una negativa correcta. No basta buscar «no encontré».
const NO_EVIDENCE =
  'Por ahora no encontré información suficiente para orientarte bien sobre esto. Cuéntame el trámite, tu cargo y qué necesitas resolver para buscar una respuesta más precisa.';
const HISTORICAL_NOTICE =
  ' Si tu consulta se refiere a una norma anterior o a un antecedente histórico, indícamelo y con gusto lo reviso.';
export function noEvidenceIsSafe(turn: QualityTurn): boolean {
  if (!turn.events.includes('no_evidence')) return true;
  if (
    turn.events.includes('token') ||
    turn.events.includes('sources') ||
    turn.sources.length
  )
    return false;
  if (
    turn.answer === NO_EVIDENCE ||
    turn.answer === NO_EVIDENCE + HISTORICAL_NOTICE
  )
    return true;
  if (
    turn.answer ===
    'Me parece interesante tu consulta, pero mi objetivo es orientarte en temas del ámbito educativo: puedo orientarte en consultas del ámbito educativo —principalmente de docentes, auxiliares de educación y directivos— sobre procesos, requisitos, plazos, derechos, obligaciones y trámites, con el sustento de los documentos disponibles. Si tu consulta va por ahí, cuéntame un poco más sobre el trámite o tu situación laboral y te ayudo con gusto.'
  )
    return true;
  const prefix = 'No encontré evidencia disponible y aprobada de ';
  const suffix =
    '. Para no atribuirle contenido de otra norma, no usaré documentos parecidos como sustituto. Verifica el número indicado o vuelve a consultar cuando el documento esté disponible.';
  if (!turn.answer.startsWith(prefix) || !turn.answer.endsWith(suffix))
    return false;
  const identity = turn.answer.slice(prefix.length, -suffix.length);
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]/gu, '');
  // La negativa puede repetir una identidad explícita; no completar su título.
  const tokens = identity.match(/\d+(?:-\d+)*(?:-[A-Z]+)?/gu) ?? [];
  return (
    tokens.length > 0 &&
    tokens.every((token) =>
      normalize(turn.question).includes(normalize(token)),
    ) &&
    /^(?:(?:RSG|RVM|RM|RD|DS|DL|Ley|Directiva|Decreto Supremo|Decreto Legislativo|Resolución (?:Ministerial|Viceministerial|Directoral|de Secretaría General))\s+(?:N[.°º\s]*)?\d[\dA-Z\s-]*(?:, | y )?)+$/u.test(
      identity,
    )
  );
}

export function integrityIssues(
  turn: QualityTurn,
  corpus: CorpusSnapshot,
): string[] {
  const issues: string[] = [];
  if (turn.error || turn.events.includes('technical_error'))
    issues.push('Fallo técnico; no se interpreta como falta de corpus.');
  if (turn.events.includes('token') && !turn.sources.length)
    issues.push('Texto generado sin fuentes.');
  if (!noEvidenceIsSafe(turn))
    issues.push(
      'La negativa sin evidencia añade texto no autorizado, tokens o fuentes.',
    );
  if (turn.sources.length && !citationsPointToKnownSources(turn))
    issues.push('Fuentes sin cita válida o cita a una fuente inexistente.');
  if (citationRanksIn(turn.answer).size && !citationsPointToKnownSources(turn))
    issues.push('La respuesta contiene una cita inexistente.');
  const ranks = turn.sources.map((source) => source.rank);
  if (new Set(ranks).size !== ranks.length)
    issues.push('Rangos de cita repetidos.');
  for (const source of turn.sources) {
    const document = corpus.documents.find(
      (item) =>
        item.id === source.documentId &&
        item.versionId === source.documentVersionId,
    );
    if (!document)
      issues.push(
        `Fuente [${source.rank}] ajena al inventario elegible previo.`,
      );
    if (
      source.mimeType === 'application/pdf' &&
      (!Number.isInteger(source.page) ||
        !Number.isInteger(source.pageEnd) ||
        source.page < 1 ||
        source.pageEnd < source.page ||
        (source.pageCount !== null &&
          (!Number.isInteger(source.pageCount) ||
            source.pageCount < source.pageEnd)))
    )
      issues.push(`Paginación incoherente en [${source.rank}].`);
    if (
      source.mimeType &&
      source.mimeType !== 'application/pdf' &&
      source.pageCount !== null
    )
      issues.push(
        `Paginación PDF atribuida a un archivo no PDF [${source.rank}].`,
      );
    if (
      source.sectionTitle &&
      /^(?:\d+\s+)?(?:normas\s+l\s*egales|el peruano\b|documento electr[oó]nico firmado)/iu.test(
        source.sectionTitle,
      )
    )
      issues.push(
        `Cabecera o sello presentado como sección en [${source.rank}].`,
      );
  }
  return [...new Set(issues)];
}

export function isCausalClarification(turn: QualityTurn): boolean {
  return (
    turn.events.includes('clarification') &&
    !turn.events.includes('token') &&
    !turn.sources.length &&
    /causal|motivo/iu.test(turn.answer) &&
    (turn.answer.match(/\?/gu) ?? []).length === 1
  );
}
export function isSalaryClarification(turn: QualityTurn): boolean {
  return (
    turn.events.includes('clarification') &&
    !turn.events.includes('token') &&
    !turn.sources.length &&
    /sector|cargo|jornada|condici[oó]n|escala|per[ií]odo|año/iu.test(
      turn.answer,
    ) &&
    !/s\/|\d[.,]\d{2}/iu.test(turn.answer) &&
    (turn.answer.match(/\?/gu) ?? []).length === 1
  );
}

/** Dato de control contrastado con DS 049-2025-EF, página 3: contratado/30h/2025. */
export function salary2025TableIsCorrect(turn: QualityTurn): boolean {
  if (!tableRowsHaveKnownCitations(turn)) return false;
  const sourceByRank = new Map(
    turn.sources.map((source) => [source.rank, source]),
  );
  const rows = markdownTables(turn.answer)[0].rows;
  return (
    rows.length > 0 &&
    rows.every((row) => {
      const text = row.join(' ');
      const amounts =
        text.match(/(?<![\p{L}\p{N}])\d+(?:[ .,]\d{3})*[,.]\d{2}(?!\d)/gu) ??
        [];
      const normalizedAmounts = amounts.map(
        (amount) =>
          amount.slice(0, -3).replace(/[ .,]/gu, '') + '.' + amount.slice(-2),
      );
      return (
        normalizedAmounts.length > 0 &&
        normalizedAmounts.every((amount) => amount === '3300.60') &&
        !/\bno\b|hist[oó]ric|antecedente/iu.test(text) &&
        [...citationRanksIn(text)].some((rank) => {
          const source = sourceByRank.get(rank);
          return (
            source?.issuanceYear === 2025 &&
            /049\s*-\s*2025\s*-\s*EF/iu.test(source.title) &&
            source.page <= 3 &&
            source.pageEnd >= 3
          );
        })
      );
    }) &&
    /\b30\b/u.test(turn.answer) &&
    /2025/u.test(turn.answer)
  );
}

export const CORPUS_RULES: Record<string, { module?: string; title?: RegExp }> =
  {
    C02: { title: /auxiliar/iu },
    C03: { title: /renovaci[oó]n|contrataci[oó]n docente/iu },
    C04: { title: /auxiliar/iu },
    C05: { module: 'Cargos y plazas' },
    C06: { title: /auxiliar/iu },
    C07: { title: /reasignaci[oó]n|permuta/iu },
    C09: { title: /reasignaci[oó]n|permuta/iu },
    C10: { module: 'Remuneraciones' },
    C11: { title: /reasignaci[oó]n|permuta/iu },
    C14: { title: /reasignaci[oó]n|permuta/iu },
    C15: { title: /reasignaci[oó]n|permuta/iu },
    C16: { title: /reasignaci[oó]n|permuta/iu },
    C17: { module: 'Remuneraciones' },
    C18: { module: 'Remuneraciones' },
    C19: { title: /049-2025-EF/iu },
    C20: { module: 'Remuneraciones' },
    'PI-01': { module: 'Ley y reglamento' },
    'PI-02': { title: /contrataci[oó]n docente|renovaci[oó]n/iu },
    'PI-03': { title: /auxiliar/iu },
    'PI-04': { title: /auxiliar/iu },
    'PI-05': { title: /auxiliar/iu },
    O01: { module: 'Remuneraciones' },
    O02: { module: 'Remuneraciones' },
    O03: { title: /049-2025-EF/iu },
    O04: { title: /049-2025-EF/iu },
    E03: { title: /074-2019-EF/iu },
  };
export function decideVerdict(input: {
  id: string;
  turns: QualityTurn[];
  corpus: CorpusSnapshot;
  pass: boolean;
  otherwise: Verdict;
}): { verdict: Verdict; issues: string[] } {
  const issues = input.turns.flatMap((turn) =>
    integrityIssues(turn, input.corpus),
  );
  if (issues.length) return { verdict: 'FALLA', issues };
  const baseId = input.id.replace(/-R\d+$/u, '');
  const rule = CORPUS_RULES[baseId];
  const present =
    !rule ||
    input.corpus.documents.some(
      (doc) =>
        (!rule.module || doc.moduleNames.includes(rule.module)) &&
        (!rule.title || rule.title.test(doc.title)),
    );
  if (
    !present &&
    input.turns.some(
      (turn) => turn.events.includes('token') || turn.sources.length,
    )
  )
    return {
      verdict: 'FALLA',
      issues: [
        'Se respondió con hechos o fuentes sin el corpus requerido para este caso.',
      ],
    };
  if (!present)
    return {
      verdict: 'REQUIERE_CORPUS',
      issues: [
        'Ausencia comprobada en inventario elegible previo; no inferida del evento de respuesta.',
      ],
    };
  // Un corpus existente + recuperación fallida es FALLA, nunca «falta corpus».
  const otherwise =
    input.otherwise === 'REQUIERE_CORPUS' ? 'FALLA' : input.otherwise;
  return {
    verdict: input.pass ? 'PASA' : otherwise,
    issues:
      !input.pass && input.otherwise === 'REQUIERE_CORPUS'
        ? [
            'El inventario confirma corpus elegible: no se reclasifica el fallo como falta documental.',
          ]
        : [],
  };
}

export function assessStability(
  results: Array<{ id: string; verdict: Verdict; turns: QualityTurn[] }>,
) {
  const groups = new Map<string, typeof results>();
  for (const result of results) {
    const id = result.id.replace(/-R\d+$/u, '');
    groups.set(id, [...(groups.get(id) ?? []), result]);
  }
  return [...groups]
    .filter(([, runs]) => runs.length > 1)
    .map(([id, runs]) => {
      const signatures = runs.map((run) =>
        JSON.stringify({
          verdict: run.verdict,
          events: run.turns.map((turn) =>
            turn.events.filter((event) =>
              ['token', 'no_evidence', 'clarification'].includes(event),
            ),
          ),
          versions: run.turns.map((turn) =>
            [
              ...new Set(
                turn.sources.map((source) => source.documentVersionId),
              ),
            ].sort(),
          ),
        }),
      );
      return {
        id,
        runs: runs.length,
        stable: new Set(signatures).size === 1,
        allPass: runs.every((run) => run.verdict === 'PASA'),
      };
    });
}
