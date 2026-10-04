# UCS CRM - Sync local code to HEAD test EC2
# Usage:
#   .\scripts\sync-head.ps1              # sync backend + rebuild & sync frontend
#   .\scripts\sync-head.ps1 -Backend     # sync backend only
#   .\scripts\sync-head.ps1 -Frontend    # rebuild + sync frontend only
#   .\scripts\sync-head.ps1 -SkipBuild   # upload existing frontend dist without rebuilding
#   .\scripts\sync-head.ps1 -SkipInstall # sync backend without `npm install` on the host
#
# IMPORTANT: This pushes to HEAD only. It never touches production or git remotes.
#
# The backend runs under ROOT's pm2 daemon, so every pm2 call here must use `sudo pm2`.

param(
    [switch]$Backend,
    [switch]$Frontend,
    [switch]$SkipBuild,
    [switch]$SkipInstall
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Temp = Join-Path $env:USERPROFILE "AppData\Local\Temp\opencode"
$Key  = Join-Path $env:USERPROFILE ".ssh\ucs-crm-head.pem"
$HeadHost = "ubuntu@52.66.211.205"
$FE   = Join-Path $Root "client"
$BE   = Join-Path $Root "backend"

function Invoke-SSH([string]$Cmd) {
    & ssh -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=30 $HeadHost $Cmd
    if ($LASTEXITCODE -ne 0) { throw "ssh command failed: $Cmd" }
}
function Invoke-SSHQuiet([string]$Cmd) {
    & ssh -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=30 $HeadHost $Cmd 2>&1 | Out-Null
    return ($LASTEXITCODE -eq 0)
}
function Push-File([string]$Local, [string]$Remote) {
    & scp -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=30 $Local "$HeadHost`:$Remote"
    if ($LASTEXITCODE -ne 0) { throw "scp failed: $Local -> $Remote" }
}
function Wait-BackendHealthy([int]$Attempts = 20, [int]$DelaySeconds = 3) {
    for ($i = 1; $i -le $Attempts; $i++) {
        Start-Sleep -Seconds $DelaySeconds
        if (Invoke-SSHQuiet "curl -fsS -o /dev/null http://127.0.0.1:5000/api/health") {
            Write-Output "backend: healthy on 127.0.0.1:5000 (after $i check(s))"
            return $true
        }
        Write-Output "backend: not answering yet ($i/$Attempts)..."
    }
    return $false
}
function Get-BackendErrorLog([int]$Lines = 25) {
    & ssh -i $Key -o StrictHostKeyChecking=no -o ConnectTimeout=30 $HeadHost "sudo tail -n $Lines /root/.pm2/logs/ucs-backend-error.log 2>/dev/null"
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
    Invoke-SSH "tar -xzf /tmp/head-backend.tar.gz -C /opt/ucs-crm"
    Write-Output "backend: source extracted to /opt/ucs-crm/backend"

    if (-not $SkipInstall) {
        Write-Output "backend: installing dependencies (npm install --omit=dev)..."
        Invoke-SSH "cd /opt/ucs-crm/backend && sudo npm install --omit=dev --no-audit --no-fund 2>&1 | tail -8"
        Write-Output "backend: dependencies installed"
    } else {
        Write-Output "backend: SKIPPING npm install (-SkipInstall)"
    }

    Write-Output "backend: restarting pm2 ucs-backend..."
    Invoke-SSH "sudo pm2 restart ucs-backend 2>&1 | tail -5"

    if (-not (Wait-BackendHealthy)) {
        Write-Output "----- last 25 lines of /root/.pm2/logs/ucs-backend-error.log -----"
        Get-BackendErrorLog | ForEach-Object { Write-Output $_ }
        Write-Output "----------------------------------------------------------------------"
        throw "ucs-backend did not answer on 127.0.0.1:5000 - nginx will return 502 Bad Gateway. NOT deploying silently; fix the error above and re-run."
    }
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
