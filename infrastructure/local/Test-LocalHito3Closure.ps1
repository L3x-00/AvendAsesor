[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$expectedLocalApiPort = 55321
$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

function Assert-RequiredCommand {
    param([Parameter(Mandatory)][string]$Name)

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "HITO3_CLOSURE_REQUIRED_COMMAND_MISSING:$Name"
    }
}

function Assert-LocalSupabase {
    $statusJson = (& supabase status --output json) -join [Environment]::NewLine
    if ($LASTEXITCODE -ne 0) {
        throw 'HITO3_CLOSURE_LOCAL_SUPABASE_NOT_RUNNING'
    }

    $status = $statusJson | ConvertFrom-Json
    $apiUrl = [Uri]$status.API_URL
    if ($apiUrl.Host -notin @('localhost', '127.0.0.1')) {
        throw 'HITO3_CLOSURE_REFUSES_NON_LOOPBACK_SUPABASE'
    }

    if ($apiUrl.Port -ne $expectedLocalApiPort) {
        throw "HITO3_CLOSURE_UNEXPECTED_SUPABASE_PORT:$($apiUrl.Port)"
    }
}

function Assert-RequiredFiles {
    param([Parameter(Mandatory)][string[]]$Paths)

    foreach ($path in $Paths) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            throw "HITO3_CLOSURE_REQUIRED_FILE_MISSING:$path"
        }
    }
}

function Invoke-CheckedCommand {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][scriptblock]$Command
    )

    Write-Output "HITO3_CLOSURE_STAGE=$Name"
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "HITO3_CLOSURE_STAGE_FAILED:$Name"
    }
}

Push-Location $repositoryRoot

try {
    foreach ($command in @('supabase', 'node', 'npm', 'git')) {
        Assert-RequiredCommand -Name $command
    }

    Assert-LocalSupabase
    Assert-RequiredFiles -Paths @(
        '.\supabase\tests\database\hito3_rag_foundation_test.sql',
        '.\supabase\tests\database\hito3_chat_execution_contract_test.sql',
        '.\apps\api\src\chat\chat.service.spec.ts',
        '.\apps\api\src\rag\prompt.builder.spec.ts',
        '.\apps\web\src\components\chat\chat-panel.spec.tsx',
        '.\apps\web\src\app\api\chat\stream\route.spec.ts'
    )

    Invoke-CheckedCommand -Name 'database-contracts' -Command {
        & supabase test db --local
    }
    Invoke-CheckedCommand -Name 'database-advisors' -Command {
        & supabase db advisors --local --fail-on warn
    }
    Invoke-CheckedCommand -Name 'local-migration-history' -Command {
        & supabase migration list --local
    }
    Invoke-CheckedCommand -Name 'api-coverage-and-chat-contracts' -Command {
        & npm run test:cov --workspace=api
    }
    Invoke-CheckedCommand -Name 'web-coverage-and-chat-bff' -Command {
        & npm run test:cov --workspace=web
    }
    Invoke-CheckedCommand -Name 'api-e2e-authorization-and-sse' -Command {
        & npm run test:e2e --workspace=api
    }
    Invoke-CheckedCommand -Name 'workspace-typecheck' -Command {
        & npm run typecheck
    }
    Invoke-CheckedCommand -Name 'workspace-lint' -Command {
        & npm run lint
    }
    Invoke-CheckedCommand -Name 'production-build' -Command {
        & npm run build
    }
    Invoke-CheckedCommand -Name 'production-dependency-audit' -Command {
        & npm audit --omit=dev --audit-level=high
    }
    Invoke-CheckedCommand -Name 'diff-hygiene' -Command {
        & git diff --check
    }

    Write-Output 'HITO3_LOCAL_ACCEPTANCE=PASS'
}
finally {
    Pop-Location
}
