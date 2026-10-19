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
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  STRUCTURED_SALARY_MARKER,
  structuredSalaryRowsToMarkdown,
} from "@/components/chat/chat-response-tables";
import * as fontkit from "fontkit";
import PDFDocument from "pdfkit";
import {
  describeOrientationSource,
  ORIENTATION_DISCLAIMER,
  sanitizeDocumentText,
  type OrientationDocumentContent,
} from "./model";

const NAVY = "0D1B3D";
const ACCENT = "1677FF";
const MUTED = "667085";
const CITATION_TOKEN = /\[\[?\s*\d+(?:\s*(?:[,;–-]|y)\s*\d+)*\s*\]\]?/gu;
const SIMPLE_CITATION = /^\[\[?\s*(\d+)\s*\]\]?$/u;

type OrientationSource = OrientationDocumentContent["sources"][number];

function documentKey(source: OrientationSource): string {
  return source.documentVersionId ?? source.id;
}

function singleCitedDocumentSource(
  text: string,
  sources: readonly OrientationSource[],
): OrientationSource | undefined {
  const tokens = [...text.matchAll(CITATION_TOKEN)].map((match) => match[0]);
  if (!tokens.length) return undefined;

  const ranks = tokens.map((token) => {
    const match = SIMPLE_CITATION.exec(token);
    return match ? Number(match[1]) : null;
  });
  if (ranks.some((rank) => rank === null)) return undefined;

  const cited = ranks.map((rank) =>
    sources.find((source) => source.rank === rank),
  );
  const first = cited[0];
  return first &&
    cited.every(
      (source) =>
        source !== undefined && documentKey(source) === documentKey(first),
    )
    ? first
    : undefined;
}

function prepareExportEvidence(
  text: string,
  sources: readonly OrientationSource[],
): { answer: string; sources: OrientationSource[] } {
  if (!singleCitedDocumentSource(text, sources)) {
    return { answer: text, sources: [...sources] };
  }

  return {
    answer: text
      .replace(CITATION_TOKEN, "")
      .replace(/[ \t]+([.,;:])/gu, "$1")
      .replace(/[ \t]{2,}/gu, " ")
      .replace(/^\s*(?:fuentes?|referencias?)\s*:\s*$/gimu, "")
      .replace(/\n{3,}/gu, "\n\n")
      .trim(),
    sources: uniqueDocumentSources(sources),
  };
}

function uniqueDocumentSources(
  sources: readonly OrientationSource[],
): OrientationSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = documentKey(source);
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
  | { kind: "table"; headers: string[]; rows: string[][] };

const TABLE_SEPARATOR_CELL = /^:?-{3,}:?$/u;
const MAX_TABLE_COLUMNS = 6;
const MAX_TABLE_ROWS = 12;

function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return null;
  const cells = trimmed
    .replace(/^\|/u, "")
    .replace(/\|$/u, "")
    .split("|")
    .map((cell) => cell.trim());
  if (
    cells.length < 2 ||
    cells.length > MAX_TABLE_COLUMNS ||
    cells.some((cell) => cell.length === 0)
  ) {
    return null;
  }
  return cells;
}

/**
 * Separa párrafos y tablas Markdown del texto de la respuesta. La ficha debe
 * reproducir la escala salarial como grilla, no como una línea de barras.
 */
function parseOrientationBlocks(text: string): OrientationBlock[] {
  const lines = structuredSalaryRowsToMarkdown(
    sanitizeDocumentText(text),
  ).split("\n");
  const blocks: OrientationBlock[] = [];
  let paragraph: string[] = [];

  const flushParagraph = () => {
    const value = paragraph.join("\n").trim();
    if (value) blocks.push({ kind: "paragraph", text: value });
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index]?.trim() === STRUCTURED_SALARY_MARKER) continue;
    const headers = tableCells(lines[index] ?? "");
    const separator = tableCells(lines[index + 1] ?? "");
    if (
      !headers ||
      !separator ||
      separator.length !== headers.length ||
      !separator.every((cell) => TABLE_SEPARATOR_CELL.test(cell))
    ) {
      paragraph.push(lines[index] ?? "");
      continue;
    }

    const rows: string[][] = [];
    let cursor = index + 2;
    while (cursor < lines.length) {
      const row = tableCells(lines[cursor] ?? "");
      if (!row || row.length !== headers.length) break;
      if (rows.length === MAX_TABLE_ROWS) break;
      rows.push(row);
      cursor += 1;
    }
    if (!rows.length) {
      paragraph.push(lines[index] ?? "");
      continue;
    }

    flushParagraph();
    blocks.push({ kind: "table", headers, rows });
    index = cursor - 1;
  }
  flushParagraph();
  return blocks;
}

function wordTable(block: Extract<OrientationBlock, { kind: "table" }>): Table {
  const cell = (value: string, header = false) =>
    new TableCell({
      children: [
        new Paragraph({
          children: [
            new TextRun({
              bold: header,
              size: 18,
              text: sanitizeDocumentText(value),
            }),
          ],
          spacing: { after: 0 },
        }),
      ],
      margins: { bottom: 60, left: 80, right: 80, top: 60 },
      shading: header ? { fill: "E8F1FF" } : undefined,
    });

  return new Table({
    rows: [
      new TableRow({
        children: block.headers.map((header) => cell(header, true)),
        tableHeader: true,
      }),
      ...block.rows.map(
        (row) =>
          new TableRow({
            children: row.map((value) => cell(value)),
          }),
      ),
    ],
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

function wordContentBlocks(text: string): Array<Paragraph | Table> {
  return parseOrientationBlocks(text).flatMap((block) =>
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
  const { answer, sources } = prepareExportEvidence(
    content.answer,
    content.sources,
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
            margin: { bottom: 1_134, left: 1_134, right: 1_134, top: 1_134 },
            size: {
              height: 16_838,
              orientation: PageOrientation.PORTRAIT,
              width: 11_906,
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
          ...wordContentBlocks(answer),
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

function writePdfTable(
  document: PDFKit.PDFDocument,
  block: Extract<OrientationBlock, { kind: "table" }>,
): void {
  const fontSize = 8.5;
  const padding = 4;
  const left = document.page.margins.left;
  const bottom = document.page.height - document.page.margins.bottom;
  const availableWidth =
    document.page.width -
    document.page.margins.left -
    document.page.margins.right;
  const columnWidth = availableWidth / block.headers.length;

  const rowHeight = (cells: string[]): number => {
    document.font(PDF_FONT_NAMES.latin.regular).fontSize(fontSize);
    return (
      Math.min(
        90,
        Math.max(
          ...cells.map((cell) =>
            document.heightOfString(sanitizeDocumentText(cell), {
              lineGap: 1,
              width: columnWidth - padding * 2,
            }),
          ),
        ),
      ) +
      padding * 2
    );
  };

  const drawRow = (cells: string[], header: boolean): void => {
    const height = rowHeight(cells);
    if (document.y + height > bottom) {
      document.addPage();
      document.y = document.page.margins.top;
    }
    let x = left;
    const y = document.y;
    for (const [index, cell] of cells.entries()) {
      document
        .rect(x, y, columnWidth, height)
        .fillAndStroke(header ? "#E8F1FF" : "#FFFFFF", "#B8C4D9");
      document
        .font(header ? PDF_FONT_NAMES.latin.bold : PDF_FONT_NAMES.latin.regular)
        .fontSize(fontSize)
        .fillColor("#111827")
        .text(sanitizeDocumentText(cell), x + padding, y + padding, {
          ellipsis: true,
          height: height - padding * 2,
          lineGap: 1,
          width: columnWidth - padding * 2,
        });
      x += columnWidth;
      if (index === cells.length - 1) break;
    }
    document.y = y + height;
  };

  document.moveDown(0.25);
  drawRow(block.headers, true);
  for (const row of block.rows) drawRow(row, false);
  document.moveDown(0.6);
}

function writePdfMarkdownContent(
  document: PDFKit.PDFDocument,
  text: string,
): void {
  for (const block of parseOrientationBlocks(text)) {
    if (block.kind === "table") writePdfTable(document, block);
    else writePdfBody(document, block.text);
  }
}

export function buildOrientationPdf(
  content: OrientationDocumentContent,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const { answer, sources } = prepareExportEvidence(
      content.answer,
      content.sources,
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
    writePdfMarkdownContent(document, answer);

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
