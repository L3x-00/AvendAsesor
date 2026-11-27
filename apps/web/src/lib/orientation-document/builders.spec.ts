// @vitest-environment node
// buildOrientationPdf embeds real fonts through pdfkit + fontkit, which need
// Node's native module resolution; the default jsdom environment resolves a
// browser fontkit build that cannot decode the WOFF faces.
import { inflateRawSync } from "node:zlib";
import { PDFParse } from "pdf-parse";
import { SaxesParser } from "saxes";
import { describe, expect, it } from "vitest";
import type { OrientationDocumentContent } from "./model";
import { buildOrientationDocx, buildOrientationPdf } from "./builders";

const content: OrientationDocumentContent = {
  answer: "La solicitud se presenta por mesa de partes. [1]",
  answeredAt: "2026-08-24T12:01:00.000Z",
  answeredOn: "24 de agosto de 2026",
  caseNotes: "Conservar el cargo de recepción.",
  conversationId: "4c8b56af-6d0c-4fef-881e-7c00907540dd",
  conversationTitle: "Licencia docente",
  documentTitle: "Caso de orientación docente",
  institution: "IE José María Arguedas",
  messageId: "6c8b56af-6d0c-4fef-881e-7c00907540dd",
  question: "¿Cómo presento mi solicitud?",
  sources: [
    {
      articleReference: "Artículo 5",
      documentSituation: "current",
      documentTitle: "Ley de Reforma Magisterial",
      id: "9c8b56af-6d0c-4fef-881e-7c00907540dd",
      moduleName: "Licencias",
      numeralReference: "5.1",
      pageEnd: 33,
      pageStart: 33,
      rank: 1,
      relevanceScore: 0.92,
      sectionTitle: "Licencias por salud",
      versionNumber: 2,
    },
  ],
  teacherName: "María Pérez",
};

function readZipEntry(archive: Buffer, wantedName: string): string {
  const endSignature = Buffer.from([0x50, 0x4b, 0x05, 0x06]);
  const endOffset = archive.lastIndexOf(endSignature);
  if (endOffset < 0) throw new Error("ZIP end record was not found.");

  const entryCount = archive.readUInt16LE(endOffset + 10);
  let centralOffset = archive.readUInt32LE(endOffset + 16);

  for (let index = 0; index < entryCount; index += 1) {
    if (archive.readUInt32LE(centralOffset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory.");
    }

    const compression = archive.readUInt16LE(centralOffset + 10);
    const compressedSize = archive.readUInt32LE(centralOffset + 20);
    const nameLength = archive.readUInt16LE(centralOffset + 28);
    const extraLength = archive.readUInt16LE(centralOffset + 30);
    const commentLength = archive.readUInt16LE(centralOffset + 32);
    const localOffset = archive.readUInt32LE(centralOffset + 42);
    const name = archive
      .subarray(centralOffset + 46, centralOffset + 46 + nameLength)
      .toString("utf8");

    if (name === wantedName) {
      const localNameLength = archive.readUInt16LE(localOffset + 26);
      const localExtraLength = archive.readUInt16LE(localOffset + 28);
      const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
      const compressed = archive.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );
      const uncompressed =
        compression === 8 ? inflateRawSync(compressed) : compressed;
      return uncompressed.toString("utf8");
    }

    centralOffset += 46 + nameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry ${wantedName} was not found.`);
}

describe("orientation binary builders", () => {
  it("creates a non-empty OOXML DOCX package with the expected ZIP signature", async () => {
    const binary = await buildOrientationDocx(content);
    const documentXml = readZipEntry(binary, "word/document.xml");

    expect(binary.byteLength).toBeGreaterThan(2_000);
    expect([...binary.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(documentXml).toContain("FICHA DE ORIENTACIÓN AVEND");
    expect(documentXml).toContain("María Pérez");
    expect(documentXml).toContain(
      "La solicitud se presenta por mesa de partes.",
    );
    expect(() => new SaxesParser().write(documentXml).close()).not.toThrow();
  });

  it("removes XML-invalid controls from every dynamic DOCX field", async () => {
    const binary = await buildOrientationDocx({
      ...content,
      answer: "Respuesta\u0001\u000b válida\ufffe\uffff. [1]",
      documentTitle: "Caso\u0001 válido",
      question: "Pregunta\u000b válida",
      sources: [
        {
          ...content.sources[0]!,
          documentTitle: "Norma\ufffe oficial",
          sectionTitle: "Sección\uffff aplicable",
        },
      ],
    });
    const documentXml = readZipEntry(binary, "word/document.xml");

    expect(documentXml).not.toMatch(/[\u0001\u000b\ufffe\uffff]/u);
    expect(documentXml).toContain("Respuesta válida");
    expect(documentXml).toContain("Norma oficial");
    expect(() => new SaxesParser().write(documentXml).close()).not.toThrow();
  });

  it("renders a Markdown salary table as a real DOCX table", async () => {
    // La cita del párrafo es la que habilita la regla de tabla salarial nativa
    // de la vista previa (`isNativeSalaryTable` con fuente única comprobada);
    // sin ella, pantalla y archivo muestran las filas como texto.
    const binary = await buildOrientationDocx({
      ...content,
      answer: [
        "La escala es: [1]",
        "",
        "| Modalidad | Nivel | Jornada | Remuneración |",
        "| --- | --- | --- | --- |",
        "| EBR | Inicial | 30 | S/ 3,300.60 |",
        "| EBR | Primaria | 30 | S/ 3,300.60 |",
      ].join("\n"),
    });
    const documentXml = readZipEntry(binary, "word/document.xml");

    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("Modalidad");
    expect(documentXml).toContain("S/ 3,300.60");
    expect(documentXml).not.toContain("| --- |");
    expect(() => new SaxesParser().write(documentXml).close()).not.toThrow();
  });

  it("keeps the salary grid when the citation column is dropped for a single source", async () => {
    // Forma real de la respuesta: la cita vive en la última columna de cada
    // fila y, al consolidarse la fuente única, esa columna desaparece. Antes la
    // tabla se rechazaba por sus celdas vacías y el DOCX imprimía las barras.
    const binary = await buildOrientationDocx({
      ...content,
      answer: [
        "La remuneración mensual es S/ 3 500,70. [1]",
        "",
        "| Modalidad / Forma | Nivel / Ciclo | Jornada laboral | Remuneración mensual | Cita |",
        "| --- | --- | --- | --- | --- |",
        "| EBR | Inicial | 30 horas | S/ 3 500,70 | [1] |",
        "| EBR | Primaria | 30 horas | S/ 3 500,70 | [1] |",
        "| EBE | Inicial | 30 horas | S/ 3 500,70 | [1] |",
      ].join("\n"),
    });
    const documentXml = readZipEntry(binary, "word/document.xml");

    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("Primaria");
    expect(documentXml).not.toContain("| ---");
    expect(documentXml).not.toContain('<w:t xml:space="preserve">Cita</w:t>');
    expect(documentXml.match(/\[1\]/gu)).toHaveLength(1);
  });

  it("keeps the citation column when the answer cites two documents", async () => {
    const binary = await buildOrientationDocx({
      ...content,
      answer: [
        "La escala vigente y la anterior se comparan. [1][2]",
        "",
        "| Modalidad | Nivel | Remuneración | Cita |",
        "| --- | --- | --- | --- |",
        "| EBR | Inicial | S/ 3 500,70 | [1] |",
        "| EBR | Inicial | S/ 3 300,60 | [2] |",
      ].join("\n"),
      sources: [
        { ...content.sources[0]!, documentVersionId: "version-1" },
        {
          ...content.sources[0]!,
          documentTitle: "Ley 32498 remuneraciones",
          documentVersionId: "version-2",
          id: "8c8b56af-6d0c-4fef-881e-7c00907540dd",
          rank: 2,
        },
      ],
    });
    const documentXml = readZipEntry(binary, "word/document.xml");

    // Con dos documentos la cita se queda en su columna: es la evidencia de
    // cada fila y no se consolida en una sola nota.
    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain('<w:t xml:space="preserve">Cita</w:t>');
    expect(documentXml).toContain("[1]");
    expect(documentXml).toContain("[2]");
  });

  it("reads a table without evidence row by row instead of printing pipes", async () => {
    const binary = await buildOrientationDocx({
      ...content,
      answer: [
        "| Requisito | Plazo |",
        "| --- | --- |",
        "| Título pedagógico | 15 días |",
      ].join("\n"),
    });
    const documentXml = readZipEntry(binary, "word/document.xml");

    expect(documentXml).not.toContain("<w:tbl>");
    expect(documentXml).not.toContain("|");
    expect(documentXml).toContain("Requisito: Título pedagógico");
  });

  it("repairs structured salary bullets before building the DOCX table", async () => {
    const binary = await buildOrientationDocx({
      ...content,
      answer: [
        "La escala es:",
        "",
        "- Modalidad: EBR; Nivel: Inicial; Jornada: 30; Remuneración: S/ 3,500.70",
        "- Modalidad: EBR; Nivel: Primaria; Jornada: 30; Remuneración: S/ 3,500.70",
        "",
        "La jornada menor se paga de forma proporcional. [1][2]",
      ].join("\n"),
      sources: [
        { ...content.sources[0]!, documentVersionId: "version-1" },
        {
          ...content.sources[0]!,
          documentVersionId: "version-1",
          id: "8c8b56af-6d0c-4fef-881e-7c00907540dd",
          rank: 2,
        },
      ],
    });
    const documentXml = readZipEntry(binary, "word/document.xml");

    expect(documentXml).toContain("<w:tbl>");
    expect(documentXml).toContain("Remuneración");
    expect(documentXml).not.toContain("Modalidad: EBR;");
    expect(documentXml.match(/\[1\]/gu)).toHaveLength(1);
    expect(documentXml).not.toContain("[2]");
  });

  it("preserves cited ranks when the export uses different documents", async () => {
    const binary = await buildOrientationDocx({
      ...content,
      answer:
        "Dato del primer documento. [2]\n\nDato del segundo documento. [3]",
      sources: [
        { ...content.sources[0]!, documentVersionId: "version-a" },
        {
          ...content.sources[0]!,
          documentVersionId: "version-a",
          id: "8c8b56af-6d0c-4fef-881e-7c00907540dd",
          rank: 2,
        },
        {
          ...content.sources[0]!,
          documentTitle: "Reglamento de la Ley de Reforma Magisterial",
          documentVersionId: "version-b",
          id: "7c8b56af-6d0c-4fef-881e-7c00907540dd",
          rank: 3,
        },
      ],
    });
    const documentXml = readZipEntry(binary, "word/document.xml");

    // Cada rango aparece en el cuerpo y en su entrada de «Fuentes consultadas».
    expect(documentXml.match(/\[2\]/gu)).toHaveLength(2);
    expect(documentXml.match(/\[3\]/gu)).toHaveLength(2);
  });

  it("renders a Markdown salary table as a grid in the PDF", async () => {
    const binary = await buildOrientationPdf({
      ...content,
      answer: [
        "La escala es: [1]",
        "",
        "| Modalidad | Nivel | Jornada | Remuneración | Cita |",
        "| --- | --- | --- | --- | --- |",
        "| EBR | Inicial | 30 | S/ 3,300.60 | [1] |",
        "| EBR | Primaria | 30 | S/ 3,300.60 | [1] |",
      ].join("\n"),
    });
    const parser = new PDFParse({ data: binary });
    const extracted = await parser.getText();
    await parser.destroy();

    expect(extracted.text).toContain("Modalidad");
    expect(extracted.text).toContain("Inicial");
    expect(extracted.text).toContain("3,300.60");
    expect(extracted.text).not.toContain("| ---");
    // La columna «Cita» no se imprime: la fuente única se lista al final.
    expect(extracted.text).not.toMatch(/\bCita\b/u);
    expect(extracted.text.match(/\[1\]/gu)).toHaveLength(1);
  }, 30_000);

  it("creates a parseable A4 PDF and preserves Latin Extended plus emoji", async () => {
    const binary = await buildOrientationPdf({
      ...content,
      teacherName: "Ǎngela Pérez 😀",
    });
    const latin = binary.toString("latin1");
    const parser = new PDFParse({ data: binary });
    const extracted = await parser.getText();
    await parser.destroy();

    expect(binary.byteLength).toBeGreaterThan(1_000);
    expect(latin.startsWith("%PDF-")).toBe(true);
    expect(latin).toContain("%%EOF");
    expect(extracted.text).toContain("AVEND ASESOR");
    expect(extracted.text).toContain("Ǎngela Pérez 😀");
    expect(extracted.text).toContain("Consulta");
    // Real font embedding plus PDF text extraction is heavy under v8 coverage.
  }, 30_000);

  it("keeps the table header when the grid continues on a new page", async () => {
    const longCell = "Texto extenso de referencia. ".repeat(6).trim();
    const rows = Array.from(
      { length: 12 },
      (_, index) =>
        `| Modalidad ${index + 1} | ${longCell} | 30 horas | S/ 3 500,70 | [1] |`,
    );
    const binary = await buildOrientationPdf({
      ...content,
      answer: [
        `Dato inicial. [1]`,
        "",
        "| Modalidad | Detalle | Jornada | Remuneración | Cita |",
        "| :--- | --- | ---: | ---: | :---: |",
        ...rows,
      ].join("\n"),
    });
    const parser = new PDFParse({ data: binary });
    const extracted = await parser.getText();
    await parser.destroy();

    expect(extracted.text).toContain("-- 2 of 2 --");
    // «Remuneración» solo aparece en la cabecera de la tabla: que se lea dos
    // veces demuestra que se repitió al continuar en la página siguiente.
    expect(
      extracted.text.match(/Remuneración/gu)?.length,
    ).toBeGreaterThanOrEqual(2);
  }, 30_000);

  it("prints a table with two documents and keeps each citation in its cell", async () => {
    const binary = await buildOrientationPdf({
      ...content,
      answer: [
        "La escala vigente y la anterior se comparan. [1][2]",
        "",
        "| Modalidad | Nivel | Remuneración | Cita |",
        "| --- | --- | --- | --- |",
        "| EBR | Inicial | S/ 3 500,70 | [1] |",
        "| EBR | Primaria | S/ 3 500,70 | [2] |",
      ].join("\n"),
      sources: [
        { ...content.sources[0]!, documentVersionId: "version-1" },
        {
          ...content.sources[0]!,
          documentTitle: "Ley 32498 remuneraciones",
          documentVersionId: "version-2",
          id: "8c8b56af-6d0c-4fef-881e-7c00907540dd",
          rank: 2,
        },
      ],
    });
    const parser = new PDFParse({ data: binary });
    const extracted = await parser.getText();
    await parser.destroy();

    expect(extracted.text).toContain("Cita");
    expect(extracted.text).not.toContain("| ---");
    expect(extracted.text.match(/\[1\]/gu)?.length).toBeGreaterThanOrEqual(1);
    expect(extracted.text.match(/\[2\]/gu)?.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
});
