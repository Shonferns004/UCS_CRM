# UCS CRM - one-command sync
# Usage:  .\scripts\sync.ps1            (pull + install + restart)
#         .\scripts\sync.ps1 -NoRestart (pull + install only)
#         .\scripts\sync.ps1 -PullOnly  (git pull only)
param(
  [switch]$NoRestart,
  [switch]$PullOnly
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host "=== UCS CRM sync ===" -ForegroundColor Cyan

# 1. Stash local changes (if any) so pull never fails
$stashed = $false
$dirty = (git status --porcelain) -ne $null -and (git status --porcelain).Trim() -ne ''
if ($dirty) {
  Write-Host "[git] stashing local changes..." -ForegroundColor Yellow
  git stash push -m "auto-sync-stash" | Out-Null
  $stashed = $true
}

# 2. Pull latest
Write-Host "[git] pulling origin/master..." -ForegroundColor Yellow
git pull --ff-only origin master
if ($LASTEXITCODE -ne 0) {
  Write-Host "[git] fast-forward failed; trying rebase..." -ForegroundColor Yellow
  git pull --rebase origin master
}

# 3. Restore stashed changes
if ($stashed) {
  Write-Host "[git] restoring stashed changes..." -ForegroundColor Yellow
  git stash pop
}

if ($PullOnly) { Write-Host "=== pull done ==="; exit 0 }

# 4. Install deps if package.json changed
$backendPkgChanged = (git diff --name-only HEAD@{1} HEAD 2>$null) -contains 'backend/package.json'
$clientPkgChanged  = (git diff --name-only HEAD@{1} HEAD 2>$null) -contains 'client/package.json'
# also install if node_modules missing
if (-not (Test-Path "$root\backend\node_modules")) { $backendPkgChanged = $true }
if (-not (Test-Path "$root\client\node_modules"))  { $clientPkgChanged = $true }

if ($backendPkgChanged) {
  Write-Host "[npm] backend install..." -ForegroundColor Yellow
  Set-Location "$root\backend"; npm install
  Set-Location $root
}
if ($clientPkgChanged) {
  Write-Host "[npm] client install..." -ForegroundColor Yellow
  Set-Location "$root\client"; npm install
  Set-Location $root
}

if ($NoRestart) { Write-Host "=== sync done (no restart) ==="; exit 0 }

# 5. Restart servers
Write-Host "[restart] stopping old processes..." -ForegroundColor Yellow
Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object {
  $_.Path -like "*nodejs*" } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 2

Write-Host "[restart] starting backend..." -ForegroundColor Yellow
$node = "C:\Program Files\nodejs\node.exe"
Start-Process -FilePath $node -ArgumentList "src/index.js" -WorkingDirectory "$root\backend" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\backend.out.log" -RedirectStandardError "$env:TEMP\backend.err.log"
Start-Sleep -Seconds 15

Write-Host "[restart] starting frontend (network)..." -ForegroundColor Yellow
Start-Process -FilePath "cmd.exe" -ArgumentList "/c","npm run dev -- --host" -WorkingDirectory "$root\client" -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\client.out.log" -RedirectStandardError "$env:TEMP\client.err.log"
Start-Sleep -Seconds 15

Write-Host "=== sync + restart done ===" -ForegroundColor Green
Write-Host "Frontend: http://192.168.1.152:5173   Backend: http://192.168.1.152:5000"