-- Migration 044: Backfill batch_id/batch_type for legacy fro_assignments
-- Purpose: Existing rows have is_new flag but no batch_id/batch_type.
--          Tag them so batch-based tab filtering works immediately.

-- Tag new data (is_new = true or NULL) as 'new_data' with a legacy batch
UPDATE fro_assignments
SET batch_type = 'new_data',
    batch_id = 'legacy-new-' || station
WHERE batch_id IS NULL
  AND (is_new = true OR is_new IS NULL);

-- Tag old data (is_new = false) as 'old_data' with a legacy batch
UPDATE fro_assignments
SET batch_type = 'old_data',
    batch_id = 'legacy-old-' || station
WHERE batch_id IS NULL
  AND is_new = false;
