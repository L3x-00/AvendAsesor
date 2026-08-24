[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [switch]$AcknowledgeLocalSecretCopy,

    [string]$CredentialPath = (Join-Path $PSScriptRoot '.local\\qa-pilot-credentials.clixml')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if (-not $AcknowledgeLocalSecretCopy) {
    throw 'Para copiar la contraseña QA al portapapeles local se requiere -AcknowledgeLocalSecretCopy.'
}

if (-not (Test-Path -LiteralPath $CredentialPath)) {
    throw 'No existe un almacén local protegido de credenciales QA.'
}

if (-not $PSCmdlet.ShouldProcess('Portapapeles local del usuario actual', 'Copiar contraseña temporal QA')) {
    return
}

$credential = Import-Clixml -LiteralPath $CredentialPath
if ($credential -isnot [System.Management.Automation.PSCredential]) {
    throw 'El almacén local de credenciales QA no tiene el formato esperado.'
}

$password = $credential.GetNetworkCredential().Password
if ([string]::IsNullOrWhiteSpace($password)) {
    throw 'El almacén local de credenciales QA no contiene una contraseña utilizable.'
}

Set-Clipboard -Value $password
Write-Output 'QA_PILOT_PASSWORD_COPIED_TO_LOCAL_CLIPBOARD'
