# Runs detached so a tool timeout cannot kill it halfway again.
$env:FILTER_BRANCH_SQUELCH_WARNING = "1"
$log = "$env:TEMP\fb.log"
Remove-Item $log -ErrorAction SilentlyContinue
git filter-branch --force --index-filter "git rm --cached --ignore-unmatch -q scripts/aws/cred key/aws.txt key/ucs-backend.pem 'others/imp files/aws/.txt'" --prune-empty -- master *> $log
"exit=$LASTEXITCODE" | Out-File -Append $log