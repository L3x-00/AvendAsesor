import { Injectable } from '@nestjs/common';
import { MAX_EXTRACTED_CHARS } from './document-format';
import type { ExtractedPage } from './chunking.service';

/**
 * MinerU entrega Markdown con un marcador al inicio de cada página física:
 * `<!-- page 3 of 120 -->`. El sidecar conserva esa ubicación para que las
 * citas sigan apuntando al PDF original; el contenido de tablas se mantiene en
 * Markdown (con sus saltos de línea) para que el troceo no lo aplane.
 */
const PAGE_MARKER = /<!--\s*page\s+(\d+)(?:\s+of\s+(\d+))?\s*-->/giu;
const MAX_PAGE_NUMBER = 300;

/**
 * TD-008: el sidecar lleva el SHA-256 del PDF del que se generó. La ingesta lo
 * compara con el PDF canónico antes de usar el Markdown; un sidecar de otro
 * documento no puede indexarse con las páginas del actual.
 */
export const SIDECAR_PDF_HASH_MARKER = 'avend-pdf-sha256';
const PDF_HASH_MARKER = new RegExp(
  `<!--\\s*${SIDECAR_PDF_HASH_MARKER}:\\s*([a-f0-9]{64})\\s*-->`,
  'iu',
);

export function sidecarPdfHash(markdown: string): string | null {
  return PDF_HASH_MARKER.exec(markdown)?.[1]?.toLowerCase() ?? null;
}

function cleanMarkdown(value: string): string {
  return (
    value
      .replace(/\r\n?/gu, '\n')
      // Las imágenes no aportan texto al índice; si traen texto alternativo
      // útil, se conserva como una línea normal.
      .replace(/!\[([^\]]*)\]\([^)]*\)/gu, (_, alt: string) =>
        alt.trim() ? alt.trim() : ' ',
      )
      .replace(/<img\b[^>]*>/giu, ' ')
      .replace(/<!--(?!\s*page\s+\d+)[\s\S]*?-->/giu, ' ')
      .replace(/[ \t]+\n/gu, '\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trim()
  );
}

export function parseMineruMarkdown(
  markdown: string,
  expectedPageCount: number | null = null,
  expectedPdfHash: string | null = null,
): ExtractedPage[] | null {
  if (!markdown.trim() || markdown.length > MAX_EXTRACTED_CHARS) return null;
  if (markdown.includes('\0') || markdown.includes('\uFFFD')) return null;
  // TD-008: cuando se exige una huella, un sidecar sin marca o de otro PDF se
  // descarta por completo en vez de indexarse con páginas que no le corresponden.
  if (
    expectedPdfHash !== null &&
    sidecarPdfHash(markdown) !== expectedPdfHash.toLowerCase()
  ) {
    return null;
  }

  const text = markdown.replace(/\r\n?/gu, '\n');
  const matches = [...text.matchAll(PAGE_MARKER)];
  if (!matches.length) return null;

  const pageText = new Map<number, string[]>();
  let currentPage: number | null = null;
  let cursor = 0;
  let minMarker = Number.POSITIVE_INFINITY;
  let maxMarker = 0;
  let declaredTotal: number | null = null;
  for (const match of matches) {
    const pageNumber = Number(match[1]);
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > MAX_PAGE_NUMBER ||
      (expectedPageCount !== null && pageNumber > expectedPageCount)
    ) {
      return null;
    }
    if (match[2]) {
      const total = Number(match[2]);
      if (!Number.isInteger(total) || total < 1 || total > MAX_PAGE_NUMBER) {
        return null;
      }
      if (declaredTotal !== null && declaredTotal !== total) return null;
      declaredTotal = total;
    }
    minMarker = Math.min(minMarker, pageNumber);
    maxMarker = Math.max(maxMarker, pageNumber);
    if (currentPage !== null) {
      const content = cleanMarkdown(text.slice(cursor, match.index));
      if (content) pageText.get(currentPage)?.push(content);
    }
    currentPage = pageNumber;
    if (!pageText.has(pageNumber)) pageText.set(pageNumber, []);
    cursor = (match.index ?? 0) + match[0].length;
  }
  if (currentPage !== null) {
    const content = cleanMarkdown(text.slice(cursor));
    if (content) pageText.get(currentPage)?.push(content);
  }
  // Una conversión parcial no debe indexar solo una parte del PDF como si
  // fuera el documento completo; en ese caso se vuelve a la extracción PDF.
  if (
    minMarker !== 1 ||
    (declaredTotal !== null && declaredTotal !== maxMarker) ||
    (expectedPageCount !== null && maxMarker !== expectedPageCount)
  ) {
    return null;
  }
  // Una página vacía suele ser una página escaneada que MinerU no pudo leer.
  // Se prefiere la extracción PDF + OCR antes que indexar un hueco silencioso.
  for (let pageNumber = 1; pageNumber <= maxMarker; pageNumber += 1) {
    const content = (pageText.get(pageNumber) ?? []).join('\n').trim();
    if (!content) return null;
  }

  const pages = [...pageText.entries()]
    .sort(([left], [right]) => left - right)
    .map(([pageNumber, parts]) => ({
      pageNumber,
      text: cleanMarkdown(parts.join('\n\n')),
    }))
    .filter((page) => page.text.length > 0);

  return pages.length ? pages : null;
}

@Injectable()
export class MineruMarkdownService {
  extract(
    markdown: string,
    expectedPageCount: number | null = null,
    expectedPdfHash: string | null = null,
  ): ExtractedPage[] | null {
    return parseMineruMarkdown(markdown, expectedPageCount, expectedPdfHash);
  }
}
