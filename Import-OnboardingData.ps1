<#
.SYNOPSIS
  Import the Departments + MilestoneTemplates seed data into the Onboarding Tracker site.
  Reads onboarding-seed.json (UTF-8) so em-dashes / apostrophes survive; the script itself
  is pure ASCII (Windows PowerShell reads .ps1 as ANSI, so keep it ASCII).

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. (First time only) Install-Module Microsoft.Graph -Scope CurrentUser -Force
  3. .\Import-OnboardingData.ps1

  Idempotent: if a list already has items, it is skipped (so you don't get duplicates).
  To re-seed, clear the list in SharePoint first, then re-run.
#>

$ErrorActionPreference = 'Stop'

$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'
$SeedFile = Join-Path $PSScriptRoot 'onboarding-seed.json'

if (-not (Test-Path $SeedFile)) {
    Write-Host "[ERROR] onboarding-seed.json not found next to this script." -ForegroundColor Red
    exit 1
}
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
    Write-Host "[ERROR] Microsoft.Graph module not found. Run: Install-Module Microsoft.Graph -Scope CurrentUser -Force" -ForegroundColor Yellow
    exit 1
}

Write-Host "[1/4] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Sites.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/4] Resolving site $SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
$sid = $site.id

Write-Host "[3/4] Reading seed file (UTF-8)..." -ForegroundColor Cyan
$data = Get-Content -Raw -Encoding UTF8 $SeedFile | ConvertFrom-Json
Write-Host ("      " + $data.departments.Count + " departments, " + $data.milestones.Count + " milestone rows.") -ForegroundColor Green

function List-HasItems([string]$listName) {
    $r = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/items?`$top=1"
    return ($r.value -and $r.value.Count -gt 0)
}
function Add-Item([string]$listName, [hashtable]$fields) {
    $body = @{ fields = $fields } | ConvertTo-Json -Depth 6 -Compress
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/items" -Body $body -ContentType 'application/json; charset=utf-8' | Out-Null
}

Write-Host "[4/4] Importing..." -ForegroundColor Cyan

# --- Departments ---
if (List-HasItems 'Departments') {
    Write-Host "      - Departments already has items, skipping." -ForegroundColor Yellow
} else {
    $n = 0
    foreach ($d in $data.departments) {
        Add-Item 'Departments' @{
            Title   = [string]$d.name
            Slug    = [string]$d.slug
            Units   = [string]$d.units
            Pending = [bool]$d.pending
            IconSvg = [string]$d.icon
        }
        $n++
    }
    Write-Host ("      + Departments: added " + $n) -ForegroundColor Green
}

# --- MilestoneTemplates ---
if (List-HasItems 'MilestoneTemplates') {
    Write-Host "      - MilestoneTemplates already has items, skipping." -ForegroundColor Yellow
} else {
    $n = 0
    foreach ($m in $data.milestones) {
        Add-Item 'MilestoneTemplates' @{
            Title      = [string]$m.text
            Department = [string]$m.department
            Month      = [int]$m.month
            Sort       = [int]$m.sort
            OrgWide    = [bool]$m.orgWide
        }
        $n++
        if ($n % 20 -eq 0) { Write-Host ("        ...$n") -ForegroundColor DarkGray }
    }
    Write-Host ("      + MilestoneTemplates: added " + $n) -ForegroundColor Green
}

Write-Host "`nDone - seed data imported into ${SiteHost}${SitePath}." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
