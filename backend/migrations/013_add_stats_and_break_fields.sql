-- Add stats tracking fields to fro_live_status (idle, skip, break)
ALTER TABLE fro_live_status 
  ADD COLUMN IF NOT EXISTS today_skipped INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_idle_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS today_break_seconds INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS on_break BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS break_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS break_type TEXT;

-- Update status check constraint to allow 'break'
ALTER TABLE fro_live_status DROP CONSTRAINT IF EXISTS fro_live_status_status_check;
ALTER TABLE fro_live_status ADD CONSTRAINT fro_live_status_status_check 
  CHECK (status IN ('online', 'on_call', 'idle', 'offline', 'break'));
