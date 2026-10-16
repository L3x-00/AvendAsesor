import { Injectable } from '@nestjs/common';
import { Tiktoken, type TiktokenBPE } from 'js-tiktoken/lite';

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
/** Disposición breve: «Dejar sin efecto…», «La presente norma entra en vigencia…». */
const PROVISION_START =
  /^(?:\p{L}+(?:ar|er|ir)\s|(?:la|el|los|las)\s+presentes?\b)/iu;
/** Mandatos conjugados frecuentes en normas: «Apruébase», «Dispóngase», etc. */
const LEGAL_DIRECTIVE_START =
  /^(?:apru[eé](?:base|bese)|modif[ií](?:case|quese)|disp[oó]ngase|autor[ií](?:zase|cese)|der[oó]g(?:ase|uese)|incorp[oó]r(?:ase|ese)|publ[ií]quese|enc[aá]rguese|decl[aá]rese|d[eé]jase|establ[eé]cese|prec[ií]sase|sustit[uú]yase|excl[uú]yase|ampl[ií]ase|prorr[oó]gase|reg[ií]strese|comun[ií]quese|c[uú]mplase|refr[eé]ndese|ot[oó]rgase|conc[eé]dese|des[ií]gnase|conf[oó]rmase|resu[eé]lvase|ac[eé]ptase|rectif[ií]quese|susp[eé]ndase)\b/iu;

/**
 * Título puro: rótulo más, a lo sumo, una frase breve («Artículo 14.
 * Requisitos para la reasignación»). Un artículo breve completo («Artículo 3.
 * Vigencia. La presente norma…», «Artículo 3.- La presente norma entra en
 * vigencia…») o el ítem de una lista («1. Copia del DNI») no son títulos:
 * pertenecen al texto que ya los precede.
 */
function isHeading(content: string): boolean {
  const label = HEADING_LABEL.exec(content);
  // Las mayúsculas por sí solas no prueban estructura: importes, firmas y
  // nombres institucionales suelen venir destacados de esa forma en un PDF.
  if (!label) return false;
  const title = content.slice(label[0].length).trim();
  const words = title.split(/\s+/u).filter(Boolean).length;
  if (/[.;:]\s+\S/u.test(title) || words > MAX_HEADING_WORDS) return false;
  // Un sufijo terminado como oración es contenido normativo, aunque sea corto
  // («La remuneración mensual es…»). Sin evidencia adicional no se presenta
  // como título/subtítulo. Los mandatos se rechazan incluso sin puntuación.
  return !(
    title.endsWith('.') ||
    LEGAL_DIRECTIVE_START.test(title) ||
    (words > 3 && PROVISION_START.test(title))
  );
}
const ARTICLE_AT_START =
  /^art[ií]culo\s+[\p{L}\p{N}]+(?:[.-][\p{L}\p{N}]+)*(?:°|º)?(?:\s*[.:\-–—]+)?/iu;
const NUMERAL_AT_START = /^([1-9]\d*(?:\.\d+)+)\.?(?:\s|$)/u;
const EXPLICIT_LITERAL_AT_START = /^(?:literal|inciso)\s+([a-z])\)(?:\s|$)/iu;
const LIST_LITERAL_AT_START = /^([a-z])\)(?:\s|$)/iu;
const REPLACEMENT_CHARS_AT_EDGES = /^�+|�+$/gu;

interface StructuralLocation {
  articleReference?: string;
  containerSectionTitle?: string;
  literal?: string;
  numeral?: string;
  sectionTitle?: string;
  structuralHeading: boolean;
}

/**
 * Solo reconoce ubicación que comienza en la propia unidad. Una mención a un
 * artículo o numeral dentro del texto corrido nunca se convierte en metadato.
 */
function structuralLocation(content: string): StructuralLocation {
  const articleReference = content.match(ARTICLE_AT_START)?.[0].trim();
  const structuralHeading = isHeading(content);
  const numeral = content.match(NUMERAL_AT_START)?.[1];
  const literal =
    content.match(EXPLICIT_LITERAL_AT_START)?.[1] ??
    content.match(LIST_LITERAL_AT_START)?.[1];

  if (articleReference) {
    const articleTitle = structuralHeading
      ? content
          .slice(articleReference.length)
          .replace(/^[\s.:\-–—]+/u, '')
          .trim()
      : '';
    return {
      articleReference,
      literal,
      numeral,
      ...(articleTitle ? { sectionTitle: articleTitle } : {}),
      structuralHeading,
    };
  }

  return {
    ...(structuralHeading
      ? {
          containerSectionTitle: content,
          sectionTitle: content,
        }
      : {}),
    literal,
    numeral,
    structuralHeading,
  };
}

interface ChunkUnit {
  articleReference?: string;
  content: string;
  /** La unidad es un título/subtítulo comprobable, no texto descriptivo. */
  structuralHeading: boolean;
  numeralReference?: string;
  /** Texto arrastrado del chunk anterior como contexto; nunca forma un chunk por sí solo. */
  overlap: boolean;
  pageEnd: number;
  pageStart: number;
  sectionTitle?: string;
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
    if (!this.encodingCache) {
      // The main entry point embeds every vocabulary at import time. Load only
      // the existing o200k vocabulary, and only when a document is chunked.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const ranks = require('js-tiktoken/ranks/o200k_base') as TiktokenBPE;
      this.encodingCache = new Tiktoken(ranks);
    }
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
      articleReference: last.articleReference,
      content,
      structuralHeading: false,
      numeralReference: last.numeralReference,
      overlap: true,
      pageEnd: last.pageEnd,
      pageStart,
      sectionTitle: last.sectionTitle,
      tokenCount,
    };
  }

  chunk(pages: ExtractedPage[]): TextChunk[] {
    const chunks: TextChunk[] = [];
    let units: ChunkUnit[] = [];
    let activeArticleReference: string | undefined;
    let activeArticleTitle: string | undefined;
    let activeContainerTitle: string | undefined;
    let activeLiteral: string | undefined;
    let activeNumeral: string | undefined;
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
      const latestFresh = units.filter((unit) => !unit.overlap).at(-1)!;
      chunks.push({
        articleReference: latestFresh.articleReference,
        chunkContent: content,
        chunkIndex: chunks.length,
        numeralReference: latestFresh.numeralReference,
        pageEnd: units.at(-1)!.pageEnd,
        pageStart: units[0].pageStart,
        sectionTitle: latestFresh.sectionTitle,
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
        const location = structuralLocation(content);
        const hasFreshBody = units.some(
          (pending) => !pending.overlap && !pending.structuralHeading,
        );
        const startsLiteral = location.literal != null;
        if (
          hasFreshBody &&
          (location.articleReference != null ||
            location.containerSectionTitle != null ||
            location.numeral != null ||
            startsLiteral)
        ) {
          // Un fragmento visible nunca mezcla dos ubicaciones estructurales.
          flush({ keepOverlap: false });
        }

        if (location.containerSectionTitle) {
          activeContainerTitle = location.containerSectionTitle;
          activeArticleReference = undefined;
          activeArticleTitle = undefined;
          activeNumeral = undefined;
          activeLiteral = undefined;
        }
        if (location.articleReference) {
          activeArticleReference = location.articleReference;
          activeArticleTitle = location.sectionTitle;
          activeNumeral = undefined;
          activeLiteral = undefined;
        }
        if (location.numeral) {
          activeNumeral = location.numeral;
          activeLiteral = undefined;
        }
        if (location.literal) {
          activeLiteral = location.literal.toLocaleLowerCase('es');
        }

        const tokens = this.encoding.encode(content);
        const unit: ChunkUnit = {
          articleReference: activeArticleReference,
          content,
          structuralHeading: location.structuralHeading,
          numeralReference:
            [
              activeNumeral,
              activeLiteral ? `Literal ${activeLiteral})` : undefined,
            ]
              .filter(Boolean)
              .join(' · ') || undefined,
          overlap: false,
          pageEnd: page.pageNumber,
          pageStart: page.pageNumber,
          sectionTitle: activeArticleTitle ?? activeContainerTitle,
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
        !candidate.structuralHeading ||
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
          articleReference: unit.articleReference,
          content,
          structuralHeading: false,
          numeralReference: unit.numeralReference,
          overlap: false,
          pageEnd: unit.pageEnd,
          pageStart: headings[0]?.pageStart ?? unit.pageStart,
          sectionTitle: unit.sectionTitle,
          tokenCount: this.encoding.encode(content).length,
        },
      ]);
      // La última ventana queda abierta: los párrafos breves siguientes se le
      // suman en vez de formar un chunk casi todo solapamiento.
      if (index < windows - 1) state.flush({ keepOverlap: false });
    }
  }
}
