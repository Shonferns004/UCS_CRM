-- Migration 043: Add batch tracking to fro_assignments and fro_live_status
-- Purpose: Each distribution/upload gets a batch_id + batch_type so the FRO's
--          "New Data" / "Old Data" tabs show only the latest batch, not the
--          entire station.

-- 1. fro_assignments: batch tracking columns
ALTER TABLE fro_assignments ADD COLUMN IF NOT EXISTS batch_id TEXT;
ALTER TABLE fro_assignments ADD COLUMN IF NOT EXISTS batch_type TEXT;

-- Index for fast batch lookups per station
CREATE INDEX IF NOT EXISTS idx_fro_assignments_batch ON fro_assignments (batch_type, batch_id, station)
  WHERE batch_id IS NOT NULL;

-- 2. fro_live_status: persist tab + batch across logins
ALTER TABLE fro_live_status ADD COLUMN IF NOT EXISTS data_tab TEXT DEFAULT 'new';
ALTER TABLE fro_live_status ADD COLUMN IF NOT EXISTS current_batch_id TEXT;
  