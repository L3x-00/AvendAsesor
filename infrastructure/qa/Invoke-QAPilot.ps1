[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
    [ValidateSet('Plan', 'Apply', 'Cleanup')]
    [string]$Mode = 'Plan',

    [switch]$AcknowledgeProductionQaPilot,

    [string]$ProjectRef = 'blxrdotroysitfyehmqw',

    [string]$CredentialPath = (Join-Path $PSScriptRoot '.local\\qa-pilot-credentials.clixml')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$pilotId = 'hito4-qa-pilot-20260824'
$titlePrefix = 'QA PILOT 20260824 - '
$apiBaseUrl = "https://$ProjectRef.supabase.co"

$pilotUsers = @(
    [pscustomobject]@{
        Email = 'qa-docente-hito4-20260824@avend.invalid'
        FullName = 'QA Piloto Docente Ficticia'
        Role = 'docente'
    },
    [pscustomobject]@{
        Email = 'qa-admin-hito4-20260824@avend.invalid'
        FullName = 'QA Piloto Administracion Ficticia'
        Role = 'admin'
    },
    [pscustomobject]@{
        Email = 'qa-superadmin-hito4-20260824@avend.invalid'
        FullName = 'QA Piloto Superadministracion Ficticia'
        Role = 'superadmin'
    }
)

$pilotModules = @(
    [pscustomobject]@{ Code = 'QA_CONTRATO_DESPLAZAMIENTO'; Name = 'Contrato y desplazamiento'; SortOrder = 10 },
    [pscustomobject]@{ Code = 'QA_EVALUACION_DOCENTE'; Name = 'Evaluacion docente'; SortOrder = 20 },
    [pscustomobject]@{ Code = 'QA_SITUACIONES_ADMIN'; Name = 'Situaciones administrativas'; SortOrder = 30 },
    [pscustomobject]@{ Code = 'QA_AUXILIAR_EDUCACION'; Name = 'Auxiliar de educacion'; SortOrder = 40 },
    [pscustomobject]@{ Code = 'QA_LEY_REGLAMENTO'; Name = 'Ley y reglamento'; SortOrder = 50 },
    [pscustomobject]@{ Code = 'QA_CARGOS_PLAZAS'; Name = 'Cargos y plazas'; SortOrder = 60 },
    [pscustomobject]@{ Code = 'QA_REMUNERACIONES'; Name = 'Remuneraciones'; SortOrder = 70 }
)

$pilotConversations = @(
    [pscustomobject]@{
        ModuleCode = 'QA_SITUACIONES_ADMIN'
        Title = "${titlePrefix}Licencia ficticia"
        UserPrompt = 'SIMULACION QA: consulta ficticia sobre una licencia de ejemplo.'
    },
    [pscustomobject]@{
        ModuleCode = 'QA_EVALUACION_DOCENTE'
        Title = "${titlePrefix}Evaluacion ficticia"
        UserPrompt = 'SIMULACION QA: consulta ficticia sobre una evaluacion de ejemplo.'
    },
    [pscustomobject]@{
        ModuleCode = 'QA_CONTRATO_DESPLAZAMIENTO'
        Title = "${titlePrefix}Desplazamiento ficticio"
        UserPrompt = 'SIMULACION QA: consulta ficticia de desplazamiento.'
    },
    [pscustomobject]@{
        ModuleCode = 'QA_REMUNERACIONES'
        Title = "${titlePrefix}Remuneracion ficticia"
        UserPrompt = 'SIMULACION QA: consulta ficticia de remuneracion.'
    }
)

function Get-QAPilotSecret {
    $secret = [Environment]::GetEnvironmentVariable('SUPABASE_QA_PILOT_SECRET_KEY')

    if ([string]::IsNullOrWhiteSpace($secret) -or -not $secret.StartsWith('sb_secret_', [System.StringComparison]::Ordinal)) {
        throw 'SUPABASE_QA_PILOT_SECRET_KEY debe contener una clave actual sb_secret_ exclusiva para esta operacion. No se admite una clave legacy service_role.'
    }

    return $secret
}

function New-QAPilotPassword {
    $alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%*-_'
    $characters = @('A', 'a', '2', '!')

    for ($index = $characters.Count; $index -lt 28; $index++) {
        $characters += $alphabet[[System.Security.Cryptography.RandomNumberGenerator]::GetInt32($alphabet.Length)]
    }

    for ($index = $characters.Count - 1; $index -gt 0; $index--) {
        $swapIndex = [System.Security.Cryptography.RandomNumberGenerator]::GetInt32($index + 1)
        $swap = $characters[$index]
        $characters[$index] = $characters[$swapIndex]
        $characters[$swapIndex] = $swap
    }

    return -join $characters
}

function Get-QAPilotCredential {
    param(
        [Parameter(Mandatory)] [string]$Path,
        [switch]$CreateIfMissing
    )

    if (Test-Path -LiteralPath $Path) {
        $credential = Import-Clixml -LiteralPath $Path
        if ($credential -isnot [System.Management.Automation.PSCredential]) {
            throw 'El almacén local de credenciales QA no tiene el formato esperado.'
        }

        if ([string]::IsNullOrWhiteSpace($credential.GetNetworkCredential().Password)) {
            throw 'El almacén local de credenciales QA no contiene una contraseña utilizable.'
        }

        return $credential
    }

    if (-not $CreateIfMissing) {
        throw 'Existen cuentas QA marcadas, pero falta su almacén local protegido. No se restablecerán contraseñas automáticamente.'
    }

    $directory = Split-Path -Parent $Path
    if ([string]::IsNullOrWhiteSpace($directory)) {
        throw 'La ruta del almacén local QA debe incluir un directorio.'
    }

    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $securePassword = ConvertTo-SecureString -String (New-QAPilotPassword) -AsPlainText -Force
    $credential = [System.Management.Automation.PSCredential]::new($pilotId, $securePassword)
    $credential | Export-Clixml -LiteralPath $Path -Force

    return $credential
}

function New-SupabaseHeaders {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [hashtable]$AdditionalHeaders = @{}
    )

    $headers = @{
        apikey = $Secret
        Accept = 'application/json'
        'User-Agent' = 'avend-qa-pilot/1.0 (server-side controlled operation)'
    }

    foreach ($entry in $AdditionalHeaders.GetEnumerator()) {
        $headers[$entry.Key] = $entry.Value
    }

    return $headers
}

function Invoke-SupabaseJson {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] [ValidateSet('GET', 'POST', 'PATCH', 'DELETE')] [string]$Method,
        [Parameter(Mandatory)] [string]$Path,
        [object]$Body = $null,
        [hashtable]$AdditionalHeaders = @{}
    )

    $parameters = @{
        Uri = "$apiBaseUrl$Path"
        Method = $Method
        Headers = New-SupabaseHeaders -Secret $Secret -AdditionalHeaders $AdditionalHeaders
        ErrorAction = 'Stop'
        SkipHttpErrorCheck = $true
    }

    if ($null -ne $Body) {
        $parameters['ContentType'] = 'application/json'
        $parameters['Body'] = $Body | ConvertTo-Json -Depth 8 -Compress
    }

    $response = Invoke-WebRequest @parameters
    if ($response.StatusCode -lt 200 -or $response.StatusCode -ge 300) {
        throw "La solicitud Supabase $Method $Path respondio HTTP $($response.StatusCode)."
    }

    if ([string]::IsNullOrWhiteSpace($response.Content)) {
        return $null
    }

    return $response.Content | ConvertFrom-Json
}

function ConvertTo-QueryValue {
    param([Parameter(Mandatory)] [string]$Value)

    return [System.Uri]::EscapeDataString($Value)
}

function Get-AuthUsers {
    param([Parameter(Mandatory)] [string]$Secret)

    $result = Invoke-SupabaseJson -Secret $Secret -Method 'GET' -Path '/auth/v1/admin/users?page=1&per_page=1000'
    if ($null -eq $result -or $null -eq $result.users) {
        return @()
    }

    return @($result.users)
}

function Get-QAPilotUserMarker {
    param([Parameter(Mandatory)] $User)

    $metadata = $User.user_metadata
    if ($null -eq $metadata) {
        return $null
    }

    $property = $metadata.PSObject.Properties['qa_pilot_id']
    if ($null -eq $property) {
        return $null
    }

    return [string]$property.Value
}

function Assert-QAPilotUserMarker {
    param(
        [Parameter(Mandatory)] $User,
        [Parameter(Mandatory)] [string]$Email
    )

    if ((Get-QAPilotUserMarker -User $User) -ne $pilotId) {
        throw "La cuenta QA existente $Email no tiene el marcador esperado y no se modificará ni eliminará."
    }
}

function Get-Profile {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] [string]$UserId
    )

    $rows = @(Invoke-SupabaseJson -Secret $Secret -Method 'GET' -Path "/rest/v1/profiles?id=eq.$(ConvertTo-QueryValue $UserId)&select=id,full_name,role,account_status")
    return $rows | Select-Object -First 1
}

function Ensure-QAUser {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] $Definition,
        [Parameter(Mandatory)] [object[]]$ExistingUsers,
        [Parameter(Mandatory)] [System.Management.Automation.PSCredential]$Credential
    )

    $existing = $ExistingUsers | Where-Object { $_.email -ieq $Definition.Email } | Select-Object -First 1
    $created = $false

    if ($null -eq $existing) {
        $payload = @{
            email = $Definition.Email
            password = $Credential.GetNetworkCredential().Password
            email_confirm = $true
            user_metadata = @{
                full_name = $Definition.FullName
                qa_pilot_id = $pilotId
                fictitious = $true
            }
        }
        $existing = Invoke-SupabaseJson -Secret $Secret -Method 'POST' -Path '/auth/v1/admin/users' -Body $payload
        $created = $true
    } else {
        Assert-QAPilotUserMarker -User $existing -Email $Definition.Email
    }

    if ($null -eq $existing.id) {
        throw "La cuenta QA $($Definition.Email) no devolvio un identificador."
    }

    $profile = Get-Profile -Secret $Secret -UserId ([string]$existing.id)
    if ($null -eq $profile) {
        throw "No se creo el perfil de la cuenta QA $($Definition.Email)."
    }

    if ($profile.role -ne $Definition.Role) {
        if (-not $created) {
            throw "La cuenta QA existente $($Definition.Email) tiene un rol inesperado y no se sobrescribira."
        }

        $profile = @(Invoke-SupabaseJson -Secret $Secret -Method 'PATCH' -Path "/rest/v1/profiles?id=eq.$(ConvertTo-QueryValue ([string]$existing.id))" -Body @{ role = $Definition.Role } -AdditionalHeaders @{ Prefer = 'return=representation' }) | Select-Object -First 1
    }

    return [pscustomobject]@{
        Id = [string]$existing.id
        Email = $Definition.Email
        Role = $Definition.Role
        Created = $created
    }
}

function Get-ModuleByCode {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] [string]$Code
    )

    $rows = @(Invoke-SupabaseJson -Secret $Secret -Method 'GET' -Path "/rest/v1/modules?code=eq.$(ConvertTo-QueryValue $Code)&select=id,code,metadata")
    return $rows | Select-Object -First 1
}

function Get-QAPilotMarker {
    param([object]$Metadata)

    if ($null -eq $Metadata) {
        return $null
    }

    $property = $Metadata.PSObject.Properties['qa_pilot_id']
    if ($null -eq $property) {
        return $null
    }

    return [string]$property.Value
}

function Ensure-QAModule {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] $Definition,
        [Parameter(Mandatory)] [string]$ActorId
    )

    $existing = Get-ModuleByCode -Secret $Secret -Code $Definition.Code
    if ($null -ne $existing) {
        if ((Get-QAPilotMarker -Metadata $existing.metadata) -ne $pilotId) {
            throw "El codigo de modulo $($Definition.Code) ya pertenece a datos no QA y no se modificara."
        }

        return [pscustomobject]@{ Id = [string]$existing.id; Code = $Definition.Code; Created = $false }
    }

    $payload = @{
        code = $Definition.Code
        name = $Definition.Name
        description = "Modulo de demostracion completamente ficticio para $pilotId."
        sort_order = $Definition.SortOrder
        metadata = @{
            qa_pilot_id = $pilotId
            fictitious = $true
            purpose = 'visual_read_only_pilot'
        }
        is_active = $true
        created_by = $ActorId
        updated_by = $ActorId
    }

    $created = @(Invoke-SupabaseJson -Secret $Secret -Method 'POST' -Path '/rest/v1/modules?select=id,code' -Body $payload -AdditionalHeaders @{ Prefer = 'return=representation' }) | Select-Object -First 1
    if ($null -eq $created.id) {
        throw "El modulo QA $($Definition.Code) no devolvio un identificador."
    }

    return [pscustomobject]@{ Id = [string]$created.id; Code = $Definition.Code; Created = $true }
}

function Get-ConversationByTitle {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] [string]$UserId,
        [Parameter(Mandatory)] [string]$Title
    )

    $path = "/rest/v1/chat_conversations?user_id=eq.$(ConvertTo-QueryValue $UserId)&title=eq.$(ConvertTo-QueryValue $Title)&select=id,title"
    $rows = @(Invoke-SupabaseJson -Secret $Secret -Method 'GET' -Path $path)
    return $rows | Select-Object -First 1
}

function Ensure-QAConversation {
    param(
        [Parameter(Mandatory)] [string]$Secret,
        [Parameter(Mandatory)] $Definition,
        [Parameter(Mandatory)] [string]$UserId,
        [Parameter(Mandatory)] [string]$ModuleId
    )

    $conversation = Get-ConversationByTitle -Secret $Secret -UserId $UserId -Title $Definition.Title
    $createdConversation = $false

    if ($null -eq $conversation) {
        $conversation = @(Invoke-SupabaseJson -Secret $Secret -Method 'POST' -Path '/rest/v1/chat_conversations?select=id,title' -Body @{
                user_id = $UserId
                selected_module_id = $ModuleId
                title = $Definition.Title
            } -AdditionalHeaders @{ Prefer = 'return=representation' }) | Select-Object -First 1
        $createdConversation = $true
    }

    if ($null -eq $conversation.id) {
        throw "La conversacion QA $($Definition.Title) no devolvio un identificador."
    }

    $messages = @(Invoke-SupabaseJson -Secret $Secret -Method 'GET' -Path "/rest/v1/chat_messages?conversation_id=eq.$(ConvertTo-QueryValue ([string]$conversation.id))&select=id,role,content")
    $createdMessages = 0

    $existingPrompt = $messages | Where-Object { $_.role -eq 'user' -and $_.content -eq $Definition.UserPrompt } | Select-Object -First 1
    if ($null -eq $existingPrompt) {
        [void](Invoke-SupabaseJson -Secret $Secret -Method 'POST' -Path '/rest/v1/chat_messages' -Body @{
                conversation_id = [string]$conversation.id
                role = 'user'
                content = $Definition.UserPrompt
            } -AdditionalHeaders @{ Prefer = 'return=minimal' })
        $createdMessages++
    }

    return [pscustomobject]@{
        Id = [string]$conversation.id
        Title = $Definition.Title
        Created = $createdConversation
        CreatedMessages = $createdMessages
    }
}

function Remove-QAPilotData {
    param([Parameter(Mandatory)] [string]$Secret)

    $deletedMessages = 0
    $deletedConversations = 0
    $deletedModules = 0
    $deletedUsers = 0
    $allUsers = Get-AuthUsers -Secret $Secret
    $qaUsers = @($allUsers | Where-Object { $_.email -in $pilotUsers.Email })

    foreach ($qaUser in $qaUsers) {
        Assert-QAPilotUserMarker -User $qaUser -Email ([string]$qaUser.email)
    }

    foreach ($qaUser in $qaUsers) {
        $conversations = @(Invoke-SupabaseJson -Secret $Secret -Method 'GET' -Path "/rest/v1/chat_conversations?user_id=eq.$(ConvertTo-QueryValue ([string]$qaUser.id))&select=id,title") |
            Where-Object { $_.title -like "$titlePrefix*" }

        foreach ($conversation in $conversations) {
            [void](Invoke-SupabaseJson -Secret $Secret -Method 'DELETE' -Path "/rest/v1/chat_messages?conversation_id=eq.$(ConvertTo-QueryValue ([string]$conversation.id))" -AdditionalHeaders @{ Prefer = 'return=representation' })
            $deletedMessages++
            [void](Invoke-SupabaseJson -Secret $Secret -Method 'DELETE' -Path "/rest/v1/chat_conversations?id=eq.$(ConvertTo-QueryValue ([string]$conversation.id))" -AdditionalHeaders @{ Prefer = 'return=representation' })
            $deletedConversations++
        }
    }

    $modules = @(Invoke-SupabaseJson -Secret $Secret -Method 'GET' -Path '/rest/v1/modules?select=id,metadata') |
        Where-Object { (Get-QAPilotMarker -Metadata $_.metadata) -eq $pilotId }

    foreach ($module in $modules) {
        [void](Invoke-SupabaseJson -Secret $Secret -Method 'DELETE' -Path "/rest/v1/modules?id=eq.$(ConvertTo-QueryValue ([string]$module.id))" -AdditionalHeaders @{ Prefer = 'return=representation' })
        $deletedModules++
    }

    foreach ($qaUser in $qaUsers) {
        [void](Invoke-SupabaseJson -Secret $Secret -Method 'DELETE' -Path "/auth/v1/admin/users/$($qaUser.id)" -AdditionalHeaders @{ Prefer = 'return=minimal' })
        $deletedUsers++
    }

    return [pscustomobject]@{
        pilotId = $pilotId
        deletedMessages = $deletedMessages
        deletedConversations = $deletedConversations
        deletedModules = $deletedModules
        deletedUsers = $deletedUsers
    }
}

if ($Mode -eq 'Plan') {
    [pscustomobject]@{
        pilotId = $pilotId
        projectRef = $ProjectRef
        users = $pilotUsers.Count
        modules = $pilotModules.Count
        conversations = $pilotConversations.Count
        excludes = @('documents', 'storage', 'pdfs', 'rag_provider', 'ingestion', 'sources', 'unanswered_questions', 'reviews', 'operational_audit_events')
        cleanup = 'Solo elimina conversaciones con prefijo QA, modulos con qa_pilot_id y usuarios QA exactos.'
    } | ConvertTo-Json -Depth 5
    return
}

if (-not $AcknowledgeProductionQaPilot) {
    throw 'Para escribir o limpiar datos en produccion se requiere -AcknowledgeProductionQaPilot.'
}

if (-not $PSCmdlet.ShouldProcess("Supabase production $ProjectRef", "$Mode datos QA ficticios $pilotId")) {
    return
}

$secret = Get-QAPilotSecret

if ($Mode -eq 'Cleanup') {
    Remove-QAPilotData -Secret $secret | ConvertTo-Json -Depth 4
    return
}

$allUsers = Get-AuthUsers -Secret $secret
$existingQaUsers = @($allUsers | Where-Object { $_.email -in $pilotUsers.Email })
foreach ($qaUser in $existingQaUsers) {
    Assert-QAPilotUserMarker -User $qaUser -Email ([string]$qaUser.email)
}
$qaCredential = Get-QAPilotCredential -Path $CredentialPath -CreateIfMissing:($existingQaUsers.Count -eq 0)
$resolvedUsers = @()
foreach ($definition in $pilotUsers) {
    $resolvedUsers += Ensure-QAUser -Secret $secret -Definition $definition -ExistingUsers $allUsers -Credential $qaCredential
    $allUsers = Get-AuthUsers -Secret $secret
}

$superadmin = $resolvedUsers | Where-Object { $_.Role -eq 'superadmin' } | Select-Object -First 1
if ($null -eq $superadmin) {
    throw 'No se pudo resolver la cuenta SUPERADMIN QA requerida para la trazabilidad de modulos.'
}

$resolvedModules = @()
foreach ($definition in $pilotModules) {
    $resolvedModules += Ensure-QAModule -Secret $secret -Definition $definition -ActorId $superadmin.Id
}

$docente = $resolvedUsers | Where-Object { $_.Role -eq 'docente' } | Select-Object -First 1
$moduleMap = @{}
foreach ($module in $resolvedModules) {
    $moduleMap[$module.Code] = $module.Id
}

$resolvedConversations = @()
foreach ($definition in $pilotConversations) {
    $resolvedConversations += Ensure-QAConversation -Secret $secret -Definition $definition -UserId $docente.Id -ModuleId $moduleMap[$definition.ModuleCode]
}

[pscustomobject]@{
    pilotId = $pilotId
    usersCreated = @($resolvedUsers | Where-Object Created).Count
    usersExisting = @($resolvedUsers | Where-Object { -not $_.Created }).Count
    modulesCreated = @($resolvedModules | Where-Object Created).Count
    modulesExisting = @($resolvedModules | Where-Object { -not $_.Created }).Count
    conversationsCreated = @($resolvedConversations | Where-Object Created).Count
    messagesCreated = @($resolvedConversations | Measure-Object -Property CreatedMessages -Sum).Sum
    credentialStore = 'local_dpapi'
    excludes = @('unanswered_questions', 'unanswered_question_reviews', 'operational_audit_events')
} | ConvertTo-Json -Depth 5
