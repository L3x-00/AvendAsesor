import type { AdminApiClient } from "./client";
import {
  ISSUING_ENTITY_OPTIONS,
  NORMATIVE_DOCUMENT_TYPE_VALUES,
} from "./document-taxonomy";
import type { DocumentLibraryItem, DocumentLibraryPage } from "./types";

/**
 * Secciones fijas de «Contenido del tema». El código de la sección coincide con
 * el tipo documental salvo en Normativa, que agrupa varias clases legales.
 */
export const CONTENT_SECTION_CODES = [
  "NORMATIVA",
  "CRONOGRAMA",
  "ANEXO",
  "PREGUNTAS_FRECUENTES",
] as const;

export type ContentSectionCode = (typeof CONTENT_SECTION_CODES)[number];

export const CONTENT_SECTION_TITLES: Record<ContentSectionCode, string> = {
  ANEXO: "Anexos",
  CRONOGRAMA: "Cronograma",
  NORMATIVA: "Normativa",
  PREGUNTAS_FRECUENTES: "Preguntas frecuentes",
};

export const CONTENT_SECTION_HINTS: Record<ContentSectionCode, string> = {
  ANEXO: "Formatos y anexos numerados.",
  CRONOGRAMA: "Fechas y etapas de los procesos.",
  NORMATIVA: "Leyes, resoluciones, decretos y directivas.",
  PREGUNTAS_FRECUENTES: "Respuestas a las dudas más repetidas.",
};

/**
 * Marca que deja la carga contextual en `metadata.contentSection` cuando el
 * tipo documental no basta para ubicar el documento (una «Otra norma» se guarda
 * como OTRO, pero pertenece a Normativa).
 */
export const CONTENT_SECTION_METADATA_KEY = "contentSection";

export function isContentSectionCode(
  value: unknown,
): value is ContentSectionCode {
  return (
    typeof value === "string" &&
    (CONTENT_SECTION_CODES as readonly string[]).includes(value)
  );
}

/** Sección a la que pertenece un documento, o `null` si va en «Otros». */
export function documentContentSection(document: {
  documentType: string;
  metadata: Record<string, unknown>;
}): ContentSectionCode | null {
  if (NORMATIVE_DOCUMENT_TYPE_VALUES.has(document.documentType)) {
    return "NORMATIVA";
  }
  if (
    document.documentType === "CRONOGRAMA" ||
    document.documentType === "ANEXO" ||
    document.documentType === "PREGUNTAS_FRECUENTES"
  ) {
    return document.documentType;
  }
  if (
    document.documentType === "OTRO" &&
    document.metadata[CONTENT_SECTION_METADATA_KEY] === "NORMATIVA"
  ) {
    return "NORMATIVA";
  }
  return null;
}

const ROMAN_NUMERAL =
  /^(?=[ivxlc])c{0,3}(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/iu;
const ROMAN_VALUES: Record<string, number> = {
  c: 100,
  i: 1,
  l: 50,
  v: 5,
  x: 10,
};

function romanToNumber(value: string): number | null {
  const lower = value.toLowerCase();
  if (!ROMAN_NUMERAL.test(lower)) return null;
  let total = 0;
  for (let index = 0; index < lower.length; index += 1) {
    const current = ROMAN_VALUES[lower[index]!] ?? 0;
    const next = ROMAN_VALUES[lower[index + 1] ?? ""] ?? 0;
    total += current < next ? -current : current;
  }
  return total > 0 ? total : null;
}

/**
 * «Anexo 3», «Anexo N° 03», «Anexo N.° 3», «Anexo Nro. 7», «Anexo No. 8»,
 * «Anexo Núm. 4» o «Anexo III». Solo se aceptan hasta tres cifras para no
 * leer un año («Anexo 2026 - formato») como número de anexo.
 */
const ANNEX_IN_TITLE =
  /(?<![\p{L}\p{N}])anexo\s*(?:(?:n(?:ro|[uú]m)?|no)\s*\.?\s*[°º]?\s*)?(?:(\d{1,3})(?!\d)|([ivxlc]{1,7})(?![\p{L}\p{N}]))/iu;

function positiveAnnex(value: number): number | null {
  return Number.isInteger(value) && value > 0 && value <= 999 ? value : null;
}

/** Número de anexo escrito en el título, si lo hay. */
export function annexNumberFromTitle(title: string): number | null {
  const match = ANNEX_IN_TITLE.exec(title);
  if (!match) return null;
  if (match[1]) return positiveAnnex(Number(match[1]));
  return match[2] ? romanToNumber(match[2]) : null;
}

/** El título ya empieza por «Anexo N…», así que no hace falta repetirlo. */
export function titleStartsWithAnnexNumber(title: string): boolean {
  const match = ANNEX_IN_TITLE.exec(title);
  return Boolean(match && match.index === title.search(/\S/u));
}

/**
 * Número de anexo, en este orden: el campo propio (`metadata.annexNumber`), el
 * título y, por último, un «Número del documento» puramente numérico. Así el
 * listado sale en orden aunque el anexo se haya cargado antes de existir el
 * campo propio.
 */
export function annexNumber(document: {
  metadata: Record<string, unknown>;
  resolutionNumber?: string | null;
  title: string;
}): number | null {
  const value = document.metadata.annexNumber;
  if (typeof value === "number") {
    const annex = positiveAnnex(value);
    if (annex) return annex;
  }
  if (typeof value === "string" && /^\d{1,3}$/u.test(value.trim())) {
    const annex = positiveAnnex(Number(value.trim()));
    if (annex) return annex;
  }
  const fromTitle = annexNumberFromTitle(document.title);
  if (fromTitle) return fromTitle;
  const resolution = document.resolutionNumber?.trim() ?? "";
  return /^\d{1,3}$/u.test(resolution)
    ? positiveAnnex(Number(resolution))
    : null;
}

export interface ModuleContentScope {
  moduleId?: string;
  submoduleId?: string;
}

export interface ModuleContentDocuments {
  /** `false` si el tema supera el máximo que se muestra en las secciones. */
  complete: boolean;
  documents: DocumentLibraryItem[];
}

const CONTENT_PAGE_SIZE = 100;
export const MAX_MODULE_CONTENT_DOCUMENTS = 2000;

/**
 * Todos los documentos del módulo o submódulo, sin los filtros ni la
 * paginación de «Documentos cargados». Se piden por lotes de 100 (el máximo
 * del API) y con un tope para acotar el tiempo de la página.
 */
export async function listModuleContentDocuments(
  client: Pick<AdminApiClient, "listDocumentLibrary">,
  scope: ModuleContentScope,
): Promise<ModuleContentDocuments> {
  const documents: DocumentLibraryItem[] = [];
  const seen = new Set<string>();
  let offset = 0;
  let total = Number.POSITIVE_INFINITY;

  while (offset < total && documents.length < MAX_MODULE_CONTENT_DOCUMENTS) {
    const page = await client.listDocumentLibrary({
      limit: CONTENT_PAGE_SIZE,
      moduleId: scope.moduleId,
      offset,
      sort: "newest",
      submoduleId: scope.submoduleId,
    });
    total = page.total;

    for (const item of page.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      documents.push(item);
    }

    if (page.items.length === 0) break;
    offset += page.limit || CONTENT_PAGE_SIZE;
  }

  return {
    complete: !(
      documents.length >= MAX_MODULE_CONTENT_DOCUMENTS &&
      total > MAX_MODULE_CONTENT_DOCUMENTS
    ),
    documents: documents.slice(0, MAX_MODULE_CONTENT_DOCUMENTS),
  };
}

/**
 * La primera página de la biblioteca ya contiene todo el tema cuando no hay
 * filtros ni paginación: se reutiliza y la página no hace otra consulta.
 */
export function libraryPageCoversModule(
  library: DocumentLibraryPage,
  options: { activeFilterCount: number; page: number },
): boolean {
  return (
    options.activeFilterCount === 0 &&
    options.page === 1 &&
    library.offset === 0 &&
    library.items.length >= library.total
  );
}

export interface ContextualUploadDefaults {
  issuanceYear: number;
  issuingEntity?: string;
  issuingEntityOther?: string;
  specificDependency?: string;
}

function mostFrequent<T>(values: T[], keyOf: (value: T) => string): T | undefined {
  const counts = new Map<string, { count: number; first: number; value: T }>();
  values.forEach((value, index) => {
    const key = keyOf(value);
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { count: 1, first: index, value });
  });
  let best: { count: number; first: number; value: T } | undefined;
  for (const entry of counts.values()) {
    // Empate: gana el primero de la lista, que llega ordenada de lo más nuevo
    // a lo más antiguo.
    if (!best || entry.count > best.count) best = entry;
  }
  return best?.value;
}

const ISSUING_ENTITY_VALUES = new Set<string>(
  ISSUING_ENTITY_OPTIONS.map((option) => option.value),
);

/**
 * Valores para la carga contextual: el año actual y la entidad emisora y la
 * dependencia más frecuentes entre los documentos del tema. La dependencia se
 * elige entre los documentos de esa misma entidad para que ambas encajen.
 */
export function contextualUploadDefaults(
  documents: DocumentLibraryItem[],
  currentYear: number,
): ContextualUploadDefaults {
  const withEntity = documents.filter(
    (document) =>
      document.issuingEntity !== null &&
      ISSUING_ENTITY_VALUES.has(document.issuingEntity) &&
      (document.issuingEntity !== "OTRA_INSTITUCION" ||
        Boolean(document.issuingEntityOther?.trim())),
  );
  const entityKey = (document: DocumentLibraryItem) =>
    document.issuingEntity === "OTRA_INSTITUCION"
      ? `OTRA_INSTITUCION|${document.issuingEntityOther?.trim() ?? ""}`
      : (document.issuingEntity ?? "");
  const entitySample = mostFrequent(withEntity, entityKey);
  if (!entitySample?.issuingEntity) return { issuanceYear: currentYear };

  const sameEntity = withEntity.filter(
    (document) =>
      entityKey(document) === entityKey(entitySample) &&
      Boolean(document.specificDependency?.trim()),
  );
  const dependencySample = mostFrequent(sameEntity, (document) =>
    (document.specificDependency ?? "").trim(),
  );

  return {
    issuanceYear: currentYear,
    issuingEntity: entitySample.issuingEntity,
    issuingEntityOther:
      entitySample.issuingEntity === "OTRA_INSTITUCION"
        ? entitySample.issuingEntityOther?.trim()
        : undefined,
    specificDependency: dependencySample?.specificDependency?.trim(),
  };
}

/**
 * Propone un título legible a partir del nombre del archivo elegido: sin la
 * extensión y con los guiones bajos como espacios. Los guiones normales se
 * conservan porque forman parte de números oficiales («RM-123-2026-MINEDU»).
 */
export function titleFromFileName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^./\\]{1,5}$/u, "");
  const readable = withoutExtension
    .replace(/_+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
  if (readable.length < 2) return "";
  return readable.charAt(0).toLocaleUpperCase("es") + readable.slice(1);
}

/**
 * Sección pedida en la dirección (`?cargar=1&tipo=ANEXO`). Los enlaces viejos
 * de «+ Subir …» la usaban; hoy la carga contextual se abre en el cliente, pero
 * la dirección se sigue aceptando para no romper marcadores.
 */
export function parseContentSectionParam(
  value: string | string[] | undefined,
): ContentSectionCode | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = raw?.trim().toUpperCase();
  return isContentSectionCode(normalized) ? normalized : undefined;
}

/** Año actual en Lima, que es el que ve el administrador en el selector. */
export function currentLimaYear(now: Date = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Lima",
      year: "numeric",
    }).format(now),
  );
}
