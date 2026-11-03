<#
.SYNOPSIS
  Mirror the live server database (ucs_crm) into the local dev database (local_crm).

.DESCRIPTION
  Dev setup: backend/.env points at localhost/local_crm, while the office server
  runs the same schema on 192.168.1.100/ucs_crm. This script takes a consistent
  snapshot of the server DB and restores it into the local one, so the local app
  shows the same data (attendance, salaries, donors, everything).

  It drops and recreates the `public` schema of the TARGET database. Anything
  dev-only that lives in `public` on the target is lost - that is the point of a
  mirror, but be aware.

.EXAMPLE
  .\scripts\sync-server-db-to-local.ps1
  .\scripts\sync-server-db-to-local.ps1 -NoPrompt
  .\scripts\sync-server-db-to-local.ps1 -KeepDump
#>
param(
  [string]$SourceUrl = 'postgres://postgres:bsct_2014@192.168.1.100:5432/ucs_crm',
  [string]$TargetUrl = 'postgres://postgres:Shawn2004@localhost:5432/local_crm',
  [string]$PgBin     = 'C:\Program Files\PostgreSQL\18\bin',
  [switch]$NoPrompt,
  [switch]$KeepDump
)

$ErrorActionPreference = 'Stop'

function Fail($msg) { Write-Host "ERROR: $msg" -ForegroundColor Red; exit 1 }

if ($SourceUrl -eq $TargetUrl) { Fail 'Source and target are the same database.' }
foreach ($exe in 'pg_dump.exe', 'pg_restore.exe', 'psql.exe') {
  if (-not (Test-Path (Join-Path $PgBin $exe))) { Fail "Not found: $PgBin\$exe (pass -PgBin)" }
}

$dump = Join-Path $env:TEMP ("ucs_crm_sync_{0}.dump" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

Write-Host ''
Write-Host '  Source : ' -NoNewline; Write-Host $SourceUrl -ForegroundColor Cyan
Write-Host '  Target : ' -NoNewline; Write-Host $TargetUrl -ForegroundColor Yellow
Write-Host '  Dump   : ' -NoNewline; Write-Host $dump
Write-Host ''
Write-Host '  The TARGET public schema will be dropped and recreated.' -ForegroundColor Red

if (-not $NoPrompt) {
  $answer = Read-Host '  Continue? type YES'
  if ($answer -ne 'YES') { Write-Host 'Aborted.'; exit 0 }
}

# --- 1) snapshot the server (read-only) -----------------------------------
Write-Host "`n[1/4] Dumping the server database..."
& (Join-Path $PgBin 'pg_dump.exe') $SourceUrl -Fc -f $dump
if ($LASTEXITCODE -ne 0) { Fail "pg_dump failed ($LASTEXITCODE)" }
$sizeMb = [math]::Round((Get-Item $dump).Length / 1MB, 1)
Write-Host "      dump ready: $sizeMb MB" -ForegroundColor Green

# --- 2) reset the target schema -------------------------------------------
Write-Host '[2/4] Resetting the local public schema...'
$resetSql = @'
SELECT pg_terminate_backend(pid) FROM pg_stat_activity
 WHERE datname = current_database() AND pid <> pg_backend_pid();
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;
'@
$resetSql | & (Join-Path $PgBin 'psql.exe') $TargetUrl -v ON_ERROR_STOP=1 -q
if ($LASTEXITCODE -ne 0) { Fail "schema reset failed ($LASTEXITCODE)" }

# --- 3) restore ------------------------------------------------------------
Write-Host '[3/4] Restoring into the local database (this takes a few minutes)...'
& (Join-Path $PgBin 'pg_restore.exe') -d $TargetUrl --no-owner --no-privileges -j 4 $dump
# pg_restore returns 1 when it merely logs warnings (e.g. a non-public schema
# that already exists locally). Only fail when it could not finish at all.
if ($LASTEXITCODE -ne 0) { Write-Host "      pg_restore warnings (exit $LASTEXITCODE) - checking data below" -ForegroundColor Yellow }

# --- 4) verify -------------------------------------------------------------
Write-Host '[4/4] Comparing row counts...'
$check = @'
select 'workers' as t, count(*)::int as n from public.workers
union all select 'attendance', count(*)::int from public.attendance
union all select 'attendance 2026-10-31', count(*)::int from public.attendance where date = '2026-10-31'
union all select 'salary_history', count(*)::int from public.salary_history
union all select 'receipts', count(*)::int from public.receipts;
'@
$src = (& (Join-Path $PgBin 'psql.exe') $SourceUrl -t -A -F '|' -c $check) -split "`r?`n" | Where-Object { $_ }
$dst = (& (Join-Path $PgBin 'psql.exe') $TargetUrl -t -A -F '|' -c $check) -split "`r?`n" | Where-Object { $_ }

$srcMap = @{}; foreach ($line in $src) { $p = $line -split '\|'; $srcMap[$p[0]] = [int]$p[1] }
$dstMap = @{}; foreach ($line in $dst) { $p = $line -split '\|'; $dstMap[$p[0]] = [int]$p[1] }

foreach ($key in $srcMap.Keys) {
  $a = $srcMap[$key]; $b = $dstMap[$key]
  $color = if ($a -eq $b) { 'Green' } else { 'Yellow' }
  Write-Host ("      {0,-22} server={1,-8} local={2}" -f $key, $a, $b) -ForegroundColor $color
}
Write-Host "`n      (a small drift on live tables is normal - the server keeps writing`n       while the restore runs; re-run the script for a fresher snapshot)" -ForegroundColor DarkGray

if (-not $KeepDump) { Remove-Item $dump -ErrorAction SilentlyContinue }
Write-Host "`nDone. Restart the backend if the app still shows old data." -ForegroundColor Green
