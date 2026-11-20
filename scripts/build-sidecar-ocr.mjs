#!/usr/bin/env node
// Genera un sidecar MinerU-compatible (texto + tablas) para un PDF escaneado.
// Todo el trabajo ocurre en local: Render solo consume el sidecar resultante.
//
// Uso:
//   node .ai-shared/scripts/build-mineru-sidecar.mjs \
//     --pdf "ruta/al/documento.pdf" --out "ruta/al/documento.pdf.mineru.md"
//
// El sidecar lleva el SHA-256 del PDF (TD-008) y un marcador por página. Así la
// ingesta puede usarlo sin OCR dentro del API y sin consumir el presupuesto de
// 40 páginas ni la memoria de Render Free.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createWorker } from 'tesseract.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--pdf') args.pdf = argv[i + 1];
    if (argv[i] === '--out') args.out = argv[i + 1];
    if (argv[i] === '--dpi') args.dpi = Number(argv[i + 1]);
  }
  if (!args.pdf || !args.out) {
    throw new Error('Uso: --pdf <archivo.pdf> --out <archivo.pdf.mineru.md>');
  }
  args.dpi = Number.isFinite(args.dpi) && args.dpi > 0 ? args.dpi : 160;
  return args;
}

/** Convierte filas alineadas por OCR en tabla Markdown sin inventar celdas. */
function tableLines(text) {
  const out = [];
  let inTable = false;
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    if (!line) {
      inTable = false;
      out.push('');
      continue;
    }
    const cells = line.split(/\s{2,}/u).filter(Boolean);
    if (cells.length >= 3 && cells.every((cell) => cell.length <= 80)) {
      out.push(`| ${cells.join(' | ')} |`);
      if (!inTable) {
        out.push(`| ${cells.map(() => '---').join(' | ')} |`);
        inTable = true;
      }
    } else {
      inTable = false;
      out.push(line);
    }
  }
  return out.join('\n');
}

async function main() {
  const { pdf, out, dpi } = parseArgs(process.argv.slice(2));
  const pdfPath = resolve(pdf);
  const pdfHash = createHash('sha256')
    .update(readFileSync(pdfPath))
    .digest('hex');

  const tmp = mkdtempSync(join(tmpdir(), 'avend-sidecar-'));
  const originalCwd = process.cwd();
  let worker;
  try {
    const rendered = execFileSync(
      'python',
      [join(here, 'render-pdf-pages.py'), pdfPath, tmp, String(dpi)],
      { encoding: 'utf8' },
    ).trim();
    // Python puede escribir avisos (p. ej. deprecación de fitz) en stdout;
    // el renderizador siempre termina con el número de páginas.
    const total = Number(rendered.split(/\r?\n/u).at(-1));
    if (!Number.isInteger(total) || total < 1) {
      throw new Error(`No se pudieron renderizar las páginas: ${rendered}`);
    }

    const langPath = join(
      root,
      'node_modules',
      '@tesseract.js-data',
      'spa',
      '4.0.0',
    );
    // tesseract.js descomprime el modelo en el directorio de trabajo: se hace
    // dentro del temporal para no dejar `spa.traineddata` en el repositorio.
    process.chdir(tmp);
    worker = await createWorker('spa', 1, { langPath });

    const parts = [`<!-- avend-pdf-sha256: ${pdfHash} -->`];
    for (let page = 1; page <= total; page += 1) {
      const image = join(tmp, `page-${String(page).padStart(4, '0')}.png`);
      const { data } = await worker.recognize(image);
      const text = tableLines(data.text ?? '').trim();
      if (!text) {
        throw new Error(
          `La página ${page} no produjo texto; no se publica un sidecar incompleto.`,
        );
      }
      parts.push(`<!-- page ${page} of ${total} -->`, text);
      process.stdout.write(`OCR página ${page}/${total}\r`);
    }
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), `${parts.join('\n\n')}\n`, 'utf8');
    console.log(`\nSidecar: ${resolve(out)} (SHA-256 del PDF: ${pdfHash})`);
  } finally {
    if (worker) await worker.terminate();
    process.chdir(originalCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
