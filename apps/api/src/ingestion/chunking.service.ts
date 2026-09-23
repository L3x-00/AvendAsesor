import { Injectable } from '@nestjs/common';
import { getEncoding } from 'js-tiktoken';

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}
export interface TextChunk {
  articleReference?: string;
  chunkContent: string;
  chunkIndex: number;
  numeralReference?: string;
  pageEnd: number;
  pageStart: number;
  sectionTitle?: string;
  tokenCount: number;
}

const MAX_TOKENS = 800;
const OVERLAP_TOKENS = 100;

interface ChunkUnit {
  content: string;
  /** Texto arrastrado del chunk anterior como contexto; nunca forma un chunk por sí solo. */
  overlap: boolean;
  pageNumber: number;
}

@Injectable()
export class ChunkingService {
  private readonly encoding = getEncoding('o200k_base');

  /**
   * Cola del contenido acotada a OVERLAP_TOKENS y cortada en límite de palabra.
   * Antes el solapamiento arrastraba unidades enteras (hasta 800 tokens) y, tras
   * una ventana de un párrafo largo, la ventana completa volvía a emitirse como
   * un chunk idéntico: fuentes duplicadas en la recuperación y en la tabla de
   * referencias.
   */
  private overlapTail(content: string): string {
    const tokens = this.encoding.encode(content);
    if (tokens.length <= OVERLAP_TOKENS) return content;
    const tail = this.encoding
      .decode(tokens.slice(-OVERLAP_TOKENS))
      .replaceAll('�', '');
    const firstSpace = tail.search(/\s/u);
    return (firstSpace >= 0 ? tail.slice(firstSpace) : tail).trim();
  }

  chunk(pages: ExtractedPage[]): TextChunk[] {
    const chunks: TextChunk[] = [];
    let units: ChunkUnit[] = [];
    const flush = () => {
      // Solo el solapamiento pendiente: no hay contenido nuevo que emitir.
      if (!units.some((unit) => !unit.overlap)) {
        units = [];
        return;
      }
      const content = units.map((unit) => unit.content).join('\n\n');
      const tokens = this.encoding.encode(content);
      const first = units[0];
      const last = units.at(-1)!;
      chunks.push({
        articleReference: content.match(/art[ií]culo\s+([\w.-]+)/i)?.[0],
        chunkContent: content,
        chunkIndex: chunks.length,
        numeralReference: content.match(/(?:^|\s)(\d+(?:\.\d+)+)\.?\s/)?.[1],
        pageEnd: last.pageNumber,
        pageStart: first.pageNumber,
        sectionTitle: content.match(
          /^(?:cap[ií]tulo|art[ií]culo).{1,240}/im,
        )?.[0],
        tokenCount: tokens.length,
      });
      const tail = this.overlapTail(content);
      units = tail
        ? [{ content: tail, overlap: true, pageNumber: last.pageNumber }]
        : [];
    };

    for (const page of pages) {
      for (const raw of page.text.split(/\n{2,}|(?<=\.)\s{2,}/)) {
        const content = raw
          .replaceAll(String.fromCharCode(0), '')
          .replace(/\s+/g, ' ')
          .trim();
        if (!content) continue;
        const tokens = this.encoding.encode(content);
        if (tokens.length > MAX_TOKENS) {
          flush();
          // Ventanas balanceadas: con paso fijo, la última podía quedar casi
          // contenida en la anterior (p. ej. 101 tokens de los que 100 ya
          // estaban emitidos). Se reparte el texto en N ventanas parejas que se
          // solapan OVERLAP_TOKENS y nunca exceden MAX_TOKENS.
          const windows = Math.ceil(
            (tokens.length - OVERLAP_TOKENS) / (MAX_TOKENS - OVERLAP_TOKENS),
          );
          const stride = Math.ceil((tokens.length - OVERLAP_TOKENS) / windows);
          for (let index = 0; index < windows; index += 1) {
            const start = index * stride;
            // Cada ventana reemplaza el arrastre anterior (ya incluye el
            // solapamiento con la ventana previa).
            units = [
              {
                content: this.encoding.decode(
                  tokens.slice(start, start + stride + OVERLAP_TOKENS),
                ),
                overlap: false,
                pageNumber: page.pageNumber,
              },
            ];
            // La última ventana queda abierta: los párrafos breves siguientes se
            // le suman en vez de formar un chunk casi todo solapamiento.
            if (index < windows - 1) flush();
          }
        } else {
          const current = units.reduce(
            (total, unit) => total + this.encoding.encode(unit.content).length,
            0,
          );
          if (current + tokens.length > MAX_TOKENS && units.length) flush();
          units.push({ content, overlap: false, pageNumber: page.pageNumber });
        }
      }
    }
    flush();
    return chunks;
  }
}
