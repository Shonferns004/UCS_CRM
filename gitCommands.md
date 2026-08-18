1. See what's changed (optional but good)
--  git status

2. Stage the changed files
--   git add "ucs crm/src/panels/accounts/pages/ReceiptHistory.jsx" "ucs crm/src/panels/accounts/pages/Receipts.jsx"
--   git add .

3. Commit them (this is the step you were missing)
--   git commit -m "your commit message here"

4. Push to upstream
--   git push upstream

5. Open/update the PR on the real repo
--   gh pr create --repo priyankshahdev-alt/UCS_CRM --base master --head fix/receipt-date-timezone --title "Your title" --body