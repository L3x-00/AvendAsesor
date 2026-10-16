/** Offline benchmark: compiled production classes, fresh process per sample.
 * Build first: npm run build --workspace=api
 * node scripts/benchmark-api-memory.mjs --output <report.json> --runs 3
 * No real keys, corpus, network services or environment files are used.
 */
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(import.meta.url);
const root = resolve(dirname(script), "..");
const require = createRequire(join(root, "apps/api/package.json"));
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
};
const dist = resolve(arg("--dist", join(root, "apps/api/dist")));
const fingerprint = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

function snapshot() {
  return {
    ...process.memoryUsage(),
    maxRssBytes: process.resourceUsage().maxRSS * 1024,
    cpuMicros: process.cpuUsage(),
  };
}

function pages() {
  return Array.from({ length: 600 }, (_, index) => ({
    pageNumber: index + 1,
    text: `Artículo ${index + 1}. Requisitos\n\n${(
      "El docente presenta su solicitud y los documentos que acreditan los requisitos. " +
      "La excepción exige verificación documental y no modifica el plazo ni el derecho. "
    ).repeat(6)}`,
  }));
}

function smallPdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R 6 0 R 8 0 R 10 0 R 12 0 R] /Count 5 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  for (let page = 1; page <= 5; page++) {
    const content = `BT /F1 18 Tf 48 760 Td (Articulo ${page}. Requisitos del docente) Tj ET`;
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
    );
    objects.push(
      `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    );
  }
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}

async function worker(scenario) {
  const started = performance.now();
  const peaks = { rss: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
  const sample = () => {
    const memory = process.memoryUsage();
    for (const key of Object.keys(peaks))
      peaks[key] = Math.max(peaks[key], memory[key]);
  };
  const timer = setInterval(sample, 10);
  const { NestFactory } = require("@nestjs/core");
  const { AppModule } = require(join(dist, "app.module.js"));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  sample();
  global.gc();
  const boot = snapshot();
  const bootMs = performance.now() - started;
  const operationStart = performance.now();
  let result = {};
  try {
    const { ChunkingService } = require(
      join(dist, "ingestion/chunking.service.js"),
    );
    const chunking = app.get(ChunkingService);
    if (scenario === "chunk") {
      let chunks = chunking.chunk(pages());
      result = { chunks: chunks.length, outputHash: fingerprint(chunks) };
      sample();
      chunks = null;
    } else if (scenario === "pdf" || scenario === "ocr") {
      const { PdfExtractionService } = require(
        join(dist, "ingestion/pdf-extraction.service.js"),
      );
      const service = app.get(PdfExtractionService);
      const file = smallPdf();
      const originalHash = fingerprint([...file]);
      const extracted = await service.extract(file);
      const requestedPages = scenario === "ocr" ? [1] : [1, 2, 3, 4, 5];
      const rendered = await service.render(file, requestedPages);
      assert.equal(extracted.length, 5);
      assert.equal(rendered.size, requestedPages.length);
      assert.equal(fingerprint([...file]), originalHash);
      result = {
        pages: extracted.length,
        outputHash: fingerprint({
          extracted,
          images: [...rendered].map(([page, bytes]) => [
            page,
            createHash("sha256").update(bytes).digest("hex"),
          ]),
        }),
      };
      if (scenario === "ocr") {
        const { OcrService } = require(join(dist, "ingestion/ocr.service.js"));
        const text = await app
          .get(OcrService)
          .withWorker((recognize) => recognize(rendered.get(1)));
        assert.ok(text.includes("Requisitos"));
        result = {
          pages: 1,
          outputHash: fingerprint({ pdf: result.outputHash, text }),
        };
      }
    } else if (scenario === "ingest") {
      const { IngestionService } = require(
        join(dist, "ingestion/ingestion.service.js"),
      );
      const { PdfExtractionService } = require(
        join(dist, "ingestion/pdf-extraction.service.js"),
      );
      const { DocxExtractionService } = require(
        join(dist, "ingestion/docx-extraction.service.js"),
      );
      const { OcrService } = require(join(dist, "ingestion/ocr.service.js"));
      const { OpenAiEmbeddingsGateway } = require(
        join(dist, "ingestion/openai-embeddings.gateway.js"),
      );
      const config = {
        get: (key) =>
          ({
            OPENAI_API_KEY: "offline-benchmark-key",
            AI_GATEWAY_BASE_URL: arg("--provider"),
            RAG_EMBEDDING_MODEL: "text-embedding-3-small",
            RAG_INGESTION_LEASE_SECONDS: 300,
          })[key],
      };
      const job = {
        jobId: "offline-job",
        documentId: "offline-document",
        documentVersionId: "offline-version",
      };
      const output = createHash("sha256");
      let inserted = 0;
      let completions = 0;
      let failure;
      const gateway = {
        claimNext: async () => job,
        downloadPdf: async () =>
          Buffer.from(
            pages()
              .map((page) => page.text)
              .join("\n\n"),
          ),
        clearChunks: async () => undefined,
        refreshLease: async () => undefined,
        insertChunks: async (chunks) => {
          output.update(JSON.stringify(chunks));
          inserted += chunks.length;
          sample();
        },
        complete: async () => {
          completions++;
        },
        fail: async (_job, code, message) => {
          failure = `${code}: ${message}`;
        },
      };
      const service = new IngestionService(
        gateway,
        new OpenAiEmbeddingsGateway(config),
        app.get(PdfExtractionService),
        app.get(DocxExtractionService),
        app.get(OcrService),
        chunking,
        config,
      );
      assert.equal(await service.processNext(), true, failure);
      assert.equal(completions, 1);
      assert.ok(inserted > 0);
      result = { chunks: inserted, outputHash: output.digest("hex") };
    }
    sample();
    const elapsedMs = performance.now() - operationStart;
    const beforeGc = snapshot();
    global.gc();
    const retained = snapshot();
    const heavyLoaded = Object.keys(require.cache).filter((path) =>
      /[\\/](?:js-tiktoken|pdf-parse|mammoth|tesseract.js)[\\/]/u.test(path),
    );
    process.send({
      scenario,
      bootMs,
      elapsedMs,
      boot,
      beforeGc,
      retained,
      peaks,
      heavyModuleCount: heavyLoaded.length,
      ...result,
    });
  } finally {
    clearInterval(timer);
    await app.close();
    process.disconnect();
  }
}

async function main() {
  const runs = Number(arg("--runs", "3"));
  assert.ok(Number.isInteger(runs) && runs > 0 && runs <= 20);
  const providerRequests = [];
  const provider = createServer(async (request, response) => {
    try {
      assert.equal(request.url, "/embeddings");
      let body = "";
      for await (const buffer of request) body += buffer;
      const { input, dimensions, model, encoding_format } = JSON.parse(body);
      assert.equal(dimensions, 1536);
      assert.equal(model, "text-embedding-3-small");
      providerRequests.push(input.length);
      const data = input.map((text, index) => {
        const values = Float32Array.from(
          { length: 1536 },
          (_, component) => ((text.length % 997) + component + 1) / 3000,
        );
        return {
          index,
          embedding:
            encoding_format === "base64"
              ? Buffer.from(values.buffer).toString("base64")
              : [...values],
        };
      });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ data }));
    } catch {
      response.writeHead(500).end();
    }
  });
  await new Promise((resolve) => provider.listen(0, "127.0.0.1", resolve));
  const providerUrl = `http://127.0.0.1:${provider.address().port}`;
  const cwd = await mkdtemp(join(tmpdir(), "avend-offline-benchmark-"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) =>
      /^(?:PATH|SYSTEMROOT|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA)$/iu.test(
        key,
      ),
    ),
  );
  Object.assign(env, {
    NODE_ENV: "test",
    RAG_INGESTION_WORKER_ENABLED: "false",
  });
  const results = [];
  try {
    const scenarios = arg("--scenarios", "boot,chunk,ingest").split(",");
    assert.ok(
      scenarios.every((scenario) =>
        ["boot", "chunk", "ingest", "pdf", "ocr"].includes(scenario),
      ),
    );
    for (const scenario of scenarios) {
      for (let run = 1; run <= runs; run++) {
        providerRequests.length = 0;
        const result = await new Promise((resolve, reject) => {
          const child = fork(
            script,
            ["--worker", scenario, "--provider", providerUrl, "--dist", dist],
            {
              cwd,
              env,
              execArgv: ["--expose-gc", "--max-old-space-size=384"],
              stdio: ["ignore", "ignore", "pipe", "ipc"],
              windowsHide: true,
            },
          );
          let message;
          let errors = "";
          child.stderr.on("data", (buffer) => {
            errors += buffer.toString();
          });
          child.on("message", (value) => {
            message = value;
          });
          child.on("error", reject);
          child.on("exit", (code) =>
            code === 0 && message
              ? resolve(message)
              : reject(new Error(errors || `Exit ${code}`)),
          );
        });
        results.push({
          run,
          ...result,
          embeddingBatchSizes: [...providerRequests],
        });
        console.log(
          JSON.stringify({
            run,
            scenario,
            bootRssMiB: result.boot.rss / 1048576,
            peakRssMiB: result.beforeGc.maxRssBytes / 1048576,
            elapsedMs: result.elapsedMs,
            chunks: result.chunks,
            outputHash: result.outputHash,
          }),
        );
      }
    }
    const compiledHashes = {};
    for (const file of [
      "ingestion/chunking.service.js",
      "ingestion/ingestion.service.js",
      "ingestion/openai-embeddings.gateway.js",
      "ingestion/ocr.service.js",
      "ingestion/pdf-extraction.service.js",
      "documents/pdf-inspection.service.js",
    ]) {
      compiledHashes[file] = createHash("sha256")
        .update(await readFile(join(dist, file)))
        .digest("hex");
    }
    const report = {
      recordedAt: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      node: process.version,
      heapLimitMiB: 384,
      runs,
      compiledHashes,
      results,
    };
    const output = arg("--output");
    if (output)
      await writeFile(resolve(output), JSON.stringify(report, null, 2) + "\n");
  } finally {
    await new Promise((resolve) => provider.close(resolve));
    // Tesseract may write its local language cache in this task-owned temp dir.
    await unlink(join(cwd, "spa.traineddata")).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    await rmdir(cwd);
  }
}

if (arg("--worker")) await worker(arg("--worker"));
else await main();
