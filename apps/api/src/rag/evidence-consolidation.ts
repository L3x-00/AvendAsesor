import type { RetrievedChunk } from './retrieval.gateway';
import { normalizeSpanishText } from './text-normalization';

/**
 * Consolidación de la evidencia por documento. La unidad visible de una
 * respuesta es el documento (su versión), no el fragmento: cinco fragmentos
 * del mismo archivo no deben ocupar cinco referencias. Esta política se aplica
 * DESPUÉS de decidir la ruta de módulo (esa decisión necesita todas las
 * asociaciones) y DESPUÉS de elegir la banda de relevancia.
 *
 * Los fragmentos contiguos o superpuestos del mismo archivo forman una sola
 * ubicación: se conserva el más relevante y solo se añade un vecino de esa
 * misma ubicación si aporta algo material (condición, excepción, requisito o
 * cifra distinta). Una ubicación claramente separada del archivo (otro tramo de
 * páginas) se conserva como segunda referencia, con el tope de referencias por
 * documento. Cada referencia conservada sigue siendo un fragmento real —con su
 * rango de páginas, su artículo y su identificador— para que la cita [n] siga
 * apuntando a la fuente correcta.
 */

/**
 * Marcas de condición, excepción, exclusión, requisito o límite. Un fragmento
 * que las aporte no puede desaparecer solo porque comparte documento con otro:
 * puede cambiar materialmente la respuesta. Incluye negaciones y
 * restricciones habituales del texto normativo («solo», «tampoco», «sin
 * perjuicio»), además de las condiciones y topes explícitos.
 */
const MATERIAL_MARKERS: readonly string[] = [
  'a excepcion',
  'a partir de',
  'excepto',
  'excepcion',
  'en caso de',
  'incompatible',
  'maximo',
  'minimo',
  'no acumulable',
  'no aplica',
  'no computable',
  'no corresponde',
  'no menos de',
  'no mas de',
  'no percibe',
  'no perciben',
  'no podra',
  'no podran',
  'no procede',
  'no recibe',
  'no reciben',
  'no se reconoce',
  'no tiene derecho',
  'requiere',
  'requisito',
  'salvo',
  'siempre que',
  'siempre y cuando',
  'sin derecho',
  'sin necesidad',
  'sin perjuicio',
  'solo',
  'solamente',
  'tampoco',
  'tope',
  'unicamente',
];

/**
 * Cifras que pueden cambiar una respuesta: importes, porcentajes, cantidades
 * con unidad y años sueltos. Una referencia de página, un número de artículo o
 * numeral aislado o un código de norma no cuentan: aparecen hasta en los pies de
 * firma y harían que un fragmento sin contenido propio pareciera material. Por
 * eso el año debe ir suelto («el año 2026») y no dentro de un código
 * («N.° 049-2025-EF»), y una cifra con decimales debe ser un importe («3.50»),
 * no un numeral de artículo («Artículo 5.1»).
 */
const SUBSTANTIVE_FIGURE_PATTERN =
  /s\/\.?\s*\d[\d .,]*|\b\d{1,3}(?:[ .,]\d{3})+(?:[.,]\d{1,2})?\b|\b\d+[.,]\d{2}\b|\b\d+(?:[.,]\d+)?\s*(?:%|por\s+ciento\b|(?:horas?|dias?|semanas?|meses|anos?|minutos?|habiles)\b)|(?<![\d-])(?:19|20)\d{2}(?![\d-])/u;

function normalizedContent(value: string): string {
  return normalizeSpanishText(value);
}

function substantiveFiguresIn(text: string): Set<string> {
  return new Set(text.match(SUBSTANTIVE_FIGURE_PATTERN) ?? []);
}

/**
 * El fragmento trae una cifra propia: un plazo «de cinco días» cuenta como
 * «5 dias», pero una referencia de página («Página 90 de 120»), un número de
 * artículo aislado o un código no convierten un pie de firma en contenido.
 */
function hasSubstantiveFigure(text: string): boolean {
  return substantiveFiguresIn(text).size > 0;
}

function markersIn(text: string): string[] {
  return MATERIAL_MARKERS.filter((marker) => text.includes(marker));
}

function normalizedReference(reference: string | null): string {
  return normalizeSpanishText(reference ?? '');
}

/**
 * Un fragmento es materialmente distinto cuando aporta algo que el fragmento
 * conservado no dice: una condición, excepción, límite o requisito; una cifra
 * que no aparece en el conservado; o una ubicación estructural propia
 * (artículo, numeral) que el conservado no menciona. Solo estos fragmentos
 * justifican una segunda referencia visible del mismo documento.
 */
export function isMateriallyDistinct(
  primary: RetrievedChunk,
  candidate: RetrievedChunk,
): boolean {
  const primaryText = normalizedContent(primary.chunkContent);
  const candidateText = normalizedContent(candidate.chunkContent);

  for (const marker of markersIn(candidateText)) {
    if (!primaryText.includes(marker)) return true;
  }

  const primaryFigures = substantiveFiguresIn(primaryText);
  for (const figure of substantiveFiguresIn(candidateText)) {
    if (!primaryFigures.has(figure)) return true;
  }

  const primaryReferences = new Set([
    normalizedReference(primary.articleReference),
    normalizedReference(primary.numeralReference),
  ]);
  for (const reference of [
    candidate.articleReference,
    candidate.numeralReference,
  ]) {
    const normalized = normalizedReference(reference);
    if (
      normalized &&
      !primaryReferences.has(normalized) &&
      !primaryText.includes(normalized)
    ) {
      return true;
    }
  }

  return false;
}

/** Dos fragmentos cubren páginas contiguas o superpuestas del mismo archivo. */
export function isContiguousLocation(
  left: RetrievedChunk,
  right: RetrievedChunk,
): boolean {
  return (
    left.pageStart <= right.pageEnd + 1 && right.pageStart <= left.pageEnd + 1
  );
}

/**
 * Ubicación contigua de cada fragmento dentro de su documento: los fragmentos
 * de páginas contiguas o superpuestas comparten ubicación. Se recorre el
 * archivo en orden de páginas para que una cadena de fragmentos vecinos
 * (2-3-4-5) forme una sola ubicación y no varias por comparación de a pares.
 */
function locationIndexByChunk(sources: RetrievedChunk[]): Map<string, number> {
  const index = new Map<string, number>();
  const byLocation = [...sources].sort(
    (left, right) =>
      left.pageStart - right.pageStart ||
      left.pageEnd - right.pageEnd ||
      left.chunkId.localeCompare(right.chunkId),
  );
  let run = 0;
  // Extremo de la ubicación en curso: absorbe fragmentos que solapan o siguen.
  let current: RetrievedChunk | null = null;
  for (const source of byLocation) {
    if (!current || !isContiguousLocation(current, source)) {
      run += 1;
      current = source;
    } else if (source.pageEnd > current.pageEnd) {
      current = source;
    }
    index.set(source.chunkId, run);
  }
  return index;
}

export interface ConsolidationOptions {
  /**
   * Máximo de referencias visibles por versión de documento. Dos permite
   * conservar una segunda ubicación materialmente distinta sin devolver cinco
   * filas del mismo archivo.
   */
  maxSourcesPerDocument?: number;
}

/** Relevancia primero; ante empate, la ubicación más temprana del archivo. */
function byRelevanceThenLocation(
  left: RetrievedChunk,
  right: RetrievedChunk,
): number {
  return (
    right.semanticScore - left.semanticScore ||
    right.lexicalScore - left.lexicalScore ||
    left.pageStart - right.pageStart ||
    left.pageEnd - right.pageEnd ||
    left.chunkId.localeCompare(right.chunkId)
  );
}

/**
 * Un fragmento tiene contenido propio cuando dice una condición, una excepción,
 * un requisito o una cifra. Uno que no tiene nada de eso —un pie de firma, un
 * membrete, una cabecera de página— puede puntuar alto por similitud y no
 * aportar nada a la respuesta.
 */
function hasOwnContent(source: RetrievedChunk): boolean {
  const text = normalizedContent(source.chunkContent);
  return markersIn(text).length > 0 || hasSubstantiveFigure(text);
}

/**
 * Referencia principal del archivo: la más relevante. Solo cede su plaza si no
 * tiene contenido propio y hay material suficiente para llenar el documento
 * —caso en que conservarla obligaría a descartar una condición o una cifra—;
 * entonces manda el fragmento con contenido más relevante.
 */
function primaryReference(
  ordered: RetrievedChunk[],
  maxPerDocument: number,
): RetrievedChunk {
  const first = ordered[0];
  if (!first) throw new Error('RAG_EMPTY_DOCUMENT_GROUP');
  if (hasOwnContent(first)) return first;
  const withContent = ordered.filter(hasOwnContent);
  return withContent.length >= maxPerDocument ? withContent[0] : first;
}

/**
 * Devuelve una referencia visible por versión de documento, conservando otra
 * ubicación del mismo archivo solo cuando aporta una condición, excepción,
 * cifra o requisito que la referencia conservada no dice, o cuando se trata de
 * un tramo de páginas claramente separado (máximo dos por documento). Los
 * fragmentos contiguos del mismo archivo se tratan como una misma ubicación: se
 * conserva el más relevante.
 *
 * El fragmento material tiene prioridad sobre el tramo separado: un tramo
 * lejano que no añade nada (un anexo o un pie de firma con buen puntaje) no
 * puede ocupar la segunda plaza y dejar fuera una condición, excepción o cifra
 * distinta del tramo consultado. Si el fragmento mejor puntuado es un pie de
 * firma o una cabecera sin contenido propio, la referencia principal pasa al
 * fragmento con contenido más relevante cuando hay material suficiente para
 * llenar el documento.
 *
 * Cada referencia conservada sigue siendo un fragmento real con su rango de
 * páginas, su artículo y su identificador: la cita [n] de la respuesta apunta a
 * la fuente correcta y la ubicación sigue siendo verificable.
 */
export function consolidateDocumentEvidence(
  sources: RetrievedChunk[],
  options: ConsolidationOptions = {},
): RetrievedChunk[] {
  const maxPerDocument = Math.max(1, options.maxSourcesPerDocument ?? 2);
  const groups = new Map<string, RetrievedChunk[]>();
  for (const source of sources) {
    const group = groups.get(source.documentVersionId);
    if (group) group.push(source);
    else groups.set(source.documentVersionId, [source]);
  }

  const consolidated: RetrievedChunk[] = [];
  for (const group of groups.values()) {
    const ordered = [...group].sort(byRelevanceThenLocation);
    if (!ordered.length) continue;
    const locations = locationIndexByChunk(group);
    // La referencia conservada es, de entrada, la más relevante del archivo; un
    // fragmento sin contenido propio (pie, membrete) cede la plaza si hay
    // material suficiente, para no perder una condición o una cifra.
    const primary = primaryReference(ordered, maxPerDocument);
    const kept: RetrievedChunk[] = [primary];
    const pending = ordered.filter((candidate) => candidate !== primary);
    const sharesKeptLocation = (candidate: RetrievedChunk) =>
      kept.some(
        (primary) =>
          locations.get(primary.chunkId) === locations.get(candidate.chunkId),
      );

    while (kept.length < maxPerDocument) {
      // Primero lo materialmente distinto: una condición, excepción, requisito
      // o cifra que la referencia conservada no dice no puede perderse porque
      // el archivo tenga además un tramo lejano sin contenido nuevo.
      const next =
        pending.find((candidate) =>
          kept.some((primary) => isMateriallyDistinct(primary, candidate)),
        ) ??
        // Después, y solo si no queda nada material, otra ubicación del archivo
        // (su rango de páginas queda visible y verificable).
        pending.find((candidate) => !sharesKeptLocation(candidate));
      if (!next) break;
      kept.push(next);
      pending.splice(pending.indexOf(next), 1);
    }

    consolidated.push(...kept);
  }
  return consolidated;
}
