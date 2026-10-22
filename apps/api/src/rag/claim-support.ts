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

/** Texto de una afirmación sin citas ni número de orden de viñeta. */
function claimText(claim: string): string {
  // El número de orden no es un dato. Solo se retira si va seguido de
  // espacio, para no cortar una fecha o un decimal («13.01.2026»).
  return withoutCitations(claim).replace(LIST_ITEM_LINE, '');
}

/** La cifra figura en el fragmento o en los metadatos de la fuente. */
function sourceContainsNumber(source: RetrievedChunk, number: string): boolean {
  return [
    source.chunkContent,
    source.articleReference,
    source.numeralReference,
    source.resolutionNumber,
    source.issuanceYear?.toString(),
    source.documentTitle,
  ].some((value) => value?.includes(number));
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
