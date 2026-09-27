/**
 * Catálogo del chat: qué documentos puede usar hoy el asistente para
 * responder y qué conviene preguntarle. Responde a «¿de qué tienes
 * información?» sin pasar por el RAG (no es una consulta normativa).
 */

/** Documento que el RAG puede citar hoy (mismos criterios que la búsqueda). */
export interface AvailableDocument {
  documentType: string;
  id: string;
  issuanceYear: number | null;
  /**
   * Módulos activos a los que pertenece: los enlazados y sus padres. Sirve
   * para acotar el catálogo al tema abierto en el chat.
   */
  moduleIds: string[];
  /** Módulos raíz a los que pertenece (por nombre), sin duplicados. */
  moduleNames: string[];
  resolutionNumber: string | null;
  /** Títulos de sección detectados al indexar; alimentan las sugerencias. */
  sectionTitles: string[];
  title: string;
  /** Versión aprobada e indexada: la que el RAG cita. */
  versionId: string;
}

export interface ChatCatalogGateway {
  listAvailableDocuments(): Promise<AvailableDocument[]>;
  /** Primeros fragmentos del texto indexado, para resumir el documento. */
  getOpeningText(versionId: string): Promise<string>;
}

export interface DocumentSummaryGateway {
  /**
   * Resumen orientativo (1–2 oraciones) a partir del título y el texto real
   * del documento. Nunca inventa plazos, cifras ni requisitos.
   */
  summarize(input: { excerpt: string; title: string }): Promise<string | null>;
}

export const DOCUMENT_SUMMARY_GATEWAY = Symbol('DOCUMENT_SUMMARY_GATEWAY');

export interface SuggestedQuestionsGateway {
  /**
   * Preguntas que los documentos pueden responder, redactadas por la IA a
   * partir de títulos y secciones. Nunca afirma contenido normativo: son solo
   * preguntas sugeridas.
   */
  suggest(documents: AvailableDocument[]): Promise<string[]>;
}

export const SUGGESTED_QUESTIONS_GATEWAY = Symbol(
  'SUGGESTED_QUESTIONS_GATEWAY',
);

export interface ChatCatalogReply {
  message: string;
  suggestions: string[];
}
