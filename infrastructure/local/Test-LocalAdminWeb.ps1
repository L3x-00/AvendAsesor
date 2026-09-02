[CmdletBinding()]
param(
    [ValidateRange(1024, 65535)]
    [int]$ApiPort = 3015,
    [ValidateRange(1024, 65535)]
    [int]$WebPort = 3016
)

$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$apiDirectory = Join-Path $repositoryRoot 'apps\api'
$webDirectory = Join-Path $repositoryRoot 'apps\web'
$apiPort = $ApiPort
$webPort = $WebPort
$apiProcess = $null
$webProcess = $null
$savedEnvironment = @{}
$environmentNames = @(
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WEB_ORIGIN',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'ADMIN_API_URL',
    'APP_URL',
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
    $env:WEB_ORIGIN = "http://localhost:$webPort"
    $env:NEXT_PUBLIC_SUPABASE_URL = $LocalStatus.API_URL.TrimEnd('/')
    $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $LocalStatus.ANON_KEY
    $env:ADMIN_API_URL = "http://localhost:$apiPort"
    $env:APP_URL = "http://localhost:$webPort"
    $env:NODE_ENV = 'development'
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

function Assert-PortAvailable {
    param(
        [Parameter(Mandatory)]
        [int]$Port
    )

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if ($null -ne $listener) {
        throw "LOCAL_TEST_PORT_ALREADY_IN_USE:$Port/$($listener.OwningProcess)"
    }
}

function Wait-ForUrl {
    param(
        [Parameter(Mandatory)]
        [string]$Url,
        [Parameter(Mandatory)]
        [string]$Name
    )

    for ($attempt = 0; $attempt -lt 60; $attempt += 1) {
        & curl.exe --silent --fail --noproxy '*' --max-time 2 --output NUL $Url
        if ($LASTEXITCODE -eq 0) {
            return
        }

        Start-Sleep -Milliseconds 500
    }

    throw "LOCAL_$Name`_START_TIMEOUT"
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
        throw 'Local admin web regression refuses a non-loopback Supabase URL.'
    }

    Assert-PortAvailable -Port $apiPort
    Assert-PortAvailable -Port $webPort

    & npm run build --workspace=api
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    & npm run build --workspace=web
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

    Set-ProcessEnvironment -LocalStatus $localStatus -LocalStatusJson $localStatusJson
    $env:PORT = $apiPort
    $apiStdout = Join-Path ([IO.Path]::GetTempPath()) "avend-admin-web-api-$PID.out.log"
    $apiStderr = Join-Path ([IO.Path]::GetTempPath()) "avend-admin-web-api-$PID.err.log"
    $apiProcess = Start-Process -FilePath 'node' -ArgumentList 'dist/main.js' -WorkingDirectory $apiDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $apiStdout -RedirectStandardError $apiStderr
    Wait-ForUrl -Url "http://localhost:$apiPort/health" -Name 'API'

    $env:NODE_ENV = 'production'
    $env:PORT = $webPort
    $webStdout = Join-Path ([IO.Path]::GetTempPath()) "avend-admin-web-web-$PID.out.log"
    $webStderr = Join-Path ([IO.Path]::GetTempPath()) "avend-admin-web-web-$PID.err.log"
    $nextCli = Join-Path $repositoryRoot 'node_modules\next\dist\bin\next'
    $webProcess = Start-Process -FilePath 'node' -ArgumentList $nextCli, 'start', '-p', $webPort -WorkingDirectory $webDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput $webStdout -RedirectStandardError $webStderr
    Wait-ForUrl -Url "http://localhost:$webPort/auth/sign-in" -Name 'WEB'

@'
const { createServerClient } = require('@supabase/ssr');

const status = JSON.parse(Buffer.from(process.env.AVEND_LOCAL_STATUS_BASE64, 'base64').toString('utf8'));
const { API_URL: supabaseUrl, ANON_KEY: anonKey, SERVICE_ROLE_KEY: serviceRoleKey, MAILPIT_URL: mailboxUrl } = status;
const webUrl = `http://localhost:${process.env.PORT}`;
const emailPrefix = 'avend-local-admin-web-';
const suffix = Date.now();
const password = 'AvendLocal!2026AdminWeb';
const emails = {
  admin: `${emailPrefix}admin-${suffix}@avend.local`,
  docente: `${emailPrefix}docente-${suffix}@avend.local`,
  superadmin: `${emailPrefix}superadmin-${suffix}@avend.local`,
};
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
      data: { full_name: 'Local Admin Web Regression' },
      options: { emailRedirectTo: `${webUrl}/auth/callback?next=/admin` },
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
  if (!login.body.access_token || !login.body.refresh_token) throw new Error('NO_LOGIN_SESSION');
  return login.body;
}

async function createSessionCookie(session) {
  const writes = [];
  const serverClient = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => [],
      setAll: (entries) => writes.push(...entries),
    },
  });
  const { error } = await serverClient.auth.setSession({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  });
  if (error || writes.length === 0) throw new Error('SESSION_COOKIE_NOT_CREATED');
  return writes.map(({ name, value }) => `${name}=${value}`).join('; ');
}

async function assertRoute(path, cookie, expectedStatus, expectedLocation = null) {
  const result = await fetch(`${webUrl}${path}`, {
    headers: cookie ? { Cookie: cookie } : {},
    redirect: 'manual',
  });
  const body = await result.text();
  const streamedRedirect = result.status === 200
    && expectedLocation
    && body.includes(expectedLocation)
    && (body.includes('__next-page-redirect') || body.includes('NEXT_REDIRECT'));
  if (result.status !== expectedStatus && !streamedRedirect) {
    throw new Error(`${path}_STATUS_${result.status}`);
  }
  if (streamedRedirect) return;
  if (expectedLocation && result.headers.get('location') !== expectedLocation) {
    throw new Error(`${path}_LOCATION_${result.headers.get('location') ?? 'NONE'}`);
  }
}

async function cleanTemporaryUsers() {
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
    stage = 'temporary-identities';
    const adminSession = await createConfirmedUser(emails.admin, 'admin');
    const docenteSession = await createConfirmedUser(emails.docente, 'docente');
    const superadminSession = await createConfirmedUser(emails.superadmin, 'superadmin');
    const adminCookie = await createSessionCookie(adminSession);
    const docenteCookie = await createSessionCookie(docenteSession);
    const superadminCookie = await createSessionCookie(superadminSession);

    stage = 'unauthenticated-guard';
    await assertRoute('/admin/modules', null, 307, '/auth/sign-in');

    stage = 'admin-bff-pages';
    await assertRoute('/admin', adminCookie, 200);
    await assertRoute('/admin/modules', adminCookie, 200);
    await assertRoute('/admin/documents', adminCookie, 200);
    await assertRoute('/admin/users', adminCookie, 307, '/access-denied');

    stage = 'superadmin-users-page';
    await assertRoute('/admin/users', superadminCookie, 200);
    await assertRoute('/admin/users?group=staff&status=active&search=Local&page=1', superadminCookie, 200);

    stage = 'docente-guard';
    await assertRoute('/admin/modules', docenteCookie, 307, '/access-denied');

    result = 'PASS';
  } catch (error) {
    detail = ` STAGE=${stage} CODE=${error.message}`;
  } finally {
    try {
      await cleanTemporaryUsers();
      console.log('LOCAL_ADMIN_WEB_CLEANUP=PASS');
    } catch {
      console.log('LOCAL_ADMIN_WEB_CLEANUP=FAIL');
      result = 'FAIL';
      detail = ' STAGE=cleanup';
    }
  }
  console.log(`LOCAL_ADMIN_WEB_REGRESSION=${result}${detail}`);
  if (result !== 'PASS') process.exitCode = 1;
})();
'@ | node -

    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
finally {
    if ($null -ne $webProcess -and -not $webProcess.HasExited) {
        Stop-Process -Id $webProcess.Id -ErrorAction SilentlyContinue
    }
    if ($null -ne $apiProcess -and -not $apiProcess.HasExited) {
        Stop-Process -Id $apiProcess.Id -ErrorAction SilentlyContinue
    }
    Restore-ProcessEnvironment
    Pop-Location
}
