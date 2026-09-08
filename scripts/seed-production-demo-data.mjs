#!/usr/bin/env node

import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runDemoSeed } from './seed-demo-data.mjs';

const EXPECTED_PROJECT_REF = 'blxrdotroysitfyehmqw';
const EXPECTED_API_URL = `https://${EXPECTED_PROJECT_REF}.supabase.co`;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function failure(message) {
  throw new Error(`[demo-production-seed] ${message}`);
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

function parseCliJson(raw, label) {
  const start = raw.search(/[\[{]/u);
  if (start < 0) failure(`${label}.`);
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    failure(`${label}.`);
  }
}

function assertTarget() {
  const verifyOnly = process.argv.includes('--verify');
  if (optionValue('--project-ref') !== EXPECTED_PROJECT_REF) {
    failure(`El seed solo admite el proyecto productivo autorizado ${EXPECTED_PROJECT_REF}.`);
  }
  if (!verifyOnly && !process.argv.includes('--confirm-production-demo-seed')) {
    failure('Falta --confirm-production-demo-seed. El seed no escribe en producción por accidente.');
  }
  const linkedRefPath = resolve(repositoryRoot, 'supabase', '.temp', 'project-ref');
  if (!existsSync(linkedRefPath) || readFileSync(linkedRefPath, 'utf8').trim() !== EXPECTED_PROJECT_REF) {
    failure('El repositorio no está enlazado al proyecto productivo autorizado.');
  }

  const projects = parseCliJson(
    runCli(['projects', 'list', '--output', 'json', '--log-level', 'error'], 'No se pudo comprobar el proyecto enlazado'),
    'La respuesta de proyectos no es válida',
  );
  const project = projects.find((candidate) => candidate.ref === EXPECTED_PROJECT_REF && candidate.linked === true);
  if (!project || project.status !== 'ACTIVE_HEALTHY') {
    failure('El proyecto productivo autorizado no está sano o no es el proyecto enlazado.');
  }
  return verifyOnly;
}

function loadVerifiedBackupManifest(verifyOnly) {
  if (verifyOnly) return;
  const manifestPath = optionValue('--backup-manifest');
  if (!manifestPath || !isAbsolute(manifestPath) || !existsSync(manifestPath)) {
    failure('Falta un manifiesto de respaldo privado y verificable mediante --backup-manifest.');
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    failure('El manifiesto de respaldo no tiene formato válido.');
  }
  if (
    manifest?.projectRef !== EXPECTED_PROJECT_REF
    || !isAbsolute(manifest.backupFile || '')
    || !existsSync(manifest.backupFile)
    || typeof manifest.sha256 !== 'string'
  ) {
    failure('El manifiesto no identifica un respaldo recuperable del proyecto autorizado.');
  }
  const contents = readFileSync(manifest.backupFile);
  const ageMilliseconds = Date.now() - Date.parse(manifest.createdAt);
  if (
    !Number.isFinite(ageMilliseconds)
    || ageMilliseconds < 0
    || ageMilliseconds > 2 * 60 * 60 * 1_000
    || statSync(manifest.backupFile).size !== manifest.bytes
    || createHash('sha256').update(contents).digest('hex') !== manifest.sha256
  ) {
    failure('El respaldo no coincide con su manifiesto o tiene más de dos horas. Cree uno nuevo antes de continuar.');
  }
  if (!isAbsolute(manifest.storageSnapshotDirectory || '') || !existsSync(manifest.storageSnapshotDirectory)) {
    failure('El manifiesto no incluye un snapshot privado de Storage. Cree un respaldo nuevo antes de continuar.');
  }
  if (!Array.isArray(manifest.storageSnapshot)) {
    failure('El snapshot de Storage no tiene un manifiesto válido.');
  }
  const snapshotRoot = `${resolve(manifest.storageSnapshotDirectory)}${sep}`;
  for (const object of manifest.storageSnapshot) {
    if (
      !object
      || typeof object.relativePath !== 'string'
      || !isAbsolute(manifest.storageSnapshotDirectory)
      || !resolve(manifest.storageSnapshotDirectory, ...object.relativePath.split('/')).startsWith(snapshotRoot)
      || !Number.isInteger(object.bytes)
      || typeof object.sha256 !== 'string'
    ) {
      failure('El manifiesto contiene una entrada de Storage inválida.');
    }
    const objectFile = resolve(manifest.storageSnapshotDirectory, ...object.relativePath.split('/'));
    if (!existsSync(objectFile)) failure('Falta un objeto en el snapshot privado de Storage.');
    const contents = readFileSync(objectFile);
    if (contents.byteLength !== object.bytes || createHash('sha256').update(contents).digest('hex') !== object.sha256) {
      failure('Un objeto del snapshot de Storage no coincide con su hash o tamaño.');
    }
  }
}

function loadApiKeys() {
  const keys = parseCliJson(
    runCli([
      'projects', 'api-keys', '--project-ref', EXPECTED_PROJECT_REF, '--output', 'json', '--log-level', 'error',
    ], 'No se pudieron obtener las credenciales de servidor en memoria'),
    'La respuesta de claves de proyecto no es válida',
  );
  const anonKey = keys.find((key) => key.name === 'anon' && key.type === 'legacy')?.api_key;
  const serviceRoleKey = keys.find((key) => key.name === 'service_role' && key.type === 'legacy')?.api_key;
  if (!anonKey || !serviceRoleKey) {
    failure('No están disponibles las credenciales de servidor requeridas para el seed.');
  }
  return { anonKey, serviceRoleKey };
}

function executeProductionSql(sql, label) {
  const workDirectory = mkdtempSync(join(tmpdir(), 'avend-production-demo-seed-'));
  const statementFile = join(workDirectory, 'statement.sql');
  try {
    writeFileSync(statementFile, sql, { encoding: 'utf8', mode: 0o600 });
    return runCli(['db', 'query', '--linked', '--file', statementFile, '--log-level', 'error'], label);
  } finally {
    rmSync(workDirectory, { force: true, recursive: true });
  }
}

function assertSeedPrerequisites() {
  executeProductionSql(`
do $$
begin
  if to_regprocedure('public.create_governed_document_with_initial_version(uuid,uuid,text,text,text,smallint,text,text,jsonb,uuid[],text,text,bigint,integer,text,uuid,public.document_situation,text,uuid,date,smallint,text,public.document_archive_reason,text,text)') is null
    or to_regprocedure('public.get_admin_home_dashboard_metrics(uuid,integer)') is null
    or to_regprocedure('public.get_consultation_reports_dashboard(uuid,text)') is null
    or to_regprocedure('public.search_document_chunks_by_situation(extensions.vector,text,uuid,real,integer,text)') is null then
    raise exception 'DEMO_SEED_SCHEMA_PREREQUISITE_MISSING';
  end if;
  if not exists (select 1 from storage.buckets where id = 'normative-documents')
    or not exists (select 1 from storage.buckets where id = 'consultation-case-attachments') then
    raise exception 'DEMO_SEED_STORAGE_BUCKET_MISSING';
  end if;
  if position('demoSeed' in pg_get_functiondef('public.search_document_chunks_by_situation(extensions.vector,text,uuid,real,integer,text)'::regprocedure)) = 0
    or position('demoSeed' in pg_get_functiondef('public.search_document_chunks(extensions.vector,text,uuid,real,integer)'::regprocedure)) = 0 then
    raise exception 'DEMO_SEED_RAG_ISOLATION_MISSING';
  end if;
  if to_regprocedure('private.preserve_demo_seed_marker()') is null
    or to_regprocedure('private.validate_chat_message_source_live_evidence()') is null
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_row
      join pg_catalog.pg_class as relation_row on relation_row.oid = trigger_row.tgrelid
      join pg_catalog.pg_namespace as namespace_row on namespace_row.oid = relation_row.relnamespace
      where trigger_row.tgname = 'documents_preserve_demo_seed_marker'
        and relation_row.relname = 'documents'
        and namespace_row.nspname = 'public'
        and not trigger_row.tgisinternal
    )
    or position('demoSeed' in pg_get_functiondef('private.validate_chat_message_source_live_evidence()'::regprocedure)) = 0 then
    raise exception 'DEMO_SEED_MARKER_GUARD_MISSING';
  end if;
end;
$$;
`, 'No se cumplieron los prerrequisitos de producción del seed');
}

async function main() {
  const verifyOnly = assertTarget();
  loadVerifiedBackupManifest(verifyOnly);
  const { anonKey, serviceRoleKey } = loadApiKeys();
  assertSeedPrerequisites();
  const runtime = {
    anonKey,
    apiUrl: EXPECTED_API_URL,
    demoPassword: randomBytes(36).toString('base64url'),
    executeSql: executeProductionSql,
    mode: 'production',
    moduleCodePrefix: 'DEMO_',
    pdfEnvironment: 'entorno de demostración productivo',
    serviceRoleKey,
  };
  const summary = await runDemoSeed(runtime, {
    verifyActiveLogin: !verifyOnly,
    verifyOnly,
  });
  console.log(JSON.stringify({ mode: 'production', operation: verifyOnly ? 'verify' : 'seed', summary }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
