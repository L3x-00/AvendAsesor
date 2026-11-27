import { INTENT_EXPANSIONS } from './intent-routing.config';
import { normalizeSpanishText } from './text-normalization';

/**
 * Remoción / cese / destitución de un director o docente del cargo. El Paso 1
 * ya hace que «remoción» sea tema propio y active el trigger disciplinario,
 * pero la expansión `LEGAL_SANCTIONS` solo se usa en el módulo legal. En el
 * chat general hacía falta una expansión propia para que los artículos 46-49
 * de la Ley 29944 (sanciones, suspensión, cese temporal, destitución) entren
 * en la búsqueda. El contenido del Anexo 6 de encargatura NO responde esto.
 *
 * Sin ID de documento fijo: si la Ley 29944 cambia, otra norma con el mismo
 * contenido puede responder.
 */

const REMOVAL_WORD =
  /\b(?:remocion|remov(?:er|ido|ida|idos|idas|ieron)|remuev(?:en|e)|destitu(?:cion|ir|ido|ida)|cese|suspension|sancion(?:es|ada)?|separacion\s+del\s+cargo)\b/u;
const POSITION_HOLDER =
  /\b(?:director(?:a|es|as)?|docente|profesor(?:a|es|as)?|maestr[oa]|cargo|puesto)\b/u;
/** Otros trámites que pueden mencionar sanciones/cese de paso. */
const OTHER_PROCESS =
  /\b(?:encargatura|encargado|exoneraci[oó]n|reasignaci[oó]n|destaque|renovaci[oó]n|contrataci[oó]n auxiliares?|nombramiento de auxiliar|racionalizaci[oó]n)\b/u;

/** La pregunta pide las causales o el procedimiento de remoción del cargo. */
export function isRemovalQuestion(question: string): boolean {
  const text = normalizeSpanishText(question);
  if (OTHER_PROCESS.test(text)) return false;
  return REMOVAL_WORD.test(text) && POSITION_HOLDER.test(text);
}

/** Consulta canónica con el vocabulario del corpus para este proceso. */
export function removalEvidenceQueries(question: string): string[] {
  if (!isRemovalQuestion(question)) return [];
  return [INTENT_EXPANSIONS.LEGAL_SANCTIONS];
}
