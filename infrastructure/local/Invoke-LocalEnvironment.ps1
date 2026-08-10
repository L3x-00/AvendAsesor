[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('api', 'web')]
    [string]$Target,

    [Parameter(Mandatory, ValueFromRemainingArguments)]
    [string[]]$Command
)

$ErrorActionPreference = 'Stop'

function Assert-LoopbackUrl {
    param(
        [Parameter(Mandatory)]
        [string]$Value,

        [Parameter(Mandatory)]
        [string]$Name
    )

    $url = [Uri]$Value
    if ($url.Host -notin @('localhost', '127.0.0.1')) {
        throw "$Name must point to the local Supabase stack."
    }

    return $url.AbsoluteUri.TrimEnd('/')
}

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\\..')).Path
Push-Location $repositoryRoot

try {
    $localStatus = & supabase status --output json | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0) {
        throw 'Local Supabase is not running. Start it before using this command.'
    }

    $apiUrl = Assert-LoopbackUrl -Value $localStatus.API_URL -Name 'API_URL'

    switch ($Target) {
        'api' {
            $env:SUPABASE_URL = $apiUrl
            $env:SUPABASE_SERVICE_ROLE_KEY = $localStatus.SERVICE_ROLE_KEY
            $env:WEB_ORIGIN = 'http://localhost:3000'
            $env:NODE_ENV = 'development'
            $env:PORT = '3001'
        }
        'web' {
            $env:NEXT_PUBLIC_SUPABASE_URL = $apiUrl
            $env:NEXT_PUBLIC_SUPABASE_ANON_KEY = $localStatus.ANON_KEY
            $env:APP_URL = 'http://localhost:3000'
            $env:NODE_ENV = 'development'
        }
    }

    & $Command[0] $Command[1..($Command.Count - 1)]
    exit $LASTEXITCODE
}
finally {
    Pop-Location
}
