<#
.SYNOPSIS
  Grants the MAGMA-Automation account's system-assigned managed identity the rights it needs to
  run Exchange Online PowerShell app-only (for offboarding: Set-Mailbox -Type Shared, Add-MailboxPermission):
    1. the Exchange.ManageAsApp application permission (Office 365 Exchange Online)
    2. the Exchange Administrator directory role
  Run this AFTER the Automation Account has finished deploying (so its managed identity exists).
  Microsoft.Graph module. ASCII only. Safe to re-run.

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. .\Grant-AutomationExchangeRights.ps1
#>

$ErrorActionPreference = 'Stop'
$MiName   = 'MAGMA-Automation'                       # the Automation Account (its managed identity shares the name)
$ExoAppId = '00000002-0000-0ff1-ce00-000000000000'  # Office 365 Exchange Online (fixed)

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
    Write-Host "[ERROR] Microsoft.Graph module not found. Run: Install-Module Microsoft.Graph -Scope CurrentUser -Force" -ForegroundColor Red
    exit 1
}

Write-Host "[1/5] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Application.Read.All', 'AppRoleAssignment.ReadWrite.All', 'RoleManagement.ReadWrite.Directory' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/5] Finding the managed identity '$MiName'..." -ForegroundColor Cyan
$mi = Get-MgServicePrincipal -Filter "displayName eq '$MiName'"
if (-not $mi) {
    Write-Host "[ERROR] Managed identity '$MiName' not found. Has the Automation Account finished deploying?" -ForegroundColor Red
    exit 1
}
Write-Host ("      MI object id: " + $mi.Id) -ForegroundColor Green

Write-Host "[3/5] Finding the Office 365 Exchange Online service principal + app role..." -ForegroundColor Cyan
$exo = Get-MgServicePrincipal -Filter "appId eq '$ExoAppId'"
$role = $exo.AppRoles | Where-Object { $_.Value -eq 'Exchange.ManageAsApp' }
if (-not $role) { Write-Host "[ERROR] Exchange.ManageAsApp app role not found." -ForegroundColor Red; exit 1 }

Write-Host "[4/5] Granting Exchange.ManageAsApp app role to the identity..." -ForegroundColor Cyan
$existing = Get-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $mi.Id | Where-Object { $_.AppRoleId -eq $role.Id -and $_.ResourceId -eq $exo.Id }
if ($existing) {
    Write-Host "      - Already granted, skipping." -ForegroundColor Yellow
} else {
    New-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $mi.Id -PrincipalId $mi.Id -ResourceId $exo.Id -AppRoleId $role.Id | Out-Null
    Write-Host "      + Exchange.ManageAsApp granted." -ForegroundColor Green
}

Write-Host "[5/5] Assigning the Exchange Administrator directory role to the identity..." -ForegroundColor Cyan
$roleDef = Get-MgRoleManagementDirectoryRoleDefinition -Filter "displayName eq 'Exchange Administrator'"
$already = Get-MgRoleManagementDirectoryRoleAssignment -Filter "principalId eq '$($mi.Id)' and roleDefinitionId eq '$($roleDef.Id)'"
if ($already) {
    Write-Host "      - Already assigned, skipping." -ForegroundColor Yellow
} else {
    New-MgRoleManagementDirectoryRoleAssignment -PrincipalId $mi.Id -RoleDefinitionId $roleDef.Id -DirectoryScopeId "/" | Out-Null
    Write-Host "      + Exchange Administrator assigned." -ForegroundColor Green
}

Write-Host "`nDone. The MAGMA-Automation identity can now run Exchange Online PowerShell app-only." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
