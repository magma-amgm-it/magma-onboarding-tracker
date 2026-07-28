<#
.SYNOPSIS
  Adds the Unit column to ProvisioningRequests (dept sub-unit, e.g. RAP / CMS / AC).
  Same Microsoft.Graph method as the other scripts. ASCII only. Safe to re-run.

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. .\Add-ProvisioningColumns.ps1
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
    $all = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/columns?`$top=200"
    $names = @($all.value | ForEach-Object { $_.name })
    if ($names -contains $colName) {
        Write-Host ("      - " + $listName + "." + $colName + " already exists, skipping.") -ForegroundColor Yellow
        return
    }
    $payload = @{ name = $colName; text = @{ allowMultipleLines = $false; maxLength = 255 } }
    $body = $payload | ConvertTo-Json -Depth 6 -Compress
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/columns" -Body $body -ContentType 'application/json' | Out-Null
    Write-Host ("      + Added " + $listName + "." + $colName) -ForegroundColor Green
}

Write-Host "[3/3] Adding columns..." -ForegroundColor Cyan
Add-TextColumn 'ProvisioningRequests' 'Unit'
Add-TextColumn 'ProvisioningTasks'    'Detail'

Write-Host "`nDone." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
