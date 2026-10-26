-- Snapshot target_station on collection logs so past collections stay attributed
-- to the FRO who collected them, even if the assignment is later reassigned.

ALTER TABLE fro_donor_logs
  ADD COLUMN IF NOT EXISTS target_station TEXT;

-- Backfill: use the assignment's current target_station (best effort).
UPDATE fro_donor_logs l
   SET target_station = a.target_station
  FROM fro_assignments a
 WHERE l.assignment_id = a.id
   AND l.target_station IS NULL
   AND a.target_station IS NOT NULL;
