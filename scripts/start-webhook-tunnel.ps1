# UCS CRM - start webhook receiver + ngrok tunnel together
# Usage: .\scripts\start-webhook-tunnel.ps1
# Optional: set $env:NGROK_DOMAIN = "your-name.ngrok-free.app" for a static domain
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

# 1. Start webhook server (loads secret from scripts/.webhook-secret)
& "$root\scripts\run-webhook.ps1"
Start-Sleep -Seconds 2

# 2. Start ngrok
$ngrok = Get-Command ngrok -ErrorAction SilentlyContinue
if (-not $ngrok) { Write-Host "ngrok not found in PATH. Install: choco install ngrok"; exit 1 }

$domain = $env:NGROK_DOMAIN
if ($domain) {
  Write-Host "Starting ngrok with STATIC domain: $domain" -ForegroundColor Cyan
  Write-Host "Webhook Payload URL: https://$domain/webhook" -ForegroundColor Green
  ngrok http --domain=$domain 9000
} else {
  Write-Host "Starting ngrok with a RANDOM URL (set `$env:NGROK_DOMAIN for a stable URL)" -ForegroundColor Yellow
  ngrok http 9000
}