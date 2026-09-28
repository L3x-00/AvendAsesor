import { CITATION_GROUP, citedIndexes } from './citations';

/** Máximo de texto retenido esperando que cierre un corchete abierto. */
const MAX_PENDING_CHARS = 80;

/**
 * Reescribe cada cita a su forma individual: «[1, 2]», «[1-3]» o «[[4]]» se
 * convierten en «[1][2]», «[1][2][3]» y «[4]». Una fecha entre corchetes o un
 * rango absurdo se conservan tal cual. Solo se tocan corchetes con números.
 */
export function normalizeCitationGroups(text: string): string {
  return text.replace(CITATION_GROUP, (match) => {
    const indexes = citedIndexes(match);
    if (!indexes.length) return match;
    return indexes.map((index) => `[${index}]`).join('');
  });
}

/**
 * Normalizador apto para streaming: retiene un corchete abierto hasta que
 * cierre (o hasta el tope) para no publicar una cita a medias. `push` devuelve
 * el texto listo para emitir y `flush` cierra el remanente al terminar el flujo.
 */
export class CitationGroupNormalizer {
  private pending = '';

  push(chunk: string): string {
    this.pending += chunk;
    if (!this.pending) return '';

    const lastOpen = this.pending.lastIndexOf('[');
    const closedAfterOpen =
      lastOpen !== -1 && this.pending.indexOf(']', lastOpen) !== -1;
    if (
      lastOpen === -1 ||
      closedAfterOpen ||
      this.pending.length - lastOpen > MAX_PENDING_CHARS
    ) {
      return this.take();
    }

    const safe = this.pending.slice(0, lastOpen);
    this.pending = this.pending.slice(lastOpen);
    return normalizeCitationGroups(safe);
  }

  flush(): string {
    return this.take();
  }

  private take(): string {
    const pending = this.pending;
    this.pending = '';
    return normalizeCitationGroups(pending);
  }
}
