<#
.SYNOPSIS
  Phase A of the Pre-Boarding & Access Provisioning module.
  Creates two SharePoint lists on the Onboarding Tracker site:
    - ProvisioningRequests : one row per new-hire request (header + stage + approval + results)
    - ProvisioningTasks    : one row per setup item (PC, access card, key, cost centre...) with
                             its owning team and status. This is the fan-out checklist.
  Same Microsoft.Graph method as Create-OnboardingLists.ps1 (browser sign-in, no client id).
  ASCII only. Safe to re-run: skips lists/columns that already exist (client-side check).

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. (first time only) Install-Module Microsoft.Graph -Scope CurrentUser -Force
  3. .\Create-ProvisioningLists.ps1
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

# --- column helpers ---
function TextCol([string]$name, [bool]$multi = $false, [bool]$required = $false) {
    if ($multi) { @{ name = $name; required = $required; text = @{ allowMultipleLines = $true; textType = 'plain'; linesForEditing = 6 } } }
    else        { @{ name = $name; required = $required; text = @{ allowMultipleLines = $false; maxLength = 255 } } }
}
function NumCol([string]$name)  { @{ name = $name; number = @{ decimalPlaces = 'none' } } }
function BoolCol([string]$name) { @{ name = $name; boolean = @{} } }
function DateCol([string]$name) { @{ name = $name; dateTime = @{ format = 'dateOnly' } } }
function DtCol([string]$name)   { @{ name = $name; dateTime = @{ format = 'dateTime' } } }

function New-List([string]$name, [string]$desc, [array]$columns) {
    # client-side existence check (Graph ignores $filter on some endpoints)
    $all = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists?`$select=displayName&`$top=200"
    $names = @($all.value | ForEach-Object { $_.displayName })
    if ($names -contains $name) {
        Write-Host ("      - " + $name + " already exists, skipping.") -ForegroundColor Yellow
        return
    }
    $payload = @{ displayName = $name; description = $desc; list = @{ template = 'genericList' }; columns = $columns }
    $body = $payload | ConvertTo-Json -Depth 12 -Compress
    $created = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists" -Body $body -ContentType 'application/json'
    Write-Host ("      + Created " + $name + " (" + $columns.Count + " columns)") -ForegroundColor Green
}

Write-Host "[3/3] Creating lists..." -ForegroundColor Cyan

# ProvisioningRequests -- Title = new hire name
New-List 'ProvisioningRequests' 'New-hire pre-boarding / access provisioning requests.' @(
    (TextCol 'Position'),
    (TextCol 'Department'),
    (DateCol 'StartDate'),
    (TextCol 'ReplacementFor'),
    (TextCol 'DesiredUpn'),
    (TextCol 'LicenseType'),
    (TextCol 'Location'),
    (TextCol 'CostCentre'),
    (TextCol 'ManagerName'),
    (TextCol 'ManagerUpn'),
    (TextCol 'Stage'),
    (TextCol 'SubmittedByName'),
    (TextCol 'ApprovedByName'),
    (DtCol   'ApprovedAt'),
    (NumCol  'NewHireId'),
    (BoolCol 'AccountCreated'),
    (BoolCol 'LicenseAssigned'),
    (BoolCol 'TempPasswordSent'),
    (TextCol 'Notes' $true)
)

# ProvisioningTasks -- Title = the setup item label (e.g. "PC", "Access card")
New-List 'ProvisioningTasks' 'Per-request setup tasks, routed to each team.' @(
    (NumCol  'RequestId'),
    (TextCol 'HireName'),
    (TextCol 'Team'),
    (TextCol 'Status'),
    (TextCol 'DoneByName'),
    (DtCol   'DoneAt')
)

Write-Host ("`nDone - provisioning lists ready in " + $SiteHost + $SitePath + ".") -ForegroundColor Green
Disconnect-MgGraph | Out-Null
