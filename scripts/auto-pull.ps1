# UCS CRM - background auto-pull (safe: only pulls when working tree is clean)
# Schedule this via Windows Task Scheduler every 15-30 minutes.
# It NEVER overwrites uncommitted work; it skips if the tree is dirty.
$ErrorActionPreference = 'SilentlyContinue'
$root = "C:\Users\Administrator\Desktop\UCS_CRM"
Set-Location $root
$log = "$env:TEMP\ucs-autopull.log"

function Log($m) { "$((Get-Date).ToString('yyyy-MM-dd HH:mm:ss')) $m" | Add-Content $log }

$dirty = (git status --porcelain).Trim()
if ($dirty) { Log "skip: working tree dirty"; exit 0 }

# fetch first
git fetch origin master 2>&1 | Out-Null
$local  = (git rev-parse HEAD).Trim()
$remote = (git rev-parse origin/master).Trim()
if ($local -eq $remote) { Log "up-to-date"; exit 0 }

Log "new commits available: pulling..."
git pull --ff-only origin master 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) { Log "pull failed (exit $LASTEXITCODE)"; exit 1 }

# install deps if needed
if ((git diff --name-only HEAD@{1} HEAD) -contains 'backend/package.json') {
  Log "backend/package.json changed -> npm install"
  Set-Location "$root\backend"; npm install 2>&1 | Out-Null; Set-Location $root
}
if ((git diff --name-only HEAD@{1} HEAD) -contains 'client/package.json') {
  Log "client/package.json changed -> npm install"
  Set-Location "$root\client"; npm install 2>&1 | Out-Null; Set-Location $root
}

Log "pulled successfully (restart servers manually to apply)"
# NOTE: we do NOT auto-restart servers here, to avoid disrupting active work.
# Run scripts\sync.ps1 -NoRestart after reviewing, or restart manually.