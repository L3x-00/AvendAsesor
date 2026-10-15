import type { DocumentSituation } from '../documents/domain/document';
import type { RetrievedChunk } from './retrieval.gateway';

/**
 * Autoridad de la situación documental. La situación declarada —y la relación
 * explícita de reemplazo que representa— pesa más que el año de emisión: un
 * documento vigente puede ser más antiguo que el documento que reemplazó, y un
 * documento reemplazado nunca vuelve a ser actual por ser más reciente.
 * Solo entre documentos comparables de la misma categoría el año decide.
 */
const SITUATION_AUTHORITY: Record<DocumentSituation, number> = {
  current: 0,
  replaced: 1,
  archived: 2,
};

export function situationAuthority(situation: DocumentSituation): number {
  return SITUATION_AUTHORITY[situation];
}

export interface DeliveryOrderOptions {
  /**
   * Grado de aplicabilidad al concepto consultado (menor = más aplicable).
   * Permite que una norma vigente y aplicable al mismo concepto (cargo,
   * jornada, asignación) preceda a otra que solo coincide en el tema.
   */
  applicability?: (source: RetrievedChunk) => number;
}

/** Año de emisión; los documentos sin año quedan al final del grupo. */
function yearRank(source: RetrievedChunk): number {
  return typeof source.issuanceYear === 'number' ? source.issuanceYear : 0;
}

/**
 * Orden determinista y estable de la evidencia entregada al modelo y al
 * usuario. Criterios, en este orden: situación documental (vigente antes que
 * reemplazado, y archivado al final), aplicabilidad al concepto consultado,
 * año de emisión descendente —lo más reciente primero, también en una
 * comparación histórica—, relevancia y desempates por ubicación. La situación
 * declarada pesa más que el año: un documento reemplazado no vuelve a ser
 * actual por ser más reciente. Ante un empate real se conserva el orden en que
 * la recuperación entregó la evidencia —que ya es un orden total y
 * determinista—, así que el mismo conjunto de fragmentos produce siempre el
 * mismo orden y la cita [n] apunta siempre a la misma fuente visible.
 */
export function orderSourcesForDelivery(
  sources: RetrievedChunk[],
  options: DeliveryOrderOptions = {},
): RetrievedChunk[] {
  const applicability = options.applicability ?? (() => 0);
  return [...sources].sort(
    (left, right) =>
      SITUATION_AUTHORITY[left.documentSituation] -
        SITUATION_AUTHORITY[right.documentSituation] ||
      applicability(left) - applicability(right) ||
      yearRank(right) - yearRank(left) ||
      right.semanticScore - left.semanticScore ||
      right.lexicalScore - left.lexicalScore ||
      left.pageStart - right.pageStart ||
      left.pageEnd - right.pageEnd,
  );
}

export interface SeparatedDeliverySources {
  /** Material vigente: sustenta la situación actual. */
  current: RetrievedChunk[];
  /** Antecedentes (reemplazados y archivados): se rotulan como históricos. */
  historical: RetrievedChunk[];
}

/**
 * Separa el material vigente de los antecedentes para que una consulta actual
 * mantenga separado y rotulado lo histórico, en vez de mezclarlo con la regla
 * vigente o presentarlo al mismo nivel.
 */
export function splitDeliverySources(
  sources: RetrievedChunk[],
): SeparatedDeliverySources {
  const current: RetrievedChunk[] = [];
  const historical: RetrievedChunk[] = [];
  for (const source of sources) {
    if (source.documentSituation === 'current') current.push(source);
    else historical.push(source);
  }
  return { current, historical };
}
