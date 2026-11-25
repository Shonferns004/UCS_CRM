# Link WhatsApp accounts with an 8-character pairing code instead of a QR image.
#
#   .\pair-code.ps1 -Name "WA-NEW-02" -Phone 919876543210
#   .\pair-code.ps1 -Csv .\pair-accounts.csv        # one "name,phone" per line
#
# The operator types the code on the phone:
#   WhatsApp -> Settings -> Linked devices -> Link with phone number -> enter the 8 characters
#
# Baileys links a companion device, so a number may be linked more than once; unlike the old
# whatsapp-web.js engine there is no revoke hazard here.
#
# The gateway must be running with AUTO_START_SESSIONS=false while you pair, so only the account
# being linked connects. The script starts the gateway if it is down.
param(
    [string]$Name,
    [string]$Phone,
    [string]$Csv,
    # Seconds to wait for a pairing code to be accepted by the phone.
    [int]$ReadyTimeoutSec = 180
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = 'http://127.0.0.1:3001'
$key = (Get-Content (Join-Path $root 'data\.api-key') -Raw).Trim()
$headers = @{ 'x-api-key' = $key; 'Content-Type' = 'application/json' }

function Wait-Live([int]$seconds = 90) {
    for ($i = 0; $i -lt $seconds; $i++) {
        try { Invoke-RestMethod -Uri "$api/api/health/live" -TimeoutSec 2 | Out-Null; return $true } catch {}
        Start-Sleep -Seconds 1
    }
    return $false
}

function Ensure-Gateway {
    try { Invoke-RestMethod -Uri "$api/api/health/live" -TimeoutSec 2 | Out-Null; return }
    catch {}
    Write-Host 'starting gateway (AUTO_START_SESSIONS=false) ...'
    $env:AUTO_START_SESSIONS = 'false'
    $env:NODE_ID = 'LOCAL-WA-01'
    $env:PORT = '3001'
    $p = Start-Process -FilePath (Get-Command node).Source `
        -ArgumentList @('--max-old-space-size=2048', 'dist/main.js') `
        -WorkingDirectory $root `
        -RedirectStandardOutput (Join-Path $root 'logs\pairing.out.log') `
        -RedirectStandardError (Join-Path $root 'logs\pairing.err.log') `
        -WindowStyle Hidden -PassThru
    Set-Content (Join-Path $root 'data\.pairing.pid') $p.Id
    if (-not (Wait-Live)) { throw 'gateway did not become live' }
    Write-Host "gateway live (pid $($p.Id))"
}

function Get-GatewayVans {
    return @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
        Where-Object { $_.CommandLine -match 'dist.main' })
}

function Get-RssMb {
    $v = Get-GatewayVans
    if (-not $v) { return $null }
    $sum = 0
    foreach ($x in $v) {
        $pr = Get-Process -Id $x.ProcessId -EA SilentlyContinue
        if ($pr) { $sum += $pr.WorkingSet64 }
    }
    return [math]::Round($sum / 1MB, 0)
}

function Find-Session([string]$sessionName) {
    $all = Invoke-RestMethod -Uri "$api/api/sessions" -Headers $headers -TimeoutSec 20
    return @($all) | Where-Object { $_.name -eq $sessionName } | Select-Object -First 1
}

function Ensure-Session([string]$sessionName) {
    $s = Find-Session $sessionName
    if ($s) { Write-Host ("session '{0}' exists ({1})" -f $sessionName, $s.status); return $s }
    Write-Host ("creating session '{0}' ..." -f $sessionName)
    return Invoke-RestMethod -Uri "$api/api/sessions" -Method Post -Headers $headers -Body (@{ name = $sessionName } | ConvertTo-Json)
}

function Wait-PairingWindow([string]$id) {
    for ($i = 0; $i -lt 30; $i++) {
        $s = Invoke-RestMethod -Uri "$api/api/sessions/$id" -Headers $headers -TimeoutSec 10
        if ($s.status -in @('qr_ready', 'authenticating')) { return $s }
        if ($s.status -eq 'ready') { return $s }
        Start-Sleep -Seconds 1
    }
    return Invoke-RestMethod -Uri "$api/api/sessions/$id" -Headers $headers -TimeoutSec 10
}

function Pair-One([string]$sessionName, [string]$phoneDigits) {
    if ($phoneDigits -notmatch '^[0-9]{6,15}$') {
        return [pscustomobject]@{ Name = $sessionName; Result = 'bad phone (digits only, country code + number)'; Rss = $null }
    }

    $s = Ensure-Session $sessionName
    if ($s.status -eq 'ready') {
        return [pscustomobject]@{ Name = $sessionName; Result = 'already linked'; Rss = (Get-RssMb) }
    }

    Write-Host 'starting session ...'
    try { Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)/start" -Method Post -Headers $headers | Out-Null }
    catch { Write-Host ("start: " + $_.Exception.Message + " " + $_.ErrorDetails.Message) }

    $s = Wait-PairingWindow $s.id
    if ($s.status -notin @('qr_ready', 'authenticating')) {
        Write-Host ("session is {0}, not ready to pair" -f $s.status)
        return [pscustomobject]@{ Name = $sessionName; Result = "not pairable (status $($s.status))"; Rss = (Get-RssMb) }
    }

    $body = @{ phoneNumber = $phoneDigits } | ConvertTo-Json
    try {
        $res = Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)/pairing-code" -Method Post -Headers $headers -Body $body -TimeoutSec 30
    }
    catch {
        $detail = $_.ErrorDetails.Message
        Write-Host ("pairing-code failed: {0} {1}" -f $_.Exception.Message, $detail)
        return [pscustomobject]@{ Name = $sessionName; Result = "code request failed"; Rss = (Get-RssMb) }
    }

    Write-Host ''
    Write-Host '  =============================================='
    Write-Host ("    PAIRING CODE :  {0}" -f $res.pairingCode)
    Write-Host ("    for number   :  +{0}" -f $phoneDigits)
    Write-Host '    WhatsApp -> Linked devices -> Link with phone number'
    Write-Host '  =============================================='
    Write-Host ''

    $deadline = (Get-Date).AddSeconds($ReadyTimeoutSec)
    $last = ''
    while ((Get-Date) -lt $deadline) {
        try {
            $now = Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)" -Headers $headers -TimeoutSec 10
            if ($now.status -ne $last) {
                Write-Host ("[{0:HH:mm:ss}] {1}" -f (Get-Date), $now.status)
                $last = $now.status
            }
            if ($now.status -eq 'ready') {
                return [pscustomobject]@{ Name = $sessionName; Result = "linked (+$($now.phone))"; Rss = (Get-RssMb) }
            }
        }
        catch {}
        Start-Sleep -Seconds 3
    }
    return [pscustomobject]@{ Name = $sessionName; Result = 'timed out waiting for the phone'; Rss = (Get-RssMb) }
}

Ensure-Gateway
$baseRss = Get-RssMb
Write-Host ("gateway RSS before pairing: {0} MB" -f $baseRss)

$results = @()
if ($Csv) {
    if (-not (Test-Path $Csv)) { throw "csv not found: $Csv" }
    $rows = Get-Content $Csv | Where-Object { $_ -match '\S' -and $_ -notmatch '^\s*#' }
    Write-Host ("pairing {0} account(s) from {1}" -f @($rows).Count, $Csv)
    foreach ($line in $rows) {
        $parts = $line -split ','
        if ($parts.Count -lt 2) { Write-Host ("skipping malformed line: " + $line); continue }
        $n = $parts[0].Trim()
        $p = $parts[1].Trim()
        $results += Pair-One -sessionName $n -phoneDigits $p
    }
}
else {
    if (-not $Name -or -not $Phone) { throw 'need -Name and -Phone (or -Csv)' }
    $results += Pair-One -sessionName $Name -phoneDigits $Phone
}

Write-Host ''
Write-Host '--- result ---'
$results | Format-Table -AutoSize

$after = Get-RssMb
Write-Host ("gateway RSS after pairing: {0} MB  (delta {1:+0;-0;0} MB)" -f $after, ($after - $baseRss))
