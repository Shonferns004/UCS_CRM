-- ============================================================================
-- FIX ASHRAY (aflf) RECEIPT NUMBERS + NGO LABELS
--
-- Confirmed facts:
--   * Ashray's REAL last receipt number is 19044 (next = 19045).
--   * Being Sevak (bsct) last = 82307 (next = 82308)  -- correct, DO NOT touch.
--   * Some Being-Sevak receipts (in the 82299..82308 book) got mis-tagged as
--     project_id='aflf' (e.g. Chintan Anand 82305), so they display "Ashray"
--     and inflated the Ashray counter to ~8230x.
--
-- This script:
--   PART 1 (diagnostic, READ ONLY) — shows you every 'aflf' receipt by number
--          so you can confirm which low ones are really Being Sevak money.
--   PART 2 (correction) — reclassifies the confirmed Being-Sevak 'aflf'
--          receipts back to 'bsct', and resets Ashray's counter to its real
--          last number (19044).
--
-- Run on the EC2:
--   psql "$DATABASE_URL" -f fix_ashray_receipt_numbers.sql
-- ============================================================================

-- ============================================================================
-- PART 1 — DIAGNOSTIC (READ ONLY). Run first, review, THEN run PART 2.
-- ============================================================================

-- All 'aflf' (Ashray) receipts, highest first. Low numbers (the 8229x-8231x
-- range) are the Being-Sevak receipts wrongly tagged as Ashray -> reclassify to 'bsct'.
-- Real Ashray receipts will be in the higher 19xxx range -> KEEP as 'aflf'.
SELECT r.id, r.donor_name, r.receipt_no, r.receipt_date,
       r.project_id AS receipt_project,
       b.project_id AS entry_project,
       d.project_supported AS donor_project
FROM receipts r
LEFT JOIN bank_audit_entries b ON b.receipt_id = r.id
LEFT JOIN donor_profiles d ON d.id = r.donor_id
WHERE r.project_id = 'aflf'
  AND r.receipt_no IS NOT NULL
ORDER BY r.receipt_no DESC;

-- Sanity: the duplicate check AFTER reclassification would be:
-- SELECT project_id, receipt_no, count(*) FROM receipts
-- WHERE receipt_no ~ '^[0-9]+$' GROUP BY project_id, receipt_no HAVING count(*) > 1;

-- ============================================================================
-- PART 2 — CORRECTION. Uncomment the line below AFTER reviewing PART 1.
-- ============================================================================

BEGIN;

-- Step A: Move Being-Sevak receipts (currently mis-tagged as 'aflf') back to
-- 'bsct'. We only reclassify 'aflf' receipts whose number does NOT already
-- exist in the Being Sevak book (avoids violating UNIQUE(project_id, receipt_no)).
-- Adjust the receipt_no threshold to match your review of PART 1.
-- NOTE: The 82299..82308 run is Being Sevak's book. Receipts in this range that
-- are tagged 'aflf' are Being-Sevak money mislabeled as Ashray.
WITH to_fix AS (
  SELECT r.id AS receipt_id, r.receipt_no, r.project_id
  FROM receipts r
  WHERE r.project_id = 'aflf'
    AND r.receipt_no ~ '^[0-9]+$'
    AND r.receipt_no::bigint < 82400                 -- Being Sevak book range
    AND NOT EXISTS (
      SELECT 1 FROM receipts bs
      WHERE bs.project_id = 'bsct' AND bs.receipt_no = r.receipt_no
    )
)
UPDATE receipts r
SET project_id = 'bsct', updated_at = NOW()
FROM to_fix f
WHERE r.id = f.receipt_id;

-- Also align the matching bank_audit_entries.project_id where it was 'aflf'
-- but the linked receipt was just moved to 'bsct' (only when the entry wasn't
-- definitively Ashray). If you want to be conservative, skip this UPDATE.
UPDATE bank_audit_entries b
SET project_id = 'bsct', updated_at = NOW()
WHERE b.receipt_id IN (
  SELECT id FROM receipts WHERE project_id = 'bsct'
    AND receipt_no ~ '^[0-9]+$' AND receipt_no::bigint < 82400
)
  AND b.project_id = 'aflf';

-- Step B: Reset Ashray's receipt counter to its REAL last number (19044),
-- so the next Ashray receipt is 19045. (Mirrors cleanup_star.mjs reset approach.)
UPDATE receipt_no_counters SET last_no = 19044 WHERE project_id = 'aflf';
INSERT INTO receipt_no_counters (project_id, last_no)
SELECT 'aflf', 19044 WHERE NOT EXISTS (SELECT 1 FROM receipt_no_counters WHERE project_id = 'aflf');

-- Step C: Verify no duplicate (project_id, receipt_no) was created.
SELECT project_id, receipt_no, count(*)
FROM receipts
WHERE receipt_no ~ '^[0-9]+$'
GROUP BY project_id, receipt_no
HAVING count(*) > 1;

-- Check the new counter states:
SELECT project_id, last_no, last_no + 1 AS next_no
FROM receipt_no_counters
WHERE project_id IN ('bsct','aflf','mann')
ORDER BY project_id;

COMMIT;
