import type { RetrievedChunk } from './retrieval.gateway';
import { canonicalAmount } from './salary-applicability';
import { normalizeSpanishText } from './text-normalization';

export interface RimEvidence {
  amount: string;
  /** Complete matched operative scope, used only for applicability checks. */
  statement: string;
  sources: RetrievedChunk[];
}

const FIRST_SCALE = /\bprimera\s+escala\s+magisterial\b/u;
const RIM = /\b(?:remuneracion\s+integra\s+mensual|rim)\b/u;
const ARTICLE_ONE = /\barticulo\s+1\s*[.\-–]/u;
const NEXT_ARTICLE = /\barticulo\s+(?:[2-9]|\d{2,})\s*[.\-–]/u;
const UNSAFE =
  /\b(?:no|ni|sin|excepto|salvo|exceptuad\w*|derog\w*|dej\w*\s+sin\s+efecto|asignacion\w*|bonific\w*|contratad\w*|auxiliar\w*|segunda|tercera|cuarta|quinta|sexta|septima|octava|novena|decima|condicional|propuesta|proyecto)\b/u;
// Closed syntax for the attested operative provision. Neither arbitrary
// text between subject and amount nor nearby metadata supplies applicability.
const RIM_NAME = String.raw`(?:remuneracion\s+integra\s+mensual(?:\s*\(rim\))?|rim)`;
const HEADER = new RegExp(
  String.raw`^monto\s+de\s+la\s+${RIM_NAME}\s+de\s+la\s+primera\s+escala\s+magisterial\s*\.?\s*`,
  'u',
);
const SCOPE = String.raw`correspondiente\s+a\s+la\s+primera\s+escala\s+magisterial(?:\s+de\s+la\s+carrera\s+publica\s+magisterial(?:\s+a\s+la\s+que\s+se\s+refiere\s+la\s+ley\s+n[.°º\s]*29944(?:\s*,\s*ley\s+de\s+reforma\s+magisterial)?\s*,?)?)?`;

/** A complete, positive RIM provision, not a monetary proximity window. */
function amountIn(text: string): { amount: string; statement: string } | null {
  const normalized = normalizeSpanishText(withoutJournalHeader(text));
  const article = ARTICLE_ONE.exec(normalized);
  if (
    article &&
    article.index > 0 &&
    !/\bdecreta:\s*$/u.test(normalized.slice(0, article.index))
  )
    return null;
  const scoped = article
    ? normalized.slice(article.index + article[0].length)
    : normalized;
  const end = NEXT_ARTICLE.exec(scoped)?.index ?? scoped.length;
  const provision = scoped
    .slice(0, end)
    .replace(/^[\s.\-–]+/u, '')
    .trim();
  if (UNSAFE.test(provision)) return null;
  const header = article ? HEADER.exec(provision) : null;
  const body = header ? provision.slice(header[0].length) : provision;
  // The heading may supply the first-scale label only within this operative
  // article. Standalone declarations must state that scope themselves.
  const scope = header ? String.raw`(?:\s+${SCOPE})?` : String.raw`\s+${SCOPE}`;
  const declaration = new RegExp(
    String.raw`^(?:fijar\s+el\s+monto\s+de\s+la|se\s+fija\s+(?:el\s+monto\s+de\s+)?la|la)\s+${RIM_NAME}\s+por\s+hora(?:\s+de\s+trabajo\s+semanal\s*[-–]\s*mensual)?${scope}\s+(?:en\s+la\s+suma\s+de|es|asciende\s+a|equivale\s+a)\s+(s\/\.?\s*\d[\d .,]*\d|s\/\.?\s*\d)(?:\s*\(([\p{L}\d\s/]+)\))?\s*\.?$`,
    'u',
  );
  const match = declaration.exec(body);
  if (!match) return null;
  const amount = canonicalAmount(match[1]);
  if (match[2] && !writtenAmountMatches(match[2], amount)) return null;
  return { amount, statement: provision };
}

// The written currency restatement must agree too; it cannot hide a new
// subject, period or qualification after a syntactically valid numeric amount.
function integerWords(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value > 999999) return null;
  const small = [
    'cero',
    'uno',
    'dos',
    'tres',
    'cuatro',
    'cinco',
    'seis',
    'siete',
    'ocho',
    'nueve',
    'diez',
    'once',
    'doce',
    'trece',
    'catorce',
    'quince',
    'dieciseis',
    'diecisiete',
    'dieciocho',
    'diecinueve',
    'veinte',
    'veintiuno',
    'veintidos',
    'veintitres',
    'veinticuatro',
    'veinticinco',
    'veintiseis',
    'veintisiete',
    'veintiocho',
    'veintinueve',
  ];
  if (value < 30) return small[value];
  if (value < 100) {
    const tens = [
      '',
      '',
      '',
      'treinta',
      'cuarenta',
      'cincuenta',
      'sesenta',
      'setenta',
      'ochenta',
      'noventa',
    ];
    return (
      tens[Math.trunc(value / 10)] +
      (value % 10 ? ` y ${small[value % 10]}` : '')
    );
  }
  if (value === 100) return 'cien';
  if (value < 1000) {
    const hundreds = [
      '',
      'ciento',
      'doscientos',
      'trescientos',
      'cuatrocientos',
      'quinientos',
      'seiscientos',
      'setecientos',
      'ochocientos',
      'novecientos',
    ];
    return (
      hundreds[Math.trunc(value / 100)] +
      (value % 100 ? ` ${integerWords(value % 100)}` : '')
    );
  }
  return (
    (value < 2000 ? 'mil' : `${integerWords(Math.trunc(value / 1000))} mil`) +
    (value % 1000 ? ` ${integerWords(value % 1000)}` : '')
  );
}

function writtenAmountMatches(words: string, amount: string): boolean {
  const [integer, decimals = '00'] = amount.split('.');
  const spoken = integerWords(Number(integer));
  return (
    spoken !== null &&
    words.trim() === `${spoken} y ${decimals.padEnd(2, '0')}/100 soles`
  );
}

function withoutJournalHeader(text: string): string {
  return text.replace(
    /^\s*\d+\s+NORMAS LEGALES\s+(?:Lunes|Martes|Mi[eé]rcoles|Jueves|Viernes|S[aá]bado|Domingo)\s+\d{1,2}\s+de\s+\p{L}+\s+de\s+\d{4}\s+El Peruano\s*\/\s*/iu,
    '',
  );
}

/**
 * Reconstruct only the attested open law-reference boundary. Consecutive
 * stored chunks establish order; matching syntax establishes the local link.
 * Page adjacency or source ranking alone never establish continuity.
 */
function continuedText(
  left: RetrievedChunk,
  right: RetrievedChunk,
): string | null {
  if (
    left.chunkIndex === undefined ||
    right.chunkIndex !== left.chunkIndex + 1 ||
    left.documentVersionId !== right.documentVersionId
  )
    return null;
  const text = withoutJournalHeader(right.chunkContent);
  if (
    !/\bley\s+n[.°º\s]*$/iu.test(left.chunkContent) ||
    !/^29944\s*,\s*(?:Ley de Reforma Magisterial\s*,\s*)?en la suma de\s+S\//iu.test(
      text,
    )
  )
    return null;
  return `${left.chunkContent} ${text}`;
}

/** Selects a single supported value without falling back to an older rule. */
export function firstScaleRimEvidence(
  sources: readonly RetrievedChunk[],
): RimEvidence | null {
  const references = sources.filter((source) => {
    const text = normalizeSpanishText(source.chunkContent);
    return FIRST_SCALE.test(text) && RIM.test(text);
  });
  if (!references.length) return null;
  const year = Math.max(
    ...references.map((source) => source.issuanceYear ?? 0),
  );
  const versions = new Set(
    references
      .filter((source) => (source.issuanceYear ?? 0) === year)
      .map((source) => source.documentVersionId),
  );
  const found: RimEvidence[] = [];
  for (const source of sources.filter((source) =>
    versions.has(source.documentVersionId),
  )) {
    const amount = amountIn(source.chunkContent);
    if (amount !== null) found.push({ ...amount, sources: [source] });
    for (const next of sources) {
      const text = continuedText(source, next);
      if (!text) continue;
      const joinedAmount = amountIn(text);
      if (joinedAmount !== null)
        found.push({ ...joinedAmount, sources: [source, next] });
    }
  }
  if (
    !found.length ||
    new Set(found.map((evidence) => evidence.amount)).size !== 1
  )
    return null;
  return found[0];
}
