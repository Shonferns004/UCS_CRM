# Issue pairing codes for a batch of existing sessions, in one go.
#
#   .\pair-batch.ps1 -Count 5
#   .\pair-batch.ps1 -Count 5 -Offset 5     # next batch
#   .\pair-batch.ps1 -Count 5 -WaitMin 4    # also wait for the phones to finish
#
# Selects sessions that have a phone on file but are not linked yet, starts them, and requests an
# 8-char code for each. Codes expire in a few minutes, so enter them promptly; re-run with the same
# names (or -Offset 0) to re-issue.
#
# On each phone: WhatsApp -> Settings -> Linked devices -> Link with phone number -> type the code.
param(
    [int]$Count = 5,
    [int]$Offset = 0,
    [int]$WaitMin = 0
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$api = 'http://127.0.0.1:3001'
$key = (Get-Content (Join-Path $root 'data\.api-key') -Raw).Trim()
$headers = @{ 'x-api-key' = $key; 'Content-Type' = 'application/json' }

function Get-RssMb {
    $sum = 0
    foreach ($x in @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'dist.main' })) {
        $pr = Get-Process -Id $x.ProcessId -EA SilentlyContinue
        if ($pr) { $sum += $pr.WorkingSet64 }
    }
    return [math]::Round($sum / 1MB, 0)
}

try { Invoke-RestMethod -Uri "$api/api/health/live" -TimeoutSec 3 | Out-Null }
catch { throw 'gateway is not running; start it with scripts/run-multi.ps1 or pair-code.ps1 first' }

$all = Invoke-RestMethod -Uri "$api/api/sessions" -Headers $headers -TimeoutSec 30
$eligible = @($all) |
    Where-Object { $_.status -ne 'ready' -and $_.phone -and $_.phone -match '^[0-9]{6,15}$' } |
    Select-Object -Skip $Offset -First $Count

if (-not $eligible) { Write-Host 'no eligible sessions (all ready, or none with a phone on file)'; return }

Write-Host ("batch: {0} session(s)  |  RSS before: {1} MB" -f @($eligible).Count, (Get-RssMb))
Write-Host ''

$results = @()
foreach ($s in $eligible) {
    Write-Host ("[{0}] starting ..." -f $s.name)
    try { Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)/start" -Method Post -Headers $headers -TimeoutSec 30 | Out-Null }
    catch { Write-Host ("  start: " + $_.Exception.Message) }

    $code = $null
    $err = $null
    for ($i = 0; $i -lt 20; $i++) {
        try {
            $now = Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)" -Headers $headers -TimeoutSec 10
            if ($now.status -in @('qr_ready', 'authenticating')) {
                $body = @{ phoneNumber = $s.phone } | ConvertTo-Json
                $res = Invoke-RestMethod -Uri "$api/api/sessions/$($s.id)/pairing-code" -Method Post -Headers $headers -Body $body -TimeoutSec 30
                $code = $res.pairingCode
                break
            }
            if ($now.status -eq 'ready') { $code = '(already linked)'; break }
        }
        catch { $err = $_.Exception.Message; if ($_.ErrorDetails.Message) { $err += ' ' + $_.ErrorDetails.Message } }
        Start-Sleep -Seconds 1
    }

    $results += [pscustomobject]@{
        Name  = $s.name
        Phone = '+' + $s.phone
        Code  = if ($code) { $code } else { 'FAILED' }
        Note  = if ($code) { '' } else { $err }
    }
}

Write-Host ''
Write-Host '=========== PAIRING CODES ==========='
$results | Format-Table -AutoSize
Write-Host 'Enter each code on its phone: Linked devices -> Link with phone number'
Write-Host ("RSS after requesting codes: {0} MB" -f (Get-RssMb))

if ($WaitMin -gt 0) {
    Write-Host ''
    Write-Host ("waiting up to {0} min for the batch ..." -f $WaitMin)
    $deadline = (Get-Date).AddMinutes($WaitMin)
    $pending = @($results | Where-Object { $_.Code -ne 'FAILED' } | ForEach-Object { $_.Name })
    while ((Get-Date) -lt $deadline -and $pending.Count) {
        Start-Sleep -Seconds 10
        $snapshot = Invoke-RestMethod -Uri "$api/api/sessions" -Headers $headers -TimeoutSec 30
        $pending = @($pending | Where-Object {
            $nm = $_
            -not (@($snapshot) | Where-Object { $_.name -eq $nm -and $_.status -eq 'ready' })
        })
        Write-Host ("[{0:HH:mm:ss}] still pairing: {1}  |  RSS {2} MB" -f (Get-Date), ($pending -join ', '), (Get-RssMb))
    }
    Write-Host ''
    Write-Host ("done. pending: {0}" -f (($pending -join ', ') -replace '^$', 'none'))
}
