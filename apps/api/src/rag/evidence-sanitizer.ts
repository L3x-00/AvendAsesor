import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

const MIN_EVIDENCE_CHARS = 1;
const MAX_SECTION_CHARS = 180;

/**
 * Páginas de El Peruano anexadas a una resolución del MINEDU pueden contener
 * el inicio de la norma del sector siguiente. Ese texto no pertenece al
 * documento educativo aunque haya quedado dentro del mismo PDF.
 */
const ENERGY_SECTOR =
  /\b(?:energ[ií]a y minas|ministerio de energ[ií]a y minas|minem(?:\/|\b)|ingemmet|direcci[oó]n general de electricidad|concesiones? el[eé]ctricas?)\b/iu;
const ENERGY_SECTOR_HEADER = /\b(?:\d{6,}-\d+\s+)?energ[ií]a y minas\b/iu;
const EDUCATION_SECTOR =
  /\b(?:minedu|ministerio de educaci[oó]n|educaci[oó]n|educativ[oa]s?|auxiliares? de educaci[oó]n|docentes?|ugel|dre)\b/iu;
const MINEDU_ENTRY =
  /\b(?:resoluci[oó]n\s+(?:viceministerial|ministerial|suprema)\s+)?n[.°º\s]*\d{2,4}\s*-\s*\d{4}\s*-\s*minedu\b/iu;
const VERIFICATION_BOILERPLATE =
  /^(?:documento electr[oó]nico firmado digitalmente|la integridad del documento y la autor[ií]a|esto es una copia aut[eé]ntica|su autenticidad e integridad pueden ser contrastadas)/iu;

function trimAdjacentSector(paragraph: string): string {
  const sectorHeader = ENERGY_SECTOR_HEADER.exec(paragraph);
  if (
    sectorHeader?.index &&
    EDUCATION_SECTOR.test(paragraph.slice(0, sectorHeader.index))
  ) {
    return paragraph.slice(0, sectorHeader.index).trim();
  }

  if (ENERGY_SECTOR.test(paragraph) && EDUCATION_SECTOR.test(paragraph)) {
    const mineduEntry = MINEDU_ENTRY.exec(paragraph);
    if (
      mineduEntry?.index &&
      ENERGY_SECTOR.test(paragraph.slice(0, mineduEntry.index))
    ) {
      return paragraph.slice(mineduEntry.index).trim();
    }
  }

  return paragraph;
}

function cleanParagraph(paragraph: string): string | null {
  let cleaned = trimAdjacentSector(paragraph.trim());
  if (!cleaned) return null;

  if (VERIFICATION_BOILERPLATE.test(cleaned)) {
    const mineduEntry = MINEDU_ENTRY.exec(cleaned);
    if (mineduEntry) {
      cleaned = cleaned.slice(mineduEntry.index).trim();
    } else {
      const educationEntry = EDUCATION_SECTOR.exec(cleaned);
      if (!educationEntry) return null;
      const prefix = cleaned.slice(0, educationEntry.index);
      const sentenceBoundary = Math.max(
        prefix.lastIndexOf('. '),
        prefix.lastIndexOf('? '),
        prefix.lastIndexOf('! '),
        prefix.lastIndexOf('… '),
      );
      if (sentenceBoundary < 0) return null;
      cleaned = cleaned.slice(sentenceBoundary + 2).trim();
    }
  }

  if (ENERGY_SECTOR.test(cleaned) && !EDUCATION_SECTOR.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function meaningfulSection(content: string): string | null {
  const normalized = content.replace(/\s+/gu, ' ').trim();
  const sentences = normalized.match(/.*?(?:[.!?…]+(?=\s|$)|$)/gu) ?? [];
  const sentence = sentences
    .map((item) => item.trim())
    .find(
      (item) =>
        item.length >= 15 &&
        !VERIFICATION_BOILERPLATE.test(item) &&
        !ENERGY_SECTOR.test(item),
    );
  if (!sentence) return null;
  return sentence.length > MAX_SECTION_CHARS
    ? `${sentence.slice(0, MAX_SECTION_CHARS).trimEnd()}…`
    : sentence;
}

function referenceStillAppears(
  reference: string | null,
  content: string,
): string | null {
  if (!reference) return null;
  return normalizeSpanishText(content).includes(normalizeSpanishText(reference))
    ? reference
    : null;
}

/**
 * Limpia únicamente contaminación demostrable del periódico y sellos de
 * validación. El identificador del chunk se conserva para que la cita siga
 * siendo auditable contra la fuente persistida.
 */
export function sanitizeRetrievedEvidence(
  source: RetrievedChunk,
): RetrievedChunk | null {
  const paragraphs = source.chunkContent
    .split(/\n{2,}/u)
    .map(cleanParagraph)
    .filter((item): item is string => Boolean(item));
  const chunkContent = paragraphs.join('\n\n').trim();
  if (chunkContent.length < MIN_EVIDENCE_CHARS) return null;
  const contentChanged = chunkContent !== source.chunkContent.trim();

  const sectionInvalid =
    !source.sectionTitle ||
    VERIFICATION_BOILERPLATE.test(source.sectionTitle) ||
    ENERGY_SECTOR.test(source.sectionTitle);

  return {
    ...source,
    articleReference: contentChanged
      ? referenceStillAppears(source.articleReference, chunkContent)
      : source.articleReference,
    chunkContent,
    numeralReference: contentChanged
      ? referenceStillAppears(source.numeralReference, chunkContent)
      : source.numeralReference,
    sectionTitle: sectionInvalid
      ? meaningfulSection(chunkContent)
      : source.sectionTitle,
  };
}
