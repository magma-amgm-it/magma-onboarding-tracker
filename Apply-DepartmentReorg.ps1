<#
.SYNOPSIS
  Apply Lara's confirmed department -> unit -> role reorg (2026-08-17) to the Onboarding Tracker.
  1) Ensures a 'Parent' (slug) text column exists on Departments.
  2) Upserts every node from reorg-seed.json: existing rows (by Slug) are updated in place
     (Title / Parent / Pending, and Units label cleared) keeping their icon + milestones;
     new rows are created with their icon.
  3) Adds the Support Services baseline milestones if that team has none yet.
  Reads reorg-seed.json (UTF-8). Script is pure ASCII. Idempotent - safe to re-run.

.HOW TO RUN
  1. cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  2. powershell -ExecutionPolicy Bypass -File ".\Apply-DepartmentReorg.ps1"

  No app deploy is needed for the DATA, but the app code change (tree rendering) ships separately.
#>

$ErrorActionPreference = 'Stop'
$SiteHost = 'magmaamgmorg.sharepoint.com'
$SitePath = '/sites/App-OnboardingTracker'
$SeedFile = Join-Path $PSScriptRoot 'reorg-seed.json'

if (-not (Test-Path $SeedFile)) { Write-Host "[ERROR] reorg-seed.json not found next to this script." -ForegroundColor Red; exit 1 }
if (-not (Get-Module -ListAvailable -Name Microsoft.Graph.Authentication)) {
    Write-Host "[ERROR] Microsoft.Graph module not found. Run: Install-Module Microsoft.Graph -Scope CurrentUser -Force" -ForegroundColor Yellow; exit 1
}

Write-Host "[1/6] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Sites.Manage.All','Sites.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/6] Resolving site $SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
$sid = $site.id

Write-Host "[3/6] Ensuring 'ParentSlug' column on Departments ..." -ForegroundColor Cyan
$list = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists?`$filter=displayName eq 'Departments'"
if ($list.value.Count -eq 0) { Write-Host "[ERROR] Departments list not found." -ForegroundColor Red; exit 1 }
$lid = $list.value[0].id
$allCols = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/columns?`$top=200"
$have = $false
foreach ($c in $allCols.value) { if ($c.name -eq 'ParentSlug' -and $c.text) { $have = $true } }
if ($have) {
    Write-Host "      - ParentSlug column already exists." -ForegroundColor Yellow
} else {
    $body = @{ name = 'ParentSlug'; text = @{ allowMultipleLines = $false; maxLength = 128 } } | ConvertTo-Json -Depth 6
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/columns" -Body $body -ContentType 'application/json' | Out-Null
    Write-Host "      + Added ParentSlug column." -ForegroundColor Green
    Start-Sleep -Seconds 4
}

Write-Host "[4/6] Reading seed + current rows ..." -ForegroundColor Cyan
$data = Get-Content -Raw -Encoding UTF8 $SeedFile | ConvertFrom-Json
function Get-AllItems([string]$listName) {
    $items = @(); $uri = "https://graph.microsoft.com/v1.0/sites/$sid/lists/$listName/items?`$expand=fields&`$top=500"
    do { $r = Invoke-MgGraphRequest -Method GET -Uri $uri; if ($r.value) { $items += $r.value }; $uri = $r.'@odata.nextLink' } while ($uri)
    return $items
}
$slugToId = @{}
foreach ($it in (Get-AllItems 'Departments')) { if ($it.fields.Slug) { $slugToId[[string]$it.fields.Slug] = $it.id } }

Write-Host "[5/6] Upserting the tree ..." -ForegroundColor Cyan
$upd = 0; $new = 0
foreach ($n in $data.nodes) {
    if ($slugToId.ContainsKey([string]$n.slug)) {
        $fields = @{ Title = [string]$n.name; ParentSlug = [string]$n.parent; Pending = [bool]$n.pending; Units = '' }
        $body = @{ } ; $body = $fields | ConvertTo-Json -Depth 6 -Compress
        Invoke-MgGraphRequest -Method PATCH -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/items/$($slugToId[[string]$n.slug])/fields" -Body $body -ContentType 'application/json; charset=utf-8' | Out-Null
        Write-Host ("      ~ updated " + $n.name) -ForegroundColor DarkGray
        $upd++
    } else {
        $fields = @{ Title = [string]$n.name; Slug = [string]$n.slug; ParentSlug = [string]$n.parent; Pending = [bool]$n.pending; Units = '' }
        if ($n.PSObject.Properties.Name -contains 'icon') { $fields.IconSvg = [string]$n.icon }
        $body = @{ fields = $fields } | ConvertTo-Json -Depth 6 -Compress
        Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/items" -Body $body -ContentType 'application/json; charset=utf-8' | Out-Null
        Write-Host ("      + created " + $n.name) -ForegroundColor Green
        $new++
    }
}

Write-Host "[6/6] Support Services baseline milestones ..." -ForegroundColor Cyan
$hasSS = $false
foreach ($it in (Get-AllItems 'MilestoneTemplates')) { if ([string]$it.fields.Department -eq 'support-services') { $hasSS = $true; break } }
if ($hasSS) {
    Write-Host "      - already present, skipping." -ForegroundColor Yellow
} else {
    foreach ($m in $data.milestones) {
        $body = @{ fields = @{ Title = [string]$m.text; Department = [string]$m.department; Month = [int]$m.month; Sort = [int]$m.sort; OrgWide = [bool]$m.orgWide } } | ConvertTo-Json -Depth 6 -Compress
        Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/MilestoneTemplates/items" -Body $body -ContentType 'application/json; charset=utf-8' | Out-Null
    }
    Write-Host ("      + added " + $data.milestones.Count + " baseline rows.") -ForegroundColor Green
}

Write-Host ("`nDone. Updated: " + $upd + ", created: " + $new + ". (Ship the app code change next.)") -ForegroundColor Green
Disconnect-MgGraph | Out-Null
