-- Performance indexes for NGO admin dashboard queries
-- Run this manually via Supabase SQL editor
-- Note: Remove -- from each CREATE INDEX line to run them individually
-- (Supabase SQL Editor wraps in a transaction which blocks CONCURRENTLY)

CREATE INDEX IF NOT EXISTS idx_fa_ngo_id_status
  ON fro_assignments(ngo_id, status);

CREATE INDEX IF NOT EXISTS idx_fa_ngo_id_station
  ON fro_assignments(ngo_id, station)
  WHERE station IS NOT NULL AND status <> 'reassigned';

CREATE INDEX IF NOT EXISTS idx_fa_ngo_id_assigned_at
  ON fro_assignments(ngo_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_fa_ngo_id_fro_worker
  ON fro_assignments(ngo_id, fro_worker_id);

CREATE INDEX IF NOT EXISTS idx_dp_mobile_number
  ON donor_profiles(mobile_number);

CREATE INDEX IF NOT EXISTS idx_nd_ngo_mobile
  ON new_data(ngo, mobile_number)
  WHERE mobile_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fdl_action_created
  ON fro_donor_logs(action, created_at);

CREATE INDEX IF NOT EXISTS idx_fdl_lead_done_status
  ON fro_donor_logs(disposition_detail, accounts_status, created_at)
  WHERE action = 'disposition';

CREATE INDEX IF NOT EXISTS idx_fdl_verified_at
  ON fro_donor_logs(verified_at)
  WHERE accounts_status = 'verified';

CREATE INDEX IF NOT EXISTS idx_fdl_assignment_id
  ON fro_donor_logs(assignment_id);
