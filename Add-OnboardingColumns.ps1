<#
.SYNOPSIS
  Phase 3 schema top-up. Adds the plain-text columns the app writes to, so we avoid
  SharePoint person-field lookups (which need User-Information-List ids, painful via Graph).
  Adds to NewHires:            ManagerName, ManagerUpn, HireUpn
  Adds to MilestoneCompletions: CompletedByName
  Same Microsoft.Graph method as Create-OnboardingLists.ps1 (browser sign-in, no client id).
  ASCII only (Windows PowerShell reads .ps1 as ANSI). Safe to re-run: skips existing columns.

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. .\Add-OnboardingColumns.ps1
#>

$ErrorActionPreference = 'Stop'

$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'

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

function Add-TextColumn([string]$listName, [string]$colName) {
    $existing = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/columns?`$filter=name eq '$colName'"
    if ($existing.value -and $existing.value.Count -gt 0) {
        Write-Host ("      - " + $listName + "." + $colName + " already exists, skipping.") -ForegroundColor Yellow
        return
    }
    $payload = @{ name = $colName; text = @{ allowMultipleLines = $false; maxLength = 255 } }
    $body = $payload | ConvertTo-Json -Depth 6 -Compress
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/columns" -Body $body -ContentType 'application/json' | Out-Null
    Write-Host ("      + Added " + $listName + "." + $colName) -ForegroundColor Green
}

Write-Host "[3/3] Adding columns..." -ForegroundColor Cyan
Add-TextColumn 'NewHires'             'ManagerName'
Add-TextColumn 'NewHires'             'ManagerUpn'
Add-TextColumn 'NewHires'             'HireUpn'
Add-TextColumn 'NewHires'             'CompletedNotified'
Add-TextColumn 'MilestoneCompletions' 'CompletedByName'

Write-Host "`nDone - schema ready for the app." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
