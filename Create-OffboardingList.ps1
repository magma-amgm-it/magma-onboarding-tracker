<#
.SYNOPSIS
  Creates the Offboarding list. HR submits a leaver + their manager; the MAGMA Offboarding flow
  (IT approves) then blocks sign-in, shares the leaver's OneDrive, runs the Offboard-Mailbox runbook
  (mailbox -> shared + delegate to manager), and removes the licence.
  Microsoft.Graph module. ASCII only. Safe to re-run (skips if the list exists).

.HOW TO RUN
  1. Open a FRESH PowerShell window (no Az / no prior Microsoft.Graph session).
  2. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  3. .\Create-OffboardingList.ps1
#>

$ErrorActionPreference = 'Stop'
$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'
$ListName = 'Offboarding'

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
            @{ name = 'LeaverUpn';       text = @{ allowMultipleLines = $false; maxLength = 255 } },
            @{ name = 'ManagerName';     text = @{ allowMultipleLines = $false; maxLength = 255 } },
            @{ name = 'ManagerUpn';      text = @{ allowMultipleLines = $false; maxLength = 255 } },
            @{ name = 'LeaveDate';       dateTime = @{ format = 'dateOnly' } },
            @{ name = 'Notes';           text = @{ allowMultipleLines = $true } },
            @{ name = 'Stage';           text = @{ allowMultipleLines = $false; maxLength = 64 } },
            @{ name = 'ApprovedByName';  text = @{ allowMultipleLines = $false; maxLength = 255 } },
            @{ name = 'ApprovedAt';      dateTime = @{ format = 'dateTime' } },
            @{ name = 'SignInBlocked';   boolean = @{} },
            @{ name = 'OneDriveShared';  boolean = @{} },
            @{ name = 'MailboxConverted'; boolean = @{} },
            @{ name = 'LicenseRemoved';  boolean = @{} }
        )
    }
    $body = $payload | ConvertTo-Json -Depth 8
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists" -Body $body -ContentType 'application/json' | Out-Null
    Write-Host ("      + Created list " + $ListName) -ForegroundColor Green
}

Write-Host "`nDone." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
