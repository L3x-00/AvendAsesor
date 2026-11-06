import { withoutCitations } from './citations';
import { extractDates, sourceHasDate } from './claim-dates';
import type { RetrievedChunk } from './retrieval.gateway';

/** Viñeta: guion, asterisco, viñeta, raya o número de orden seguidos de espacio. */
export const LIST_ITEM_LINE = /^[ \t\u00A0]*(?:[-*•–—]|\d+[.)])[ \t\u00A0]+/u;

const QUALITY_STOP_WORDS = new Set([
  'acerca',
  'ademas',
  'como',
  'conforme',
  'cuando',
  'desde',
  'donde',
  'esta',
  'este',
  'estos',
  'fuente',
  'informacion',
  'norma',
  'para',
  'porque',
  'puede',
  'respuesta',
  'segun',
  'sobre',
  'tambien',
]);

export function normalizedTerms(value: string): string[] {
  return [
    ...new Set(
      (
        value
          .normalize('NFD')
          .replace(/\p{Diacritic}/gu, '')
          .toLocaleLowerCase('es')
          .match(/[\p{L}\p{N}]{4,}/gu) ?? []
      ).filter((term) => !QUALITY_STOP_WORDS.has(term)),
    ),
  ];
}

export function sourceSupportsClaim(
  claim: string,
  source: RetrievedChunk,
): boolean {
  if (assessClaimSupport(claim, source) === 'contradicted') return false;
  const claimTerms = normalizedTerms(withoutCitations(claim));
  if (!claimTerms.length) return true;

  const sourceTerms = normalizedTerms(source.chunkContent);
  return claimTerms.some((claimTerm) =>
    sourceTerms.some(
      (sourceTerm) =>
        sourceTerm === claimTerm ||
        (claimTerm.length >= 6 &&
          sourceTerm.length >= 6 &&
          (sourceTerm.startsWith(claimTerm.slice(0, 6)) ||
            claimTerm.startsWith(sourceTerm.slice(0, 6)))),
    ),
  );
}

export type ClaimSupport = 'supported' | 'contradicted' | 'unknown';

/**
 * A bounded textual comparison, not a legal entailment oracle. Keep function
 * words and order: changing polarity is not equivalent to sharing a topic.
 * Other paraphrases and incomplete contexts remain explicitly unverified.
 */
export function assessClaimSupport(
  claim: string,
  source: RetrievedChunk,
): ClaimSupport {
  const tokens = (text: string): string[] =>
    text
      .trim()
      .replace(/\.+$/u, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase('es')
      .match(/[\p{L}\p{N}]+|\n|[^\s\p{L}\p{N}]/gu) ?? [];
  const requested = tokens(withoutCitations(claim).replace(LIST_ITEM_LINE, ''));
  const polarityWords = new Set(['no', 'nunca', 'jamas', 'tampoco']);
  const withoutPolarity = (words: string[]) =>
    words.filter((word) => !polarityWords.has(word));
  const equal = (left: string[], right: string[]) =>
    left.length === right.length &&
    left.every((word, index) => word === right[index]);
  if (!requested.length) return 'unknown';
  const content = tokens(source.chunkContent);
  // Exact full-content correspondence preserves the complete supplied scope.
  if (equal(requested, content)) return 'supported';
  const requestedBody = withoutPolarity(requested);
  {
    // Do not split source context: a heading or adjacent exception can change
    // which statement applies. A partial alignment is always unknown.
    const original = content;
    // "No solo" and "no únicamente" are focus constructions, not negation
    // of the following proposition. Do not infer polarity for these cases.
    const focus = (words: string[]) =>
      words.some(
        (word, index) =>
          word === 'no' &&
          ['solo', 'solamente', 'unicamente'].includes(words[index + 1] ?? ''),
      );
    if (focus(original) || focus(requested)) return 'unknown';
    if (!equal(requestedBody, withoutPolarity(original))) return 'unknown';
    const originalPolarity = original.filter((word) => polarityWords.has(word));
    const requestedPolarity = requested.filter((word) =>
      polarityWords.has(word),
    );
    if ((originalPolarity.length === 0) !== (requestedPolarity.length === 0)) {
      return 'contradicted';
    }
  }
  return 'unknown';
}

/** Texto de una afirmación sin citas ni número de orden de viñeta. */
function claimText(claim: string): string {
  // El número de orden no es un dato. Solo se retira si va seguido de
  // espacio, para no cortar una fecha o un decimal («13.01.2026»).
  return withoutCitations(claim).replace(LIST_ITEM_LINE, '');
}

/**
 * Las cifras de una afirmación deben figurar completas en el contenido.
 * La identidad o fecha editorial de una norma no acredita un plazo, importe
 * o período de aplicación. Tampoco se admite un número dentro de otro.
 */
function sourceContainsNumber(source: RetrievedChunk, number: string): boolean {
  const contentNumbers: string[] =
    source.chunkContent.match(/\d+(?:[.,]\d+)*/gu) ?? [];
  return contentNumbers.includes(number);
}

/**
 * Fechas completas y cifras de la afirmación (días, plazos, N.° de ley o de
 * artículo) que no figuran en ninguna fuente citada: señal de que el modelo pudo
 * completar de memoria. Una fecha se comprueba entera (día, mes y año) y en
 * cualquiera de sus formas, porque el modelo la escribe «13 de enero de 2026»
 * aunque la fuente diga «13.01.2026». Solo marca el caso para revisión humana;
 * no decide la verdad jurídica.
 */
export function claimNumbersAppearInSources(
  claim: string,
  citedSources: RetrievedChunk[],
): boolean {
  const { dates, rest } = extractDates(claimText(claim));
  return (
    dates.every((date) =>
      citedSources.some((source) => sourceHasDate(source, date)),
    ) &&
    (rest.match(/\d+(?:[.,]\d+)*/gu) ?? []).every((number) =>
      citedSources.some((source) => sourceContainsNumber(source, number)),
    )
  );
}
