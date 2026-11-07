// Run after building the API. All files are synthetic and persistence is isolated.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, rmdirSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

const require = createRequire(import.meta.url);
const { Logger } = require("@nestjs/common");
const { createCanvas } = createRequire(require.resolve("pdf-parse"))(
  "@napi-rs/canvas",
);
const {
  IngestionService,
} = require("../apps/api/dist/ingestion/ingestion.service.js");
const {
  PdfExtractionService,
} = require("../apps/api/dist/ingestion/pdf-extraction.service.js");
const { OcrService } = require("../apps/api/dist/ingestion/ocr.service.js");
const {
  ChunkingService,
} = require("../apps/api/dist/ingestion/chunking.service.js");
const {
  MineruMarkdownService,
} = require("../apps/api/dist/ingestion/mineru-markdown.service.js");
Logger.overrideLogger(false);

function syntheticPdf(total, scanned, blank = null) {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const kids = [];
  const stream = (metadata, bytes) =>
    Buffer.concat([
      Buffer.from(`<< ${metadata} /Length ${bytes.length} >>\nstream\n`),
      bytes,
      Buffer.from("\nendstream"),
    ]);
  for (let page = 1; page <= total; page++) {
    const title = `Articulo ${page}. Requisitos del docente`;
    const body = "La solicitud se presenta con los documentos de respaldo.";
    let resources = "/Font << /F1 3 0 R >>";
    let content = `BT /F1 16 Tf 36 740 Td (${title}) Tj 0 -30 Td (${body}) Tj ET`;
    if (scanned.has(page)) {
      const canvas = createCanvas(850, 330);
      const context = canvas.getContext("2d");
      context.fillStyle = "white";
      context.fillRect(0, 0, 850, 330);
      context.fillStyle = "black";
      context.font = "28px Arial";
      if (page !== blank) {
        context.fillText(title, 40, 80);
        context.fillText(body, 40, 135);
      }
      objects.push(
        stream(
          "/Type /XObject /Subtype /Image /Width 850 /Height 330 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode",
          canvas.toBuffer("image/jpeg"),
        ),
      );
      resources = `/XObject << /Scan ${objects.length} 0 R >>`;
      content = "q 565 0 0 220 15 550 cm /Scan Do Q";
    }
    kids.push(`${objects.length + 1} 0 R`);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << ${resources} >> /Contents ${objects.length + 2} 0 R >>`,
    );
    objects.push(stream("", Buffer.from(content)));
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${total} >>`;
  const parts = [Buffer.from("%PDF-1.4\n")];
  const offsets = [];
  let position = parts[0].length;
  objects.forEach((object, i) => {
    offsets.push(position);
    const bytes = Buffer.concat([
      Buffer.from(`${i + 1} 0 obj\n`),
      Buffer.from(object),
      Buffer.from("\nendobj\n"),
    ]);
    parts.push(bytes);
    position += bytes.length;
  });
  parts.push(
    Buffer.from(
      `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${position}\n%%EOF\n`,
    ),
  );
  return Buffer.concat(parts);
}

async function verify(
  name,
  total,
  scanned,
  { blank = null, expected = null, sidecar = null } = {},
) {
  const file = syntheticPdf(total, new Set(scanned), blank);
  const pdf = new PdfExtractionService();
  const render = pdf.render.bind(pdf);
  const rendered = [];
  pdf.render = (buffer, batch) => {
    assert.ok(batch.length <= 5);
    rendered.push(...batch);
    return render(buffer, batch);
  };
  const chunks = [];
  const job = {
    jobId: name,
    documentId: "isolated",
    documentVersionId: "new-version",
    storageBucket: "isolated",
    storagePath: "fixture.pdf",
    pageCount: null,
  };
  let completed = null;
  let failed = null;
  let cleared = false;
  const service = new IngestionService(
    {
      claimNext: async () => job,
      downloadPdf: async () => file,
      downloadOptionalObject: async () => sidecar && Buffer.from(sidecar),
      clearChunks: async () => {
        cleared = true;
      },
      insertChunks: async (batch) => chunks.push(...batch),
      refreshLease: async () => {},
      complete: async (_, count) => {
        completed = count;
      },
      fail: async (_, code, message, retryable) => {
        failed = { code, message, retryable };
      },
    },
    { embed: async (texts) => texts.map(() => Array(1536).fill(0.01)) },
    pdf,
    {},
    new OcrService(),
    new ChunkingService(),
    new MineruMarkdownService(),
    { get: () => undefined },
  );
  const started = performance.now();
  const cpu = process.cpuUsage();
  let peakRss = process.memoryUsage.rss();
  const timer = setInterval(() => {
    peakRss = Math.max(peakRss, process.memoryUsage.rss());
  }, 20);
  try {
    assert.equal(await service.processNext(), expected === null);
  } finally {
    clearInterval(timer);
  }
  if (expected) {
    assert.equal(failed?.code, "INGESTION_PDF_INCOMPLETE");
    assert.equal(failed?.message, expected);
    assert.equal(cleared, false);
    assert.equal(chunks.length, 0);
    assert.equal(completed, null);
  } else {
    assert.equal(completed, total);
    assert.deepEqual(rendered, sidecar ? [] : scanned);
    for (const page of sidecar ? [] : scanned) {
      assert.ok(
        chunks.some(
          (chunk) =>
            chunk.pageStart <= page &&
            chunk.pageEnd >= page &&
            chunk.articleReference?.includes(String(page)),
        ),
        `Missing article from page ${page}`,
      );
    }
    if (sidecar)
      assert.ok(
        chunks.some(
          (chunk) =>
            chunk.pageEnd === total &&
            chunk.chunkContent.includes("| Requisito | Documento |"),
        ),
      );
  }
  const used = process.cpuUsage(cpu);
  console.log(
    JSON.stringify({
      name,
      completed,
      failed,
      rendered,
      chunks: chunks.length,
      ms: Math.round(performance.now() - started),
      cpuMs: Math.round((used.user + used.system) / 1000),
      peakRssMiB: Math.round(peakRss / 1048576),
    }),
  );
}

const cwd = process.cwd();
const scratch = mkdtempSync(join(tmpdir(), "avend-a05-"));
process.chdir(scratch);
try {
  await verify("textual", 2, []);
  await verify("scanned", 3, [1, 2, 3]);
  await verify(
    "over-budget",
    45,
    Array.from({ length: 45 }, (_, i) => i + 1),
    { expected: "OCR_PAGE_BUDGET_EXCEEDED: 45/40" },
  );
  await verify("mixed", 45, [2, 41, 45]);
  await verify("blank-intermediate", 3, [1, 2, 3], {
    blank: 2,
    expected: "OCR_PAGE_WITHOUT_TEXT: 2",
  });
  await verify(
    "sidecar-shorter-than-pdf",
    45,
    Array.from({ length: 45 }, (_, i) => i + 1),
    {
      sidecar: Array.from(
        { length: 44 },
        (_, i) => `<!-- page ${i + 1} of 44 -->\nArticulo ${i + 1}.`,
      ).join("\n"),
      expected: "OCR_PAGE_BUDGET_EXCEEDED: 45/40",
    },
  );

  await verify(
    "complete-sidecar",
    45,
    Array.from({ length: 45 }, (_, i) => i + 1),
    {
      sidecar: Array.from(
        { length: 45 },
        (_, i) =>
          `<!-- page ${i + 1} of 45 -->\nArticulo ${i + 1}. Requisitos\n\n| Requisito | Documento |\n| --- | --- |\n| Presentacion | Solicitud |`,
      ).join("\n"),
    },
  );
} finally {
  process.chdir(cwd);
  rmSync(join(scratch, "spa.traineddata"), { force: true });
  rmdirSync(scratch);
}
