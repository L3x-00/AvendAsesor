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
  /** Módulos raíz a los que pertenece (por nombre), sin duplicados. */
  moduleNames: string[];
  resolutionNumber: string | null;
  /** Títulos de sección detectados al indexar; alimentan las sugerencias. */
  sectionTitles: string[];
  title: string;
}

export interface ChatCatalogGateway {
  listAvailableDocuments(): Promise<AvailableDocument[]>;
}

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
