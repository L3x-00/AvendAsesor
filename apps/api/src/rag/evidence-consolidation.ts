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
 * ubicación: se conserva el más relevante y solo se añade otro fragmento si
 * aporta algo material (condición, excepción, requisito o cifra distinta). No
 * hay un tope arbitrario: una tercera condición material no puede perderse solo
 * por pertenecer al mismo archivo. Cada referencia conservada sigue siendo un fragmento real —con su
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
  'establece',
  'establecer',
  'fijar',
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

/** Cada cláusula con condición, excepción o cifra puede cambiar la respuesta. */
function materialClausesIn(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/u)
    .map(normalizedContent)
    .filter(
      (clause) => markersIn(clause).length > 0 || hasSubstantiveFigure(clause),
    );
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
  return contributesMaterialBeyond([primary], candidate);
}

/**
 * Comprueba si el candidato añade material que no está cubierto por ninguna de
 * las referencias ya conservadas. Comparar contra el conjunto evita conservar
 * un tercer chunk que solo repite por separado lo que otros dos ya dicen.
 */
function contributesMaterialBeyond(
  kept: readonly RetrievedChunk[],
  candidate: RetrievedChunk,
): boolean {
  const primaryText = kept
    .map((source) => normalizedContent(source.chunkContent))
    .join('\n');
  const candidateText = normalizedContent(candidate.chunkContent);

  // Un artículo con objeto propio puede aportar el alcance de una cifra que
  // quedó en el fragmento contiguo (por ejemplo, el artículo fija la RIM y el
  // siguiente contiene el importe). Se conserva solo si ese artículo aún no
  // está en la evidencia visible del mismo documento.
  const article = /\barticulo\s+(\d+)\b/u.exec(candidateText)?.[1];
  if (
    article &&
    (markersIn(candidateText).length > 0 || hasSubstantiveFigure(candidateText)) &&
    !new RegExp(`\\barticulo\\s+${article}\\b`, 'u').test(primaryText)
  ) {
    return true;
  }

  for (const marker of markersIn(candidateText)) {
    if (!primaryText.includes(marker)) return true;
  }

  const primaryFigures = substantiveFiguresIn(primaryText);
  for (const figure of substantiveFiguresIn(candidateText)) {
    if (!primaryFigures.has(figure)) return true;
  }

  // La misma marca («solo», «salvo») puede introducir una condición diferente.
  // Se compara la cláusula completa para no perder «solo nombrados» porque ya
  // se conservó «solo contratados».
  for (const clause of materialClausesIn(candidateText)) {
    if (!primaryText.includes(clause)) return true;
  }

  const primaryReferences = new Set(
    kept.flatMap((source) => [
      normalizedReference(source.articleReference),
      normalizedReference(source.numeralReference),
    ]),
  );
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
  if (markersIn(text).length > 0 || hasSubstantiveFigure(text)) return true;

  // Un artículo con texto propio también merece ser la referencia principal,
  // aunque escriba una cifra con palabras. Solo se descartan pies y validadores
  // que el sanitizador reconoce como boilerplate, no el contenido normativo.
  const withoutBoilerplate = text
    .replace(/\bpagina\s+\d+(?:\s+de\s+\d+)?\b/gu, ' ')
    .replace(/\bdocumento electronico firmado digitalmente\b/gu, ' ')
    .replace(/\bverifique su autenticidad\b/gu, ' ')
    .replace(/\bfirma digital(?:mente)?\b/gu, ' ')
    .replace(/\b\d{1,4}(?:-\d{2,4})*(?:-[a-z]{2,})?\b/gu, ' ')
    .replace(/[^a-z0-9]+/gu, '');
  return withoutBoilerplate.length >= 8;
}

/**
 * Referencia principal del archivo: la más relevante. Solo cede su plaza si no
 * tiene contenido propio y hay material suficiente para llenar el documento
 * —caso en que conservarla obligaría a descartar una condición o una cifra—;
 * entonces manda el fragmento con contenido más relevante.
 */
function primaryReference(ordered: RetrievedChunk[]): RetrievedChunk {
  const first = ordered[0];
  if (!first) throw new Error('RAG_EMPTY_DOCUMENT_GROUP');
  if (hasOwnContent(first)) return first;
  const withContent = ordered.filter(hasOwnContent);
  return withContent[0] ?? first;
}

/**
 * Devuelve una referencia visible por versión de documento, conservando otra
 * ubicación del mismo archivo solo cuando aporta una condición, excepción,
 * cifra o requisito que las referencias conservadas no dicen. Los fragmentos
 * contiguos sin material nuevo se tratan como una misma ubicación: se conserva
 * el más relevante.
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
): RetrievedChunk[] {
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
    // La referencia conservada es, de entrada, la más relevante del archivo; un
    // fragmento sin contenido propio (pie, membrete) cede la plaza si hay
    // material, para no perder una condición o una cifra.
    const primary = primaryReference(ordered);
    const kept: RetrievedChunk[] = [primary];
    const pending = ordered.filter((candidate) => candidate !== primary);

    while (pending.length) {
      // Una condición, excepción, requisito o cifra nueva no se pierde por un
      // límite fijo. Un tramo lejano sin contenido material no abre otra fuente
      // visible solo por estar en otra página.
      const next = pending.find((candidate) =>
        contributesMaterialBeyond(kept, candidate),
      );
      if (!next) break;
      kept.push(next);
      pending.splice(pending.indexOf(next), 1);
    }

    consolidated.push(...kept);
  }
  return consolidated;
}
