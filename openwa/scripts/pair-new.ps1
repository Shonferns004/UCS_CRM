# Pair one brand-new WhatsApp account against the local gateway.
# Starts the gateway (AUTO_START_SESSIONS=false so nothing else connects), creates a session,
# starts it, waits for the QR, saves it as a PNG and opens it.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = 'http://127.0.0.1:3001'
$key = (Get-Content (Join-Path $root 'data\.api-key') -Raw).Trim()
$headers = @{ 'x-api-key' = $key; 'Content-Type' = 'application/json' }
$name = 'WA-NEW-01'

function Wait-Live([int]$seconds = 90) {
    for ($i = 0; $i -lt $seconds; $i++) {
        try { Invoke-RestMethod -Uri "$api/api/health/live" -TimeoutSec 2 | Out-Null; return $true }
        catch { Start-Sleep -Seconds 1 }
    }
    return $false
}

# 1. gateway up?
$running = $false
try { Invoke-RestMethod -Uri "$api/api/health/live" -TimeoutSec 2 | Out-Null; $running = $true } catch {}
if (-not $running) {
    Write-Host 'starting gateway (AUTO_START_SESSIONS=false) ...'
    $env:AUTO_START_SESSIONS = 'false'
    $env:NODE_ID = 'LOCAL-WA-01'
    $env:PORT = '3001'
    $pidFile = Join-Path $root 'data\.pairing.pid'
    $p = Start-Process -FilePath (Get-Command node).Source `
        -ArgumentList @('--max-old-space-size=2048', 'dist/main.js') `
        -WorkingDirectory $root `
        -RedirectStandardOutput (Join-Path $root 'logs\pairing.out.log') `
        -RedirectStandardError (Join-Path $root 'logs\pairing.err.log') `
        -WindowStyle Hidden -PassThru
    Set-Content $pidFile $p.Id
    if (-not (Wait-Live)) {
        Write-Host 'gateway did not become live; last log lines:'
        Get-Content (Join-Path $root 'logs\pairing.err.log') -Tail 20 -EA SilentlyContinue
        exit 1
    }
    Write-Host "gateway live (pid $($p.Id))"
}
else { Write-Host 'gateway already running' }

# 2. create the session
Write-Host "creating session '$name' ..."
try {
    $session = Invoke-RestMethod -Uri "$api/api/sessions" -Method Post -Headers $headers -Body (@{ name = $name } | ConvertTo-Json)
}
catch {
    $detail = $_.ErrorDetails.Message
    Write-Host "create failed: $($_.Exception.Message) $detail"
    exit 1
}
$id = $session.id
Write-Host "session id: $id  (status: $($session.status))"

# 3. start it
Write-Host 'starting session ...'
try { Invoke-RestMethod -Uri "$api/api/sessions/$id/start" -Method Post -Headers $headers | Out-Null }
catch { Write-Host "start returned: $($_.Exception.Message) $($_.ErrorDetails.Message)" }

# 4. wait for the QR
$qrPath = Join-Path $root 'data\qr'
if (-not (Test-Path $qrPath)) { New-Item -ItemType Directory -Path $qrPath | Out-Null }
$png = Join-Path $qrPath "$name.png"
$got = $false
for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 1500
    try {
        $qr = Invoke-RestMethod -Uri "$api/api/sessions/$id/qr" -Headers $headers -TimeoutSec 10
        if ($qr.qrCode) {
            $b64 = ($qr.qrCode -split ',')[1]
            [IO.File]::WriteAllBytes($png, [Convert]::FromBase64String($b64))
            $got = $true
            Write-Host "QR saved: $png  (status: $($qr.status))"
            break
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) { continue }
    }
}

if (-not $got) {
    Write-Host 'QR not produced. Current session state:'
    try { Invoke-RestMethod -Uri "$api/api/sessions/$id" -Headers $headers | Select-Object status, error, lastError | Format-List } catch {}
    exit 1
}

# 5. memory now
$gw = Get-Process -Id (Get-Content (Join-Path $root 'data\.pairing.pid') -EA SilentlyContinue) -EA SilentlyContinue
if ($gw) { Write-Host ("gateway RSS with 1 session: {0:N0} MB" -f ($gw.WorkingSet64 / 1MB)) }

Write-Host ''
Write-Host "Scan this QR with the phone:  $png"
Write-Host "Session id: $id"
Write-Host 'The gateway is LEFT RUNNING so the scan can complete.'
Start-Process $png
