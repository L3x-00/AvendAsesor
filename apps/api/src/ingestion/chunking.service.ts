import { Injectable } from '@nestjs/common';
import { getEncoding, type Tiktoken } from 'js-tiktoken';

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
/** Rótulo de un título normativo: «Artículo 14.», «Capítulo II», «Anexo 3». */
const HEADING_LABEL =
  /^(?:cap[ií]tulos?|art[ií]culos?|t[ií]tulos?|secci[oó]n(?:es)?|anexos?|disposici[oó]n(?:es)?)(?![\p{L}])\s*[\w.°º-]*\.?\s*/iu;
const MAX_HEADING_WORDS = 15;
/** Una frase terminada en punto con más palabras que esto ya es una disposición. */
const MAX_TITLE_SENTENCE_WORDS = 8;
/** Disposición breve: «Dejar sin efecto…», «La presente norma entra en vigencia…». */
const PROVISION_START =
  /^(?:\p{L}+(?:ar|er|ir)\s|(?:la|el|los|las)\s+presentes?\b)/iu;

/**
 * Título puro: rótulo más, a lo sumo, una frase breve («Artículo 14.
 * Requisitos para la reasignación»). Un artículo breve completo («Artículo 3.
 * Vigencia. La presente norma…», «Artículo 3.- La presente norma entra en
 * vigencia…») o el ítem de una lista («1. Copia del DNI») no son títulos:
 * pertenecen al texto que ya los precede.
 */
function isHeading(content: string): boolean {
  const label = HEADING_LABEL.exec(content);
  if (!label) return false;
  const title = content.slice(label[0].length).trim();
  const words = title.split(/\s+/u).filter(Boolean).length;
  if (/[.;:]\s+\S/u.test(title) || words > MAX_HEADING_WORDS) return false;
  // Una sola frase terminada en punto: título si es breve y no dispone nada.
  return !(
    title.endsWith('.') &&
    (words > MAX_TITLE_SENTENCE_WORDS ||
      (words > 3 && PROVISION_START.test(title)))
  );
}
const ARTICLE = /art[ií]culo\s+([\w.-]+)/iu;
const NUMERAL = /(?:^|\s)([1-9]\d*(?:\.\d+)+)\.?\s/u;
const EXPLICIT_LITERAL = /\b(?:literal|inciso)\s+([a-z])\)\s/iu;
const LIST_LITERAL = /(?:^|\n\n)\s*([a-z])\)\s/iu;
const REPLACEMENT_CHARS_AT_EDGES = /^�+|�+$/gu;
/** Tope del «sustento» derivado del primer tramo nuevo de un fragmento. */
const MAX_SUSTENTO_CHARS = 180;
/** Por debajo de esto («Art.», «Requisitos: 1.») no vale como sustento. */
const MIN_SUSTENTO_CHARS = 15;
const SUSTENTO_BOILERPLATE =
  /^(?:documento electr[oó]nico firmado digitalmente|la integridad del documento y la autor[ií]a|esto es una copia aut[eé]ntica|su autenticidad e integridad pueden ser contrastadas)/iu;

/**
 * «Sustento» de un fragmento sin rótulo normativo (preguntas frecuentes,
 * anexos, normas sin títulos): su primera oración, tal como está en el
 * documento, acotada. Cada fila de «Referencias» explica así de qué trata la
 * fuente, sin inventar nada (PO, 2026-10-10). Solo se usa el tramo nuevo: el
 * arrastre del chunk anterior repetiría el cierre del fragmento previo.
 */
function sustentoFromText(text: string): string | undefined {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  if (!normalized) return undefined;
  const completedSentences =
    normalized.match(/.*?[.!?…]+(?=\s|$)/gu)?.map((item) => item.trim()) ?? [];
  const firstSentence = completedSentences.find(
    (item) =>
      item.length >= MIN_SUSTENTO_CHARS && !SUSTENTO_BOILERPLATE.test(item),
  );
  // Un texto sin puntuación todavía puede ser un título útil. Si sí había
  // oraciones pero todas eran fragmentos («puntos.», «Art.», «5.») o sellos de
  // firma, no se usa el resto cortado como si fuera un subtítulo.
  const candidate =
    firstSentence ?? (completedSentences.length === 0 ? normalized : undefined);
  if (!candidate) return undefined;
  const excerpt = candidate.slice(0, MAX_SUSTENTO_CHARS).trim();
  if (excerpt.length < MIN_SUSTENTO_CHARS) return undefined;
  return excerpt.length < candidate.length ? `${excerpt.trimEnd()}…` : excerpt;
}

function subreference(content: string): string | undefined {
  const numeral = content.match(NUMERAL)?.[1];
  const literal =
    content.match(EXPLICIT_LITERAL)?.[1] ?? content.match(LIST_LITERAL)?.[1];
  return (
    [numeral, literal ? `Literal ${literal.toLocaleLowerCase('es')})` : null]
      .filter(Boolean)
      .join(' · ') || undefined
  );
}

interface ChunkUnit {
  content: string;
  /** Texto arrastrado del chunk anterior como contexto; nunca forma un chunk por sí solo. */
  overlap: boolean;
  pageEnd: number;
  pageStart: number;
  /** «Sustento» explícito de una ventana de párrafo largo (título estable). */
  sustento?: string;
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
  private encodingCache: Tiktoken | null = null;

  /**
   * Se construye al trocear el primer documento, no al arrancar: armar el BPE
   * de o200k cuesta ~0,7 s de CPU y ~66 MB, y en la instancia de 0,15 CPU
   * alargaba varios segundos cada arranque en frío de la API (la primera
   * consulta del chat lo esperaba).
   */
  private get encoding(): Tiktoken {
    this.encodingCache ??= getEncoding('o200k_base');
    return this.encodingCache;
  }

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
      // Las ventanas de un párrafo largo traen su propio sustento (o su
      // ausencia marcada con ''): todas comparten el mismo resultado, tomado
      // del inicio del párrafo completo, nunca del corte a mitad de oración.
      const windowSustento = units.find(
        (unit) => !unit.overlap && unit.sustento !== undefined,
      )?.sustento;
      const sustento =
        windowSustento === undefined ? sustentoFromText(fresh) : windowSustento;
      chunks.push({
        // El artículo del contenido nuevo; el del arrastre solo si no hay otro.
        articleReference: (fresh.match(ARTICLE) ?? content.match(ARTICLE))?.[0],
        chunkContent: content,
        chunkIndex: chunks.length,
        numeralReference: subreference(content),
        pageEnd: units.at(-1)!.pageEnd,
        pageStart: units[0].pageStart,
        // Rótulo normativo si existe; si no, la primera oración del tramo
        // nuevo como «sustento» legible de la referencia.
        sectionTitle:
          content.match(
            /^(?:cap[ií]tulo|t[ií]tulo|secci[oó]n|art[ií]culo|anexo|disposici[oó]n(?:es)?).{1,240}/imu,
          )?.[0] ??
          (sustento || undefined),
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
        !isHeading(candidate.content) ||
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
          // El sustento se toma del párrafo completo una sola vez: cada
          // ventana empieza en un corte de tokens y su inicio no es una frase.
          // '' marca «sin sustento» para que ninguna ventana derive del corte.
          sustento: sustentoFromText(unit.content) ?? '',
          tokenCount: this.encoding.encode(content).length,
        },
      ]);
      // La última ventana queda abierta: los párrafos breves siguientes se le
      // suman en vez de formar un chunk casi todo solapamiento.
      if (index < windows - 1) state.flush({ keepOverlap: false });
    }
  }
}
