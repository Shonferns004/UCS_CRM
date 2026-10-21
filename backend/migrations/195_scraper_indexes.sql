-- 195: the scraper dedup path's missing indexes.
--
-- When the device app (apps/scrapper) posts a batch to /device-import,
-- paymentScraperService.importScrapedBatch answers one question for the whole
-- upload: "which of these UPI refs are already in bank_audit_entries?" --
-- `WHERE payment_id IN (...)`. That column had NO index, so before the check
-- was batched each transaction was answered by its own `WHERE payment_id = $1`
-- query, each a full sequential scan of the table: a 100-row batch cost 100
-- scans while holding one of the pool's 5 connections. Even the batched form
-- needs this index to stay an index scan as the table grows. The same shape
-- serves the device's known-refs preload (GET /scraper/known-refs), which
-- every run waits on before it starts skipping rows on screen.
--
-- The indexes:
--
--   1. idx_bank_audit_entries_payment_id -- the dedup check itself
--      (`WHERE payment_id = $1`, run once per upload since the batched check
--      landed). Partial: only rows WITH a ref can ever match that predicate,
--      and most of the table's value is in those rows.
--   2. idx_bank_audit_entries_project_payment -- known-refs filters
--      `project_id = $1 AND payment_id IS NOT NULL` (scraperController.knownRefs).
--      The payment_id index cannot serve it (wrong leading column).
--   3. idx_bank_audit_entries_fingerprint -- the no-ref fallback
--      (entryExistsByFingerprint: project + date + amount + payer where
--      payment_id IS NULL). Tiny partial index over only the ref-less rows,
--      shaped exactly like the check.
--   4. idx_scraper_run_entries_run -- the run detail view reads a run's
--      entries by run_id newest-first; the logRunEntry inserts group by run.
--
-- NOT a UNIQUE index: placeholder refs are shared by design ('NA', '*Transfer',
-- '#####################' -- see froCollectionMatch.test.js) and the email
-- importer normalizes with upper(trim(...)), so a blanket unique constraint
-- would reject legitimate inserts in the webhook/email/FRO/bank-statement
-- paths. The check-before-insert stays in application code (batched, one IN()
-- query per import); a hard DB-level guarantee is a separate, later change
-- that needs duplicate cleanup first.
--
-- Applied on boot by backend/src/bootstrap/ensureScraperIndexes.js, which is
-- idempotent, because migrations are not auto-run in this deployment. Plain
-- CREATE INDEX (not CONCURRENTLY): a failed CONCURRENTLY leaves an invalid
-- index that IF NOT EXISTS would then skip forever, and these tables are small
-- enough to build in seconds on first boot.

-- 1. The "does this ref already exist?" check (one IN() per upload).
CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_payment_id
  ON public.bank_audit_entries (payment_id)
  WHERE payment_id IS NOT NULL;

-- 2. The device's known-refs preload: per-project ref list at run start.
CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_project_payment
  ON public.bank_audit_entries (project_id, payment_id)
  WHERE payment_id IS NOT NULL;

-- 3. The no-ref fallback: same amount + date + payer in the same project.
CREATE INDEX IF NOT EXISTS idx_bank_audit_entries_fingerprint
  ON public.bank_audit_entries (project_id, transaction_date, amount, payer_name)
  WHERE payment_id IS NULL;

-- 4. One run's scraped entries, newest first.
CREATE INDEX IF NOT EXISTS idx_scraper_run_entries_run
  ON public.scraper_run_entries (run_id, created_at DESC);
