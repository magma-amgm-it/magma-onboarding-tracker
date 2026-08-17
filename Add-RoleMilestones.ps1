<#
.SYNOPSIS
  Append role-specific onboarding milestone templates (Executive Assistant, Cultural
  Facilitator, Volunteer Coordinator) to the Onboarding Tracker, WITHOUT touching existing
  data. Reads role-milestones-seed.json (UTF-8) so apostrophes/dashes survive; the script
  itself is pure ASCII. Idempotent: a team (by Slug) is only added if it isn't already there,
  and milestones for a team are only added if that team has none yet. Safe to re-run.

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. (First time only) Install-Module Microsoft.Graph -Scope CurrentUser -Force
  3. .\Add-RoleMilestones.ps1

  No app deploy needed - the app reads these lists live, so the new teams + checklists
  appear on next load.
#>

$ErrorActionPreference = 'Stop'
$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'
$SeedFile = Join-Path $PSScriptRoot 'role-milestones-seed.json'

if (-not (Test-Path $SeedFile)) { Write-Host "[ERROR] role-milestones-seed.json not found next to this script." -ForegroundColor Red; exit 1 }
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
    Write-Host "[ERROR] Microsoft.Graph module not found. Run: Install-Module Microsoft.Graph -Scope CurrentUser -Force" -ForegroundColor Yellow; exit 1
}

Write-Host "[1/5] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Sites.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/5] Resolving site $SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
$sid = $site.id

Write-Host "[3/5] Reading seed file (UTF-8)..." -ForegroundColor Cyan
$data = Get-Content -Raw -Encoding UTF8 $SeedFile | ConvertFrom-Json
Write-Host ("      " + $data.departments.Count + " teams, " + $data.milestones.Count + " milestone rows.") -ForegroundColor Green

function Get-AllItems([string]$listName) {
    $items = @()
    $uri = "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/items?`$expand=fields&`$top=500"
    do {
        $r = Invoke-MgGraphRequest -Method GET -Uri $uri
        if ($r.value) { $items += $r.value }
        $uri = $r.'@odata.nextLink'
    } while ($uri)
    return $items
}
function Add-Item([string]$listName, [hashtable]$fields) {
    $body = @{ fields = $fields } | ConvertTo-Json -Depth 6 -Compress
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/items" -Body $body -ContentType 'application/json; charset=utf-8' | Out-Null
}

Write-Host "[4/5] Adding teams (Departments)..." -ForegroundColor Cyan
$existingDeptSlugs = @{}
foreach ($it in (Get-AllItems 'Departments')) { if ($it.fields.Slug) { $existingDeptSlugs[[string]$it.fields.Slug] = $true } }
$addedD = 0
foreach ($d in $data.departments) {
    if ($existingDeptSlugs.ContainsKey([string]$d.slug)) {
        Write-Host ("      - " + $d.slug + " already exists, skipping.") -ForegroundColor Yellow
    } else {
        Add-Item 'Departments' @{ Title = [string]$d.name; Slug = [string]$d.slug; Units = [string]$d.units; Pending = [bool]$d.pending; IconSvg = [string]$d.icon }
        Write-Host ("      + Added team " + $d.name) -ForegroundColor Green
        $addedD++
    }
}

Write-Host "[5/5] Adding milestone templates..." -ForegroundColor Cyan
$deptsWithMilestones = @{}
foreach ($it in (Get-AllItems 'MilestoneTemplates')) { if ($it.fields.Department) { $deptsWithMilestones[[string]$it.fields.Department] = $true } }
$addedM = 0
foreach ($m in $data.milestones) {
    if ($deptsWithMilestones.ContainsKey([string]$m.department)) {
        # this team already has milestones - skip to avoid duplicates
        continue
    }
    Add-Item 'MilestoneTemplates' @{ Title = [string]$m.text; Department = [string]$m.department; Month = [int]$m.month; Sort = [int]$m.sort; OrgWide = [bool]$m.orgWide }
    $addedM++
}
if ($addedM -eq 0) { Write-Host "      - milestones already present for these teams, skipping." -ForegroundColor Yellow }
else { Write-Host ("      + Added " + $addedM + " milestone rows.") -ForegroundColor Green }

Write-Host ("`nDone. Teams added: " + $addedD + ", milestone rows added: " + $addedM + ". Refresh the tracker to see them.") -ForegroundColor Green
Disconnect-MgGraph | Out-Null
