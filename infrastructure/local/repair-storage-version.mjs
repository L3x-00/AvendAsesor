import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const name = 'supabase_storage_AvendAsesor';
const backup = `${name}_a08_original`;
const network = 'supabase_network_AvendAsesor';
const database = 'supabase_db_AvendAsesor';
const oldImage = 'public.ecr.aws/supabase/storage-api:v1.68.1';
const newImage = 'public.ecr.aws/supabase/storage-api:v1.80.2';
const migration = 'drop-bucketid-objname-index';
const statusUrl = 'http://127.0.0.1:55321/storage/v1/status';

function docker(args, env = process.env) {
  const result = execFileSync('docker', args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'pipe'] });
  return result.trim();
}

function inspect(container) {
  return JSON.parse(docker(['inspect', '--type', 'container', container]))[0];
}

function schemaRevision() {
  return docker(['exec', database, 'psql', '-U', 'postgres', '-Atc',
    "select id || ':' || name || ':' || hash from storage.migrations order by id"]);
}

async function isHealthy() {
  try {
    return (await fetch(statusUrl, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
}

const existing = inspect(name);
assert.equal(existing.Config.Labels['com.supabase.cli.project'], 'AvendAsesor');
assert.equal(inspect(database).Config.Labels['com.supabase.cli.project'], 'AvendAsesor');
assert.deepEqual(Object.keys(existing.NetworkSettings.Networks), [network]);
assert.equal(existing.Mounts.length, 1);
assert.equal(existing.Mounts[0].Name, name);
assert.equal(existing.Mounts[0].Destination, '/mnt');
const before = schemaRevision();
assert.match(before.split('\n').at(-1), /^72:drop-bucketid-objname-index:/u);

const settings = Object.fromEntries(existing.Config.Env.map((pair) => {
  const separator = pair.indexOf('=');
  return [pair.slice(0, separator), pair.slice(separator + 1)];
}));
let databaseUrl;
try {
  databaseUrl = new URL(settings.DATABASE_URL);
} catch {
  throw new Error('La conexión de Storage local no tiene una URL válida');
}
assert.equal(databaseUrl.hostname, database);
if (existing.Config.Image === newImage) {
  assert.equal(settings.DB_MIGRATIONS_FREEZE_AT, migration);
  assert.ok(existing.State.Running && await isHealthy(), 'Storage local no está saludable');
  console.log('Storage local ya utiliza la versión compatible y está saludable.');
  process.exit(0);
}

assert.equal(existing.Config.Image, oldImage);
const containers = docker(['ps', '-a', '--format', '{{.Names}}']).split(/\r?\n/u);
assert.ok(!containers.includes(backup), 'Existe un respaldo local de Storage');
docker(['image', 'inspect', newImage]);
for (const imageSetting of ['PATH', 'NODE_VERSION', 'YARN_VERSION', 'VERSION']) {
  delete settings[imageSetting];
}
settings.DB_MIGRATIONS_FREEZE_AT = migration;

let renamed = false;
let created = false;
try {
  if (existing.State.Running) docker(['stop', name]);
  docker(['rename', name, backup]);
  renamed = true;
  docker(['create', '--name', name, '--network', network, '--network-alias', 'storage',
    '--volumes-from', backup, '--restart', 'unless-stopped',
    '--health-cmd', 'wget -q -T 5 -O /dev/null http://127.0.0.1:5000/status',
    '--label', 'com.supabase.cli.project=AvendAsesor',
    '--label', 'com.docker.compose.project=AvendAsesor',
    ...Object.keys(settings).flatMap((key) => ['--env', key]), newImage],
    { ...process.env, ...settings });
  created = true;
  docker(['start', name]);
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt++) {
    ready = await isHealthy();
    if (!ready) await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(ready, 'Storage local no respondió al control de salud');
  assert.equal(schemaRevision(), before, 'Cambió el historial de migraciones de Storage');
  console.log('Storage local actualizado y saludable. Se conservó el contenedor anterior detenido.');
} catch {
  if (created) {
    if (inspect(name).State.Running) docker(['stop', name]);
    docker(['rename', name, `${name}_a08_failed_${Date.now()}`]);
  }
  if (renamed) docker(['rename', backup, name]);
  if (existing.State.Running && !inspect(name).State.Running) docker(['start', name]);
  console.error('No se pudo verificar Storage local. Se restauró el contenedor original.');
  process.exitCode = 1;
}
