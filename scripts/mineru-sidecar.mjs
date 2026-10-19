#!/usr/bin/env node

/**
 * Convierte un PDF a Markdown enriquecido con MinerU y, si se pide, sube el
 * resultado como sidecar privado del PDF en Supabase Storage.
 *
 * MinerU no se ejecuta dentro de la API: sus modelos no caben en el runtime de
 * Render Free. El worker de ingesta lee el sidecar si existe (`<pdf>.mineru.md`),
 * conserva las páginas físicas y las tablas, y si falta o es inválido vuelve a
 * la extracción PDF de siempre. El PDF sigue siendo la fuente canónica para las
 * citas y el visor.
 *
 * Uso local:
 *   node scripts/mineru-sidecar.mjs --file "C:\ruta\norma.pdf"
 *   node scripts/mineru-sidecar.mjs --file norma.pdf --output norma.mineru.md
 *   node scripts/mineru-sidecar.mjs --file norma.pdf --start-server
 *
 * Uso contra un proyecto Supabase (requiere Supabase CLI autenticada):
 *   node scripts/mineru-sidecar.mjs --project-ref <ref> --version <uuid> \
 *     --actor-email <correo-admin> --confirm-upload
 *
 * Sin `--confirm-upload` el modo remoto solo descarga y convierte: no escribe
 * nada en Supabase. Las claves se piden a la CLI en memoria y no se imprimen.
 */

import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createClient } from '@supabase/supabase-js';

const PAGE_MARKER = /<!--\s*page\s+\d+(?:\s+of\s+\d+)?\s*-->/giu;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_MARKDOWN_BYTES = 8 * 1024 * 1024;
const MINERU_TIMEOUT_MS = 45 * 60 * 1000;

function usage() {
  console.log(
    [
      'MinerU → Markdown con páginas y tablas para el RAG de AVEND ASESOR.',
      '',
      'Uso local:',
      '  node scripts/mineru-sidecar.mjs --file <pdf> [--output <md>] [--mineru <bin>] [--start-server]',
      '',
      'Uso remoto (sube el sidecar y reencola la ingesta):',
      '  node scripts/mineru-sidecar.mjs --project-ref <ref> --version <uuid> \\',
      '    --actor-email <correo-admin> --confirm-upload [--keep-temp]',
      '',
      'Opciones:',
      '  --file <pdf>            PDF de entrada (modo local).',
      '  --output <md>           Salida Markdown (por defecto <pdf>.mineru.md).',
      '  --project-ref <ref>     Proyecto Supabase (modo remoto).',
      '  --version <uuid>        document_version_id a enriquecer (modo remoto).',
      '  --actor-id <uuid>       Administrador solicitante (alternativa a --actor-email).',
      '  --actor-email <correo>  Administrador solicitante para el reencolado.',
      '  --mineru <bin>          Ejecutable de MinerU (default: MINERU_BIN o .mineru local).',
      '  --start-server          Inicia el servidor local de MinerU antes de convertir.',
      '  --keep-temp             Conserva el PDF y el Markdown temporales.',
      '  --confirm-upload        Autoriza la escritura del sidecar en Supabase.',
      '  --help                  Muestra esta ayuda.',
    ].join('\n'),
  );
}

function fail(message) {
  throw new Error(`[mineru-sidecar] ${message}`);
}

function optionValue(name) {
  const prefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function defaultMineruBinary() {
  if (process.env.MINERU_BIN) return process.env.MINERU_BIN;
  const isWindows = process.platform === 'win32';
  const local = resolve(
    isWindows ? '.mineru/Scripts/mineru.exe' : '.mineru/bin/mineru',
  );
  if (existsSync(local)) return local;
  return isWindows ? 'mineru.exe' : 'mineru';
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: options.timeout ?? MINERU_TIMEOUT_MS,
  });
  if (result.error) {
    fail(
      `No se pudo ejecutar ${basename(command)}: ${result.error.message}. ` +
        'Revisa --mineru o instala MinerU en .mineru.',
    );
  }
  return result;
}

function ensureServer(mineru) {
  const status = run(mineru, ['server', 'status'], { timeout: 30_000 });
  const detail = `${status.stdout ?? ''} ${status.stderr ?? ''}`;
  // «Server is not running» contiene la palabra running: primero se descarta
  // el estado negativo y solo después se acepta uno positivo.
  const stopped = /\bnot running\b|\bstopped\b|\binactive\b/iu.test(detail);
  const running =
    !stopped && /\brunning\b|\bactive\b|\bready\b/iu.test(detail);
  if (running) return;
  const started = run(mineru, ['server', 'start'], { timeout: 600_000 });
  if (started.status !== 0) {
    fail(
      `MinerU no está iniciado. Ejecuta "${mineru} server start" y vuelve a intentar. ` +
        `${(started.stderr || started.stdout || '').trim().slice(0, 500)}`,
    );
  }
}

function convertPdf(pdfPath, outputPath, mineru, startServer) {
  if (!existsSync(pdfPath)) fail(`No existe el PDF: ${pdfPath}`);
  if (resolve(pdfPath) === resolve(outputPath)) {
    fail('La salida no puede ser el mismo archivo PDF de entrada.');
  }
  if (startServer) ensureServer(mineru);
  const tempDir = mkdtempSync(join(tmpdir(), 'avend-mineru-'));
  const markdownPath = join(tempDir, `${basename(pdfPath)}.mineru.md`);
  try {
    const result = run(mineru, [
      'parse',
      pdfPath,
      '--pages',
      'all',
      '--format',
      'markdown',
      '--wait',
      '1800',
      '--output',
      markdownPath,
      '--json',
    ]);
    if (result.status !== 0) {
      const detail = `${result.stderr ?? ''} ${result.stdout ?? ''}`
        .trim()
        .replaceAll(/\s+/gu, ' ')
        .slice(0, 800);
      fail(
        `MinerU no pudo convertir el PDF${detail ? `: ${detail}` : '.'} ` +
          'Verifica que el servidor local esté iniciado.',
      );
    }
    if (!existsSync(markdownPath)) {
      fail('MinerU terminó sin escribir el Markdown esperado.');
    }
    const bytes = statSync(markdownPath).size;
    if (bytes > MAX_MARKDOWN_BYTES) {
      fail(
        `El Markdown supera el tope de ${Math.round(MAX_MARKDOWN_BYTES / 1024 / 1024)} MiB.`,
      );
    }
    const markdown = readFileSync(markdownPath, 'utf8');
    const pages = [...markdown.matchAll(PAGE_MARKER)].map((match) =>
      Number(match[1]),
    );
    if (!pages.length) {
      fail(
        'El Markdown no trae marcadores "<!-- page N -->". ' +
          'Actualiza MinerU o revisa que el parseo haya terminado completo.',
      );
    }
    const uniquePages = [...new Set(pages)].sort((left, right) => left - right);
    if (
      uniquePages[0] !== 1 ||
      uniquePages.at(-1) !== uniquePages.length
    ) {
      fail(
        'El Markdown no contiene todas las páginas de forma contigua; no se subirá una conversión parcial.',
      );
    }
    writeFileSync(outputPath, markdown, 'utf8');
    return {
      bytes,
      markdown,
      maxPage: Math.max(...pages),
      pages: uniquePages.length,
      tables: markdown
        .split(/\r?\n/u)
        .filter((line) => /^\s*\|.*\|\s*$/u.test(line)).length,
    };
  } finally {
    rmSync(tempDir, { force: true, recursive: true });
  }
}

function runCli(argumentsList, label) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'supabase';
  const commandArguments = isWindows
    ? ['/d', '/c', 'supabase.cmd', ...argumentsList]
    : argumentsList;
  const result = spawnSync(command, commandArguments, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '')
      .trim()
      .replaceAll(/\s+/gu, ' ');
    fail(`${label}${detail ? `: ${detail.slice(0, 500)}` : '.'}`);
  }
  return result.stdout;
}

function parseCliJson(raw, label) {
  const start = raw.search(/[[{]/u);
  if (start < 0) fail(label);
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    fail(label);
  }
}

function loadServiceRoleKey(projectRef) {
  const keys = parseCliJson(
    runCli(
      [
        'projects',
        'api-keys',
        '--project-ref',
        projectRef,
        '--output',
        'json',
        '--log-level',
        'error',
      ],
      'No se pudieron obtener las credenciales del proyecto',
    ),
    'La respuesta de claves del proyecto no es válida',
  );
  const key =
    keys.find(
      (candidate) =>
        candidate.name === 'service_role' && candidate.type === 'legacy',
    )?.api_key ??
    keys.find((candidate) => candidate.name === 'service_role')?.api_key;
  if (!key) fail('El proyecto no expone una clave service_role utilizable.');
  return key;
}

async function resolveActorId(client, actorEmail, actorId) {
  if (actorId) return actorId;
  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) fail(`No se pudo consultar la lista de usuarios: ${error.message}`);
  const user = data.users.find(
    (candidate) =>
      (candidate.email ?? '').toLocaleLowerCase('es') ===
      actorEmail.toLocaleLowerCase('es'),
  );
  if (!user) fail('No existe un usuario con el correo indicado.');
  return user.id;
}

async function uploadMode() {
  const projectRef = optionValue('--project-ref');
  const versionId = optionValue('--version');
  if (!projectRef || !versionId) {
    fail('Faltan --project-ref y --version. Usa --help para ver el uso.');
  }
  if (!UUID_PATTERN.test(versionId)) {
    fail('--version no es un UUID válido.');
  }
  if (!hasFlag('--confirm-upload')) {
    console.log(
      'Modo remoto sin --confirm-upload: solo se descargará y convertirá. ' +
        'No se escribirá nada en Supabase.',
    );
  }
  const actorEmail = optionValue('--actor-email');
  const actorIdOption = optionValue('--actor-id');
  if (actorIdOption && !UUID_PATTERN.test(actorIdOption)) {
    fail('--actor-id no es un UUID válido.');
  }
  const serviceRoleKey = loadServiceRoleKey(projectRef);
  const client = createClient(
    `https://${projectRef}.supabase.co`,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { data: version, error } = await client
    .from('document_versions')
    .select(
      'id,document_id,storage_bucket,storage_path,page_count,original_file_name',
    )
    .eq('id', versionId)
    .single();
  if (error || !version) {
    fail(`No se pudo leer la versión: ${error?.message ?? 'no encontrada'}`);
  }
  const { data: file, error: downloadError } = await client.storage
    .from(version.storage_bucket)
    .download(version.storage_path);
  if (downloadError || !file) {
    fail(
      `No se pudo descargar el PDF: ${downloadError?.message ?? 'sin datos'}`,
    );
  }
  const workDir = mkdtempSync(join(tmpdir(), 'avend-mineru-remote-'));
  const pdfPath = join(workDir, version.original_file_name || 'documento.pdf');
  const outputPath = join(workDir, `${version.id}.mineru.md`);
  try {
    writeFileSync(pdfPath, Buffer.from(await file.arrayBuffer()));
    const mineru = optionValue('--mineru') ?? defaultMineruBinary();
    const summary = convertPdf(
      pdfPath,
      outputPath,
      mineru,
      hasFlag('--start-server'),
    );
    if (version.page_count && summary.maxPage !== version.page_count) {
      fail(
        `El Markdown declara ${summary.maxPage} páginas, pero el PDF tiene ${version.page_count}; no se subirá una conversión parcial.`,
      );
    }
    console.log(
      `Convertido: ${summary.pages} páginas, ${summary.tables} líneas de tabla, ${summary.bytes} bytes.`,
    );
    if (!hasFlag('--confirm-upload')) {
      console.log(`Markdown temporal conservado para revisión: ${outputPath}`);
      return;
    }
    if (!actorIdOption && !actorEmail) {
      fail('Falta --actor-email o --actor-id para reencolar la ingesta.');
    }
    // Se valida el actor antes de escribir el sidecar: un fallo de permisos no
    // debe dejar un objeto nuevo sin reencolado.
    const actorId = await resolveActorId(client, actorEmail, actorIdOption);
    const sidecarPath = `${version.storage_path}.mineru.md`;
    const { error: uploadError } = await client.storage
      .from(version.storage_bucket)
      .upload(sidecarPath, readFileSync(outputPath), {
        contentType: 'text/markdown',
        upsert: true,
      });
    if (uploadError) {
      fail(`No se pudo subir el sidecar: ${uploadError.message}`);
    }
    const { error: retryError } = await client.rpc(
      'retry_document_ingestion',
      {
        p_actor_id: actorId,
        p_document_version_id: version.id,
      },
    );
    if (retryError) {
      fail(`Sidecar subido, pero no se pudo reencolar: ${retryError.message}`);
    }
    console.log(`Sidecar subido: ${sidecarPath}`);
    console.log(
      'Ingesta reencolada. El worker leerá el Markdown; si algo falla, usará el PDF.',
    );
  } finally {
    // En un dry run se conserva el Markdown para que el operador pueda
    // revisarlo antes de autorizar la subida.
    const keepTemp = hasFlag('--keep-temp') || !hasFlag('--confirm-upload');
    if (!keepTemp) rmSync(workDir, { force: true, recursive: true });
  }
}

async function localMode() {
  const input = optionValue('--file');
  if (!input) {
    usage();
    process.exitCode = 1;
    return;
  }
  const pdfPath = resolve(input);
  const outputPath = resolve(
    optionValue('--output') ??
      join(dirname(pdfPath), `${basename(pdfPath)}.mineru.md`),
  );
  const mineru = optionValue('--mineru') ?? defaultMineruBinary();
  const summary = convertPdf(
    pdfPath,
    outputPath,
    mineru,
    hasFlag('--start-server'),
  );
  console.log(`Markdown: ${outputPath}`);
  console.log(
    `Páginas: ${summary.pages}; líneas de tabla: ${summary.tables}; bytes: ${summary.bytes}.`,
  );
  console.log(
    'Súbelo desde el panel (Nueva versión) o usa --project-ref/--version para el sidecar.',
  );
}

try {
  if (hasFlag('--help') || process.argv.length <= 2) {
    usage();
  } else if (optionValue('--project-ref') || optionValue('--version')) {
    await uploadMode();
  } else {
    await localMode();
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
