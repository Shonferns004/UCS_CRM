-- 199_fro_lead_alerts.sql
-- Durable "new lead" alerts behind the FRO topbar bell.
--
-- One row is written when a lead is auto-placed on a station that already has
-- an owner. It stays open until the FRO opens the lead (seen_at) and logs a
-- disposition (attended_at). notification_log is retired, so this table is the
-- store the badge reads after a refresh or a dropped socket.
CREATE TABLE IF NOT EXISTS fro_lead_alerts (
  id            BIGSERIAL PRIMARY KEY,
  worker_id     UUID NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  assignment_id INTEGER NOT NULL,
  lead_id       UUID,
  ngo_id        UUID,
  station       TEXT,
  source        TEXT,
  score         INTEGER,
  label         TEXT,
  title         TEXT NOT NULL,
  body          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  seen_at       TIMESTAMPTZ,
  attended_at   TIMESTAMPTZ
);

-- Re-ingesting the same lead (webhook + poller) must not ring the bell twice.
CREATE UNIQUE INDEX IF NOT EXISTS fro_lead_alerts_worker_assignment_uidx
  ON fro_lead_alerts (worker_id, assignment_id);

-- The badge query: open alerts for one worker, newest first.
CREATE INDEX IF NOT EXISTS fro_lead_alerts_open_idx
  ON fro_lead_alerts (worker_id, created_at DESC)
  WHERE attended_at IS NULL;
