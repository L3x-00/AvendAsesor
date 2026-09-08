#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const EXPECTED_PROJECT_REF = 'blxrdotroysitfyehmqw';
const EXPECTED_API_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const STORAGE_BUCKETS = ['normative-documents', 'consultation-case-attachments'];
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function failure(message) {
  throw new Error(`[demo-production-backup] ${message}`);
}

function optionValue(name) {
  const equalsPrefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(equalsPrefix));
  if (inline) return inline.slice(equalsPrefix.length);
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

function runCli(argumentsList, label) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'supabase';
  const commandArguments = isWindows
    ? ['/d', '/c', 'supabase.cmd', ...argumentsList]
    : argumentsList;
  let lastResult;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    lastResult = spawnSync(command, commandArguments, {
      cwd: repositoryRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (lastResult.status === 0) return lastResult.stdout;
  }
  const detail = (lastResult?.stderr || lastResult?.stdout || '').trim().replaceAll(/\s+/gu, ' ');
  failure(`${label}${detail ? `: ${detail.slice(0, 500)}` : '.'}`);
}

function parseCliJson(raw, label) {
  const start = raw.search(/[\[{]/u);
  if (start < 0) failure(`${label}.`);
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    failure(`${label}.`);
  }
}

function loadApiKeys() {
  const keys = parseCliJson(
    runCli([
      'projects', 'api-keys', '--project-ref', EXPECTED_PROJECT_REF, '--output', 'json', '--log-level', 'error',
    ], 'No se pudieron obtener las credenciales de respaldo en memoria'),
    'La respuesta de claves de proyecto no es válida',
  );
  const serviceRoleKey = keys.find((key) => key.name === 'service_role' && key.type === 'legacy')?.api_key;
  if (!serviceRoleKey) failure('No está disponible la credencial de servidor requerida para el respaldo.');
  return serviceRoleKey;
}

function assertTarget() {
  if (!process.argv.includes('--confirm-production-backup')) {
    failure('Falta --confirm-production-backup. No se crea una copia de producción por accidente.');
  }
  if (optionValue('--project-ref') !== EXPECTED_PROJECT_REF) {
    failure(`El respaldo solo admite el proyecto productivo autorizado ${EXPECTED_PROJECT_REF}.`);
  }
  const linkedRefPath = resolve(repositoryRoot, 'supabase', '.temp', 'project-ref');
  if (!existsSync(linkedRefPath) || readFileSync(linkedRefPath, 'utf8').trim() !== EXPECTED_PROJECT_REF) {
    failure('El repositorio no está enlazado al proyecto productivo autorizado.');
  }
}

function safeSnapshotPath(snapshotDirectory, bucket, storagePath) {
  const target = resolve(snapshotDirectory, bucket, ...storagePath.split('/'));
  const root = `${resolve(snapshotDirectory)}${sep}`;
  if (!target.startsWith(root)) failure('La ruta de un objeto de Storage escapó del directorio privado.');
  return target;
}

async function listStorageObjects(client, bucket) {
  const objects = [];
  const pendingPrefixes = [''];
  while (pendingPrefixes.length) {
    const prefix = pendingPrefixes.shift();
    let offset = 0;
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: 'name', order: 'asc' },
      });
      if (error) failure(`No se pudo listar Storage (${bucket}).`);
      if (!data?.length) break;
      for (const item of data) {
        if (!item?.name) continue;
        const storagePath = prefix ? `${prefix}/${item.name}` : item.name;
        if (item.id || item.metadata) objects.push(storagePath);
        else pendingPrefixes.push(storagePath);
      }
      if (data.length < 100) break;
      offset += data.length;
    }
  }
  return objects.sort((left, right) => left.localeCompare(right));
}

async function snapshotStorage(client, snapshotDirectory) {
  const storageSnapshot = [];
  for (const bucket of STORAGE_BUCKETS) {
    const objects = await listStorageObjects(client, bucket);
    for (const storagePath of objects) {
      const { data, error } = await client.storage.from(bucket).download(storagePath);
      if (error || !data) failure(`No se pudo descargar el objeto de Storage ${bucket}/${storagePath}.`);
      const contents = Buffer.from(await data.arrayBuffer());
      const target = safeSnapshotPath(snapshotDirectory, bucket, storagePath);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, contents, { mode: 0o600 });
      storageSnapshot.push({
        bucket,
        path: storagePath,
        relativePath: relative(snapshotDirectory, target).replaceAll('\\', '/'),
        bytes: contents.byteLength,
        sha256: createHash('sha256').update(contents).digest('hex'),
      });
    }
  }
  return storageSnapshot;
}

async function createBackup() {
  const backupDirectory = resolve(process.env.LOCALAPPDATA || tmpdir(), 'Codex', 'avend-production-backups');
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
  const backupFile = join(backupDirectory, `avend-production-pre-demo-${stamp}.sql`);
  const storageSnapshotDirectory = join(backupDirectory, `avend-production-storage-${stamp}`);
  const serviceRoleKey = loadApiKeys();

  runCli([
    'db', 'dump', '--linked', '--data-only', '--use-copy', '--file', backupFile, '--log-level', 'error',
  ], 'No se pudo crear el respaldo lógico privado');

  if (!existsSync(backupFile)) failure('El respaldo lógico no se creó.');
  const contents = readFileSync(backupFile);
  const text = contents.toString('utf8');
  if (
    contents.byteLength < 8_192
    || !text.includes('COPY ')
    || !text.includes('"public"."profiles"')
    || !text.includes('"auth"."users"')
    || !text.includes('session_replication_role')
  ) {
    failure('El respaldo lógico no superó las comprobaciones de recuperabilidad.');
  }

  const storageClient = createClient(EXPECTED_API_URL, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const storageSnapshot = await snapshotStorage(storageClient, storageSnapshotDirectory);

  const manifest = {
    backupFile,
    bytes: statSync(backupFile).size,
    createdAt: new Date().toISOString(),
    projectRef: EXPECTED_PROJECT_REF,
    sha256: createHash('sha256').update(contents).digest('hex'),
    storageSnapshotDirectory,
    storageSnapshot,
  };
  const manifestFile = `${backupFile}.manifest.json`;
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (!isAbsolute(manifestFile)) failure('El manifiesto del respaldo debe conservar una ruta absoluta.');
  return { backupFile, manifestFile, ...manifest };
}

try {
  assertTarget();
  const result = await createBackup();
  console.log(JSON.stringify({
    backupFile: result.backupFile,
    bytes: result.bytes,
    manifestFile: result.manifestFile,
    projectRef: result.projectRef,
    sha256Prefix: result.sha256.slice(0, 16),
  }));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
