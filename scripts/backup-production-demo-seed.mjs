#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const EXPECTED_PROJECT_REF = 'blxrdotroysitfyehmqw';
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
  const result = spawnSync(command, commandArguments, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) failure(`${label}.`);
  return result.stdout;
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

function createBackup() {
  const backupDirectory = resolve(process.env.LOCALAPPDATA || tmpdir(), 'Codex', 'avend-production-backups');
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
  const backupFile = join(backupDirectory, `avend-production-pre-demo-${stamp}.sql`);

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

  const manifest = {
    backupFile,
    bytes: statSync(backupFile).size,
    createdAt: new Date().toISOString(),
    projectRef: EXPECTED_PROJECT_REF,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
  const manifestFile = `${backupFile}.manifest.json`;
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  if (!isAbsolute(manifestFile)) failure('El manifiesto del respaldo debe conservar una ruta absoluta.');
  return { backupFile, manifestFile, ...manifest };
}

try {
  assertTarget();
  const result = createBackup();
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
