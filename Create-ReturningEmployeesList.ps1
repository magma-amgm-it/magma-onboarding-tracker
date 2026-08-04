<#
.SYNOPSIS
  Creates the ReturningEmployees list (returning-from-leave reboarding).
  HR adds a row when someone is coming back; the "MAGMA Returning Employee" flow
  then unblocks their sign-in and emails IT/Facilities/icare to reactivate access.
  Microsoft.Graph module. ASCII only. Safe to re-run (skips if the list exists).

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. .\Create-ReturningEmployeesList.ps1
#>

$ErrorActionPreference = 'Stop'
$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'
$ListName = 'ReturningEmployees'

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
    Write-Host "[ERROR] Microsoft.Graph module not found. Run: Install-Module Microsoft.Graph -Scope CurrentUser -Force" -ForegroundColor Red
    exit 1
}

Write-Host "[1/3] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Sites.Manage.All', 'Sites.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/3] Resolving site $SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
$sid = $site.id

Write-Host "[3/3] Creating list '$ListName' ..." -ForegroundColor Cyan
$existing = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists?`$filter=displayName eq '$ListName'"
if ($existing.value.Count -gt 0) {
    Write-Host "      - List already exists, skipping create." -ForegroundColor Yellow
} else {
    $payload = @{
        displayName = $ListName
        list        = @{ template = 'genericList' }
        columns     = @(
            @{ name = 'Upn';        text = @{ allowMultipleLines = $false; maxLength = 255 } },
            @{ name = 'ReturnDate'; dateTime = @{ format = 'dateOnly' } },
            @{ name = 'Notes';      text = @{ allowMultipleLines = $true } }
        )
    }
    $body = $payload | ConvertTo-Json -Depth 8
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists" -Body $body -ContentType 'application/json' | Out-Null
    Write-Host ("      + Created list " + $ListName + " (Title, Upn, ReturnDate, Notes)") -ForegroundColor Green
}

Write-Host "`nDone." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
