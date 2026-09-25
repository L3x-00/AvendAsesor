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
/** Separador entre unidades de un chunk; «\n\n» cuesta un token. */
const UNIT_SEPARATOR = '\n\n';
const SEPARATOR_TOKENS = 1;
/**
 * El BPE de js-tiktoken es cuadrático en el largo de cada pieza sin espacios:
 * una línea de puntos guía o un texto pegado de miles de caracteres congelaba
 * la API durante minutos. Se acotan antes de codificar.
 */
const MAX_UNBROKEN_CHARS = 200;
/** Un título que precede a un párrafo largo viaja con él (no con el chunk anterior). */
const MAX_HEADING_TOKENS = 60;
const HEADING =
  /^(?:cap[ií]tulo|art[ií]culo|t[ií]tulo|secci[oó]n|anexo|disposici[oó]n|\d+(?:\.\d+)*\.\s)/iu;
const ARTICLE = /art[ií]culo\s+([\w.-]+)/iu;
const REPLACEMENT_CHARS_AT_EDGES = /^�+|�+$/gu;

interface ChunkUnit {
  content: string;
  /** Texto arrastrado del chunk anterior como contexto; nunca forma un chunk por sí solo. */
  overlap: boolean;
  pageEnd: number;
  pageStart: number;
  tokenCount: number;
}

/** Texto limpio de un párrafo, con las tiras sin espacios acotadas. */
function normalizeParagraph(raw: string): string {
  return (
    raw
      .replaceAll(String.fromCharCode(0), '')
      .replace(/\s+/gu, ' ')
      .trim()
      // Relleno repetido (puntos guía, subrayados): no aporta significado.
      .replace(/([^\p{L}\p{N}\s])\1{4,}/gu, '$1$1$1')
      .replace(new RegExp(`\\S{${MAX_UNBROKEN_CHARS}}(?=\\S)`, 'gu'), '$& ')
  );
}

@Injectable()
export class ChunkingService {
  private readonly encoding = getEncoding('o200k_base');

  private decode(tokens: number[]): string {
    return this.encoding
      .decode(tokens)
      .replace(REPLACEMENT_CHARS_AT_EDGES, '')
      .trim();
  }

  /**
   * Solapamiento del chunk emitido: sus últimos OVERLAP_TOKENS, cortados en
   * límite de palabra, con la página donde empieza ese texto (no la última del
   * chunk: «Ver documento» debe abrir la página donde está la cita).
   */
  private overlapUnit(units: ChunkUnit[], tokens: number[]): ChunkUnit | null {
    const last = units.at(-1)!;
    let content: string;
    if (tokens.length <= OVERLAP_TOKENS) {
      content = units.map((unit) => unit.content).join(UNIT_SEPARATOR);
    } else {
      const tail = this.encoding
        .decode(tokens.slice(-OVERLAP_TOKENS))
        .replaceAll('�', '');
      const firstSpace = tail.search(/\s/u);
      content = (firstSpace >= 0 ? tail.slice(firstSpace) : tail).trim();
    }
    if (!content) return null;

    // Página donde empieza el arrastre: se recorren las unidades desde el
    // final hasta cubrir sus tokens.
    const tokenCount = this.encoding.encode(content).length;
    let pageStart = last.pageStart;
    let covered = 0;
    for (let index = units.length - 1; index >= 0; index -= 1) {
      pageStart = units[index].pageStart;
      covered += units[index].tokenCount + (index > 0 ? SEPARATOR_TOKENS : 0);
      if (covered >= tokenCount) break;
    }
    return {
      content,
      overlap: true,
      pageEnd: last.pageEnd,
      pageStart,
      tokenCount,
    };
  }

  chunk(pages: ExtractedPage[]): TextChunk[] {
    const chunks: TextChunk[] = [];
    let units: ChunkUnit[] = [];
    // Tokens de las unidades pendientes, separadores incluidos: se lleva
    // incremental (antes se recodificaba todo lo pendiente por cada párrafo).
    let pendingTokens = 0;
    const setUnits = (next: ChunkUnit[]) => {
      units = next;
      pendingTokens = next.reduce(
        (total, unit, index) =>
          total + unit.tokenCount + (index > 0 ? SEPARATOR_TOKENS : 0),
        0,
      );
    };
    const push = (unit: ChunkUnit) => {
      pendingTokens += unit.tokenCount + (units.length ? SEPARATOR_TOKENS : 0);
      units.push(unit);
    };
    const flush = (options: { keepOverlap?: boolean } = {}) => {
      // Solo el solapamiento pendiente: no hay contenido nuevo que emitir.
      if (!units.some((unit) => !unit.overlap)) {
        setUnits([]);
        return;
      }
      const content = units.map((unit) => unit.content).join(UNIT_SEPARATOR);
      const tokens = this.encoding.encode(content);
      const fresh = units
        .filter((unit) => !unit.overlap)
        .map((unit) => unit.content)
        .join(UNIT_SEPARATOR);
      chunks.push({
        // El artículo del contenido nuevo; el del arrastre solo si no hay otro.
        articleReference: (fresh.match(ARTICLE) ?? content.match(ARTICLE))?.[0],
        chunkContent: content,
        chunkIndex: chunks.length,
        numeralReference: content.match(/(?:^|\s)(\d+(?:\.\d+)+)\.?\s/)?.[1],
        pageEnd: units.at(-1)!.pageEnd,
        pageStart: units[0].pageStart,
        sectionTitle: content.match(
          /^(?:cap[ií]tulo|art[ií]culo).{1,240}/im,
        )?.[0],
        tokenCount: tokens.length,
      });
      const overlap =
        options.keepOverlap === false ? null : this.overlapUnit(units, tokens);
      setUnits(overlap ? [overlap] : []);
    };

    for (const page of pages) {
      for (const raw of page.text.split(/\n{2,}|(?<=\.)\s{2,}/)) {
        const content = normalizeParagraph(raw);
        if (!content) continue;
        const tokens = this.encoding.encode(content);
        const unit: ChunkUnit = {
          content,
          overlap: false,
          pageEnd: page.pageNumber,
          pageStart: page.pageNumber,
          tokenCount: tokens.length,
        };
        if (tokens.length > MAX_TOKENS) {
          this.pushLongParagraph(unit, tokens, units, {
            flush,
            setUnits,
          });
          continue;
        }
        if (
          units.length &&
          pendingTokens + SEPARATOR_TOKENS + tokens.length > MAX_TOKENS
        ) {
          flush();
          // Un arrastre que ya no deja lugar a la unidad nueva se descarta.
          if (
            pendingTokens + SEPARATOR_TOKENS + tokens.length > MAX_TOKENS &&
            units.every((pending) => pending.overlap)
          ) {
            setUnits([]);
          }
        }
        push(unit);
      }
    }
    flush();
    return chunks;
  }

  /**
   * Párrafo de más de MAX_TOKENS: ventanas balanceadas que se solapan
   * OVERLAP_TOKENS y nunca exceden MAX_TOKENS (con paso fijo, la última podía
   * quedar casi contenida en la anterior). Un título pendiente (p. ej.
   * «Artículo 14. Requisitos») encabeza cada ventana en vez de cerrar el chunk
   * anterior, así cada tramo del artículo conserva su referencia.
   */
  private pushLongParagraph(
    unit: ChunkUnit,
    tokens: number[],
    units: ChunkUnit[],
    state: {
      flush: (options?: { keepOverlap?: boolean }) => void;
      setUnits: (next: ChunkUnit[]) => void;
    },
  ): void {
    const headings: ChunkUnit[] = [];
    let headingTokens = 0;
    for (let index = units.length - 1; index >= 0; index -= 1) {
      const candidate = units[index];
      if (
        candidate.overlap ||
        !HEADING.test(candidate.content) ||
        headingTokens + candidate.tokenCount + SEPARATOR_TOKENS >
          MAX_HEADING_TOKENS
      ) {
        break;
      }
      headings.unshift(candidate);
      headingTokens += candidate.tokenCount + SEPARATOR_TOKENS;
    }
    state.setUnits(units.slice(0, units.length - headings.length));
    state.flush({ keepOverlap: false });

    const heading = headings.map((item) => item.content).join(UNIT_SEPARATOR);
    const budget = MAX_TOKENS - headingTokens;
    const windows = Math.ceil(
      (tokens.length - OVERLAP_TOKENS) / (budget - OVERLAP_TOKENS),
    );
    const stride = Math.ceil((tokens.length - OVERLAP_TOKENS) / windows);
    for (let index = 0; index < windows; index += 1) {
      const start = index * stride;
      const body = this.decode(
        tokens.slice(start, start + stride + OVERLAP_TOKENS),
      );
      const content = heading ? `${heading}${UNIT_SEPARATOR}${body}` : body;
      // Cada ventana reemplaza el arrastre anterior (ya incluye el
      // solapamiento con la ventana previa).
      state.setUnits([
        {
          content,
          overlap: false,
          pageEnd: unit.pageEnd,
          pageStart: headings[0]?.pageStart ?? unit.pageStart,
          tokenCount: this.encoding.encode(content).length,
        },
      ]);
      // La última ventana queda abierta: los párrafos breves siguientes se le
      // suman en vez de formar un chunk casi todo solapamiento.
      if (index < windows - 1) state.flush({ keepOverlap: false });
    }
  }
}
