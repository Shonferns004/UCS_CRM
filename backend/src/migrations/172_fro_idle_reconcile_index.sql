-- Partial index to speed up FRO idle reconciliation sweep
-- Finds workers with expired disposition window but no idle stamp yet.
CREATE INDEX IF NOT EXISTS idx_fro_live_status_disposition_lapsed
ON fro_live_status (disposition_due_at)
WHERE disposition_due_at IS NOT NULL
  AND idle_since IS NULL;

-- Optional: index for settle window cases if we add them later (not needed now)
-- CREATE INDEX IF NOT EXISTS idx_fro_live_status_settle_expired
-- ON fro_live_status (settle_until)
-- WHERE settle_until IS NOT NULL
--   AND idle_since IS NULL
--   AND disposition_due_at IS NULL;
