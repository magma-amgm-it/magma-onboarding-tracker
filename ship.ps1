<#
.SYNOPSIS
  One-shot deploy: stage everything, commit, and push (which triggers the GitHub Pages build).
  Use after Claude (or you) changes the code.

.HOW TO RUN
  cd "C:\Users\abhishek.desai\Downloads\AI\Claude\Onboarding Tracker\magma-onboarding-tracker"
  .\ship.ps1 "what changed"          # message optional; defaults to a timestamp
#>

param([string]$Message = "")

if ([string]::IsNullOrWhiteSpace($Message)) {
    $Message = "Update " + (Get-Date -Format "yyyy-MM-dd HH:mm")
}

git add -A

# Nothing staged? Say so and stop (avoids an empty-commit error).
$pending = git status --porcelain
if ([string]::IsNullOrWhiteSpace($pending)) {
    Write-Host "Nothing to commit - working tree clean." -ForegroundColor Yellow
    exit 0
}

git commit -m $Message
if ($LASTEXITCODE -ne 0) { Write-Host "Commit failed." -ForegroundColor Red; exit 1 }

git push
if ($LASTEXITCODE -ne 0) { Write-Host "Push failed." -ForegroundColor Red; exit 1 }

Write-Host "`nShipped. GitHub Actions is building - it deploys in about a minute." -ForegroundColor Green
Write-Host "Watch: https://github.com/magma-amgm-it/magma-onboarding-tracker/actions" -ForegroundColor DarkGray
