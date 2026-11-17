import { normalizeSpanishText } from './text-normalization';

/**
 * Referencia a una página física de un documento: «página 24 de la RVM»,
 * «pág. 12», «pagina 7». Es una ubicación verificable, no una consulta de
 * contenido: la respuesta puede apoyarse en el fragmento que cubre esa página.
 */
export interface PageReference {
  /** Página física pedida dentro del PDF. */
  page: number;
  /**
   * Tipo documental nombrado junto a la página («RVM» se normaliza a
   * «resolución viceministerial»). Sin él, el documento se toma del hilo.
   */
  documentType: string | null;
}

/** «página 24», «pagina N.° 7», «pág. 12». */
const PAGE_NUMBER = /\bpag(?:ina|inas)?\.?\s*(?:n\.?\s*[°º]?\s*)?(\d{1,3})\b/u;

/**
 * Tipo documental que puede acompañar a la página. Se acepta el nombre completo
 * y la sigla que la persona escribe de hecho: `normalizeDomainQuery` no se
 * aplica en esta ruta, así que «RVM» tiene que reconocerse aquí. Sin esto,
 * «página 24 de la RVM» no acotaba el tipo y el ancla podía ser otra norma del
 * mismo tema.
 */
const DOCUMENT_TYPES: ReadonlyArray<{ pattern: RegExp; type: string }> = [
  {
    pattern: /\b(?:rvm|resolucion viceministerial)\b/u,
    type: 'RESOLUCION_VICEMINISTERIAL',
  },
  {
    pattern: /\b(?:rm|resolucion ministerial)\b/u,
    type: 'RESOLUCION_MINISTERIAL',
  },
  {
    pattern: /\b(?:rsg|resolucion de secretaria general)\b/u,
    type: 'RESOLUCION_SECRETARIA_GENERAL',
  },
  {
    pattern: /\b(?:rd|resolucion directoral)\b/u,
    type: 'RESOLUCION_DIRECTORAL',
  },
  { pattern: /\b(?:ds|decreto supremo)\b/u, type: 'DECRETO_SUPREMO' },
  {
    pattern: /\b(?:dl|decreto legislativo)\b/u,
    type: 'DECRETO_LEGISLATIVO',
  },
  { pattern: /\bnorma tecnica\b/u, type: 'NORMA_TECNICA' },
  { pattern: /\bdirectiva\b/u, type: 'DIRECTIVA' },
];

/**
 * Página pedida y, cuando la persona la nombró, la clase de documento. Se
 * evalúa sobre texto normalizado: sin tildes y en minúsculas.
 */
export function pageReferenceIn(question: string): PageReference | null {
  const text = normalizeSpanishText(question);
  const match = PAGE_NUMBER.exec(text);
  if (!match) return null;
  const page = Number(match[1]);
  // El chunking acota los documentos a 300 páginas: fuera de ese rango la
  // referencia no identifica una página del corpus y no se resuelve.
  if (!Number.isInteger(page) || page < 1 || page > 300) return null;
  // Si la persona nombra dos clases de documento, el orden del catálogo no
  // decide: sin un único tipo identificado se deja que el hilo resuelva el ancla.
  const types = new Set(
    DOCUMENT_TYPES.filter(({ pattern }) => pattern.test(text)).map(
      ({ type }) => type,
    ),
  );
  const documentType = types.size === 1 ? [...types][0] : null;
  return { documentType, page };
}

/** El fragmento cubre la página pedida (rango inclusivo, metadatos nulos tolerados). */
export function coversPage(
  source: { pageEnd: number | null; pageStart: number | null },
  page: number,
): boolean {
  const from = source.pageStart;
  const to = source.pageEnd ?? from;
  if (typeof from !== 'number' || typeof to !== 'number') return false;
  return from <= page && page <= to;
}

/** Títulos con que el corpus nombra cada tipo documental. */
const DOCUMENT_TYPE_TITLES: Record<string, RegExp> = {
  RESOLUCION_VICEMINISTERIAL: /\bresolucion viceministerial\b/u,
  RESOLUCION_MINISTERIAL: /\bresolucion ministerial\b/u,
  RESOLUCION_SECRETARIA_GENERAL: /\bresolucion de secretaria general\b/u,
  RESOLUCION_DIRECTORAL: /\bresolucion directoral\b/u,
  DECRETO_SUPREMO: /\bdecreto supremo\b/u,
  DECRETO_LEGISLATIVO: /\bdecreto legislativo\b/u,
  NORMA_TECNICA: /\bnorma tecnica\b/u,
  DIRECTIVA: /\bdirectiva\b/u,
};

/**
 * El documento es del tipo pedido: por el campo del catálogo o, cuando la ficha
 * no lo trae, por su título. La abreviatura suelta («RVM») no identifica un
 * documento concreto; el tipo solo acota cuál de las fuentes recuperadas sirve
 * de ancla para leer la página.
 */
export function documentTypeMatches(
  source: { documentTitle: string; documentType?: string | null },
  documentType: string,
): boolean {
  if (source.documentType === documentType) return true;
  const pattern = DOCUMENT_TYPE_TITLES[documentType];
  return pattern
    ? pattern.test(normalizeSpanishText(source.documentTitle))
    : false;
}
