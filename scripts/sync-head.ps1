# UCS CRM - Sync local code to HEAD test EC2
# Usage:
#   .\scripts\sync-head.ps1              # sync backend + rebuild & sync frontend
#   .\scripts\sync-head.ps1 -Backend     # sync backend only
#   .\scripts\sync-head.ps1 -Frontend    # rebuild + sync frontend only
#   .\scripts\sync-head.ps1 -SkipBuild   # upload existing frontend dist without rebuilding
#
# IMPORTANT: This pushes to HEAD only. It never touches production or git remotes.

param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Temp = "C:\Users\ADMIN\AppData\Local\Temp\opencode"
$Key  = "C:\Users\ADMIN\.ssh\ucs-crm-head.pem"
$HeadHost = "ubuntu@52.66.211.205"
$FE   = Join-Path $Root "ucs crm"
$BE   = Join-Path $Root "backend"

function Invoke-SSH([string]$Cmd) {
    & ssh -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=30 $HeadHost $Cmd
    if ($LASTEXITCODE -ne 0) { throw "ssh command failed: $Cmd" }
}
function Push-File([string]$Local, [string]$Remote) {
    & scp -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=30 $Local "$HeadHost`:$Remote"
    if ($LASTEXITCODE -ne 0) { throw "scp failed: $Local -> $Remote" }
}

$doBackend  = (-not $Frontend) -and (-not $SkipBuild)
$doFrontend = (-not $Backend)
if ($Backend)  { $doBackend = $true;  $doFrontend = $false; $SkipBuild = $false }
if ($Frontend) { $doFrontend = $true; $doBackend = $false }

Write-Output "=== UCS sync-head ==="

# --- BACKEND ---------------------------------------------------------------
if ($doBackend) {
    Write-Output "backend: syncing source..."
    $tar = Join-Path $Temp "head-backend.tar.gz"
    tar -czf $tar -C $Root --exclude=node_modules --exclude=.env --exclude=.git --exclude=uploads backend 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "tar backend failed" }
    Push-File $tar "/tmp/head-backend.tar.gz"
    Invoke-SSH "tar -xzf /tmp/head-backend.tar.gz -C /opt/ucs-crm && sudo pm2 restart ucs-backend >/dev/null 2>&1 && echo BACKEND_SYNCED"
    Write-Output "backend: synced + pm2 restarted"
} else {
    Write-Output "backend: skipped"
}

# --- FRONTEND --------------------------------------------------------------
if ($doFrontend) {
    if (-not $SkipBuild) {
        Write-Output "frontend: rebuilding (vite)..."
        Push-Location $FE
        $oldPref = $ErrorActionPreference
        $ErrorActionPreference = "Continue"
        $buildErr = & npm.cmd run build 2>&1
        $buildExit = $LASTEXITCODE
        $ErrorActionPreference = $oldPref
        if ($buildExit -ne 0) {
            Pop-Location
            $buildErr | ForEach-Object { Write-Output "$_" }
            throw "frontend build failed (exit $buildExit)"
        }
        Pop-Location
        Write-Output "frontend: build OK"
    } else {
        Write-Output "frontend: skipping build (using existing dist)"
    }
    Write-Output "frontend: uploading dist..."
    $tar = Join-Path $Temp "head-dist.tar.gz"
    tar -czf $tar -C $FE dist 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "tar dist failed" }
    Push-File $tar "/tmp/head-dist.tar.gz"
    Invoke-SSH "sudo tar -xzf /tmp/head-dist.tar.gz -C /var/www/ucs-crm && sudo nginx -s reload >/dev/null 2>&1 && echo DIST_SYNCED"
    Write-Output "frontend: dist uploaded + nginx reloaded"
} else {
    Write-Output "frontend: skipped"
}

Write-Output "=== done ==="
