<#
.SYNOPSIS
  Grants the MAGMA-Automation managed identity the SharePoint app-only role Sites.FullControl.All,
  so a runbook can connect to a user's OneDrive (a SharePoint personal site) via PnP.PowerShell
  and add the manager as a site collection admin during offboarding.
  Microsoft.Graph module. ASCII only. Safe to re-run (skips if already granted).

.HOW TO RUN
  1. Open a FRESH PowerShell window (no Az / no prior session).
  2. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  3. .\Grant-AutomationSharePointRights.ps1
#>

$ErrorActionPreference = 'Stop'
$MiName   = 'MAGMA-Automation'                                # the Automation Account's system-assigned MI
$SpoAppId = '00000003-0000-0ff1-ce00-000000000000'           # SharePoint Online (fixed, all tenants)
$RoleName = 'Sites.FullControl.All'

Write-Host "[1/4] Signing in to Graph..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Application.Read.All','AppRoleAssignment.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/4] Finding the managed identity + SharePoint service principal..." -ForegroundColor Cyan
$mi  = Get-MgServicePrincipal -Filter "displayName eq '$MiName'"
if (-not $mi) { Write-Host "[ERROR] Managed identity '$MiName' not found." -ForegroundColor Red; exit 1 }
$spo = Get-MgServicePrincipal -Filter "appId eq '$SpoAppId'"
if (-not $spo) { Write-Host "[ERROR] SharePoint Online service principal not found in tenant." -ForegroundColor Red; exit 1 }
$role = $spo.AppRoles | Where-Object { $_.Value -eq $RoleName -and $_.AllowedMemberTypes -contains 'Application' }
if (-not $role) { Write-Host "[ERROR] App role '$RoleName' not found on SharePoint SP." -ForegroundColor Red; exit 1 }
Write-Host ("      MI object id: " + $mi.Id) -ForegroundColor Green

Write-Host "[3/4] Checking existing assignments..." -ForegroundColor Cyan
$already = Get-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $mi.Id |
    Where-Object { $_.ResourceId -eq $spo.Id -and $_.AppRoleId -eq $role.Id }

Write-Host "[4/4] Granting $RoleName ..." -ForegroundColor Cyan
if ($already) {
    Write-Host "      - Already granted, skipping." -ForegroundColor Yellow
} else {
    New-MgServicePrincipalAppRoleAssignment -ServicePrincipalId $mi.Id `
        -PrincipalId $mi.Id -ResourceId $spo.Id -AppRoleId $role.Id | Out-Null
    Write-Host "      + $RoleName granted to $MiName" -ForegroundColor Green
}

Write-Host "`nDone. SharePoint app-only permissions can take up to ~1 hour to propagate." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
