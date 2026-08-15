[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$apiDirectory = Join-Path $repositoryRoot 'apps\api'
$testPort = 3013
$apiProcess = $null
$savedEnvironment = @{}
$environmentNames = @(
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WEB_ORIGIN',
    'NODE_ENV',
    'PORT',
    'AVEND_LOCAL_STATUS_BASE64'
)

function Set-ProcessEnvironment {
    param(
        [Parameter(Mandatory)]
        [object]$LocalStatus,
        [Parameter(Mandatory)]
        [string]$LocalStatusJson
    )

    foreach ($name in $environmentNames) {
        $savedEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
    }

    $env:SUPABASE_URL = $LocalStatus.API_URL.TrimEnd('/')
    $env:SUPABASE_SERVICE_ROLE_KEY = $LocalStatus.SERVICE_ROLE_KEY
    $env:WEB_ORIGIN = 'http://localhost:3000'
    $env:NODE_ENV = 'development'
    $env:PORT = $testPort
    $env:AVEND_LOCAL_STATUS_BASE64 = [Convert]::ToBase64String(
        [Text.Encoding]::UTF8.GetBytes($LocalStatusJson)
    )
}

function Restore-ProcessEnvironment {
    foreach ($name in $environmentNames) {
        if ($null -eq $savedEnvironment[$name]) {
            Remove-Item "Env:$name" -ErrorAction SilentlyContinue
        }
        else {
            [Environment]::SetEnvironmentVariable($name, $savedEnvironment[$name], 'Process')
        }
    }
}

Push-Location $repositoryRoot

try {
    $localStatusJson = (& supabase status --output json) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0) {
        throw 'Local Supabase is not running.'
    }

    $localStatus = $localStatusJson | ConvertFrom-Json
    $supabaseUrl = [Uri]$localStatus.API_URL
    if ($supabaseUrl.Host -notin @('localhost', '127.0.0.1')) {
        throw 'Local module API regression refuses a non-loopback Supabase URL.'
    }

    & npm run build --workspace=api
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Set-ProcessEnvironment -LocalStatus $localStatus -LocalStatusJson $localStatusJson
    $stdoutPath = Join-Path ([IO.Path]::GetTempPath()) "avend-modules-api-$PID.out.log"
    $stderrPath = Join-Path ([IO.Path]::GetTempPath()) "avend-modules-api-$PID.err.log"
    $existingListener = Get-NetTCPConnection -LocalPort $testPort -State Listen -ErrorAction SilentlyContinue
    if ($null -ne $existingListener) {
        throw "LOCAL_API_PORT_ALREADY_IN_USE:$($existingListener.OwningProcess)"
    }
    $apiProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $apiDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    Start-Sleep -Milliseconds 500
    $apiProcess.Refresh()
    if ($apiProcess.HasExited) {
        $stdout = if (Test-Path $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
        $stderr = if (Test-Path $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
        throw "LOCAL_API_START_EXITED:$($apiProcess.ExitCode) OUT=$stdout ERR=$stderr"
    }

@'
const status = JSON.parse(Buffer.from(process.env.AVEND_LOCAL_STATUS_BASE64, 'base64').toString('utf8'));
const { API_URL: supabaseUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey, MAILPIT_URL: mailboxUrl } = status;
const backendUrl = `http://127.0.0.1:${process.env.PORT}`;
const emailPrefix = 'avend-local-module-api-';
const suffix = Date.now();
const adminEmail = `${emailPrefix}admin-${suffix}@avend.local`;
const docenteEmail = `${emailPrefix}docente-${suffix}@avend.local`;
const password = 'AvendLocal!2026Modules';
let moduleId = null;
let stage = 'bootstrap';

async function response(url, options = {}) {
  const result = await fetch(url, options);
  const raw = await result.text();
  let body;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  return { body, result };
}

async function request(url, options = {}) {
  const { body, result } = await response(url, options);
  if (!result.ok) throw new Error(`HTTP_${result.status}`);
  return { body, result };
}

async function waitForBackend() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const result = await fetch(`${backendUrl}/health`).catch(() => null);
    if (result?.ok) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('LOCAL_API_START_TIMEOUT');
}

async function waitForConfirmationEmail(email) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const { body } = await request(`${mailboxUrl}/api/v1/messages?limit=100`);
    for (const message of body.messages ?? []) {
      const id = message.ID ?? message.id;
      if (!id) continue;
      const detail = await request(`${mailboxUrl}/api/v1/message/${id}`);
      const serialized = JSON.stringify(detail.body).replaceAll('&amp;', '&');
      if (serialized.includes(email) && serialized.toLowerCase().includes('confirm')) return serialized;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('LOCAL_EMAIL_TIMEOUT');
}

async function createConfirmedUser(email, role) {
  const signup = await request(`${supabaseUrl}/auth/v1/signup`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      password,
      data: { full_name: 'Local Modules API Regression' },
      options: { emailRedirectTo: 'http://localhost:3000/auth/callback?next=/auth/confirmed' },
    }),
  });
  const user = signup.body.user ?? signup.body;
  if (!user.id || signup.body.session?.access_token || user.email_confirmed_at) {
    throw new Error('UNEXPECTED_SIGNUP_RESPONSE');
  }

  const confirmationMail = await waitForConfirmationEmail(email);
  const candidates = confirmationMail.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
  const confirmationUrl = candidates.find((candidate) => candidate.includes('/auth/v1/verify'))?.replace(/\\/g, '');
  if (!confirmationUrl) throw new Error('NO_CONFIRMATION_URL');
  const confirmation = await fetch(confirmationUrl, { redirect: 'manual' });
  if (confirmation.status < 300 || confirmation.status > 399) {
    throw new Error(`CONFIRMATION_STATUS_${confirmation.status}`);
  }

  if (role !== 'docente') {
    await request(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
      method: 'PATCH',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ role }),
    });
  }

  const login = await request(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!login.body.access_token) throw new Error('NO_ACCESS_TOKEN');
  return login.body.access_token;
}

async function cleanTemporaryState() {
  if (moduleId) {
    await fetch(`${supabaseUrl}/rest/v1/modules?id=eq.${moduleId}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
  }

  const { body } = await request(`${supabaseUrl}/auth/v1/admin/users?page=1&per_page=100`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  for (const user of (body.users ?? []).filter((candidate) => typeof candidate.email === 'string' && candidate.email.startsWith(emailPrefix))) {
    const deleted = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!deleted.ok) throw new Error('LOCAL_TEST_USER_CLEANUP_FAILED');
  }
}

(async () => {
  let result = 'FAIL';
  let detail = '';
  try {
    stage = 'api-ready';
    await waitForBackend();
    stage = 'temporary-identities';
    const adminToken = await createConfirmedUser(adminEmail, 'admin');
    const docenteToken = await createConfirmedUser(docenteEmail, 'docente');

    stage = 'direct-data-api-denied';
    const directDataResponse = await fetch(`${supabaseUrl}/rest/v1/modules?select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${docenteToken}` },
    });
    if (directDataResponse.ok) throw new Error('DIRECT_MODULE_DATA_API_ACCESS_ALLOWED');

    stage = 'docente-denied';
    const docenteResponse = await fetch(`${backendUrl}/admin/modules`, {
      headers: { Authorization: `Bearer ${docenteToken}` },
    });
    if (docenteResponse.status !== 403) throw new Error(`DOCENTE_STATUS_${docenteResponse.status}`);

    stage = 'admin-create';
    const created = await request(`${backendUrl}/admin/modules`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        code: `F3_TEMP_${suffix}`,
        name: 'Módulo temporal Fase 3',
        sortOrder: 1,
      }),
    });
    moduleId = created.body.id;
    if (!moduleId || created.body.code !== `F3_TEMP_${suffix}`) throw new Error('CREATE_RESPONSE_INVALID');

    stage = 'admin-list';
    const listed = await request(`${backendUrl}/admin/modules?status=active`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (!Array.isArray(listed.body) || !listed.body.some((module) => module.id === moduleId)) {
      throw new Error('CREATED_MODULE_NOT_LISTED');
    }

    stage = 'admin-update';
    await request(`${backendUrl}/admin/modules/${moduleId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ description: 'Actualización temporal de regresión' }),
    });
    await request(`${backendUrl}/admin/modules/${moduleId}/position`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sortOrder: 2 }),
    });

    stage = 'admin-deactivate';
    await request(`${backendUrl}/admin/modules/${moduleId}/status`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isActive: false, reason: 'Desactivación temporal de regresión' }),
    });

    stage = 'admin-logical-delete';
    const deleted = await fetch(`${backendUrl}/admin/modules/${moduleId}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Eliminación temporal de regresión' }),
    });
    if (deleted.status !== 204) throw new Error(`DELETE_STATUS_${deleted.status}`);

    stage = 'deleted-hidden';
    const hidden = await fetch(`${backendUrl}/admin/modules/${moduleId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    if (hidden.status !== 404) throw new Error(`DELETED_MODULE_STATUS_${hidden.status}`);

    result = 'PASS';
  } catch (error) {
    detail = ` STAGE=${stage} CODE=${error.message}`;
  } finally {
    try {
      await cleanTemporaryState();
      console.log('LOCAL_MODULE_API_CLEANUP=PASS');
    } catch {
      console.log('LOCAL_MODULE_API_CLEANUP=FAIL');
      result = 'FAIL';
      detail = ' STAGE=cleanup';
    }
  }
  console.log(`LOCAL_MODULES_API_REGRESSION=${result}${detail}`);
  if (result !== 'PASS') process.exitCode = 1;
})();
'@ | node -

    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }
}
finally {
    if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
    }
    Restore-ProcessEnvironment
    Pop-Location
}
