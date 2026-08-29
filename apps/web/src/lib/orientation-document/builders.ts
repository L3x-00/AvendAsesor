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
  TextRun,
} from "docx";
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

const PDF_FONT_NAMES: Record<
  PdfFontFamily,
  Record<PdfFontStyle, string>
> = {
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

function resolvePdfCharacter(
  character: string,
): { character: string; family: PdfFontFamily } {
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
  return sanitizeDocumentText(text).split("\n").map(
    (line) =>
      new Paragraph({
        children: [new TextRun(line || " ")],
        spacing: { after: 120, line: 330 },
      }),
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
              new TextRun({ bold: true, color: ACCENT, size: 22, text: "AVEND ASESOR" }),
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
            children: [new TextRun({ bold: true, color: NAVY, text: "Consulta" })],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 260, after: 100 },
          }),
          ...wordTextParagraphs(content.question),
          new Paragraph({
            children: [
              new TextRun({ bold: true, color: NAVY, text: "Orientación recibida" }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 260, after: 100 },
          }),
          ...wordTextParagraphs(content.answer),
          ...(content.caseNotes
            ? [
                new Paragraph({
                  children: [
                    new TextRun({ bold: true, color: NAVY, text: "Notas del caso" }),
                  ],
                  heading: HeadingLevel.HEADING_1,
                  spacing: { before: 260, after: 100 },
                }),
                ...wordTextParagraphs(content.caseNotes),
              ]
            : []),
          new Paragraph({
            children: [
              new TextRun({ bold: true, color: NAVY, text: "Fuentes consultadas" }),
            ],
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 260, after: 100 },
          }),
          ...content.sources.map(
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

export function buildOrientationPdf(
  content: OrientationDocumentContent,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
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
    writePdfBody(document, content.answer);

    if (content.caseNotes) {
      writePdfHeading(document, "Notas del caso");
      writePdfBody(document, content.caseNotes);
    }

    writePdfHeading(document, "Fuentes consultadas");
    for (const source of content.sources) {
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
