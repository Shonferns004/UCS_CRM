$ErrorActionPreference = 'Continue'
Set-Location C:\Users\Shiva\Desktop\UCS_CRM\backend
$log = "$env:TEMP\backend-tunnel.log"
Remove-Item $log -ErrorAction SilentlyContinue
& node scripts/tunnel-db.mjs backend *>> $log