# Run the OpenWA gateway as several processes ("vans") on one Windows box.
#
# Why: one Node process is capped at ~4.3 GB of JS heap, and each live WhatsApp session costs
# ~60-100 MB. Loading 70+ sessions into one process dies around session 50 and then restart-loops.
# Several processes (each with its own heap and its own MAX_CONCURRENT_SESSIONS cap) keep every
# session inside a limit it can actually hold, and limit the blast radius of a crash.
#
# Existing .env stays the shared config (DB, API key, BAILEYS_AUTH_DIR). Only the per-process
# variables are overridden here — real process env wins over .env (dotenv override:false).
#
#   npm run build                     # produce dist/main.js first
#   powershell -ExecutionPolicy Bypass -File scripts/run-multi.ps1 -Sessions 72
#   powershell -ExecutionPolicy Bypass -File scripts/run-multi.ps1 -Stop
#
# Sessions are claimed per process (lease-based), so AUTO_START_SESSIONS splits them across the
# vans automatically, up to each van's MAX_CONCURRENT_SESSIONS.
param(
    # How many sessions you expect to run. Vans = ceil(Sessions / PerNode).
    [int]$Sessions = 72,
    # Sessions per van. Keep x HeapMB inside the machine's real free RAM.
    [int]$PerNode = 18,
    # First HTTP port; each van gets BasePort + index.
    [int]$BasePort = 3001,
    # Per-process V8 heap ceiling. Must stay below Node's ~4.3 GB default so a bad account
    # cannot run into the global ceiling and kill the van.
    [int]$HeapMB = 2560,
    # Postgres pool per van. Vans x DbPool is the total connection count; the default of 10
    # per process would open 40+ connections for four vans.
    [int]$DbPool = 5,
    [switch]$Stop
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$pidFile = Join-Path $PSScriptRoot '.multi-node.pids.json'
$logDir = Join-Path $root 'logs'

function Read-Records {
    if (-not (Test-Path $pidFile)) { return @() }
    return @(Get-Content $pidFile -Raw | ConvertFrom-Json)
}

if ($Stop) {
    $records = Read-Records
    if (-not $records.Count) { Write-Host 'No vans recorded (nothing to stop).'; return }
    foreach ($r in $records) {
        try {
            Stop-Process -Id $r.Pid -Force -ErrorAction Stop
            Write-Host ("stopped {0} (pid {1}, port {2})" -f $r.Node, $r.Pid, $r.Port)
        }
        catch {
            Write-Host ("{0} (pid {1}) already gone" -f $r.Node, $r.Pid)
        }
    }
    Remove-Item $pidFile -Force
    return
}

$entry = Join-Path $root 'dist\main.js'
if (-not (Test-Path $entry)) {
    throw "dist/main.js not found. Run 'npm run build' first."
}
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$existing = Read-Records
if ($existing.Count) {
    Write-Host ("WARNING: {0} van(s) already recorded in {1}. Run with -Stop first." -f $existing.Count, $pidFile)
}

$vans = [int][math]::Ceiling($Sessions / $PerNode)
$totalCapacity = $vans * $PerNode
$nodeExe = (Get-Command node).Source

# Preserve this shell's env so the launcher does not leak per-van values into it.
$saved = @{}
foreach ($k in @('PORT', 'NODE_ID', 'MAX_CONCURRENT_SESSIONS', 'DATABASE_POOL_SIZE')) {
    $saved[$k] = [Environment]::GetEnvironmentVariable($k, 'Process')
}

$records = @()
try {
    for ($i = 0; $i -lt $vans; $i++) {
        $port = $BasePort + $i
        $nodeId = 'WA-NODE-{0:D2}' -f ($i + 1)
        $env:PORT = "$port"
        $env:NODE_ID = $nodeId
        $env:MAX_CONCURRENT_SESSIONS = "$PerNode"
        $env:DATABASE_POOL_SIZE = "$DbPool"

        $stdout = Join-Path $logDir "$nodeId.out.log"
        $stderr = Join-Path $logDir "$nodeId.err.log"
        $p = Start-Process -FilePath $nodeExe `
            -ArgumentList @("--max-old-space-size=$HeapMB", 'dist/main.js') `
            -WorkingDirectory $root `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -WindowStyle Hidden -PassThru

        $records += [pscustomobject]@{ Node = $nodeId; Port = $port; Pid = $p.Id }
        Write-Host ("started {0} on port {1} (pid {2})" -f $nodeId, $port, $p.Id)
        Start-Sleep -Milliseconds 400
    }
}
finally {
    foreach ($k in $saved.Keys) {
        if ($null -eq $saved[$k]) { Remove-Item "env:$k" -ErrorAction SilentlyContinue }
        else { Set-Item "env:$k" $saved[$k] }
    }
}

$records | ConvertTo-Json -Depth 4 | Set-Content $pidFile

Write-Host ''
Write-Host ("{0} vans, {1} sessions per van, capacity {2}" -f $vans, $PerNode, $totalCapacity)
Write-Host ("heap {0} MB each, DB pool {1} each ({2} connections total)" -f $HeapMB, $DbPool, ($vans * $DbPool))
$records | Format-Table -AutoSize
Write-Host ''
Write-Host "Logs: $logDir"
Write-Host ("Point the CRM at one of: " + (($records | ForEach-Object { "http://<this-host>:$($_.Port)" }) -join ', '))
Write-Host 'Stop with: -Stop'
