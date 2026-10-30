import {
  markdownTableAt,
  classifyTableAt,
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
/** Ignora el orden y la hora; conserva los metadatos que cambian el sustento. */
export function corpusSnapshotKey(corpus: CorpusSnapshot): string {
  return JSON.stringify({
    modules: [...corpus.activeRootModules].sort(),
    documents: corpus.documents
      .map((document) => ({
        id: document.id,
        version: document.versionId,
        title: document.title,
        type: document.documentType,
        number: document.resolutionNumber,
        year: document.issuanceYear,
        mime: document.mimeType,
        pages: document.pageCount,
        modules: [...document.moduleIds].sort(),
      }))
      .sort((a, b) => a.id.localeCompare(b.id)),
  });
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
  const lines = turn.answer.replace(/\r/gu, '').split('\n');
  const visibleGrids = lines.flatMap((_, index) => {
    const classified = classifyTableAt(lines, index, [...known]);
    return classified?.asGrid ? [classified] : [];
  });
  return (
    tables.length === 1 &&
    visibleGrids.length === 1 &&
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
const NORM_TYPES: Record<string, string> = {
  'resolucion de secretaria general': 'rsg',
  'resolucion viceministerial': 'rvm',
  'resolucion ministerial': 'rm',
  'resolucion directoral': 'rd',
  'decreto supremo': 'ds',
  'decreto legislativo': 'dl',
};
function normalize(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}
function normIdentities(value: string): string[] {
  const pattern =
    /\b(resolucion de secretaria general|resolucion viceministerial|resolucion ministerial|resolucion directoral|decreto supremo|decreto legislativo|rsg|rvm|rm|rd|ds|dl|ley|directiva)\s+(?:n[.°º\s]*)?(\d+(?:\s*-\s*(?:\d+|[a-z]+))*)\b/gu;
  return [...normalize(value).matchAll(pattern)].map(
    (match) =>
      `${NORM_TYPES[match[1]] ?? match[1]}:${match[2].replace(/\s/gu, '')}`,
  );
}
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
  // La negativa puede repetir una identidad explícita; no completar su título.
  const identities = normIdentities(identity);
  const requested = normIdentities(turn.question);
  return (
    identities.length > 0 &&
    identities.every((item) => requested.includes(item)) &&
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
  const completed =
    turn.events.includes('done') ||
    (turn.events.length === 1 &&
      turn.events[0] === 'conversational' &&
      !turn.sources.length);
  if (!turn.answer.trim() || !completed)
    issues.push('Respuesta vacía o sin finalización.');
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
  if (ranks.some((rank) => !Number.isInteger(rank) || rank < 1))
    issues.push('Número de cita inválido.');
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
    // El recuperador puede corregir en memoria una ficha de decreto cuyo
    // título/año de catálogo contradice la cabecera verificable del PDF. La
    // identidad estable sigue siendo documento+versión; MIME y paginación no
    // pueden cambiar. Solo se acepta la corrección cuando la ficha original
    // era un decreto y la cita resultante declara un Decreto Supremo.
    const reconciledReference =
      /^decreto\s+supremo\s+n(?:[.°º]\s*)*(\d{1,8}\s*-\s*((?:19|20)\d{2})\s*-\s*[a-z]{2,20})\b/iu.exec(
        source.title,
      );
    const reconciledDecreeIdentity =
      document?.documentType === 'DECRETO_SUPREMO' &&
      !/decreto\s+supremo/iu.test(document.title) &&
      reconciledReference !== null &&
      Number(reconciledReference[2]) === source.issuanceYear;
    if (
      document &&
      (source.mimeType !== document.mimeType ||
        source.pageCount !== document.pageCount ||
        (!reconciledDecreeIdentity &&
          (source.title !== document.title ||
            source.issuanceYear !== document.issuanceYear)))
    )
      issues.push(
        `Metadatos de [${source.rank}] difieren del inventario canónico.`,
      );
    if (
      (source.mimeType === 'application/pdf' &&
        (!Number.isInteger(source.page) ||
          !Number.isInteger(source.pageEnd) ||
          source.page < 1 ||
          source.pageEnd < source.page ||
          (source.pageCount !== null &&
            (!Number.isInteger(source.pageCount) ||
              source.pageCount < source.pageEnd)))) ||
      (document?.mimeType === 'application/pdf' &&
        document.pageCount !== null &&
        source.pageEnd > document.pageCount)
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
      /^(?:\d+\s+)?(?:normas\s+l\s*egales|el peruano\b|documento electr[oó]nico firmado|la integridad del documento y la autor[ií]a|esta es una copia aut[eé]ntica imprimible|firmado digitalmente por)/iu.test(
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
  // Contrato determinista: ninguna prosa factual antes o después de la pregunta.
  const text = normalize(turn.answer);
  const root =
    '(?:remuneraciones|contratacion y desplazamientos|auxiliar de educacion|licencias y permisos|ley y reglamento|cargos y plazas|evaluacion docente)';
  const ambiguityPrefix = new RegExp(
    `^no seria responsable darte una cifra unica para todos los docentes del peru sin confirmar tu situacion\\. (?:la busqueda encontro informacion en (?:el tema ${root}|los temas ${root}(?:, ${root})* y ${root}), pero eso no permite atribuirte una cifra o una norma sin conocer tu caso\\. )?`,
    'u',
  );
  const question = text
    .replace(ambiguityPrefix, '')
    .replace(
      /^para ubicar la regla que corresponde, necesito un solo dato: /u,
      '',
    )
    .replace(/^para darte la cifra correcta necesito un solo dato: /u, '')
    .replace(
      / con eso te indico el monto vigente que te corresponde y su alcance\.$/u,
      '',
    );
  const allowed =
    /^¿(?:tu consulta es del sector publico o privado|tu jornada es de \d{1,2} o de \d{1,2} horas|cuantas horas de jornada laboras|tu vinculo es (?:nombrado o contratado|contratado o nombrado)|a que cargo corresponde tu consulta(?:: (?:docente|auxiliar|directivo)(?: o (?:docente|auxiliar|directivo))*)?|en que escala de la carrera magisterial te encuentras|de que ano es el monto que consultas: (?:19|20)\d{2} o (?:19|20)\d{2}|de que ano o periodo es el monto que consultas)\?$/u;
  return (
    turn.events.includes('clarification') &&
    !turn.events.includes('token') &&
    !turn.sources.length &&
    allowed.test(question)
  );
}

/** Moneda explícita (también enteros) y decimales; conservar el signo. */
function moneyValues(text: string): string[] {
  const pattern =
    /(?:s\/\.?\s*|(?<![\p{L}\p{N}]))([+\-−]?\s*\d+(?:[ .,]\d{3})*(?:[,.]\d{2})?)(?:\s*soles\b)?/giu;
  return [...text.matchAll(pattern)].flatMap((match) => {
    if (
      !/^s\//iu.test(match[0]) &&
      !/soles\b/iu.test(match[0]) &&
      !/[,.]\d{2}$/u.test(match[1])
    )
      return [];
    const raw = match[1].replace(/\s/gu, '');
    const decimal = /[,.](\d{2})$/u.exec(raw);
    return [
      decimal
        ? raw.slice(0, decimal.index).replace(/[.,]/gu, '') + '.' + decimal[1]
        : raw.replace(/[.,]/gu, ''),
    ];
  });
}

/**
 * Coincidencia técnica con el control DS277/p2/3500.70, no verdad jurídica.
 * Texto abierto puede cambiar el alcance fuera de la tabla: O03 requiere
 * contraste humano aunque coincidan número, formato, página y citas.
 */
export function salary2025TableMatchesControl(turn: QualityTurn): boolean {
  if (!tableRowsHaveKnownCitations(turn)) return false;
  const sourceByRank = new Map(
    turn.sources.map((source) => [source.rank, source]),
  );
  const rows = markdownTables(turn.answer)[0].rows;
  const allText = normalize(turn.answer);
  const amounts = moneyValues(turn.answer);
  // Control de una consulta personal concreta, no de una escala general: el
  // importe correcto en una fila no absuelve otra cifra o cargo en la prosa.
  if (
    !/\b(?:docente|profesor)\b/u.test(allText) ||
    !/\bcontratad[oa]\b/u.test(allText) ||
    /\b(?:auxiliar|nombrad[oa]|director|directivo)\b/u.test(allText) ||
    /\b(?:20|24|25|40)\s*horas\b/u.test(allText) ||
    !amounts.length ||
    amounts.some((amount) => amount !== '3500.70')
  )
    return false;
  return (
    rows.length > 0 &&
    rows.every((row) => {
      const text = row.join(' ');
      const normalizedAmounts = moneyValues(text);
      return (
        normalizedAmounts.length > 0 &&
        normalizedAmounts.every((amount) => amount === '3500.70') &&
        row.some((cell) =>
          /^(?:\*\*)?30(?:\s*horas)?(?:\*\*)?$/iu.test(cell),
        ) &&
        !/\bno\b|hist[oó]ric|antecedente/iu.test(text) &&
        [...citationRanksIn(text)].some((rank) => {
          const source = sourceByRank.get(rank);
          return (
            source?.issuanceYear === 2025 &&
            /277\s*-\s*2025\s*-\s*EF/iu.test(source.title) &&
            source.page <= 2 &&
            source.pageEnd >= 2
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
    C19: { module: 'Remuneraciones' },
    C20: { module: 'Remuneraciones' },
    'PI-01': { module: 'Ley y reglamento' },
    'PI-02': { title: /contrataci[oó]n docente|renovaci[oó]n/iu },
    'PI-03': { title: /auxiliar/iu },
    'PI-04': { title: /auxiliar/iu },
    'PI-05': { title: /auxiliar/iu },
    O01: { module: 'Remuneraciones' },
    O02: { module: 'Remuneraciones' },
    O03: { module: 'Remuneraciones' },
    O04: { module: 'Remuneraciones' },
    'REM-01': { module: 'Remuneraciones' },
    'REM-02': { module: 'Remuneraciones' },
    'REM-03': { module: 'Remuneraciones' },
    'REM-04': { module: 'Remuneraciones' },
    'REM-05': { module: 'Remuneraciones' },
    'REM-06': { module: 'Remuneraciones' },
    'REM-07': { module: 'Remuneraciones' },
    'SA-01': { title: /licencias, permisos y vacaciones/iu },
    'SA-02': { title: /licencias, permisos y vacaciones/iu },
    'SA-03': { title: /licencias, permisos y vacaciones/iu },
    // El único FAQ con ese término es de reasignación y no contiene una
    // definición, finalidad ni canal de obtención del escalafón.
    'SA-04': {
      title: /escalaf[oó]n.*(?:registro|procedimiento|obtenci[oó]n)/iu,
    },
    'SA-05': { title: /326-2017-MINEDU/iu },
    'SA-06': { title: /proceso administrativo disciplinario/iu },
    'SA-07': { title: /326-2017-MINEDU/iu },
    E03: { title: /074-2019-EF/iu },
  };
/** Mismo evaluador en la primera corrida y todas sus repeticiones. */
export function pdfMinuteRequestIsCorrect(turn: QualityTurn): boolean {
  return (
    /(?:pdf|documento).{0,100}p[aá]gin|p[aá]gin.{0,100}(?:pdf|documento)/iu.test(
      turn.answer,
    ) &&
    /(?:no (?:existe|corresponde|puedo|se usa)|no hay|no por minuto).{0,80}minuto|no por minuto/iu.test(
      turn.answer,
    ) &&
    !/\b\d{1,2}:\d{2}\b|\b(?:minuto|segundo)\s*\d+\b/iu.test(turn.answer)
  );
}
export function salaryDocumentLocationIsCorrect(turn: QualityTurn): boolean {
  return (
    turn.events.includes('token') &&
    citationsPointToKnownSources(turn) &&
    turn.sources.some(
      (source) =>
        /277-2025-EF/iu.test(source.title) &&
        source.page <= 2 &&
        source.pageEnd >= 2,
    ) &&
    !/no puedo[^.]*enlac/iu.test(turn.answer)
  );
}
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
  if (!input.turns.length) issues.push('Caso sin turnos ejecutados.');
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
  // Ninguna combinación de regex certifica toda la aplicabilidad de prosa
  // abierta ni que un enlace abra el PDF. El resultado técnico positivo deja
  // estos casos pendientes de revisión; tampoco sus repeticiones se aprueban.
  const manualRequired = ['O03', 'O04', 'C18', 'C19'].includes(baseId);
  return {
    verdict: input.pass
      ? manualRequired
        ? 'REQUIERE_REVISION'
        : 'PASA'
      : otherwise,
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
          facts: run.turns.map((turn) => ({
            amounts: [...new Set(moneyValues(turn.answer))].sort(),
            sources: [
              ...new Set(
                turn.sources.map((source) =>
                  JSON.stringify([
                    source.documentVersionId,
                    source.page,
                    source.pageEnd,
                    source.articleReference,
                    source.numeralReference,
                  ]),
                ),
              ),
            ].sort(),
          })),
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
