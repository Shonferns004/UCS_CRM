param(
    [string]$Message = "deploy: update backend"
)

$ErrorActionPreference = "Stop"
$KEY = Join-Path $HOME ".ssh\ucs-backend.pem"
$HOST = "ec2-user@43.200.198.122"
$REMOTE_DIR = "/home/ec2-user/app"

if (!(Test-Path $KEY)) { Write-Error "SSH key not found: $KEY" }

$changes = git status --porcelain
if ($changes) {
    git add -A
    git commit -m $Message
}
git push origin master

$remoteCmd = "cd $REMOTE_DIR && git checkout -- backend && git pull && " +
    "if git diff HEAD@{1} --name-only | grep -qE 'backend/(package.json|package-lock.json)'; then cd backend && npm ci; else cd backend; fi && " +
    "pm2 restart backend --update-env"

ssh -i $KEY -o StrictHostKeyChecking=no $HOST $remoteCmd

Write-Host "`nDeploy complete. Live at https://43-200-198-122.sslip.io" -ForegroundColor Green
