# Fetch a fresh QR for an existing session and open it. Use when a QR expired.
param(
    [string]$Name = 'WA-NEW-01'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = 'http://127.0.0.1:3001'
$key = (Get-Content (Join-Path $root 'data\.api-key') -Raw).Trim()
$headers = @{ 'x-api-key' = $key; 'Content-Type' = 'application/json' }

$all = Invoke-RestMethod -Uri "$api/api/sessions" -Headers $headers -TimeoutSec 15
$s = @($all) | Where-Object { $_.name -eq $Name } | Select-Object -First 1
if (-not $s) { Write-Host "no session named '$Name'"; exit 1 }

Write-Host ("session: {0}  id={1}  status={2}" -f $s.name, $s.id, $s.status)

if ($s.status -notin @('qr_ready', 'initializing', 'authenticating')) {
    Write-Host 'not in a pairing state - restarting it ...'
    try { Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)/start" -Method Post -Headers $headers | Out-Null }
    catch { Write-Host ("start: " + $_.Exception.Message + " " + $_.ErrorDetails.Message) }
    Start-Sleep -Seconds 3
}

$png = Join-Path $root "data\qr\$Name.png"
$got = $false
for ($i = 0; $i -lt 30; $i++) {
    try {
        $qr = Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)/qr" -Headers $headers -TimeoutSec 10
        if ($qr.qrCode) {
            $b64 = ($qr.qrCode -split ',')[1]
            [IO.File]::WriteAllBytes($png, [Convert]::FromBase64String($b64))
            Write-Host ("fresh QR saved: {0}  ({1} bytes, status {2})" -f $png, (Get-Item $png).Length, $qr.status)
            $got = $true
            break
        }
    }
    catch {
        if ($_.Exception.Response.StatusCode.value__ -eq 400) { Start-Sleep -Milliseconds 1500; continue }
        Write-Host ("qr error: " + $_.Exception.Message); break
    }
}

if (-not $got) {
    $now = Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)" -Headers $headers -TimeoutSec 10
    Write-Host ("no QR available. status={0}" -f $now.status)
    exit 1
}

$gw = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dist.main' }) | Select-Object -First 1
if ($gw) {
    $proc = Get-Process -Id $gw.ProcessId -EA SilentlyContinue
    if ($proc) { Write-Host ("gateway RSS: {0:N0} MB" -f ($proc.WorkingSet64 / 1MB)) }
}

Start-Process $png
Write-Host 'QR opened. Scan it now - it changes every ~20s, so re-run this if it expires.'
