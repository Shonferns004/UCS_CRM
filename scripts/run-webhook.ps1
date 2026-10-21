# UCS CRM - launcher for the GitHub webhook receiver
# Usage: .\scripts\run-webhook.ps1
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$secret = (Get-Content "$root\scripts\.webhook-secret" -Raw).Trim()
$env:WEBHOOK_SECRET = $secret
$env:WEBHOOK_PORT = "9000"
# Set AUTO_RESTART=true to auto-restart servers on push (disruptive; default false)
$env:AUTO_RESTART = "true"
$node = "C:\Program Files\nodejs\node.exe"
Start-Process -FilePath $node -ArgumentList "scripts/webhook-server.js" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$env:TEMP\webhook.out.log" -RedirectStandardError "$env:TEMP\webhook.err.log"
Write-Host "Webhook server started on :9000 (secret loaded from scripts/.webhook-secret)"
Write-Host "Expose it with: cloudflared tunnel --url http://localhost:9000   OR   ngrok http 9000"