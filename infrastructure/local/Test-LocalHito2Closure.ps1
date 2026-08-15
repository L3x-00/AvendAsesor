[CmdletBinding()]
param(
    [switch]$AllowLocalReset
)

$ErrorActionPreference = 'Stop'
$expectedLocalApiPort = 55321

if (-not $AllowLocalReset) {
    throw 'LOCAL_RESET_CONFIRMATION_REQUIRED: rerun with -AllowLocalReset after confirming that only the AVEND local Supabase database may be reset.'
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Assert-LocalSupabase {
    $statusJson = (& supabase status --output json) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0) {
        throw 'LOCAL_SUPABASE_NOT_RUNNING'
    }

    $status = $statusJson | ConvertFrom-Json
    $apiUrl = [Uri]$status.API_URL
    if ($apiUrl.Host -notin @('localhost', '127.0.0.1')) {
        throw 'LOCAL_CLOSURE_REFUSES_NON_LOOPBACK_SUPABASE'
    }

    if ($apiUrl.Port -ne $expectedLocalApiPort) {
        throw "LOCAL_CLOSURE_UNEXPECTED_SUPABASE_PORT:$($apiUrl.Port)"
    }
}

function Assert-RequiredFiles {
    param(
        [Parameter(Mandatory)]
        [string[]]$Paths
    )

    foreach ($path in $Paths) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "LOCAL_CLOSURE_REQUIRED_FILE_MISSING:$path"
        }
    }
}

function Assert-RequiredCommands {
    foreach ($name in @('supabase', 'node', 'npm', 'git', 'Get-NetTCPConnection')) {
        if ($null -eq (Get-Command $name -ErrorAction SilentlyContinue)) {
            throw "LOCAL_CLOSURE_REQUIRED_COMMAND_MISSING:$name"
        }
    }
}

function Find-FreeWebPorts {
    for ($apiPort = 3030; $apiPort -le 3090; $apiPort += 2) {
        $webPort = $apiPort + 1
        try {
            $listeners = Get-NetTCPConnection -LocalPort $apiPort, $webPort -State Listen -ErrorAction Stop
        }
        catch {
            if ($_.FullyQualifiedErrorId -eq 'CmdletizationQuery_NotFound,Get-NetTCPConnection') {
                $listeners = @()
            }
            else {
                throw "LOCAL_CLOSURE_PORT_QUERY_FAILED:$($_.FullyQualifiedErrorId)"
            }
        }

        if (@($listeners).Count -eq 0) {
            return [pscustomobject]@{ ApiPort = $apiPort; WebPort = $webPort }
        }
    }

    throw 'LOCAL_CLOSURE_NO_FREE_WEB_PORT_PAIR'
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)]
        [string]$Name,
        [Parameter(Mandatory)]
        [scriptblock]$Command
    )

    Write-Output "HITO2_CLOSURE_STAGE=$Name"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "HITO2_CLOSURE_STAGE_FAILED:$Name"
    }
}

function Assert-NoPersistentHito2Data {
@'
const { execFileSync } = require('node:child_process');
const status = JSON.parse(execFileSync('powershell.exe', [
  '-NoProfile',
  '-Command',
  'supabase status --output json',
], {
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'ignore'],
}));
const { API_URL: apiUrl, SERVICE_ROLE_KEY: serviceRoleKey } = status;
const tables = ['modules', 'documents', 'document_versions', 'document_modules', 'document_audit_events'];

async function assertEmptyTable(table) {
  const response = await fetch(`${apiUrl}/rest/v1/${table}?select=*&limit=1`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!response.ok) throw new Error(`TABLE_QUERY_${table}_${response.status}`);
  const rows = await response.json();
  if (Array.isArray(rows) && rows.length > 0) throw new Error(`PERSISTENT_ROWS_${table}`);
}

async function assertEmptyBucket() {
  const response = await fetch(`${apiUrl}/storage/v1/object/list/normative-documents`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 1, offset: 0, prefix: '' }),
  });
  if (!response.ok) throw new Error(`BUCKET_QUERY_${response.status}`);
  const objects = await response.json();
  if (Array.isArray(objects) && objects.length > 0) throw new Error('PERSISTENT_STORAGE_OBJECTS');
}

(async () => {
  for (const table of tables) await assertEmptyTable(table);
  await assertEmptyBucket();
  console.log('HITO2_CLOSURE_EMPTY_STATE=PASS');
})().catch((error) => {
  console.error(`HITO2_CLOSURE_EMPTY_STATE=FAIL:${error.message}`);
  process.exitCode = 1;
});
'@ | node -

    if ($LASTEXITCODE -ne 0) {
        throw 'HITO2_CLOSURE_EMPTY_STATE_FAILED'
    }
}

Push-Location $repositoryRoot

try {
    Assert-RequiredCommands
    Assert-LocalSupabase
    Assert-RequiredFiles -Paths @(
        '.\infrastructure\local\Test-LocalAuthRls.ps1',
        '.\infrastructure\local\Test-LocalDocumentSecurity.ps1',
        '.\infrastructure\local\Test-LocalModulesApi.ps1',
        '.\infrastructure\local\Test-LocalDocumentsApi.ps1',
        '.\infrastructure\local\Test-LocalAdminWeb.ps1'
    )
    $webPorts = Find-FreeWebPorts

    Invoke-CheckedCommand -Name 'database-contracts' -Command {
        & supabase test db --local
    }
    Invoke-CheckedCommand -Name 'database-advisors' -Command {
        & supabase db advisors --local
    }
    Invoke-CheckedCommand -Name 'migration-history' -Command {
        & supabase migration list --local
    }
    Invoke-CheckedCommand -Name 'hito1-auth-rls-regression' -Command {
        & '.\infrastructure\local\Test-LocalAuthRls.ps1'
    }
    Invoke-CheckedCommand -Name 'direct-document-security-regression' -Command {
        & '.\infrastructure\local\Test-LocalDocumentSecurity.ps1'
    }
    Invoke-CheckedCommand -Name 'module-acceptance-ca04' -Command {
        & '.\infrastructure\local\Test-LocalModulesApi.ps1'
    }
    Invoke-CheckedCommand -Name 'document-acceptance-ca05' -Command {
        & '.\infrastructure\local\Test-LocalDocumentsApi.ps1' -ResetAfter
    }
    Invoke-CheckedCommand -Name 'empty-state-after-ca05-reset' -Command {
        Assert-NoPersistentHito2Data
    }
    Invoke-CheckedCommand -Name 'administrative-web-boundary' -Command {
        & '.\infrastructure\local\Test-LocalAdminWeb.ps1' -ApiPort $webPorts.ApiPort -WebPort $webPorts.WebPort
    }
    Invoke-CheckedCommand -Name 'empty-local-hito2-state' -Command {
        Assert-NoPersistentHito2Data
    }
    Invoke-CheckedCommand -Name 'coverage' -Command {
        & npm run test:coverage
    }
    Invoke-CheckedCommand -Name 'project-health' -Command {
        & '.\.ai-shared\scripts\ai-status.ps1' -RunProjectChecks
    }
    Invoke-CheckedCommand -Name 'dependency-audit' -Command {
        & npm audit --omit=dev --audit-level=high
    }
    Invoke-CheckedCommand -Name 'diff-hygiene' -Command {
        & git diff --check
    }

    Write-Output 'HITO2_LOCAL_ACCEPTANCE=PASS'
}
finally {
    Pop-Location
}
