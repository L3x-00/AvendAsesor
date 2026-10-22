import { CITATION_GROUP, citedIndexes } from './citations';
import {
  type DateMention,
  extractDates,
  mentionsUnparsedMonth,
  sourceHasDate,
} from './claim-dates';
import {
  LIST_ITEM_LINE,
  normalizedTerms,
  sourceSupportsClaim,
} from './claim-support';
import type { RetrievedChunk } from './retrieval.gateway';

type LineKind = 'blank' | 'list' | 'prose' | 'table';

const TABLE_LINE = /^[ \t\u00A0]*\|/u;
const SUGGESTIONS_LINE = /^[\s*_>#-]*sugerencias?\s*:/iu;
const INDENTED_LINE = /^[ \t\u00A0]+/u;
const HEADING_LINE = /^[ \t]*#{1,6}\s/u;
const CITATION_WITH_SPACE = new RegExp(`\\s*${CITATION_GROUP.source}`, 'gu');

function lineKind(line: string): LineKind {
  if (!line.trim()) return 'blank';
  if (TABLE_LINE.test(line)) return 'table';
  return LIST_ITEM_LINE.test(line) ? 'list' : 'prose';
}

interface ListRun {
  /** Última línea de la lista (incluye continuaciones sangradas). */
  end: number;
  /** Frase que introduce la lista; `null` si la lista no tiene introducción. */
  intro: number | null;
  start: number;
}

function isQuestion(line: string): boolean {
  const text = line.trim();
  return text.startsWith('¿') || text.endsWith('?');
}

/**
 * Listas del texto con su frase introductoria: la línea de prosa inmediata
 * anterior (admite una línea en blanco de por medio, como las que los modelos
 * dejan entre la frase y la primera viñeta). Los elementos pueden separarse con
 * líneas en blanco y las líneas sangradas continúan el elemento anterior.
 */
function listRuns(lines: string[], kinds: LineKind[]): ListRun[] {
  const runs: ListRun[] = [];
  let index = 0;
  while (index < lines.length) {
    if (kinds[index] !== 'list') {
      index += 1;
      continue;
    }
    const start = index;
    let end = index;
    let cursor = index + 1;
    while (cursor < lines.length) {
      if (kinds[cursor] === 'list') {
        end = cursor;
        cursor += 1;
      } else if (kinds[cursor] === 'blank') {
        let next = cursor;
        while (next < lines.length && kinds[next] === 'blank') next += 1;
        if (next >= lines.length || kinds[next] !== 'list') break;
        cursor = next;
      } else if (
        kinds[cursor] === 'prose' &&
        INDENTED_LINE.test(lines[cursor])
      ) {
        end = cursor;
        cursor += 1;
      } else {
        break;
      }
    }

    let intro: number | null = null;
    let previous = start - 1;
    if (previous >= 0 && kinds[previous] === 'blank') previous -= 1;
    if (
      previous >= 0 &&
      kinds[previous] === 'prose' &&
      !INDENTED_LINE.test(lines[previous]) &&
      !HEADING_LINE.test(lines[previous]) &&
      !isQuestion(lines[previous]) &&
      !SUGGESTIONS_LINE.test(lines[previous])
    ) {
      intro = previous;
    }
    runs.push({ end, intro, start });
    index = end + 1;
  }
  return runs;
}

function validRanks(text: string, sourceCount: number): number[] {
  return [
    ...new Set(
      citedIndexes(text).filter((rank) => rank >= 1 && rank <= sourceCount),
    ),
  ];
}

/**
 * La línea sin sus citas a fuentes entregadas. Un año o una fecha entre
 * corchetes ([2012]) no es una cita y se conserva.
 */
function stripCitations(line: string, sourceCount: number): string {
  return line.replace(CITATION_WITH_SPACE, (match) => {
    const ranks = citedIndexes(match);
    return ranks.length &&
      ranks.every((rank) => rank >= 1 && rank <= sourceCount)
      ? ''
      : match;
  });
}

/** La cifra figura entera (no dentro de otro número) en la fuente. */
function sourceHasNumber(source: RetrievedChunk, number: string): boolean {
  const pattern = new RegExp(
    `(?<!\\d)${number.replace(/[.,]/gu, '[.,]')}(?!\\d)`,
    'u',
  );
  return [
    source.chunkContent,
    source.articleReference,
    source.numeralReference,
    source.resolutionNumber,
    source.issuanceYear?.toString(),
    source.documentTitle,
  ].some(
    (value) => value !== null && value !== undefined && pattern.test(value),
  );
}

/** Lo que una fuente debe respaldar para quedar como cita del bloque. */
interface BlockClaims {
  dates: DateMention[];
  /** Cifras que no forman parte de una fecha completa. */
  numbers: string[];
  /** Palabras de cada viñeta, sin marcador, citas ni cifras. */
  items: string[];
  /** Introducción y viñetas, para medir el vocabulario compartido. */
  text: string;
  /** Hay un mes que no forma parte de una fecha completa: no se puede comprobar. */
  unverifiable: boolean;
}

/** Cuántos términos distintivos del bloque aparecen en la fuente. */
function termOverlap(blockText: string, source: RetrievedChunk): number {
  const sourceTerms = new Set(normalizedTerms(source.chunkContent));
  return normalizedTerms(blockText).filter((term) => sourceTerms.has(term))
    .length;
}

/**
 * Fuente(s) que respaldan todo el bloque: cada fecha completa y cada cifra
 * figuran en la fuente y cada viñeta comparte vocabulario con ella. Si varias lo
 * cumplen gana la que más términos del bloque contiene y, a igualdad, la que el
 * modelo citó primero. Cuando ninguna basta sola, se admite un par de
 * fragmentos del mismo documento (un cronograma partido en dos fragmentos) que
 * juntos cubran todo.
 */
function supportingRanks(
  candidates: number[],
  claims: BlockClaims,
  sources: RetrievedChunk[],
): number[] | null {
  if (claims.unverifiable) return null;
  const usable = candidates.filter((rank) => sources[rank - 1]);
  const covers = (ranks: number[]) =>
    claims.dates.every((date) =>
      ranks.some((rank) => sourceHasDate(sources[rank - 1], date)),
    ) &&
    claims.numbers.every((number) =>
      ranks.some((rank) => sourceHasNumber(sources[rank - 1], number)),
    ) &&
    claims.items.every((item) =>
      ranks.some((rank) => sourceSupportsClaim(item, sources[rank - 1])),
    );

  const single = usable.filter((rank) => covers([rank]));
  if (single.length) {
    const best = single.reduce((chosen, rank) =>
      termOverlap(claims.text, sources[rank - 1]) >
      termOverlap(claims.text, sources[chosen - 1])
        ? rank
        : chosen,
    );
    return [best];
  }

  if (!claims.dates.length && !claims.numbers.length) return null;
  for (const [position, first] of usable.entries()) {
    for (const second of usable.slice(position + 1)) {
      const pair = [first, second];
      if (
        sources[first - 1].documentVersionId ===
          sources[second - 1].documentVersionId &&
        covers(pair)
      ) {
        return pair.sort((left, right) => left - right);
      }
    }
  }
  return null;
}

function withBlockCitation(intro: string, ranks: number[]): string {
  const label = intro.trimEnd();
  const cites = ranks.map((rank) => `[${rank}]`).join('');
  // Un rótulo en negrita («**Proceso de solicitud**:») no es una frase: se deja
  // tal cual y la cita va después.
  if (/^[ \t]*\*\*[^*]+\*\*[ \t]*[:：]?$/u.test(label))
    return `${label} ${cites}`;
  // «…las siguientes:» pasa a «…las siguientes. [4]»: la cita cierra la frase
  // que introduce la lista, como en el resto de la respuesta.
  return `${label.replace(/[:：]$/u, '.')} ${cites}`;
}

function blockClaims(
  introLine: string,
  itemLines: string[],
  sourceCount: number,
): BlockClaims {
  const clean = (line: string) =>
    stripCitations(line, sourceCount).replace(LIST_ITEM_LINE, '').trim();
  // Un año o un día no cuentan como vocabulario compartido: las cifras se
  // comprueban aparte, y una viñeta sin palabras propias no se exige.
  const items = itemLines
    .map((line) => clean(line).replace(/\d+/gu, ' '))
    .filter((item) => normalizedTerms(item).length > 0);
  const text = [introLine, ...itemLines].map(clean).join('\n');
  const { dates, rest } = extractDates(text);
  return {
    dates,
    items,
    numbers: rest.match(/\d+(?:[.,]\d+)*/gu) ?? [],
    text,
    unverifiable: mentionsUnparsedMonth(rest),
  };
}

/**
 * Coloca la cita de una lista en la frase que la introduce.
 *
 * Los modelos suelen dejar las viñetas sin cita y acumular las citas al final
 * del mensaje, o citar solo tras la última viñeta. Cuando la introducción de una
 * lista no trae cita y la lista no la lleva por elemento, se le asigna la
 * fuente que ya citó la respuesta y que respalda todo el bloque: cada fecha
 * completa y cada cifra (plazos, importes) figuran en el fragmento y cada
 * viñeta comparte vocabulario con él. Nunca se inventa una fuente (solo se
 * eligen las citadas en la respuesta), no se tocan listas con citas por
 * elemento, tablas ni prosa, y si ninguna fuente respalda el bloque el texto
 * queda como lo escribió el modelo.
 */
export function placeBlockCitations(
  answer: string,
  sources: RetrievedChunk[],
): string {
  if (!sources.length) return answer;
  const answerRanks = validRanks(answer, sources.length);
  if (!answerRanks.length) return answer;

  const lines = answer.replace(/\r\n?/gu, '\n').split('\n');
  const kinds = lines.map(lineKind);
  let changed = false;

  for (const { end, intro, start } of listRuns(lines, kinds)) {
    if (intro === null) continue;
    if (validRanks(lines[intro], sources.length).length) continue;

    const citedLines = [];
    for (let index = start; index <= end; index += 1) {
      if (validRanks(lines[index], sources.length).length) {
        citedLines.push(index);
      }
    }
    const tailOnly = citedLines.length === 1 && citedLines[0] === end;
    if (citedLines.length && !tailOnly) continue;

    const claims = blockClaims(
      lines[intro],
      lines.slice(start, end + 1),
      sources.length,
    );
    const hasFigures = claims.dates.length > 0 || claims.numbers.length > 0;
    const tailRanks = tailOnly ? validRanks(lines[end], sources.length) : [];

    // La cita que el modelo dejó tras la última viñeta se sube a la frase
    // introductoria si respalda el bloque completo.
    const hoisted = tailRanks.filter(
      (rank) => supportingRanks([rank], claims, sources) !== null,
    );
    let chosen: number[] | null = hoisted.length
      ? hoisted
      : supportingRanks(tailRanks, claims, sources);
    const fromTail = chosen !== null;
    // Sin cifras no hay con qué distinguir entre las fuentes de la respuesta:
    // solo se reubica la cita que el modelo ya había puesto en la lista.
    if (!chosen && hasFigures) {
      chosen = supportingRanks(
        answerRanks.filter((rank) => !tailRanks.includes(rank)),
        claims,
        sources,
      );
    }
    if (!chosen) continue;

    lines[intro] = withBlockCitation(lines[intro], chosen);
    // La viñeta conserva sus citas si alguna no se subió: la cita de bloque no
    // la sustituye y quitarla podría dejarla con una fuente que no la respalda.
    if (fromTail && tailRanks.every((rank) => chosen.includes(rank))) {
      lines[end] = stripCitations(lines[end], sources.length).trimEnd();
    }
    changed = true;
  }

  return changed ? lines.join('\n') : answer;
}
