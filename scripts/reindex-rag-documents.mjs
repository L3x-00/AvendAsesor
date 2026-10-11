#!/usr/bin/env node

/**
 * Reindexado del corpus RAG: reencola la ingesta de las versiones vigentes de
 * los documentos para que el troceado, el «sustento» de las referencias y los
 * embeddings se regeneren con el código desplegado (2026-10-10).
 *
 * Solo reencola: el worker de ingesta de la API (Render) procesa los trabajos
 * y reemplaza los fragmentos anteriores (`clearChunks` → `insertChunks`).
 * Mientras un documento se reprocesa queda fuera de las respuestas con
 * sustento; es temporal.
 *
 * Uso:
 *   node scripts/reindex-rag-documents.mjs --project-ref <ref> [opciones]
 *   node scripts/reindex-rag-documents.mjs --project-ref <ref> \
 *     --actor-email <correo-admin> --confirm-reindex
 *
 * Sin `--confirm-reindex` solo lista los documentos candidatos (dry run).
 *
 * Requisitos: Supabase CLI autenticada y el repositorio enlazado al proyecto
 * (`supabase link --project-ref <ref>`). Acción de producción: requiere
 * autorización del Product Owner.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ALLOWED_STATUSES = new Set(['indexed', 'failed', 'pending', 'processing']);

function usage() {
  console.log(
    [
      'Reindexado del corpus RAG (reencola la ingesta de las versiones vigentes).',
      '',
      'Uso:',
      '  node scripts/reindex-rag-documents.mjs --project-ref <ref> [opciones]',
      '',
      'Opciones:',
      '  --project-ref <ref>     Proyecto Supabase destino (obligatorio).',
      '  --actor-email <correo>  Administrador solicitante (obligatorio con --confirm-reindex).',
      '  --status <estado>       Estado de la versión a reencolar (default: indexed).',
      '  --document <uuid>       Documento puntual (repetible). Sin él: todo el corpus.',
      '  --confirm-reindex       Ejecuta el reencolado. Sin esta bandera solo lista.',
      '  --help                  Muestra esta ayuda.',
    ].join('\n'),
  );
}

function failure(message) {
  throw new Error(`[rag-reindex] ${message}`);
}

function optionValue(name) {
  const equalsPrefix = `${name}=`;
  const inline = process.argv.find((argument) => argument.startsWith(equalsPrefix));
  if (inline) return inline.slice(equalsPrefix.length);
  const position = process.argv.indexOf(name);
  return position >= 0 ? process.argv[position + 1] : undefined;
}

function optionValues(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === name) {
      const value = process.argv[index + 1];
      if (value) values.push(value);
      index += 1;
      continue;
    }
    if (argument.startsWith(`${name}=`)) values.push(argument.slice(name.length + 1));
  }
  return values;
}

function runCli(argumentsList, label) {
  const isWindows = process.platform === 'win32';
  const command = isWindows ? process.env.ComSpec || 'cmd.exe' : 'supabase';
  const commandArguments = isWindows
    ? ['/d', '/c', 'supabase.cmd', ...argumentsList]
    : argumentsList;
  const result = spawnSync(command, commandArguments, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().replaceAll(/\s+/gu, ' ');
    failure(`${label}${detail ? `: ${detail.slice(0, 500)}` : '.'}`);
  }
  return result.stdout;
}

function executeSql(sql, label) {
  const workDirectory = mkdtempSync(join(tmpdir(), 'avend-rag-reindex-'));
  const statementFile = join(workDirectory, 'statement.sql');
  try {
    writeFileSync(statementFile, sql, { encoding: 'utf8', mode: 0o600 });
    return runCli(
      ['db', 'query', '--linked', '--file', statementFile, '--log-level', 'error'],
      label,
    );
  } finally {
    rmSync(workDirectory, { force: true, recursive: true });
  }
}

function tryParseJsonOutput(raw) {
  const start = raw.search(/[[{]/u);
  if (start < 0) return null;
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    return null;
  }
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function assertLinkedProject(projectRef) {
  const linkedRefPath = resolve(repositoryRoot, 'supabase', '.temp', 'project-ref');
  const linkedRef = existsSync(linkedRefPath)
    ? readFileSync(linkedRefPath, 'utf8').trim()
    : '';
  if (linkedRef !== projectRef) {
    failure(
      `El repositorio no está enlazado a ${projectRef}. Ejecuta primero: supabase link --project-ref ${projectRef}`,
    );
  }
}

function candidateFilterSql(status, documentIds) {
  const documentFilter = documentIds.length
    ? `and d.id in (${documentIds.map((id) => `${sqlLiteral(id)}::uuid`).join(', ')})`
    : '';
  return `v.ingestion_status::text = ${sqlLiteral(status)} ${documentFilter}`;
}

function listCandidates(projectRef, status, documentIds) {
  const sql = `
select coalesce(
  json_agg(
    json_build_object(
      'documentId', candidate.document_id,
      'title', candidate.title,
      'versionId', candidate.version_id,
      'versionNumber', candidate.version_number,
      'status', candidate.status
    ) order by candidate.title
  ),
  '[]'::json
)::text
from (
  select
    d.id as document_id,
    d.title,
    v.id as version_id,
    v.version_number,
    v.ingestion_status::text as status
  from public.documents as d
  join public.document_versions as v on v.id = d.current_version_id
  where not d.is_deleted
    and ${candidateFilterSql(status, documentIds)}
) as candidate;`;
  const raw = executeSql(sql, 'No se pudo consultar el catálogo productivo');
  return tryParseJsonOutput(raw);
}

function requeue(projectRef, status, documentIds, actorEmail) {
  const sql = `
do $$
declare
  actor uuid;
  target record;
  queued integer := 0;
begin
  select user_row.id
  into actor
  from auth.users as user_row
  where lower(user_row.email) = lower(${sqlLiteral(actorEmail)})
  limit 1;

  if actor is null then
    raise exception 'No existe un usuario con el correo indicado';
  end if;

  for target in
    select d.title, v.id as version_id
    from public.documents as d
    join public.document_versions as v on v.id = d.current_version_id
    where not d.is_deleted
      and ${candidateFilterSql(status, documentIds)}
    order by d.title
  loop
    perform public.retry_document_ingestion(target.version_id, actor);
    queued := queued + 1;
    raise notice 'Reencolado (%): %', queued, target.title;
  end loop;

  raise notice 'Total reencolado: %', queued;
end
$$;`;
  return executeSql(sql, 'No se pudo reencolar el corpus');
}

function statusSummary(projectRef) {
  const sql = `
select coalesce(
  json_agg(row_to_json(summary) order by summary.status),
  '[]'::json
)::text
from (
  select v.ingestion_status::text as status, count(*)::integer as versions
  from public.document_versions as v
  join public.documents as d on d.id = v.document_id and d.current_version_id = v.id
  where not d.is_deleted
  group by 1
) as summary;`;
  const raw = executeSql(sql, 'No se pudo consultar el estado de la ingesta');
  return tryParseJsonOutput(raw);
}

function main() {
  if (process.argv.includes('--help') || process.argv.length <= 2) {
    usage();
    return;
  }

  const projectRef = optionValue('--project-ref');
  if (!projectRef) failure('Falta --project-ref. Usa --help para ver el uso.');
  const status = optionValue('--status') ?? 'indexed';
  if (!ALLOWED_STATUSES.has(status)) {
    failure('--status debe ser indexed, failed, pending o processing.');
  }
  const documentIds = optionValues('--document');
  for (const documentId of documentIds) {
    if (!UUID_PATTERN.test(documentId)) failure(`--document no es un UUID válido: ${documentId}`);
  }
  const actorEmail = optionValue('--actor-email');
  const confirm = process.argv.includes('--confirm-reindex');
  if (confirm && (!actorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(actorEmail))) {
    failure('Falta --actor-email válido (administrador solicitante).');
  }

  assertLinkedProject(projectRef);
  const candidates = listCandidates(projectRef, status, documentIds);
  if (!candidates) {
    console.log('La CLI no devolvió una lista interpretable (salida en bruto arriba).');
    console.log('Dry run: no se cambió nada.');
    return;
  }

  console.log(`Documentos en estado «${status}» en ${projectRef}: ${candidates.length}`);
  for (const candidate of candidates) {
    console.log(
      `  - ${candidate.title} · versión ${candidate.versionNumber} → reencolar (${candidate.versionId})`,
    );
  }
  if (!candidates.length) {
    console.log('Nada que reencolar.');
    return;
  }

  if (!confirm) {
    console.log('');
    console.log('Dry run: no se cambió nada. Para ejecutar agrega:');
    console.log(`  --actor-email <correo-admin> --confirm-reindex`);
    return;
  }

  requeue(projectRef, status, documentIds, actorEmail);
  console.log('');
  console.log('Reencolado enviado. El worker de la API lo procesará en segundos.');
  const summary = statusSummary(projectRef);
  if (!summary) {
    console.log('Sin resumen interpretable: revisa la salida en bruto de arriba.');
  } else {
    console.log('Estado de la ingesta ahora:');
    for (const entry of summary) {
      console.log(`  - ${entry.status}: ${entry.versions}`);
    }
  }
  console.log('');
  console.log(
    'Verificación final: cuando no queden «pending»/«processing», re-ejecuta este script (dry run) y revisa que «indexed» volvió a su conteo.',
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
