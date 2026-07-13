<#
.SYNOPSIS
  Create the four SharePoint lists for the MAGMA Onboarding Tracker in one shot,
  via Microsoft Graph. Same method as the Reception system's Create-AppFeedbackList.ps1
  (no custom client id needed; it signs you in through the browser).

.HOW TO RUN
  1. Open PowerShell (regular, not admin)
  2. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  3. (First time only) Install-Module Microsoft.Graph -Scope CurrentUser -Force
  4. (First time only) Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
  5. .\Create-OnboardingLists.ps1

  Safe to re-run: it skips any list that already exists.
#>

$ErrorActionPreference = 'Stop'

# --- Config ---
$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'

if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
    Write-Host "[ERROR] Microsoft.Graph module not found." -ForegroundColor Red
    Write-Host "        Run: Install-Module Microsoft.Graph -Scope CurrentUser -Force" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/3] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Sites.Manage.All', 'Sites.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/3] Resolving site $SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
Write-Host ("      Site: " + $site.displayName) -ForegroundColor Green

# --- helpers to describe columns ---
function TextCol([string]$name, [bool]$multi = $false, [bool]$required = $false) {
    if ($multi) { @{ name = $name; required = $required; text = @{ allowMultipleLines = $true; textType = 'plain'; linesForEditing = 6 } } }
    else        { @{ name = $name; required = $required; text = @{ allowMultipleLines = $false; maxLength = 255 } } }
}
function NumCol([string]$name)    { @{ name = $name; number = @{ decimalPlaces = 'none' } } }
function BoolCol([string]$name)   { @{ name = $name; boolean = @{} } }
function DateCol([string]$name)   { @{ name = $name; dateTime = @{ format = 'dateOnly' } } }
function PersonCol([string]$name) { @{ name = $name; personOrGroup = @{ allowMultipleSelection = $false } } }

function New-OnboardingList([string]$name, [string]$desc, [array]$columns) {
    $existing = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists?`$filter=displayName eq '$name'"
    if ($existing.value -and $existing.value.Count -gt 0) {
        Write-Host ("      - " + $name + " already exists, skipping.") -ForegroundColor Yellow
        return
    }
    $payload = @{ displayName = $name; description = $desc; list = @{ template = 'genericList' }; columns = $columns }
    $body = $payload | ConvertTo-Json -Depth 12 -Compress
    $created = Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$($site.id)/lists" -Body $body -ContentType 'application/json'
    Write-Host ("      + Created " + $name + " (" + $columns.Count + " columns), id " + $created.id) -ForegroundColor Green
}

Write-Host "[3/3] Creating lists..." -ForegroundColor Cyan

# Departments (Title = display name)
New-OnboardingList 'Departments' 'Onboarding departments.' @(
    (TextCol 'Slug' $false $true),
    (TextCol 'Units' $true),
    (BoolCol 'Pending'),
    (TextCol 'IconSvg' $true)
)

# MilestoneTemplates (Title = milestone text)
New-OnboardingList 'MilestoneTemplates' 'Month 1-3 milestone templates per department.' @(
    (TextCol 'Department' $false $true),
    (NumCol  'Month'),
    (NumCol  'Sort'),
    (BoolCol 'OrgWide')
)

# NewHires (Title = new hire name)
New-OnboardingList 'NewHires' 'New hires onboarding.' @(
    (TextCol   'Position'),
    (TextCol   'Department' $false $true),
    (TextCol   'Unit'),
    (PersonCol 'Manager'),
    (DateCol   'StartDate'),
    (TextCol   'Ref'),
    (DateCol   'Review30'),
    (DateCol   'Review60'),
    (DateCol   'Review90')
)

# MilestoneCompletions (Title = <hireId>|<month>|<index>)
New-OnboardingList 'MilestoneCompletions' 'Per-hire milestone completion records.' @(
    (NumCol    'NewHireId'),
    (BoolCol   'Done'),
    (PersonCol 'CompletedBy'),
    (@{ name = 'CompletedAt'; dateTime = @{ format = 'dateTime' } })
)

Write-Host ("`nDone - four lists ready in " + $SiteHost + $SitePath + ".") -ForegroundColor Green
Disconnect-MgGraph | Out-Null
