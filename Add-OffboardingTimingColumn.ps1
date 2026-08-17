<#
.SYNOPSIS
  Diagnoses + fixes the DisableTiming column on the Offboarding list.
  Lists every existing column (internal name | display name | type), then makes sure a
  TEXT column named exactly 'DisableTiming' exists. If a column named DisableTiming already
  exists but is NOT a text column (e.g. a half-created choice column), it deletes and recreates
  it as text. The app writes 'Immediately' / 'End of last working day' as plain strings and its
  dropdown constrains the values, so a text column is the robust choice.
  Microsoft.Graph module. ASCII only. Safe to re-run.

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

Write-Host "[1/5] Signing in (browser tab will open)..." -ForegroundColor Cyan
Connect-MgGraph -Scopes 'Sites.Manage.All', 'Sites.ReadWrite.All' -NoWelcome
Write-Host ("      Signed in as: " + (Get-MgContext).Account) -ForegroundColor Green

Write-Host "[2/5] Resolving site $SitePath ..." -ForegroundColor Cyan
$site = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/${SiteHost}:${SitePath}"
$sid = $site.id

Write-Host "[3/5] Resolving list '$ListName' ..." -ForegroundColor Cyan
$list = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists?`$filter=displayName eq '$ListName'"
if ($list.value.Count -eq 0) { Write-Host "[ERROR] List '$ListName' not found." -ForegroundColor Red; exit 1 }
$lid = $list.value[0].id

Write-Host "[4/5] Current columns on '$ListName':" -ForegroundColor Cyan
$cols = Invoke-MgGraphRequest -Method GET -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/columns"
$existing = $null
foreach ($c in $cols.value) {
    $type = 'other'
    if ($c.text)     { $type = 'text' }
    elseif ($c.choice)   { $type = 'choice' }
    elseif ($c.dateTime) { $type = 'dateTime' }
    elseif ($c.boolean)  { $type = 'boolean' }
    Write-Host ("      - {0,-22} | {1,-22} | {2}" -f $c.name, $c.displayName, $type)
    if ($c.name -eq $ColName -or $c.displayName -eq $ColName) { $existing = $c; $existing | Add-Member -NotePropertyName _type -NotePropertyValue $type -Force }
}

Write-Host "[5/5] Ensuring '$ColName' is a TEXT column ..." -ForegroundColor Cyan
if ($existing -and $existing._type -eq 'text') {
    Write-Host "      - Already a text column, nothing to do." -ForegroundColor Yellow
} else {
    if ($existing) {
        Write-Host ("      - Found '$ColName' as type '" + $existing._type + "' -> deleting and recreating as text.") -ForegroundColor Yellow
        Invoke-MgGraphRequest -Method DELETE -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/columns/$($existing.id)" | Out-Null
        Start-Sleep -Seconds 2
    }
    $payload = @{
        name         = $ColName
        defaultValue = @{ value = 'Immediately' }
        text         = @{ allowMultipleLines = $false; maxLength = 64 }
    }
    $body = $payload | ConvertTo-Json -Depth 8
    Invoke-MgGraphRequest -Method POST -Uri "https://graph.microsoft.com/v1.0/sites/$sid/lists/$lid/columns" -Body $body -ContentType 'application/json' | Out-Null
    Write-Host ("      + Created text column " + $ColName) -ForegroundColor Green
}

Write-Host "`nDone. Wait ~30s, then re-submit the offboarding form." -ForegroundColor Green
Disconnect-MgGraph | Out-Null
