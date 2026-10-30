import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

const MIN_EVIDENCE_CHARS = 1;

interface RecoveredDocumentIdentity {
  issuanceYear: number;
  resolutionNumber: string;
  title: string;
}

/**
 * Algunas cargas históricas conservaron el archivo correcto pero grabaron en
 * su ficha el título de la ley habilitante. Cuando el propio extracto abre con
 * la identidad de un Decreto Supremo y la ficha no declara ningún decreto, la
 * cita se corrige en memoria para no atribuir la afirmación a la norma
 * equivocada. No se inventa una identidad: se limita a la cabecera textual de
 * la misma fuente recuperada.
 */
const DECREE_HEADING =
  /\bdecreto\s+supremo\s+n\s*[.°º]*\s*(\d{1,8}\s*-\s*(?:19|20)\d{2}\s*-\s*[a-z]{2,20})\b(?=[\s\S]{0,280}\b(?:el|la)\s+(?:presidente|presidenta)\s+de\s+la\s+rep[uú]blica\b)/iu;
const DECREE_IN_TITLE = /\b(?:decreto\s+supremo|\bds\b)\b/iu;

function recoveredDocumentIdentity(
  source: RetrievedChunk,
): RecoveredDocumentIdentity | null {
  if (
    source.documentType !== 'DECRETO_SUPREMO' ||
    DECREE_IN_TITLE.test(source.documentTitle) ||
    source.pageStart !== 1
  ) {
    return null;
  }
  // Solo la cabecera de la primera página identifica al documento completo.
  // Un decreto mencionado en una página posterior puede ser una cita, anexo o
  // norma derogada y no debe sustituir los metadatos de la versión recuperada.
  const match = DECREE_HEADING.exec(source.chunkContent.slice(0, 600));
  const rawNumber = match?.[1];
  if (!rawNumber) return null;
  const resolutionNumber = rawNumber.replace(/\s*/gu, '').toUpperCase();
  const year = Number(/-(\d{4})-/u.exec(resolutionNumber)?.[1]);
  if (!Number.isInteger(year)) return null;
  return {
    issuanceYear: year,
    resolutionNumber,
    title: `Decreto Supremo N.° ${resolutionNumber}`,
  };
}

/**
 * Propaga la identidad recuperada a los demás fragmentos de la misma versión.
 * Así el artículo que contiene el monto y la portada que contiene el número
 * siguen siendo una única fuente verificable en la respuesta y en la cita.
 */
export function reconcileRetrievedDocumentIdentities(
  sources: RetrievedChunk[],
): RetrievedChunk[] {
  const identities = new Map<string, RecoveredDocumentIdentity>();
  for (const source of sources) {
    const identity = recoveredDocumentIdentity(source);
    if (identity) identities.set(source.documentVersionId, identity);
  }
  if (!identities.size) return sources;
  return sources.map((source) => {
    const identity = identities.get(source.documentVersionId);
    return identity
      ? {
          ...source,
          documentTitle: identity.title,
          issuanceYear: identity.issuanceYear,
          resolutionNumber: identity.resolutionNumber,
        }
      : source;
  });
}

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
/**
 * Frases del sello de firma digital del SINAD (MINEDU), en su redacción real.
 * La extracción del PDF suele pegar el sello al texto siguiente sin separar el
 * párrafo —en el oficio del destaque 2026, a la tabla completa del
 * cronograma—, así que se quita frase por frase lo que es sello y se conserva
 * lo que viene después. Los espacios admiten saltos de línea.
 */
const SIGNATURE_SEAL_SENTENCES: readonly RegExp[] = [
  'documento electr[oó]nico firmado digitalmente en el marco de la ley n\\.?\\s*[°º]?\\s*27269\\s*, ley de firmas y certificados digitales\\s*, su reglamento y modificatorias\\s*\\.?',
  'la integridad del documento y la autor[ií]a de la\\(s\\) firma\\(s\\) pueden ser verificadas en\\s*:?\\s*https?://\\S+',
  'expediente\\s*:\\s*\\S+ clave\\s*:\\s*\\S+',
  'esto es una copia aut[eé]ntica imprimible de un documento electr[oó]nico archivado en [^.]{1,120}?\\s*, aplicando lo dispuesto por el art\\.\\s*25 de d\\.\\s*s\\.\\s*070\\s*-\\s*2013\\s*-\\s*pcm y la tercera disposici[oó]n complementaria final del d\\.\\s*s\\.\\s*026\\s*-\\s*2016\\s*-\\s*pcm\\s*\\.?',
  'su autenticidad e integridad pueden ser contrastadas a trav[eé]s de la siguiente direcci[oó]n web\\s*:?\\s*https?://\\S+',
].map((source) => new RegExp(`^${source.replaceAll(' ', '\\s+')}`, 'iu'));

/**
 * Texto que sigue a un sello inicial reconocido por completo (vacío si el
 * párrafo era solo sello). `null` cuando el sello no coincide con la redacción
 * conocida: entonces se aplica la regla general, que corta por la primera
 * entrada del MINEDU o por la oración educativa.
 */
function withoutLeadingSignatureSeal(paragraph: string): string | null {
  let rest = paragraph.trimStart();
  let removed = false;
  for (;;) {
    const sentence = SIGNATURE_SEAL_SENTENCES.find((pattern) =>
      pattern.test(rest),
    );
    if (!sentence) break;
    rest = rest.replace(sentence, '').replace(/^[\s.;,]+/u, '');
    removed = true;
  }
  if (!removed || VERIFICATION_BOILERPLATE.test(rest)) return null;
  return rest;
}
/**
 * Cabeceras de página del diario oficial. No identifican el pasaje normativo
 * que sustenta una respuesta, aun cuando hayan quedado como `section_title`
 * durante la ingesta.
 */
const OFFICIAL_GAZETTE_BOILERPLATE =
  /\b(?:\d+\s+)?normas legales\b|\b(?:diario oficial\s+)?el peruano\b/iu;
// Un título normativo auténtico puede mencionar El Peruano (por ejemplo,
// «Artículo 3.- Publicación en El Peruano»); se conserva solo si empieza con
// una estructura jurídica comprobable, nunca si es la cabecera de la página.
const STRUCTURED_SECTION_TITLE =
  /^\s*(?:art[ií]culo\s+[\dIVXLCDM]+(?:[.°º-]+)?|cap[ií]tulo\s+[\wIVXLCDM.-]+|t[ií]tulo\s+[\wIVXLCDM.-]+|secci[oó]n\s+[\wIVXLCDM.-]+|anexo\s+[\wIVXLCDM.-]+|disposici[oó]n(?:es)?\s+[\wIVXLCDM.-]+)/iu;
const REFERENCE_PART_SEPARATOR = /\s*·\s*/u;
const LITERAL_REFERENCE = /^(?:literal|inciso)\s+([a-z])\)$/iu;

function hasOfficialGazetteHeader(value: string): boolean {
  return (
    OFFICIAL_GAZETTE_BOILERPLATE.test(value) &&
    !STRUCTURED_SECTION_TITLE.test(value)
  );
}

function sectionIsBoilerplate(sectionTitle: string): boolean {
  return (
    VERIFICATION_BOILERPLATE.test(sectionTitle) ||
    ENERGY_SECTOR.test(sectionTitle) ||
    hasOfficialGazetteHeader(sectionTitle)
  );
}

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

  const afterSeal = withoutLeadingSignatureSeal(cleaned);
  if (afterSeal !== null) {
    if (!afterSeal) return null;
    cleaned = afterSeal;
  } else if (VERIFICATION_BOILERPLATE.test(cleaned)) {
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

function normalizedTextIncludes(content: string, reference: string): boolean {
  const normalizedReference = normalizeSpanishText(reference);
  if (!normalizedReference) return false;
  const escapedReference = normalizedReference.replace(
    /[.*+?^${}()|[\]\\]/gu,
    '\\$&',
  );
  return new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${escapedReference}(?=$|[^\\p{L}\\p{N}])`,
    'u',
  ).test(normalizeSpanishText(content));
}

function listedLiteralStillAppears(
  reference: string,
  content: string,
): boolean {
  const literal = LITERAL_REFERENCE.exec(reference.trim())?.[1];
  if (!literal) return false;
  const escapedLiteral = literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(
    `(?:\\b(?:literal|inciso)\\s+${escapedLiteral}\\)(?=\\s|$)|(?:^|\\n{1,2})\\s*${escapedLiteral}\\)(?=\\s|$))`,
    'iu',
  ).test(content);
}

function referenceStillAppears(
  reference: string | null,
  content: string,
): string | null {
  if (!reference) return null;
  if (normalizedTextIncludes(content, reference)) return reference;

  const parts = reference
    .split(REFERENCE_PART_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
  if (
    parts.length > 1 &&
    parts.every(
      (part) =>
        normalizedTextIncludes(content, part) ||
        listedLiteralStillAppears(part, content),
    )
  ) {
    return reference;
  }

  return listedLiteralStillAppears(reference, content) ? reference : null;
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

  const sectionInvalid =
    !source.sectionTitle || sectionIsBoilerplate(source.sectionTitle);

  return {
    ...source,
    articleReference: referenceStillAppears(
      source.articleReference,
      chunkContent,
    ),
    chunkContent,
    numeralReference: referenceStillAppears(
      source.numeralReference,
      chunkContent,
    ),
    // Una oración recuperada no demuestra ser un título o subtítulo. Si la
    // ingesta guardó una cabecera genérica del diario oficial, se omite; la UI
    // mostrará solo las referencias verificables (artículo/literal) o avisará
    // que no hay una ubicación más precisa.
    sectionTitle: sectionInvalid ? null : source.sectionTitle,
  };
}
