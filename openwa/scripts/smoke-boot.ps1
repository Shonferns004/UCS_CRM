$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$log = Join-Path $root 'logs\smoke-boot.log'
if (-not (Test-Path (Join-Path $root 'logs'))) { New-Item -ItemType Directory -Path (Join-Path $root 'logs') | Out-Null }

$env:AUTO_START_SESSIONS = 'false'
$env:NODE_ID = 'LOCAL-SMOKE-01'
$env:PORT = '3001'
$env:MAX_CONCURRENT_SESSIONS = '0'

$node = (Get-Command node).Source
$p = Start-Process -FilePath $node `
  -ArgumentList @('--max-old-space-size=1024', 'dist/main.js') `
  -WorkingDirectory $root `
  -RedirectStandardOutput $log `
  -RedirectStandardError (Join-Path $root 'logs\smoke-boot.err.log') `
  -WindowStyle Hidden -PassThru

Write-Host "started pid $($p.Id), waiting for /health/live ..."
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 2
  try {
    $r = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health/live' -TimeoutSec 3
    $ok = $true
    Write-Host "LIVE after ~$((($i + 1) * 2))s"
    break
  }
  catch {
    if ($p.HasExited) { Write-Host "process exited early (code $($p.ExitCode))"; break }
  }
}

if (-not $ok) {
  Write-Host '--- last 40 log lines ---'
  Get-Content $log -Tail 40 -EA SilentlyContinue
  Write-Host '--- last 20 stderr ---'
  Get-Content (Join-Path $root 'logs\smoke-boot.err.log') -Tail 20 -EA SilentlyContinue
  if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
  exit 1
}

# readiness (DB + cache)
try { $ready = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/health/ready' -TimeoutSec 10; Write-Host ("READY: " + ($ready | ConvertTo-Json -Compress)) }
catch { Write-Host ("READY check failed: " + $_.Exception.Message) }

# authenticated call: proves the stored API key validates against this DB
$key = (Select-String -Path (Join-Path $root '..\backend\.env') -Pattern '^OPENWA_GATEWAY_API_KEY=(.+)$').Matches.Groups[1].Value
if (-not $key) { Write-Host 'no OPENWA_GATEWAY_API_KEY in backend/.env'; }
else {
  try {
    $sessions = Invoke-RestMethod -Uri 'http://127.0.0.1:3001/api/sessions' -Headers @{ 'x-api-key' = $key } -TimeoutSec 15
    $count = @($sessions).Count
    Write-Host "AUTH OK - /api/sessions returned $count session(s)"
  }
  catch {
    $code = $_.Exception.Response.StatusCode.value__
    Write-Host "AUTH/API FAILED - HTTP $code : $($_.Exception.Message)"
  }
}

Write-Host '--- engine line from boot log ---'
Get-Content $log -EA SilentlyContinue | Select-String -Pattern 'Engine plugin enabled|engine|Baileys|migration' | Select-Object -Last 8

Stop-Process -Id $p.Id -Force
Write-Host "stopped pid $($p.Id)"

