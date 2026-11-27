import "server-only";
import { fileURLToPath } from "node:url";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  PageOrientation,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  classifyTableAt,
  columnAlignments,
  markdownTableRowsAsText,
  STRUCTURED_SALARY_MARKER,
  structuredSalaryRowsToMarkdown,
  withoutCitationColumns,
  type ColumnAlignment,
} from "@/components/chat/chat-response-tables";
import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";
import {
  singleCitedSource,
  sourceDocumentKey,
  withoutCitationTokens,
} from "@/lib/chat-api/citations";
import {
  describeOrientationSource,
  ORIENTATION_DISCLAIMER,
  sanitizeDocumentText,
  type OrientationDocumentContent,
} from "./model";

const NAVY = "0D1B3D";
const ACCENT = "1677FF";
const MUTED = "667085";

type OrientationSource = OrientationDocumentContent["sources"][number];

function singleCitedDocumentSource(
  text: string,
  sources: readonly OrientationSource[],
): OrientationSource | undefined {
  return singleCitedSource(text, sources);
}

function prepareExportEvidence(
  text: string,
  sources: readonly OrientationSource[],
): {
  answer: string;
  consolidatedRank: number | undefined;
  sources: OrientationSource[];
} {
  const consolidated = singleCitedDocumentSource(text, sources);
  if (!consolidated) {
    return { answer: text, consolidatedRank: undefined, sources: [...sources] };
  }

  // Con una sola fuente probada la cita se imprime una vez por bloque, no en
  // cada párrafo ni en cada fila. El texto se conserva intacto hasta que cada
  // bloque decide qué citas oculta: si se quitaran antes, una columna «Cita»
  // quedaría vacía y la tabla perdería su estructura.
  return {
    answer: text,
    consolidatedRank: consolidated.rank,
    sources: uniqueDocumentSources(sources),
  };
}

/**
 * Texto de un párrafo o celda sin las citas que ya se imprimen una sola vez,
 * con los ajustes propios del archivo (rótulo «Fuentes:» suelto, líneas en
 * blanco repetidas).
 */
function visibleExportText(text: string): string {
  return withoutCitationTokens(text)
    .replace(/^\s*(?:fuentes?|referencias?)\s*:\s*$/gimu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function uniqueDocumentSources(
  sources: readonly OrientationSource[],
): OrientationSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = sourceDocumentKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Fonts are vendored under ./fonts and referenced with static
// `new URL(..., import.meta.url)` literals so the bundler traces and ships them
// as assets. Turbopack does not honor outputFileTracingIncludes for files read
// only at runtime, so resolving them from node_modules would leave the .woff out
// of a serverless/standalone deployment and break PDF generation. Vendored from
// the @fontsource Noto Sans / Noto Emoji packages (SIL Open Font License).
const PDF_FONT_PATHS = {
  emoji: fileURLToPath(
    new URL("./fonts/noto-emoji-emoji-400-normal.woff", import.meta.url),
  ),
  latinBold: fileURLToPath(
    new URL("./fonts/noto-sans-latin-700-normal.woff", import.meta.url),
  ),
  latinExtBold: fileURLToPath(
    new URL("./fonts/noto-sans-latin-ext-700-normal.woff", import.meta.url),
  ),
  latinExtItalic: fileURLToPath(
    new URL("./fonts/noto-sans-latin-ext-400-italic.woff", import.meta.url),
  ),
  latinExtRegular: fileURLToPath(
    new URL("./fonts/noto-sans-latin-ext-400-normal.woff", import.meta.url),
  ),
  latinItalic: fileURLToPath(
    new URL("./fonts/noto-sans-latin-400-italic.woff", import.meta.url),
  ),
  latinRegular: fileURLToPath(
    new URL("./fonts/noto-sans-latin-400-normal.woff", import.meta.url),
  ),
} as const;

interface FontGlyphLookup {
  hasGlyphForCodePoint(codePoint: number): boolean;
}

// Keep this as a static import. `serverExternalPackages` preserves Node's
// implementation, while static analysis can trace fontkit's complete runtime
// dependency graph into the serverless function. A dynamic createRequire call
// hid the require-only `restructure/dist/main.cjs` entry from Vercel tracing.
const openFont = fontkit.openSync as (path: string) => FontGlyphLookup;
const PDF_FONT_LOOKUPS = {
  emoji: openFont(PDF_FONT_PATHS.emoji),
  latin: openFont(PDF_FONT_PATHS.latinRegular),
  latinExt: openFont(PDF_FONT_PATHS.latinExtRegular),
};

type PdfFontStyle = "bold" | "italic" | "regular";
type PdfFontFamily = "emoji" | "latin" | "latinExt";

const PDF_FONT_NAMES: Record<PdfFontFamily, Record<PdfFontStyle, string>> = {
  emoji: {
    bold: "NotoEmoji",
    italic: "NotoEmoji",
    regular: "NotoEmoji",
  },
  latin: {
    bold: "NotoSansBold",
    italic: "NotoSansItalic",
    regular: "NotoSans",
  },
  latinExt: {
    bold: "NotoSansExtBold",
    italic: "NotoSansExtItalic",
    regular: "NotoSansExt",
  },
};

function registerPdfFonts(document: PDFKit.PDFDocument): void {
  document.registerFont("NotoEmoji", PDF_FONT_PATHS.emoji);
  document.registerFont("NotoSans", PDF_FONT_PATHS.latinRegular);
  document.registerFont("NotoSansBold", PDF_FONT_PATHS.latinBold);
  document.registerFont("NotoSansItalic", PDF_FONT_PATHS.latinItalic);
  document.registerFont("NotoSansExt", PDF_FONT_PATHS.latinExtRegular);
  document.registerFont("NotoSansExtBold", PDF_FONT_PATHS.latinExtBold);
  document.registerFont("NotoSansExtItalic", PDF_FONT_PATHS.latinExtItalic);
}

function resolvePdfCharacter(character: string): {
  character: string;
  family: PdfFontFamily;
} {
  const codePoint = character.codePointAt(0) ?? 0xfffd;
  if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) {
    return { character, family: "latin" };
  }
  if (PDF_FONT_LOOKUPS.latin.hasGlyphForCodePoint(codePoint)) {
    return { character, family: "latin" };
  }
  if (PDF_FONT_LOOKUPS.latinExt.hasGlyphForCodePoint(codePoint)) {
    return { character, family: "latinExt" };
  }
  if (PDF_FONT_LOOKUPS.emoji.hasGlyphForCodePoint(codePoint)) {
    return { character, family: "emoji" };
  }

  // A visible replacement is safer than silently dropping unsupported data.
  return { character: "�", family: "latin" };
}

function writePdfText(
  document: PDFKit.PDFDocument,
  value: string,
  style: PdfFontStyle,
  options: PDFKit.Mixins.TextOptions = {},
): void {
  const safeText = sanitizeDocumentText(value);
  const runs: Array<{ family: PdfFontFamily; text: string }> = [];

  for (const original of safeText) {
    const resolved = resolvePdfCharacter(original);
    const latest = runs.at(-1);
    if (latest?.family === resolved.family) latest.text += resolved.character;
    else runs.push({ family: resolved.family, text: resolved.character });
  }

  if (runs.length === 0) return;
  runs.forEach((run, index) => {
    document
      .font(PDF_FONT_NAMES[run.family][style])
      .text(run.text, { ...options, continued: index < runs.length - 1 });
  });
}

function wordTextParagraphs(text: string): Paragraph[] {
  return sanitizeDocumentText(text)
    .split("\n")
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun(line || " ")],
          spacing: { after: 120, line: 330 },
        }),
    );
}

type OrientationBlock =
  | { kind: "paragraph"; text: string }
  | {
      alignments: Array<ColumnAlignment | undefined>;
      headers: string[];
      kind: "table";
      rows: string[][];
    };

/**
 * Separa párrafos y tablas del texto de la respuesta con la misma regla que la
 * vista previa: `classifyTableAt` + `withoutCitationColumns`. La ficha en
 * pantalla y el archivo descargado deben mostrar el mismo cuadro; un segundo
 * intérprete propio divergía y, al rechazar las celdas vacías de la columna
 * «Cita», imprimía las barras Markdown como texto.
 */
function parseOrientationBlocks(
  text: string,
  sources: readonly OrientationSource[],
  consolidatedRank?: number,
): OrientationBlock[] {
  const sourceRanks = sources.map((source) => source.rank);
  const visible = (value: string) =>
    consolidatedRank === undefined ? value : visibleExportText(value);
  const lines = structuredSalaryRowsToMarkdown(
    sanitizeDocumentText(text),
  ).split("\n");
  const blocks: OrientationBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const value = visible(paragraph.join("\n").trim());
    if (value) blocks.push({ kind: "paragraph", text: value });
    paragraph = [];
  };

  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (line.trim() === STRUCTURED_SALARY_MARKER) {
      index += 1;
      continue;
    }

    const classified = classifyTableAt(
      lines,
      index,
      sourceRanks,
      consolidatedRank,
    );
    if (classified) {
      flushParagraph();
      const table =
        consolidatedRank === undefined
          ? classified.table
          : withoutCitationColumns(classified.table);

      if (classified.asGrid) {
        blocks.push({
          alignments: columnAlignments(table),
          headers: table.headers.map(visible),
          kind: "table",
          rows: table.rows.map((row) => row.map(visible)),
        });
      } else {
        // Sin evidencia por fila la tabla no se pinta como grilla; se lee una
        // línea por fila en lugar de mostrar las barras Markdown.
        const rows = markdownTableRowsAsText(table)
          .map(visible)
          .filter(Boolean);
        if (rows.length) {
          blocks.push({ kind: "paragraph", text: rows.join("\n") });
        }
      }

      index = classified.table.endIndex;
      continue;
    }

    if (!line.trim()) flushParagraph();
    else paragraph.push(line);
    index += 1;
  }
  flushParagraph();
  return blocks;
}

/**
 * Ancho de cada columna proporcional a su contenido, con un mínimo legible para
 * que una columna corta no desaparezca ni una larga ocupe toda la tabla.
 */
function columnWidths(
  headers: readonly string[],
  rows: readonly string[][],
  availableWidth: number,
): number[] {
  const weights = headers.map((header, column) => {
    const longest = Math.max(
      header.length,
      ...rows.map((row) => (row[column] ?? "").length),
    );
    return Math.min(32, Math.max(8, longest));
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (availableWidth * weight) / total);
}

/** Márgenes y ancho útil (en twips) de la página A4 de la ficha. */
const DOCX_PAGE_MARGIN = 1_134;
const DOCX_PAGE_WIDTH = 11_906;
const WORD_TABLE_WIDTH = DOCX_PAGE_WIDTH - DOCX_PAGE_MARGIN * 2;

function columnAlignment(
  alignment: ColumnAlignment | undefined,
): (typeof AlignmentType)[keyof typeof AlignmentType] {
  if (alignment === "center") return AlignmentType.CENTER;
  if (alignment === "right") return AlignmentType.RIGHT;
  return AlignmentType.LEFT;
}

const TABLE_BORDERS = {
  bottom: { color: "B8C4D9", size: 4, style: BorderStyle.SINGLE },
  insideHorizontal: { color: "B8C4D9", size: 4, style: BorderStyle.SINGLE },
  insideVertical: { color: "B8C4D9", size: 4, style: BorderStyle.SINGLE },
  left: { color: "B8C4D9", size: 4, style: BorderStyle.SINGLE },
  right: { color: "B8C4D9", size: 4, style: BorderStyle.SINGLE },
  top: { color: "B8C4D9", size: 4, style: BorderStyle.SINGLE },
};

function wordTable(block: Extract<OrientationBlock, { kind: "table" }>): Table {
  const cell = (value: string, column: number, header = false) =>
    new TableCell({
      children: [
        new Paragraph({
          alignment: columnAlignment(block.alignments[column]),
          children: [
            new TextRun({
              bold: header,
              size: 18,
              text: sanitizeDocumentText(value) || " ",
            }),
          ],
          spacing: { after: 0 },
        }),
      ],
      margins: { bottom: 60, left: 80, right: 80, top: 60 },
      shading: header ? { fill: "E8F1FF" } : undefined,
    });

  return new Table({
    borders: TABLE_BORDERS,
    columnWidths: columnWidths(block.headers, block.rows, WORD_TABLE_WIDTH),
    layout: TableLayoutType.FIXED,
    rows: [
      new TableRow({
        children: block.headers.map((header, column) =>
          cell(header, column, true),
        ),
        tableHeader: true,
      }),
      ...block.rows.map(
        (row) =>
          new TableRow({
            children: row.map((value, column) => cell(value, column)),
          }),
      ),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function wordContentBlocks(
  blocks: readonly OrientationBlock[],
): Array<Paragraph | Table> {
  return blocks.flatMap((block) =>
    block.kind === "table"
      ? [wordTable(block)]
      : wordTextParagraphs(block.text),
  );
}

function wordField(label: string, value: string): Paragraph | null {
  if (!value) return null;
  const safeValue = sanitizeDocumentText(value);
  if (!safeValue) return null;
  return new Paragraph({
    children: [
      new TextRun({ bold: true, text: `${label}: ` }),
      new TextRun(safeValue),
    ],
    spacing: { after: 100 },
  });
}

export async function buildOrientationDocx(
  content: OrientationDocumentContent,
): Promise<Buffer> {
  const { answer, consolidatedRank, sources } = prepareExportEvidence(
    content.answer,
    content.sources,
  );
  const answerBlocks = parseOrientationBlocks(
    answer,
    sources,
    consolidatedRank,
  );
  const optionalFields = [
    wordField("Docente", content.teacherName),
    wordField("Institución", content.institution),
  ].filter((paragraph): paragraph is Paragraph => paragraph !== null);

  const document = new Document({
    sections: [
      {
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    color: MUTED,
                    italics: true,
                    size: 18,
                    text: ORIENTATION_DISCLAIMER,
                  }),
                ],
              }),
            ],
          }),
        },
        properties: {
          page: {
            margin: {
              bottom: DOCX_PAGE_MARGIN,
              left: DOCX_PAGE_MARGIN,
              right: DOCX_PAGE_MARGIN,
              top: DOCX_PAGE_MARGIN,
            },
            size: {
              height: 16_838,
              orientation: PageOrientation.PORTRAIT,
              width: DOCX_PAGE_WIDTH,
            },
          },
        },
        children: [
          new Paragraph({
            children: [
              new TextRun({
                bold: true,
                color: ACCENT,
                size: 22,
                text: "AVEND ASESOR",
              }),
            ],
            spacing: { after: 120 },
          }),
          new Paragraph({
            border: {
              bottom: {
                color: ACCENT,
                size: 10,
                space: 1,
                style: BorderStyle.SINGLE,
              },
            },
            children: [
              new TextRun({
                bold: true,
                color: NAVY,
                size: 34,
                text: "FICHA DE ORIENTACIÓN AVEND",
              }),
            ],
            spacing: { after: 260 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                bold: true,
                color: NAVY,
                text: ORIENTATION_DISCLAIMER,
              }),
            ],
            spacing: { after: 260 },
          }),
          new Paragraph({
            children: [
              new TextRun({
                bold: true,
                size: 28,
                text: sanitizeDocumentText(content.documentTitle),
              }),
            ],
            heading: HeadingLevel.TITLE,
            spacing: { after: 180 },
          }),
          ...optionalFields,
          wordField("Fecha de la orientación", content.answeredOn)!,
          new Paragraph({
            children: [
              new TextRun({ bold: true, color: NAVY, text: "Consulta" }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 260, after: 100 },
          }),
          ...wordTextParagraphs(content.question),
          new Paragraph({
            children: [
              new TextRun({
                bold: true,
                color: NAVY,
                text: "Orientación recibida",
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 260, after: 100 },
          }),
          ...wordContentBlocks(answerBlocks),
          ...(content.caseNotes
            ? [
                new Paragraph({
                  children: [
                    new TextRun({
                      bold: true,
                      color: NAVY,
                      text: "Notas del caso",
                    }),
                  ],
                  heading: HeadingLevel.HEADING_1,
                  spacing: { before: 260, after: 100 },
                }),
                ...wordTextParagraphs(content.caseNotes),
              ]
            : []),
          new Paragraph({
            children: [
              new TextRun({
                bold: true,
                color: NAVY,
                text: "Fuentes consultadas",
              }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 260, after: 100 },
          }),
          ...sources.map(
            (source) =>
              new Paragraph({
                children: [new TextRun(describeOrientationSource(source))],
                numbering: { level: 0, reference: "orientation-sources" },
                spacing: { after: 100, line: 300 },
              }),
          ),
        ],
      },
    ],
    numbering: {
      config: [
        {
          levels: [
            {
              alignment: AlignmentType.LEFT,
              format: "bullet",
              level: 0,
              style: { paragraph: { indent: { hanging: 360, left: 720 } } },
              text: "•",
            },
          ],
          reference: "orientation-sources",
        },
      ],
    },
    styles: {
      default: {
        document: {
          paragraph: { spacing: { line: 300 } },
          run: { color: "111827", font: "Arial", size: 22 },
        },
      },
    },
  });

  return Buffer.from(await Packer.toBuffer(document));
}

function writePdfHeading(document: PDFKit.PDFDocument, text: string): void {
  document.moveDown(0.7).fontSize(14).fillColor(`#${NAVY}`);
  writePdfText(document, text, "bold", { lineGap: 2 });
}

function writePdfBody(document: PDFKit.PDFDocument, text: string): void {
  document.moveDown(0.25).fontSize(11).fillColor("#111827");
  writePdfText(document, text, "regular", { lineGap: 4 });
}

/**
 * Fuente con la que se dibuja una celda. Se elige la primera familia que cubre
 * todos sus caracteres para que la medición y el dibujo coincidan; si ninguna
 * los cubre, los glifos ausentes se sustituyen por un reemplazo visible en vez
 * de dejar huecos en blanco.
 */
function pdfCellStyle(
  value: string,
  style: PdfFontStyle,
): { font: string; text: string } {
  const safeText = sanitizeDocumentText(value) || " ";
  const characters = [...safeText];
  const families: PdfFontFamily[] = ["latin", "latinExt", "emoji"];
  const covers = (family: PdfFontFamily, character: string) => {
    const codePoint = character.codePointAt(0) ?? 0xfffd;
    if (codePoint === 0x09 || codePoint === 0x0a || codePoint === 0x0d) {
      return true;
    }
    return PDF_FONT_LOOKUPS[family].hasGlyphForCodePoint(codePoint);
  };

  for (const family of families) {
    if (characters.every((character) => covers(family, character))) {
      return { font: PDF_FONT_NAMES[family][style], text: safeText };
    }
  }

  return {
    font: PDF_FONT_NAMES.latin[style],
    text: characters
      .map((character) => resolvePdfCharacter(character).character)
      .join(""),
  };
}

function writePdfTable(
  document: PDFKit.PDFDocument,
  block: Extract<OrientationBlock, { kind: "table" }>,
): void {
  const fontSize = 8.5;
  const padding = 4;
  const lineGap = 1;
  const left = document.page.margins.left;
  const top = document.page.margins.top;
  const bottom = document.page.height - document.page.margins.bottom;
  const availableWidth =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  const widths = columnWidths(block.headers, block.rows, availableWidth);

  const rowHeight = (cells: string[], header: boolean): number => {
    return (
      Math.max(
        fontSize + lineGap,
        ...cells.map((cell, column) => {
          const cellStyle = pdfCellStyle(cell, header ? "bold" : "regular");
          document.font(cellStyle.font).fontSize(fontSize);
          return document.heightOfString(cellStyle.text, {
            lineGap,
            width: widths[column]! - padding * 2,
          });
        }),
      ) +
      padding * 2
    );
  };

  const drawRow = (cells: string[], header: boolean): void => {
    const height = rowHeight(cells, header);
    if (document.y + height > bottom && document.y > top) {
      document.addPage();
      document.y = top;
      // Una escala sin encabezado deja de ser legible cuando continúa en otra
      // página, así que la cabecera se repite antes de la fila que no cabía.
      if (!header) drawRow(block.headers, true);
    }
    let x = left;
    const y = document.y;
    for (const [index, value] of cells.entries()) {
      const width = widths[index]!;
      const cellStyle = pdfCellStyle(value, header ? "bold" : "regular");
      document
        .rect(x, y, width, height)
        .fillAndStroke(header ? "#E8F1FF" : "#FFFFFF", "#B8C4D9");
      document
        .font(cellStyle.font)
        .fontSize(fontSize)
        .fillColor("#111827")
        .text(cellStyle.text, x + padding, y + padding, {
          align: block.alignments[index] ?? "left",
          lineGap,
          width: width - padding * 2,
        });
      x += width;
    }
    document.y = y + height;
  };

  document.moveDown(0.25);
  drawRow(block.headers, true);
  for (const row of block.rows) drawRow(row, false);
  document.moveDown(0.6);
}

function writePdfBlocks(
  document: PDFKit.PDFDocument,
  blocks: readonly OrientationBlock[],
): void {
  for (const block of blocks) {
    if (block.kind === "table") writePdfTable(document, block);
    else writePdfBody(document, block.text);
  }
}

export function buildOrientationPdf(
  content: OrientationDocumentContent,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { answer, consolidatedRank, sources } = prepareExportEvidence(
      content.answer,
      content.sources,
    );
    const answerBlocks = parseOrientationBlocks(
      answer,
      sources,
      consolidatedRank,
    );
    const document = new PDFDocument({
      compress: false,
      info: {
        Author: "AVEND ASESOR",
        Subject: ORIENTATION_DISCLAIMER,
        Title: sanitizeDocumentText(content.documentTitle),
      },
      margins: { bottom: 54, left: 54, right: 54, top: 54 },
      size: "A4",
    });
    const chunks: Buffer[] = [];
    registerPdfFonts(document);

    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    document.fontSize(11).fillColor(`#${ACCENT}`);
    writePdfText(document, "AVEND ASESOR", "bold");
    document.moveDown(0.35).fontSize(20).fillColor(`#${NAVY}`);
    writePdfText(document, "FICHA DE ORIENTACIÓN AVEND", "bold", {
      lineGap: 3,
    });
    document.moveDown(0.6).fontSize(10.5).fillColor(`#${NAVY}`);
    writePdfText(document, ORIENTATION_DISCLAIMER, "bold", { lineGap: 3 });
    document.moveDown(0.8).fontSize(16).fillColor("#111827");
    writePdfText(document, content.documentTitle, "bold", { lineGap: 3 });

    if (content.teacherName) {
      writePdfBody(document, `Docente: ${content.teacherName}`);
    }
    if (content.institution) {
      writePdfBody(document, `Institución: ${content.institution}`);
    }
    writePdfBody(document, `Fecha de la orientación: ${content.answeredOn}`);

    writePdfHeading(document, "Consulta");
    writePdfBody(document, content.question);
    writePdfHeading(document, "Orientación recibida");
    writePdfBlocks(document, answerBlocks);

    if (content.caseNotes) {
      writePdfHeading(document, "Notas del caso");
      writePdfBody(document, content.caseNotes);
    }

    writePdfHeading(document, "Fuentes consultadas");
    for (const source of sources) {
      writePdfBody(document, describeOrientationSource(source));
    }

    document.moveDown(1).fontSize(9).fillColor(`#${MUTED}`);
    writePdfText(document, ORIENTATION_DISCLAIMER, "italic", {
      align: "center",
      lineGap: 2,
    });
    document.end();
  });
}
