/**
 * Marca que el modelo emite cuando ninguna fuente recuperada responde la
 * pregunta (Hito 3, puntos 4 y 9). Con el umbral calibrado, fragmentos poco
 * relacionados pueden superar la similitud mínima; sin esta marca el modelo
 * contestaba «las fuentes no contienen…» y el turno se guardaba y mostraba como
 * una respuesta sustentada, con una tabla de «documentos que sustentan».
 */
export const RAG_NO_SUPPORT_MARKER = '[[SIN_SUSTENTO]]';

export interface NoSupportMarkerResult {
  /** El modelo declaró que las fuentes no responden (o solo emitió la marca). */
  noSupport: boolean;
  /** Texto pendiente que aún debe entregarse al usuario. */
  tail: string;
}

/**
 * Filtra la marca del flujo de tokens sin mostrarla nunca al usuario:
 *  - si la respuesta EMPIEZA con la marca, se descarta todo lo que sigue y el
 *    turno se trata como «sin evidencia»;
 *  - si aparece después de contenido real (respuesta parcial), solo se quita.
 * Retiene al final del búfer lo que podría ser el inicio de la marca partida
 * entre tokens, y no emite espacios iniciales.
 */
export class NoSupportMarkerFilter {
  private pending = '';
  private started = false;
  private suppressed = false;
  private markerAfterContent = false;

  /** La marca apareció después de contenido: respuesta solo parcialmente sustentada. */
  get partialSupport(): boolean {
    return this.markerAfterContent;
  }

  push(token: string): string {
    if (this.suppressed) return '';
    this.pending += token;

    let index = this.pending.indexOf(RAG_NO_SUPPORT_MARKER);
    while (index >= 0) {
      if (!this.started && !this.pending.slice(0, index).trim()) {
        this.suppressed = true;
        this.pending = '';
        return '';
      }
      this.markerAfterContent = true;
      this.pending =
        this.pending.slice(0, index) +
        this.pending.slice(index + RAG_NO_SUPPORT_MARKER.length);
      index = this.pending.indexOf(RAG_NO_SUPPORT_MARKER);
    }

    let hold = 0;
    for (
      let length = Math.min(
        RAG_NO_SUPPORT_MARKER.length - 1,
        this.pending.length,
      );
      length > 0;
      length -= 1
    ) {
      if (RAG_NO_SUPPORT_MARKER.startsWith(this.pending.slice(-length))) {
        hold = length;
        break;
      }
    }

    let output = this.pending.slice(0, this.pending.length - hold);
    this.pending = this.pending.slice(this.pending.length - hold);
    if (!this.started) {
      if (!output.trim()) {
        this.pending = output + this.pending;
        return '';
      }
      this.started = true;
      output = output.trimStart();
    }
    return output;
  }

  finish(): NoSupportMarkerResult {
    if (this.suppressed) return { noSupport: true, tail: '' };
    const rest = this.pending;
    this.pending = '';
    if (!this.started) {
      const trimmed = rest.trim();
      // Marca truncada (p. ej. corte por longitud): tampoco es una respuesta.
      if (trimmed && RAG_NO_SUPPORT_MARKER.startsWith(trimmed)) {
        return { noSupport: true, tail: '' };
      }
      return { noSupport: false, tail: trimmed };
    }
    return { noSupport: false, tail: rest };
  }
}
