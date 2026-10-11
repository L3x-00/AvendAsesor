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
 * Requisitos: Supabase CLI autenticada con acceso al proyecto (las claves se
 * piden en memoria y no se imprimen). Acción de producción: requiere
 * autorización del Product Owner.
 */

import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

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
      '  --actor-id <uuid>       Id del administrador solicitante (alternativa al correo).',
      '  --status <estado>       Estado de la versión a reencolar (default: indexed).',
      '  --document <uuid>       Documento puntual (repetible). Sin él: todo el corpus.',
      '  --list-actors          Lista los administradores que pueden figurar como solicitantes.',
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
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim().replaceAll(/\s+/gu, ' ');
    failure(`${label}${detail ? `: ${detail.slice(0, 500)}` : '.'}`);
  }
  return result.stdout;
}

function parseCliJson(raw, label) {
  const start = raw.search(/[[{]/u);
  if (start < 0) failure(label);
  try {
    return JSON.parse(raw.slice(start));
  } catch {
    failure(label);
  }
}

/** Clave de servidor del proyecto, pedida en memoria a la CLI. */
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
    keys.find((candidate) => candidate.name === 'service_role' && candidate.type === 'legacy')
      ?.api_key ??
    keys.find((candidate) => candidate.name === 'service_role')?.api_key;
  if (!key) failure('El proyecto no expone una clave service_role utilizable.');
  return key;
}

async function resolveActorId(client, actorEmail, actorId) {
  if (actorId) {
    if (!UUID_PATTERN.test(actorId)) failure('--actor-id no es un UUID válido.');
    return actorId;
  }
  const { data, error } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (error) failure(`No se pudo consultar la lista de usuarios: ${error.message}`);
  const user = data.users.find(
    (candidate) =>
      (candidate.email ?? '').toLocaleLowerCase('es') ===
      actorEmail.toLocaleLowerCase('es'),
  );
  if (!user) failure('No existe un usuario con el correo indicado.');
  return user.id;
}

/** Administradores con perfil, para elegir un actor trazable del reencolado. */
async function listActors(client) {
  const { data: profiles, error } = await client
    .from('profiles')
    .select('id,full_name,role')
    .in('role', ['superadmin', 'admin'])
    .order('role')
    .order('full_name');
  if (error) failure(`No se pudo consultar los perfiles: ${error.message}`);
  const { data, error: usersError } = await client.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (usersError) {
    failure(`No se pudo consultar la lista de usuarios: ${usersError.message}`);
  }
  const emailById = new Map(
    data.users.map((user) => [user.id, user.email ?? 'sin correo']),
  );
  for (const profile of profiles) {
    console.log(
      `  ${profile.role} · ${profile.full_name} · ${emailById.get(profile.id) ?? 'sin correo'} · ${profile.id}`,
    );
  }
  if (!profiles.length) console.log('  (sin administradores)');
}

async function listCandidates(client, status, documentIds) {
  let documentsQuery = client
    .from('documents')
    .select('id,title,current_version_id')
    .eq('is_deleted', false)
    .not('current_version_id', 'is', null);
  if (documentIds.length) {
    documentsQuery = documentsQuery.in('id', documentIds);
  }
  const { data: documents, error } = await documentsQuery.order('title');
  if (error) failure(`No se pudo consultar el catálogo: ${error.message}`);
  if (!documents.length) return [];

  const { data: versions, error: versionsError } = await client
    .from('document_versions')
    .select('id,version_number,ingestion_status')
    .in(
      'id',
      documents.map((document) => document.current_version_id),
    );
  if (versionsError) {
    failure(`No se pudo consultar el estado de ingesta: ${versionsError.message}`);
  }
  const versionById = new Map(
    versions.map((version) => [version.id, version]),
  );

  return documents
    .map((document) => {
      const version = versionById.get(document.current_version_id);
      return {
        documentId: document.id,
        status: version?.ingestion_status ?? 'desconocido',
        title: document.title,
        versionId: document.current_version_id,
        versionNumber: version?.version_number ?? 0,
      };
    })
    .filter((candidate) => candidate.status === status);
}

async function requeue(client, candidates, actorId) {
  const results = [];
  for (const candidate of candidates) {
    const { error } = await client.rpc('retry_document_ingestion', {
      p_actor_id: actorId,
      p_document_version_id: candidate.versionId,
    });
    results.push({
      error: error?.message ?? null,
      ok: !error,
      title: candidate.title,
    });
  }
  return results;
}

async function statusSummary(client) {
  const { data: documents, error } = await client
    .from('documents')
    .select('current_version_id')
    .eq('is_deleted', false)
    .not('current_version_id', 'is', null);
  if (error) failure(`No se pudo resumir la ingesta: ${error.message}`);
  const { data: versions, error: versionsError } = await client
    .from('document_versions')
    .select('ingestion_status')
    .in(
      'id',
      documents.map((document) => document.current_version_id),
    );
  if (versionsError) {
    failure(`No se pudo resumir la ingesta: ${versionsError.message}`);
  }
  const summary = new Map();
  for (const version of versions) {
    summary.set(
      version.ingestion_status,
      (summary.get(version.ingestion_status) ?? 0) + 1,
    );
  }
  return [...summary.entries()].sort(([left], [right]) =>
    left.localeCompare(right),
  );
}

async function main() {
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
  const actorIdOption = optionValue('--actor-id');
  const confirm = process.argv.includes('--confirm-reindex');
  if (
    confirm &&
    !actorIdOption &&
    (!actorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(actorEmail))
  ) {
    failure('Falta --actor-email válido o --actor-id (administrador solicitante).');
  }

  const serviceRoleKey = loadServiceRoleKey(projectRef);
  const client = createClient(`https://${projectRef}.supabase.co`, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  if (process.argv.includes('--list-actors')) {
    console.log(`Administradores en ${projectRef}:`);
    await listActors(client);
    return;
  }

  const candidates = await listCandidates(client, status, documentIds);
  console.log(
    `Documentos en estado «${status}» en ${projectRef}: ${candidates.length}`,
  );
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
    console.log('  --actor-email <correo-admin> --confirm-reindex');
    return;
  }

  const actorId = await resolveActorId(client, actorEmail, actorIdOption);
  const results = await requeue(client, candidates, actorId);
  const failed = results.filter((result) => !result.ok);
  for (const result of results) {
    console.log(`  ${result.ok ? '✓' : '✗'} ${result.title}${result.error ? ` — ${result.error}` : ''}`);
  }
  console.log('');
  console.log(
    `Reencolados: ${results.length - failed.length}/${results.length}. El worker de la API los procesará en los próximos segundos.`,
  );
  console.log('Estado de la ingesta ahora:');
  for (const [name, total] of await statusSummary(client)) {
    console.log(`  - ${name}: ${total}`);
  }
  console.log('');
  console.log(
    'Verificación final: repite el dry run hasta que no queden «pending»/«processing» y «indexed» recupere su conteo.',
  );
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
