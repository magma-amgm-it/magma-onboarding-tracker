<#
.SYNOPSIS
  Adds the DisableTiming choice column to the existing Offboarding list.
  Choices: "Immediately" (default) or "End of last working day".
  The MAGMA Offboarding flow reads this to decide whether to run at once or wait
  until 4:30 PM Atlantic on the LeaveDate before disabling the account.
  Microsoft.Graph module. ASCII only. Safe to re-run (skips if the column exists).

.HOW TO RUN
  1. Open a FRESH PowerShell window (no Az / no prior Microsoft.Graph session).
  2. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  3. .\Add-OffboardingTimingColumn.ps1
#>

$ErrorActionPreference = 'Stop'
$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'
$ListName = 'Offboarding'
$ColName  = 'DisableTiming'

Write-Host "[1/4] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Sites.Manage.All', 'Sites.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/4] Resolving site $SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
$sid = $site.id

Write-Host "[3/4] Resolving list '$ListName' ..." -ForegroundColor Cyan
$list = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists?`$filter=displayName eq '$ListName'"
if ($list.value.Count -eq 0) { Write-Host "[ERROR] List '$ListName' not found. Run Create-OffboardingList.ps1 first." -ForegroundColor Red; exit 1 }
$lid = $list.value[0].id

Write-Host "[4/4] Adding column '$ColName' ..." -ForegroundColor Cyan
$cols = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/columns?`$filter=name eq '$ColName'"
if ($cols.value.Count -gt 0) {
    Write-Host "      - Column already exists, skipping." -ForegroundColor Yellow
} else {
    $payload = @{
        name         = $ColName
        defaultValue = @{ value = 'Immediately' }
        choice       = @{
            choices   = @('Immediately', 'End of last working day')
            displayAs = 'dropDownMenu'
        }
    }
    $body = $payload | ConvertTo-Json -Depth 8
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/columns" -Body $body -ContentType 'application/json' | Out-Null
    Write-Host ("      + Added column " + $ColName) -ForegroundColor Green
}

Write-Host "`nDone." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
