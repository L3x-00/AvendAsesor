import { INTENT_TRIGGERS } from './intent-routing.config';
import { normalizeSpanishText } from './text-normalization';

/**
 * Pregunta por las relaciones documentales: «¿qué normas están relacionadas
 * con la Ley 29944?», «¿qué modifica esta norma?». El disparador vive en la
 * configuración declarativa; aquí solo se decide si el turno pertenece a esta
 * intención, sin resolver aún el documento (eso lo hace el RPC por id).
 */
export function isDocumentRelationsQuestion(question: string): boolean {
  return INTENT_TRIGGERS.DOCUMENT_RELATIONS_TRIGGER.test(
    normalizeSpanishText(question),
  );
}
