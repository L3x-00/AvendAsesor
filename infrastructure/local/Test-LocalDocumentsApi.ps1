[CmdletBinding()]
param(
    [switch]$ResetAfter
)

$ErrorActionPreference = 'Stop'
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$apiDirectory = Join-Path $repositoryRoot 'apps\api'
$testPort = 3014
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
        throw 'Local document API regression refuses a non-loopback Supabase URL.'
    }

    & npm run build --workspace=api
    if ($LASTEXITCODE -ne 0) {
        exit $LASTEXITCODE
    }

    Set-ProcessEnvironment -LocalStatus $localStatus -LocalStatusJson $localStatusJson
    $stdoutPath = Join-Path ([IO.Path]::GetTempPath()) "avend-documents-api-$PID.out.log"
    $stderrPath = Join-Path ([IO.Path]::GetTempPath()) "avend-documents-api-$PID.err.log"
    $existingListener = Get-NetTCPConnection -LocalPort $testPort -State Listen -ErrorAction SilentlyContinue
    if ($null -ne $existingListener) {
        throw "LOCAL_DOCUMENT_API_PORT_ALREADY_IN_USE:$($existingListener.OwningProcess)"
    }
    $apiProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $apiDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
    Start-Sleep -Milliseconds 500
    $apiProcess.Refresh()
    if ($apiProcess.HasExited) {
        $stdout = if (Test-Path $stdoutPath) { Get-Content -LiteralPath $stdoutPath -Raw } else { '' }
        $stderr = if (Test-Path $stderrPath) { Get-Content -LiteralPath $stderrPath -Raw } else { '' }
        throw "LOCAL_DOCUMENT_API_START_EXITED:$($apiProcess.ExitCode) OUT=$stdout ERR=$stderr"
    }

@'
const status = JSON.parse(Buffer.from(process.env.AVEND_LOCAL_STATUS_BASE64, 'base64').toString('utf8'));
const { API_URL: supabaseUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey, MAILPIT_URL: mailboxUrl } = status;
const backendUrl = `http://127.0.0.1:${process.env.PORT}`;
const emailPrefix = 'avend-local-document-api-';
const suffix = Date.now();
const adminEmail = `${emailPrefix}admin-${suffix}@avend.local`;
const docenteEmail = `${emailPrefix}docente-${suffix}@avend.local`;
const password = 'AvendLocal!2026Documents';
const pdfBase64 = 'JVBERi0xLjQKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPj4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUmVzb3VyY2VzIDw8Pj4KPj4KZW5kb2JqCnhyZWYKMCA0CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKdHJhaWxlcgo8PAovU2l6ZSA0Ci9Sb290IDEgMCBSCj4+CnN0YXJ0eHJlZgoyMDUKJSVFT0Y=';
const pdfBytes = Buffer.from(pdfBase64, 'base64');
let moduleAId = null;
let moduleBId = null;
let documentId = null;
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
      data: { full_name: 'Local Documents API Regression' },
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

function authHeaders(token, additional = {}) {
  return { Authorization: `Bearer ${token}`, ...additional };
}

function pdfForm(title, moduleIds = []) {
  const form = new FormData();
  form.set('documentType', 'LEY');
  form.set('issuanceYear', String(new Date().getFullYear()));
  form.set('issuingEntity', 'MINEDU');
  form.set('specificDependency', 'DIGEDD');
  form.set('title', title);
  form.set('metadata', JSON.stringify({ regression: 'local' }));
  form.set('moduleIds', JSON.stringify(moduleIds));
  form.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'norma.pdf');
  return form;
}

async function cleanTemporaryUsersAndModules() {
  if (moduleBId) {
    await fetch(`${supabaseUrl}/rest/v1/modules?id=eq.${moduleBId}`, {
      method: 'DELETE',
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
  }
  if (moduleAId) {
    await fetch(`${supabaseUrl}/rest/v1/modules?id=eq.${moduleAId}`, {
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
    const directData = await fetch(`${supabaseUrl}/rest/v1/documents?select=id`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${docenteToken}` },
    });
    if (directData.ok) throw new Error('DIRECT_DOCUMENT_DATA_API_ACCESS_ALLOWED');
    const directStorage = await fetch(`${supabaseUrl}/storage/v1/object/normative-documents/direct.pdf`, {
      method: 'POST',
      headers: { ...authHeaders(docenteToken), apikey: anonKey, 'Content-Type': 'application/pdf' },
      body: pdfBytes,
    });
    if (directStorage.ok) throw new Error('DIRECT_DOCUMENT_STORAGE_ACCESS_ALLOWED');

    stage = 'docente-api-denied';
    const docenteResponse = await fetch(`${backendUrl}/admin/documents`, {
      headers: authHeaders(docenteToken),
    });
    if (docenteResponse.status !== 403) throw new Error(`DOCENTE_STATUS_${docenteResponse.status}`);

    stage = 'admin-modules';
    const moduleA = await request(`${backendUrl}/admin/modules`, {
      method: 'POST',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code: `F4_A_${suffix}`, name: 'Fase 4 temporary module A' }),
    });
    moduleAId = moduleA.body.id;
    const moduleB = await request(`${backendUrl}/admin/modules`, {
      method: 'POST',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ code: `F4_B_${suffix}`, name: 'Fase 4 temporary module B' }),
    });
    moduleBId = moduleB.body.id;

    stage = 'admin-create-document';
    const created = await request(`${backendUrl}/admin/documents`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: pdfForm('Local document regression', [moduleAId]),
    });
    documentId = created.body.id;
    if (!documentId || !created.body.currentVersionId) throw new Error('CREATE_DOCUMENT_RESPONSE_INVALID');

    stage = 'document-details-private';
    const details = await request(`${backendUrl}/admin/documents/${documentId}`, {
      headers: authHeaders(adminToken),
    });
    if (details.body.versions?.length !== 1 || JSON.stringify(details.body).includes('storagePath')) {
      throw new Error('DOCUMENT_DETAILS_PRIVACY_OR_VERSION_INVALID');
    }

    stage = 'document-version';
    const newVersionForm = new FormData();
    newVersionForm.set('file', new Blob([pdfBytes], { type: 'application/pdf' }), 'norma-v2.pdf');
    const versioned = await request(`${backendUrl}/admin/documents/${documentId}/versions`, {
      method: 'POST',
      headers: authHeaders(adminToken),
      body: newVersionForm,
    });
    if (!versioned.body.currentVersionId || versioned.body.currentVersionId === created.body.currentVersionId) {
      throw new Error('DOCUMENT_VERSION_NOT_REPLACED');
    }

    stage = 'document-module-links';
    const linked = await fetch(`${backendUrl}/admin/documents/${documentId}/modules`, {
      method: 'POST',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ moduleId: moduleBId }),
    });
    if (linked.status !== 204) throw new Error(`LINK_STATUS_${linked.status}`);
    const unlinkedB = await fetch(`${backendUrl}/admin/documents/${documentId}/modules/${moduleBId}`, {
      method: 'DELETE',
      headers: authHeaders(adminToken),
    });
    if (unlinkedB.status !== 204) throw new Error(`UNLINK_B_STATUS_${unlinkedB.status}`);

    stage = 'document-update-and-archive';
    await request(`${backendUrl}/admin/documents/${documentId}`, {
      method: 'PATCH',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ title: 'Local document regression updated', metadata: { regression: 'updated' } }),
    });
    const archived = await request(`${backendUrl}/admin/documents/${documentId}/situation`, {
      method: 'PATCH',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        archiveReasonCode: 'DUPLICATE',
        observation: 'Local regression deactivation',
        situation: 'archived',
      }),
    });
    if (archived.body.situation !== 'archived' || archived.body.publicationStatus !== 'inactive') {
      throw new Error('ARCHIVE_RESPONSE_INVALID');
    }

    stage = 'document-signed-download';
    const signed = await request(`${backendUrl}/admin/documents/${documentId}/download-url`, {
      method: 'POST',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({}),
    });
    if (!signed.body.url || signed.body.url.includes('/object/public/')) {
      throw new Error('SIGNED_URL_INVALID');
    }
    const download = await fetch(signed.body.url);
    if (!download.ok || (await download.arrayBuffer()).byteLength !== pdfBytes.length) {
      throw new Error('SIGNED_DOWNLOAD_FAILED');
    }
    const downloadAudit = await request(
      `${supabaseUrl}/rest/v1/document_audit_events?document_id=eq.${documentId}&action=eq.download_url_generated&select=document_version_id,actor_id`,
      {
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (
      downloadAudit.body.length !== 1 ||
      downloadAudit.body[0].document_version_id !== signed.body.versionId
    ) {
      throw new Error('SIGNED_DOWNLOAD_AUDIT_MISSING');
    }

    stage = 'document-logical-delete';
    const deleted = await fetch(`${backendUrl}/admin/documents/${documentId}`, {
      method: 'DELETE',
      headers: authHeaders(adminToken, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reason: 'Local regression logical deletion' }),
    });
    if (deleted.status !== 204) throw new Error(`DELETE_STATUS_${deleted.status}`);
    const hidden = await fetch(`${backendUrl}/admin/documents/${documentId}`, {
      headers: authHeaders(adminToken),
    });
    if (hidden.status !== 404) throw new Error(`DELETED_DOCUMENT_STATUS_${hidden.status}`);

    result = 'PASS';
  } catch (error) {
    detail = ` STAGE=${stage} CODE=${error.message}`;
  } finally {
    try {
      await cleanTemporaryUsersAndModules();
      console.log('LOCAL_DOCUMENT_API_AUTH_AND_MODULE_CLEANUP=PASS');
    } catch {
      console.log('LOCAL_DOCUMENT_API_AUTH_AND_MODULE_CLEANUP=FAIL');
      result = 'FAIL';
      detail = ' STAGE=cleanup';
    }
  }
  console.log(`LOCAL_DOCUMENTS_API_REGRESSION=${result}${detail}`);
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

    if ($ResetAfter) {
        & supabase db reset --local
        if ($LASTEXITCODE -ne 0) {
            exit $LASTEXITCODE
        }
        Write-Output 'LOCAL_DOCUMENT_API_RESET_AFTER=PASS'
    }
}
