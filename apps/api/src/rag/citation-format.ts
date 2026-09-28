import { CITATION_GROUP, citedIndexes } from './citations';

/** Máximo de texto retenido esperando que cierre un corchete abierto. */
const MAX_PENDING_CHARS = 80;

/**
 * Reescribe cada cita a su forma individual: «[1, 2]», «[1-3]» o «[[4]]» se
 * convierten en «[1][2]», «[1][2][3]» y «[4]». Con el número de fuentes,
 * descarta índices inventados; conserva años y fechas entre corchetes.
 */
export function normalizeCitationGroups(
  text: string,
  sourceCount?: number,
): string {
  return text.replace(CITATION_GROUP, (match) => {
    const indexes = citedIndexes(match);
    if (!indexes.length) return match;
    // Un año aislado no es una cita. No alterar tampoco números grandes de
    // documentos que puedan aparecer entre corchetes.
    if (indexes.some((index) => index > 50)) return match;
    const valid =
      sourceCount === undefined
        ? indexes
        : indexes.filter((index) => index >= 1 && index <= sourceCount);
    return [...new Set(valid)].map((index) => `[${index}]`).join('');
  });
}

/**
 * Normalizador apto para streaming: retiene un corchete abierto hasta que
 * cierre (o hasta el tope) para no publicar una cita a medias. `push` devuelve
 * el texto listo para emitir y `flush` cierra el remanente al terminar el flujo.
 */
export class CitationGroupNormalizer {
  private pending = '';

  constructor(private readonly sourceCount?: number) {}

  push(chunk: string): string {
    this.pending += chunk;
    if (!this.pending) return '';

    const lastOpen = this.pending.lastIndexOf('[');
    const closedAfterOpen =
      lastOpen !== -1 && this.pending.indexOf(']', lastOpen) !== -1;
    // [[n]] puede llegar en tres tokens. Esperar el segundo cierre evita
    // publicar [n] seguido de un «]» suelto.
    const doubleOpen = this.pending.lastIndexOf('[[');
    const doubleClosed =
      doubleOpen !== -1 && this.pending.indexOf(']]', doubleOpen + 2) === -1;
    if (
      ((lastOpen === -1 || closedAfterOpen) && !doubleClosed) ||
      this.pending.length - lastOpen > MAX_PENDING_CHARS
    ) {
      return this.take();
    }

    const holdFrom = doubleClosed ? doubleOpen : lastOpen;
    const safe = this.pending.slice(0, holdFrom);
    this.pending = this.pending.slice(holdFrom);
    return normalizeCitationGroups(safe, this.sourceCount);
  }

  flush(): string {
    return this.take();
  }

  private take(): string {
    const pending = this.pending;
    this.pending = '';
    return normalizeCitationGroups(pending, this.sourceCount);
  }
}
