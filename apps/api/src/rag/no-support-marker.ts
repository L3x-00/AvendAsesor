/**
 * Marca que el modelo emite cuando ninguna fuente recuperada trata la pregunta
 * (Hito 3, puntos 4 y 9). Con el umbral calibrado, fragmentos poco
 * relacionados pueden superar la similitud mínima; sin esta marca el modelo
 * contestaba «las fuentes no contienen…» y el turno se guardaba y mostraba como
 * una respuesta sustentada, con una tabla de «documentos que sustentan».
 */
export const RAG_NO_SUPPORT_MARKER = '[[SIN_SUSTENTO]]';

/** Variantes que el modelo produce: espacios, guiones, minúsculas. */
const MARKER_PATTERN = /\[\[\s*sin[\s_-]*sustento\s*\]\]/iu;
/** Una marca abierta y sin cerrar puede seguir llegando en el próximo token. */
const MAX_OPEN_MARKER_CHARS = 24;
/** Formato sin contenido que el modelo pone alrededor de la marca («**…**»). */
const FORMATTING_ONLY = /^[\s*_`"'>:#-]*$/u;

export interface NoSupportMarkerResult {
  /** El modelo declaró que las fuentes no responden (o solo emitió la marca). */
  noSupport: boolean;
  /** Texto pendiente que aún debe entregarse al usuario. */
  tail: string;
}

/**
 * Filtra la marca del flujo de tokens sin mostrarla nunca al usuario:
 *  - si la respuesta EMPIEZA con la marca (solo formato antes), se descarta todo
 *    lo que sigue y el turno se trata como «sin evidencia»;
 *  - si aparece después de contenido, solo se quita y se informa como
 *    `partialSupport` (quien consume decide si hubo sustento real).
 * Retiene al final del búfer una marca que podría estar partida entre tokens y
 * no emite espacios ni formato iniciales.
 */
export class NoSupportMarkerFilter {
  private pending = '';
  private started = false;
  private suppressed = false;
  private markerAfterContent = false;

  /** La marca apareció después de contenido. */
  get partialSupport(): boolean {
    return this.markerAfterContent;
  }

  push(token: string): string {
    if (this.suppressed) return '';
    this.pending += token;

    let match = MARKER_PATTERN.exec(this.pending);
    while (match) {
      if (
        !this.started &&
        FORMATTING_ONLY.test(this.pending.slice(0, match.index))
      ) {
        this.suppressed = true;
        this.pending = '';
        return '';
      }
      this.markerAfterContent = true;
      this.pending =
        this.pending.slice(0, match.index) +
        this.pending.slice(match.index + match[0].length);
      match = MARKER_PATTERN.exec(this.pending);
    }

    const hold = this.heldSuffixLength();
    let output = this.pending.slice(0, this.pending.length - hold);
    this.pending = this.pending.slice(this.pending.length - hold);
    if (!this.started) {
      if (FORMATTING_ONLY.test(output)) {
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
      // Una marca abierta y truncada (corte por longitud) tampoco es respuesta.
      if (/^[\s*_`"'>:#-]*\[\[/u.test(rest)) {
        return { noSupport: true, tail: '' };
      }
      return {
        noSupport: false,
        tail: FORMATTING_ONLY.test(rest) ? '' : rest.trim(),
      };
    }
    return { noSupport: false, tail: rest };
  }

  /** Largo del final del búfer que aún podría convertirse en la marca. */
  private heldSuffixLength(): number {
    const open = this.pending.lastIndexOf('[[');
    if (
      open >= 0 &&
      !this.pending.includes(']]', open) &&
      this.pending.length - open <= MAX_OPEN_MARKER_CHARS
    ) {
      return this.pending.length - open;
    }
    return this.pending.endsWith('[') ? 1 : 0;
  }
}
